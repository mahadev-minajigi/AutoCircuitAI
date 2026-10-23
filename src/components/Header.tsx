import React from 'react';
import { Zap, Download, FileJson, FileText, FileCode2, Cpu } from 'lucide-react';
import { saveAs } from 'file-saver';
import type { CircuitDesign } from '../types/circuit';
import { generateKiCadNetlist, generateEasyEdaJson } from '../services/aiCircuitEngine';

interface HeaderProps {
  currentDesign: CircuitDesign | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onOpenIDE: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentDesign, onShowToast, onOpenIDE }) => {
  const handleExport = () => {
    if (!currentDesign) {
      onShowToast('No design to export. Generate a circuit first.', 'error');
      return;
    }

    try {
      // Design JSON
      const designBlob = new Blob([JSON.stringify(currentDesign, null, 2)], { type: 'application/json' });
      saveAs(designBlob, `${currentDesign.id}-design.json`);

      // BOM CSV
      const bomHeader = 'Ref,Name,Category,Package,EstimatedCostINR\n';
      const bomRows = currentDesign.components.map(c =>
        `${c.id},${c.name},${c.category},${c.package},${c.estimatedCost}`
      ).join('\n');
      const bomBlob = new Blob([bomHeader + bomRows], { type: 'text/csv;charset=utf-8;' });
      saveAs(bomBlob, `${currentDesign.id}-BOM.csv`);

      // Firmware
      const fwBlob = new Blob([currentDesign.firmwareCode], { type: 'text/plain;charset=utf-8;' });
      saveAs(fwBlob, `${currentDesign.id}-firmware.ino`);

      // KiCad Netlist .net
      const kicadNet = generateKiCadNetlist(currentDesign);
      const kicadBlob = new Blob([kicadNet], { type: 'text/plain;charset=utf-8;' });
      saveAs(kicadBlob, `${currentDesign.id}-kicad.net`);

      // EasyEDA JSON
      const easyEda = generateEasyEdaJson(currentDesign);
      const easyEdaBlob = new Blob([JSON.stringify(easyEda, null, 2)], { type: 'application/json' });
      saveAs(easyEdaBlob, `${currentDesign.id}-EasyEDA.json`);

      onShowToast('Exported complete project bundle: KiCad Netlist, EasyEDA JSON, BOM CSV, Firmware .ino, & Design JSON!', 'success');
    } catch {
      onShowToast('Export failed — check browser download permissions', 'error');
    }
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

      <div className="header-actions">
        {currentDesign && (
          <div className="header-file-badges">
            <span className="file-badge" title="Design JSON"><FileJson size={13} /> JSON</span>
            <span className="file-badge" title="BOM CSV"><FileText size={13} /> BOM</span>
            <span className="file-badge" title="Firmware .ino"><FileCode2 size={13} /> FW</span>
            <span className="file-badge" title="KiCad Netlist"><FileCode2 size={13} /> KiCad</span>
            <span className="file-badge" title="EasyEDA JSON"><FileJson size={13} /> EasyEDA</span>
          </div>
        )}
        <button className="btn-secondary header-ide-btn" onClick={onOpenIDE} disabled={!currentDesign} title={currentDesign ? 'Open the firmware IDE for this circuit' : 'Generate a circuit to open its firmware IDE'}>
          <Cpu size={16} /> IDE
        </button>
        <button className="btn-primary export-btn" onClick={handleExport} disabled={!currentDesign} title="Export all files (Ctrl+E)">
          <Download size={16} /> Export All
        </button>
      </div>
    </header>
  );
};

export default Header;
