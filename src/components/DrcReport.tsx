import React from 'react';
import type { CircuitDesign } from '../types/circuit';
import { AlertTriangle, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

interface DrcReportProps {
  design: CircuitDesign;
}

const DrcReport: React.FC<DrcReportProps> = ({ design }) => {
  const drcRules = design.drcReport || [];

  const errors = drcRules.filter(r => r.type === 'Error');
  const warnings = drcRules.filter(r => r.type === 'Warning');
  const passes = drcRules.filter(r => r.type === 'Pass');

  const parseRule = (message: string) => {
    const parts = message.split(' | ');
    return {
      problem: parts[0] || 'Check failed',
      reason: parts[1] || 'This issue may affect the design outcome.',
      fix: parts[2] || 'Review the design and adjust the connection or component.'
    };
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck color="var(--accent-cyan)" /> Design Rule Check (DRC)
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Rule-based electrical validation for the generated prototype.</p>
        </div>

        <div style={{ display: 'flex', gap: '16px', background: 'var(--bg-panel)', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: errors.length > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
            <XCircle size={18} /> <span style={{ fontWeight: 600 }}>{errors.length} Errors</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: warnings.length > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
            <AlertTriangle size={18} /> <span style={{ fontWeight: 600 }}>{warnings.length} Warnings</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-emerald)' }}>
            <CheckCircle size={18} /> <span style={{ fontWeight: 600 }}>{passes.length} Passed</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {drcRules.map((rule, idx) => {
          let bgColor = 'rgba(255, 255, 255, 0.05)';
          let borderColor = 'var(--border-color)';
          let Icon = CheckCircle;
          let iconColor = 'var(--accent-emerald)';

          if (rule.type === 'Error') {
            bgColor = 'rgba(255, 51, 102, 0.1)';
            borderColor = 'var(--accent-rose)';
            Icon = XCircle;
            iconColor = 'var(--accent-rose)';
          } else if (rule.type === 'Warning') {
            bgColor = 'rgba(255, 184, 0, 0.1)';
            borderColor = 'var(--accent-amber)';
            Icon = AlertTriangle;
            iconColor = 'var(--accent-amber)';
          }

          const details = parseRule(rule.message);

          return (
            <div key={idx} style={{
              background: bgColor,
              border: `1px solid ${borderColor}`,
              padding: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <Icon color={iconColor} style={{ marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontWeight: 600, color: rule.type === 'Pass' ? 'var(--text-main)' : iconColor }}>
                  {rule.type.toUpperCase()}
                </div>
                <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>Problem: {details.problem}</div>
                <div style={{ color: 'var(--text-muted)' }}>Why it is a problem: {details.reason}</div>
                <div style={{ color: 'var(--text-muted)' }}>Suggested correction: {details.fix}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DrcReport;
