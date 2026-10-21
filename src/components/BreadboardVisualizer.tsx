import React, { useEffect, useRef } from 'react';
import type { CircuitDesign } from '../types/circuit';

interface BreadboardVisualizerProps {
  design: CircuitDesign;
  onShowToast?: (message: string, type: 'success' | 'info' | 'error') => void;
}

const BreadboardVisualizer: React.FC<BreadboardVisualizerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mcu = design.components.find(c => c.category === 'MCU');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawBreadboard = () => {
      const width = canvas.parentElement?.clientWidth || 900;
      const height = 580;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Dark background
      ctx.fillStyle = '#f4f6f8';
      ctx.fillRect(0, 0, width, height);

      // Breadboard dimensions
      const boardWidth = Math.min(width - 40, 840);
      const boardHeight = 440;
      const startX = (width - boardWidth) / 2;
      const startY = 40;

      // Breadboard white/cream plastic body
      ctx.fillStyle = '#f8fafc';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.roundRect(startX, startY, boardWidth, boardHeight, 14);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
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
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(startX + 20, trenchY - 8, boardWidth - 40, 16);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX + 20, trenchY - 8, boardWidth - 40, 16);

      // Breadboard Pin Holes (Tie points)
      const numCols = 30;
      const colSpacing = (boardWidth - 80) / numCols;
      ctx.fillStyle = '#17212b';

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

      ctx.fillStyle = '#17212b';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.3)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(mcuX, mcuY, mcuWidth, mcuHeight, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // MCU Chip Label
      ctx.fillStyle = '#8ee5e9';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(mcu?.name || 'ESP32 / MCU', mcuX + mcuWidth / 2, mcuY + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText('MCU Dev Board', mcuX + mcuWidth / 2, mcuY + 52);

      // Micro-USB Port on left
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(mcuX - 8, mcuY + mcuHeight / 2 - 8, 8, 16);

      // Place every modeled component, including regulators and passives.
      const primaryModules = design.components.filter(c => c.id !== mcu?.id);

      const compPositions: { id: string; name: string; x: number; y: number; w: number; h: number; isOled: boolean; isSensor: boolean }[] = [];

      // Compute slot spacing based on number of primary modules
      const availableWidth = Math.max(boardWidth - (mcuWidth + 120), 140);
      const modSpacing = Math.min(160, availableWidth / Math.max(primaryModules.length, 1));

      primaryModules.forEach((comp, idx) => {
        const isPassive = comp.category === 'Passive';
        const isPower = comp.category === 'Power';
        const isOled = comp.name.toLowerCase().includes('oled') || comp.name.toLowerCase().includes('ssd1306');
        const isSensor = comp.category === 'Sensor' || comp.name.toLowerCase().includes('bme280') || comp.name.toLowerCase().includes('mpu');
        
        const pw = isPassive ? 88 : isOled ? 130 : 108;
        const ph = isPassive ? 54 : isOled ? 95 : 75;
        const columns = Math.max(1, Math.floor(availableWidth / 150));
        const px = startX + 235 + (idx % columns) * Math.min(150, modSpacing);
        const py = startY + 95 + Math.floor(idx / columns) * 105;

        compPositions.push({ id: comp.id, name: comp.name, x: px, y: py, w: pw, h: ph, isOled, isSensor });

        // Module PCB background
        ctx.fillStyle = isPassive ? '#fff7dc' : isPower ? '#e6f4ef' : isOled ? '#12323a' : '#176d58';
        ctx.strokeStyle = isPassive ? '#d09a2d' : isPower ? '#22836b' : isOled ? '#53c6d0' : '#31a77c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 6);
        ctx.fill();
        ctx.stroke();

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
          ctx.fillStyle = '#00ff88';
          ctx.fillText('T:24.8C H:52%', px + pw / 2, py + 36);
          ctx.fillText('1013 hPa', px + pw / 2, py + 46);
        }

        // Module Label
        if (!isPassive) {
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
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.bezierCurveTo(sourceX + 35, sourceY + 35 + index * 3, targetX, targetY + 35 + index * 3, targetX, targetY);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sourceX, sourceY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(targetX, targetY, 3, 0, Math.PI * 2); ctx.fill();
      });
      // Bottom Legend
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Generated signal mappings: ${signalMappings.length} nets. Check the pin mapping table for power and ground.`, startX + 10, startY + boardHeight + 35);
    };

    const observer = new ResizeObserver(drawBreadboard);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    drawBreadboard();
    return () => observer.disconnect();
  }, [design]);

  return (
    <div className="breadboard-view-container">
      <div className="breadboard-header">
        <div>
          <h2>Physical wiring preview</h2>
          <p>Visual placement preview. Signal wires use the generated pin mapping; verify the hardware pinout before wiring.</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} Breadboard ICs</span>
          <span className="badge badge-emerald">{design.pinMappings.length} DuPont Wires</span>
        </div>
      </div>

      <div className="breadboard-canvas-card">
        <canvas ref={canvasRef} className="breadboard-canvas" />
      </div>
    </div>
  );
};

export default BreadboardVisualizer;
