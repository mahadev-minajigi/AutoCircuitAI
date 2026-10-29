import type { CircuitDesign } from '../types/circuit';

interface LedWrite {
  atMs: number;
  pin: string;
  high: boolean;
}

export interface FirmwareSimulationPlan {
  isSupported: boolean;
  message: string;
  durationMs: number;
  writes: LedWrite[];
  outputPins: Set<string>;
  ledPins: Map<string, string>;
}

const unsupportedPlan = (message: string, ledPins = new Map<string, string>()): FirmwareSimulationPlan => ({
  isSupported: false,
  message,
  durationMs: 0,
  writes: [],
  outputPins: new Set(),
  ledPins,
});

export function normalizeFirmwarePin(pin: string) {
  return pin.trim().toUpperCase()
    .replace(/^GPIO/, '')
    .replace(/^(?:GP|D|A)(?=\d)/, '');
}

function stripCommentsAndStrings(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
}

function extractLoopBody(source: string) {
  const loop = /\bvoid\s+loop\s*\(\s*\)\s*\{/i.exec(source);
  if (!loop) return null;

  const start = loop.index + loop[0].length;
  let depth = 1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index);
    }
  }
  return null;
}

function createPinAliases(source: string) {
  const aliases = new Map<string, string>();
  const aliasPattern = /#\s*define\s+([A-Za-z_]\w*)\s+([A-Za-z_]\w*|\d+)\b|(?:(?:static\s+)?const\s+)?(?:int|byte|uint8_t)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*|\d+)\s*;/gi;
  for (const match of source.matchAll(aliasPattern)) {
    const name = match[1] ?? match[3];
    const value = match[2] ?? match[4];
    aliases.set(name, value);
  }
  return aliases;
}

function resolvePin(pin: string, aliases: Map<string, string>) {
  let resolved = pin;
  const visited = new Set<string>();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved)!;
  }
  if (!/^(?:GPIO\d+|GP\d+|D\d+|A\d+|P[A-Z]\d+|\d+)$/i.test(resolved)) return null;
  return normalizeFirmwarePin(resolved);
}

function getMappedLedPins(design: CircuitDesign) {
  const leds = design.components.filter(component => /\b(?:led|diode)\b/i.test(component.name));
  const ledPins = new Map<string, string>();
  leds.forEach(led => {
    const mapping = design.pinMappings.find(candidate =>
      candidate.componentId === led.id
      && !['Power', 'GND'].includes(candidate.protocol)
      && Boolean(candidate.mcuPin),
    );
    if (mapping) ledPins.set(led.id, normalizeFirmwarePin(mapping.mcuPin));
  });
  return ledPins;
}

export function analyzeFirmwareForSimulation(design: CircuitDesign): FirmwareSimulationPlan {
  const ledPins = getMappedLedPins(design);
  const source = stripCommentsAndStrings(design.firmwareCode);
  const loopBody = extractLoopBody(source);
  if (loopBody === null) return unsupportedPlan('No complete void loop() was found; firmware behavior is not simulated.', ledPins);

  const aliases = createPinAliases(source);
  const writes: LedWrite[] = [];
  const outputPins = new Set<string>();
  let elapsedMs = 0;
  const statements = loopBody.split(';').map(statement => statement.trim()).filter(Boolean);

  for (const statement of statements) {
    const writeMatch = /^digitalWrite\s*\(\s*([A-Za-z_]\w*|\d+)\s*,\s*(HIGH|LOW)\s*\)$/i.exec(statement);
    if (writeMatch) {
      const pin = resolvePin(writeMatch[1], aliases);
      if (pin === null) return unsupportedPlan('A digitalWrite() pin could not be resolved to a numeric MCU pin; firmware behavior is not simulated.', ledPins);
      outputPins.add(pin);
      writes.push({ atMs: elapsedMs, pin, high: writeMatch[2].toUpperCase() === 'HIGH' });
      continue;
    }

    const delayMatch = /^delay\s*\(\s*(\d+)\s*\)$/i.exec(statement);
    if (delayMatch) {
      elapsedMs += Number(delayMatch[1]);
      if (elapsedMs > 60_000) return unsupportedPlan('The loop delay sequence exceeds the 60-second visual simulation limit.', ledPins);
      continue;
    }

    return unsupportedPlan('Only straight-line digitalWrite(HIGH/LOW) and delay(milliseconds) statements are simulated. This sketch uses other logic and is shown without a guessed output.', ledPins);
  }

  if (writes.length === 0) return unsupportedPlan('No digitalWrite(HIGH/LOW) output was found in loop(); firmware behavior is not simulated.', ledPins);
  if (ledPins.size > 0 && ![...ledPins.values()].some(pin => outputPins.has(pin))) {
    return unsupportedPlan('The sketch does not write to a pin mapped to an LED; LED behavior is not simulated.', ledPins);
  }

  return {
    isSupported: true,
    message: 'Code-driven visual model: straight-line digitalWrite(HIGH/LOW) and delay() only. C++ control flow, inputs, PWM, sensors, and hardware behavior are not executed.',
    durationMs: Math.max(elapsedMs, 1000),
    writes,
    outputPins,
    ledPins,
  };
}

export function getLedStatesAt(plan: FirmwareSimulationPlan, elapsedMs: number) {
  const states = new Map<string, boolean>();
  if (!plan.isSupported || plan.durationMs <= 0) return states;

  const cycleTime = ((elapsedMs % plan.durationMs) + plan.durationMs) % plan.durationMs;
  const pinStates = new Map<string, boolean>();
  plan.writes.forEach(write => {
    if (write.atMs <= cycleTime) pinStates.set(write.pin, write.high);
  });
  plan.ledPins.forEach((pin, componentId) => {
    if (pinStates.has(pin)) states.set(componentId, pinStates.get(pin)!);
  });
  return states;
}

export function getOutputStateAt(plan: FirmwareSimulationPlan, pin: string, elapsedMs: number): boolean | undefined {
  if (!plan.isSupported || plan.durationMs <= 0) return undefined;

  const normalizedPin = normalizeFirmwarePin(pin);
  const cycleTime = ((elapsedMs % plan.durationMs) + plan.durationMs) % plan.durationMs;
  let state: boolean = false;
  plan.writes.forEach(write => {
    if (write.pin === normalizedPin && write.atMs <= cycleTime) state = write.high;
  });
  return state;
}

export function firmwareDrivesPin(plan: FirmwareSimulationPlan, pin: string) {
  return plan.isSupported && plan.outputPins.has(normalizeFirmwarePin(pin));
}
