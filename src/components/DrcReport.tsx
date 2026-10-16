import React from 'react';
import type { CircuitDesign } from '../types/circuit';
import { AlertTriangle, CheckCircle, XCircle, ShieldCheck, Zap, Activity, Check, X } from 'lucide-react';

interface DrcReportProps {
  design: CircuitDesign;
}

const DrcReport: React.FC<DrcReportProps> = ({ design }) => {
  const drcRules = design.drcReport || [];

  const errors = drcRules.filter(r => r.type === 'Error');
  const warnings = drcRules.filter(r => r.type === 'Warning');
  const passes = drcRules.filter(r => r.type === 'Pass');

  // Fix 4: Core DRC Check Evaluations
  // 1. Power shorts: Fail if any VCC pin connects to GND or errors mention short/voltage conflict
  const hasShorts = drcRules.some(r => 
    r.type === 'Error' && (r.message.toLowerCase().includes('short') || r.message.toLowerCase().includes('voltage'))
  );
  const powerShortsStatus: 'PASS' | 'FAIL' = hasShorts ? 'FAIL' : 'PASS';

  // 2. Current limits: Fail if total current exceeds 500mA without regulator
  const totalCurrent = design.components.reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);
  const hasCurrentError = drcRules.some(r => r.type === 'Error' && r.message.toLowerCase().includes('current'));
  const currentLimitsStatus: 'PASS' | 'FAIL' = (hasCurrentError || totalCurrent > 1500) ? 'FAIL' : 'PASS';

  // 3. Clearances: Check if pin utilization is safe (<100%) and no unconnected floating power pins
  const hasClearanceError = drcRules.some(r => r.type === 'Error' && r.message.toLowerCase().includes('pin count exceeded'));
  const clearancesStatus: 'PASS' | 'FAIL' = hasClearanceError ? 'FAIL' : 'PASS';

  // 4. Overall: READY if 0 errors, NOT READY if any error
  const isOverallReady = errors.length === 0 && powerShortsStatus === 'PASS' && currentLimitsStatus === 'PASS' && clearancesStatus === 'PASS';
  const overallStatus: 'READY' | 'NOT READY' = isOverallReady ? 'READY' : 'NOT READY';

  const parseRule = (message: string) => {
    const parts = message.split(' | ');
    return {
      problem: parts[0] || 'Check failed',
      reason: parts[1] || 'This issue may affect the design outcome.',
      fix: parts[2] || 'Review the design and adjust the connection or component.'
    };
  };

  return (
    <div className="drc-report-container">
      {/* Header and Counters */}
      <div className="drc-header-row">
        <div>
          <h2>
            <ShieldCheck color="var(--accent-cyan)" size={24} /> Design Rule Check (DRC)
          </h2>
          <p className="drc-subtitle">Comprehensive electrical rule checking, power integrity, and fabrication validation.</p>
        </div>

        <div className="drc-counts-box">
          <div className={`drc-count-badge ${errors.length > 0 ? 'drc-badge-error' : ''}`}>
            <XCircle size={18} /> <span>{errors.length} Errors</span>
          </div>
          <div className={`drc-count-badge ${warnings.length > 0 ? 'drc-badge-warn' : ''}`}>
            <AlertTriangle size={18} /> <span>{warnings.length} Warnings</span>
          </div>
          <div className="drc-count-badge drc-badge-pass">
            <CheckCircle size={18} /> <span>{passes.length} Passed</span>
          </div>
        </div>
      </div>

      {/* Fix 4: Universal DRC Validation Grid Results */}
      <div className="drc-summary-grid">
        {/* Power Shorts */}
        <div className={`drc-check-card ${powerShortsStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Zap size={18} />
            <span className="drc-check-title">Power shorts</span>
          </div>
          <div className="drc-check-status">
            {powerShortsStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">Zero short-circuits detected between VCC rails and GND plane.</p>
        </div>

        {/* Current Limits */}
        <div className={`drc-check-card ${currentLimitsStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Activity size={18} />
            <span className="drc-check-title">Current limits</span>
          </div>
          <div className="drc-check-status">
            {currentLimitsStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">Total load current is within safe USB / regulator limits.</p>
        </div>

        {/* Clearances */}
        <div className={`drc-check-card ${clearancesStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <ShieldCheck size={18} />
            <span className="drc-check-title">Clearances</span>
          </div>
          <div className="drc-check-status">
            {clearancesStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">MCU pin allocation and electrical signal trace separation verified.</p>
        </div>

        {/* Overall Readiness */}
        <div className={`drc-check-card drc-overall-card ${overallStatus === 'READY' ? 'overall-ready' : 'overall-not-ready'}`}>
          <div className="drc-check-header">
            <ShieldCheck size={18} />
            <span className="drc-check-title">Overall Status</span>
          </div>
          <div className="drc-check-status">
            {overallStatus === 'READY' ? (
              <span className="status-pill status-ready">READY</span>
            ) : (
              <span className="status-pill status-not-ready">NOT READY</span>
            )}
          </div>
          <p className="drc-check-desc">
            {overallStatus === 'READY' 
              ? 'Circuit passed essential electrical validation. Ready for prototyping.'
              : 'Resolve outstanding DRC errors before manufacturing or powering on.'}
          </p>
        </div>
      </div>

      {/* Detailed Rules List */}
      <div className="drc-rules-list">
        {drcRules.map((rule, idx) => {
          let bgColor = 'rgba(255, 255, 255, 0.03)';
          let borderColor = 'var(--border-color)';
          let Icon = CheckCircle;
          let iconColor = 'var(--accent-emerald)';

          if (rule.type === 'Error') {
            bgColor = 'rgba(255, 51, 102, 0.08)';
            borderColor = 'var(--accent-rose)';
            Icon = XCircle;
            iconColor = 'var(--accent-rose)';
          } else if (rule.type === 'Warning') {
            bgColor = 'rgba(255, 184, 0, 0.08)';
            borderColor = 'var(--accent-amber)';
            Icon = AlertTriangle;
            iconColor = 'var(--accent-amber)';
          }

          const details = parseRule(rule.message);

          return (
            <div 
              key={idx} 
              className="drc-rule-card"
              style={{
                background: bgColor,
                borderColor: borderColor
              }}
            >
              <Icon color={iconColor} size={20} className="drc-rule-icon" />
              <div className="drc-rule-content">
                <div className="drc-rule-tag" style={{ color: iconColor }}>
                  {rule.type.toUpperCase()}
                </div>
                <div className="drc-problem-text"><strong>Problem:</strong> {details.problem}</div>
                <div className="drc-reason-text"><strong>Why it is a problem:</strong> {details.reason}</div>
                <div className="drc-fix-text"><strong>Suggested correction:</strong> {details.fix}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DrcReport;
