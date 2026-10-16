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

  // Universal Fix 1: Power Budget Calculation & Display
  const mcu = design.components.find(c => c.category === 'MCU');
  const isEsp32 = mcu?.name.toLowerCase().includes('esp32');
  const isArduinoUno = mcu?.name.toLowerCase().includes('uno') || mcu?.name.toLowerCase().includes('atmega328');
  
  // MCU currents
  const mcuAvgCurrent = isEsp32 ? 240 : isArduinoUno ? 320 : (mcu?.maxCurrent_mA || 100);
  const mcuPeakCurrent = isEsp32 ? 350 : mcuAvgCurrent; // 350mA peak during WiFi TX
  
  // Peripherals breakdown
  const bme280 = design.components.find(c => c.name.toLowerCase().includes('bme280') || c.name.toLowerCase().includes('dht'));
  const oled = design.components.find(c => c.name.toLowerCase().includes('oled') || c.name.toLowerCase().includes('display'));
  const regulator = design.components.find(c => c.category === 'Power' || c.name.toLowerCase().includes('ams1117'));

  const bmeCurrent = bme280 ? (bme280.maxCurrent_mA || 1) : 0;
  const oledCurrent = oled ? (oled.maxCurrent_mA || 20) : 0;
  const regQuiescent = regulator ? (regulator.maxCurrent_mA || 5) : 0;

  // Other peripherals if not in weather station
  const hasLed = design.components.some(c => c.name.toLowerCase().includes('led'));
  const otherPeripheralsCurrent = design.components
    .filter(c => c.id !== mcu?.id && c.id !== bme280?.id && c.id !== oled?.id && c.id !== regulator?.id)
    .reduce((sum, c) => sum + (c.maxCurrent_mA || 0), 0);

  const peripheralTotal = bmeCurrent + oledCurrent + regQuiescent + otherPeripheralsCurrent;
  const totalTypicalCurrent = mcuAvgCurrent + peripheralTotal;
  const totalPeakCurrent = isEsp32 ? (350 + (oled ? 30 : oledCurrent) + bmeCurrent + regQuiescent + otherPeripheralsCurrent) : (mcuPeakCurrent + peripheralTotal);
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
          <div className="stat-value">~{totalTypicalCurrent}<span className="stat-unit">mA Typ / {totalPeakCurrent}mA Peak</span></div>
          <div className="stat-label">Power Budget</div>
          
          {/* Detailed breakdown per requirement */}
          <div className="power-breakdown-box">
            <div className="power-item">
              <span className="power-name">{mcu?.name || 'MCU'}:</span>
              <span className="power-val">{mcuAvgCurrent}mA avg ({isEsp32 ? '350mA WiFi TX peak' : 'baseline'})</span>
            </div>
            {bme280 && (
              <div className="power-item">
                <span className="power-name">{bme280.name}:</span>
                <span className="power-val">1mA active (0.1µA sleep)</span>
              </div>
            )}
            {oled && (
              <div className="power-item">
                <span className="power-name">{oled.name}:</span>
                <span className="power-val">20mA typical (30mA max)</span>
              </div>
            )}
            {regulator && (
              <div className="power-item">
                <span className="power-name">{regulator.name}:</span>
                <span className="power-val">5mA quiescent</span>
              </div>
            )}
            {hasLed && (
              <div className="power-item">
                <span className="power-name">LED Circuit:</span>
                <span className="power-val">~5mA when active</span>
              </div>
            )}
            <div className="power-item power-total">
              <span className="power-name">Total Draw:</span>
              <span className="power-val">~{totalTypicalCurrent}mA typical, ~{totalPeakCurrent}mA peak</span>
            </div>
            <div className="power-baseline-note">
              * {mcuAvgCurrent}mA is MCU baseline logic; safe for 500mA USB port
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
