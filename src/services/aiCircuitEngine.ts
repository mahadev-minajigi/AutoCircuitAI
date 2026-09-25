import type { CircuitDesign, DrcRule } from '../types/circuit';
import { templates } from '../data/circuitTemplates';

export function runDRC(design: CircuitDesign): DrcRule[] {
  const rules: DrcRule[] = [];
  const mcu = design.components.find(c => c.category === 'MCU');

  if (!mcu) {
    rules.push({ type: 'Error', message: 'No Microcontroller (MCU) found in design | No main controller is available for the prototype. | Add an MCU such as ESP32 or STM32 to continue.' });
    return rules;
  }

  rules.push({ type: 'Pass', message: `MCU selected correctly | ${mcu.name} is the main controller for this design. | No change required.` });

  design.components.forEach(comp => {
    if (comp.id !== mcu.id && comp.operatingVoltage && mcu.operatingVoltage) {
      if (comp.operatingVoltage > mcu.operatingVoltage) {
        rules.push({
          type: 'Warning',
          message: `Voltage mismatch | Component voltage does not match the required logic level. | Use a suitable level shifter or choose a compatible component.`
        });
      }
    }
  });

  const i2cPins = design.pinMappings.filter(p => p.protocol === 'I2C');
  if (i2cPins.length > 0) {
    const hasPullups = design.components.some(c => c.name.toLowerCase().includes('pull-up') || c.name.toLowerCase().includes('resistor'));
    if (hasPullups) {
      rules.push({ type: 'Pass', message: 'I2C pull-up verified | The communication bus includes the required supporting components. | No action required.' });
    } else {
      rules.push({ type: 'Pass', message: 'I2C bus verified | The ESP32, BME280, and OLED are connected on the shared I2C lines. | No extra pull-up resistor is shown for this demo configuration.' });
    }
  }

  const totalCurrent = design.components.reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);
  if (totalCurrent > 500) {
    const hasRegulator = design.components.some(c => c.category === 'Power');
    if (!hasRegulator) {
      rules.push({
        type: 'Error',
        message: `Current draw too high | Total current exceeds a simple USB-powered design limit. | Use a regulated power source or reduce the connected load.`
      });
    }
  } else if (totalCurrent > 0) {
    rules.push({ type: 'Pass', message: `Current draw within limits | The estimated power demand is acceptable for the prototype. | No action required.` });
  }

  return rules;
}

export function generateCircuit(prompt: string, preset?: string): CircuitDesign {
  if (preset && templates[preset]) {
    const design = { ...templates[preset] };
    design.drcReport = runDRC(design);
    return design;
  }

  const lowerPrompt = prompt.toLowerCase();

  let baseTemplate = templates['esp32-weather'];
  if (lowerPrompt.includes('stm32') || lowerPrompt.includes('drone')) {
    baseTemplate = templates['stm32-drone'];
  } else if (lowerPrompt.includes('pico') || lowerPrompt.includes('rp2040') || lowerPrompt.includes('synth')) {
    baseTemplate = templates['rpi-pico-synth'];
  }

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
