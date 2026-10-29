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
        has_logic_signal = any(
            mapping.componentId == comp.id and mapping.protocol in {'GPIO', 'I2C', 'SPI', 'UART', 'ADC', 'PWM', 'I2S'}
            for mapping in design.pinMappings
        )
        if comp.id != mcu.id and has_logic_signal and comp.operatingVoltage and mcu.operatingVoltage:
            if comp.operatingVoltage > mcu.operatingVoltage:
                rules.append(DrcRule(
                    type="Warning",
                    message=f"Voltage mismatch on {comp.name} | {comp.name} operates at {comp.operatingVoltage}V but {mcu.name} logic level is {mcu.operatingVoltage}V. | Use a level shifter or choose a {mcu.operatingVoltage}V-compatible variant."
                ))
            else:
                rules.append(DrcRule(
                    type="Pass",
                    message=f"{comp.name} voltage compatible | {comp.name} ({comp.operatingVoltage}V) is compatible with {mcu.name} ({mcu.operatingVoltage}V). | No change required."
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
    "stm32-drone": {
        "id": "stm32-drone-v1",
        "title": "STM32 Quadcopter Flight Controller",
        "description": "High-performance STM32F401 based flight controller with MPU6050 6-DOF IMU and 4x PWM outputs for ESC control.",
        "components": [
            {"id": "mcu1", "name": "STM32F401CCU6", "description": "ARM Cortex-M4 84MHz Microcontroller (BlackPill)", "category": "MCU", "package": "UFQFPN-48", "estimatedCost": 280.00, "pins": ["3V3", "GND", "PB6", "PB7", "PA0", "PA1", "PA2", "PA3"], "operatingVoltage": 3.3, "maxCurrent_mA": 100},
            {"id": "s1", "name": "MPU6050", "description": "6-Axis Gyroscope & Accelerometer Module", "category": "Sensor", "package": "QFN-24", "estimatedCost": 150.00, "pins": ["VCC", "GND", "SDA", "SCL", "INT"], "operatingVoltage": 3.3, "maxCurrent_mA": 4},
            {"id": "p1", "name": "Mini 5V/3A BEC", "description": "Step-down Switching Voltage Regulator", "category": "Power", "package": "Module", "estimatedCost": 120.00, "pins": ["VIN", "VOUT", "GND"], "operatingVoltage": 5.0, "maxCurrent_mA": 3000}
        ],
        "pinMappings": [
            {"mcuPin": "5V", "componentId": "p1", "componentPin": "VIN", "protocol": "Power", "description": "USB 5V input to AMS1117"},
            {"mcuPin": "GND", "componentId": "p1", "componentPin": "GND", "protocol": "GND", "description": "Common system ground"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "s1", "componentPin": "VCC", "protocol": "Power", "description": "Regulated 3.3V to BME280"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "d1", "componentPin": "VCC", "protocol": "Power", "description": "Regulated 3.3V to OLED"},
            {"mcuPin": "GPIO21", "componentId": "s1", "componentPin": "SDA", "protocol": "I2C", "description": "I2C data"},
            {"mcuPin": "GPIO22", "componentId": "s1", "componentPin": "SCL", "protocol": "I2C", "description": "I2C clock"},
            {"mcuPin": "GPIO21", "componentId": "d1", "componentPin": "SDA", "protocol": "I2C", "description": "Shared I2C data"},
            {"mcuPin": "GPIO22", "componentId": "d1", "componentPin": "SCL", "protocol": "I2C", "description": "Shared I2C clock"},
            {"mcuPin": "GPIO21", "componentId": "r1", "componentPin": "2", "protocol": "I2C", "description": "SDA 4.7k pull-up branch"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "r1", "componentPin": "1", "protocol": "Power", "description": "SDA pull-up to 3.3V"},
            {"mcuPin": "GPIO22", "componentId": "r2", "componentPin": "2", "protocol": "I2C", "description": "SCL 4.7k pull-up branch"},
            {"mcuPin": "VOUT", "sourceComponentId": "p1", "componentId": "r2", "componentPin": "1", "protocol": "Power", "description": "SCL pull-up to 3.3V"}
        ],
        "firmwareCode": """#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
  // Initialize MPU6050 & Timer PWM for ESCs
}

void loop() {
  // Flight loop logic
  delay(10);
}""",
        "warnings": ["Ensure 5V BEC regulator is used if powering motors from battery."]
    },
    "rpi-pico-synth": {
        "id": "rpi-pico-synth-v1",
        "title": "RP2040 Polyphonic Audio Synthesizer",
        "description": "Dual-core ARM Cortex-M0+ audio synth engine using I2S DAC output and rotary controls.",
        "components": [
            {"id": "mcu1", "name": "Raspberry Pi Pico (RP2040)", "description": "Dual Cortex-M0+ 133MHz Microcontroller", "category": "MCU", "package": "QFN-56", "estimatedCost": 320.00, "pins": ["3V3", "GND", "GP26", "GP27", "GP28", "GP9", "GP10", "GP11"], "operatingVoltage": 3.3, "maxCurrent_mA": 120},
            {"id": "a1", "name": "MAX98357A", "description": "I2S 3.2W Class-D Mono Amplifier", "category": "Actuator", "package": "WLP-9", "estimatedCost": 190.00, "pins": ["VIN", "GND", "BCLK", "LRC", "DIN"], "operatingVoltage": 3.3, "maxCurrent_mA": 500}
        ],
        "pinMappings": [
            {"mcuPin": "3V3", "componentId": "a1", "componentPin": "VIN", "protocol": "Power", "description": "Power input"},
            {"mcuPin": "GND", "componentId": "a1", "componentPin": "GND", "protocol": "GND", "description": "Ground"},
            {"mcuPin": "GP9", "componentId": "a1", "componentPin": "BCLK", "protocol": "I2S", "description": "Bit Clock"},
            {"mcuPin": "GP10", "componentId": "a1", "componentPin": "LRC", "protocol": "I2S", "description": "Word Select"},
            {"mcuPin": "GP11", "componentId": "a1", "componentPin": "DIN", "protocol": "I2S", "description": "Audio Data"}
        ],
        "firmwareCode": """#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  // Configure I2S interface on GP9, GP10, GP11
}

void loop() {
  // Waveform synthesis
}""",
        "warnings": ["Use a clean 3.3V or 5V rail to prevent audio popping and noise."]
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
                ensure_design_support_parts(design)
                validate_generated_design(design)
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
        print(f"Gemini API generation error: {e}")
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

    if re.search(r"\bwi[\s-]?fi\b", prompt, re.IGNORECASE) and not re.search(r"\b(?:wi[\s-]?fi|esp[-\s]?now|wifi)\b", design.firmwareCode, re.IGNORECASE):
        warnings.append("Prompt coverage: Wi-Fi is requested, but the firmware does not clearly configure or use Wi-Fi.")
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
        Component(id="u1", name="Arduino Uno R3", description="5V microcontroller board with digital pins D7 and D13.", category="MCU", package="Dev board", estimatedCost=600, pins=["5V", "GND", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "A0", "A1", "A2", "A3", "A4", "A5"], operatingVoltage=5, maxCurrent_mA=50),
        Component(id="sw1", name="4-pin tactile pushbutton", description="Momentary normally-open switch. Pins 1/2 form one side; pins 3/4 form the opposite side. Place across the breadboard trench.", category="Actuator", package="Through-hole tactile switch", estimatedCost=10, pins=["1", "2", "3", "4"], operatingVoltage=5, maxCurrent_mA=1),
        Component(id="r_pd", name="10kΩ button pull-down resistor", description="Holds D7 LOW while released; connects the button output node to GND.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=0.5),
        Component(id="d1", name="Indicator LED", description="Anode connects to D13 through a 220Ω series resistor; cathode connects to GND.", category="Actuator", package="5mm LED", estimatedCost=3, pins=["ANODE", "CATHODE"], operatingVoltage=2, maxCurrent_mA=10),
        Component(id="r_led", name="220Ω LED current-limiting resistor", description="Series resistor from Arduino D13 to LED anode.", category="Passive", package="Axial resistor", estimatedCost=2, pins=["1", "2"], operatingVoltage=5, maxCurrent_mA=10),
    ]
    mappings = [
        PinMapping(mcuPin="5V", componentId="sw1", componentPin="1", protocol="Power", description="Switch supply side; button pins 1/2 are internally common."),
        PinMapping(mcuPin="D7", componentId="sw1", componentPin="3", protocol="GPIO", description="Button output side; pins 3/4 are internally common."),
        PinMapping(mcuPin="D7", componentId="r_pd", componentPin="1", protocol="GPIO", description="Pull-down connects to the same D7/button output node."),
        PinMapping(mcuPin="GND", componentId="r_pd", componentPin="2", protocol="GND", description="10kΩ pull-down returns to ground."),
        PinMapping(mcuPin="D13", componentId="r_led", componentPin="1", protocol="GPIO", description="D13 drives LED through the series resistor."),
        PinMapping(mcuPin="D13", sourceComponentId="r_led", sourceComponentPin="2", componentId="d1", componentPin="ANODE", protocol="GPIO", description="LED anode connects to resistor terminal 2; terminal 1 connects to Arduino D13."),
        PinMapping(mcuPin="GND", componentId="d1", componentPin="CATHODE", protocol="GND", description="LED cathode returns to GND for active-HIGH operation."),
    ]
    design = CircuitDesign(
        id=f"button-led-{uuid.uuid4().hex[:8]}",
        title="Arduino Uno Pushbutton LED",
        description=f"Press a pushbutton to light an LED. D7 reads the button through a 10kΩ pull-down; D13 drives the LED through a 220Ω current-limiting resistor. Requested project: {prompt}",
        components=components,
        pinMappings=mappings,
        firmwareCode="""const int buttonPin = 7;
const int ledPin = 13;

void setup() {
  pinMode(buttonPin, INPUT);  // External 10kΩ pull-down to GND
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
}

void loop() {
  const bool pressed = digitalRead(buttonPin) == HIGH;
  digitalWrite(ledPin, pressed ? HIGH : LOW);
}""",
        warnings=["External 10kΩ pull-down is required with INPUT mode. Identify the switch's internally connected pin pairs and place it across the breadboard trench."],
    )
    design.drcReport = run_drc(design)
    return design

def make_blink_led_design(prompt: str) -> CircuitDesign:
    button_design = make_button_led_design(prompt)
    included_ids = {"u1", "d1", "r_led"}
    design = CircuitDesign(
        id=f"arduino-blink-{uuid.uuid4().hex[:8]}",
        title="Arduino Uno Blinking LED",
        description=f"Blink an LED from Arduino Uno digital pin 13 through a 220Ω current-limiting resistor. Requested project: {prompt}",
        components=[component for component in button_design.components if component.id in included_ids],
        pinMappings=[
            mapping for mapping in button_design.pinMappings
            if mapping.componentId in included_ids
            and (not mapping.sourceComponentId or mapping.sourceComponentId in included_ids)
        ],
        firmwareCode="""const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH);
  delay(1000);
  digitalWrite(ledPin, LOW);
  delay(1000);
}""",
        warnings=["Use the 220Ω series resistor between D13 and the LED anode."],
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

    # 2. If Gemini API key is present, try LLM synthesis
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and api_key != "your_gemini_api_key_here":
        try:
            design = generate_with_gemini(req.prompt, api_key)
            design.warnings.extend(prompt_coverage_warnings(req.prompt, design))
            return design
        except Exception as error:
            raise HTTPException(
                status_code=502,
                detail="Gemini could not return a structurally valid design. Review the prompt and retry; no fallback circuit was substituted.",
            ) from error

    if re.search(r"\b(?:push[ -]?button|button)\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:blink|led)\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:uno|arduino)\b", req.prompt, re.IGNORECASE):
        design = make_button_led_design(req.prompt)
        design.warnings.extend(prompt_coverage_warnings(req.prompt, design))
        return design
    if re.search(r"\b(?:blink|flash)\b", req.prompt, re.IGNORECASE) and re.search(r"\bled\b", req.prompt, re.IGNORECASE) and re.search(r"\b(?:uno|arduino)\b", req.prompt, re.IGNORECASE):
        design = make_blink_led_design(req.prompt)
        design.warnings.extend(prompt_coverage_warnings(req.prompt, design))
        return design

    # 3. Intelligent fallback synthesis based on keywords
    prompt_lower = req.prompt.lower()
    base_key = "esp32-weather"
    supported_match = True
    if any(term in prompt_lower for term in ("drone", "stm32", "flight")):
        base_key = "stm32-drone"
    elif any(term in prompt_lower for term in ("synth", "pico", "audio", "rp2040")):
        base_key = "rpi-pico-synth"
    elif any(term in prompt_lower for term in ("bme280", "weather", "temperature", "humidity", "pressure", "oled", "ssd1306")):
        base_key = "esp32-weather"
    else:
        supported_match = False

    base = TEMPLATES[base_key].copy()
    components = [c.copy() for c in base["components"]]

    generated = CircuitDesign(
        id=f"ai-{uuid.uuid4().hex[:8]}",
        title=f"AI Generated: {base['title']}",
        description=f"Synthesized from requirement: \"{req.prompt}\"",
        components=[Component(**c) for c in components],
        pinMappings=[PinMapping(**p) for p in base["pinMappings"]],
        firmwareCode=base["firmwareCode"],
        warnings=(
            ["Template-matched circuit generated for this supported request. Verify the DRC report before prototyping."]
            if supported_match else
            [f"This request could not be matched to a validated local circuit template. The displayed {base['title']} design is only a starting point and may not meet the prompt. Configure the AI backend for custom circuit synthesis."]
        )
    )
    generated.drcReport = run_drc(generated)
    generated.warnings.extend(prompt_coverage_warnings(req.prompt, generated))

    return generated
