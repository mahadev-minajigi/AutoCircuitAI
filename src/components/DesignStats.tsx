import React from 'react';
import { Zap, Cpu, ShoppingCart, Activity } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';

interface DesignStatsProps {
  design: CircuitDesign;
}

const DesignStats: React.FC<DesignStatsProps> = ({ design }) => {
  const totalCost = design.components.reduce((sum, c) => sum + c.estimatedCost, 0);

  const protocols = new Set(
    design.pinMappings
      .filter(p => !['Power', 'GND'].includes(p.protocol))
      .map(p => p.protocol)
  );

  const categoryCount = design.components.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Universal Fix 2: Power Budget Calculation & Display
  const mcu = design.components.find(c => c.category === 'MCU');
  const isArduinoUno = mcu?.name.toLowerCase().includes('uno') || mcu?.name.toLowerCase().includes('atmega328');
  const mcuIdleCurrent = isArduinoUno ? 320 : (mcu?.maxCurrent_mA || (mcu?.name.toLowerCase().includes('esp32') ? 240 : 100));
  
  // Calculate peripherals current (LED, sensors, actuators)
  const nonMcuCurrent = design.components
    .filter(c => c.id !== mcu?.id)
    .reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);
  
  const ledCircuitCurrent = nonMcuCurrent > 0 ? nonMcuCurrent : 5;
  const totalPeakCurrent = mcuIdleCurrent + ledCircuitCurrent;
  const powerPercent = Math.min((totalPeakCurrent / 500) * 100, 100);

  const drcErrors = design.drcReport?.filter(r => r.type === 'Error').length || 0;
  const drcWarnings = design.drcReport?.filter(r => r.type === 'Warning').length || 0;

  return (
    <div className="design-stats" aria-label="Design statistics">
      <div className="stat-card stat-card-power-budget">
        <div className="stat-icon-wrap stat-power">
          <Zap size={16} />
        </div>
        <div className="stat-body">
          <div className="stat-value">{totalPeakCurrent}<span className="stat-unit">mA Peak</span></div>
          <div className="stat-label">Power Budget</div>
          
          {/* Detailed breakdown per requirement */}
          <div className="power-breakdown-box">
            <div className="power-item">
              <span className="power-name">MCU Idle:</span>
              <span className="power-val">{mcuIdleCurrent}mA ({mcu?.name || 'Controller'})</span>
            </div>
            <div className="power-item">
              <span className="power-name">LED Circuit:</span>
              <span className="power-val">~{ledCircuitCurrent}mA when active</span>
            </div>
            <div className="power-item power-total">
              <span className="power-name">Total:</span>
              <span className="power-val">{totalPeakCurrent}mA peak</span>
            </div>
            <div className="power-baseline-note">
              * {mcuIdleCurrent}mA is board baseline, not LED current
            </div>
          </div>

          <div className="stat-bar" title={`${totalPeakCurrent}mA of 500mA USB limit`}>
            <div
              className={`stat-bar-fill ${powerPercent > 80 ? 'danger' : powerPercent > 50 ? 'warn' : ''}`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon-wrap stat-cost">
          <ShoppingCart size={16} />
        </div>
        <div className="stat-body">
          <div className="stat-value">₹{totalCost.toFixed(0)}</div>
          <div className="stat-label">Estimated Cost</div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon-wrap stat-parts">
          <Cpu size={16} />
        </div>
        <div className="stat-body">
          <div className="stat-value">{design.components.length}</div>
          <div className="stat-label">Components</div>
          <div className="stat-tags">
            {Object.entries(categoryCount).map(([cat, count]) => (
              <span key={cat} className="stat-tag">{count} {cat}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon-wrap stat-bus">
          <Activity size={16} />
        </div>
        <div className="stat-body">
          <div className="stat-value">{protocols.size}</div>
          <div className="stat-label">Protocols</div>
          <div className="stat-tags">
            {[...protocols].map(p => (
              <span key={p} className="stat-tag">{p}</span>
            ))}
          </div>
        </div>
      </div>

      {(drcErrors > 0 || drcWarnings > 0) && (
        <div className="stat-card stat-drc-summary">
          <div className={`stat-icon-wrap ${drcErrors > 0 ? 'stat-error' : 'stat-warning'}`}>
            <Activity size={16} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{drcErrors + drcWarnings}</div>
            <div className="stat-label">DRC Issues</div>
            <div className="stat-tags">
              {drcErrors > 0 && <span className="stat-tag stat-tag-error">{drcErrors} Error{drcErrors > 1 ? 's' : ''}</span>}
              {drcWarnings > 0 && <span className="stat-tag stat-tag-warn">{drcWarnings} Warning{drcWarnings > 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignStats;
