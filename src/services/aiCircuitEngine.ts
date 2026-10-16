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

  // Voltage compatibility check
  design.components.forEach(comp => {
    if (comp.id !== mcu.id && comp.operatingVoltage && mcu.operatingVoltage) {
      if (comp.operatingVoltage > mcu.operatingVoltage) {
        rules.push({
          type: 'Warning',
          message: `Voltage mismatch on ${comp.name} | ${comp.name} operates at ${comp.operatingVoltage}V but ${mcu.name} logic level is ${mcu.operatingVoltage}V. | Use a level shifter or choose a ${mcu.operatingVoltage}V-compatible variant.`
        });
      } else {
        rules.push({
          type: 'Pass',
          message: `${comp.name} voltage compatible | ${comp.name} (${comp.operatingVoltage}V) is compatible with ${mcu.name} (${mcu.operatingVoltage}V). | No change required.`
        });
      }
    }
  });

  // I2C pull-up and bus checks
  const i2cPins = design.pinMappings.filter(p => p.protocol === 'I2C');
  if (i2cPins.length > 0) {
    const hasPullups = design.components.some(c => c.name.toLowerCase().includes('pull-up') || c.name.toLowerCase().includes('resistor'));
    if (hasPullups) {
      rules.push({ type: 'Pass', message: 'I2C pull-up verified | The communication bus includes the required supporting components. | No action required.' });
    } else {
      rules.push({ type: 'Pass', message: 'I2C pin mapping generated | SDA and SCL are mapped to the selected modules. | Verify that the modules provide I2C pull-up resistors.' });
    }
  }

  // I2C shared bus — address conflict warning
  const i2cDevices = new Set(
    design.pinMappings.filter(p => p.protocol === 'I2C').map(p => p.componentId)
  );
  if (i2cDevices.size > 1) {
    const deviceNames = [...i2cDevices].map(id => design.components.find(c => c.id === id)?.name || id);
    rules.push({
      type: 'Pass',
      message: `I2C bus shared by ${i2cDevices.size} devices | ${deviceNames.join(' and ')} share the same I2C bus. | Verify each device has a unique I2C address to avoid bus conflicts.`
    });
  }

  // SPI chip select verification
  const spiDevices = new Set(
    design.pinMappings.filter(p => p.protocol === 'SPI').map(p => p.componentId)
  );
  if (spiDevices.size > 0) {
    const csMappings = design.pinMappings.filter(
      p => p.protocol === 'SPI' && (p.componentPin.toLowerCase() === 'cs' || p.componentPin.toLowerCase().includes('nss'))
    );
    if (csMappings.length >= spiDevices.size) {
      rules.push({
        type: 'Pass',
        message: `SPI chip select lines assigned | Each SPI device has a dedicated CS line. | No change required.`
      });
    } else if (spiDevices.size > 1) {
      rules.push({
        type: 'Warning',
        message: `SPI chip select may be shared | Not all SPI devices have individual chip select lines. | Assign a dedicated CS pin for each SPI device to allow independent communication.`
      });
    }
  }

  // Unconnected peripheral pin detection
  design.components.forEach(comp => {
    if (comp.id === mcu.id) return;
    const mappedPins = new Set(
      design.pinMappings
        .filter(m => m.componentId === comp.id)
        .map(m => m.componentPin)
    );
    const unmapped = comp.pins.filter(pin => !mappedPins.has(pin));
    if (unmapped.length > 0) {
      rules.push({
        type: 'Warning',
        message: `${comp.name} has unconnected pins | Pins ${unmapped.join(', ')} on ${comp.name} are not mapped to the MCU. | Verify if these pins require connections or can safely be left floating.`
      });
    }
  });

  // Decoupling capacitor reminder for high-speed components
  const highSpeedParts = design.components.filter(c =>
    c.category === 'MCU' || c.name.toLowerCase().includes('mpu') || c.name.toLowerCase().includes('imu') || c.name.toLowerCase().includes('stm32')
  );
  const hasDecoupling = design.components.some(c =>
    c.name.toLowerCase().includes('capacitor') || c.name.toLowerCase().includes('cap') || c.name.toLowerCase().includes('decoupling')
  );
  if (highSpeedParts.length > 0 && !hasDecoupling) {
    rules.push({
      type: 'Warning',
      message: `No decoupling capacitors in BOM | High-speed ICs (${highSpeedParts.map(c => c.name).join(', ')}) need bypass capacitors near power pins. | Add 100nF ceramic capacitors close to each VCC/GND pair for stable operation.`
    });
  }

  // Power budget analysis
  const totalCurrent = design.components.reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);
  if (totalCurrent > 500) {
    const hasRegulator = design.components.some(c => c.category === 'Power');
    if (!hasRegulator) {
      rules.push({
        type: 'Error',
        message: `Current draw exceeds USB limit (${totalCurrent}mA) | Total current (${totalCurrent}mA) exceeds 500mA USB power. | Add a regulated external power supply or reduce connected load.`
      });
    } else {
      rules.push({
        type: 'Pass',
        message: `High current draw managed | Total ${totalCurrent}mA with external power regulation. | Monitor actual current during testing.`
      });
    }
  } else if (totalCurrent > 0) {
    rules.push({ type: 'Pass', message: `Current draw within USB limits (${totalCurrent}mA / 500mA) | Estimated total power demand is within safe range for USB-powered prototypes. | No action required.` });
  }

  // Pin count verification — check MCU has enough pins
  const usedMcuPins = new Set(design.pinMappings.map(m => m.mcuPin));
  if (mcu.pins.length > 0 && usedMcuPins.size > mcu.pins.length) {
    rules.push({
      type: 'Error',
      message: `MCU pin count exceeded | Design requires ${usedMcuPins.size} pins but ${mcu.name} exposes ${mcu.pins.length} pins in this model. | Consider using a larger MCU variant or reduce peripheral connections.`
    });
  } else {
    const pinUtilization = Math.round((usedMcuPins.size / Math.max(mcu.pins.length, 1)) * 100);
    rules.push({
      type: 'Pass',
      message: `MCU pin utilization: ${pinUtilization}% | Using ${usedMcuPins.size} of ${mcu.pins.length} modeled pins on ${mcu.name}. | Remaining pins are available for future expansion.`
    });
  }

  return rules;
}

