import type { CircuitDesign, DrcRule } from '../types/circuit';
import { templates } from '../data/circuitTemplates';

export function runDRC(design: CircuitDesign): DrcRule[] {
  const rules: DrcRule[] = [];
  const mcu = design.components.find(c => c.category === 'MCU');

  if (!mcu) {
    rules.push({ type: 'Error', message: 'No Microcontroller (MCU) found in design.' });
    return rules;
  }

  rules.push({ type: 'Pass', message: `MCU ${mcu.name} selected as main controller.` });

  // Voltage compatibility check
  design.components.forEach(comp => {
    if (comp.id !== mcu.id && comp.operatingVoltage && mcu.operatingVoltage) {
      if (comp.operatingVoltage > mcu.operatingVoltage) {
        rules.push({ 
          type: 'Warning', 
          message: `Voltage Mismatch: ${comp.name} operates at ${comp.operatingVoltage}V, but MCU logic is ${mcu.operatingVoltage}V. Ensure level shifting is used.` 
        });
      }
    }
  });

  // I2C Pull-up check
  const i2cPins = design.pinMappings.filter(p => p.protocol === 'I2C');
  if (i2cPins.length > 0) {
    const hasPullups = design.components.some(c => c.name.toLowerCase().includes('pull-up'));
    if (!hasPullups) {
      rules.push({ type: 'Warning', message: 'I2C protocol used but no pull-up resistors found in the BOM.' });
    } else {
      rules.push({ type: 'Pass', message: 'I2C pull-up resistors verified.' });
    }
  }

  // Current limit check (mock check: total current > 500mA without dedicated power supply)
  const totalCurrent = design.components.reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);
  if (totalCurrent > 500) {
    const hasRegulator = design.components.some(c => c.category === 'Power');
    if (!hasRegulator) {
      rules.push({ type: 'Error', message: `Total estimated current (${totalCurrent}mA) exceeds standard USB limits without a dedicated voltage regulator.` });
    }
  } else if (totalCurrent > 0) {
    rules.push({ type: 'Pass', message: `Estimated power draw (${totalCurrent}mA) is within safe limits.` });
  }

  return rules;
}

export function generateCircuit(prompt: string, preset?: string): CircuitDesign {
  if (preset && templates[preset]) {
    const design = { ...templates[preset] };
    design.drcReport = runDRC(design);
    return design;
  }
  
  // Dynamic parsing simulation
  const lowerPrompt = prompt.toLowerCase();
  
  let baseTemplate = templates['esp32-weather'];
  if (lowerPrompt.includes('stm32') || lowerPrompt.includes('drone')) {
    baseTemplate = templates['stm32-drone'];
  } else if (lowerPrompt.includes('pico') || lowerPrompt.includes('rp2040') || lowerPrompt.includes('synth')) {
    baseTemplate = templates['rpi-pico-synth'];
  } else if (lowerPrompt.includes('arduino')) {
    // Generate a custom Arduino circuit on the fly
    baseTemplate = {
      id: 'custom-arduino-' + Math.random().toString(36).substring(7),
      title: 'Arduino Custom Build',
      description: `Generated based on: "${prompt}"`,
      components: [
        { id: 'u1', name: 'Arduino Uno R3', description: 'ATmega328P 16MHz', category: 'MCU', package: 'DIP-28', estimatedCost: 20.00, pins: ['5V', 'GND', 'A0', 'D2', 'D3'], operatingVoltage: 5.0 },
      ],
      pinMappings: [],
      firmwareCode: 'void setup() {\n  // Auto-generated Arduino setup\n}\n\nvoid loop() {\n  // Auto-generated loop\n}',
      warnings: []
    };
  }

  // If user asked for motor or display, add dummy components dynamically
  const components = [...baseTemplate.components];
  if (lowerPrompt.includes('motor')) {
    components.push({ id: 'm1', name: 'L298N', description: 'Dual Motor Driver', category: 'Actuator', package: 'Module', estimatedCost: 3.50, pins: ['ENA', 'IN1', 'IN2', 'OUT1', 'OUT2'], operatingVoltage: 12.0, maxCurrent_mA: 2000 });
  }

  const generatedDesign: CircuitDesign = {
    ...baseTemplate,
    id: 'ai-generated-' + Math.random().toString(36).substring(7),
    title: 'AI Generated: ' + (baseTemplate.title.includes('Custom') ? 'Custom Build' : baseTemplate.title),
    description: `Synthesized from: "${prompt}"`,
    components,
    warnings: ['AI generated circuit. Review DRC report.']
  };

  generatedDesign.drcReport = runDRC(generatedDesign);

  return generatedDesign;
}
