import React, { useState } from 'react';
import type { CircuitDesign } from '../types/circuit';
import { Cpu, Cable, Search, Copy, Info, AlertCircle } from 'lucide-react';

interface PinoutTableProps {
  design: CircuitDesign;
  onShowToast?: (message: string, type: 'success' | 'info' | 'error') => void;
}

const protocolBadges: Record<string, { bg: string; text: string; border: string }> = {
  Power: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' },
  GND: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: '#64748b' },
  I2C: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: '#ca8a04' },
  SPI: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: '#2563eb' },
  UART: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: '#9333ea' },
  ADC: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: '#059669' },
  PWM: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: '#ea580c' },
  I2S: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: '#0891b2' },
  GPIO: { bg: 'rgba(100, 116, 139, 0.15)', text: '#cbd5e1', border: '#475569' }
};

const PinoutTable: React.FC<PinoutTableProps> = ({ design, onShowToast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProtocol, setFilterProtocol] = useState<string>('ALL');

  const mcu = design.components.find(c => c.category === 'MCU');

  const filteredMappings = design.pinMappings.filter(pin => {
    const comp = design.components.find(c => c.id === pin.componentId);
    const compName = (comp?.name || pin.componentId).toLowerCase();
    const matchesSearch = 
      compName.includes(searchTerm.toLowerCase()) ||
      (pin.sourceComponentId ? (design.components.find(c => c.id === pin.sourceComponentId)?.name || pin.sourceComponentId).toLowerCase() : pin.mcuPin.toLowerCase()).includes(searchTerm.toLowerCase()) ||
      (pin.sourceComponentPin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      pin.componentPin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pin.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProtocol = filterProtocol === 'ALL' || pin.protocol === filterProtocol;

    return matchesSearch && matchesProtocol;
  });

  const handleCopyWiringList = () => {
    const text = design.pinMappings.map((p, idx) => {
      const comp = design.components.find(c => c.id === p.componentId);
      const sourceComp = p.sourceComponentId ? design.components.find(c => c.id === p.sourceComponentId) : null;
      const sourceLabel = sourceComp ? `${sourceComp.name} pin ${p.sourceComponentPin || p.mcuPin}` : `MCU ${p.mcuPin}`;
      return `${idx + 1}. [${p.protocol}] ${sourceLabel}  -->  ${comp?.name || p.componentId} Pin "${p.componentPin}" (${p.description})`;
    }).join('\n');

    navigator.clipboard.writeText(text);
    if (onShowToast) {
      onShowToast('Wiring list copied to clipboard for lab record!', 'success');
    }
  };

  const protocols = Array.from(new Set(design.pinMappings.map(p => p.protocol)));

  return (
    <div className="pinout-container">
      {/* Overview Bar */}
      <div className="pinout-header">
        <div>
          <h2>Practical Lab Pin Mapping & Wiring Guide</h2>
          <p className="pinout-subtitle">
            Exact physical wiring connections from <strong>{mcu?.name || 'MCU'}</strong> to all peripheral breakout boards.
          </p>
        </div>

        <div className="pinout-actions">
          <button className="btn-secondary" onClick={handleCopyWiringList}>
            <Copy size={16} /> Copy Wiring Table
          </button>
        </div>
      </div>

      {/* Breadboard Wiring Tip Box */}
      <div className="pinout-tip-box">
        <Info size={18} className="tip-icon" />
        <div className="tip-text">
          <strong>Lab Best Practice:</strong> Use standard wire colors to avoid damaging components during practical exams.
          <div className="wire-color-legend">
            <span><strong style={{ color: '#ef4444' }}>Red:</strong> VCC / 3.3V Power</span>
            <span><strong style={{ color: '#94a3b8' }}>Black:</strong> GND Ground</span>
            <span><strong style={{ color: '#eab308' }}>Yellow:</strong> SCL / Clock</span>
            <span><strong style={{ color: '#3b82f6' }}>Blue:</strong> SDA / Data</span>
            <span><strong style={{ color: '#22c55e' }}>Green:</strong> MISO / RX</span>
            <span><strong style={{ color: '#a855f7' }}>Purple:</strong> CS / Chip Select</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="pinout-filter-bar">
        <div className="pinout-search">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search pin (e.g. IO21, SDA, BME280)..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="protocol-pills">
          <button 
            className={`pill-btn ${filterProtocol === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterProtocol('ALL')}
          >
            All ({design.pinMappings.length})
          </button>
          {protocols.map(prot => (
            <button 
              key={prot}
              className={`pill-btn ${filterProtocol === prot ? 'active' : ''}`}
              onClick={() => setFilterProtocol(prot)}
            >
              {prot}
            </button>
          ))}
        </div>
      </div>

      {/* Enhanced Pinout Table */}
      <div className="pinout-table-wrapper">
        <table className="pinout-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>#</th>
              <th>Protocol</th>
              <th>MCU Pin ({mcu?.name || 'Controller'})</th>
              <th>Direction</th>
              <th>Target Component</th>
              <th>Component Pin</th>
              <th>Suggested Wire</th>
              <th>Lab Function / Signal Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredMappings.map((pin, i) => {
              const comp = design.components.find(c => c.id === pin.componentId);
              const badge = protocolBadges[pin.protocol] || protocolBadges.GPIO;
              const wireColor = pin.wireColor || (
                pin.protocol === 'Power' ? '#ef4444' :
                pin.protocol === 'GND' ? '#1e293b' :
                pin.protocol === 'I2C' && pin.componentPin.toLowerCase().includes('scl') ? '#eab308' :
                pin.protocol === 'I2C' ? '#3b82f6' :
                pin.protocol === 'SPI' && pin.componentPin.toLowerCase().includes('cs') ? '#a855f7' :
                '#10b981'
              );

              // Universal Fix 1: Resistor description sanitizer
              let sanitizedDesc = pin.description;
              const isResistor = comp?.name.toLowerCase().includes('resistor') || 
                                pin.componentPin.toLowerCase().includes('res') ||
                                pin.description.toLowerCase().includes('resistor');
              if (isResistor && (sanitizedDesc.toLowerCase().includes('ground') || sanitizedDesc.toLowerCase().includes('gnd') || sanitizedDesc.toLowerCase().includes('connects to ground'))) {
                sanitizedDesc = 'current-limiting resistor in series with LED';
              } else if (isResistor && !sanitizedDesc.toLowerCase().includes('pull-up')) {
                sanitizedDesc = 'current-limiting resistor in series with LED';
              }

              return (
                <tr key={i} className="pinout-row">
                  <td className="pin-index">{i + 1}</td>
                  <td>
                    <span 
                      className="protocol-badge" 
                      style={{ 
                        background: badge.bg, 
                        color: badge.text, 
                        borderColor: badge.border 
                      }}
                    >
                      {pin.protocol}
                    </span>
                  </td>
                  <td>
                    <div className="mcu-pin-tag">
                      {pin.sourceComponentId ? <Cable size={14} /> : <Cpu size={14} />}
                      <code>{pin.sourceComponentId ? `${design.components.find(c => c.id === pin.sourceComponentId)?.name || pin.sourceComponentId} pin ${pin.sourceComponentPin || pin.mcuPin}` : pin.mcuPin}</code>
                    </div>
                  </td>
                  <td className="pin-direction">
                    {pin.protocol === 'Power' ? '───▶' : pin.protocol === 'GND' ? '◀───' : '◀──▶'}
                  </td>
                  <td className="comp-name">
                    <strong>{comp?.name || pin.componentId}</strong>
                    <span className="comp-cat">{comp?.category}</span>
                  </td>
                  <td>
                    <span className="comp-pin-badge">{pin.componentPin}</span>
                  </td>
                  <td>
                    <div className="wire-color-tag">
                      <span className="wire-swatch" style={{ background: wireColor }} />
                      <span className="wire-name">
                        {wireColor === '#ef4444' ? 'Red Wire' :
                         wireColor === '#1e293b' ? 'Black Wire' :
                         wireColor === '#eab308' ? 'Yellow Wire' :
                         wireColor === '#3b82f6' ? 'Blue Wire' :
                         wireColor === '#a855f7' ? 'Purple Wire' : 'Green Wire'}
                      </span>
                    </div>
                  </td>
                  <td className="pin-desc">{sanitizedDesc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredMappings.length === 0 && (
          <div className="no-pins-found">
            <AlertCircle size={24} />
            <p>No pin mappings match your filter criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PinoutTable;
