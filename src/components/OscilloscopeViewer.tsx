import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';
import { analyzeFirmwareForSimulation, getOutputStateAt } from '../services/firmwareSimulation';

interface OscilloscopeViewerProps {
  isSimulating?: boolean;
  design?: CircuitDesign;
}

const OscilloscopeViewer: React.FC<OscilloscopeViewerProps> = ({ isSimulating = true, design }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationPlan = useMemo(
    () => design ? analyzeFirmwareForSimulation(design) : null,
    [design],
  );
  const outputPins = useMemo(() => simulationPlan ? [...simulationPlan.outputPins] : [], [simulationPlan]);
  const ch1Label = outputPins[0] ? `CH1: GPIO ${outputPins[0]}` : 'CH1: no modeled output';
  const ch2Label = outputPins[1] ? `CH2: GPIO ${outputPins[1]}` : 'CH2: no second output';

  const [channel1Active, setChannel1Active] = useState<boolean>(true);
  const [channel2Active, setChannel2Active] = useState<boolean>(true);
  const [scopePaused, setScopePaused] = useState(false);
  const isRunning = isSimulating && !scopePaused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let elapsedMs = 0;
    let previousFrameTime = 0;

    const renderScope = () => {
      const now = performance.now();
      if (isRunning && simulationPlan?.isSupported && previousFrameTime > 0) elapsedMs += now - previousFrameTime;
      previousFrameTime = now;
      const width = canvas.parentElement?.clientWidth || 700;
      const height = 180;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // CRT phosphor dark green grid background
      ctx.fillStyle = '#05110d';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Graticule (10x6 divisions)
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.12)';
      ctx.lineWidth = 1;

      const numXDivs = 10;
      const numYDivs = 6;
      for (let x = 0; x <= width; x += width / numXDivs) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += height / numYDivs) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshairs
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.25)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      const drawOutput = (pin: string | undefined, baseline: number, color: string, active: boolean) => {
        if (!pin || !active || !simulationPlan?.isSupported) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        const windowStart = elapsedMs - simulationPlan.durationMs;
        for (let x = 0; x < width; x += 1) {
          const sampleTime = windowStart + (x / Math.max(width - 1, 1)) * simulationPlan.durationMs;
          const high = getOutputStateAt(simulationPlan, pin, sampleTime);
          const y = high ? baseline - 25 : baseline + 15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      drawOutput(outputPins[0], height * 0.35, '#eab308', channel1Active);
      drawOutput(outputPins[1], height * 0.75, '#00f0ff', channel2Active);

      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(ch1Label, 12, 20);

      ctx.fillStyle = '#00f0ff';
      ctx.fillText(ch2Label, 12, 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(simulationPlan?.isSupported ? 'TIME: firmware loop · visual only' : 'NO FIRMWARE-DERIVED TRACE', width - 12, 20);
      if (!simulationPlan?.isSupported) {
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('This sketch is outside the supported visual model.', width / 2, height / 2);
      }

      animId = requestAnimationFrame(renderScope);
    };

    renderScope();
    return () => cancelAnimationFrame(animId);
  }, [isRunning, channel1Active, channel2Active, simulationPlan, outputPins, ch1Label, ch2Label]);

  return (
    <div className="oscilloscope-card">
      <div className="oscilloscope-toolbar">
        <div className="scope-title">
          <Activity size={16} className="scope-icon" />
          <span>Firmware output monitor · visual model only</span>
        </div>

        <div className="scope-controls">
          <button 
            className={`scope-ch-btn ch1-btn ${channel1Active ? 'active' : ''}`}
            disabled={!simulationPlan?.isSupported || !outputPins[0]}
            onClick={() => setChannel1Active(prev => !prev)}
          >
            {ch1Label.split(' ')[0]}
          </button>
          <button 
            className={`scope-ch-btn ch2-btn ${channel2Active ? 'active' : ''}`}
            disabled={!simulationPlan?.isSupported || !outputPins[1]}
            onClick={() => setChannel2Active(prev => !prev)}
          >
            {ch2Label.split(' ')[0]}
          </button>
          <button 
            className="scope-run-btn"
            disabled={!simulationPlan?.isSupported || !isSimulating}
            onClick={() => setScopePaused(prev => !prev)}
          >
            {isRunning ? 'Pause' : 'Run'}
          </button>
        </div>
      </div>

      <div className="scope-screen-wrapper">
        <canvas ref={canvasRef} className="scope-canvas" />
      </div>
    </div>
  );
};

export default OscilloscopeViewer;
