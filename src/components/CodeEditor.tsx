import React from 'react';
import type { CircuitDesign } from '../types/circuit';
import { Copy, Download } from 'lucide-react';

interface CodeEditorProps {
  design: CircuitDesign;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ design }) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Embedded Firmware</h2>
          <p style={{ color: 'var(--text-muted)' }}>Auto-generated boilerplate code for the selected MCU.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary"><Copy size={16}/> Copy</button>
          <button className="btn-primary"><Download size={16}/> Download .ino</button>
        </div>
      </div>
      
      <div style={{ flex: 1, background: '#0d1117', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#161b22', padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-main)', borderBottom: '1px solid var(--accent-cyan)' }}>main.ino</span>
          <span>platformio.ini</span>
        </div>
        <pre style={{ margin: 0, padding: '16px', overflow: 'auto', flex: 1, color: '#c9d1d9', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          <code>{design.firmwareCode}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeEditor;
