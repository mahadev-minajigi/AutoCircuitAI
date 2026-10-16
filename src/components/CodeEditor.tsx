import React, { useState } from 'react';
import type { CircuitDesign } from '../types/circuit';
import { Copy, Download, Check } from 'lucide-react';
import { saveAs } from 'file-saver';

interface CodeEditorProps {
  design: CircuitDesign;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ design, onShowToast }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(design.firmwareCode);
      setCopied(true);
      onShowToast('Firmware code copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast('Failed to copy — try the download button instead', 'error');
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([design.firmwareCode], { type: 'text/plain;charset=utf-8;' });
      saveAs(blob, `${design.id}-firmware.ino`);
      onShowToast('Firmware downloaded as .ino file', 'success');
    } catch {
      onShowToast('Download failed', 'error');
    }
  };

  // Count lines for line numbers
  const lines = design.firmwareCode.split('\n');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Firmware</h2>
          <p style={{ color: 'var(--text-muted)' }}>Starter sketch for {design.title}. {lines.length} lines.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="btn-primary" onClick={handleDownload}>
            <Download size={16} /> Download .ino
          </button>
        </div>
      </div>

      <div style={{ flex: 1, background: '#0d1117', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#161b22', padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-main)', borderBottom: '1px solid var(--accent-cyan)' }}>main.ino</span>
          <span>starter sketch</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem' }}>{lines.length} lines</span>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
          <div className="line-numbers" aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre style={{ margin: 0, padding: '16px', overflow: 'auto', flex: 1, color: '#c9d1d9', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <code>{design.firmwareCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
