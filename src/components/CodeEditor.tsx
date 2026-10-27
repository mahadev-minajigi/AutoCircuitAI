import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitDesign } from '../types/circuit';
import { ArrowLeft, Check, CircleAlert, Clipboard, Code2, Download, Play, Cpu, Cable } from 'lucide-react';
import { saveAs } from 'file-saver';

interface CodeEditorProps {
  design: CircuitDesign;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onClose: () => void;
  onFirmwareChange: (source: string) => void;
}
type CompileResult = { status: 'success' | 'error' | 'unavailable'; output: string; diagnostics?: CompilerDiagnostic[] };
type CompilerDiagnostic = { line: number; column?: number; severity: 'error' | 'warning'; message: string };
type PinCheck = { invalid: string[]; unmapped: string[]; checked: string[] };
const targets = [
  { label: 'Arduino Uno', fqbn: 'arduino:avr:uno', match: /arduino|uno|atmega328/i },
  { label: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32', match: /esp32/i },
  { label: 'Raspberry Pi Pico', fqbn: 'rp2040:rp2040:rpipico', match: /pico|rp2040/i },
];

function highlighted(source: string) {
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#\s*include[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:void|int|float|double|bool|char|byte|long|short|unsigned|const|static|volatile|return|if|else|for|while|true|false)\b|\b(?:HIGH|LOW|INPUT|OUTPUT|Serial|Wire|SPI|setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|millis)\b|\b\d+(?:\.\d+)?\b)/g;
  return source.split(pattern).map((part, index) => {
    let token = '';
    if (/^\/\/|^\/\*/.test(part)) token = 'comment';
    else if (/^#\s*include/.test(part)) token = 'include';
    else if (/^["']/.test(part)) token = 'string';
    else if (/^\d/.test(part)) token = 'number';
    else if (/^(void|int|float|double|bool|char|byte|long|short|unsigned|const|static|volatile|return|if|else|for|while|true|false)$/.test(part)) token = 'keyword';
    else if (/^(HIGH|LOW|INPUT|OUTPUT|Serial|Wire|SPI|setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|millis)$/.test(part)) token = 'api';
    return token ? <span className={'ide-token-' + token} key={index}>{part}</span> : part;
  });
}

function inspectCircuitPins(source: string, mcu: CircuitDesign['components'][number] | undefined, mappings: CircuitDesign['pinMappings']): PinCheck {
  if (!mcu?.pins.length) return { invalid: [], unmapped: [], checked: [] };
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  const aliases = new Map<string, string>();
  const pinPattern = '(?:GPIO\\d+|D\\d+|A\\d+|P[A-Z]\\d+|\\d+)';
  for (const match of code.matchAll(new RegExp('(?:#\\s*define\\s+|\\b(?:const\\s+)?(?:int|byte|uint8_t)\\s+)([A-Za-z_]\\w*)\\s*(?:=\\s*|\\s+)(' + pinPattern + ')\\b', 'g'))) {
    aliases.set(match[1], match[2]);
  }
  const referenced = new Set<string>();
  const calls = /\b(?:pinMode|digitalWrite|digitalRead|analogRead|analogWrite|attachInterrupt|pulseIn)\s*\(\s*([A-Za-z_]\w*|\d+)\b/g;
  for (const match of code.matchAll(calls)) {
    let pin = match[1];
    const visited = new Set<string>();
    while (aliases.has(pin) && !visited.has(pin)) {
      visited.add(pin);
      pin = aliases.get(pin)!;
    }
    if (/^(?:GPIO\d+|D\d+|A\d+|P[A-Z]\d+|\d+)$/i.test(pin)) referenced.add(pin);
  }
  const normalize = (pin: string) => pin.toUpperCase().replace(/^GPIO/, '').replace(/^[DA](?=\d)/, '');
  const boardPins = new Set(mcu.pins.map(normalize));
  const mappedPins = new Set(mappings
    .filter(mapping => !mapping.sourceComponentId || mapping.sourceComponentId === mcu.id)
    .map(mapping => normalize(mapping.mcuPin)));
  const invalid: string[] = [];
  const unmapped: string[] = [];
  const checked: string[] = [];
  for (const pin of referenced) {
    if (!boardPins.has(normalize(pin))) invalid.push(pin);
    else if (!mappedPins.has(normalize(pin))) unmapped.push(pin);
    else checked.push(pin);
  }
  return { invalid, unmapped, checked };
}

function parseDiagnostics(output: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const pattern = /CircuitSketch\.ino:(\d+)(?::(\d+))?:\s*(?:fatal\s+)?(error|warning):\s*(.*)/gi;
  for (const match of output.matchAll(pattern)) {
    diagnostics.push({
      line: Number(match[1]),
      column: match[2] ? Number(match[2]) : undefined,
      severity: match[3].toLowerCase() as CompilerDiagnostic['severity'],
      message: match[4].trim(),
    });
  }
  return diagnostics;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ design, onShowToast, onClose, onFirmwareChange }) => {
  const mcu = design.components.find(component => component.category === 'MCU');
  const detectedTarget = targets.find(option => option.match.test(mcu?.name ?? ''));
  const [source, setSource] = useState(design.firmwareCode);
  const [target, setTarget] = useState(detectedTarget?.fqbn ?? '');
  const [result, setResult] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [copied, setCopied] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const lineGutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => source.split('\n').length, [source]);
  const signals = design.pinMappings.filter(mapping => !['Power', 'GND'].includes(mapping.protocol));
  const libraryDependencies = [...new Set([...source.matchAll(/^\s*#include\s*[<"]([^>"]+)[>"]/gm)]
    .map(match => match[1])
    .filter(name => !['Arduino.h', 'Wire.h', 'SPI.h', 'math.h'].includes(name)))];
  const targetLabel = targets.find(option => option.fqbn === target)?.label ?? 'the matching board';
  const pinCheck = useMemo(() => inspectCircuitPins(source, mcu, design.pinMappings), [source, mcu, design.pinMappings]);
  const diagnostics = useMemo(() => result ? (result.diagnostics ?? parseDiagnostics(result.output)) : [], [result]);
  const errorLines = new Set(diagnostics.filter(item => item.severity === 'error').map(item => item.line));

  useEffect(() => {
    setSource(design.firmwareCode);
    setResult(null);
  }, [design.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      onShowToast('Firmware copied', 'success');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onShowToast('Could not access clipboard', 'error');
    }
  };
  const download = () => {
    saveAs(new Blob([source], { type: 'text/plain;charset=utf-8' }), design.id + '-firmware.ino');
    onShowToast('Sketch downloaded', 'success');
  };
  const compile = async () => {
    if (!target) {
      setResult({ status: 'error', output: 'Select a compiler board target first.' });
      return;
    }
    setCompiling(true);
    setResult(null);
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, fqbn: target }),
      });
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('status' in payload) || !('output' in payload)) {
        setResult({ status: 'unavailable', output: 'Compiler returned an unreadable response. No successful build is assumed.' });
      } else {
        const compileResponse = payload as CompileResult;
        if (!['success', 'error', 'unavailable'].includes(compileResponse.status) || typeof compileResponse.output !== 'string') {
          setResult({ status: 'unavailable', output: 'Compiler returned an invalid status or output. No successful build is assumed.' });
        } else if (!response.ok && compileResponse.status === 'success') {
          setResult({ status: 'error', output: compileResponse.output || 'Compiler service returned HTTP ' + response.status + '.' });
        } else {
          setResult(compileResponse);
        }
      }
    } catch {
      setResult({ status: 'unavailable', output: 'Compiler service is unreachable. No compile result was produced.' });
    } finally {
      setCompiling(false);
    }
  };
  const syncScroll = () => {
    if (editor.current && highlight.current) {
      highlight.current.scrollTop = editor.current.scrollTop;
      highlight.current.scrollLeft = editor.current.scrollLeft;
      if (lineGutter.current) lineGutter.current.scrollTop = editor.current.scrollTop;
    }
  };
  const jumpToLine = (line: number, column = 1) => {
    const textarea = editor.current;
    if (!textarea || line < 1) return;
    const lineStart = source.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    const lineEnd = source.indexOf('\n', lineStart);
    const offset = Math.min(lineStart + Math.max(column - 1, 0), lineEnd === -1 ? source.length : lineEnd);
    textarea.focus();
    textarea.setSelectionRange(offset, lineEnd === -1 ? source.length : lineEnd);
    textarea.scrollTop = Math.max((line - 1) * 20.8 - textarea.clientHeight / 2, 0);
    syncScroll();
  };

  return <section className="firmware-ide" aria-label="Circuit firmware IDE">
    <header className="ide-topbar">
      <button className="btn-secondary" onClick={onClose}><ArrowLeft size={16} /> Back to circuit</button>
      <div className="ide-title"><Code2 size={19} /><div><strong>Firmware IDE</strong><span>{design.title}</span></div></div>
      <div className="ide-actions">
        <button className="btn-secondary" onClick={copy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy'}</button>
        <button className="btn-secondary" onClick={download}><Download size={16} /> Download .ino</button>
        <button className="btn-primary" onClick={compile} disabled={compiling}><Play size={15} />{compiling ? 'Compiling…' : 'Compile'}</button>
      </div>
    </header>
    <div className="ide-layout">
      <aside className="ide-hardware-panel">
        <div className="ide-panel-title"><Cpu size={16} /><h2>Selected hardware</h2></div>
        <div className="ide-mcu-card"><span>CONTROLLER</span><strong>{mcu?.name ?? 'No MCU detected'}</strong><small>{mcu?.operatingVoltage ? mcu.operatingVoltage + 'V logic' : 'Confirm board voltage'}</small></div>
        <label className="ide-target-label" htmlFor="ide-target">Compiler board</label>
        <select id="ide-target" className="ide-target-select" value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">Select board target</option>
          {targets.map(option => <option key={option.fqbn} value={option.fqbn}>{option.label}</option>)}
        </select>
        <div className="ide-panel-title ide-connections-title"><Cable size={16} /><h2>Mapped signals</h2></div>
        {signals.length ? <ul className="ide-connection-list">{signals.map((mapping, index) => {
          const part = design.components.find(component => component.id === mapping.componentId);
          const source = mapping.sourceComponentId ? design.components.find(component => component.id === mapping.sourceComponentId) : null;
          return <li key={mapping.componentId + mapping.mcuPin + index}><strong>{source ? `${source.name} pin ${mapping.sourceComponentPin || mapping.mcuPin}` : mapping.mcuPin}</strong><span>{mapping.protocol}</span><small>{part?.name ?? mapping.componentId} · {mapping.componentPin}</small></li>;
        })}</ul> : <p className="ide-empty-note">No signal mappings in this circuit.</p>}
      </aside>
      <section className="ide-editor-column">
        <div className="ide-filebar"><span className="ide-file-tab">{design.id}-firmware.ino</span><span>{lines} lines · C++</span></div>
        <div className="ide-editor-shell">
          <div ref={lineGutter} className="ide-line-numbers" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span className={errorLines.has(index + 1) ? 'has-compiler-error' : ''} key={index}>{index + 1}</span>)}</div>
          <div className="ide-code-layer">
            <pre ref={highlight} className="ide-highlight" aria-hidden="true"><code>{highlighted(source)}{'\n'}</code></pre>
            <textarea ref={editor} className="ide-textarea" value={source} onChange={event => { setSource(event.target.value); onFirmwareChange(event.target.value); setResult(null); }} onScroll={syncScroll} spellCheck={false} aria-label="Edit generated Arduino firmware" autoCapitalize="off" autoComplete="off" />
          </div>
        </div>
        <div className="ide-statusbar"><span>Generated from this circuit</span><span>Edits saved to this design session</span></div>
        <section className={'ide-pin-check ' + (pinCheck.invalid.length || pinCheck.unmapped.length ? 'needs-review' : 'clear')} aria-live="polite">
          <div className="ide-pin-check-heading"><Cable size={15} /><strong>Firmware ↔ circuit pin check</strong><span>{pinCheck.invalid.length + pinCheck.unmapped.length ? 'REVIEW' : 'STATIC CHECK'}</span></div>
          {pinCheck.invalid.length > 0 && <p><strong>Not listed on {mcu?.name}:</strong> {pinCheck.invalid.join(', ')}. Check the selected board pinout.</p>}
          {pinCheck.unmapped.length > 0 && <p><strong>Not connected in this circuit:</strong> {pinCheck.unmapped.join(', ')}. Add these connections in the circuit or change the firmware pins.</p>}
          {!pinCheck.invalid.length && !pinCheck.unmapped.length && <p>{pinCheck.checked.length ? 'Pins found in the code are present on the selected MCU and mapped in the circuit: ' + pinCheck.checked.join(', ') + '.' : 'No pin use was recognized in common Arduino pin APIs. This static scan does not verify firmware behavior.'}</p>}
          <small>Static source scan only; it does not replace compilation or a hardware test.</small>
        </section>
        <section className={'ide-build-panel ' + (result?.status ?? 'idle')} aria-live="polite">
          <div className="ide-build-heading"><div>{result?.status === 'success' ? <Check size={16} /> : result?.status === 'error' ? <CircleAlert size={16} /> : <Code2 size={16} />}<strong>Build output</strong></div><span>{compiling ? 'BUILDING' : result?.status.toUpperCase() ?? 'READY TO BUILD'}</span></div>
          {diagnostics.length > 0 && <div className="ide-diagnostics">
            <strong className="ide-diagnostics-title">Compiler messages · {diagnostics.length}</strong>
            {diagnostics.map((diagnostic, index) => <button className={'ide-diagnostic ' + diagnostic.severity} key={index} onClick={() => jumpToLine(diagnostic.line, diagnostic.column)}>
              <span>{diagnostic.severity === 'error' ? 'ERROR' : 'WARNING'} · line {diagnostic.line}{diagnostic.column ? ':' + diagnostic.column : ''}</span>
              <strong>{diagnostic.message}</strong>
            </button>)}
          </div>}
          {result && <details className="ide-full-log"><summary>{diagnostics.length ? 'Full compiler log' : 'Compiler output'}</summary><pre>{result.output}</pre></details>}
          {!result && <pre>{compiling ? 'Compiling with the configured Arduino CLI…' : 'Compilation uses the configured Arduino CLI. A button click alone is never reported as a successful build.'}</pre>}
          {result?.status === 'unavailable' && <div className="ide-local-compile-help">
            <strong>Local Arduino compiler is not connected</strong>
            <ol>
              <li>Remote hosting does not include Arduino CLI. Start AutoCircuit AI on your computer with <code>npm run dev:full</code> to compile through its local backend.</li>
              <li>Install Arduino CLI and the <b>{targetLabel}</b> board core on that computer. The current deployment cannot compile this sketch.</li>
              {libraryDependencies.length > 0 && <li>Install these Arduino libraries on the compiler host: <code>{libraryDependencies.join(', ')}</code>.</li>}
              <li>To compile without the local backend, download the <code>.ino</code>, open it in Arduino IDE, select <b>{targetLabel}</b>, and click <b>Verify</b>.</li>
            </ol>
          </div>}
        </section>
      </section>
    </div>
  </section>;
};
export default CodeEditor;
