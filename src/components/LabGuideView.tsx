import React, { useState } from 'react';
import type { CircuitDesign } from '../types/circuit';
import { 
  BookOpen, 
  AlertTriangle, 
  CheckCircle2, 
  Wrench, 
  Zap, 
  HelpCircle, 
  Layers, 
  ClipboardCheck
} from 'lucide-react';

interface LabGuideViewProps {
  design: CircuitDesign;
  onShowToast?: (message: string, type: 'success' | 'info' | 'error') => void;
}

const LabGuideView: React.FC<LabGuideViewProps> = ({ design, onShowToast }) => {
  const guide = design.labGuide;
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const toggleStep = (stepNumber: number) => {
    setCompletedSteps(prev => {
      const next = { ...prev, [stepNumber]: !prev[stepNumber] };
      if (!prev[stepNumber] && onShowToast) {
        onShowToast(`Step ${stepNumber} completed!`, 'success');
      }
      return next;
    });
  };

  const mcu = design.components.find(c => c.category === 'MCU');

  return (
    <div className="lab-guide-container">
      {/* Header Banner */}
      <div className="lab-guide-header">
        <div className="lab-guide-title-block">
          <div className="lab-guide-badge">
            <BookOpen size={16} /> College IoT & Embedded Lab Manual
          </div>
          <h2>Practical Lab Implementation Guide</h2>
          <p className="lab-guide-subtitle">
            Step-by-step physical breadboard wiring, pin-level testing, electrical safety precautions, and lab debugging procedure for <strong>{design.title}</strong>.
          </p>
        </div>

        <div className="lab-quick-stats">
          <div className="lab-stat-box">
            <span className="lab-stat-label">Logic Level</span>
            <span className="lab-stat-value">{mcu?.operatingVoltage ? `${mcu.operatingVoltage}V DC` : '3.3V DC'}</span>
          </div>
          <div className="lab-stat-box">
            <span className="lab-stat-label">Components</span>
            <span className="lab-stat-value">{design.components.length} Items</span>
          </div>
          <div className="lab-stat-box">
            <span className="lab-stat-label">Jumper Wires</span>
            <span className="lab-stat-value">{design.pinMappings.length} Connections</span>
          </div>
        </div>
      </div>

      {/* Safety & Voltage Warning Banner */}
      <div className="lab-safety-banner">
        <div className="lab-safety-icon">
          <Zap size={24} />
        </div>
        <div>
          <h4>Important Lab Safety & Logic Level Requirement</h4>
          <p>
            {guide?.voltageSupplyNote || 
              `This circuit is built around ${mcu?.name || 'the microcontroller'} which operates at ${mcu?.operatingVoltage || 3.3}V logic. Always disconnect the USB cable before altering any wiring on the breadboard to prevent short circuits.`}
          </p>
        </div>
      </div>

      {/* Prerequisites / Lab Kit Checklist */}
      <div className="lab-section-card">
        <div className="lab-section-header">
          <Layers size={20} className="lab-icon-cyan" />
          <h3>1. Required Lab Hardware & Software Kit</h3>
        </div>
        <ul className="lab-checklist">
          {(guide?.prerequisites || [
            'Half-size or Full-size Solderless Breadboard',
            `${mcu?.name || 'Microcontroller'} Development Board with USB cable`,
            ...design.components.filter(c => c.category !== 'MCU').map(c => `${c.name} (${c.category})`),
            'Set of Male-to-Male and Male-to-Female DuPont jumper wires',
            'Arduino IDE installed on lab PC with corresponding board drivers'
          ]).map((item, idx) => (
            <li key={idx} className="lab-checklist-item">
              <span className="lab-bullet-check">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Detailed Pin-by-Pin Component Breakdown for Students */}
      <div className="lab-section-card">
        <div className="lab-section-header">
          <Wrench size={20} className="lab-icon-emerald" />
          <h3>2. Component Pin Reference & Electrical Functions</h3>
        </div>
        <p className="lab-section-desc">
          Understand what each pin on the component does before plugging it into the board:
        </p>
        <div className="lab-components-grid">
          {design.components.map(comp => (
            <div key={comp.id} className="lab-comp-card">
              <div className="lab-comp-header">
                <span className="lab-comp-tag">{comp.category}</span>
                <h4>{comp.name}</h4>
              </div>
              <p className="lab-comp-desc">{comp.description}</p>
              <div className="lab-pins-list">
                <div className="lab-pins-title">Pin Roles & Functions:</div>
                {comp.pins.map(pin => {
                  const role = comp.pinDescriptions?.[pin] || 
                    (pin === 'VCC' || pin === '3V3' || pin === 'VIN' ? 'Power Supply Input' :
                     pin === 'GND' ? 'Common Ground' :
                     pin === 'SDA' ? 'I2C Data Line' :
                     pin === 'SCL' ? 'I2C Clock Line' :
                     pin.startsWith('GPIO') || pin.startsWith('IO') || pin.startsWith('PA') || pin.startsWith('GP') ? 'Configurable Digital I/O' : 'Signal / Control Pin');
                  return (
                    <div key={pin} className="lab-pin-row">
                      <span className="lab-pin-name">{pin}</span>
                      <span className="lab-pin-role">{role}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step-by-Step Breadboard Wiring Instructions */}
      <div className="lab-section-card">
        <div className="lab-section-header">
          <ClipboardCheck size={20} className="lab-icon-amber" />
          <h3>3. Step-by-Step Breadboard Assembly Instructions</h3>
        </div>
        <p className="lab-section-desc">
          Check off each step as you complete it at your lab workbench:
        </p>

        <div className="lab-steps-flow">
          {(guide?.breadboardWiringSteps || [
            {
              stepNumber: 1,
              title: 'Mount the Microcontroller',
              instruction: `Insert the ${mcu?.name || 'microcontroller'} across the center divider trench of the breadboard so row pins are isolated.`,
              caution: 'Ensure pins align smoothly without bending.'
            },
            {
              stepNumber: 2,
              title: 'Connect Power and Ground Rails',
              instruction: `Run a jumper from ${mcu?.name || 'MCU'} 3.3V to the breadboard (+) red rail, and GND to the (-) blue rail.`,
              caution: 'Double check polarity before powering on.'
            },
            {
              stepNumber: 3,
              title: 'Wire Peripheral Modules',
              instruction: `Place sensors and modules on the board and connect power rails and data signals as per the Pin Mapping table.`,
            }
          ]).map(step => {
            const isDone = !!completedSteps[step.stepNumber];
            return (
              <div 
                key={step.stepNumber} 
                className={`lab-step-card ${isDone ? 'completed' : ''}`}
                onClick={() => toggleStep(step.stepNumber)}
              >
                <div className="lab-step-num-box">
                  {isDone ? <CheckCircle2 size={24} className="step-checked" /> : step.stepNumber}
                </div>
                <div className="lab-step-body">
                  <div className="lab-step-title-line">
                    <h4>{step.title}</h4>
                    <span className="lab-step-status-tag">{isDone ? 'Done' : 'Click to mark complete'}</span>
                  </div>
                  <p className="lab-step-instruction">{step.instruction}</p>
                  {step.caution && (
                    <div className="lab-step-caution">
                      <AlertTriangle size={15} />
                      <span>{step.caution}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lab Verification & Testing Procedure */}
      <div className="lab-section-card">
        <div className="lab-section-header">
          <CheckCircle2 size={20} className="lab-icon-emerald" />
          <h3>4. Practical Verification & Testing Procedure</h3>
        </div>
        <ol className="lab-procedure-list">
          {(guide?.testingProcedure || [
            'Do NOT connect USB yet. Perform a visual sanity check: ensure no bare wires touch.',
            'Plug in the USB cable to the PC. If the MCU on-board power LED does not light up immediately, DISCONNECT USB within 2 seconds (short circuit protection).',
            'Open Arduino IDE, select the matching COM port and board variant.',
            'Upload the starter firmware sketch from the "Firmware" tab.',
            'Open Serial Monitor (115200 baud) and verify telemetry or debug logs.'
          ]).map((proc, idx) => (
            <li key={idx} className="lab-proc-item">
              <span className="lab-proc-number">{idx + 1}</span>
              <span>{proc}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Troubleshooting Common Lab Mistakes */}
      <div className="lab-section-card">
        <div className="lab-section-header">
          <HelpCircle size={20} className="lab-icon-rose" />
          <h3>5. Common Lab Mistakes & Troubleshooting</h3>
        </div>
        <div className="lab-troubleshooting-grid">
          {(guide?.troubleshootingTips || [
            'Device not detected on USB: Try a different USB cable that supports data transfer, or install CH340 / CP2102 drivers.',
            'Sensor readings are 0.0 or nan: Verify I2C SDA and SCL are not swapped. SDA must go to SDA and SCL to SCL.',
            'Board resets repeatedly: ESP32 / STM32 Wi-Fi bursts cause voltage dips on low-current USB ports. Use a direct PC rear USB port.'
          ]).map((tip, idx) => {
            const [issue, solution] = tip.includes(':') ? tip.split(/:\s*(.*)/) : ['Tip', tip];
            return (
              <div key={idx} className="lab-troubleshoot-card">
                <div className="lab-issue-title">
                  <AlertTriangle size={16} />
                  <span>{issue}</span>
                </div>
                <div className="lab-solution-body">{solution}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LabGuideView;
