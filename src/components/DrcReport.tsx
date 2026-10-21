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

  // Requirement 4: Explicit 5-Point DRC Validation Suite
  // 1. I2C pull-up resistor presence
  const hasI2C = design.pinMappings.some(p => p.protocol === 'I2C');
  const isPullup = (component: typeof design.components[number]) => /pull[\s-]?up/i.test(`${component.name} ${component.description}`);
  const hasPullupForLine = (line: 'SDA' | 'SCL') => design.components.some(component => {
    if (!isPullup(component) || !new RegExp(line, 'i').test(`${component.name} ${component.description}`)) return false;
    const endpoints = design.pinMappings.filter(mapping => mapping.componentId === component.id);
    return endpoints.some(mapping => mapping.componentPin === '1' && mapping.protocol === 'Power') &&
      endpoints.some(mapping => mapping.componentPin === '2' && mapping.protocol === 'I2C');
  });
  const hasSdaPullup = hasPullupForLine('SDA');
  const hasSclPullup = hasPullupForLine('SCL');
  const hasPullupResistor = hasSdaPullup && hasSclPullup;
  const i2cPullupStatus: 'PASS' | 'FAIL' = hasI2C ? (hasPullupResistor ? 'PASS' : 'FAIL') : 'PASS';

  // 2. Per-IC bypass capacitor connectivity; physical distance is a build constraint.
  const poweredIcCount = design.components.filter(component => ['MCU', 'Sensor', 'Actuator'].includes(component.category)).length;
  const wiredDecouplingCaps = design.components.filter(component => {
    if (!/100\s*n\s*f|decoupl|bypass/i.test(`${component.name} ${component.description}`)) return false;
    const endpoints = design.pinMappings.filter(mapping => mapping.componentId === component.id);
    return endpoints.some(mapping => mapping.componentPin === '1' && mapping.protocol === 'Power') &&
      endpoints.some(mapping => mapping.componentPin === '2' && mapping.protocol === 'GND');
  }).length;
  const hasDecouplingCap = poweredIcCount > 0 && wiredDecouplingCaps >= poweredIcCount;
  const decouplingStatus: 'PASS' | 'FAIL' = hasDecouplingCap ? 'PASS' : 'FAIL';

  // 3. Voltage regulator capacitor presence
  const hasLinearRegulator = design.components.some(c => c.name.toLowerCase().includes('ams1117') || c.name.toLowerCase().includes('ldo'));
  const hasRegulatorInputCap = design.components.some(c => /10\s*(?:µ|u)?f.*input|input.*10\s*(?:µ|u)?f/i.test(c.name));
  const hasRegulatorOutputCap = design.components.some(c => /10\s*(?:µ|u)?f.*output|output.*10\s*(?:µ|u)?f/i.test(c.name));
  const hasRegulatorCaps = hasRegulatorInputCap && hasRegulatorOutputCap;
  const regCapStatus: 'PASS' | 'FAIL' = hasLinearRegulator ? (hasRegulatorCaps ? 'PASS' : 'FAIL') : 'PASS';

  // 4. I2C address conflict detection
  // Only real I2C devices count. Passives named after a nearby IC (for example,
  // "100nF capacitor (BME280)") are not bus devices and must not create a collision.
  const i2cDeviceIds = new Set(design.pinMappings
    .filter(mapping => mapping.protocol === 'I2C')
    .map(mapping => mapping.componentId));
  const i2cDevices = design.components.filter(component =>
    i2cDeviceIds.has(component.id) && ['Sensor', 'Actuator'].includes(component.category));
  const getI2cAddress = (component: typeof design.components[number]) => {
    const explicitAddress = 'i2cAddress' in component ? String(component.i2cAddress ?? '') : '';
    const match = `${explicitAddress} ${component.name} ${component.description}`.match(/0x[\da-f]{1,2}/i);
    if (match) return match[0].toLowerCase();
    const identity = `${component.name} ${component.description}`.toLowerCase();
    if (/bme280/.test(identity)) return '0x76';
    if (/ssd1306|oled/.test(identity)) return '0x3c';
    return null;
  };
  const knownI2cAddresses = i2cDevices.map(getI2cAddress).filter((address): address is string => address !== null);
  const hasAddressConflict = new Set(knownI2cAddresses).size !== knownI2cAddresses.length;
  const i2cConflictStatus: 'PASS' | 'FAIL' = hasAddressConflict ? 'FAIL' : 'PASS';
  const addressSummary = i2cDevices.length === 0
    ? 'No I2C devices in this design.'
    : hasAddressConflict
      ? 'Two or more mapped I2C devices use the same known 7-bit address.'
      : knownI2cAddresses.length === i2cDevices.length
        ? `No duplicate addresses detected (${i2cDevices.map(device => `${device.name}: ${getI2cAddress(device)}`).join(', ')}).`
        : 'No duplicate known addresses detected; confirm addresses for devices without an explicit or recognized address.';

  // 5. Logic level compatibility (3.3V vs 5V on data lines)
  const mcu = design.components.find(c => c.category === 'MCU');
  // Check if any digital signal line interfaces a 5V component directly to a 3.3V MCU
  const hasDigitalVoltageMismatch = design.pinMappings.some(mapping => {
    if (mapping.protocol === 'Power' || mapping.protocol === 'GND') return false;
    const comp = design.components.find(c => c.id === mapping.componentId);
    return comp && comp.operatingVoltage && mcu?.operatingVoltage && comp.operatingVoltage > mcu.operatingVoltage;
  });
  const logicLevelStatus: 'PASS' | 'FAIL' = hasDigitalVoltageMismatch ? 'FAIL' : 'PASS';

  // Explicit check fails count
  const explicitFails = [i2cPullupStatus, decouplingStatus, regCapStatus, i2cConflictStatus, logicLevelStatus].filter(s => s === 'FAIL').length;
  const totalErrors = errors.length + explicitFails;

  // Overall Readiness
  const isOverallReady = totalErrors === 0;
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
          <div className={`drc-count-badge ${totalErrors > 0 ? 'drc-badge-error' : ''}`}>
            <XCircle size={18} /> <span>{totalErrors} Errors</span>
          </div>
          <div className={`drc-count-badge ${warnings.length > 0 ? 'drc-badge-warn' : ''}`}>
            <AlertTriangle size={18} /> <span>{warnings.length} Warnings</span>
          </div>
          <div className="drc-count-badge drc-badge-pass">
            <CheckCircle size={18} /> <span>{passes.length} Passed</span>
          </div>
        </div>
      </div>

      {/* Requirement 4: 5 Explicit Electrical DRC Checks */}
      <div className="drc-summary-grid">
        {/* 1. I2C Pull-Up Resistors */}
        <div className={`drc-check-card ${i2cPullupStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Zap size={18} />
            <span className="drc-check-title">I2C Pull-Up Resistors</span>
          </div>
          <div className="drc-check-status">
            {i2cPullupStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">4.7kΩ pull-up resistors present on both SDA and SCL open-drain lines.</p>
        </div>

        {/* 2. Decoupling Capacitors Proximity */}
        <div className={`drc-check-card ${decouplingStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Activity size={18} />
            <span className="drc-check-title">Decoupling Capacitors</span>
          </div>
          <div className="drc-check-status">
            {decouplingStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">A 100nF capacitor is wired across supply and ground for each modeled IC. Place each capacitor within 10mm during assembly.</p>
        </div>

        {/* 3. Voltage Regulator Capacitors */}
        <div className={`drc-check-card ${regCapStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <ShieldCheck size={18} />
            <span className="drc-check-title">Regulator Capacitors</span>
          </div>
          <div className="drc-check-status">
            {regCapStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">10µF input and 10µF output bulk capacitors on AMS1117 regulator.</p>
        </div>

        {/* 4. I2C Address Conflicts */}
        <div className={`drc-check-card ${i2cConflictStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Activity size={18} />
            <span className="drc-check-title">I2C Address Conflicts</span>
          </div>
          <div className="drc-check-status">
            {i2cConflictStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">{addressSummary}</p>
        </div>

        {/* 5. Logic Level Compatibility */}
        <div className={`drc-check-card ${logicLevelStatus === 'PASS' ? 'check-pass' : 'check-fail'}`}>
          <div className="drc-check-header">
            <Zap size={18} />
            <span className="drc-check-title">Logic Level (3.3V vs 5V)</span>
          </div>
          <div className="drc-check-status">
            {logicLevelStatus === 'PASS' ? (
              <span className="status-pill status-pass"><Check size={14} /> PASS</span>
            ) : (
              <span className="status-pill status-fail"><X size={14} /> FAIL</span>
            )}
          </div>
          <p className="drc-check-desc">Zero 5V over-voltage signals on native 3.3V MCU digital pins.</p>
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
              : 'Resolve outstanding DRC errors before custom PCB manufacturing or powering on bare silicon.'}
          </p>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            <strong>Hardware context:</strong> Breakout boards may include pull-ups or decoupling; check each module schematic. Bare ICs need external support parts. This report checks modeled connections and cannot verify onboard components or physical capacitor placement.
          </div>
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
