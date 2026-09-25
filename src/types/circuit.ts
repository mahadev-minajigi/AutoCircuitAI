export interface Component {
  id: string;
  name: string;
  description: string;
  category: 'MCU' | 'Sensor' | 'Actuator' | 'Power' | 'Passive' | 'Connector';
  package: string;
  estimatedCost: number;
  pins: string[];
  operatingVoltage?: number; // Added for DRC (e.g. 3.3 or 5)
  maxCurrent_mA?: number;    // Added for DRC (e.g. 250)
}

export interface PinMapping {
  mcuPin: string;
  componentId: string;
  componentPin: string;
  protocol: 'GPIO' | 'I2C' | 'SPI' | 'UART' | 'ADC' | 'PWM' | 'Power' | 'GND' | 'I2S';
  description: string;
}

export interface DrcRule {
  type: 'Error' | 'Warning' | 'Pass';
  message: string;
}

export interface CircuitDesign {
  id: string;
  title: string;
  description: string;
  components: Component[];
  pinMappings: PinMapping[];
  firmwareCode: string;
  warnings: string[];
  drcReport?: DrcRule[];
}
