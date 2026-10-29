import type { CircuitDesign } from '../types/circuit';

export const templates: Record<string, CircuitDesign> = {
  'esp32-weather': {
    id: 't-esp32-weather',
    title: 'ESP32 IoT Weather Station',
    description: 'A temperature, humidity, and pressure monitoring system using ESP32, BME280 sensor, and SSD1306 0.96" OLED display over shared I2C bus.',
    components: [
      {
        id: 'u1',
        name: 'ESP32-WROOM-32',
        description: 'Wi-Fi & Bluetooth Dual-Core Microcontroller Development Board',
        category: 'MCU',
        package: 'NodeMCU-30Pin / SMD',
        estimatedCost: 350.00,
        pins: ['5V', '3V3', 'GND', 'EN', 'IO21', 'IO22', 'IO34', 'IO35', 'IO2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 240, // 240mA average, 350mA peak (WiFi TX)
        pinDescriptions: {
          '3V3': 'Regulated 3.3V DC Power Output (max 500mA)',
          'GND': 'System Common Ground (0V Reference)',
          'IO21': 'Hardware I2C Data Line (SDA)',
          'IO22': 'Hardware I2C Clock Line (SCL)',
          'EN': 'Active-high Chip Enable / Reset Pin',
          'IO2': 'Boot mode & on-board Blue LED pin'
        }
      },
      {
        id: 's1',
        name: 'BME280 Module',
        description: 'High-Precision Digital Temperature, Humidity & Barometric Pressure Sensor',
        category: 'Sensor',
        package: 'LGA-8 Module',
        estimatedCost: 420.00,
        pins: ['VCC', 'GND', 'SCL', 'SDA', 'SDO'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 1, // 1mA active, 0.1µA sleep
        pinDescriptions: {
          'VCC': 'Power Supply Input (3.3V recommended)',
          'GND': 'Circuit Ground',
          'SCL': 'I2C Serial Clock input from MCU IO22',
          'SDA': 'I2C Serial Data bidirectional line to MCU IO21',
          'SDO': 'I2C Address Select Pin (GND=0x76, VCC=0x77)'
        }
      },
      {
        id: 'd1',
        name: 'SSD1306 OLED 0.96"',
        description: '128x64 Monochrome Graphic OLED Display with I2C Interface (Address 0x3C)',
        category: 'Actuator',
        package: '4-Pin Module',
        estimatedCost: 280.00,
        pins: ['VCC', 'GND', 'SCL', 'SDA'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 20, // 20mA typical, 30mA max
        pinDescriptions: {
          'VCC': 'Display Logic & Driver Power (3.3V)',
          'GND': 'Display Ground',
          'SCL': 'I2C Serial Clock Input (Shared with BME280)',
          'SDA': 'I2C Serial Data Input/Output (Shared with BME280)'
        }
      },
      {
        id: 'vr1',
        name: 'AMS1117-3.3V Regulator',
        description: 'Low-Dropout 3.3V Voltage Regulator IC (Quiescent 5mA)',
        category: 'Power',
        package: 'SOT-223',
        estimatedCost: 25.00,
        pins: ['VIN', 'VOUT', 'GND'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 5
      },
      {
        id: 'r_sda',
        name: '4.7kΩ Pull-Up Resistor (SDA)',
        description: '4.7kΩ I2C bus pull-up resistor to 3.3V for SDA line',
        category: 'Passive',
        package: '0805 / Axial',
        estimatedCost: 2.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 1
      },
      {
        id: 'r_scl',
        name: '4.7kΩ Pull-Up Resistor (SCL)',
        description: '4.7kΩ I2C bus pull-up resistor to 3.3V for SCL line',
        category: 'Passive',
        package: '0805 / Axial',
        estimatedCost: 2.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 1
      },
      {
        id: 'r_sdo',
        name: '10kΩ Pull-Down Resistor (BME280 SDO)',
        description: '10kΩ address strap holding BME280 SDO low for I2C address 0x76',
        category: 'Passive',
        package: '0805 / Axial',
        estimatedCost: 2.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 0.33
      },
      {
        id: 'c_esp',
        name: '100nF Decoupling Capacitor (ESP32)',
        description: 'Ceramic decoupling capacitor within 5mm of ESP32 3V3 pin',
        category: 'Passive',
        package: '0805 MLCC',
        estimatedCost: 3.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 0
      },
      {
        id: 'c_bme',
        name: '100nF Decoupling Capacitor (BME280)',
        description: 'Ceramic decoupling capacitor within 5mm of BME280 VCC pin',
        category: 'Passive',
        package: '0805 MLCC',
        estimatedCost: 3.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 0
      },
      {
        id: 'c_oled',
        name: '100nF Decoupling Capacitor (OLED)',
        description: 'Ceramic decoupling capacitor within 5mm of OLED VCC pin',
        category: 'Passive',
        package: '0805 MLCC',
        estimatedCost: 3.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 0
      },
      {
        id: 'c_reg_in',
        name: '10µF Input Capacitor (AMS1117)',
        description: 'Bulk input capacitor for AMS1117 regulator',
        category: 'Passive',
        package: 'Radial',
        estimatedCost: 5.00,
        pins: ['1', '2'],
        operatingVoltage: 5.0,
        maxCurrent_mA: 0
      },
      {
        id: 'c_reg_out',
        name: '10µF Output Capacitor (AMS1117)',
        description: 'Bulk output capacitor for AMS1117 3.3V output rail',
        category: 'Passive',
        package: 'Radial',
        estimatedCost: 5.00,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 0
      }
    ],
    pinMappings: [
      { mcuPin: '5V', componentId: 'vr1', componentPin: 'VIN', protocol: 'Power', description: 'Regulated USB 5V input to AMS1117 VIN', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'vr1', componentPin: 'GND', protocol: 'GND', description: 'Common ground for regulator and system', wireColor: '#1e293b' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: 'Regulated 3.3V rail to BME280', wireColor: '#ef4444' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'd1', componentPin: 'VCC', protocol: 'Power', description: 'Regulated 3.3V rail to OLED', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground connection to BME280', wireColor: '#1e293b' },
      { mcuPin: 'GND', componentId: 'd1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground connection to OLED', wireColor: '#1e293b' },
      { mcuPin: 'SDO', sourceComponentId: 's1', componentId: 'r_sdo', componentPin: '1', protocol: 'GND', description: 'BME280 SDO address strap into 10kΩ pull-down', wireColor: '#64748b' },
      { mcuPin: 'GND', componentId: 'r_sdo', componentPin: '2', protocol: 'GND', description: '10kΩ pull-down terminates at ground', wireColor: '#1e293b' },
      { mcuPin: 'IO21', componentId: 's1', componentPin: 'SDA', protocol: 'I2C', description: 'Shared I2C Data Line (SDA)', wireColor: '#3b82f6' },
      { mcuPin: 'IO21', componentId: 'd1', componentPin: 'SDA', protocol: 'I2C', description: 'Shared I2C Data Line (SDA)', wireColor: '#3b82f6' },
      { mcuPin: 'IO22', componentId: 's1', componentPin: 'SCL', protocol: 'I2C', description: 'Shared I2C Clock Line (SCL)', wireColor: '#eab308' },
      { mcuPin: 'IO22', componentId: 'd1', componentPin: 'SCL', protocol: 'I2C', description: 'Shared I2C Clock Line (SCL)', wireColor: '#eab308' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'r_sda', componentPin: '1', protocol: 'Power', description: '4.7kΩ SDA pull-up to regulated 3.3V', wireColor: '#ef4444' },
      { mcuPin: 'IO21', componentId: 'r_sda', componentPin: '2', protocol: 'I2C', description: '4.7kΩ SDA pull-up branch to shared SDA net', wireColor: '#3b82f6' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'r_scl', componentPin: '1', protocol: 'Power', description: '4.7kΩ SCL pull-up to regulated 3.3V', wireColor: '#ef4444' },
      { mcuPin: 'IO22', componentId: 'r_scl', componentPin: '2', protocol: 'I2C', description: '4.7kΩ SCL pull-up branch to shared SCL net', wireColor: '#eab308' },
      { mcuPin: '3V3', sourceComponentId: 'u1', componentId: 'c_esp', componentPin: '1', protocol: 'Power', description: 'ESP32 local 100nF bypass capacitor to 3V3', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_esp', componentPin: '2', protocol: 'GND', description: 'ESP32 bypass capacitor return to ground', wireColor: '#1e293b' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'c_bme', componentPin: '1', protocol: 'Power', description: 'BME280 local 100nF bypass capacitor to 3.3V', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_bme', componentPin: '2', protocol: 'GND', description: 'BME280 bypass capacitor return to ground', wireColor: '#1e293b' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'c_oled', componentPin: '1', protocol: 'Power', description: 'OLED local 100nF bypass capacitor to 3.3V', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_oled', componentPin: '2', protocol: 'GND', description: 'OLED bypass capacitor return to ground', wireColor: '#1e293b' },
      { mcuPin: '5V', componentId: 'c_reg_in', componentPin: '1', protocol: 'Power', description: 'AMS1117 input 10µF bulk capacitor from 5V input', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_reg_in', componentPin: '2', protocol: 'GND', description: 'AMS1117 input capacitor ground', wireColor: '#1e293b' },
      { mcuPin: 'VOUT', sourceComponentId: 'vr1', componentId: 'c_reg_out', componentPin: '1', protocol: 'Power', description: 'AMS1117 output 10µF bulk capacitor from 3.3V output', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_reg_out', componentPin: '2', protocol: 'GND', description: 'AMS1117 output capacitor ground', wireColor: '#1e293b' }
    ],
    labGuide: {
      voltageSupplyNote: 'ESP32 development boards operate natively at 3.3V logic. Never connect 5V to the IO21/IO22 pins directly as this will damage the ESP32 silicon.',
      prerequisites: [
        'Half-size or Full-size Solderless Breadboard',
        'ESP32 NodeMCU development board + Micro-USB cable',
        'BME280 Sensor Module (I2C default address: 0x76)',
        'SSD1306 0.96" OLED Module (I2C default address: 0x3C)',
        '8x Male-to-Male Jumper Wires (Red for 3.3V, Black for GND, Blue for SDA, Yellow for SCL)',
        'Arduino IDE with "esp32 by Espressif", "Adafruit BME280", and "Adafruit SSD1306" libraries installed'
      ],
      breadboardWiringSteps: [
        {
          stepNumber: 1,
          title: 'Mount the ESP32 onto the Breadboard',
          instruction: 'Place the ESP32 development board across the center dividing trench of the breadboard so that pins on both sides occupy independent row tracks. Press down firmly and evenly.',
          caution: 'Ensure the USB port faces outward towards the edge of your desk for easy cable insertion.'
        },
        {
          stepNumber: 2,
          title: 'Establish Power & Ground Bus Rails',
          instruction: 'Connect a RED jumper wire from the ESP32 "3V3" pin to the red (+) power rail of the breadboard. Connect a BLACK jumper wire from the ESP32 "GND" pin to the blue/black (-) ground rail.',
          caution: 'Do NOT use the "VIN" or "5V" pin of the ESP32 for the sensor power, as 5V will destroy the BME280.'
        },
        {
          stepNumber: 3,
          title: 'Wire the BME280 Sensor Module',
          instruction: 'Insert the BME280 module into unused rows. Connect BME280 VCC -> (+) Red Rail. Connect BME280 GND -> (-) Black Rail. Connect BME280 SDA -> ESP32 IO21 (Blue wire). Connect BME280 SCL -> ESP32 IO22 (Yellow wire).'
        },
        {
          stepNumber: 4,
          title: 'Wire the SSD1306 OLED Display (Shared I2C Bus)',
          instruction: 'Place the OLED module onto the breadboard. Connect OLED VCC -> (+) Red Rail. Connect OLED GND -> (-) Black Rail. Connect OLED SDA -> ESP32 IO21 (same SDA line as BME280). Connect OLED SCL -> ESP32 IO22 (same SCL line as BME280).'
        },
        {
          stepNumber: 5,
          title: 'Double-Check Polarities Before Plugging In',
          instruction: 'Inspect each module to confirm VCC and GND are not reversed. Connecting VCC to GND will cause an immediate short circuit and can permanently burn the sensor module.'
        }
      ],
      testingProcedure: [
        'Connect the ESP32 to your PC via USB cable. Select "ESP32 Dev Module" and correct COM Port in Arduino IDE.',
        'Upload the generated sketch and open Serial Monitor at 115200 baud. At startup it scans the I2C bus and prints detected addresses; expect 0x3C/0x3D for OLED and 0x76/0x77 for BME280.',
        'Upload the generated starter firmware sketch from the "Firmware" tab.',
        'Open the Serial Monitor set at 115200 baud rate. Verify sensor readings appear in the terminal and on the OLED.'
      ],
      troubleshootingTips: [
        'Display stays black: Verify OLED I2C address is 0x3C in code; on some cheaper clones the address is 0x3D.',
        'Sensor shows "Could not find valid BME280": Check if your module uses address 0x77 instead of 0x76. Change bme.begin(0x76) to bme.begin(0x77).',
        'Garbled text or resets: ESP32 Wi-Fi bursts draw up to 240mA (350mA peak TX). Ensure your USB cable is capable of data + power (avoid charging-only thin cables).',
        'Custom PCB vs Breakout Modules: Commercial breakout modules usually include onboard 4.7kΩ/10kΩ pull-ups. If fabricating a custom PCB with raw discrete ICs (QFN/LGA packages), discrete 4.7kΩ external pull-ups to 3.3V on GPIO21 (SDA) and GPIO22 (SCL) are strictly mandatory.'
      ]
    },
    firmwareCode: `#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define I2C_SDA 21
#define I2C_SCL 22

Adafruit_BME280 bme;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void scanI2CBus() {
  uint8_t found = 0;
  Serial.println(F("I2C scan results:"));
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("  0x"));
      if (address < 16) Serial.print('0');
      Serial.print(address, HEX);
      if (address == 0x3C || address == 0x3D) Serial.print(F(" (OLED candidate)"));
      if (address == 0x76 || address == 0x77) Serial.print(F(" (BME280 candidate)"));
      Serial.println();
      ++found;
    }
  }
  if (found == 0) Serial.println(F("No devices found; check power, ground, SDA=GPIO21, SCL=GPIO22."));
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
  delay(100);
  Wire.begin(I2C_SDA, I2C_SCL);
  scanI2CBus();
  
  const uint8_t oledAddress = detectOledAddress();
  if (oledAddress == 0) {
    Serial.println(F("OLED not found at I2C address 0x3C or 0x3D"));
    while (true) delay(1000);
  }
  if (!display.begin(SSD1306_SWITCHCAPVCC, oledAddress)) {
    Serial.println(F("SSD1306 buffer allocation failed"));
    while (true) delay(1000);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.display();

  // BME280 boards commonly use either address, depending on the SDO strap.
  if (!bme.begin(0x76, &Wire) && !bme.begin(0x77, &Wire)) {
    Serial.println(F("BME280 init failed; check wiring and address 0x76/0x77"));
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println(F("BME280 not found"));
    display.println(F("Check 0x76/0x77"));
    display.display();
    while (true) delay(1000);
  }

  display.setCursor(10, 20);
  display.println(F("AutoCircuit AI"));
  display.setCursor(10, 35);
  display.println(F("Weather Station"));
  display.display();
  delay(1500);
}

void loop() {
  float temp = bme.readTemperature();
  float hum = bme.readHumidity();
  float press = bme.readPressure() / 100.0F;

  if (isnan(temp) || isnan(hum) || isnan(press)) {
    Serial.println(F("BME280 read failed; check sensor wiring and power."));
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println(F("Sensor read error"));
    display.println(F("Check BME280"));
    display.display();
    delay(2000);
    return;
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(F("--- IoT Weather ---"));
  
  display.setCursor(0, 18);
  display.print(F("Temp: "));
  display.print(temp, 1);
  display.println(F(" C"));
  
  display.setCursor(0, 32);
  display.print(F("Hum:  "));
  display.print(hum, 1);
  display.println(F(" %"));
  
  display.setCursor(0, 46);
  display.print(F("Pres: "));
  display.print(press, 0);
  display.println(F(" hPa"));
  
  display.display();
  delay(2000);
}`,
    warnings: ['BME280 requires 3.3V logic (ESP32 is natively 3.3V). Do not connect 5V to sensor.']
  },

  'stm32-drone': {
    id: 't-stm32-drone',
    title: 'STM32 Drone Flight Controller',
    description: 'STM32F401 flight-controller hardware with an MPU6000 connected over SPI and four timer PWM outputs connected to brushless-motor ESC signal inputs.',
    components: [
      {
        id: 'u1',
        name: 'STM32F401CCU6 (BlackPill)',
        description: 'ARM Cortex-M4 84MHz 32-bit Microcontroller Board with FPU',
        category: 'MCU',
        package: 'UFQFPN-48 Module',
        estimatedCost: 320.00,
        pins: ['5V', '3V3', 'GND', 'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB6', 'PB7'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 100,
        pinDescriptions: {
          '3V3': '3.3V Output from on-board LDO regulator',
          '5V': '5V input from USB or regulated 5V BEC output',
          'GND': 'System Ground',
          'PA4': 'SPI1 NSS / Hardware Chip Select Pin',
          'PA5': 'SPI1 SCK (Serial Clock up to 42MHz)',
          'PA6': 'SPI1 MISO (Master In Slave Out)',
          'PA7': 'SPI1 MOSI (Master Out Slave In)',
          'PA0': 'TIM2_CH1 PWM output to ESC 1 signal input',
          'PA1': 'TIM2_CH2 PWM output to ESC 2 signal input',
          'PA2': 'TIM2_CH3 PWM output to ESC 3 signal input',
          'PA3': 'TIM2_CH4 PWM output to ESC 4 signal input',
          'PB6': 'I2C1 SCL (Auxiliary Barometer / Compass bus)',
          'PB7': 'I2C1 SDA (Auxiliary Barometer / Compass bus)'
        }
      },
      {
        id: 's1',
        name: 'MPU6000 IMU Module',
        description: '6-Axis Gyroscope and Accelerometer with low-noise SPI interface for high-rate PID flight loops',
        category: 'Sensor',
        package: 'QFN-24 Module',
        estimatedCost: 520.00,
        pins: ['VCC', 'GND', 'CS', 'SCLK', 'MISO', 'MOSI'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 4,
        pinDescriptions: {
          'VCC': '3.3V Power input (must be clean and decoupled)',
          'GND': 'Ground connection',
          'CS': 'Active-low Chip Select line to MCU PA4',
          'SCLK': 'SPI Clock signal from MCU PA5',
          'MISO': 'SPI Data output to MCU PA6',
          'MOSI': 'SPI Data input from MCU PA7'
        }
      },
      {
        id: 'p1',
        name: 'Mini 5V/3A BEC',
        description: 'Step-Down Switching Voltage Regulator (2S-6S LiPo to 5V)',
        category: 'Power',
        package: 'Module',
        estimatedCost: 120.00,
        pins: ['VIN', 'VOUT', 'GND'],
        operatingVoltage: 5.0,
        pinDescriptions: {
          'VIN': 'Direct Battery Voltage (7.4V - 25.2V from LiPo)',
          'VOUT': 'Regulated 5.0V output to MCU 5V pin / ESC servo rail',
          'GND': 'Common Ground'
        }
      },
      {
        id: 'battery1',
        name: '3S-4S LiPo battery input',
        description: 'Flight battery supply for the BEC and four ESC power inputs; battery voltage depends on the selected cell count.',
        category: 'Power',
        package: 'Battery connector',
        estimatedCost: 1800,
        pins: ['+', '-'],
        operatingVoltage: 14.8,
        maxCurrent_mA: 0,
      },
      {
        id: 'c1',
        name: '100nF IMU decoupling capacitor',
        description: 'Ceramic bypass capacitor fitted across IMU supply and ground',
        category: 'Passive',
        package: '0603 capacitor',
        estimatedCost: 5,
        pins: ['1', '2'],
        operatingVoltage: 3.3
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `esc${index + 1}`,
        name: `Brushless ESC ${index + 1} (PWM input)`,
        description: 'Electronic speed controller; receives a low-voltage PWM command and battery power, then commutates its connected brushless motor.',
        category: 'Actuator' as const,
        package: 'ESC module',
        estimatedCost: 500,
        pins: ['SIGNAL', 'GND', 'VBAT', 'MOTOR_U', 'MOTOR_V', 'MOTOR_W'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 20,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `motor${index + 1}`,
        name: `Brushless motor ${index + 1}`,
        description: 'Three-phase quadcopter motor powered by its matching ESC; never connect motor phases to MCU pins.',
        category: 'Actuator' as const,
        package: 'Brushless motor',
        estimatedCost: 900,
        pins: ['PHASE_U', 'PHASE_V', 'PHASE_W'],
        operatingVoltage: 14.8,
      }))
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: 'Clean 3.3V power to IMU sensor', wireColor: '#ef4444' },
      { mcuPin: '3V3', componentId: 'c1', componentPin: '1', protocol: 'Power', description: 'IMU supply bypass capacitor', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c1', componentPin: '2', protocol: 'GND', description: 'IMU bypass capacitor ground', wireColor: '#1e293b' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common ground for sensor & MCU', wireColor: '#1e293b' },
      { mcuPin: 'VOUT', sourceComponentId: 'p1', componentId: 'u1', componentPin: '5V', protocol: 'Power', description: 'Regulated 5V BEC output to BlackPill 5V input', wireColor: '#ef4444' },
      { mcuPin: 'GND', sourceComponentId: 'p1', componentId: 'u1', componentPin: 'GND', protocol: 'GND', description: 'BEC common ground to BlackPill', wireColor: '#1e293b' },
      { mcuPin: 'PA4', componentId: 's1', componentPin: 'CS', protocol: 'SPI', description: 'SPI1 Chip Select (CS) - Active Low', wireColor: '#a855f7' },
      { mcuPin: 'PA5', componentId: 's1', componentPin: 'SCLK', protocol: 'SPI', description: 'SPI1 Serial Clock', wireColor: '#eab308' },
      { mcuPin: 'PA6', componentId: 's1', componentPin: 'MISO', protocol: 'SPI', description: 'SPI1 Master In Slave Out', wireColor: '#22c55e' },
      { mcuPin: 'PA7', componentId: 's1', componentPin: 'MOSI', protocol: 'SPI', description: 'SPI1 Master Out Slave In', wireColor: '#3b82f6' },
      { mcuPin: 'VBAT', sourceComponentId: 'battery1', sourceComponentPin: '+', componentId: 'p1', componentPin: 'VIN', protocol: 'Power', description: 'Flight battery positive to BEC input' },
      { mcuPin: 'GND', sourceComponentId: 'battery1', sourceComponentPin: '-', componentId: 'p1', componentPin: 'GND', protocol: 'GND', description: 'Flight battery negative to common BEC ground' },
      ...Array.from({ length: 4 }, (_, index) => ({
        mcuPin: `PA${index}`,
        componentId: `esc${index + 1}`,
        componentPin: 'SIGNAL',
        protocol: 'PWM' as const,
        description: `TIM2_CH${index + 1} PWM command from STM32 to ESC ${index + 1} signal input`,
        wireColor: '#c97737',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        mcuPin: 'GND',
        componentId: `esc${index + 1}`,
        componentPin: 'GND',
        protocol: 'GND' as const,
        description: `Common signal ground for ESC ${index + 1}`,
        wireColor: '#1e293b',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        mcuPin: 'VBAT',
        sourceComponentId: 'battery1',
        sourceComponentPin: '+',
        componentId: `esc${index + 1}`,
        componentPin: 'VBAT',
        protocol: 'Power' as const,
        description: `Flight battery power bus to ESC ${index + 1}`,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        mcuPin: 'GND',
        sourceComponentId: 'battery1',
        sourceComponentPin: '-',
        componentId: `esc${index + 1}`,
        componentPin: 'GND',
        protocol: 'GND' as const,
        description: `Common battery and PWM signal ground for ESC ${index + 1}`,
      })),
      ...Array.from({ length: 12 }, (_, index) => {
        const escIndex = Math.floor(index / 3) + 1;
        const phase = ['U', 'V', 'W'][index % 3];
        return {
          mcuPin: `MOTOR_${phase}`,
          sourceComponentId: `esc${escIndex}`,
          sourceComponentPin: `MOTOR_${phase}`,
          componentId: `motor${escIndex}`,
          componentPin: `PHASE_${phase}`,
          protocol: 'Power' as const,
          description: `ESC ${escIndex} phase ${phase} output to brushless motor ${escIndex}`,
        };
      }),
    ],
    labGuide: {
      voltageSupplyNote: 'Motors draw several amperes from LiPo battery. Never power motors directly from the STM32 3.3V or USB port; always route high current through the BEC and ESC power bus.',
      prerequisites: [
        'STM32F401CCU6 BlackPill Development Board',
        'MPU6000 or MPU6500 SPI Breakout Board',
        '5V/3A BEC (Battery Elimination Circuit)',
        'Four ESCs and four compatible brushless motors',
        'ST-Link V2 USB Programmer or USB-C Cable (DFU mode)',
        'Solderless breadboard & high-quality DuPont jumper wires'
      ],
      breadboardWiringSteps: [
        {
          stepNumber: 1,
          title: 'Mount the STM32 BlackPill',
          instruction: 'Insert the BlackPill board into the breadboard center. Keep the USB-C port facing toward the outer edge.'
        },
        {
          stepNumber: 2,
          title: 'Wire the SPI Bus Connections',
          instruction: 'Connect STM32 PA5 (SCLK) -> MPU6000 SCLK. Connect STM32 PA6 (MISO) -> MPU6000 MISO. Connect STM32 PA7 (MOSI) -> MPU6000 MOSI. Connect STM32 PA4 -> MPU6000 CS.',
          caution: 'SPI lines carry high-frequency clocks (up to 20MHz). Keep breadboard wire lengths under 10cm to prevent signal ringing and packet drops.'
        },
        {
          stepNumber: 3,
          title: 'Connect Sensor Power with Decoupling',
          instruction: 'Connect STM32 3V3 -> MPU6000 VCC. Connect STM32 GND -> MPU6000 GND. For optimal gyro noise reduction, place a 100nF ceramic capacitor across VCC and GND directly next to the sensor module.'
        },
        {
          stepNumber: 4,
          title: 'Connect ESC signal outputs',
          instruction: 'Connect PA0/TIM2_CH1 to ESC1 SIGNAL, PA1/TIM2_CH2 to ESC2 SIGNAL, PA2/TIM2_CH3 to ESC3 SIGNAL, and PA3/TIM2_CH4 to ESC4 SIGNAL. Join ESC signal grounds to the STM32 ground.'
        },
        {
          stepNumber: 5,
          title: 'Connect battery, ESCs, and motors',
          instruction: 'Connect the LiPo battery to the BEC input and ESC power inputs. Connect regulated 5V from the BEC to the BlackPill 5V input. Connect each ESC three-phase output only to its matching brushless motor.'
        }
      ],
      testingProcedure: [
        'Remove all propellers before powering the flight controller.',
        'Flash the STM32 via ST-Link or USB DFU bootloader.',
        'Open Serial Monitor at 115200 baud.',
        'Check that the MPU6000 WHO_AM_I register returns 0x68 or 0x70.',
        'Confirm all four PWM outputs remain at minimum throttle during startup.'
      ],
      troubleshootingTips: [
        'WHO_AM_I returns 0x00 or 0xFF: Loose wire on MISO or MOSI, or incorrect SPI mode (MPU6000 supports SPI Mode 0 or 3).',
        'Gyro drifts excessively: Ensure sensor is stationary during the first 3 seconds of boot while the zero-bias calibration loop executes.'
      ]
    },
    firmwareCode: `// STM32 SPI IMU Driver Starter
#include <SPI.h>

#define PIN_CS PA4
const uint8_t escPins[] = {PA0, PA1, PA2, PA3};

void writeRegister(uint8_t reg, uint8_t val) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE3));
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg & 0x7F); // Write flag
  SPI.transfer(val);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

uint8_t readRegister(uint8_t reg) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE3));
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg | 0x80); // Read flag
  uint8_t val = SPI.transfer(0x00);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
  return val;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);

  SPI.begin();
  delay(100);

  // Read WHO_AM_I register (0x75)
  uint8_t whoami = readRegister(0x75);
  Serial.print("MPU WHO_AM_I: 0x");
  Serial.println(whoami, HEX);

  // Reset and wake the MPU6000; verify WHO_AM_I over SPI.
  writeRegister(0x6B, 0x80);
  delay(100);
  writeRegister(0x6B, 0x01);

  analogWriteFrequency(400);
  for (uint8_t pin : escPins) {
    pinMode(pin, OUTPUT);
    analogWrite(pin, 102); // Approximately 1000 us at 400 Hz with 8-bit PWM.
  }
}

void loop() {
  // Keep the ESC commands at minimum until calibrated flight-control firmware is installed.
  delay(10);
}`,
    warnings: []
  },

  'rpi-pico-synth': {
    id: 't-rpi-pico-synth',
    title: 'RP2040 MIDI Synthesizer',
    description: 'RP2040 monophonic MIDI synthesizer with an isolated 5-pin DIN MIDI input, UART MIDI parsing, and PCM5102A I2S audio output.',
    components: [
      {
        id: 'u1',
        name: 'Raspberry Pi Pico (RP2040)',
        description: 'Dual ARM Cortex-M0+ 133MHz Microcontroller with Programmable I/O (PIO)',
        category: 'MCU',
        package: 'DIP-40 Module',
        estimatedCost: 320.00,
        pins: ['3V3', 'GND', 'GP0', 'GP1', 'GP5', 'GP26', 'GP27', 'GP28'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 120,
        pinDescriptions: {
          '3V3': '3.3V Output from internal SMPS (pin 36)',
          'GND': 'Digital / Analog Ground',
          'GP0': 'I2S Bit Clock (BCLK) via PIO state machine',
          'GP1': 'I2S Serial Audio Data (DIN)',
          'GP5': 'UART1 RX for optically isolated 31250 baud MIDI input',
          'GP26': 'ADC0 Analog Input (Rotary Potentiometer / Frequency)',
          'GP27': 'ADC1 Analog Input (Resonance / Filter cutoff)',
          'GP28': 'I2S Word Select / Left-Right Clock (LRCLK)'
        }
      },
      {
        id: 'u2',
        name: 'PCM5102A I2S DAC Module',
        description: '32-bit 384kHz Stereo Audio DAC with integrated charge pump line-out',
        category: 'Actuator',
        package: 'Module with 3.5mm Jack',
        estimatedCost: 350.00,
        pins: ['VIN', 'GND', 'BCK', 'DIN', 'LCK'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 50,
        pinDescriptions: {
          'VIN': 'Power supply (3.3V to 5V)',
          'GND': 'Audio Ground',
          'BCK': 'Continuous Bit Clock input',
          'DIN': 'Serial Digital Audio stream input',
          'LCK': 'Left/Right Word Select Clock (44.1kHz)'
        }
      },
      {
        id: 'din1',
        name: '5-pin DIN MIDI input connector',
        description: 'Standard MIDI IN connector. Pins 4 and 5 feed the optoisolator input circuit.',
        category: 'Connector',
        package: '5-pin DIN jack',
        estimatedCost: 80,
        pins: ['4', '5', 'SHIELD'],
        operatingVoltage: 5,
        maxCurrent_mA: 0,
      },
      {
        id: 'opto1',
        name: '6N138 MIDI input optocoupler',
        description: 'Optically isolates the MIDI current-loop input from the RP2040 UART. Confirm the selected device pinout.',
        category: 'Sensor',
        package: 'DIP-8 optocoupler',
        estimatedCost: 45,
        pins: ['ANODE', 'CATHODE', 'NC', 'GND', 'NC2', 'VO', 'BASE', 'VCC'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 2,
      },
      {
        id: 'r_midi_in',
        name: '220Ω MIDI input resistor',
        description: 'Series current-limiting resistor between DIN pin 4 and optocoupler LED anode.',
        category: 'Passive',
        package: 'Axial resistor',
        estimatedCost: 2,
        pins: ['1', '2'],
        operatingVoltage: 5,
        maxCurrent_mA: 5,
      },
      {
        id: 'r_midi_pullup',
        name: '4.7kΩ MIDI UART pull-up resistor',
        description: 'Pulls the optocoupler output up to 3.3V for the RP2040 UART RX input.',
        category: 'Passive',
        package: 'Axial resistor',
        estimatedCost: 2,
        pins: ['1', '2'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 1,
      }
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 'u2', componentPin: 'VIN', protocol: 'Power', description: '3.3V supply to PCM5102A', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'u2', componentPin: 'GND', protocol: 'GND', description: 'Common audio and digital ground', wireColor: '#1e293b' },
      { mcuPin: 'GP0', componentId: 'u2', componentPin: 'BCK', protocol: 'I2S', description: 'I2S Continuous Bit Clock (BCLK)', wireColor: '#eab308' },
      { mcuPin: 'GP1', componentId: 'u2', componentPin: 'DIN', protocol: 'I2S', description: 'I2S Audio Data Stream (DIN)', wireColor: '#3b82f6' },
      { mcuPin: 'GP28', componentId: 'u2', componentPin: 'LCK', protocol: 'I2S', description: 'I2S word-select / left-right clock', wireColor: '#22c55e' },
      { mcuPin: '3V3', componentId: 'opto1', componentPin: 'VCC', protocol: 'Power', description: '3.3V optocoupler output-side supply', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'opto1', componentPin: 'GND', protocol: 'GND', description: 'Isolated UART-side ground', wireColor: '#1e293b' },
      { mcuPin: 'GND', componentId: 'opto1', componentPin: 'BASE', protocol: 'GND', description: 'Reference the 6N138 base to output-side ground', wireColor: '#1e293b' },
      { mcuPin: 'MIDI_IN', sourceComponentId: 'din1', sourceComponentPin: '4', componentId: 'r_midi_in', componentPin: '1', protocol: 'UART', description: 'MIDI DIN pin 4 to input current-limiting resistor' },
      { mcuPin: 'DIN4_R', sourceComponentId: 'r_midi_in', sourceComponentPin: '2', componentId: 'opto1', componentPin: 'ANODE', protocol: 'UART', description: 'Series resistor to 6N138 input LED anode' },
      { mcuPin: 'MIDI_RETURN', sourceComponentId: 'din1', sourceComponentPin: '5', componentId: 'opto1', componentPin: 'CATHODE', protocol: 'UART', description: 'MIDI DIN pin 5 to 6N138 input LED cathode' },
      { mcuPin: 'GP5', sourceComponentId: 'opto1', sourceComponentPin: 'VO', componentId: 'u1', componentPin: 'GP5', protocol: 'UART', description: 'Optically isolated MIDI data output to RP2040 UART1 RX at 31250 baud' },
      { mcuPin: '3V3', componentId: 'r_midi_pullup', componentPin: '1', protocol: 'Power', description: 'UART output pull-up to 3.3V' },
      { mcuPin: 'GP5', sourceComponentId: 'opto1', sourceComponentPin: 'VO', componentId: 'r_midi_pullup', componentPin: '2', protocol: 'UART', description: 'UART RX output pull-up branch' }
    ],
    labGuide: {
      voltageSupplyNote: 'The DIN MIDI input is galvanically isolated by the optocoupler. The PCM5102A provides line-level audio, not speaker power; use powered speakers or an external amplifier.',
      prerequisites: [
        'Raspberry Pi Pico (headers pre-soldered)',
        'PCM5102A I2S 3.5mm DAC breakout board',
        '5-pin DIN MIDI input jack',
        '6N138 optocoupler and 220Ω / 4.7kΩ resistors',
        'Powered speakers or audio amplifier',
        'Breadboard and jumper wires',
        'Arduino IDE with "Raspberry Pi Pico/RP2040 by Earle Philhower" core'
      ],
      breadboardWiringSteps: [
        {
          stepNumber: 1,
          title: 'Mount the Raspberry Pi Pico',
          instruction: 'Place the Pico across the breadboard trench. Pin 1 (GP0) should be at top left.'
        },
        {
          stepNumber: 2,
          title: 'Wire the I2S Audio Bus',
          instruction: 'Connect Pico GP0 -> PCM5102A BCK. Connect Pico GP1 -> PCM5102A DIN. Connect Pico GP28 -> PCM5102A LCK.'
        },
        {
          stepNumber: 3,
          title: 'Configure DAC Solder Jumpers',
          instruction: 'Check the back of the PCM5102A module: FLT, DEMP, XSMT, and FMT jumpers should be configured to GND (default on most pre-assembled boards) for standard I2S format.'
        },
        {
          stepNumber: 4,
          title: 'Wire the MIDI input isolator',
          instruction: 'Connect DIN pin 4 through the 220Ω resistor to 6N138 ANODE. Connect DIN pin 5 to 6N138 CATHODE. Power the output side from Pico 3V3/GND and pull VO up to 3V3 with 4.7kΩ.'
        },
        {
          stepNumber: 5,
          title: 'Connect MIDI data to the Pico',
          instruction: 'Connect 6N138 VO to Pico GP5 (UART1 RX). Connect the optocoupler output ground to Pico GND. MIDI serial is 31250 baud, 8-N-1.'
        },
        {
          stepNumber: 6,
          title: 'Connect audio output',
          instruction: 'Connect Pico GP0 -> PCM5102A BCK, GP1 -> DIN, GP28 -> LCK, 3V3 -> VIN, and GND -> GND. Connect the DAC line output to powered speakers or an amplifier.'
        }
      ],
      testingProcedure: [
        'Connect the DAC line output to powered audio equipment at low volume.',
        'Upload the firmware and open Serial Monitor at 115200 baud.',
        'Send MIDI note-on and note-off messages; verify the reported note and audible tone.'
      ],
      troubleshootingTips: [
        'No MIDI messages: verify the DIN pin 4/5 orientation, optocoupler LED polarity, 4.7kΩ pull-up, and 31250 baud.',
        'No audio: verify I2S wiring and that a powered amplifier or speakers are connected to the DAC line output.'
      ]
    },
    firmwareCode: `#include <Arduino.h>
#include <math.h>
#include <I2S.h>

I2S i2s(OUTPUT);
constexpr int midiRxPin = 5;
const int sampleRate = 44100;
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
  const int16_t sample16 = frequency > 0.0f
      ? static_cast<int16_t>(sinf((static_cast<float>(phase) / 4294967296.0f) * 2.0f * PI) * 12000.0f)
      : 0;
  i2s.write(sample16);
  i2s.write(sample16);
  if (frequency > 0.0f) {
    phase += static_cast<uint32_t>(frequency * 4294967296.0f / sampleRate);
  }
}`,
    warnings: []
  }
};

export const buttonLedTemplate: CircuitDesign = {
  id: 'arduino-uno-button-led',
  title: 'Arduino Uno Pushbutton LED',
  description: 'Press a pushbutton to light an LED. D7 reads the button through a 10kΩ pull-down, and D13 drives the LED through a 220Ω current-limiting resistor.',
  components: [
    { id: 'u1', name: 'Arduino Uno R3', description: '5V microcontroller board with digital pins D7 and D13.', category: 'MCU', package: 'Dev board', estimatedCost: 600, pins: ['5V', 'GND', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'], operatingVoltage: 5, maxCurrent_mA: 50 },
    { id: 'sw1', name: '4-pin tactile pushbutton', description: 'Momentary normally-open switch. Pins 1 and 2 form one side; pins 3 and 4 form the opposite side. Rotate across the breadboard center trench.', category: 'Actuator', package: 'Through-hole tactile switch', estimatedCost: 10, pins: ['1', '2', '3', '4'], operatingVoltage: 5, maxCurrent_mA: 1 },
    { id: 'r_pd', name: '10kΩ button pull-down resistor', description: 'Holds D7 LOW while the button is released; connects the D7/button node to GND.', category: 'Passive', package: 'Axial resistor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0.5 },
    { id: 'd1', name: 'Indicator LED', description: 'Anode connects to D13 through a 220Ω series resistor. Cathode connects to GND.', category: 'Actuator', package: '5mm LED', estimatedCost: 3, pins: ['ANODE', 'CATHODE'], operatingVoltage: 2, maxCurrent_mA: 10 },
    { id: 'r_led', name: '220Ω LED current-limiting resistor', description: 'Series resistor between Arduino D13 and the LED anode.', category: 'Passive', package: 'Axial resistor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 10 }
  ],
  pinMappings: [
    { mcuPin: '5V', componentId: 'sw1', componentPin: '1', protocol: 'Power', description: 'One switch side: tactile-button pins 1 and 2 are internally common.', wireColor: '#d34545' },
    { mcuPin: 'D7', componentId: 'sw1', componentPin: '3', protocol: 'GPIO', description: 'Button output side: pins 3 and 4 are internally common; this node goes to D7.', wireColor: '#39866a' },
    { mcuPin: 'D7', componentId: 'r_pd', componentPin: '1', protocol: 'GPIO', description: 'Pull-down top shares the D7/button output node.', wireColor: '#39866a' },
    { mcuPin: 'GND', componentId: 'r_pd', componentPin: '2', protocol: 'GND', description: '10kΩ pull-down returns to ground.', wireColor: '#536b8b' },
    { mcuPin: 'D13', componentId: 'r_led', componentPin: '1', protocol: 'GPIO', description: 'LED output through series current-limiting resistor.', wireColor: '#087e8b' },
    { mcuPin: 'D13', sourceComponentId: 'r_led', sourceComponentPin: '2', componentId: 'd1', componentPin: 'ANODE', protocol: 'GPIO', description: 'LED anode connects to resistor terminal 2; terminal 1 connects to Arduino D13.', wireColor: '#087e8b' },
    { mcuPin: 'GND', componentId: 'd1', componentPin: 'CATHODE', protocol: 'GND', description: 'LED cathode returns to GND for active-HIGH operation.', wireColor: '#536b8b' }
  ],
  labGuide: {
    voltageSupplyNote: 'Use the Uno 5V pin only for the low-current button input. The LED must have a series resistor; never connect it directly between an I/O pin and ground.',
    prerequisites: ['Arduino Uno R3 and USB cable', '4-pin normally-open tactile pushbutton', 'LED (observe anode/cathode polarity)', '220Ω LED series resistor', '10kΩ button pull-down resistor', 'Breadboard and jumper wires'],
    breadboardWiringSteps: [
      { stepNumber: 1, title: 'Place the button across the trench', instruction: 'Place the 4-pin tactile switch across the breadboard center gap. Pins 1 and 2 are one internally connected side; pins 3 and 4 are the other side. Check the switch datasheet or use a continuity meter if its pin orientation differs.', caution: 'Do not place both switch sides in the same connected breadboard row.' },
      { stepNumber: 2, title: 'Wire the active-HIGH button input', instruction: 'Connect button pin 1 (or pin 2 on the same side) to Uno 5V. Connect the opposite side (pin 3 or pin 4) to Uno D7. Connect one end of the 10kΩ resistor to that same D7/button-output row and the other end to Uno GND.' },
      { stepNumber: 3, title: 'Wire the LED output', instruction: 'Connect Uno D13 through the 220Ω series resistor to the LED anode (long lead). Connect the LED cathode (short lead/flat edge) to Uno GND.' },
      { stepNumber: 4, title: 'Check wiring before USB power', instruction: 'With the button released, D7 is held LOW through 10kΩ. Pressing the button connects D7 to 5V. The LED current path is D13 → 220Ω → LED anode → LED cathode → GND.' }
    ],
    testingProcedure: ['Upload the generated sketch to Arduino Uno.', 'With the button released, confirm the LED is off.', 'Press and hold the button; the LED should turn on. Release it; the LED should turn off.'],
    troubleshootingTips: ['LED always on: check that the button output node is not directly wired to 5V; only the opposite switch side goes to 5V.', 'LED does not light: verify anode/cathode orientation and the 220Ω series resistor path.', 'Button reads randomly: verify the 10kΩ pull-down runs from D7 to GND and the switch straddles the center trench.']
  },
  firmwareCode: `const int buttonPin = 7;\nconst int ledPin = 13;\n\nvoid setup() {\n  pinMode(buttonPin, INPUT);  // External 10kΩ pull-down to GND\n  pinMode(ledPin, OUTPUT);\n  digitalWrite(ledPin, LOW);\n}\n\nvoid loop() {\n  const bool pressed = digitalRead(buttonPin) == HIGH;\n  digitalWrite(ledPin, pressed ? HIGH : LOW);\n}`,
  warnings: ['External 10kΩ pull-down is required with INPUT mode. Button sides must be identified correctly; pins 1/2 and 3/4 are each internally common.']
};

export const motorControllerTemplate: CircuitDesign = {
  id: 'arduino-l298n-motor',
  title: 'Arduino Uno PWM Motor Speed Controller',
  description: 'A potentiometer sets PWM speed on Arduino D9; D7/D8 select direction through an L298N H-bridge. A separate motor supply, four correctly oriented clamp diodes, local bulk capacitors, and a low-side sense shunt are modeled. Verify the L298N module’s onboard diodes and sense resistor before adding external parts.',
  components: [
    { id: 'u1', name: 'Arduino Uno R3', description: '5V microcontroller board; D9 PWM, D7/D8 direction, A0 setpoint, A1 current monitor', category: 'MCU', package: 'Dev board', estimatedCost: 600, pins: ['5V', 'GND', 'D9', 'D7', 'D8', 'A0', 'A1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D10', 'D11', 'D12', 'D13', 'A2', 'A3', 'A4', 'A5'], operatingVoltage: 5, maxCurrent_mA: 50 },
    { id: 'drv1', name: 'L298N Dual H-Bridge Module', description: 'Logic uses 5V; VS motor supply is separate. Remove ENA jumper when using PWM on ENA. Check whether module already includes clamp diodes and sense shunt.', category: 'Actuator', package: 'Module', estimatedCost: 250, pins: ['VSS', 'VS', 'GND', 'ENA', 'IN1', 'IN2', 'OUT1', 'OUT2', 'SENSE_A'], operatingVoltage: 5, maxCurrent_mA: 20 },
    { id: 'motor1', name: 'Brushed DC Motor', description: 'Single motor driven bidirectionally from L298N OUT1/OUT2; motor voltage and stall current must match supply and driver limits.', category: 'Actuator', package: 'Motor', estimatedCost: 180, pins: ['M+', 'M-'], operatingVoltage: 12, maxCurrent_mA: 1000 },
    { id: 'pot1', name: '10kΩ Speed Potentiometer', description: 'Ends connect to 5V and GND; wiper sets analog speed command at A0.', category: 'Passive', package: 'Panel potentiometer', estimatedCost: 20, pins: ['5V', 'GND', 'WIPER'], operatingVoltage: 5, maxCurrent_mA: 1 },
    { id: 'batt1', name: '12V Motor Supply', description: 'Separate fused motor supply sized for motor stall current; share ground with Arduino logic.', category: 'Power', package: 'External supply', estimatedCost: 500, pins: ['+12V', 'GND'], operatingVoltage: 12, maxCurrent_mA: 2000 },
    { id: 'f1', name: 'Inline Motor Supply Fuse', description: 'Fuse selected for motor stall current, driver rating, wiring, and supply; place in series with +12V input.', category: 'Power', package: 'Inline fuse holder', estimatedCost: 25, pins: ['IN', 'OUT'], operatingVoltage: 12, maxCurrent_mA: 0 },
    ...['D1 OUT1→VS', 'D2 GND→OUT1', 'D3 OUT2→VS', 'D4 GND→OUT2'].map((name, index) => ({ id: `d${index + 1}`, name: `Fast Clamp Diode ${name}`, description: 'Use a fast-recovery diode (trr ≤200ns) or suitably rated Schottky. Verify module does not already include the clamp bridge. Anode/cathode are shown in pin mappings.', category: 'Passive' as const, package: 'Axial diode', estimatedCost: 12, pins: ['A', 'K'], operatingVoltage: 40, maxCurrent_mA: 1000 })),
    { id: 'c_motor', name: '470µF Motor Supply Bulk Capacitor', description: 'Across +12V motor supply and common ground near L298N; observe electrolytic polarity and voltage rating.', category: 'Passive', package: 'Radial electrolytic', estimatedCost: 15, pins: ['+', '-'], operatingVoltage: 25, maxCurrent_mA: 0 },
    { id: 'c_logic', name: '100µF L298N Logic Supply Capacitor', description: 'Across L298N VSS 5V logic rail and ground near module.', category: 'Passive', package: 'Radial electrolytic', estimatedCost: 8, pins: ['+', '-'], operatingVoltage: 10, maxCurrent_mA: 0 },
    { id: 'c_vs', name: '100nF L298N Motor Rail Bypass', description: 'Ceramic bypass across VS and ground, close to L298N module.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 3, pins: ['1', '2'], operatingVoltage: 25, maxCurrent_mA: 0 },
    { id: 'c_vss', name: '100nF L298N Logic Rail Bypass', description: 'Ceramic bypass across VSS and ground, close to L298N module.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 3, pins: ['1', '2'], operatingVoltage: 10, maxCurrent_mA: 0 },
    { id: 'c_a0', name: '100nF Arduino A0 Input Filter', description: 'Filters potentiometer wiper noise; connect from A0 signal to GND, not across the potentiometer supply.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 3, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0 },
    { id: 'r_sense', name: '0.1Ω L298N Sense Shunt (2W)', description: 'Low-inductance shunt from SENSE_A to common ground. A1 monitors the shunt voltage; firmware provides a conservative software cutoff, not cycle-by-cycle hardware current regulation. Check module onboard shunt before fitting.', category: 'Passive', package: 'Low-inductance resistor', estimatedCost: 18, pins: ['SENSE', 'GND'], operatingVoltage: 5, maxCurrent_mA: 0 }
  ],
  pinMappings: [
    { mcuPin: 'D9', componentId: 'drv1', componentPin: 'ENA', protocol: 'PWM', description: 'PWM speed command; remove ENA jumper before driving this pin.', wireColor: '#f97316' },
    { mcuPin: 'D7', componentId: 'drv1', componentPin: 'IN1', protocol: 'GPIO', description: 'Motor direction input 1.', wireColor: '#087e8b' },
    { mcuPin: 'D8', componentId: 'drv1', componentPin: 'IN2', protocol: 'GPIO', description: 'Motor direction input 2.', wireColor: '#087e8b' },
    { mcuPin: 'A0', componentId: 'pot1', componentPin: 'WIPER', protocol: 'ADC', description: 'Potentiometer wiper provides analog speed setpoint.', wireColor: '#39866a' },
    { mcuPin: '5V', componentId: 'pot1', componentPin: '5V', protocol: 'Power', description: 'Potentiometer reference from Arduino 5V.', wireColor: '#d34545' },
    { mcuPin: 'GND', componentId: 'pot1', componentPin: 'GND', protocol: 'GND', description: 'Potentiometer ground.', wireColor: '#536b8b' },
    { mcuPin: '5V', componentId: 'drv1', componentPin: 'VSS', protocol: 'Power', description: 'Separate 5V logic supply from Arduino.', wireColor: '#d34545' },
    { mcuPin: '+12V', sourceComponentId: 'batt1', componentId: 'f1', componentPin: 'IN', protocol: 'Power', description: 'Motor supply passes through an appropriately sized inline fuse.', wireColor: '#d34545' },
    { mcuPin: 'OUT', sourceComponentId: 'f1', componentId: 'drv1', componentPin: 'VS', protocol: 'Power', description: 'Fused, separate motor supply to L298N VS.', wireColor: '#d34545' },
    { mcuPin: 'GND', componentId: 'drv1', componentPin: 'GND', protocol: 'GND', description: 'Common ground; join Arduino and motor-supply grounds here.', wireColor: '#536b8b' },
    { mcuPin: 'GND', sourceComponentId: 'batt1', componentId: 'drv1', componentPin: 'GND', protocol: 'GND', description: 'Motor supply negative joins common ground.', wireColor: '#536b8b' },
    { mcuPin: 'OUT1', sourceComponentId: 'drv1', componentId: 'motor1', componentPin: 'M+', protocol: 'Power', description: 'H-bridge output 1 to motor terminal.', wireColor: '#087e8b' },
    { mcuPin: 'OUT2', sourceComponentId: 'drv1', componentId: 'motor1', componentPin: 'M-', protocol: 'Power', description: 'H-bridge output 2 to motor terminal.', wireColor: '#087e8b' },
    { mcuPin: 'OUT1', sourceComponentId: 'drv1', componentId: 'd1', componentPin: 'A', protocol: 'Power', description: 'Upper clamp: anode at OUT1.', wireColor: '#b45309' },
    { mcuPin: 'OUT', sourceComponentId: 'f1', componentId: 'd1', componentPin: 'K', protocol: 'Power', description: 'Upper clamp cathode to fused motor supply.', wireColor: '#d34545' },
    { mcuPin: 'GND', sourceComponentId: 'drv1', componentId: 'd2', componentPin: 'A', protocol: 'GND', description: 'Lower clamp anode to ground.', wireColor: '#536b8b' },
    { mcuPin: 'OUT1', sourceComponentId: 'drv1', componentId: 'd2', componentPin: 'K', protocol: 'Power', description: 'Lower clamp cathode at OUT1.', wireColor: '#b45309' },
    { mcuPin: 'OUT2', sourceComponentId: 'drv1', componentId: 'd3', componentPin: 'A', protocol: 'Power', description: 'Upper clamp: anode at OUT2.', wireColor: '#b45309' },
    { mcuPin: 'OUT', sourceComponentId: 'f1', componentId: 'd3', componentPin: 'K', protocol: 'Power', description: 'Upper clamp cathode to fused motor supply.', wireColor: '#d34545' },
    { mcuPin: 'GND', sourceComponentId: 'drv1', componentId: 'd4', componentPin: 'A', protocol: 'GND', description: 'Lower clamp anode to ground.', wireColor: '#536b8b' },
    { mcuPin: 'OUT2', sourceComponentId: 'drv1', componentId: 'd4', componentPin: 'K', protocol: 'Power', description: 'Lower clamp cathode at OUT2.', wireColor: '#b45309' },
    { mcuPin: 'OUT', sourceComponentId: 'f1', componentId: 'c_motor', componentPin: '+', protocol: 'Power', description: 'Fused motor rail bulk capacitor positive.', wireColor: '#d34545' },
    { mcuPin: 'GND', sourceComponentId: 'batt1', componentId: 'c_motor', componentPin: '-', protocol: 'GND', description: 'Motor rail bulk capacitor negative.', wireColor: '#536b8b' },
    { mcuPin: '5V', componentId: 'c_logic', componentPin: '+', protocol: 'Power', description: 'Logic bulk capacitor positive.', wireColor: '#d34545' },
    { mcuPin: 'GND', componentId: 'c_logic', componentPin: '-', protocol: 'GND', description: 'Logic bulk capacitor negative.', wireColor: '#536b8b' },
    { mcuPin: 'VS', sourceComponentId: 'drv1', componentId: 'c_vs', componentPin: '1', protocol: 'Power', description: 'VS ceramic bypass positive.', wireColor: '#d34545' },
    { mcuPin: 'GND', componentId: 'c_vs', componentPin: '2', protocol: 'GND', description: 'VS ceramic bypass ground.', wireColor: '#536b8b' },
    { mcuPin: 'VSS', sourceComponentId: 'drv1', componentId: 'c_vss', componentPin: '1', protocol: 'Power', description: 'VSS ceramic bypass positive.', wireColor: '#d34545' },
    { mcuPin: 'GND', componentId: 'c_vss', componentPin: '2', protocol: 'GND', description: 'VSS ceramic bypass ground.', wireColor: '#536b8b' },
    { mcuPin: 'A0', componentId: 'c_a0', componentPin: '1', protocol: 'ADC', description: 'A0 filter capacitor connects to analog signal.', wireColor: '#39866a' },
    { mcuPin: 'GND', componentId: 'c_a0', componentPin: '2', protocol: 'GND', description: 'A0 filter capacitor returns to ground.', wireColor: '#536b8b' },
    { mcuPin: 'SENSE_A', sourceComponentId: 'drv1', componentId: 'r_sense', componentPin: 'SENSE', protocol: 'Power', description: 'L298N sense output to low-side shunt.', wireColor: '#b45309' },
    { mcuPin: 'GND', componentId: 'r_sense', componentPin: 'GND', protocol: 'GND', description: 'Shunt returns to common ground.', wireColor: '#536b8b' },
    { mcuPin: 'A1', componentId: 'r_sense', componentPin: 'SENSE', protocol: 'ADC', description: 'Arduino monitors shunt voltage for conservative software overcurrent cutoff.', wireColor: '#39866a' }
  ],
  firmwareCode: `const int speedPin = A0;
const int currentSensePin = A1;
const int enablePin = 9;  // ENA jumper must be removed
const int in1Pin = 7;
const int in2Pin = 8;
const int currentLimitRaw = 120; // Calibrate for the installed shunt and motor

void setup() {
  pinMode(enablePin, OUTPUT);
  pinMode(in1Pin, OUTPUT);
  pinMode(in2Pin, OUTPUT);
  digitalWrite(in1Pin, HIGH);
  digitalWrite(in2Pin, LOW);
  analogWrite(enablePin, 0);
}

void loop() {
  const int setpoint = analogRead(speedPin);
  const int currentRaw = analogRead(currentSensePin);
  if (currentRaw >= currentLimitRaw) {
    analogWrite(enablePin, 0); // software cutoff; not cycle-by-cycle protection
    return;
  }
  const int pwm = map(setpoint, 0, 1023, 0, 255);
  analogWrite(enablePin, pwm);
}`,
  warnings: ['Confirm the motor stall current is within the L298N module rating; the L298 has significant voltage drop and thermal limits.', 'Use a fast-recovery diode bridge (trr ≤200ns) or suitable Schottky diodes; check module-installed diodes before adding duplicates.', 'A1 software monitoring is not fast hardware current limiting. Calibrate the shunt threshold and add a fuse/current-control circuit appropriate to the motor.', 'Keep 12V motor supply separate from 5V logic, with a shared ground. Capacitor proximity and diode current rating require hardware verification.']
};
