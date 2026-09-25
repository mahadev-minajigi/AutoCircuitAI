import React from 'react';
import { Zap, Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import type { CircuitDesign } from '../types/circuit';

interface HeaderProps {
  currentDesign: CircuitDesign | null;
}

const Header: React.FC<HeaderProps> = ({ currentDesign }) => {
  const handleExport = () => {
    if (!currentDesign) {
      alert('No design to export. Please generate a circuit first.');
      return;
    }

    const designBlob = new Blob([JSON.stringify(currentDesign, null, 2)], { type: 'application/json' });
    saveAs(designBlob, `${currentDesign.id}-design.json`);

    const bomHeader = 'Ref,Name,Category,Package,EstimatedCostINR\n';
    const bomRows = currentDesign.components.map(c =>
      `${c.id},${c.name},${c.category},${c.package},${c.estimatedCost}`
    ).join('\n');
    const bomBlob = new Blob([bomHeader + bomRows], { type: 'text/csv;charset=utf-8;' });
    saveAs(bomBlob, `${currentDesign.id}-BOM.csv`);

    const fwBlob = new Blob([currentDesign.firmwareCode], { type: 'text/plain;charset=utf-8;' });
    saveAs(fwBlob, `${currentDesign.id}-firmware.ino`);
  };

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Zap color="var(--accent-cyan)" size={28} />
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '1px', margin: 0 }}>
            AUTOCIRCUIT<span style={{ color: 'var(--accent-cyan)' }}> AI</span>
          </h1>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.6px', marginTop: '2px' }}>
            AI-assisted hardware design and circuit generation
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <button className="btn-primary" onClick={handleExport} disabled={!currentDesign}>
          <Download size={16} /> Export
        </button>
      </div>
    </header>
  );
};

export default Header;
