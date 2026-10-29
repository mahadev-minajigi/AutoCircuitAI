import type { CircuitDesign, DrcRule } from '../types/circuit';
import { buttonLedTemplate, motorControllerTemplate, templates } from '../data/circuitTemplates';

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
    const hasLogicSignal = design.pinMappings.some(mapping => mapping.componentId === comp.id && ['GPIO', 'I2C', 'SPI', 'UART', 'ADC', 'PWM', 'I2S'].includes(mapping.protocol));
    if (comp.id !== mcu.id && hasLogicSignal && comp.operatingVoltage && mcu.operatingVoltage) {
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
  const invalidMappings: string[] = [];
  design.pinMappings.forEach(mapping => {
    const target = design.components.find(component => component.id === mapping.componentId);
    const source = mapping.sourceComponentId ? design.components.find(component => component.id === mapping.sourceComponentId) : mcu;
    if (!target || !source) {
      invalidMappings.push(`${mapping.mcuPin} → ${mapping.componentId}.${mapping.componentPin} (missing component)`);
      return;
    }
    const sourcePin = mapping.sourceComponentPin || mapping.mcuPin;
    if (!target.pins.includes(mapping.componentPin) || !source.pins.includes(sourcePin)) {
      invalidMappings.push(`${source.name}.${sourcePin} → ${target.name}.${mapping.componentPin}`);
    }
  });
  if (invalidMappings.length > 0) {
    rules.push({
      type: 'Error',
      message: `Invalid connections (${invalidMappings.length}) | ${invalidMappings.join('; ')} reference missing components or pins absent from the declared component pinouts. | Correct these mappings using the exact board and module pinouts.`
    });
  }

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
    // Module and breakout pins are often intentionally unused; only report pins
    // explicitly described as required when they are left unmapped.
    const mappedPins = new Set<string>();
    design.pinMappings.forEach(mapping => {
      if (mapping.componentId === comp.id) mappedPins.add(mapping.componentPin);
      if (mapping.sourceComponentId === comp.id) mappedPins.add(mapping.sourceComponentPin || mapping.mcuPin);
    });
    const requiredPins = comp.pins.filter(pin => {
      const description = comp.pinDescriptions?.[pin] || '';
      return /required|must be connected|do not leave floating/i.test(description);
    });
    const unmapped = requiredPins.filter(pin => !mappedPins.has(pin));
    if (unmapped.length > 0) {
      rules.push({
        type: 'Warning',
        message: `${comp.name} has unconnected pins | Pins ${unmapped.join(', ')} on ${comp.name} are not mapped to the MCU. | Verify if these pins require connections or can safely be left floating.`
      });
    }
  });

  // Decoupling capacitor reminder for high-speed components
  const highSpeedParts = design.components.filter(c =>
    (c.category === 'MCU' && !/arduino|dev ?board|pico|devkit/i.test(`${c.name} ${c.package}`)) || c.name.toLowerCase().includes('mpu') || c.name.toLowerCase().includes('imu') || c.name.toLowerCase().includes('stm32')
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
  // maxCurrent_mA is a component rating, not a measured/estimated load draw.
  // Sum only loads; exclude MCU capacity and power-supply ratings.
  const totalCurrent = design.components
    .filter(component => ['Sensor', 'Actuator'].includes(component.category))
    .reduce((sum, component) => sum + (component.maxCurrent_mA || 0), 0);
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
  const shortCheck = design.pinMappings.some(mapping => {
    const source = mapping.sourceComponentId ? design.components.find(component => component.id === mapping.sourceComponentId) : mcu;
    const target = design.components.find(component => component.id === mapping.componentId);
    const sourcePin = mapping.sourceComponentPin || mapping.mcuPin;
    const sourceGround = /^(gnd|ground)$/i.test(sourcePin);
    const targetGround = /^(gnd|ground)$/i.test(mapping.componentPin);
    const sourcePower = /^(vcc|vin|vout|3v3|5v|5v0)$/i.test(sourcePin);
    const targetPower = /^(vcc|vin|vout|3v3|5v|5v0)$/i.test(mapping.componentPin);
    return !!source && !!target && ((sourceGround && targetPower) || (sourcePower && targetGround));
  });
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
  const usedMcuPins = new Set(design.pinMappings.filter(mapping => !mapping.sourceComponentId).map(mapping => mapping.mcuPin));

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
    if (mapping.sourceComponentId && mapping.sourceComponentPin) {
      const netName = `Net-${mapping.sourceComponentId}_${mapping.sourceComponentPin}`;
      if (!netMap.has(netName)) netMap.set(netName, { name: netName, nodes: [] });
      netMap.get(netName)!.nodes.push(
        { ref: mapping.sourceComponentId, pin: mapping.sourceComponentPin },
        { ref: mapping.componentId, pin: mapping.componentPin }
      );
      return;
    }
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

function makeBlinkLedDesign(prompt: string): CircuitDesign {
  const components = buttonLedTemplate.components.filter(component => ['u1', 'd1', 'r_led'].includes(component.id));
  const pinMappings = buttonLedTemplate.pinMappings.filter(mapping =>
    ['d1', 'r_led'].includes(mapping.componentId) &&
    (!mapping.sourceComponentId || ['d1', 'r_led'].includes(mapping.sourceComponentId))
  );
  const design: CircuitDesign = {
    ...buttonLedTemplate,
    id: `arduino-blink-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Arduino Uno Blinking LED',
    description: `Blink an LED from Arduino Uno digital pin 13 through a 220Ω current-limiting resistor. Requested project: ${prompt}`,
    components,
    pinMappings,
    firmwareCode: `const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH);
  delay(1000);
  digitalWrite(ledPin, LOW);
  delay(1000);
}`,
    warnings: ['Use the 220Ω series resistor between D13 and the LED anode.'],
  };
  design.drcReport = runDRC(design);
  return design;
}

function makeAtmegaButtonBlinkDesign(prompt: string): CircuitDesign {
  const components: CircuitDesign['components'] = [
    { id: 'u1', name: 'ATmega328P-PU', description: '5V 8-bit AVR microcontroller in a 28-pin DIP package; use a 16MHz crystal for Arduino-compatible timing.', category: 'MCU', package: 'DIP-28', estimatedCost: 120, pins: ['VCC', 'AVCC', 'GND', 'RESET', 'XTAL1', 'XTAL2', 'PD7', 'PB5'], operatingVoltage: 5, maxCurrent_mA: 15 },
    { id: 'j1', name: 'Regulated 5V supply', description: 'Regulated 5V supply for the ATmega328P circuit; share the ground with all components.', category: 'Power', package: '2-pin connector', estimatedCost: 20, pins: ['5V', 'GND'], operatingVoltage: 5, maxCurrent_mA: 0 },
    { id: 'sw1', name: 'External momentary pushbutton', description: 'Normally-open button; use one contact pair on each side of the switch.', category: 'Actuator', package: 'Through-hole tactile switch', estimatedCost: 10, pins: ['1', '2', '3', '4'], operatingVoltage: 5, maxCurrent_mA: 1 },
    { id: 'r_button', name: '10kΩ button pull-down resistor', description: 'Holds PD7 LOW while the button is released.', category: 'Passive', package: 'Axial resistor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0.5 },
    { id: 'd1', name: 'Indicator LED', description: 'LED controlled by PB5 (Arduino-compatible digital pin 13).', category: 'Actuator', package: '5mm LED', estimatedCost: 3, pins: ['ANODE', 'CATHODE'], operatingVoltage: 2, maxCurrent_mA: 8 },
    { id: 'r_led', name: '330Ω LED current-limiting resistor', description: 'Series resistor between PB5 and the LED anode.', category: 'Passive', package: 'Axial resistor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 8 },
    { id: 'x1', name: '16MHz crystal', description: 'External clock crystal connected between XTAL1 and XTAL2.', category: 'Passive', package: 'Through-hole crystal', estimatedCost: 10, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0 },
    { id: 'c1', name: '22pF crystal load capacitor (XTAL1)', description: 'Connect between the XTAL1 crystal node and GND; verify crystal datasheet load capacitance.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0 },
    { id: 'c2', name: '22pF crystal load capacitor (XTAL2)', description: 'Connect between the XTAL2 crystal node and GND; verify crystal datasheet load capacitance.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0 },
    { id: 'r_reset', name: '10kΩ RESET pull-up resistor', description: 'Keeps RESET deasserted by pulling it up to 5V.', category: 'Passive', package: 'Axial resistor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0.5 },
    { id: 'c_decouple', name: '100nF decoupling capacitor', description: 'Place close to the ATmega328P VCC and GND pins.', category: 'Passive', package: 'Ceramic capacitor', estimatedCost: 2, pins: ['1', '2'], operatingVoltage: 5, maxCurrent_mA: 0 },
  ];
  const pinMappings: CircuitDesign['pinMappings'] = [
    { mcuPin: '5V', sourceComponentId: 'j1', sourceComponentPin: '5V', componentId: 'u1', componentPin: 'VCC', protocol: 'Power', description: 'Regulated 5V supply to ATmega328P VCC.' },
    { mcuPin: '5V', sourceComponentId: 'j1', sourceComponentPin: '5V', componentId: 'u1', componentPin: 'AVCC', protocol: 'Power', description: 'Tie AVCC to 5V even when the ADC is unused.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'u1', componentPin: 'GND', protocol: 'GND', description: 'Common ground for ATmega328P.' },
    { mcuPin: '5V', sourceComponentId: 'j1', sourceComponentPin: '5V', componentId: 'sw1', componentPin: '1', protocol: 'Power', description: 'Button supply side; pins 1/2 are one internally connected pair.' },
    { mcuPin: 'PD7', componentId: 'sw1', componentPin: '3', protocol: 'GPIO', description: 'Button signal; pins 3/4 are the other internally connected pair.' },
    { mcuPin: 'PD7', componentId: 'r_button', componentPin: '1', protocol: 'GPIO', description: 'Button input node to pull-down resistor.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'r_button', componentPin: '2', protocol: 'GND', description: 'Pull-down resistor returns to common ground.' },
    { mcuPin: 'PB5', componentId: 'r_led', componentPin: '1', protocol: 'GPIO', description: 'PB5 drives the LED through its series resistor.' },
    { mcuPin: 'PB5', sourceComponentId: 'r_led', sourceComponentPin: '2', componentId: 'd1', componentPin: 'ANODE', protocol: 'GPIO', description: 'Resistor output to LED anode.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'd1', componentPin: 'CATHODE', protocol: 'GND', description: 'LED cathode returns to common ground.' },
    { mcuPin: 'XTAL1', componentId: 'x1', componentPin: '1', protocol: 'GPIO', description: 'Crystal terminal 1 to XTAL1.' },
    { mcuPin: 'XTAL2', componentId: 'x1', componentPin: '2', protocol: 'GPIO', description: 'Crystal terminal 2 to XTAL2.' },
    { mcuPin: 'XTAL1', componentId: 'c1', componentPin: '1', protocol: 'GPIO', description: 'XTAL1 crystal node to load capacitor.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'c1', componentPin: '2', protocol: 'GND', description: 'XTAL1 load capacitor to ground.' },
    { mcuPin: 'XTAL2', componentId: 'c2', componentPin: '1', protocol: 'GPIO', description: 'XTAL2 crystal node to load capacitor.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'c2', componentPin: '2', protocol: 'GND', description: 'XTAL2 load capacitor to ground.' },
    { mcuPin: 'RESET', componentId: 'r_reset', componentPin: '1', protocol: 'GPIO', description: 'RESET pin to pull-up resistor.' },
    { mcuPin: '5V', sourceComponentId: 'j1', sourceComponentPin: '5V', componentId: 'r_reset', componentPin: '2', protocol: 'Power', description: 'RESET pull-up terminates at 5V.' },
    { mcuPin: '5V', sourceComponentId: 'j1', sourceComponentPin: '5V', componentId: 'c_decouple', componentPin: '1', protocol: 'Power', description: 'Local VCC decoupling capacitor.' },
    { mcuPin: 'GND', sourceComponentId: 'j1', sourceComponentPin: 'GND', componentId: 'c_decouple', componentPin: '2', protocol: 'GND', description: 'Local decoupling capacitor ground.' },
  ];
  const design: CircuitDesign = {
    id: `atmega-button-blink-${Math.random().toString(36).slice(2, 9)}`,
    title: 'ATmega328P Pushbutton-Controlled LED Blinker',
    description: `A standalone ATmega328P-PU circuit where an external pushbutton toggles a 1Hz LED blink on PB5. Requested project: ${prompt}`,
    components,
    pinMappings,
    firmwareCode: `const uint8_t buttonPin = 7; // PD7
const uint8_t ledPin = 13;    // PB5
bool blinking = false;
bool lastButtonReading = LOW;
bool buttonState = LOW;
unsigned long lastDebounceTime = 0;
unsigned long lastBlinkTime = 0;
const unsigned long debounceMs = 30;
const unsigned long blinkIntervalMs = 500;

void setup() {
  pinMode(buttonPin, INPUT);  // External 10kΩ pull-down
  pinMode(ledPin, OUTPUT);
}

void loop() {
  const bool reading = digitalRead(buttonPin);
  if (reading != lastButtonReading) lastDebounceTime = millis();
  if (millis() - lastDebounceTime >= debounceMs && reading != buttonState) {
    buttonState = reading;
    if (buttonState == HIGH) blinking = !blinking;
  }
  lastButtonReading = reading;

  if (!blinking) {
    digitalWrite(ledPin, LOW);
  } else if (millis() - lastBlinkTime >= blinkIntervalMs) {
    lastBlinkTime = millis();
    digitalWrite(ledPin, digitalRead(ledPin) == LOW ? HIGH : LOW);
  }
}`,
    warnings: [
      'This is a bare ATmega328P circuit: provide a regulated 5V supply, program the chip using an ISP programmer or a preloaded bootloader, and configure fuses for the 16MHz crystal.',
      'The 16MHz crystal and its load capacitors must match the crystal datasheet. Confirm the MCU package pinout before wiring.',
      'The output monitor cannot model button input, conditionals, or millis()-based timing, so it will not show a firmware-derived waveform for this sketch.',
    ],
  };
  design.drcReport = runDRC(design);
  return design;
}

export function generateCircuitLocal(prompt: string, preset?: string): CircuitDesign {
  if (!preset && /\batmega\s*328(?:p)?\b/i.test(prompt) && /\bled\b/i.test(prompt) && /\b(?:button|switch)\b/i.test(prompt)) {
    return makeAtmegaButtonBlinkDesign(prompt);
  }
  if (!preset && /\b(?:push[ -]?button|button)\b/i.test(prompt) && /\b(?:blink|led)\b/i.test(prompt) && /\b(?:uno|arduino)\b/i.test(prompt)) {
    const design = { ...buttonLedTemplate, components: buttonLedTemplate.components.map(component => ({ ...component, pins: [...component.pins] })), pinMappings: buttonLedTemplate.pinMappings.map(mapping => ({ ...mapping })) };
    design.id = `button-led-${Math.random().toString(36).slice(2, 9)}`;
    design.description = `${buttonLedTemplate.description} Requested project: ${prompt}`;
    design.drcReport = runDRC(design);
    return design;
  }
  if (!preset && /motor/i.test(prompt) && /l298n|arduino\s*uno/i.test(prompt)) {
    const design = { ...motorControllerTemplate, components: motorControllerTemplate.components.map(component => ({ ...component, pins: [...component.pins] })), pinMappings: motorControllerTemplate.pinMappings.map(mapping => ({ ...mapping })) };
    design.id = `motor-${Math.random().toString(36).slice(2, 9)}`;
    design.description = `${motorControllerTemplate.description} Requested project: ${prompt}`;
    design.drcReport = runDRC(design);
    return design;
  }
  if (!preset && /\b(?:blink|flash)\b/i.test(prompt) && /\bled\b/i.test(prompt) && /\b(?:uno|arduino)\b/i.test(prompt) && !/\bbutton\b/i.test(prompt)) {
    return makeBlinkLedDesign(prompt);
  }
  if (preset && templates[preset]) {
    const design = { ...templates[preset] };
    design.drcReport = runDRC(design);
    return design;
  }

  const lowerPrompt = prompt.toLowerCase();

  let baseTemplate = templates['esp32-weather'];
  let isSupportedMatch = true;
  if (lowerPrompt.includes('stm32') || lowerPrompt.includes('drone')) {
    baseTemplate = templates['stm32-drone'];
  } else if (lowerPrompt.includes('pico') || lowerPrompt.includes('rp2040') || lowerPrompt.includes('synth')) {
    baseTemplate = templates['rpi-pico-synth'];
  } else if (/\b(?:bme280|weather|temperature|humidity|pressure|oled|ssd1306)\b/i.test(prompt)) {
    baseTemplate = templates['esp32-weather'];
  } else if (/\b(?:esp32|esp-32)\b/i.test(prompt)) {
    baseTemplate = templates['esp32-weather'];
    isSupportedMatch = false;
  } else {
    isSupportedMatch = false;
  }

  const components = [...baseTemplate.components];

  const generatedDesign: CircuitDesign = {
    ...baseTemplate,
    id: 'ai-generated-' + Math.random().toString(36).substring(7),
    title: 'AI Generated: ' + (baseTemplate.title.includes('Custom') ? 'Custom Build' : baseTemplate.title),
    description: `Synthesized from: "${prompt}"`,
    components,
    pinMappings: baseTemplate.pinMappings,
    warnings: isSupportedMatch
      ? ['Template-matched circuit generated for this supported request. Review the DRC report before prototyping.']
      : [`This request could not be matched to a validated local circuit template. The displayed ${baseTemplate.title} design is only a starting point and may not meet the prompt. Configure the AI backend for custom circuit synthesis.`]
  };

  generatedDesign.drcReport = runDRC(generatedDesign);

  return generatedDesign;
}

export async function generateCircuit(prompt: string, preset?: string): Promise<CircuitDesign> {
  let response: Response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, preset }),
    });
  } catch {
    const fallback = generateCircuitLocal(prompt, preset);
    fallback.warnings = [
      ...fallback.warnings,
      'The generation backend could not be reached. This local template fallback may not match your prompt; review every component and connection.',
    ];
    return fallback;
  }

  if (!response.ok) {
    let detail = `Generation API returned HTTP ${response.status}.`;
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch {
      // Keep the HTTP status as an actionable error if the response is not JSON.
    }
    throw new Error(detail);
  }

  const data: CircuitDesign = await response.json();
  if (!data || !Array.isArray(data.components) || !Array.isArray(data.pinMappings) || typeof data.firmwareCode !== 'string') {
    throw new Error('Generation API returned an incomplete circuit. No design was loaded.');
  }

  // Always evaluate with current client rules; do not trust cached API reports.
  data.drcReport = runDRC(data);
  return data;
}
