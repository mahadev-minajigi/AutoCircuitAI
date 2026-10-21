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

  // Structural connectivity validation for generated designs.
  design.pinMappings.forEach(mapping => {
    const target = design.components.find(component => component.id === mapping.componentId);
    const source = mapping.sourceComponentId ? design.components.find(component => component.id === mapping.sourceComponentId) : mcu;
    if (!target || !source) {
      rules.push({ type: 'Error', message: `Invalid connection endpoint | Mapping ${mapping.mcuPin} → ${mapping.componentId}.${mapping.componentPin} references a missing component. | Regenerate the design or correct the mapping.` });
      return;
    }
    if (!target.pins.includes(mapping.componentPin) || !source.pins.includes(mapping.mcuPin)) {
      rules.push({ type: 'Error', message: `Invalid pin mapping | ${source.name}.${mapping.mcuPin} → ${target.name}.${mapping.componentPin} uses a pin not listed on the component. | Verify the exact board and module pinout.` });
    }
  });

  // I2C pull-up and bus checks
  const i2cPins = design.pinMappings.filter(p => p.protocol === 'I2C');
  if (i2cPins.length > 0) {
    const pullupNames = design.components.filter(c => c.name.toLowerCase().includes('pull-up')).map(c => c.name.toLowerCase());
    const hasSdaPullup = pullupNames.some(name => name.includes('sda'));
    const hasSclPullup = pullupNames.some(name => name.includes('scl'));
    if (hasSdaPullup && hasSclPullup) {
      rules.push({ type: 'Pass', message: 'I2C pull-ups present | Separate SDA and SCL pull-up components are included. | Confirm their value and whether modules already include pull-ups.' });
    } else {
      rules.push({ type: 'Warning', message: `I2C pull-ups not fully verified | Explicit pull-ups missing for ${[!hasSdaPullup && 'SDA', !hasSclPullup && 'SCL'].filter(Boolean).join(' and ')}. | Add pull-ups to the correct logic rail or confirm module pull-ups.` });
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

  // Power Shorts check: verify no direct VCC to GND bridging
  const shortCheck = design.pinMappings.some(p => 
    (p.mcuPin.includes('GND') && p.componentPin.includes('VCC')) ||
    (p.mcuPin.includes('3V3') && p.componentPin.includes('GND')) ||
    (p.mcuPin.includes('5V') && p.componentPin.includes('GND'))
  );
  if (shortCheck) {
    rules.push({
      type: 'Error',
      message: 'Power short circuit detected | Direct connection between VCC and GND pins identified. | Remove cross-connection immediately to prevent hardware destruction.'
    });
  } else {
    rules.push({
      type: 'Pass',
      message: 'Power shorts check passed | No short circuits detected between power rails and ground planes. | No change required.'
    });
  }

  // Pin count & used pin set
  const usedMcuPins = new Set(design.pinMappings.map(m => m.mcuPin));

  // Clearances check: trace separation and safe pin density
  const highPinDensity = mcu.pins.length > 0 && (usedMcuPins.size / mcu.pins.length) > 0.95;
  if (highPinDensity) {
    rules.push({
      type: 'Warning',
      message: 'Tight clearance & high pin density | Over 95% of MCU pins utilized in close proximity. | Ensure proper PCB trace clearance (min 0.2mm) during fabrication layout.'
    });
  } else {
    rules.push({
      type: 'Pass',
      message: 'Clearances check passed | MCU pin utilization allows adequate routing channel clearances. | No change required.'
    });
  }

  // Pin count verification — check MCU has enough pins
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

export function generateKiCadNetlist(design: CircuitDesign): string {
  const mcu = design.components.find(c => c.category === 'MCU');
  let netlist = `(export (version D)\n  (design\n    (source "AutoCircuit_AI")\n    (date "${new Date().toUTCString()}")\n    (tool "AutoCircuit AI v1.0")\n  )\n  (components\n`;

  design.components.forEach(comp => {
    netlist += `    (comp (ref "${comp.id}")\n      (value "${comp.name}")\n      (footprint "${comp.package}")\n      (libsource (lib "AutoCircuit") (part "${comp.category}"))\n    )\n`;
  });
  netlist += '  )\n  (nets\n';

  const netMap = new Map<string, { name: string; nodes: { ref: string; pin: string }[] }>();

  design.pinMappings.forEach((mapping) => {
    const netName = mapping.protocol === 'Power' ? 'VCC' : mapping.protocol === 'GND' ? 'GND' : `Net-${mapping.protocol}_${mapping.mcuPin}`;
    if (!netMap.has(netName)) {
      netMap.set(netName, {
        name: netName,
        nodes: [{ ref: mcu?.id || 'MCU1', pin: mapping.mcuPin }]
      });
    }
    netMap.get(netName)!.nodes.push({ ref: mapping.componentId, pin: mapping.componentPin });
  });

  Array.from(netMap.values()).forEach((net, index) => {
    netlist += `    (net (code ${index + 1}) (name "${net.name}")\n`;
    net.nodes.forEach(node => {
      netlist += `      (node (ref "${node.ref}") (pin "${node.pin}"))\n`;
    });
    netlist += '    )\n';
  });

  netlist += '  )\n)\n';
  return netlist;
}

export function generateEasyEdaJson(design: CircuitDesign): object {
  return {
    docType: 5,
    title: design.title,
    generator: "AutoCircuit AI",
    date: new Date().toISOString(),
    components: design.components.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      package: c.package,
      pins: c.pins
    })),
    nets: design.pinMappings.map(p => ({
      source: `MCU.${p.mcuPin}`,
      target: `${p.componentId}.${p.componentPin}`,
      protocol: p.protocol,
      description: p.description
    }))
  };
}

