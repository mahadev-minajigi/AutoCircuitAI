import os
import json
import uuid
from typing import List, Optional, Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
    maxCurrent_mA: Optional[float] = None

class PinMapping(BaseModel):
    mcuPin: str
    componentId: str
    componentPin: str
    sourceComponentId: Optional[str] = None
    protocol: Literal['GPIO', 'I2C', 'SPI', 'UART', 'ADC', 'PWM', 'Power', 'GND', 'I2S']
    description: str

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
    warnings: List[str] = []
    drcReport: Optional[List[DrcRule]] = None

class GenerateRequest(BaseModel):
    prompt: str
    preset: Optional[str] = None

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
        if comp.id != mcu.id and comp.operatingVoltage and mcu.operatingVoltage:
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
    for mapping in design.pinMappings:
        source = component_by_id.get(mapping.sourceComponentId) if mapping.sourceComponentId else mcu
        target = component_by_id.get(mapping.componentId)
        if not source or not target:
            rules.append(DrcRule(type="Error", message=f"Invalid connection endpoint | {mapping.mcuPin} to {mapping.componentId}.{mapping.componentPin} references a missing component. | Regenerate or correct the mapping."))
        elif mapping.mcuPin not in source.pins or mapping.componentPin not in target.pins:
            rules.append(DrcRule(type="Error", message=f"Invalid pin mapping | {source.name}.{mapping.mcuPin} to {target.name}.{mapping.componentPin} uses an undefined pin. | Confirm the exact board and module pinout."))

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
        mapped_pins.update(m.mcuPin for m in design.pinMappings if m.sourceComponentId == comp.id)
        unmapped = [p for p in comp.pins if p not in mapped_pins]
        if unmapped:
            rules.append(DrcRule(
                type="Warning",
                message=f"{comp.name} has unconnected pins | Pins {', '.join(unmapped)} on {comp.name} are not mapped to the MCU. | Verify if these pins require connections or can safely be left floating."
            ))

    # Power budget analysis
    total_current = sum(c.maxCurrent_mA or 0 for c in design.components)
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

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  if(!bme.begin(0x76, &Wire)) {
    Serial.println("Could not find a valid BME280 sensor!");
  }

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
  }

  display.clearDisplay();
  display.setTextColor(WHITE);
}

void loop() {
  float temp = bme.readTemperature();
  float hum = bme.readHumidity();
  float press = bme.readPressure() / 100.0F;

  display.clearDisplay();
  display.setCursor(0,0);
  display.printf("Temp: %.1f C\\n", temp);
  display.printf("Hum:  %.1f %%\\n", hum);
  display.printf("Pres: %.0f hPa\\n", press);
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

def generate_with_gemini(prompt: str, api_key: str) -> Optional[CircuitDesign]:
    """Generates a structured circuit design using Google's official Gemini API."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        system_instruction = """You are an expert electrical and embedded hardware engineer.
Given a user's natural language circuit description, generate a complete, electrically valid circuit design in strict JSON.
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
      "maxCurrent_mA": float (e.g. 80.0)
    }
  ],
  "pinMappings": [
    {
      "mcuPin": "Pin on MCU (e.g. GPIO21, 3V3, GND)",
      "componentId": "ID of connected component",
      "componentPin": "Pin on component (e.g. SDA)",
      "protocol": "GPIO" | "I2C" | "SPI" | "UART" | "ADC" | "PWM" | "Power" | "GND" | "I2S",
      "description": "Connection purpose"
    }
  ],
  "firmwareCode": "Complete, working Arduino C++ starter sketch (.ino)",
  "warnings": ["Array of engineering notes, constraints, or warnings"]
}
CRITICAL ELECTRICAL RULES:
1. For regulators (e.g., AMS1117-3.3), maxCurrent_mA must be the QUIESCENT current (~5mA), NOT the rated 800mA output capacity.
2. ESP32 typical current is ~240mA (350mA peak WiFi TX). Sensors like BME280 draw ~1mA, OLED displays draw ~20mA.
3. Every design MUST include exactly one MCU, correct power/GND connections, realistic pin numbers, and valid firmware."""

        # Use gemini-2.5-flash-lite which is active and highly responsive
        model_name = 'gemini-2.5-flash-lite'
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        raw_json = response.text
        if not raw_json:
            return None
        data = json.loads(raw_json)
        design = CircuitDesign(**data)
        design.drcReport = run_drc(design)
        return design
    except Exception as e:
        print(f"Gemini API generation error: {e}")
        return None

# ----------------- Endpoints -----------------

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
        llm_design = generate_with_gemini(req.prompt, api_key)
        if llm_design:
            return llm_design

    # 3. Intelligent fallback synthesis based on keywords
    prompt_lower = req.prompt.lower()
    base_key = "esp32-weather"
    if "drone" in prompt_lower or "stm32" in prompt_lower or "flight" in prompt_lower:
        base_key = "stm32-drone"
    elif "synth" in prompt_lower or "pico" in prompt_lower or "audio" in prompt_lower or "rp2040" in prompt_lower:
        base_key = "rpi-pico-synth"

    base = TEMPLATES[base_key].copy()
    components = [c.copy() for c in base["components"]]
    
    if "motor" in prompt_lower:
        components.append({
            "id": "act1",
            "name": "L298N Dual Motor Driver",
            "description": "High-power dual H-bridge motor driver module",
            "category": "Actuator",
            "package": "Module",
            "estimatedCost": 350.0,
            "pins": ["ENA", "IN1", "IN2", "IN3", "IN4", "ENB", "OUT1", "OUT2"],
            "operatingVoltage": 12.0,
            "maxCurrent_mA": 2000.0
        })

    generated = CircuitDesign(
        id=f"ai-{uuid.uuid4().hex[:8]}",
        title=f"AI Generated: {base['title']}",
        description=f"Synthesized from requirement: \"{req.prompt}\"",
        components=[Component(**c) for c in components],
        pinMappings=[PinMapping(**p) for p in base["pinMappings"]],
        firmwareCode=base["firmwareCode"],
        warnings=["Synthesized design via rule-based electrical solver. Verify DRC report before prototyping."]
    )
    generated.drcReport = run_drc(generated)
    return generated
