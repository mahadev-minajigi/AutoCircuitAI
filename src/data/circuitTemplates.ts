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
        pins: ['3V3', 'GND', 'EN', 'IO21', 'IO22', 'IO34', 'IO35', 'IO2'],
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
      { mcuPin: '3V3', componentId: 'vr1', componentPin: 'VOUT', protocol: 'Power', description: 'AMS1117 3.3V output powering system rail', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'vr1', componentPin: 'GND', protocol: 'GND', description: 'AMS1117 Ground connection to blue rail', wireColor: '#1e293b' },
      { mcuPin: '3V3', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: '3.3V Power Rail to BME280 Sensor', wireColor: '#ef4444' },
      { mcuPin: '3V3', componentId: 'd1', componentPin: 'VCC', protocol: 'Power', description: '3.3V Power Rail to OLED Display', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground connection to BME280', wireColor: '#1e293b' },
      { mcuPin: 'GND', componentId: 'd1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground connection to OLED', wireColor: '#1e293b' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'SDO', protocol: 'GND', description: 'BME280 SDO pin pulled to GND for I2C address 0x76', wireColor: '#1e293b' },
      { mcuPin: 'IO21', componentId: 's1', componentPin: 'SDA', protocol: 'I2C', description: 'Shared I2C Data Line (SDA)', wireColor: '#3b82f6' },
      { mcuPin: 'IO21', componentId: 'd1', componentPin: 'SDA', protocol: 'I2C', description: 'Shared I2C Data Line (SDA)', wireColor: '#3b82f6' },
      { mcuPin: 'IO22', componentId: 's1', componentPin: 'SCL', protocol: 'I2C', description: 'Shared I2C Clock Line (SCL)', wireColor: '#eab308' },
      { mcuPin: 'IO22', componentId: 'd1', componentPin: 'SCL', protocol: 'I2C', description: 'Shared I2C Clock Line (SCL)', wireColor: '#eab308' },
      { mcuPin: '3V3', componentId: 'r_sda', componentPin: '1', protocol: 'Power', description: '4.7kΩ pull-up connected between 3.3V rail and SDA line', wireColor: '#ef4444' },
      { mcuPin: 'IO21', componentId: 'r_sda', componentPin: '2', protocol: 'I2C', description: 'I2C SDA line pulled up through 4.7kΩ resistor', wireColor: '#3b82f6' },
      { mcuPin: '3V3', componentId: 'r_scl', componentPin: '1', protocol: 'Power', description: '4.7kΩ pull-up connected between 3.3V rail and SCL line', wireColor: '#ef4444' },
      { mcuPin: 'IO22', componentId: 'r_scl', componentPin: '2', protocol: 'I2C', description: 'I2C SCL line pulled up through 4.7kΩ resistor', wireColor: '#eab308' },
      { mcuPin: '3V3', componentId: 'c_esp', componentPin: '1', protocol: 'Power', description: '100nF decoupling capacitor across ESP32 3V3', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_esp', componentPin: '2', protocol: 'GND', description: '100nF decoupling capacitor return to GND', wireColor: '#1e293b' },
      { mcuPin: '3V3', componentId: 'c_bme', componentPin: '1', protocol: 'Power', description: '100nF decoupling cap placed within 5mm of BME280 VCC', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_bme', componentPin: '2', protocol: 'GND', description: 'BME280 decoupling ground return', wireColor: '#1e293b' },
      { mcuPin: '3V3', componentId: 'c_oled', componentPin: '1', protocol: 'Power', description: '100nF decoupling cap placed within 5mm of OLED VCC', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_oled', componentPin: '2', protocol: 'GND', description: 'OLED decoupling ground return', wireColor: '#1e293b' },
      { mcuPin: '3V3', componentId: 'c_reg_in', componentPin: '1', protocol: 'Power', description: '10µF input bulk capacitor on AMS1117 VIN', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'c_reg_in', componentPin: '2', protocol: 'GND', description: 'AMS1117 input capacitor ground', wireColor: '#1e293b' },
      { mcuPin: '3V3', componentId: 'c_reg_out', componentPin: '1', protocol: 'Power', description: '10µF output bulk capacitor on AMS1117 VOUT', wireColor: '#ef4444' },
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
        'First run an "I2C Scanner" sketch to confirm both hardware devices respond. You should see address 0x3C (OLED) and 0x76 (BME280).',
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

void setup() {
  Serial.begin(115200);
  delay(100);
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Try default address 0x76, then 0x77
  if (!bme.begin(0x76, &Wire)) {
    if (!bme.begin(0x77, &Wire)) {
      Serial.println(F("Could not find a valid BME280 sensor, check wiring!"));
    }
  }
  
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
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

  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.println(F("--- IoT Weather ---"));
  
  display.setCursor(0, 18);
  display.printf("Temp: %.1f C\\n", temp);
  
  display.setCursor(0, 32);
  display.printf("Hum:  %.1f %%\\n", hum);
  
  display.setCursor(0, 46);
  display.printf("Pres: %.0f hPa\\n", press);
  
  display.display();
  delay(2000);
}`,
    warnings: ['BME280 requires 3.3V logic (ESP32 is natively 3.3V). Do not connect 5V to sensor.']
  },

  'stm32-drone': {
    id: 't-stm32-drone',
    title: 'STM32 Drone Flight Controller',
    description: 'High-performance flight controller using STM32F401/F405, MPU6000 6-DOF IMU over high-speed SPI, and BEC power management.',
    components: [
      {
        id: 'u1',
        name: 'STM32F401CCU6 (BlackPill)',
        description: 'ARM Cortex-M4 84MHz 32-bit Microcontroller Board with FPU',
        category: 'MCU',
        package: 'UFQFPN-48 Module',
        estimatedCost: 320.00,
        pins: ['3V3', 'GND', 'PA4', 'PA5', 'PA6', 'PA7', 'PB6', 'PB7'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 100,
        pinDescriptions: {
          '3V3': '3.3V Output from on-board LDO regulator',
          'GND': 'System Ground',
          'PA4': 'SPI1 NSS / Hardware Chip Select Pin',
          'PA5': 'SPI1 SCK (Serial Clock up to 42MHz)',
          'PA6': 'SPI1 MISO (Master In Slave Out)',
          'PA7': 'SPI1 MOSI (Master Out Slave In)',
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
        maxCurrent_mA: 3000,
        pinDescriptions: {
          'VIN': 'Direct Battery Voltage (7.4V - 25.2V from LiPo)',
          'VOUT': 'Regulated 5.0V output to MCU 5V pin / ESC servo rail',
          'GND': 'Common Ground'
        }
      }
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: 'Clean 3.3V power to IMU sensor', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common ground for sensor & MCU', wireColor: '#1e293b' },
      { mcuPin: 'PA4', componentId: 's1', componentPin: 'CS', protocol: 'SPI', description: 'SPI1 Chip Select (CS) - Active Low', wireColor: '#a855f7' },
      { mcuPin: 'PA5', componentId: 's1', componentPin: 'SCLK', protocol: 'SPI', description: 'SPI1 Serial Clock', wireColor: '#eab308' },
      { mcuPin: 'PA6', componentId: 's1', componentPin: 'MISO', protocol: 'SPI', description: 'SPI1 Master In Slave Out', wireColor: '#22c55e' },
      { mcuPin: 'PA7', componentId: 's1', componentPin: 'MOSI', protocol: 'SPI', description: 'SPI1 Master Out Slave In', wireColor: '#3b82f6' }
    ],
    labGuide: {
      voltageSupplyNote: 'Motors draw several amperes from LiPo battery. Never power motors directly from the STM32 3.3V or USB port; always route high current through the BEC and ESC power bus.',
      prerequisites: [
        'STM32F401CCU6 BlackPill Development Board',
        'MPU6000 or MPU6500 SPI Breakout Board',
        '5V/3A BEC (Battery Elimination Circuit)',
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
        }
      ],
      testingProcedure: [
        'Flash the STM32 via ST-Link or USB DFU bootloader.',
        'Open Serial Monitor at 115200 baud.',
        'Check that the MPU6000 WHO_AM_I register returns 0x68 or 0x70.',
        'Tilt the breadboard by 90 degrees and confirm acceleration on the Z-axis drops from 1.0G to 0.0G while X/Y axis rises to 1.0G.'
      ],
      troubleshootingTips: [
        'WHO_AM_I returns 0x00 or 0xFF: Loose wire on MISO or MOSI, or incorrect SPI mode (MPU6000 supports SPI Mode 0 or 3).',
        'Gyro drifts excessively: Ensure sensor is stationary during the first 3 seconds of boot while the zero-bias calibration loop executes.'
      ]
    },
    firmwareCode: `// STM32 SPI IMU Driver Starter
#include <SPI.h>

#define PIN_CS PA4

void writeRegister(uint8_t reg, uint8_t val) {
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg & 0x7F); // Write flag
  SPI.transfer(val);
  digitalWrite(PIN_CS, HIGH);
}

uint8_t readRegister(uint8_t reg) {
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg | 0x80); // Read flag
  uint8_t val = SPI.transfer(0x00);
  digitalWrite(PIN_CS, HIGH);
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

  // Wake up MPU (clear SLEEP bit in PWR_MGMT_1)
  writeRegister(0x6B, 0x00);
}

void loop() {
  // Read gyro & accel registers at 1kHz loop
  delay(10);
}`,
    warnings: ['MPU6000 requires very clean 3.3V power, add decoupling capacitors close to VCC pin']
  },

  'rpi-pico-synth': {
    id: 't-rpi-pico-synth',
    title: 'RP2040 Polyphonic Audio Synthesizer',
    description: 'Dual-core ARM Cortex-M0+ audio synth engine with digital I2S stereo DAC output and optocoupler MIDI input.',
    components: [
      {
        id: 'u1',
        name: 'Raspberry Pi Pico (RP2040)',
        description: 'Dual ARM Cortex-M0+ 133MHz Microcontroller with Programmable I/O (PIO)',
        category: 'MCU',
        package: 'DIP-40 Module',
        estimatedCost: 320.00,
        pins: ['3V3', 'GND', 'GP0', 'GP1', 'GP26', 'GP27', 'GP28'],
        operatingVoltage: 3.3,
        maxCurrent_mA: 120,
        pinDescriptions: {
          '3V3': '3.3V Output from internal SMPS (pin 36)',
          'GND': 'Digital / Analog Ground',
          'GP0': 'I2S Bit Clock (BCLK) via PIO state machine',
          'GP1': 'I2S Serial Audio Data (DIN)',
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
      }
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 'u2', componentPin: 'VIN', protocol: 'Power', description: '3.3V Power to DAC Module', wireColor: '#ef4444' },
      { mcuPin: 'GND', componentId: 'u2', componentPin: 'GND', protocol: 'GND', description: 'Common Ground', wireColor: '#1e293b' },
      { mcuPin: 'GP0', componentId: 'u2', componentPin: 'BCK', protocol: 'I2S', description: 'I2S Continuous Bit Clock (BCLK)', wireColor: '#eab308' },
      { mcuPin: 'GP1', componentId: 'u2', componentPin: 'DIN', protocol: 'I2S', description: 'I2S Audio Data Stream (DIN)', wireColor: '#3b82f6' },
      { mcuPin: 'GP28', componentId: 'u2', componentPin: 'LCK', protocol: 'I2S', description: 'I2S Left/Right Clock (LRCLK)', wireColor: '#22c55e' }
    ],
    labGuide: {
      voltageSupplyNote: 'Audio output is sensitive to ground loops. Keep the analog audio jack cable isolated from dirty power lines like stepper motors or switching converters.',
      prerequisites: [
        'Raspberry Pi Pico (headers pre-soldered)',
        'PCM5102A I2S 3.5mm DAC breakout board',
        'Standard 3.5mm headphones or powered desktop speakers',
        'Breadboard and 5x jumper wires',
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
          title: 'Power and Ground',
          instruction: 'Connect Pico Pin 36 (3V3(OUT)) -> PCM5102A VIN. Connect Pico Pin 38 (GND) -> PCM5102A GND.'
        }
      ],
      testingProcedure: [
        'Plug in 3.5mm headphones to the DAC jack.',
        'Upload the firmware sketch.',
        'You should immediately hear a clear 440Hz (A4) test sine tone.',
        'Turn on the Serial Monitor to verify sampling rate is locked at 44.1kHz.'
      ],
      troubleshootingTips: [
        'Loud buzzing or hiss: DAC requires stable 3.3V; plug the Pico directly into a PC USB port rather than an unpowered USB hub.',
        'No sound: Check that the XSMT (soft mute) pin on the DAC module is pulled high or bridged properly on the PCB.'
      ]
    },
    firmwareCode: `#include <Arduino.h>
#include <I2S.h>

I2S i2s(OUTPUT);

const int sampleRate = 44100;
const float frequency = 440.0; // 440Hz Concert A tone
int phase = 0;

void setup() {
  Serial.begin(115200);
  
  // Set I2S pins: BCLK=0, LRCLK=28, DOUT=1
  i2s.setBCLK(0);
  i2s.setDATA(1);
  i2s.setBitsPerSample(16);
  
  if (!i2s.begin(sampleRate)) {
    Serial.println("Failed to initialize I2S!");
    while (1);
  }
  Serial.println("I2S Synthesizer Ready (440Hz Tone)");
}

void loop() {
  // Generate 16-bit sine wave
  float sample = sin((phase * 2.0 * PI * frequency) / sampleRate);
  int16_t sample16 = (int16_t)(sample * 16000.0);
  
  // Write stereo samples
  i2s.write(sample16);
  i2s.write(sample16);
  
  phase++;
  if (phase >= sampleRate) phase = 0;
}`,
    warnings: ['Use a clean 3.3V or 5V rail to prevent audio popping and noise.']
  }
};
