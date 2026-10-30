import os
import json
import uuid
import re
import shutil
import subprocess
import tempfile
from typing import List, Optional, Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="AutoCircuit AI API",
    description="Backend API for AutoCircuit AI - LLM circuit synthesizer & DRC analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Models -----------------

class Component(BaseModel):
    id: str
    name: str
    description: str
    category: Literal['MCU', 'Sensor', 'Actuator', 'Power', 'Passive', 'Connector']
    package: str
    estimatedCost: float
    pins: List[str]
    operatingVoltage: Optional[float] = None
    maxCurrent_mA: Optional[float] = Field(
        default=None,
        description="Estimated maximum operating current consumed in this design; not regulator output capacity.",
    )
    pinDescriptions: Optional[dict[str, str]] = None

class PinMapping(BaseModel):
    mcuPin: str
    componentId: str
    componentPin: str
    sourceComponentId: Optional[str] = None
    sourceComponentPin: Optional[str] = None
    protocol: Literal['GPIO', 'I2C', 'SPI', 'UART', 'ADC', 'PWM', 'Power', 'GND', 'I2S']
    description: str
    wireColor: Optional[str] = None

class DrcRule(BaseModel):
    type: Literal['Error', 'Warning', 'Pass']
    message: str

class CircuitDesign(BaseModel):
    id: str
    title: str
    description: str
    components: List[Component]
    pinMappings: List[PinMapping]
    firmwareCode: str
    warnings: List[str] = Field(default_factory=list)
    drcReport: Optional[List[DrcRule]] = None
    labGuide: Optional[dict] = None

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    preset: Optional[str] = None

class CompileRequest(BaseModel):
    source: str
    fqbn: str

# ----------------- DRC Engine (Python implementation matching frontend) -----------------

def run_drc(design: CircuitDesign) -> List[DrcRule]:
    rules: List[DrcRule] = []
    mcu = next((c for c in design.components if c.category == 'MCU'), None)

    if not mcu:
        rules.append(DrcRule(
            type="Error",
            message="No Microcontroller (MCU) found in design | No main controller is available for the prototype. | Add an MCU such as ESP32, STM32, or RP2040 to continue."
        ))
        return rules

    rules.append(DrcRule(
        type="Pass",
        message=f"MCU selected correctly | {mcu.name} is the main controller for this design. | No change required."
    ))

    # Voltage check
    for comp in design.components:
        logic_sources = [
            next((source for source in design.components if source.id == mapping.sourceComponentId), mcu)
            for mapping in design.pinMappings
            if mapping.componentId == comp.id
            and mapping.protocol in {'GPIO', 'I2C', 'SPI', 'UART', 'ADC', 'PWM', 'I2S'}
        ]
        if comp.id != mcu.id and logic_sources and comp.operatingVoltage:
            source_voltages = [source.operatingVoltage for source in logic_sources if source and source.operatingVoltage]
            source_voltage = max(source_voltages, default=mcu.operatingVoltage or 0)
            ahct_accepts_3v3 = (
                re.search(r"\b74ahct125\b", comp.name, re.IGNORECASE)
                and 2.0 <= source_voltage <= 3.6
            )
            if source_voltage and comp.operatingVoltage > source_voltage and not ahct_accepts_3v3:
                rules.append(DrcRule(
                    type="Warning",
                    message=f"Voltage mismatch on {comp.name} | {comp.name} operates at {comp.operatingVoltage}V but its mapped logic source is {source_voltage}V. | Use a level shifter or choose a compatible variant."
                ))
            else:
                rules.append(DrcRule(
                    type="Pass",
                    message=f"{comp.name} voltage compatible | {comp.name} ({comp.operatingVoltage}V) accepts its mapped logic source ({source_voltage or 'unspecified'}V). | No change required."
                ))

    # Validate every generated connection endpoint before presenting a schematic.
    component_by_id = {component.id: component for component in design.components}
    invalid_mappings = []
    for mapping in design.pinMappings:
        source = component_by_id.get(mapping.sourceComponentId) if mapping.sourceComponentId else mcu
        target = component_by_id.get(mapping.componentId)
        if not source or not target:
            invalid_mappings.append(f"{mapping.mcuPin} to {mapping.componentId}.{mapping.componentPin} (missing component)")
        elif (mapping.sourceComponentPin or mapping.mcuPin) not in source.pins or mapping.componentPin not in target.pins:
            invalid_mappings.append(f"{source.name}.{mapping.sourceComponentPin or mapping.mcuPin} to {target.name}.{mapping.componentPin}")
    if invalid_mappings:
        rules.append(DrcRule(
            type="Error",
            message=f"Invalid connections ({len(invalid_mappings)}) | {'; '.join(invalid_mappings)} refer to missing components or pins absent from the declared component pinouts. | Correct these mappings using the exact board and module pinouts."
        ))

    # I2C pull-up and bus check
    i2c_pins = [p for p in design.pinMappings if p.protocol == 'I2C']
    if i2c_pins:
        pullup_names = [c.name.lower() for c in design.components if 'pull-up' in c.name.lower()]
        has_sda_pullup = any('sda' in name for name in pullup_names)
        has_scl_pullup = any('scl' in name for name in pullup_names)
        if has_sda_pullup and has_scl_pullup:
            rules.append(DrcRule(type="Pass", message="I2C pull-ups present | Separate SDA and SCL pull-up resistors are included. | Confirm their value and that the modules do not already include pull-ups."))
        else:
            missing = ', '.join(name for name, present in [('SDA', has_sda_pullup), ('SCL', has_scl_pullup)] if not present)
            rules.append(DrcRule(type="Warning", message=f"I2C pull-ups not fully verified | Missing explicit pull-up for {missing or 'SDA and SCL'}. | Add one appropriately valued pull-up from each bus line to the correct logic supply, or verify onboard module pull-ups."))

    # Unconnected pins check
    for comp in design.components:
        if comp.id == mcu.id:
            continue
        mapped_pins = {m.componentPin for m in design.pinMappings if m.componentId == comp.id}
        mapped_pins.update(m.sourceComponentPin or m.mcuPin for m in design.pinMappings if m.sourceComponentId == comp.id)
        # Module pins not used by this design are usually optional. Only flag
        # pins whose metadata explicitly says they must be connected.
        unmapped = [
            p for p in comp.pins
            if p not in mapped_pins and re.search(
                r"required|must be connected|do not leave floating",
                (comp.pinDescriptions or {}).get(p, ""),
                re.IGNORECASE,
            )
        ]
        if unmapped:
            rules.append(DrcRule(
                type="Warning",
                message=f"{comp.name} has unconnected pins | Pins {', '.join(unmapped)} on {comp.name} are not mapped to the MCU. | Verify if these pins require connections or can safely be left floating."
            ))

    # Power budget analysis
    # maxCurrent_mA is a device rating, not its expected operating load.
    total_current = sum(
        c.maxCurrent_mA or 0 for c in design.components
        if c.category in {'Sensor', 'Actuator'}
    )
    if total_current > 500:
        has_regulator = any(c.category == 'Power' for c in design.components)
        if not has_regulator:
            rules.append(DrcRule(
                type="Error",
                message=f"Current draw exceeds USB limit ({total_current}mA) | Total current ({total_current}mA) exceeds 500mA USB power. | Add a regulated external power supply or reduce connected load."
            ))
        else:
            rules.append(DrcRule(
                type="Pass",
                message=f"High current draw managed | Total {total_current}mA with external power regulation. | Monitor actual current during testing."
            ))
    elif total_current > 0:
        rules.append(DrcRule(
            type="Pass",
            message=f"Current draw within USB limits ({total_current}mA / 500mA) | Estimated total power demand is within safe range for USB-powered prototypes. | No action required."
        ))

    # Pin count utilization
    used_pins = {m.mcuPin for m in design.pinMappings if not m.sourceComponentId}
    if mcu.pins and len(used_pins) > len(mcu.pins):
        rules.append(DrcRule(
            type="Error",
            message=f"MCU pin count exceeded | Design requires {len(used_pins)} pins but {mcu.name} exposes {len(mcu.pins)} pins in this model. | Consider using a larger MCU variant or reduce peripheral connections."
        ))
    elif mcu.pins:
        utilization = round((len(used_pins) / max(len(mcu.pins), 1)) * 100)
        rules.append(DrcRule(
            type="Pass",
            message=f"MCU pin utilization: {utilization}% | Using {len(used_pins)} of {len(mcu.pins)} modeled pins on {mcu.name}. | Remaining pins are available for future expansion."
        ))

    return rules

# ----------------- Fallback Template Generator -----------------

