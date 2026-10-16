export interface LabStep {
  stepNumber: number;
  title: string;
  instruction: string;
  caution?: string;
}

export interface LabGuide {
  prerequisites: string[];
  breadboardWiringSteps: LabStep[];
  testingProcedure: string[];
  troubleshootingTips: string[];
  voltageSupplyNote: string;
}

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
  pinDescriptions?: Record<string, string>; // e.g. { "VCC": "3.3V Power", "SDA": "I2C Data" }
}

export interface PinMapping {
  mcuPin: string;
  componentId: string;
  componentPin: string;
  protocol: 'GPIO' | 'I2C' | 'SPI' | 'UART' | 'ADC' | 'PWM' | 'Power' | 'GND' | 'I2S';
  description: string;
  wireColor?: string; // Standard practical breadboard wire color (e.g. Red for 3.3V, Black for GND, Yellow for SDA)
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
  labGuide?: LabGuide;
}

