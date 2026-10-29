import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';
import { analyzeFirmwareForSimulation, firmwareDrivesPin, getLedStatesAt, getOutputStateAt } from '../services/firmwareSimulation';

interface BreadboardVisualizerProps {
  design: CircuitDesign;
  onShowToast?: (message: string, type: 'success' | 'info' | 'error') => void;
}

const BreadboardVisualizer: React.FC<BreadboardVisualizerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mcu = design.components.find(c => c.category === 'MCU');
  const simulationPlan = useMemo(() => analyzeFirmwareForSimulation(design), [design]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame = 0;
    let previousFrameTime = 0;
    let lastTimeUpdate = 0;

    const drawBreadboard = (timeMs: number) => {
      const width = canvas.parentElement?.clientWidth || 900;
      const height = 580;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Dark background
      ctx.fillStyle = '#e9eff3';
      ctx.fillRect(0, 0, width, height);

      // Breadboard dimensions
      const boardWidth = Math.min(width - 40, 840);
      const boardHeight = 440;
      const startX = (width - boardWidth) / 2;
      const startY = 40;

      // Breadboard white/cream plastic body
      const ledStates = getLedStatesAt(simulationPlan, timeMs);
      ctx.fillStyle = '#f9fbfc';
      ctx.shadowColor = 'rgba(22, 38, 51, 0.2)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.beginPath();
      ctx.roundRect(startX, startY, boardWidth, boardHeight, 14);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = '#c3cfd7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const boardEdge = ctx.createLinearGradient(0, startY, 0, startY + boardHeight);
      boardEdge.addColorStop(0, 'rgba(255,255,255,.82)');
      boardEdge.addColorStop(1, 'rgba(101,123,137,.12)');
      ctx.strokeStyle = boardEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(startX + 2, startY + 2, boardWidth - 4, boardHeight - 4, 12);
      ctx.stroke();

      // Top & Bottom Power Rails (+ Red, - Blue Lines)
      // Top Rails
      ctx.strokeStyle = '#ef4444'; // Red +
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX + 30, startY + 28);
      ctx.lineTo(startX + boardWidth - 30, startY + 28);
      ctx.stroke();

      ctx.strokeStyle = '#3b82f6'; // Blue -
      ctx.beginPath();
      ctx.moveTo(startX + 30, startY + 54);
      ctx.lineTo(startX + boardWidth - 30, startY + 54);
      ctx.stroke();

      // Bottom Rails
      ctx.strokeStyle = '#ef4444'; // Red +
      ctx.beginPath();
      ctx.moveTo(startX + 30, startY + boardHeight - 54);
      ctx.lineTo(startX + boardWidth - 30, startY + boardHeight - 54);
      ctx.stroke();

      ctx.strokeStyle = '#3b82f6'; // Blue -
      ctx.beginPath();
      ctx.moveTo(startX + 30, startY + boardHeight - 28);
      ctx.lineTo(startX + boardWidth - 30, startY + boardHeight - 28);
      ctx.stroke();

      // Center Divider Trench
      const trenchY = startY + boardHeight / 2;
      ctx.fillStyle = '#d7e0e5';
      ctx.fillRect(startX + 20, trenchY - 8, boardWidth - 40, 16);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX + 20, trenchY - 8, boardWidth - 40, 16);

      // Breadboard Pin Holes (Tie points)
      const numCols = 30;
      const colSpacing = (boardWidth - 80) / numCols;
      ctx.fillStyle = '#253441';

      // Top power holes
      for (let c = 0; c < numCols; c++) {
        const hx = startX + 40 + c * colSpacing;
        // (+)
        ctx.fillRect(hx - 2, startY + 26, 4, 4);
        // (-)
        ctx.fillRect(hx - 2, startY + 52, 4, 4);
      }

      // Terminal strips (Upper rows A-E and Lower rows F-J)
      for (let c = 0; c < numCols; c++) {
        const hx = startX + 40 + c * colSpacing;

        // Rows A-E
        for (let r = 0; r < 5; r++) {
          const hy = startY + 85 + r * 18;
          ctx.fillRect(hx - 2, hy - 2, 4, 4);
        }

        // Rows F-J
        for (let r = 0; r < 5; r++) {
          const hy = trenchY + 22 + r * 18;
          ctx.fillRect(hx - 2, hy - 2, 4, 4);
        }
      }

      // Column number markers
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      for (let c = 0; c < numCols; c += 5) {
        const hx = startX + 40 + c * colSpacing;
        ctx.fillText(String(c + 1), hx, startY + 76);
        ctx.fillText(String(c + 1), hx, trenchY + 16);
      }

      // ── Draw Physical Components Placed onto Breadboard ───────────
      // 1. MCU Board Straddling Center Trench
      const mcuX = startX + 70;
      const mcuY = trenchY - 45;
      const mcuWidth = 140;
      const mcuHeight = 90;

      ctx.fillStyle = '#176848';
      ctx.strokeStyle = '#3a9c77';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(20, 64, 49, 0.28)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      ctx.beginPath();
      ctx.roundRect(mcuX, mcuY, mcuWidth, mcuHeight, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      const chipGradient = ctx.createLinearGradient(mcuX + 35, mcuY + 8, mcuX + 110, mcuY + 52);
      chipGradient.addColorStop(0, '#24333e');
      chipGradient.addColorStop(1, '#101820');
      ctx.fillStyle = chipGradient;
      ctx.strokeStyle = '#72818b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mcuX + 38, mcuY + 8, 64, 44, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b6c4ca';
      for (let pin = 0; pin < 8; pin += 1) {
        const px = mcuX + 42 + pin * 8;
        ctx.fillRect(px, mcuY + 2, 4, 6);
        ctx.fillRect(px, mcuY + 52, 4, 7);
      }
      ctx.fillStyle = '#f4d477';
      ctx.font = 'bold 7px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MCU', mcuX + 70, mcuY + 33);
      ctx.textAlign = 'left';

      // MCU Chip Label
      ctx.fillStyle = '#f2faf6';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(mcu?.name || 'ESP32 / MCU', mcuX + mcuWidth / 2, mcuY + 36);

      ctx.fillStyle = '#cae0d5';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText('MCU Dev Board', mcuX + mcuWidth / 2, mcuY + 52);

      // Micro-USB Port on left
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(mcuX - 8, mcuY + mcuHeight / 2 - 8, 8, 16);

      // Place every modeled component, including regulators and passives.
      const primaryModules = design.components.filter(c => c.id !== mcu?.id);

      const compPositions: { id: string; name: string; x: number; y: number; w: number; h: number; isOled: boolean; isSensor: boolean; isLed: boolean }[] = [];

      // Compute slot spacing based on number of primary modules
      const availableWidth = Math.max(boardWidth - (mcuWidth + 120), 140);
      const modSpacing = Math.min(160, availableWidth / Math.max(primaryModules.length, 1));

      primaryModules.forEach((comp, idx) => {
        const isPassive = comp.category === 'Passive';
        const isPower = comp.category === 'Power';
        const isOled = comp.name.toLowerCase().includes('oled') || comp.name.toLowerCase().includes('ssd1306');
        const isSensor = comp.category === 'Sensor' || comp.name.toLowerCase().includes('bme280') || comp.name.toLowerCase().includes('mpu');
        const isLed = /\b(?:led|diode)\b/i.test(comp.name);
        
        const pw = isPassive ? 88 : isOled ? 130 : isLed ? 88 : 108;
        const ph = isPassive ? 54 : isOled ? 95 : isLed ? 68 : 75;
        const columns = Math.max(1, Math.floor(availableWidth / 150));
        const px = startX + 235 + (idx % columns) * Math.min(150, modSpacing);
        const py = startY + 95 + Math.floor(idx / columns) * 105;

        compPositions.push({ id: comp.id, name: comp.name, x: px, y: py, w: pw, h: ph, isOled, isSensor, isLed });

        // Module PCB background
        ctx.fillStyle = isPassive ? '#f5ead0' : isPower ? '#e4f2e9' : isOled ? '#12323a' : isLed ? '#f2f5f7' : '#176d58';
        ctx.strokeStyle = isPassive ? '#c39a52' : isPower ? '#5d9b7a' : isOled ? '#53c6d0' : isLed ? '#bdcbd3' : '#31a77c';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(21, 41, 52, .16)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 6);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // OLED Visual Screen Mockup
        if (isPassive) {
          ctx.fillStyle = '#604a20';
          ctx.font = 'bold 8px Inter, sans-serif';
          ctx.fillText(comp.name, px + pw / 2, py + 23, pw - 6);
          ctx.font = '7px JetBrains Mono, monospace';
          ctx.fillText(comp.pins.join('  '), px + pw / 2, py + 39);
        } else if (isOled) {
          ctx.fillStyle = '#17212b';
          ctx.fillRect(px + 10, py + 10, pw - 20, 42);
          ctx.strokeStyle = '#0284c7';
          ctx.strokeRect(px + 10, py + 10, pw - 20, 42);

          // Simulated OLED display pixels
          ctx.fillStyle = '#8ee5e9';
          ctx.font = 'bold 8px JetBrains Mono, monospace';
          ctx.fillText('AUTO-CIRCUIT', px + pw / 2, py + 24);
          ctx.font = '7px JetBrains Mono, monospace';
          ctx.fillStyle = '#b5c8ca';
          ctx.fillText('SENSOR DATA', px + pw / 2, py + 36);
          ctx.fillText('NOT SIMULATED', px + pw / 2, py + 46);
        } else if (isLed) {
          const lit = ledStates.get(comp.id) === true;
          const ledColor = comp.name.toLowerCase().includes('green') ? '#20b878'
            : comp.name.toLowerCase().includes('blue') ? '#3488e8'
              : comp.name.toLowerCase().includes('yellow') ? '#e2ad2f' : '#e64b4b';
          const centerX = px + pw / 2;
          const centerY = py + 25;
          if (lit) {
            const glow = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, 30);
            glow.addColorStop(0, `${ledColor}99`);
            glow.addColorStop(1, `${ledColor}00`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#9aa8b0';
          ctx.fillRect(centerX - 2, centerY + 10, 2, 14);
          ctx.fillRect(centerX + 1, centerY + 10, 2, 14);
          ctx.fillStyle = lit ? '#fff8e9' : '#dfe5e8';
          ctx.strokeStyle = lit ? ledColor : '#687985';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, 12, Math.PI, 0);
          ctx.lineTo(centerX + 9, centerY + 8);
          ctx.lineTo(centerX - 9, centerY + 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (lit) {
            ctx.fillStyle = ledColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY + 2, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#253441';
          ctx.font = 'bold 8px Inter, sans-serif';
          ctx.fillText(comp.name, centerX, py + 54, pw - 6);
          ctx.fillStyle = simulationPlan.isSupported ? (lit ? '#14764e' : '#647582') : '#9a6b27';
          ctx.font = 'bold 7px JetBrains Mono, monospace';
          ctx.fillText(simulationPlan.isSupported ? (lit ? 'OUTPUT HIGH' : 'OUTPUT LOW') : 'NOT SIMULATED', centerX, py + 63);
        }

        // Module Label
        if (!isPassive && !isLed) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText(comp.name, px + pw / 2, py + (isOled ? ph - 16 : 24), pw - 8);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px Inter, sans-serif';
        ctx.fillText(isOled ? 'I2C OLED (0x3C)' : isSensor ? 'Sensor (0x76)' : comp.category, px + pw / 2, py + (isOled ? ph - 6 : 38));

        // Header pins at bottom of module
        ctx.fillStyle = '#cbd5e1';
        const pinCount = Math.min(comp.pins.length, 5);
        for (let p = 0; p < pinCount; p++) {
          ctx.fillRect(px + (pw - pinCount * 18) / 2 + p * 18, py + ph - 2, 8, 8);
        }
        }
      });

      // Power distribution: connect only rails and source/target pins present in the design data.
      const powerColor = '#d34545';
      const groundColor = '#536b8b';
      const regulated = design.components.find(component => component.category === 'Power' && /ams1117/i.test(component.name));
      const redRailY = startY + 28;
      const blueRailY = startY + 54;
      const drawRailLead = (fromX: number, fromY: number, toY: number, color: string) => {
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.quadraticCurveTo(fromX + 15, toY + (fromY < toY ? -10 : 10), fromX + 24, toY); ctx.stroke();
      };
      drawRailLead(mcuX + 28, mcuY, redRailY, powerColor);
      drawRailLead(mcuX + 48, mcuY, blueRailY, groundColor);
      if (regulated) {
        const regulatorPos = compPositions.find(component => component.id === regulated.id);
        if (regulatorPos) {
          drawRailLead(regulatorPos.x + 20, regulatorPos.y, redRailY, powerColor);
          drawRailLead(regulatorPos.x + 42, regulatorPos.y, blueRailY, groundColor);
        }
      }
      const powerTargets = design.pinMappings.filter(mapping => mapping.protocol === 'Power' || mapping.protocol === 'GND');
      powerTargets.forEach(mapping => {
        const target = compPositions.find(component => component.id === mapping.componentId);
        if (!target) return;
        const color = mapping.protocol === 'Power' ? powerColor : groundColor;
        const railY = mapping.protocol === 'Power' ? redRailY : blueRailY;
        const x = target.x + target.w / 2;
        const y = target.y + target.h;
        ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x, railY); ctx.lineTo(x, y); ctx.stroke();
      });

      // Draw signal wires directly from the generated mappings. No board-specific pins are guessed.
      const signalMappings = design.pinMappings.filter(mapping => ['I2C', 'SPI', 'I2S', 'UART', 'GPIO', 'PWM', 'ADC'].includes(mapping.protocol));
      signalMappings.forEach((mapping, index) => {
        const target = compPositions.find(component => component.id === mapping.componentId);
        if (!target) return;
        const colors: Record<string, string> = { I2C: '#267ea5', SPI: '#7557b7', I2S: '#208d91', UART: '#9659a5', PWM: '#c97737', ADC: '#39866a', GPIO: '#687f91' };
        const color = mapping.wireColor || colors[mapping.protocol] || '#687f91';
        const sourceX = mcuX + mcuWidth;
        const sourceY = mcuY + 18 + (index % 4) * 14;
        const targetX = target.x + target.w / 2;
        const targetY = target.y + target.h;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.bezierCurveTo(sourceX + 35, sourceY + 35 + index * 3, targetX, targetY + 35 + index * 3, targetX, targetY);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sourceX, sourceY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(targetX, targetY, 3, 0, Math.PI * 2); ctx.fill();
        const pinIsHigh = firmwareDrivesPin(simulationPlan, mapping.mcuPin)
          && getOutputStateAt(simulationPlan, mapping.mcuPin, timeMs) === true;
        if (pinIsHigh) {
          const progress = ((timeMs / simulationPlan.durationMs + index * 0.137) % 1 + 1) % 1;
          const inverse = 1 - progress;
          const pulseX = inverse ** 3 * sourceX + 3 * inverse ** 2 * progress * (sourceX + 35)
            + 3 * inverse * progress ** 2 * targetX + progress ** 3 * targetX;
          const pulseY = inverse ** 3 * sourceY + 3 * inverse ** 2 * progress * (sourceY + 35 + index * 3)
            + 3 * inverse * progress ** 2 * (targetY + 35 + index * 3) + progress ** 3 * targetY;
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      // Bottom Legend
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Generated signal mappings: ${signalMappings.length} nets. Check the pin mapping table for power and ground.`, startX + 10, startY + boardHeight + 35);
    };

    const renderFrame = (now: number) => {
      if (previousFrameTime > 0 && isPlaying && simulationPlan.isSupported) {
        elapsedRef.current = (elapsedRef.current + now - previousFrameTime) % simulationPlan.durationMs;
      }
      previousFrameTime = now;
      drawBreadboard(elapsedRef.current);
      if (now - lastTimeUpdate >= 100) {
        setElapsedMs(elapsedRef.current);
        lastTimeUpdate = now;
      }
      animationFrame = requestAnimationFrame(renderFrame);
    };

    const observer = new ResizeObserver(() => drawBreadboard(elapsedRef.current));
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    animationFrame = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [design, isPlaying, simulationPlan, mcu]);

  const timelineDuration = simulationPlan.isSupported ? simulationPlan.durationMs : 1000;
  const timelineValue = simulationPlan.isSupported ? elapsedMs % timelineDuration : 0;
  const formattedTime = `${(timelineValue / 1000).toFixed(2)}s / ${(timelineDuration / 1000).toFixed(2)}s`;

  return (
    <div className="breadboard-view-container">
      <div className="breadboard-header">
        <div>
          <h2>Live breadboard · 3D + time</h2>
          <p>Component glow and signal pulses follow the supported firmware model. This is a visual wiring preview, not an electrical simulation.</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} Breadboard ICs</span>
          <span className="badge badge-emerald">{design.pinMappings.length} DuPont Wires</span>
        </div>
      </div>

      <div className="breadboard-canvas-card">
        <canvas ref={canvasRef} className="breadboard-canvas" />
      </div>
      <div className={`breadboard-timeline ${simulationPlan.isSupported ? 'is-supported' : ''}`}>
        <div className="breadboard-timeline-heading">
          <span>{simulationPlan.isSupported ? 'LIVE FIRMWARE MODEL' : 'STATIC WIRING PREVIEW'}</span>
          <strong>{simulationPlan.isSupported ? formattedTime : 'Output not modeled'}</strong>
          <button
            type="button"
            className="breadboard-play-button"
            disabled={!simulationPlan.isSupported}
            onClick={() => setIsPlaying(current => !current)}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="breadboard-reset-button"
            disabled={!simulationPlan.isSupported}
            aria-label="Reset breadboard simulation"
            onClick={() => {
              elapsedRef.current = 0;
              setElapsedMs(0);
            }}
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={timelineDuration}
          step={10}
          value={timelineValue}
          disabled={!simulationPlan.isSupported}
          aria-label="Scrub the breadboard firmware simulation timeline"
          onPointerDown={() => setIsPlaying(false)}
          onChange={event => {
            const nextTime = Number(event.currentTarget.value);
            elapsedRef.current = nextTime;
            setElapsedMs(nextTime);
            setIsPlaying(false);
          }}
        />
        <small>{simulationPlan.isSupported ? 'Pause and scrub to inspect the modeled LED and signal states over one firmware loop.' : simulationPlan.message}</small>
      </div>
    </div>
  );
};

export default BreadboardVisualizer;
