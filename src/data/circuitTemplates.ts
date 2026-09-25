import type { CircuitDesign } from '../types/circuit';

export const templates: Record<string, CircuitDesign> = {
  'esp32-weather': {
    id: 't-esp32-weather',
    title: 'ESP32 IoT Weather Station',
    description: 'A temperature, humidity, and pressure monitoring system using ESP32, BME280, and a small OLED display.',
    components: [
      { id: 'u1', name: 'ESP32-WROOM-32', description: 'Wi-Fi & Bluetooth MCU Module', category: 'MCU', package: 'SMD-38', estimatedCost: 3.50, pins: ['3V3', 'GND', 'EN', 'IO21', 'IO22'], operatingVoltage: 3.3 },
      { id: 's1', name: 'BME280', description: 'Temp, Humidity, Pressure Sensor', category: 'Sensor', package: 'LGA-8', estimatedCost: 4.20, pins: ['VCC', 'GND', 'SCL', 'SDA'], operatingVoltage: 3.3, maxCurrent_mA: 1 },
      { id: 'd1', name: 'SSD1306 OLED 0.96"', description: 'I2C Monochrome Display', category: 'Actuator', package: 'Module', estimatedCost: 2.80, pins: ['VCC', 'GND', 'SCL', 'SDA'], operatingVoltage: 3.3, maxCurrent_mA: 20 },
      { id: 'r1', name: '10k Resistor', description: 'I2C Pull-up Resistor', category: 'Passive', package: '0805', estimatedCost: 0.05, pins: ['1', '2'] },
      { id: 'r2', name: '10k Resistor', description: 'I2C Pull-up Resistor', category: 'Passive', package: '0805', estimatedCost: 0.05, pins: ['1', '2'] }
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: '3.3V Power to Sensor' },
      { mcuPin: '3V3', componentId: 'd1', componentPin: 'VCC', protocol: 'Power', description: '3.3V Power to Display' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground' },
      { mcuPin: 'GND', componentId: 'd1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground' },
      { mcuPin: 'IO21', componentId: 's1', componentPin: 'SDA', protocol: 'I2C', description: 'I2C Data Line (Shared)' },
      { mcuPin: 'IO21', componentId: 'd1', componentPin: 'SDA', protocol: 'I2C', description: 'I2C Data Line (Shared)' },
      { mcuPin: 'IO22', componentId: 's1', componentPin: 'SCL', protocol: 'I2C', description: 'I2C Clock Line (Shared)' },
      { mcuPin: 'IO22', componentId: 'd1', componentPin: 'SCL', protocol: 'I2C', description: 'I2C Clock Line (Shared)' }
    ],
    firmwareCode: `
#include <Wire.h>
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
  Wire.begin(I2C_SDA, I2C_SCL);
  
  if (!bme.begin(0x76)) {
    Serial.println("Could not find a valid BME280 sensor, check wiring!");
    while (1);
  }
  
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  
  display.clearDisplay();
  display.setTextColor(WHITE);
}

void loop() {
  display.clearDisplay();
  display.setCursor(0, 0);
  
  display.print("Temp: ");
  display.print(bme.readTemperature());
  display.println(" C");
  
  display.print("Humidity: ");
  display.print(bme.readHumidity());
  display.println(" %");
  
  display.display();
  delay(2000);
}
    `.trim(),
    warnings: ['Ensure external power supply if OLED draws > 200mA', 'BME280 requires 3.3V logic (ESP32 is natively 3.3V)']
  },
  'stm32-drone': {
    id: 't-stm32-drone',
    title: 'STM32 Drone Flight Controller',
    description: 'High-performance flight controller using STM32F405, MPU6000 IMU, and Betaflight standard layout.',
    components: [
      { id: 'u1', name: 'STM32F405RGT6', description: 'ARM Cortex-M4 MCU 168MHz', category: 'MCU', package: 'LQFP-64', estimatedCost: 6.50, pins: ['3V3', 'GND', 'PA5', 'PA6', 'PA7', 'PA4'], operatingVoltage: 3.3 },
      { id: 's1', name: 'MPU6000', description: '6-Axis Gyro/Accel (SPI)', category: 'Sensor', package: 'QFN-24', estimatedCost: 5.20, pins: ['VCC', 'GND', 'SCLK', 'MISO', 'MOSI', 'CS'], operatingVoltage: 3.3, maxCurrent_mA: 4 },
      { id: 'p1', name: 'LDO 3.3V', description: 'Voltage Regulator 500mA', category: 'Power', package: 'SOT-223', estimatedCost: 0.45, pins: ['VIN', 'GND', 'VOUT'] },
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 's1', componentPin: 'VCC', protocol: 'Power', description: '3.3V Power to IMU' },
      { mcuPin: 'GND', componentId: 's1', componentPin: 'GND', protocol: 'GND', description: 'Common Ground' },
      { mcuPin: 'PA5', componentId: 's1', componentPin: 'SCLK', protocol: 'SPI', description: 'SPI1 Clock' },
      { mcuPin: 'PA6', componentId: 's1', componentPin: 'MISO', protocol: 'SPI', description: 'SPI1 MISO' },
      { mcuPin: 'PA7', componentId: 's1', componentPin: 'MOSI', protocol: 'SPI', description: 'SPI1 MOSI' },
      { mcuPin: 'PA4', componentId: 's1', componentPin: 'CS', protocol: 'SPI', description: 'SPI1 Chip Select' }
    ],
    firmwareCode: `// Betaflight target configuration standard
// Define SPI1 for MPU6000
#define USE_SPI
#define USE_SPI_DEVICE_1

#define SPI1_SCK_PIN    PA5
#define SPI1_MISO_PIN   PA6
#define SPI1_MOSI_PIN   PA7

#define USE_GYRO
#define USE_GYRO_SPI_MPU6000
#define GYRO_1_CS_PIN   PA4
#define GYRO_1_SPI_INSTANCE SPI1`,
    warnings: ['MPU6000 requires very clean 3.3V power, add decoupling capacitors close to VCC pin']
  },
  'rpi-pico-synth': {
    id: 't-rpi-pico-synth',
    title: 'RP2040 MIDI Synthesizer',
    description: 'A wavetable synthesizer using Raspberry Pi Pico, standard MIDI DIN input, and I2S DAC.',
    components: [
      { id: 'u1', name: 'RP2040 (Pi Pico)', description: 'Dual-core ARM Cortex-M0+', category: 'MCU', package: 'Module', estimatedCost: 4.00, pins: ['3V3', 'GND', 'GP0', 'GP1', 'GP26'], operatingVoltage: 3.3 },
      { id: 'u2', name: 'PCM5102A', description: 'I2S Audio DAC', category: 'Actuator', package: 'Module', estimatedCost: 3.50, pins: ['VIN', 'GND', 'BCK', 'DIN', 'LCK'], operatingVoltage: 3.3 },
      { id: 'u3', name: '6N137', description: 'High-speed Optocoupler (MIDI In)', category: 'Passive', package: 'DIP-8', estimatedCost: 0.80, pins: ['VCC', 'GND', 'OUT'], operatingVoltage: 5.0 }
    ],
    pinMappings: [
      { mcuPin: '3V3', componentId: 'u2', componentPin: 'VIN', protocol: 'Power', description: 'Power to DAC' },
      { mcuPin: 'GND', componentId: 'u2', componentPin: 'GND', protocol: 'GND', description: 'Common Ground' },
      { mcuPin: 'GP0', componentId: 'u2', componentPin: 'BCK', protocol: 'I2S', description: 'I2S Bit Clock' },
      { mcuPin: 'GP1', componentId: 'u2', componentPin: 'DIN', protocol: 'I2S', description: 'I2S Data' }
    ],
    firmwareCode: `
#include <I2S.h>

I2S i2s(OUTPUT);

void setup() {
  // Initialize I2S at 44.1kHz, 16-bit
  i2s.begin(I2S_PHILIPS_MODE, 44100, 16);
}

void loop() {
  // Generate simple sine wave
  for(int i=0; i<360; i++) {
    int16_t sample = sin(i * PI / 180.0) * 32000;
    i2s.write(sample);
    i2s.write(sample); // Stereo right
  }
}`,
    warnings: ['MIDI IN optocoupler requires 5V supply, RP2040 logic is 3.3V (requires voltage level shifting)']
  }
};
