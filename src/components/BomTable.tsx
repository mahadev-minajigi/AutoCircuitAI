import React from 'react';
import type { CircuitDesign } from '../types/circuit';
import { ShoppingCart } from 'lucide-react';

interface BomTableProps {
  design: CircuitDesign;
}

const BomTable: React.FC<BomTableProps> = ({ design }) => {
  const totalCost = design.components.reduce((acc, comp) => acc + comp.estimatedCost, 0);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Bill of Materials (BOM)</h2>
          <p style={{ color: 'var(--text-muted)' }}>Simple parts list for the generated design.</p>
        </div>
        <div style={{ background: 'var(--bg-panel)', padding: '16px 24px', borderRadius: '8px', border: '1px solid var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShoppingCart color="var(--accent-emerald)" />
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Total</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>₹{totalCost.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Component</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Quantity</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)' }}>Purpose</th>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Estimated Cost</th>
            </tr>
          </thead>
          <tbody>
            {design.components.map((comp) => (
              <tr key={comp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 600 }}>{comp.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{comp.package}</div>
                </td>
                <td style={{ padding: '16px' }}>1</td>
                <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{comp.description}</td>
                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 500 }}>₹{comp.estimatedCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BomTable;
