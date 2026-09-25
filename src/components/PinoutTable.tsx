import React from 'react';
import type { CircuitDesign } from '../types/circuit';

interface PinoutTableProps {
  design: CircuitDesign;
}

const PinoutTable: React.FC<PinoutTableProps> = ({ design }) => {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Pin Mapping</h2>
      <p style={{ color: 'var(--text-muted)' }}>Simple connection table for the generated prototype.</p>

      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Component</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Pin</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>MCU Pin</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {design.pinMappings.map((pin, i) => {
              const comp = design.components.find(c => c.id === pin.componentId);
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{comp?.name || pin.componentId}</td>
                  <td style={{ padding: '16px', fontFamily: 'var(--font-mono)' }}>{pin.componentPin}</td>
                  <td style={{ padding: '16px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{pin.mcuPin}</td>
                  <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{pin.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PinoutTable;