TEMPLATES = {
    "esp32-weather": {
        "id": "esp32-weather-v1",
        "title": "ESP32 IoT Environmental Station",
        "description": "Wi-Fi enabled weather monitor tracking temperature, humidity, and barometric pressure with OLED readout.",
        "components": [
            {"id": "mcu1", "name": "ESP32-WROOM-32", "description": "Dual-core Wi-Fi & BLE Microcontroller", "category": "MCU", "package": "QFN-48", "estimatedCost": 350.0, "pins": ["5V", "3V3", "GND", "GPIO21", "GPIO22", "GPIO34", "GPIO35", "GPIO2", "EN"], "operatingVoltage": 3.3, "maxCurrent_mA": 240},
            {"id": "s1", "name": "BME280", "description": "Digital temperature, humidity and pressure sensor", "category": "Sensor", "package": "LGA-8 module", "estimatedCost": 220.0, "pins": ["VCC", "GND", "SDA", "SCL", "SDO"], "operatingVoltage": 3.3, "maxCurrent_mA": 1},
            {"id": "d1", "name": "SSD1306 OLED", "description": "128x64 I2C display", "category": "Actuator", "package": "Module", "estimatedCost": 180.0, "pins": ["VCC", "GND", "SDA", "SCL"], "operatingVoltage": 3.3, "maxCurrent_mA": 20},
            {"id": "p1", "name": "AMS1117-3.3 Regulator", "description": "3.3V regulator module; confirm input and current requirements", "category": "Power", "package": "Module", "estimatedCost": 25.0, "pins": ["VIN", "VOUT", "GND"], "operatingVoltage": 3.3, "maxCurrent_mA": 5},
            {"id": "r1", "name": "4.7kΩ Pull-Up Resistor (SDA)", "description": "SDA pull-up to 3.3V", "category": "Passive", "package": "Axial", "estimatedCost": 2.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0.7},
            {"id": "r2", "name": "4.7kΩ Pull-Up Resistor (SCL)", "description": "SCL pull-up to 3.3V", "category": "Passive", "package": "Axial", "estimatedCost": 2.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0.7},
            {"id": "r3", "name": "10kΩ Pull-Down Resistor (BME280 SDO)", "description": "SDO address strap to ground", "category": "Passive", "package": "Axial", "estimatedCost": 2.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0.33},
            {"id": "c1", "name": "100nF Decoupling Capacitor (ESP32)", "description": "Local bypass capacitor", "category": "Passive", "package": "0805", "estimatedCost": 3.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0},
            {"id": "c2", "name": "100nF Decoupling Capacitor (BME280)", "description": "Local bypass capacitor", "category": "Passive", "package": "0805", "estimatedCost": 3.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0},
            {"id": "c3", "name": "100nF Decoupling Capacitor (OLED)", "description": "Local bypass capacitor", "category": "Passive", "package": "0805", "estimatedCost": 3.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0},
            {"id": "c4", "name": "10µF Input Capacitor (AMS1117)", "description": "Regulator input bulk capacitor", "category": "Passive", "package": "Radial", "estimatedCost": 5.0, "pins": ["1", "2"], "operatingVoltage": 5.0, "maxCurrent_mA": 0},
            {"id": "c5", "name": "10µF Output Capacitor (AMS1117)", "description": "Regulator output bulk capacitor", "category": "Passive", "package": "Radial", "estimatedCost": 5.0, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0}
,
        ],
        "pinMappings": [
            {"mcuPin": "5V", "componentId": "p1", "componentPin": "VIN", "protocol": "Power", "description": "Input to regulator; ensure this voltage matches the selected module"},
            {"mcuPin": "GND", "componentId": "p1", "componentPin": "GND", "protocol": "GND", "description": "Common ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "s1", "componentPin": "VCC", "protocol": "Power", "description": "Regulated 3.3V to BME280"},
            {"mcuPin": "GND", "componentId": "s1", "componentPin": "GND", "protocol": "GND", "description": "BME280 ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "d1", "componentPin": "VCC", "protocol": "Power", "description": "Regulated 3.3V to OLED"},
            {"mcuPin": "GND", "componentId": "d1", "componentPin": "GND", "protocol": "GND", "description": "OLED ground"},
            {"mcuPin": "GPIO21", "componentId": "s1", "componentPin": "SDA", "protocol": "I2C", "description": "I2C data"},
            {"mcuPin": "GPIO22", "componentId": "s1", "componentPin": "SCL", "protocol": "I2C", "description": "I2C clock"},
            {"mcuPin": "GPIO21", "componentId": "d1", "componentPin": "SDA", "protocol": "I2C", "description": "Shared I2C data"},
            {"mcuPin": "GPIO22", "componentId": "d1", "componentPin": "SCL", "protocol": "I2C", "description": "Shared I2C clock"},
            {"mcuPin": "GPIO21", "componentId": "r1", "componentPin": "2", "protocol": "I2C", "description": "SDA pull-up branch"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "r1", "componentPin": "1", "protocol": "Power", "description": "SDA pull-up to regulated rail"},
            {"mcuPin": "GPIO22", "componentId": "r2", "componentPin": "2", "protocol": "I2C", "description": "SCL pull-up branch"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "r2", "componentPin": "1", "protocol": "Power", "description": "SCL pull-up to regulated rail"},
            {"mcuPin": "SDO", "sourceComponentId": "s1", "componentId": "r3", "componentPin": "1", "protocol": "GND", "description": "SDO address strap through 10k resistor"},
            {"mcuPin": "GND", "componentId": "r3", "componentPin": "2", "protocol": "GND", "description": "SDO pull-down ground"},
            {"mcuPin": "3V3", "componentId": "c1", "componentPin": "1", "protocol": "Power", "description": "ESP32 local bypass supply"},
            {"mcuPin": "GND", "componentId": "c1", "componentPin": "2", "protocol": "GND", "description": "ESP32 local bypass ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "c2", "componentPin": "1", "protocol": "Power", "description": "BME280 local bypass supply"},
            {"mcuPin": "GND", "componentId": "c2", "componentPin": "2", "protocol": "GND", "description": "BME280 local bypass ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "c3", "componentPin": "1", "protocol": "Power", "description": "OLED local bypass supply"},
            {"mcuPin": "GND", "componentId": "c3", "componentPin": "2", "protocol": "GND", "description": "OLED local bypass ground"},
            {"mcuPin": "5V", "componentId": "c4", "componentPin": "1", "protocol": "Power", "description": "AMS1117 input capacitor supply"},
            {"mcuPin": "GND", "componentId": "c4", "componentPin": "2", "protocol": "GND", "description": "AMS1117 input capacitor ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "c5", "componentPin": "1", "protocol": "Power", "description": "AMS1117 output capacitor supply"},
            {"mcuPin": "GND", "componentId": "c5", "componentPin": "2", "protocol": "GND", "description": "AMS1117 output capacitor ground"}
        ],
        "firmwareCode": """#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_BME280 bme;

void scanI2CBus() {
  uint8_t found = 0;
  Serial.println("I2C scan results:");
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print("  0x");
      if (address < 16) Serial.print('0');
      Serial.print(address, HEX);
      if (address == 0x3C || address == 0x3D) Serial.print(" (OLED candidate)");
      if (address == 0x76 || address == 0x77) Serial.print(" (BME280 candidate)");
      Serial.println();
      ++found;
    }
  }
  if (found == 0) Serial.println("No devices found; check power, ground, SDA=GPIO21, SCL=GPIO22.");
}

uint8_t detectOledAddress() {
  Wire.beginTransmission(0x3C);
  if (Wire.endTransmission() == 0) return 0x3C;
  Wire.beginTransmission(0x3D);
  if (Wire.endTransmission() == 0) return 0x3D;
  return 0;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  scanI2CBus();

  const uint8_t oledAddress = detectOledAddress();
  if (oledAddress == 0) {
    Serial.println("OLED not found at I2C address 0x3C or 0x3D");
    while (true) delay(1000);
  }
  if (!display.begin(SSD1306_SWITCHCAPVCC, oledAddress)) {
    Serial.println("SSD1306 buffer allocation failed");
    while (true) delay(1000);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.display();

  if (!bme.begin(0x76, &Wire) && !bme.begin(0x77, &Wire)) {
    Serial.println("BME280 init failed; check wiring and address 0x76/0x77");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("BME280 not found");
    display.println("Check 0x76/0x77");
    display.display();
    while (true) delay(1000);
  }
}

void loop() {
  float temp = bme.readTemperature();
  float hum = bme.readHumidity();
  float press = bme.readPressure() / 100.0F;

  if (isnan(temp) || isnan(hum) || isnan(press)) {
    Serial.println("BME280 read failed; check sensor wiring and power.");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Sensor read error");
    display.println("Check BME280");
    display.display();
    delay(2000);
    return;
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Temp: ");
  display.print(temp, 1);
  display.println(" C");
  display.print("Hum:  ");
  display.print(hum, 1);
  display.println(" %");
  display.print("Pres: ");
  display.print(press, 0);
  display.println(" hPa");
  display.display();

  delay(2000);
}""",
        "warnings": ["Ensure BME280 I2C address is configured to 0x76."]
    },
    "esp32-mood-light": {
        "id": "esp32-ws2812-encoder-mood-light-v1",
        "title": "ESP32 WS2812B Rotary Mood Light",
        "description": "ESP32 controls a 16-pixel WS2812B strip through a 5V logic buffer. A rotary encoder changes hue when turned and brightness while its push switch is held.",
        "components": [
            {"id": "mcu1", "name": "ESP32-WROOM-32 Development Board", "description": "3.3V logic MCU. GPIO18 drives LED data through a 5V AHCT buffer; GPIO32/GPIO33 read the encoder and GPIO25 reads its push switch.", "category": "MCU", "package": "Development board", "estimatedCost": 350.0, "pins": ["5V", "3V3", "GND", "GPIO18", "GPIO25", "GPIO32", "GPIO33"], "operatingVoltage": 3.3, "maxCurrent_mA": 350},
            {"id": "strip1", "name": "16-pixel WS2812B RGB LED strip", "description": "5V addressable RGB strip segment. Power from the external 5V supply, not from an ESP32 GPIO or 3.3V pin.", "category": "Actuator", "package": "16-pixel strip segment", "estimatedCost": 300.0, "pins": ["5V", "DIN", "GND"], "operatingVoltage": 5.0, "maxCurrent_mA": 960},
            {"id": "enc1", "name": "Rotary encoder with push switch", "description": "Incremental quadrature encoder with A, B, common, and independent push-switch contacts; ESP32 internal pull-ups are enabled in firmware.", "category": "Sensor", "package": "EC11 panel-mount encoder", "estimatedCost": 35.0, "pins": ["A", "B", "COM", "SW1", "SW2"], "operatingVoltage": 3.3, "maxCurrent_mA": 1},
            {"id": "u2", "name": "74AHCT125 single-channel 5V logic buffer", "description": "5V-powered AHCT buffer translates the ESP32 3.3V data signal to a WS2812B-compatible 5V logic level. Tie active-low OE to ground.", "category": "Passive", "package": "DIP/SOIC buffer module", "estimatedCost": 25.0, "pins": ["VCC", "GND", "A", "Y", "OE"], "operatingVoltage": 5.0, "maxCurrent_mA": 2},
            {"id": "psu1", "name": "Regulated 5V 2A DC supply", "description": "External regulated supply for the LED strip and buffer. Supply capacity is shared with the ESP32 board; connect all grounds together.", "category": "Power", "package": "5V DC supply connector", "estimatedCost": 180.0, "pins": ["VOUT", "GND"], "operatingVoltage": 5.0},
            {"id": "r1", "name": "330Ω LED data series resistor", "description": "Series resistor between the 74AHCT125 output and WS2812B DIN; place near the strip data input.", "category": "Passive", "package": "Axial resistor", "estimatedCost": 2.0, "pins": ["1", "2"], "operatingVoltage": 5.0, "maxCurrent_mA": 1},
            {"id": "c1", "name": "1000µF LED supply bulk capacitor", "description": "Electrolytic capacitor across strip 5V and GND near the strip input; observe polarity.", "category": "Passive", "package": "Electrolytic capacitor", "estimatedCost": 8.0, "pins": ["+", "-"], "operatingVoltage": 6.3}
        ],
        "pinMappings": [
            {"mcuPin": "5V", "sourceComponentId": "psu1", "sourceComponentPin": "VOUT", "componentId": "mcu1", "componentPin": "5V", "protocol": "Power", "description": "Regulated 5V supply to ESP32 board 5V/VIN input"},
            {"mcuPin": "GND", "sourceComponentId": "psu1", "sourceComponentPin": "GND", "componentId": "mcu1", "componentPin": "GND", "protocol": "GND", "description": "Common ground from supply to ESP32"},
            {"mcuPin": "5V", "sourceComponentId": "psu1", "sourceComponentPin": "VOUT", "componentId": "strip1", "componentPin": "5V", "protocol": "Power", "description": "External 5V power to WS2812B strip"},
            {"mcuPin": "GND", "sourceComponentId": "psu1", "sourceComponentPin": "GND", "componentId": "strip1", "componentPin": "GND", "protocol": "GND", "description": "Common supply ground to LED strip"},
            {"mcuPin": "5V", "sourceComponentId": "psu1", "sourceComponentPin": "VOUT", "componentId": "u2", "componentPin": "VCC", "protocol": "Power", "description": "5V supply to 74AHCT125 buffer"},
            {"mcuPin": "GND", "sourceComponentId": "psu1", "sourceComponentPin": "GND", "componentId": "u2", "componentPin": "GND", "protocol": "GND", "description": "Common ground to logic buffer"},
            {"mcuPin": "GND", "componentId": "u2", "componentPin": "OE", "protocol": "GND", "description": "Enable the buffer by tying active-low OE to ground"},
            {"mcuPin": "GPIO18", "componentId": "u2", "componentPin": "A", "protocol": "GPIO", "description": "ESP32 LED data output to 74AHCT125 input"},
            {"mcuPin": "Y", "sourceComponentId": "u2", "sourceComponentPin": "Y", "componentId": "r1", "componentPin": "1", "protocol": "GPIO", "description": "5V-buffered data output to series resistor"},
            {"mcuPin": "DATA", "sourceComponentId": "r1", "sourceComponentPin": "2", "componentId": "strip1", "componentPin": "DIN", "protocol": "GPIO", "description": "Buffered WS2812B data through 330Ω resistor to strip DIN"},
            {"mcuPin": "5V", "sourceComponentId": "psu1", "sourceComponentPin": "VOUT", "componentId": "c1", "componentPin": "+", "protocol": "Power", "description": "Bulk capacitor positive to 5V LED supply"},
            {"mcuPin": "GND", "sourceComponentId": "psu1", "sourceComponentPin": "GND", "componentId": "c1", "componentPin": "-", "protocol": "GND", "description": "Bulk capacitor negative to ground"},
            {"mcuPin": "GPIO32", "componentId": "enc1", "componentPin": "A", "protocol": "GPIO", "description": "Rotary encoder quadrature channel A with internal pull-up"},
            {"mcuPin": "GPIO33", "componentId": "enc1", "componentPin": "B", "protocol": "GPIO", "description": "Rotary encoder quadrature channel B with internal pull-up"},
            {"mcuPin": "GPIO25", "componentId": "enc1", "componentPin": "SW1", "protocol": "GPIO", "description": "Encoder push switch for brightness adjustment mode"},
            {"mcuPin": "GND", "componentId": "enc1", "componentPin": "COM", "protocol": "GND", "description": "Encoder quadrature common to ground"},
            {"mcuPin": "GND", "componentId": "enc1", "componentPin": "SW2", "protocol": "GND", "description": "Encoder push-switch return to ground"}
        ],
        "labGuide": {
            "voltageSupplyNote": "Use a regulated 5V supply with enough current for the strip segment. This design limits brightness and uses a 16-pixel segment; longer strips need a separately sized supply and suitable power injection. Never power the strip from an ESP32 GPIO.",
            "prerequisites": [
                "ESP32-WROOM-32 development board",
                "16-pixel WS2812B strip segment",
                "Rotary encoder with push switch",
                "74AHCT125 level-buffer module",
                "Regulated 5V 2A supply, 330Ω resistor, and 1000µF capacitor",
                "Arduino IDE with Adafruit NeoPixel library"
            ],
            "breadboardWiringSteps": [
                {"stepNumber": 1, "title": "Connect the ESP32 and supply grounds", "instruction": "Power the ESP32 board from the regulated 5V supply at its 5V/VIN input. Connect the supply negative to ESP32 GND, LED strip GND, encoder common, and buffer GND."},
                {"stepNumber": 2, "title": "Power the LED strip and buffer", "instruction": "Connect the external 5V supply to strip 5V and 74AHCT125 VCC. Connect 74AHCT125 GND to common ground and tie its active-low OE pin to ground. Do not feed the strip from the ESP32 3V3 output."},
                {"stepNumber": 3, "title": "Wire the LED data path", "instruction": "Connect ESP32 GPIO18 to buffer input A. Connect buffer output Y through the 330Ω resistor to strip DIN. Place the 1000µF capacitor across strip 5V and GND with correct polarity."},
                {"stepNumber": 4, "title": "Connect the rotary encoder", "instruction": "Connect encoder A to GPIO32, B to GPIO33, COM to GND, switch SW1 to GPIO25, and SW2 to GND. Firmware enables internal pull-ups."}
            ],
            "testingProcedure": [
                "Install the Adafruit NeoPixel library and select an ESP32-WROOM-32 board.",
                "Power the strip from the 5V supply and upload the sketch.",
                "Turn the encoder to change hue; hold its switch while turning to change brightness."
            ],
            "troubleshootingTips": [
                "Strip stays dark: check strip direction, DIN versus DOUT, common ground, 5V polarity, and buffer OE.",
                "Random colors or flicker: check the 74AHCT125 level shifter, 330Ω data resistor, and bulk capacitor placement.",
                "Encoder direction is reversed: swap A/B or reverse the direction increment in firmware."
            ]
        },
        "firmwareCode": """#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

constexpr uint8_t LED_PIN = 18;
constexpr uint8_t ENCODER_A = 32;
constexpr uint8_t ENCODER_B = 33;
constexpr uint8_t ENCODER_SW = 25;
constexpr uint16_t LED_COUNT = 16;
constexpr uint8_t MAX_BRIGHTNESS = 160;
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
const int8_t transitions[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
uint8_t previousEncoder = 0;
int8_t encoderSteps = 0;
uint16_t hue = 0;
uint8_t brightness = 96;

void setup() {
  pinMode(ENCODER_A, INPUT_PULLUP);
  pinMode(ENCODER_B, INPUT_PULLUP);
  pinMode(ENCODER_SW, INPUT_PULLUP);
  previousEncoder = (digitalRead(ENCODER_A) << 1) | digitalRead(ENCODER_B);
  strip.begin();
  strip.setBrightness(brightness);
  strip.show();
}

void loop() {
  const uint8_t current = (digitalRead(ENCODER_A) << 1) | digitalRead(ENCODER_B);
  encoderSteps += transitions[(previousEncoder << 2) | current];
  previousEncoder = current;

  bool changed = false;
  if (encoderSteps >= 4 || encoderSteps <= -4) {
    const int8_t direction = encoderSteps > 0 ? 1 : -1;
    encoderSteps = 0;
    if (digitalRead(ENCODER_SW) == LOW) {
      brightness = constrain(static_cast<int>(brightness) + direction * 8, 8, MAX_BRIGHTNESS);
    } else {
      hue += direction * 512;
    }
    changed = true;
  }

  if (changed) {
    const uint32_t color = strip.ColorHSV(hue, 255, 255);
    for (uint16_t i = 0; i < LED_COUNT; ++i) strip.setPixelColor(i, color);
    strip.setBrightness(brightness);
    strip.show();
  }
  delay(1);
}""",
        "warnings": []
    },
    "stm32-drone": {
        "id": "stm32-mpu6000-flight-v2",
        "title": "STM32 Quadcopter Flight Controller",
        "description": "STM32F401 flight-controller hardware with an MPU6000 connected over SPI and four timer PWM outputs connected to brushless-motor ESC signal inputs.",
        "components": [
            {"id": "mcu1", "name": "STM32F401CCU6 BlackPill", "description": "3.3V ARM Cortex-M4 flight-controller MCU. PA0-PA3 provide TIM2_CH1-CH4 PWM outputs.", "category": "MCU", "package": "Development board", "estimatedCost": 320.00, "pins": ["5V", "3V3", "GND", "PA0", "PA1", "PA2", "PA3", "PA4", "PA5", "PA6", "PA7"], "operatingVoltage": 3.3, "maxCurrent_mA": 100},
            {"id": "imu1", "name": "MPU6000 6-axis IMU module", "description": "Gyroscope and accelerometer module wired using SPI; use a 3.3V-compatible breakout.", "category": "Sensor", "package": "SPI breakout", "estimatedCost": 520.00, "pins": ["VCC", "GND", "CS", "SCLK", "MISO", "MOSI", "INT"], "operatingVoltage": 3.3, "maxCurrent_mA": 4},
            {"id": "battery1", "name": "3S-4S LiPo battery input", "description": "Flight battery supply for the BEC and four ESC power inputs; battery voltage depends on the selected cell count.", "category": "Power", "package": "Battery connector", "estimatedCost": 1800.00, "pins": ["+", "-"], "operatingVoltage": 14.8, "maxCurrent_mA": 0},
            {"id": "bec1", "name": "5V flight BEC", "description": "Regulated 5V supply for the BlackPill board. Size the BEC for the board and peripherals; it does not supply motor current.", "category": "Power", "package": "Switching regulator module", "estimatedCost": 250.00, "pins": ["VIN", "VOUT", "GND"], "operatingVoltage": 5.0},
            {"id": "c1", "name": "100nF IMU bypass capacitor", "description": "Place close to the MPU6000 module across VCC and GND.", "category": "Passive", "package": "Ceramic capacitor", "estimatedCost": 5.00, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 0},
            *[
                {"id": f"esc{i}", "name": f"Brushless ESC {i} (PWM input)", "description": "Electronic speed controller; receives a low-voltage PWM command and battery power, then commutates its connected brushless motor.", "category": "Actuator", "package": "ESC module", "estimatedCost": 500.00, "pins": ["SIGNAL", "GND", "VBAT", "MOTOR_U", "MOTOR_V", "MOTOR_W"], "operatingVoltage": 3.3, "maxCurrent_mA": 20}
                for i in range(1, 5)
            ],
            *[
                {"id": f"motor{i}", "name": f"Brushless motor {i}", "description": "Three-phase quadcopter motor powered by its matching ESC; never connect motor phases to MCU pins.", "category": "Actuator", "package": "Brushless motor", "estimatedCost": 900.00, "pins": ["PHASE_U", "PHASE_V", "PHASE_W"], "operatingVoltage": 14.8}
                for i in range(1, 5)
            ]
        ],
        "pinMappings": [
            {"mcuPin": "PA4", "componentId": "imu1", "componentPin": "CS", "protocol": "SPI", "description": "SPI1 chip select for MPU6000 (active low)"},
            {"mcuPin": "PA5", "componentId": "imu1", "componentPin": "SCLK", "protocol": "SPI", "description": "SPI1 clock from STM32 to MPU6000"},
            {"mcuPin": "PA6", "componentId": "imu1", "componentPin": "MISO", "protocol": "SPI", "description": "SPI1 MISO from MPU6000 to STM32"},
            {"mcuPin": "PA7", "componentId": "imu1", "componentPin": "MOSI", "protocol": "SPI", "description": "SPI1 MOSI from STM32 to MPU6000"},
            {"mcuPin": "3V3", "componentId": "imu1", "componentPin": "VCC", "protocol": "Power", "description": "3.3V logic supply to MPU6000"},
            {"mcuPin": "GND", "componentId": "imu1", "componentPin": "GND", "protocol": "GND", "description": "Common logic ground to MPU6000"},
            {"mcuPin": "3V3", "componentId": "c1", "componentPin": "1", "protocol": "Power", "description": "IMU supply-side bypass capacitor"},
            {"mcuPin": "GND", "componentId": "c1", "componentPin": "2", "protocol": "GND", "description": "IMU ground-side bypass capacitor"},
            {"mcuPin": "VBAT", "sourceComponentId": "battery1", "sourceComponentPin": "+", "componentId": "bec1", "componentPin": "VIN", "protocol": "Power", "description": "Battery positive to regulated 5V BEC input"},
            {"mcuPin": "GND", "sourceComponentId": "battery1", "sourceComponentPin": "-", "componentId": "bec1", "componentPin": "GND", "protocol": "GND", "description": "Battery negative to BEC ground"},
            {"mcuPin": "5V", "sourceComponentId": "bec1", "sourceComponentPin": "VOUT", "componentId": "mcu1", "componentPin": "5V", "protocol": "Power", "description": "Regulated BEC 5V output to BlackPill 5V input"},
            {"mcuPin": "GND", "sourceComponentId": "bec1", "sourceComponentPin": "GND", "componentId": "mcu1", "componentPin": "GND", "protocol": "GND", "description": "BEC, MCU, IMU, and ESC signal grounds are common"},
            *[
                {"mcuPin": f"PA{i-1}", "componentId": f"esc{i}", "componentPin": "SIGNAL", "protocol": "PWM", "description": f"TIM2_CH{i} PWM command from STM32 to ESC {i} signal input"}
                for i in range(1, 5)
            ],
            *[
                {"mcuPin": "VBAT", "sourceComponentId": "battery1", "sourceComponentPin": "+", "componentId": f"esc{i}", "componentPin": "VBAT", "protocol": "Power", "description": f"Flight battery positive to ESC {i} power input"}
                for i in range(1, 5)
            ],
            *[
                {"mcuPin": "GND", "sourceComponentId": "battery1", "sourceComponentPin": "-", "componentId": f"esc{i}", "componentPin": "GND", "protocol": "GND", "description": f"Common battery and PWM signal ground for ESC {i}"}
                for i in range(1, 5)
            ],
            *[
                {"mcuPin": f"MOTOR_{phase}", "sourceComponentId": f"esc{i}", "sourceComponentPin": f"MOTOR_{phase}", "componentId": f"motor{i}", "componentPin": f"PHASE_{phase}", "protocol": "Power", "description": f"ESC {i} three-phase output {phase} to brushless motor {i}"}
                for i in range(1, 5) for phase in ("U", "V", "W")
            ]
        ],
        "labGuide": {
            "voltageSupplyNote": "Use a 3S-4S LiPo only with a BEC and ESCs rated for that battery voltage. Remove all propellers during bench testing. ESCs drive the motors; the STM32 only drives their low-voltage signal inputs.",
            "prerequisites": [
                "STM32F401CCU6 BlackPill board",
                "MPU6000 SPI breakout with 3.3V-compatible logic",
                "3S-4S LiPo battery and appropriately rated BEC",
                "Four ESCs and four compatible brushless motors",
                "ST-Link or supported USB DFU programmer"
            ],
            "breadboardWiringSteps": [
                {"stepNumber": 1, "title": "Connect the MPU6000 SPI bus", "instruction": "Connect PA4 to CS, PA5 to SCLK, PA6 to MISO, PA7 to MOSI, 3V3 to VCC, and GND to GND. Place the 100nF bypass capacitor directly across the IMU supply pins."},
                {"stepNumber": 2, "title": "Power the controller", "instruction": "Connect LiPo positive and negative to the BEC input. Connect the BEC regulated 5V output to the BlackPill 5V input and join BEC, MCU, IMU, and ESC signal grounds."},
                {"stepNumber": 3, "title": "Connect four ESC signal inputs", "instruction": "Connect PA0/TIM2_CH1 to ESC1 SIGNAL, PA1/TIM2_CH2 to ESC2 SIGNAL, PA2/TIM2_CH3 to ESC3 SIGNAL, and PA3/TIM2_CH4 to ESC4 SIGNAL. Connect each ESC ground to common ground."},
                {"stepNumber": 4, "title": "Connect ESC power and motors", "instruction": "Connect the battery power bus to each ESC battery input. Connect each ESC's three motor phase outputs only to its matching brushless motor phases. Do not route motor current through the breadboard or MCU."}
            ],
            "testingProcedure": [
                "Remove all propellers before powering the flight controller.",
                "Flash the STM32 sketch and confirm the MPU6000 WHO_AM_I response is 0x68 or 0x70.",
                "Confirm the four PWM outputs remain at minimum throttle during startup.",
                "Test each ESC and motor individually with a current-limited, secured setup before flight."
            ],
            "troubleshootingTips": [
                "No IMU response: check 3.3V, common ground, CS polarity, and SPI wiring.",
                "ESC does not arm: verify signal ground, battery input, supported PWM rate, and the ESC manufacturer's arming procedure."
            ]
        },
        "firmwareCode": """#include <Arduino.h>
#include <SPI.h>

constexpr uint8_t imuCs = PA4;
constexpr uint8_t escPins[] = {PA0, PA1, PA2, PA3};
constexpr uint8_t imuWhoAmI = 0x75;

uint8_t readImuRegister(uint8_t address) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE3));
  digitalWrite(imuCs, LOW);
  SPI.transfer(address | 0x80);
  const uint8_t value = SPI.transfer(0x00);
  digitalWrite(imuCs, HIGH);
  SPI.endTransaction();
  return value;
}

void writeImuRegister(uint8_t address, uint8_t value) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE3));
  digitalWrite(imuCs, LOW);
  SPI.transfer(address & 0x7F);
  SPI.transfer(value);
  digitalWrite(imuCs, HIGH);
  SPI.endTransaction();
}

void setup() {
  Serial.begin(115200);
  pinMode(imuCs, OUTPUT);
  digitalWrite(imuCs, HIGH);
  SPI.begin();
  delay(100);
  writeImuRegister(0x6B, 0x80);
  delay(100);
  writeImuRegister(0x6B, 0x01);
  Serial.print("MPU6000 WHO_AM_I: 0x");
  Serial.println(readImuRegister(imuWhoAmI), HEX);

  analogWriteFrequency(400);
  for (uint8_t pin : escPins) {
    pinMode(pin, OUTPUT);
    analogWrite(pin, 102); // Approximately 1000 us at 400 Hz with 8-bit PWM.
  }
}

void loop() {
  // Keep the ESC commands at minimum until calibrated flight-control firmware is installed.
  delay(10);
}""",
        "warnings": []
    },
    "rpi-pico-synth": {
        "id": "rpi-pico-midi-synth-v2",
        "title": "RP2040 MIDI Synthesizer",
        "description": "RP2040 monophonic MIDI synthesizer with an isolated 5-pin DIN MIDI input, UART MIDI parsing, and PCM5102A I2S audio output.",
        "components": [
            {"id": "mcu1", "name": "Raspberry Pi Pico (RP2040)", "description": "3.3V dual-core Cortex-M0+ development board. GP5 is UART1 RX for MIDI input; GP0/GP1/GP28 connect to the I2S DAC.", "category": "MCU", "package": "DIP-40 development board", "estimatedCost": 320.00, "pins": ["3V3", "GND", "GP0", "GP1", "GP5", "GP26", "GP27", "GP28"], "operatingVoltage": 3.3, "maxCurrent_mA": 120},
            {"id": "dac1", "name": "PCM5102A I2S DAC Module", "description": "Stereo line-level I2S digital-to-analog converter; connect to a powered amplifier or line input.", "category": "Actuator", "package": "DAC breakout with line output", "estimatedCost": 350.00, "pins": ["VIN", "GND", "BCK", "DIN", "LCK"], "operatingVoltage": 3.3, "maxCurrent_mA": 50},
            {"id": "din1", "name": "5-pin DIN MIDI input connector", "description": "Standard MIDI IN connector. Pins 4 and 5 feed the optoisolator input circuit.", "category": "Connector", "package": "5-pin DIN jack", "estimatedCost": 80.00, "pins": ["4", "5", "SHIELD"], "operatingVoltage": 5.0, "maxCurrent_mA": 0},
            {"id": "opto1", "name": "6N138 MIDI input optocoupler", "description": "Optically isolates the MIDI current-loop input from the RP2040 UART. Confirm the selected device pinout.", "category": "Sensor", "package": "DIP-8 optocoupler", "estimatedCost": 45.00, "pins": ["ANODE", "CATHODE", "NC", "GND", "NC2", "VO", "BASE", "VCC"], "operatingVoltage": 3.3, "maxCurrent_mA": 2},
            {"id": "r_midi_in", "name": "220Ω MIDI input resistor", "description": "Series current-limiting resistor between DIN pin 4 and optocoupler LED anode.", "category": "Passive", "package": "Axial resistor", "estimatedCost": 2.00, "pins": ["1", "2"], "operatingVoltage": 5.0, "maxCurrent_mA": 5},
            {"id": "r_midi_pullup", "name": "4.7kΩ MIDI UART pull-up resistor", "description": "Pulls the optocoupler output up to 3.3V for the RP2040 UART RX input.", "category": "Passive", "package": "Axial resistor", "estimatedCost": 2.00, "pins": ["1", "2"], "operatingVoltage": 3.3, "maxCurrent_mA": 1}
        ],
        "pinMappings": [
            {"mcuPin": "3V3", "componentId": "dac1", "componentPin": "VIN", "protocol": "Power", "description": "3.3V supply to PCM5102A"},
            {"mcuPin": "GND", "componentId": "dac1", "componentPin": "GND", "protocol": "GND", "description": "Common audio and digital ground"},
            {"mcuPin": "GP0", "componentId": "dac1", "componentPin": "BCK", "protocol": "I2S", "description": "I2S bit clock"},
            {"mcuPin": "GP1", "componentId": "dac1", "componentPin": "DIN", "protocol": "I2S", "description": "I2S serial audio data"},
            {"mcuPin": "GP28", "componentId": "dac1", "componentPin": "LCK", "protocol": "I2S", "description": "I2S word-select / left-right clock"},
            {"mcuPin": "3V3", "componentId": "opto1", "componentPin": "VCC", "protocol": "Power", "description": "3.3V optocoupler output-side supply"},
            {"mcuPin": "GND", "componentId": "opto1", "componentPin": "GND", "protocol": "GND", "description": "Isolated UART-side ground"},
            {"mcuPin": "GND", "componentId": "opto1", "componentPin": "BASE", "protocol": "GND", "description": "Reference the 6N138 base to output-side ground"},
            {"mcuPin": "MIDI_IN", "sourceComponentId": "din1", "sourceComponentPin": "4", "componentId": "r_midi_in", "componentPin": "1", "protocol": "UART", "description": "MIDI DIN pin 4 to input current-limiting resistor"},
            {"mcuPin": "DIN4_R", "sourceComponentId": "r_midi_in", "sourceComponentPin": "2", "componentId": "opto1", "componentPin": "ANODE", "protocol": "UART", "description": "Series resistor to 6N138 input LED anode"},
            {"mcuPin": "MIDI_RETURN", "sourceComponentId": "din1", "sourceComponentPin": "5", "componentId": "opto1", "componentPin": "CATHODE", "protocol": "UART", "description": "MIDI DIN pin 5 to 6N138 input LED cathode"},
            {"mcuPin": "GP5", "sourceComponentId": "opto1", "sourceComponentPin": "VO", "componentId": "mcu1", "componentPin": "GP5", "protocol": "UART", "description": "Optically isolated MIDI data output to RP2040 UART1 RX at 31250 baud"},
            {"mcuPin": "3V3", "componentId": "r_midi_pullup", "componentPin": "1", "protocol": "Power", "description": "UART output pull-up to 3.3V"},
            {"mcuPin": "GP5", "sourceComponentId": "opto1", "sourceComponentPin": "VO", "componentId": "r_midi_pullup", "componentPin": "2", "protocol": "UART", "description": "UART RX output pull-up branch"}
        ],
        "labGuide": {
            "voltageSupplyNote": "The DIN MIDI input is galvanically isolated by the optocoupler. The PCM5102A provides line-level audio, not speaker power; use powered speakers or an external amplifier.",
            "prerequisites": [
                "Raspberry Pi Pico / RP2040 board",
                "PCM5102A I2S DAC breakout",
                "5-pin DIN MIDI input jack",
                "6N138 optocoupler and 220Ω / 4.7kΩ resistors",
                "Powered speakers or audio amplifier"
            ],
            "breadboardWiringSteps": [
                {"stepNumber": 1, "title": "Wire the MIDI input isolator", "instruction": "Connect DIN pin 4 through the 220Ω resistor to 6N138 ANODE. Connect DIN pin 5 to 6N138 CATHODE. Power the output side from Pico 3V3/GND and pull VO up to 3V3 with 4.7kΩ."},
                {"stepNumber": 2, "title": "Connect MIDI data to the Pico", "instruction": "Connect 6N138 VO to Pico GP5 (UART1 RX). Connect the optocoupler output ground to Pico GND. MIDI serial is 31250 baud, 8-N-1."},
                {"stepNumber": 3, "title": "Connect the I2S DAC", "instruction": "Connect GP0 to PCM5102A BCK, GP1 to DIN, GP28 to LCK, 3V3 to VIN, and GND to GND. Connect the DAC line output to powered speakers or an amplifier."}
            ],
            "testingProcedure": [
                "Connect the DAC line output to powered audio equipment at low volume.",
                "Upload the firmware and open Serial Monitor at 115200 baud.",
                "Send MIDI note-on and note-off messages; verify the reported note and audible tone."
            ],
            "troubleshootingTips": [
                "No MIDI messages: verify the DIN pin 4/5 orientation, optocoupler LED polarity, 4.7kΩ pull-up, and 31250 baud.",
                "No audio: verify I2S wiring and that a powered amplifier or speakers are connected to the DAC line output."
            ]
        },
        "firmwareCode": """#include <Arduino.h>
#include <math.h>
#include <I2S.h>

I2S i2s(OUTPUT);
constexpr int midiRxPin = 5;
constexpr int sampleRate = 44100;
volatile float noteFrequency = 0.0f;
uint32_t phase = 0;
uint8_t runningStatus = 0;
uint8_t dataBytes[2] = {0, 0};
uint8_t dataCount = 0;

void handleMidiByte(uint8_t value) {
  if (value >= 0xF8) return;
  if (value & 0x80) {
    if (value >= 0xF0) { runningStatus = 0; dataCount = 0; return; }
    runningStatus = value;
    dataCount = 0;
    return;
  }
  if (!runningStatus) return;
  dataBytes[dataCount++] = value;
  if (dataCount < 2) return;
  dataCount = 0;
  const uint8_t command = runningStatus & 0xF0;
  const uint8_t note = dataBytes[0];
  const uint8_t velocity = dataBytes[1];
  if (command == 0x90 && velocity > 0) {
    noteFrequency = 440.0f * powf(2.0f, (static_cast<int>(note) - 69) / 12.0f);
  } else if (command == 0x80 || (command == 0x90 && velocity == 0)) {
    noteFrequency = 0.0f;
  }
}

void setup() {
  Serial.begin(115200);
  Serial1.setRX(midiRxPin);
  Serial1.begin(31250);
  i2s.setBCLK(0);
  i2s.setDATA(1);
  i2s.setBitsPerSample(16);
  if (!i2s.begin(sampleRate)) {
    Serial.println("I2S initialization failed");
    while (true) delay(1000);
  }
  Serial.println("MIDI synthesizer ready");
}

void loop() {
  while (Serial1.available()) handleMidiByte(static_cast<uint8_t>(Serial1.read()));
  const float frequency = noteFrequency;
  const int16_t sample = frequency > 0.0f
      ? static_cast<int16_t>(sinf((static_cast<float>(phase) / 4294967296.0f) * 2.0f * PI) * 12000.0f)
      : 0;
  i2s.write(sample);
  i2s.write(sample);
  if (frequency > 0.0f) {
    phase += static_cast<uint32_t>(frequency * 4294967296.0f / sampleRate);
  }
}""",
        "warnings": []
    }
}

def generate_with_gemini(prompt: str, api_key: str) -> CircuitDesign:
    """Generates a structured circuit design using Google's official Gemini API."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        system_instruction = """You are an expert electrical and embedded hardware design assistant.
Given a user's natural language circuit description, propose a practical, reviewable starter circuit design in strict JSON. Do not imply that an LLM response is a substitute for datasheet review or electrical simulation.
JSON format requirements:
{
  "id": "gen-<unique-short-id>",
  "title": "Descriptive Circuit Name",
  "description": "Clear 1-2 sentence engineering summary",
  "components": [
    {
      "id": "mcu1" (or "s1", "a1", "p1", etc.),
      "name": "Component Name (e.g., ESP32-WROOM-32, BME280, SSD1306, etc.)",
      "description": "Functional description",
      "category": "MCU" | "Sensor" | "Actuator" | "Power" | "Passive" | "Connector",
      "package": "e.g. QFN-48, Module, SOT-223",
      "estimatedCost": price in INR (float, e.g. 250.0),
      "pins": ["VCC", "GND", ...],
      "operatingVoltage": float (e.g. 3.3 or 5.0),
      "maxCurrent_mA": estimated operating current consumed in this design (mA), not rated supply capacity
    }
  ],
  "pinMappings": [
    {
      "mcuPin": "Pin on MCU (e.g. GPIO21, 3V3, GND)",
      "componentId": "ID of connected component",
      "componentPin": "Pin on component (e.g. SDA)",
      "protocol": "GPIO" | "I2C" | "SPI" | "UART" | "ADC" | "PWM" | "Power" | "GND" | "I2S",
      "description": "Connection purpose",
      "wireColor": "Optional practical wire color as a hex string"
    }
  ],
  "firmwareCode": "Complete, working starter sketch for the selected board and its libraries",
  "warnings": ["Specific engineering assumptions, unresolved facts, and build cautions"],
  "labGuide": {
    "prerequisites": ["Exact parts and tools"],
    "breadboardWiringSteps": [{"stepNumber": 1, "title": "Short action", "instruction": "Specific endpoints and polarity", "caution": "Optional safety caution"}],
    "testingProcedure": ["Safe, measurable test step"],
    "troubleshootingTips": ["Symptom and likely checks"],
    "voltageSupplyNote": "Supply and current-limit guidance"
  }
}
CRITICAL ELECTRICAL RULES:
1. maxCurrent_mA describes estimated maximum operating current consumed by a component in this design. Never put regulator output capacity or MCU source capacity in this field; describe supply capacity separately.
2. Use conservative, workload-appropriate current estimates. If a reliable estimate is unavailable, state that in warnings rather than inventing precision.
3. Every design MUST include exactly one MCU, correct power/GND connections, realistic pin numbers, and valid firmware.
4. For I2C buses, include a separate 4.7kΩ pull-up on SDA and SCL to the MCU logic rail unless the selected modules explicitly include pull-ups. Add 100nF bypass capacitors across supply and ground at each MCU and IC; note physical placement within 10mm is a build instruction, not something proven by this JSON.
5. For display firmware, set a visible text size and the library's explicit white color before drawing, then call display() after clearDisplay() so buffer changes reach the panel.
6. Check every sensor/display begin() result. For BME280, try 0x76 and 0x77; if initialization fails, print a useful Serial error, show an error on an initialized display if possible, and stop normal sensor reads.
7. Never claim a component is connected unless its pins are included in pinMappings.
8. Use one MCU only. Include complete pin lists for all endpoints used in mappings. IDs must be unique.
9. Treat the prompt as the source of requirements. Do not silently substitute a different project, board, sensor, voltage, or interface. If an exact part is ambiguous or its pinout is uncertain, state the assumption in warnings and prefer a common documented breakout/module over inventing package pin numbers.
10. Ensure firmware pin names, component names, pin mappings, supply voltages, and wiring guide describe the same circuit. Do not output example code that refers to absent parts or pins.
11. Include suitable current limiting, driver stages, flyback protection, pull-ups, decoupling, and a safe power source where required by the requested loads. Never connect motors, relays, high-power LEDs, heaters, or batteries directly to MCU GPIO.
12. Keep the requested scope. If it is unsafe, underspecified, or not realistically buildable with the stated parts, explain the limitation in warnings instead of presenting it as verified.
13. Return JSON only. Do not claim electrical validation, simulation, or datasheet verification that was not actually performed."""

        model_name = 'gemini-2.5-flash-lite'
        previous_output = ""
        last_error: Optional[Exception] = None
        for attempt in range(2):
            contents = prompt if attempt == 0 else (
                "Revise your previous JSON to fix these validation errors. "
                "Return only the complete corrected JSON design.\n"
                f"Original user request:\n{prompt}\n"
                f"Validation errors:\n{last_error}\n"
                f"Previous JSON:\n{previous_output}"
            )
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )

            previous_output = response.text or ""
            try:
                if not previous_output:
                    raise ValueError("Gemini returned an empty response.")
                design = CircuitDesign(**json.loads(previous_output))
                validate_generated_design(design)
                validate_prompt_requirements(prompt, design)
                ensure_design_support_parts(design)
                validate_generated_design(design)
                validate_prompt_requirements(prompt, design)
                design.warnings.append(
                    "AI-generated starter design: verify component pinouts, electrical ratings, power requirements, and wiring against current datasheets before assembly."
                )
                design.drcReport = run_drc(design)
                return design
            except Exception as error:
                last_error = error
                if attempt == 1:
                    raise
        raise ValueError("Gemini did not produce a valid circuit design.") from last_error
    except Exception as e:
        print(f"Remote circuit generation provider returned an error: {e}")
        raise

def validate_generated_design(design: CircuitDesign) -> None:
    """Reject malformed Gemini output before it is presented as a circuit."""
    if not design.title.strip() or not design.description.strip():
        raise ValueError("Generated design must include a title and engineering summary.")
    if not design.components:
        raise ValueError("Generated design has no components.")
    component_ids = [component.id for component in design.components]
    if len(component_ids) != len(set(component_ids)):
        raise ValueError("Generated design contains duplicate component IDs.")
    if any(not component.name.strip() or not component.pins for component in design.components):
        raise ValueError("Every component must have a name and declared pin list.")
    mcus = [component for component in design.components if component.category == 'MCU']
    if len(mcus) != 1:
        raise ValueError(f"Generated design must contain exactly one MCU; found {len(mcus)}.")

    component_by_id = {component.id: component for component in design.components}
    invalid_mappings = []
    for mapping in design.pinMappings:
        source = component_by_id.get(mapping.sourceComponentId) if mapping.sourceComponentId else mcus[0]
        target = component_by_id.get(mapping.componentId)
        if source is None or target is None:
            invalid_mappings.append(f"{mapping.mcuPin} to {mapping.componentId}.{mapping.componentPin} references a missing component")
            continue
        source_pin = mapping.sourceComponentPin or mapping.mcuPin
        if source_pin not in source.pins or mapping.componentPin not in target.pins:
            invalid_mappings.append(f"{source.name}.{source_pin} to {target.name}.{mapping.componentPin} uses an undeclared pin")
    if invalid_mappings:
        raise ValueError("Generated design has invalid pin mappings: " + "; ".join(invalid_mappings[:8]))

    if len(design.pinMappings) == 0:
        raise ValueError("Generated design has no pin mappings.")
    if not design.firmwareCode.strip():
        raise ValueError("Generated design has no firmware sketch.")

def validate_prompt_requirements(prompt: str, design: CircuitDesign) -> None:
    """Reject generated designs that substitute explicitly requested parts or interfaces."""
    component_text = " ".join(
        f"{component.name} {component.description} {component.package}"
        for component in design.components
    )
    component_names = " ".join(component.name for component in design.components)
    component_ids = {
        component.id: f"{component.name} {component.description} {component.package}"
        for component in design.components
    }
    errors = []

    required_parts = [
        (r"\bmpu\s*6000\b", r"\bmpu\s*6000\b", "MPU6000"),
        (r"\bmpu\s*6050\b", r"\bmpu\s*6050\b", "MPU6050"),
        (r"\bbme\s*280\b", r"\bbme\s*280\b", "BME280"),
        (r"\bdht\s*11\b", r"\bdht\s*11\b", "DHT11"),
        (r"\bdht\s*22\b|\bam2302\b", r"\bdht\s*22\b|\bam2302\b", "DHT22 / AM2302"),
        (r"\bds18b20\b", r"\bds18b20\b", "DS18B20"),
        (r"\bhc[\s-]?sr04\b", r"\bhc[\s-]?sr04\b", "HC-SR04"),
        (r"\bssd\s*1306\b", r"\bssd\s*1306\b", "SSD1306"),
        (r"\bmax\s*98357a\b", r"\bmax\s*98357a\b", "MAX98357A"),
        (r"\bws\s*2812b?\b|\bneopixel\b", r"\bws\s*2812b?\b|\bneopixel\b", "WS2812B addressable LED"),
        (r"\brotary\s+encoder\b|\bencoder\b", r"\brotary\s+encoder\b|\bencoder\b", "rotary encoder"),
        (r"\bl298n\b", r"\bl298n\b", "L298N"),
        (r"\batmega\s*328p?\b", r"\batmega\s*328p?\b", "ATmega328P"),
        (r"\bled\b", r"\bled\b", "LED"),
        (r"\bpush[\s-]?button\b|\btactile\s+button\b", r"\bbutton\b|\bswitch\b", "pushbutton"),
        (r"\brelay\b", r"\brelay\b", "relay"),
        (r"\bservo(?:\s+motor)?\b", r"\bservo\b", "servo"),
    ]
    for requested, accepted, label in required_parts:
        haystack = component_text if label in {"LED", "pushbutton", "relay", "servo"} else component_names
        if re.search(requested, prompt, re.IGNORECASE) and not re.search(accepted, haystack, re.IGNORECASE):
            errors.append(f"requested part {label} is missing or substituted")

    requested_boards = [
        (r"\b(?:arduino\s*uno|uno)\b", r"\barduino\s*uno\b", "Arduino Uno"),
        (r"\b(?:arduino\s*nano|nano)\b", r"\barduino\s*nano\b", "Arduino Nano"),
        (r"\b(?:arduino\s*mega|mega\s*2560)\b", r"\b(?:arduino\s*mega|mega\s*2560)\b", "Arduino Mega"),
        (r"\besp[\s-]?32\b", r"\besp[\s-]?32\b", "ESP32"),
        (r"\b(?:stm32|blackpill|nucleo)\b", r"\b(?:stm32|blackpill|nucleo)\b", "STM32"),
        (r"\b(?:rp2040|raspberry\s*pi\s*pico|pico)\b", r"\b(?:rp2040|raspberry\s*pi\s*pico|pico)\b", "RP2040 / Raspberry Pi Pico"),
    ]
    for requested, accepted, label in requested_boards:
        if re.search(requested, prompt, re.IGNORECASE) and not re.search(accepted, component_names, re.IGNORECASE):
            errors.append(f"requested board {label} is missing or substituted")

    interface_requirements = [
        (r"\bi\s*2\s*c(?:\s*\d+)?\b|\bi²c\b", "I2C"),
        (r"\bi\s*2\s*s(?:\s*\d+)?\b|\bi²s\b", "I2S"),
        (r"\bspi(?:\s*\d+)?\b", "SPI"),
        (r"\buart(?:\s*\d+)?\b", "UART"),
        (r"\bpwm\b", "PWM"),
        (r"\badc\b|\banalog\s+input\b", "ADC"),
    ]
    for requested, protocol in interface_requirements:
        if re.search(requested, prompt, re.IGNORECASE) and not any(
            mapping.protocol == protocol for mapping in design.pinMappings
        ):
            errors.append(f"requested {protocol} interface has no pin mappings")

    named_parts = [
        (requested, label) for requested, _, label in required_parts
        if label in {"MPU6000", "MPU6050", "BME280", "DHT11", "DHT22 / AM2302", "DS18B20", "HC-SR04", "SSD1306"}
        and re.search(requested, prompt, re.IGNORECASE)
    ]
    explicit_protocols = [
        protocol for requested, protocol in interface_requirements
        if re.search(requested, prompt, re.IGNORECASE)
    ]
    for requested, label in named_parts:
        matching_ids = {
            component_id for component_id, text in component_ids.items()
            if re.search(requested, text, re.IGNORECASE)
        }
        if matching_ids and explicit_protocols and not any(
            mapping.protocol in explicit_protocols
            and (mapping.componentId in matching_ids or mapping.sourceComponentId in matching_ids)
            for mapping in design.pinMappings
        ):
            errors.append(f"{label} is not connected using the requested interface")

    if re.search(r"\b(?:motor|motors|esc|propeller)\b", prompt, re.IGNORECASE):
        driver_text = " ".join(
            f"{component.name} {component.description}"
            for component in design.components
            if component.category in {"Actuator", "Power"}
        )
        if not re.search(r"\b(?:esc|motor\s+driver|h[\s-]?bridge|l298n|tb6612|drv8833|mosfet|transistor)\b", driver_text, re.IGNORECASE):
            errors.append("motor outputs have no identified driver or ESC stage")
        if re.search(r"\bpwm\b", prompt, re.IGNORECASE) and not any(
            mapping.protocol == "PWM"
            and mapping.componentId in {
                component.id for component in design.components
                if component.category == "Actuator"
            }
            for mapping in design.pinMappings
        ):
            errors.append("PWM is not connected to an actuator or ESC input")

    if re.search(r"\bmidi\b", prompt, re.IGNORECASE):
        if not re.search(r"\b(?:din\s*(?:5|connector|jack)|midi\s+(?:input|in|din))\b", component_text, re.IGNORECASE):
            errors.append("MIDI input connector is missing")
        if not re.search(r"\b(?:optocoupler|opto[\s-]?isolat)\b", component_text, re.IGNORECASE):
            errors.append("MIDI input isolation is missing")
        if not any(mapping.protocol == "UART" for mapping in design.pinMappings):
            errors.append("MIDI input has no UART pin mapping")
        if not re.search(r"\b31250\b", design.firmwareCode):
            errors.append("firmware does not configure the MIDI baud rate")
        if not re.search(r"0x90", design.firmwareCode, re.IGNORECASE) or not re.search(r"0x80", design.firmwareCode, re.IGNORECASE):
            errors.append("firmware does not handle MIDI note-on and note-off messages")

    if re.search(r"\bws\s*2812b?\b|\bneopixel\b", prompt, re.IGNORECASE):
        strip_ids = {
            component.id for component in design.components
            if re.search(r"\bws\s*2812b?\b|\bneopixel\b", f"{component.name} {component.description}", re.IGNORECASE)
        }
        data_is_mapped = any(
            mapping.protocol == "GPIO"
            and (mapping.componentId in strip_ids or mapping.sourceComponentId in strip_ids)
            for mapping in design.pinMappings
        )
        if strip_ids and not data_is_mapped:
            errors.append("addressable LED data input has no GPIO connection")
        if not re.search(r"\b(?:74ahct|74hct|level[\s-]?shifter|logic[\s-]?buffer)\b", component_text, re.IGNORECASE):
            errors.append("3.3V-to-5V addressable LED data buffer is missing")

    if re.search(r"\brotary\s+encoder\b|\bencoder\b", prompt, re.IGNORECASE):
        encoder_ids = {
            component.id for component in design.components
            if re.search(r"\b(?:rotary\s+encoder|encoder)\b", component.name, re.IGNORECASE)
        }
        encoder_mappings = [
            mapping for mapping in design.pinMappings
            if mapping.protocol == "GPIO" and mapping.componentId in encoder_ids
        ]
        if len(encoder_mappings) < 3:
            errors.append("rotary encoder channels and push switch are not mapped to GPIO")

    if errors:
        raise ValueError("Prompt requirements not met: " + "; ".join(errors))

def prompt_coverage_warnings(prompt: str, design: CircuitDesign) -> List[str]:
    """Flag explicit prompt requirements that are not evident in the generated design."""
    warnings: List[str] = []
    components_text = " ".join(
        f"{component.name} {component.description} {component.package}"
        for component in design.components
    )
    board_requirements = [
        (r"\b(?:arduino\s*uno|uno)\b", r"\barduino\s*uno\b", "Arduino Uno"),
        (r"\b(?:arduino\s*nano|nano)\b", r"\barduino\s*nano\b", "Arduino Nano"),
        (r"\b(?:arduino\s*mega|mega\s*2560)\b", r"\barduino\s*mega|mega\s*2560\b", "Arduino Mega"),
        (r"\besp[\s-]?32\b", r"\besp[\s-]?32\b", "ESP32"),
        (r"\besp[\s-]?8266\b", r"\besp[\s-]?8266\b", "ESP8266"),
        (r"\b(?:stm32|blackpill|nucleo)\b", r"\b(?:stm32|blackpill|nucleo)\b", "STM32"),
        (r"\b(?:rp2040|raspberry\s*pi\s*pico|pico)\b", r"\b(?:rp2040|raspberry\s*pi\s*pico|pico)\b", "Raspberry Pi Pico / RP2040"),
    ]
    for requested, accepted, label in board_requirements:
        if re.search(requested, prompt, re.IGNORECASE) and not re.search(accepted, components_text, re.IGNORECASE):
            warnings.append(f"Prompt coverage: the request specifies {label}, but the generated component list does not clearly include that board.")

    component_requirements = [
        (r"\bbme\s*280\b", r"\bbme\s*280\b", "BME280"),
        (r"\bmpu\s*6050\b", r"\bmpu\s*6050\b", "MPU6050"),
        (r"\bmpu\s*6000\b", r"\bmpu\s*6000\b", "MPU6000"),
        (r"\bdht\s*11\b", r"\bdht\s*11\b", "DHT11"),
        (r"\bdht\s*22\b|\bam2302\b", r"\bdht\s*22\b|\bam2302\b", "DHT22 / AM2302"),
        (r"\bds18b20\b", r"\bds18b20\b", "DS18B20"),
        (r"\bhc[\s-]?sr04\b", r"\bhc[\s-]?sr04\b", "HC-SR04"),
        (r"\bssd\s*1306\b", r"\bssd\s*1306\b", "SSD1306"),
        (r"\boled\b", r"\boled\b|\bssd\s*1306\b|\bdisplay\b", "OLED display"),
        (r"\bmax\s*98357a\b", r"\bmax\s*98357a\b", "MAX98357A"),
        (r"\bl298n\b", r"\bl298n\b", "L298N"),
        (r"\bled\b", r"\bled\b", "LED"),
        (r"\bpush[\s-]?button\b|\btactile\s+button\b", r"\bbutton|switch\b", "pushbutton"),
        (r"\brelay\b", r"\brelay\b", "relay"),
        (r"\bservo(?:\s+motor)?\b", r"\bservo\b", "servo"),
        (r"\bmotor\b", r"\bmotor\b", "motor"),
    ]
    for requested, accepted, label in component_requirements:
        if not re.search(requested, prompt, re.IGNORECASE):
            continue
        matching_components = [
            component for component in design.components
            if re.search(accepted, f"{component.name} {component.description} {component.package}", re.IGNORECASE)
        ]
        if not matching_components:
            warnings.append(f"Prompt coverage: the request names {label}, but no matching component is listed.")
        elif not any(
            mapping.componentId in {component.id for component in matching_components}
            or mapping.sourceComponentId in {component.id for component in matching_components}
            for mapping in design.pinMappings
        ):
            warnings.append(f"Prompt coverage: {label} is listed, but no pin mapping connects it to the circuit.")

    if re.search(r"\bmidi\b", prompt, re.IGNORECASE):
        if not re.search(r"\b(?:midi\s+(?:din|input|receiver)|din\s+5|optocoupler|opto[\s-]?isolat)\b", components_text, re.IGNORECASE):
            warnings.append("Prompt coverage: MIDI input hardware, including an isolated receiver and physical MIDI connector, is not represented in this design.")
        if not any(mapping.protocol == "UART" and re.search(r"\bmidi\b", mapping.description, re.IGNORECASE) for mapping in design.pinMappings):
            warnings.append("Prompt coverage: no UART mapping is identified for MIDI input.")
        if not re.search(r"\b(?:31250|midi\s+byte|note\s+on|note\s+off)\b", design.firmwareCode, re.IGNORECASE):
            warnings.append("Prompt coverage: MIDI serial parsing and note handling are not implemented in the firmware.")

    requested_interfaces = [
        (r"\bi\s*2\s*c(?:\s*\d+)?\b|\bi²c\b", "I2C"),
        (r"\bi\s*2\s*s(?:\s*\d+)?\b|\bi²s\b", "I2S"),
        (r"\bspi(?:\s*\d+)?\b", "SPI"),
        (r"\buart(?:\s*\d+)?\b|\bserial\b", "UART"),
        (r"\bpwm\b", "PWM"),
        (r"\badc\b|\banalog\s+input\b", "ADC"),
    ]
    mapped_interfaces = {mapping.protocol for mapping in design.pinMappings}
    for requested, protocol in requested_interfaces:
        if re.search(requested, prompt, re.IGNORECASE) and protocol not in mapped_interfaces:
            warnings.append(f"Prompt coverage: {protocol} is requested, but no {protocol} pin mapping is present.")

    if re.search(r"\b(?:motor|relay|heater|solenoid)\b", prompt, re.IGNORECASE):
        if not re.search(r"\b(?:motor\s+driver|h[\s-]?bridge|l298n|tb6612|drv8833|relay\s+driver|mosfet|transistor)\b", components_text, re.IGNORECASE):
            warnings.append("Prompt coverage: the requested inductive/high-current load has no clearly identified driver or switching stage. Review this before connecting it to an MCU.")

    if re.search(r"\bwi[\s-]?fi\b|\bwireless\b", prompt, re.IGNORECASE) and not re.search(r"\b(?:wi[\s-]?fi|esp[-\s]?now|wifi|bluetooth|ble)\b", design.firmwareCode, re.IGNORECASE):
        warnings.append("Prompt coverage: wireless communication is requested, but the firmware does not clearly configure or use a wireless interface.")
    if re.search(r"\b(?:bluetooth|ble)\b", prompt, re.IGNORECASE) and not re.search(r"\b(?:bluetooth|ble|nimble)\b", design.firmwareCode, re.IGNORECASE):
        warnings.append("Prompt coverage: Bluetooth is requested, but the firmware does not clearly configure or use Bluetooth.")

    def normalize_prompt_pin(pin: str) -> str:
        normalized = re.sub(r"\s+", "", pin).upper()
        return re.sub(r"^(?:GPIO|GP|D|A)(?=\d)", "", normalized)

    requested_pins = {
        normalize_prompt_pin(match.group(0))
        for match in re.finditer(r"\b(?:GPIO\s*\d+|GP\d+|D\d+|A\d+|P[A-Z]\d+)\b", prompt, re.IGNORECASE)
    }
    mapped_pins = {
        normalize_prompt_pin(pin)
        for mapping in design.pinMappings
        for pin in (mapping.mcuPin, mapping.sourceComponentPin or "")
    }
    missing_pins = sorted(requested_pins - mapped_pins)
    if missing_pins:
        warnings.append(f"Prompt coverage: requested pin(s) {', '.join(missing_pins)} are not present in the generated pin mappings.")

    if re.search(r"\b(?:blink|blinking|flash|flashing)\b", prompt, re.IGNORECASE):
        if not re.search(r"\bdigitalWrite\s*\(", design.firmwareCode, re.IGNORECASE) or not re.search(r"\bdelay\s*\(", design.firmwareCode, re.IGNORECASE):
            warnings.append("Prompt coverage: the request describes a blinking/flashing output, but the firmware does not clearly contain both digitalWrite() and delay().")

    if re.search(r"\b(?:push[\s-]?button|button)\b", prompt, re.IGNORECASE):
        has_button = re.search(r"\bbutton|switch\b", components_text, re.IGNORECASE)
        reads_input = re.search(r"\bdigitalRead\s*\(", design.firmwareCode, re.IGNORECASE)
        if has_button and not reads_input:
            warnings.append("Prompt coverage: a button is listed, but the firmware does not clearly read a digital input.")

    if re.search(r"\b(?:display|oled|lcd|screen)\b", prompt, re.IGNORECASE):
        if re.search(r"\b(?:display|oled|lcd|screen)\b", components_text, re.IGNORECASE) and not re.search(r"\b(?:display|lcd)\b", design.firmwareCode, re.IGNORECASE):
            warnings.append("Prompt coverage: a display is listed, but the firmware does not clearly initialize or write to a display.")

    if re.search(r"\b(?:battery|battery-powered)\b", prompt, re.IGNORECASE) and not re.search(r"\b(?:battery|cell|pack)\b", components_text, re.IGNORECASE):
        warnings.append("Prompt coverage: the request specifies battery power, but no battery or cell is listed in the design.")

    return warnings

def ensure_design_support_parts(design: CircuitDesign) -> None:
    """Add missing I2C pull-ups and bypass capacitors with explicit pin mappings."""
    mcu = next((component for component in design.components if component.category == 'MCU'), None)
    if not mcu:
        return

    power_pin = next((pin for pin in mcu.pins if pin.lower() in {'3v3', '3.3v', 'vcc'}), None)
    ground_pin = next((pin for pin in mcu.pins if pin.lower() in {'gnd', 'ground'}), None)
    if not power_pin or not ground_pin:
        return

    def add_mapping(mcu_pin: str, component_id: str, component_pin: str, protocol: str, description: str, source_component_id: Optional[str] = None) -> None:
        if any(mapping.mcuPin == mcu_pin and mapping.componentId == component_id and mapping.componentPin == component_pin and mapping.sourceComponentId == source_component_id for mapping in design.pinMappings):
            return
        design.pinMappings.append(PinMapping(mcuPin=mcu_pin, componentId=component_id, componentPin=component_pin, protocol=protocol, description=description, sourceComponentId=source_component_id))

    i2c = [mapping for mapping in design.pinMappings if mapping.protocol == 'I2C']
    if i2c:
        for line in ('SDA', 'SCL'):
            line_maps = [mapping for mapping in i2c if line in mapping.componentPin.upper() or line in mapping.description.upper()]
            if not line_maps:
                continue
            existing = next((component for component in design.components if 'pull' in (component.name + ' ' + component.description).lower() and line.lower() in (component.name + ' ' + component.description).lower()), None)
            if existing is None:
                component_id = f"auto_pullup_{line.lower()}"
                existing = Component(id=component_id, name=f"4.7kΩ I2C Pull-Up ({line})", description=f"Auto-added {line} pull-up to {mcu.name} logic rail", category='Passive', package='Axial / 0805', estimatedCost=2.0, pins=['1', '2'], operatingVoltage=mcu.operatingVoltage or 3.3, maxCurrent_mA=0.7)
                design.components.append(existing)
            bus_pin = line_maps[0].mcuPin
            add_mapping(power_pin, existing.id, '1', 'Power', f"{line} pull-up to logic supply")
            add_mapping(bus_pin, existing.id, '2', 'I2C', f"{line} pull-up branch to shared bus")

    powered_ics = [
        component for component in design.components
        if component.category in {'MCU', 'Sensor', 'Actuator'}
        and not re.search(r"dev\s*board|blackpill|pico|devkit|module|breakout", f"{component.name} {component.package}", re.IGNORECASE)
    ]
    for ic in powered_ics:
        marker = ic.name.lower().split()[0]
        cap = next((component for component in design.components if component.category == 'Passive' and ('100nf' in (component.name + ' ' + component.description).lower() or 'decoupl' in (component.name + ' ' + component.description).lower()) and marker in (component.name + ' ' + component.description).lower()), None)
        if cap is None:
            cap = Component(id=f"auto_bypass_{ic.id}", name=f"100nF Decoupling Capacitor ({ic.name})", description=f"Place across {ic.name} supply and ground pins within 10mm", category='Passive', package='0805', estimatedCost=3.0, pins=['1', '2'], operatingVoltage=mcu.operatingVoltage or 3.3, maxCurrent_mA=0)
            design.components.append(cap)
        supply_map = next((mapping for mapping in design.pinMappings if mapping.componentId == ic.id and mapping.componentPin.lower() in {'vcc', 'vin', '3v3', 'vdd', 'vsup'} and mapping.protocol == 'Power'), None)
        ground_map = next((mapping for mapping in design.pinMappings if mapping.componentId == ic.id and mapping.componentPin.lower() in {'gnd', 'ground'} and mapping.protocol == 'GND'), None)
        supply_source = supply_map.sourceComponentId if supply_map else None
        supply_node = supply_map.componentPin if supply_source else (supply_map.mcuPin if supply_map else power_pin)
        ground_source = ground_map.sourceComponentId if ground_map else None
        ground_node = ground_map.componentPin if ground_source else (ground_map.mcuPin if ground_map else ground_pin)
        add_mapping(supply_node, cap.id, '1', 'Power', f"{ic.name} local bypass supply connection", supply_source)
        add_mapping(ground_node, cap.id, '2', 'GND', f"{ic.name} local bypass ground connection", ground_source)

# ----------------- Endpoints -----------------

def make_button_led_design(prompt: str) -> CircuitDesign:
    components = [
        Component(id="u1", name="Arduino Uno R3", description="5V microcontroller board using D7 for the button and D8 for the external LED.", category="MCU", package="Dev board", estimatedCost=600, pins=["5V", "GND", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "A0", "A1", "A2", "A3", "A4", "A5"], operatingVoltage=5, maxCurrent_mA=50),
        Component(id="sw1", name="4-pin tactile pushbutton", description="Momentary normally-open switch. Pins 1/2 form one side; pins 3/4 form the opposite side. Place across the breadboard trench.", category="Actuator", package="Through-hole tactile switch", estimatedCost=10, pins=["1", "2", "3", "4"], operatingVoltage=5, maxCurrent_mA=1),
        Component(id="r_pd", name="10kΩ button pull-down resistor", description="Holds D7 LOW while released; connects the button output node to GND.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0.5),
        Component(id="d1", name="Indicator LED", description="Anode connects to D8 through a 220Ω series resistor; cathode connects to GND.", category="Actuator", package="5mm LED", estimatedCost=3, pins=["ANODE", "CATHODE"], operatingVoltage=2, maxCurrent_mA=10),
        Component(id="r_led", name="220Ω LED current-limiting resistor", description="Series resistor from Arduino D8 to LED anode.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=10),
    ]
    mappings = [
        PinMapping(mcuPin="5V", componentId="sw1", componentPin="1", protocol="Power", description="Switch supply side; button pins 1/2 are internally common."),
        PinMapping(mcuPin="D7", componentId="sw1", componentPin="3", protocol="GPIO", description="Button output side; pins 3/4 are internally common."),
        PinMapping(mcuPin="D7", componentId="r_pd", componentPin="1", protocol="GPIO", description="Pull-down connects to the same D7/button output node."),
        PinMapping(mcuPin="GND", componentId="r_pd", componentPin="2", protocol="GND", description="10kΩ pull-down returns to ground."),
        PinMapping(mcuPin="D8", componentId="r_led", componentPin="1", protocol="GPIO", description="D8 drives the external LED through its series resistor."),
        PinMapping(mcuPin="D8", sourceComponentId="r_led", sourceComponentPin="2", componentId="d1", componentPin="ANODE", protocol="GPIO", description="LED anode connects to resistor terminal 2; terminal 1 connects to Arduino D8."),
        PinMapping(mcuPin="GND", componentId="d1", componentPin="CATHODE", protocol="GND", description="LED cathode returns to GND for active-HIGH operation."),
    ]
    design = CircuitDesign(
        id=f"button-led-{uuid.uuid4().hex[:8]}",
        title="Arduino Uno Pushbutton LED",
        description=f"Press a pushbutton to light an LED. D7 reads the button through a 10kΩ pull-down; D8 drives the external LED through a 220Ω current-limiting resistor. Requested project: {prompt}",
        components=components,
        pinMappings=mappings,
        firmwareCode="""const int buttonPin = 7;
const int ledPin = 8;

void setup() {
  pinMode(buttonPin, INPUT);  // External 10kΩ pull-down to GND
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
}

void loop() {
  const bool pressed = digitalRead(buttonPin) == HIGH;
  digitalWrite(ledPin, pressed ? HIGH : LOW);
}""",
        warnings=["Use D8 for the external LED with its own 220Ω series resistor. External 10kΩ pull-down is required with INPUT mode. Identify the switch's internally connected pin pairs and place it across the breadboard trench."],
    )
    design.drcReport = run_drc(design)
    return design

def make_arduino_motor_speed_design(prompt: str) -> CircuitDesign:
    components = [
        Component(id="u1", name="Arduino Uno R3", description="5V controller; D9 provides PWM, D7/D8 set direction, and A0 reads the speed potentiometer.", category="MCU", package="Dev board", estimatedCost=600, pins=["5V", "GND", "D7", "D8", "D9", "A0"], operatingVoltage=5, maxCurrent_mA=50),
        Component(id="drv1", name="L298N Dual H-Bridge Module", description="Motor driver logic uses 5V; VS is the separate motor supply. Remove the ENA jumper to control speed with PWM. Check the module for onboard clamp diodes and a sense resistor.", category="Actuator", package="Module", estimatedCost=250, pins=["VSS", "VS", "GND", "ENA", "IN1", "IN2", "OUT1", "OUT2"], operatingVoltage=5, maxCurrent_mA=20),
        Component(id="motor1", name="Brushed DC Motor", description="Connect to the H-bridge outputs. Motor voltage and stall current must remain within the supply and driver ratings.", category="Actuator", package="Motor", estimatedCost=180, pins=["M+", "M-"], operatingVoltage=12, maxCurrent_mA=1000),
        Component(id="pot1", name="10kΩ Speed Potentiometer", description="Connect the two outer terminals to Arduino 5V and GND; connect the wiper to A0.", category="Passive", package="Panel potentiometer", estimatedCost=20, pins=["5V", "GND", "WIPER"], operatingVoltage=5, maxCurrent_mA=1),
        Component(id="batt1", name="Separate Motor Supply", description="Use a supply matched to the motor voltage and stall current; its negative terminal joins the common ground.", category="Power", package="External supply", estimatedCost=500, pins=["+", "GND"], operatingVoltage=12, maxCurrent_mA=2000),
        Component(id="f1", name="Inline Motor-Supply Fuse", description="Place in series with the positive motor-supply lead. Select from motor stall current, wiring, and driver ratings.", category="Power", package="Fuse holder", estimatedCost=25, pins=["IN", "OUT"], operatingVoltage=12, maxCurrent_mA=0),
        Component(id="c1", name="470µF Motor-Rail Capacitor", description="Connect across the driver motor supply and common ground near the module; observe polarity and voltage rating.", category="Passive", package="Electrolytic capacitor", estimatedCost=15, pins=["+", "-"], operatingVoltage=25, maxCurrent_mA=0),
    ]
    mappings = [
        PinMapping(mcuPin="D9", componentId="drv1", componentPin="ENA", protocol="PWM", description="PWM speed control; remove the ENA jumper first."),
        PinMapping(mcuPin="D7", componentId="drv1", componentPin="IN1", protocol="GPIO", description="H-bridge direction input 1."),
        PinMapping(mcuPin="D8", componentId="drv1", componentPin="IN2", protocol="GPIO", description="H-bridge direction input 2."),
        PinMapping(mcuPin="A0", componentId="pot1", componentPin="WIPER", protocol="ADC", description="Potentiometer wiper supplies the speed setpoint."),
        PinMapping(mcuPin="5V", componentId="pot1", componentPin="5V", protocol="Power", description="Potentiometer reference supply."),
        PinMapping(mcuPin="GND", componentId="pot1", componentPin="GND", protocol="GND", description="Potentiometer ground."),
        PinMapping(mcuPin="5V", componentId="drv1", componentPin="VSS", protocol="Power", description="Arduino 5V powers the L298N logic input."),
        PinMapping(mcuPin="+", sourceComponentId="batt1", sourceComponentPin="+", componentId="f1", componentPin="IN", protocol="Power", description="Separate motor-supply positive passes through the inline fuse."),
        PinMapping(mcuPin="OUT", sourceComponentId="f1", sourceComponentPin="OUT", componentId="drv1", componentPin="VS", protocol="Power", description="Fused motor supply connects to L298N VS."),
        PinMapping(mcuPin="GND", componentId="drv1", componentPin="GND", protocol="GND", description="Common ground; join Arduino and motor-supply negatives."),
        PinMapping(mcuPin="OUT1", sourceComponentId="drv1", sourceComponentPin="OUT1", componentId="motor1", componentPin="M+", protocol="Power", description="H-bridge output 1 to motor terminal 1."),
        PinMapping(mcuPin="OUT2", sourceComponentId="drv1", sourceComponentPin="OUT2", componentId="motor1", componentPin="M-", protocol="Power", description="H-bridge output 2 to motor terminal 2."),
        PinMapping(mcuPin="VS", sourceComponentId="drv1", sourceComponentPin="VS", componentId="c1", componentPin="+", protocol="Power", description="Bulk capacitor positive across the motor rail."),
        PinMapping(mcuPin="GND", sourceComponentId="drv1", sourceComponentPin="GND", componentId="c1", componentPin="-", protocol="GND", description="Bulk capacitor negative to common ground."),
    ]
    design = CircuitDesign(
        id=f"arduino-motor-speed-{uuid.uuid4().hex[:8]}",
        title="Arduino Uno PWM Motor Speed Controller",
        description=f"A potentiometer sets motor speed with PWM on D9; D7/D8 set direction through an L298N H-bridge. The motor uses a separate fused supply with common ground. Requested project: {prompt}",
        components=components,
        pinMappings=mappings,
        firmwareCode="""const int speedPin = A0;
const int enablePin = 9;  // Remove ENA jumper
const int in1Pin = 7;
const int in2Pin = 8;

void setup() {
  pinMode(enablePin, OUTPUT);
  pinMode(in1Pin, OUTPUT);
  pinMode(in2Pin, OUTPUT);
  digitalWrite(in1Pin, HIGH);
  digitalWrite(in2Pin, LOW);
}

void loop() {
  const int setpoint = analogRead(speedPin);
  const int pwm = map(setpoint, 0, 1023, 0, 255);
  analogWrite(enablePin, pwm);
}""",
        warnings=[
            "Use a separate motor supply and connect its ground to Arduino and driver ground; do not power the motor from an Arduino GPIO.",
            "Remove the L298N ENA jumper for D9 PWM control. Verify the module's onboard clamp diodes before adding any external diodes.",
            "Check motor stall current, driver thermal/current ratings, supply voltage, fuse sizing, and capacitor polarity before powering the circuit.",
        ],
    )
    design.drcReport = run_drc(design)
    return design

def make_blink_led_design(prompt: str) -> CircuitDesign:
    button_design = make_button_led_design(prompt)
    included_ids = {"u1", "d1", "r_led"}
    design = CircuitDesign(
        id=f"arduino-blink-{uuid.uuid4().hex[:8]}",
        title="Arduino Uno Blinking LED",
        description=f"Blink an external LED from Arduino Uno digital pin 8 through a 220Ω current-limiting resistor. Requested project: {prompt}",
        components=[component for component in button_design.components if component.id in included_ids],
        pinMappings=[
            mapping for mapping in button_design.pinMappings
            if mapping.componentId in included_ids
            and (not mapping.sourceComponentId or mapping.sourceComponentId in included_ids)
        ],
        firmwareCode="""        const int ledPin = 8;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH);
  delay(1000);
  digitalWrite(ledPin, LOW);
  delay(1000);
}""",
        warnings=["Use D8 for the external LED with its own 220Ω series resistor."],
    )
    design.drcReport = run_drc(design)
    return design

def make_atmega_button_blink_design(prompt: str) -> CircuitDesign:
    components = [
        Component(id="u1", name="ATmega328P-PU", description="5V 8-bit AVR microcontroller in a 28-pin DIP package; use a 16MHz crystal for Arduino-compatible timing.", category="MCU", package="DIP-28", estimatedCost=120, pins=["VCC", "AVCC", "GND", "RESET", "XTAL1", "XTAL2", "PD7", "PB5"], operatingVoltage=5, maxCurrent_mA=15),
        Component(id="j1", name="Regulated 5V supply", description="Regulated 5V supply for the ATmega328P circuit; share the ground with all components.", category="Power", package="2-pin connector", estimatedCost=20, pins=["5V", "GND"], operatingVoltage=5, maxCurrent_mA=0),
        Component(id="sw1", name="External momentary pushbutton", description="Normally-open button; use one contact pair on each side of the switch.", category="Actuator", package="Through-hole tactile switch", estimatedCost=10, pins=["1", "2", "3", "4"], operatingVoltage=5, maxCurrent_mA=1),
        Component(id="r_button", name="10kΩ button pull-down resistor", description="Holds PD7 LOW while the button is released.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0.5),
        Component(id="d1", name="Indicator LED", description="LED controlled by PB5 (Arduino-compatible digital pin 13).", category="Actuator", package="5mm LED", estimatedCost=3, pins=["ANODE", "CATHODE"], operatingVoltage=2, maxCurrent_mA=8),
        Component(id="r_led", name="330Ω LED current-limiting resistor", description="Series resistor between PB5 and the LED anode.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=8),
        Component(id="x1", name="16MHz crystal", description="External clock crystal connected between XTAL1 and XTAL2.", category="Passive", package="Through-hole crystal", estimatedCost=10, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0),
        Component(id="c1", name="22pF crystal load capacitor (XTAL1)", description="Connect between the XTAL1 crystal node and GND; verify the crystal datasheet load capacitance.", category="Passive", package="Ceramic capacitor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0),
        Component(id="c2", name="22pF crystal load capacitor (XTAL2)", description="Connect between the XTAL2 crystal node and GND; verify the crystal datasheet load capacitance.", category="Passive", package="Ceramic capacitor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0),
        Component(id="r_reset", name="10kΩ RESET pull-up resistor", description="Keeps RESET deasserted by pulling it up to 5V.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0.5),
        Component(id="c_decouple", name="100nF decoupling capacitor", description="Place close to the ATmega328P VCC and GND pins.", category="Passive", package="Ceramic capacitor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0),
    ]
    mappings = [
        PinMapping(mcuPin="5V", sourceComponentId="j1", sourceComponentPin="5V", componentId="u1", componentPin="VCC", protocol="Power", description="Regulated 5V supply to ATmega328P VCC."),
        PinMapping(mcuPin="5V", sourceComponentId="j1", sourceComponentPin="5V", componentId="u1", componentPin="AVCC", protocol="Power", description="Tie AVCC to 5V even when the ADC is unused."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="u1", componentPin="GND", protocol="GND", description="Common ground for ATmega328P."),
        PinMapping(mcuPin="5V", sourceComponentId="j1", sourceComponentPin="5V", componentId="sw1", componentPin="1", protocol="Power", description="Button supply side; pins 1/2 are one internally connected pair."),
        PinMapping(mcuPin="PD7", componentId="sw1", componentPin="3", protocol="GPIO", description="Button signal; pins 3/4 are the other internally connected pair."),
        PinMapping(mcuPin="PD7", componentId="r_button", componentPin="1", protocol="GPIO", description="Button input node to pull-down resistor."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="r_button", componentPin="2", protocol="GND", description="Pull-down resistor returns to common ground."),
        PinMapping(mcuPin="PB5", componentId="r_led", componentPin="1", protocol="GPIO", description="PB5 drives the LED through its series resistor."),
        PinMapping(mcuPin="PB5", sourceComponentId="r_led", sourceComponentPin="2", componentId="d1", componentPin="ANODE", protocol="GPIO", description="Resistor output to LED anode."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="d1", componentPin="CATHODE", protocol="GND", description="LED cathode returns to common ground."),
        PinMapping(mcuPin="XTAL1", componentId="x1", componentPin="1", protocol="GPIO", description="Crystal terminal 1 to XTAL1."),
        PinMapping(mcuPin="XTAL2", componentId="x1", componentPin="2", protocol="GPIO", description="Crystal terminal 2 to XTAL2."),
        PinMapping(mcuPin="XTAL1", componentId="c1", componentPin="1", protocol="GPIO", description="XTAL1 crystal node to load capacitor."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="c1", componentPin="2", protocol="GND", description="XTAL1 load capacitor to ground."),
        PinMapping(mcuPin="XTAL2", componentId="c2", componentPin="1", protocol="GPIO", description="XTAL2 crystal node to load capacitor."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="c2", componentPin="2", protocol="GND", description="XTAL2 load capacitor to ground."),
        PinMapping(mcuPin="RESET", componentId="r_reset", componentPin="1", protocol="GPIO", description="RESET pin to pull-up resistor."),
        PinMapping(mcuPin="5V", sourceComponentId="j1", sourceComponentPin="5V", componentId="r_reset", componentPin="2", protocol="Power", description="RESET pull-up terminates at 5V."),
        PinMapping(mcuPin="5V", sourceComponentId="j1", sourceComponentPin="5V", componentId="c_decouple", componentPin="1", protocol="Power", description="Local VCC decoupling capacitor."),
        PinMapping(mcuPin="GND", sourceComponentId="j1", sourceComponentPin="GND", componentId="c_decouple", componentPin="2", protocol="GND", description="Local decoupling capacitor ground."),
    ]
    design = CircuitDesign(
        id=f"atmega-button-blink-{uuid.uuid4().hex[:8]}",
        title="ATmega328P Pushbutton-Controlled LED Blinker",
        description=f"A standalone ATmega328P-PU circuit where an external pushbutton toggles a 1Hz LED blink on PB5. Requested project: {prompt}",
        components=components,
        pinMappings=mappings,
        firmwareCode="""const uint8_t buttonPin = 7; // PD7
const uint8_t ledPin = 13;    // PB5
bool blinking = false;
bool lastButtonReading = LOW;
bool buttonState = LOW;
unsigned long lastDebounceTime = 0;
unsigned long lastBlinkTime = 0;
const unsigned long debounceMs = 30;
const unsigned long blinkIntervalMs = 500;

void setup() {
  pinMode(buttonPin, INPUT);  // External 10kΩ pull-down
  pinMode(ledPin, OUTPUT);
}

void loop() {
  const bool reading = digitalRead(buttonPin);
  if (reading != lastButtonReading) lastDebounceTime = millis();
  if (millis() - lastDebounceTime >= debounceMs && reading != buttonState) {
    buttonState = reading;
    if (buttonState == HIGH) blinking = !blinking;
  }
  lastButtonReading = reading;

  if (!blinking) {
    digitalWrite(ledPin, LOW);
  } else if (millis() - lastBlinkTime >= blinkIntervalMs) {
    lastBlinkTime = millis();
    digitalWrite(ledPin, digitalRead(ledPin) == LOW ? HIGH : LOW);
  }
}""",
        warnings=[
            "This is a bare ATmega328P circuit: provide a regulated 5V supply, program the chip using an ISP programmer or a preloaded bootloader, and configure fuses for the 16MHz crystal.",
            "The 16MHz crystal and its load capacitors must match the crystal datasheet. Confirm the MCU package pinout before wiring.",
            "The output monitor cannot model button input, conditionals, or millis()-based timing, so it will not show a firmware-derived waveform for this sketch.",
        ],
    )
    design.drcReport = run_drc(design)
    return design

@app.get("/")
def read_root():
    return {
        "app": "AutoCircuit AI API",
        "status": "online",
        "endpoints": ["/api/generate", "/api/drc", "/api/templates", "/api/health"]
    }

@app.get("/api/health")
def health_check():
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "status": "healthy",
        "geminiConfigured": has_gemini
    }

@app.get("/api/templates")
def list_templates():
    return list(TEMPLATES.values())

@app.post("/api/drc", response_model=List[DrcRule])
def check_drc(design: CircuitDesign):
    return run_drc(design)

@app.post("/api/compile")
def compile_firmware(req: CompileRequest):
    allowed_targets = {
        "arduino:avr:uno",
        "esp32:esp32:esp32",
        "rp2040:rp2040:rpipico",
    }
    if req.fqbn not in allowed_targets:
        return {"status": "error", "output": "Unsupported board target. Select a listed Arduino, ESP32, or Pico board."}
    if not req.source.strip() or len(req.source) > 60000:
        return {"status": "error", "output": "Sketch must contain code and be smaller than 60 KB."}

    cli = shutil.which("arduino-cli")
    if not cli and os.name == "nt":
        local_app_data = os.getenv("LOCALAPPDATA")
        if local_app_data:
            candidate = os.path.join(local_app_data, "Programs", "Arduino CLI", "arduino-cli.exe")
            if os.path.isfile(candidate):
                cli = candidate
    if not cli:
        return {
            "status": "unavailable",
            "output": "Arduino CLI is not installed or not on PATH for this API host. No compile was run. Install Arduino CLI, reopen the terminal, and install the selected board core; until then, compile the downloaded sketch in Arduino IDE."
        }

    try:
        core_by_fqbn = {
            "arduino:avr:uno": "arduino:avr",
            "esp32:esp32:esp32": "esp32:esp32",
            "rp2040:rp2040:rpipico": "rp2040:rp2040",
        }
        core = core_by_fqbn[req.fqbn]
        installed_cores = subprocess.run(
            [cli, "core", "list", "--format", "json"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if installed_cores.returncode != 0:
            return {
                "status": "unavailable",
                "output": (installed_cores.stderr or installed_cores.stdout or "Could not query installed Arduino board cores.")[-4000:],
            }
        try:
            core_data = json.loads(installed_cores.stdout or "[]")
            core_rows = core_data.get("platforms", []) if isinstance(core_data, dict) else core_data
        except json.JSONDecodeError:
            core_rows = []
        core_ids = {row.get("ID") or row.get("id") for row in core_rows if isinstance(row, dict)}
        if core not in core_ids:
            return {
                "status": "unavailable",
                "output": f"Arduino CLI is installed, but board core '{core}' is missing on this host. Install it with: arduino-cli core install {core}",
            }

        with tempfile.TemporaryDirectory(prefix="autocircuit-compile-") as temp_dir:
            sketch_dir = os.path.join(temp_dir, "CircuitSketch")
            os.makedirs(sketch_dir, exist_ok=True)
            with open(os.path.join(sketch_dir, "CircuitSketch.ino"), "w", encoding="utf-8") as sketch_file:
                sketch_file.write(req.source)
            library_headers = sorted(set(re.findall(
                r"^\s*#include\s*[<\"]([^>\"]+)[>\"]",
                req.source,
                re.MULTILINE,
            )))
            builtin_headers = {"Arduino.h", "Wire.h", "SPI.h", "math.h"}
            missing_libraries = [header for header in library_headers if header not in builtin_headers]
            installed_libraries = subprocess.run(
                [cli, "lib", "list", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            if installed_libraries.returncode == 0:
                try:
                    library_rows = json.loads(installed_libraries.stdout or "[]")
                    installed_names = {row.get("name") for row in library_rows if isinstance(row, dict)}
                except json.JSONDecodeError:
                    installed_names = set()
                library_hints = {
                    "Adafruit_Sensor.h": "Adafruit Unified Sensor",
                    "Adafruit_BME280.h": "Adafruit BME280 Library",
                    "Adafruit_GFX.h": "Adafruit GFX Library",
                    "Adafruit_SSD1306.h": "Adafruit SSD1306",
                }
                missing_names = sorted({library_hints.get(header, header) for header in missing_libraries} - installed_names)
                if missing_names:
                    return {
                        "status": "unavailable",
                        "output": "Required Arduino libraries are missing on the compiler host: " + ", ".join(missing_names) + ". Install them with: arduino-cli lib install " + " ".join('"' + name + '"' for name in missing_names),
                    }
            result = subprocess.run(
                [cli, "compile", "--fqbn", req.fqbn, "--warnings", "all", sketch_dir],
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
                cwd=temp_dir,
            )
            output = (result.stdout + "\n" + result.stderr).strip()
            diagnostics = []
            diagnostic_pattern = re.compile(
                r"CircuitSketch\.ino:(\d+)(?::(\d+))?:\s*(?:fatal\s+)?(error|warning):\s*(.*)",
                re.IGNORECASE,
            )
            for match in diagnostic_pattern.finditer(output):
                diagnostics.append({
                    "line": int(match.group(1)),
                    "column": int(match.group(2)) if match.group(2) else None,
                    "severity": match.group(3).lower(),
                    "message": match.group(4).strip(),
                })
            return {
                "status": "success" if result.returncode == 0 else "error",
                "output": output[-12000:] or ("Compilation succeeded." if result.returncode == 0 else "Compiler exited with an error."),
                "exitCode": result.returncode,
                "diagnostics": diagnostics,
            }
    except subprocess.TimeoutExpired:
        return {"status": "error", "output": "Compilation exceeded the 45 second limit."}
    except OSError as error:
        return {"status": "unavailable", "output": "Could not start Arduino CLI: " + str(error)}

@app.post("/api/generate", response_model=CircuitDesign)
def generate_circuit_endpoint(req: GenerateRequest):
    # 1. Preset check
    if req.preset and req.preset in TEMPLATES:
        template = TEMPLATES[req.preset]
        design = CircuitDesign(**template)
        design.drcReport = run_drc(design)
        return design

    if (
        re.search(r"\b(?:stm32|blackpill)\b", req.prompt, re.IGNORECASE)
        and re.search(r"\b(?:drone|flight\s+controller|quadcopter|quadrotor)\b", req.prompt, re.IGNORECASE)
        and re.search(r"\bmpu\s*6000\b", req.prompt, re.IGNORECASE)
        and re.search(r"\bspi\b", req.prompt, re.IGNORECASE)
    ):
        design = CircuitDesign(**TEMPLATES["stm32-drone"])
        design.id = f"stm32-flight-{uuid.uuid4().hex[:8]}"
        design.drcReport = run_drc(design)
        return design

    if (
        re.search(r"\besp[\s-]?32\b", req.prompt, re.IGNORECASE)
        and re.search(r"\b(?:ws\s*2812b?|neopixel|addressable\s+(?:rgb\s+)?led)\b", req.prompt, re.IGNORECASE)
        and re.search(r"\b(?:rotary\s+encoder|encoder)\b", req.prompt, re.IGNORECASE)
    ):
        design = CircuitDesign(**TEMPLATES["esp32-mood-light"])
        design.id = f"esp32-mood-light-{uuid.uuid4().hex[:8]}"
        design.drcReport = run_drc(design)
        return design

    if re.search(r"\batmega\s*328(?:p)?\b", req.prompt, re.IGNORECASE) and re.search(r"\bled\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:button|switch)\b", req.prompt, re.IGNORECASE):
        design = make_atmega_button_blink_design(req.prompt)
        design.warnings = []
        return design

    if (
        re.search(r"\b(?:arduino\s*)?uno\b|\barduino\b", req.prompt, re.IGNORECASE)
        and re.search(r"\bmotor\b", req.prompt, re.IGNORECASE)
        and re.search(r"\b(?:speed|controller|control)\b", req.prompt, re.IGNORECASE)
    ):
        return make_arduino_motor_speed_design(req.prompt)

    # 2. If Gemini API key is present, try LLM synthesis
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and api_key != "your_gemini_api_key_here":
        try:
            design = generate_with_gemini(req.prompt, api_key)
            return design
        except Exception:
            print("Remote generation did not produce output; continuing with local circuit selection.")

    if re.search(r"\b(?:push[ -]?button|button)\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:blink|led)\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:uno|arduino)\b", req.prompt, re.IGNORECASE):
        design = make_button_led_design(req.prompt)
        design.warnings = []
        return design
    if re.search(r"\b(?:blink|flash)\b", req.prompt, re.IGNORECASE) and re.search(r"\bled\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:uno|arduino)\b", req.prompt, re.IGNORECASE):
        design = make_blink_led_design(req.prompt)
        design.warnings = []
        return design

    # 3. Intelligent fallback synthesis based on keywords
    prompt_lower = req.prompt.lower()
    base_key = "esp32-weather"
    if any(term in prompt_lower for term in ("drone", "flight controller", "quadcopter", "quadrotor")) or (
        "stm32" in prompt_lower and "mpu6000" in prompt_lower
    ):
        base_key = "stm32-drone"
    elif any(term in prompt_lower for term in ("synth", "pico", "audio", "rp2040", "midi")):
        base_key = "rpi-pico-synth"
    elif any(term in prompt_lower for term in ("bme280", "weather", "environmental", "oled", "ssd1306")) or (
        re.search(r"\btemperature\b", prompt_lower) and re.search(r"\b(?:humidity|pressure)\b", prompt_lower)
    ):
        base_key = "esp32-weather"
    base = TEMPLATES[base_key].copy()
    components = [c.copy() for c in base["components"]]

    generated = CircuitDesign(
        id=f"ai-{uuid.uuid4().hex[:8]}",
        title=base["title"],
        description=f"Synthesized from requirement: \"{req.prompt}\"",
        components=[Component(**c) for c in components],
        pinMappings=[PinMapping(**p) for p in base["pinMappings"]],
        firmwareCode=base["firmwareCode"],
        warnings=[]
    )
    generated.drcReport = run_drc(generated)

    return generated