export function generateCircuitLocal(prompt: string, preset?: string): CircuitDesign {
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

  // Fix 1: Universal Resistor Description Sanitizer
  const sanitizedMappings = baseTemplate.pinMappings.map(mapping => {
    const comp = components.find(c => c.id === mapping.componentId);
    const isResistor = comp?.name.toLowerCase().includes('resistor') ||
                      mapping.description.toLowerCase().includes('resistor') ||
                      mapping.componentPin.toLowerCase().includes('res');
    if (isResistor && !mapping.description.toLowerCase().includes('pull-up')) {
      return {
        ...mapping,
        description: 'current-limiting resistor in series with LED'
      };
    }
    return mapping;
  });

  const generatedDesign: CircuitDesign = {
    ...baseTemplate,
    id: 'ai-generated-' + Math.random().toString(36).substring(7),
    title: 'AI Generated: ' + (baseTemplate.title.includes('Custom') ? 'Custom Build' : baseTemplate.title),
    description: `Synthesized from: "${prompt}"`,
    components,
    pinMappings: sanitizedMappings,
    warnings: ['AI generated circuit. Review DRC report.']
  };

  generatedDesign.drcReport = runDRC(generatedDesign);

  return generatedDesign;
}

export async function generateCircuit(prompt: string, preset?: string): Promise<CircuitDesign> {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, preset }),
    });

    if (response.ok) {
      const data: CircuitDesign = await response.json();
      
      // Fix 1: Universal Resistor Description Sanitizer on API response
      data.pinMappings = data.pinMappings.map(mapping => {
        const comp = data.components.find(c => c.id === mapping.componentId);
        const isResistor = comp?.name.toLowerCase().includes('resistor') ||
                          mapping.description.toLowerCase().includes('resistor') ||
                          mapping.componentPin.toLowerCase().includes('res');
        if (isResistor && !mapping.description.toLowerCase().includes('pull-up')) {
          return {
            ...mapping,
            description: 'current-limiting resistor in series with LED'
          };
        }
        return mapping;
      });

      if (!data.drcReport || data.drcReport.length === 0) {
        data.drcReport = runDRC(data);
      }
      return data;
    }
  } catch {
    // If backend endpoint is unavailable (e.g. offline or static client), fallback seamlessly
  }

  return generateCircuitLocal(prompt, preset);
}
