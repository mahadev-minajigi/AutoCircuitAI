import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

interface OscilloscopeViewerProps {
  isSimulating?: boolean;
}

const OscilloscopeViewer: React.FC<OscilloscopeViewerProps> = ({ isSimulating = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channel1Active, setChannel1Active] = useState<boolean>(true); // CH1: SCL
  const [channel2Active, setChannel2Active] = useState<boolean>(true); // CH2: SDA
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

      // Draw Grid Graticule (10x8 divisions)
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

      // Draw CH1: SCL Clock Waveform (Yellow)
      if (channel1Active) {
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const sclBaseline = height * 0.35;
        const clockPeriod = 40;

        for (let x = 0; x < width; x++) {
          const t = (x + offset) % clockPeriod;
          const isHigh = t < clockPeriod / 2;
          const y = isHigh ? sclBaseline - 25 : sclBaseline + 15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw CH2: SDA Data Waveform with packet frame (Cyan)
      if (channel2Active) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const sdaBaseline = height * 0.75;
        const dataPeriod = 80;

        for (let x = 0; x < width; x++) {
          const t = (x + offset) % dataPeriod;
          // Simulated pseudo-random data bits with start/ack condition
          const isHigh = (Math.sin((x + offset) * 0.05) > 0.1) && (t > 10 && t < 70);
          const y = isHigh ? sdaBaseline - 25 : sdaBaseline + 15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Channel Labels & Telemetry Readout
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText('CH1 (SCL): 400.0 kHz | 3.3V pk-pk', 12, 20);

      ctx.fillStyle = '#00f0ff';
      ctx.fillText('CH2 (SDA): I2C DATA (ADDR 0x76/0x3C)', 12, 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('TIME: 2.50 µs/div | TRIG: AUTO', width - 12, 20);

      animId = requestAnimationFrame(renderScope);
    };

    renderScope();
    return () => cancelAnimationFrame(animId);
  }, [isRunning, channel1Active, channel2Active]);

  return (
    <div className="oscilloscope-card">
      <div className="oscilloscope-toolbar">
        <div className="scope-title">
          <Activity size={16} className="scope-icon" />
          <span>Virtual DSO & Logic Analyzer (I2C / SPI Waveforms)</span>
        </div>

        <div className="scope-controls">
          <button 
            className={`scope-ch-btn ch1-btn ${channel1Active ? 'active' : ''}`}
            onClick={() => setChannel1Active(prev => !prev)}
          >
            CH1: SCL
          </button>
          <button 
            className={`scope-ch-btn ch2-btn ${channel2Active ? 'active' : ''}`}
            onClick={() => setChannel2Active(prev => !prev)}
          >
            CH2: SDA
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