export function generateNetlist(design: CircuitDesign): object {
  const netMap = new Map<string, { name: string; protocol: string; connections: { component: string; pin: string }[] }>();

  design.pinMappings.forEach(mapping => {
    const mcu = design.components.find(c => c.category === 'MCU');
    const comp = design.components.find(c => c.id === mapping.componentId);
    const netKey = `${mapping.protocol}:${mapping.mcuPin}`;

    if (!netMap.has(netKey)) {
      let netName = mapping.protocol === 'Power'
        ? `${mapping.mcuPin}_POWER`
        : mapping.protocol === 'GND'
          ? 'GND'
          : `${mapping.protocol}_${mapping.mcuPin}`;
      netMap.set(netKey, {
        name: netName,
        protocol: mapping.protocol,
        connections: [{ component: mcu?.name || 'MCU', pin: mapping.mcuPin }]
      });
    }

    netMap.get(netKey)!.connections.push({
      component: comp?.name || mapping.componentId,
      pin: mapping.componentPin
    });
  });

  return {
    designId: design.id,
    title: design.title,
    generatedAt: new Date().toISOString(),
    nets: [...netMap.values()]
  };
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
    components.push({ id: 'm1', name: 'L298N', description: 'Dual Motor Driver', category: 'Actuator', package: 'Module', estimatedCost: 350.00, pins: ['ENA', 'IN1', 'IN2', 'OUT1', 'OUT2'], operatingVoltage: 12.0, maxCurrent_mA: 2000 });
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
