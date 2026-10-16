import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';

interface OscilloscopeViewerProps {
  isSimulating?: boolean;
  design?: CircuitDesign;
}

const OscilloscopeViewer: React.FC<OscilloscopeViewerProps> = ({ isSimulating = true, design }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Detect protocol from design
  const protocol = useMemo(() => {
    if (!design) return 'I2C';
    const protos = design.pinMappings.map(p => p.protocol);
    if (protos.includes('I2S')) return 'I2S';
    if (protos.includes('SPI')) return 'SPI';
    if (protos.includes('PWM')) return 'PWM';
    if (protos.includes('I2C')) return 'I2C';
    return 'GPIO';
  }, [design]);

  const ch1Label = protocol === 'SPI' ? 'CH1: SCK (10MHz)' : protocol === 'I2S' ? 'CH1: BCLK (1.41MHz)' : protocol === 'PWM' ? 'CH1: PWM (1kHz 50%)' : 'CH1: SCL (400kHz)';
  const ch2Label = protocol === 'SPI' ? 'CH2: MOSI (Data)' : protocol === 'I2S' ? 'CH2: DIN (Audio)' : protocol === 'PWM' ? 'CH2: Pulse Feedback' : 'CH2: SDA (Data)';

  const [channel1Active, setChannel1Active] = useState<boolean>(true);
  const [channel2Active, setChannel2Active] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(isSimulating);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    setIsRunning(isSimulating);
  }, [isSimulating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderScope = () => {
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

      if (isRunning) {
        offsetRef.current += 3;
      }

      const offset = offsetRef.current;

      // Draw CH1 Clock / Square Wave (Yellow)
      if (channel1Active) {
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const ch1Baseline = height * 0.35;
        const clockPeriod = protocol === 'SPI' ? 24 : protocol === 'I2S' ? 30 : 40;

        for (let x = 0; x < width; x++) {
          const t = (x + offset) % clockPeriod;
          const isHigh = t < clockPeriod / 2;
          const y = isHigh ? ch1Baseline - 25 : ch1Baseline + 15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw CH2 Data / Modulated Waveform (Cyan)
      if (channel2Active) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const ch2Baseline = height * 0.75;
        const dataPeriod = protocol === 'SPI' ? 48 : protocol === 'I2S' ? 60 : 80;

        for (let x = 0; x < width; x++) {
          let y = ch2Baseline;
          if (protocol === 'I2S') {
            // Audio sine wave overlay on audio serial bus
            const audioVal = Math.sin((x + offset) * 0.08) * 22;
            y = ch2Baseline + audioVal;
          } else {
            const t = (x + offset) % dataPeriod;
            const isHigh = (Math.sin((x + offset) * 0.05) > 0.1) && (t > 10 && t < dataPeriod - 10);
            y = isHigh ? ch2Baseline - 25 : ch2Baseline + 15;
          }
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Channel Labels & Telemetry Readout
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(`${ch1Label} | 3.3V pk-pk`, 12, 20);

      ctx.fillStyle = '#00f0ff';
      ctx.fillText(`${ch2Label} | PROTOCOL: ${protocol}`, 12, 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      const timeDiv = protocol === 'SPI' ? '50.0 ns/div' : protocol === 'I2S' ? '500 ns/div' : '2.50 µs/div';
      ctx.fillText(`TIME: ${timeDiv} | TRIG: AUTO LOCKED`, width - 12, 20);

      animId = requestAnimationFrame(renderScope);
    };

    renderScope();
    return () => cancelAnimationFrame(animId);
  }, [isRunning, channel1Active, channel2Active, protocol, ch1Label, ch2Label]);

  return (
    <div className="oscilloscope-card">
      <div className="oscilloscope-toolbar">
        <div className="scope-title">
          <Activity size={16} className="scope-icon" />
          <span>Virtual DSO & Logic Analyzer ({protocol} Bus Signals)</span>
        </div>

        <div className="scope-controls">
          <button 
            className={`scope-ch-btn ch1-btn ${channel1Active ? 'active' : ''}`}
            onClick={() => setChannel1Active(prev => !prev)}
          >
            {ch1Label.split(' ')[0]}
          </button>
          <button 
            className={`scope-ch-btn ch2-btn ${channel2Active ? 'active' : ''}`}
            onClick={() => setChannel2Active(prev => !prev)}
          >
            {ch2Label.split(' ')[0]}
          </button>
          <button 
            className="scope-run-btn"
            onClick={() => setIsRunning(prev => !prev)}
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
