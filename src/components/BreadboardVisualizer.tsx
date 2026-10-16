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
      ctx.fillStyle = '#0a0d14';
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
      ctx.fillStyle = '#0f172a';

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

      ctx.fillStyle = '#0f172a';
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
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(mcu?.name || 'ESP32 / MCU', mcuX + mcuWidth / 2, mcuY + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText('MCU Dev Board', mcuX + mcuWidth / 2, mcuY + 52);

      // Micro-USB Port on left
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(mcuX - 8, mcuY + mcuHeight / 2 - 8, 8, 16);

      // 2. Filter Primary Hardware Modules (Sensor, Actuator, Display, etc.)
      // Raw SMD passives (0805 caps, pull-ups) shouldn't clutter the main module placement
      const primaryModules = design.components.filter(c => 
        c.id !== mcu?.id && 
        c.category !== 'Passive' &&
        !c.name.toLowerCase().includes('capacitor') &&
        !c.name.toLowerCase().includes('resistor') &&
        !c.name.toLowerCase().includes('ams1117') // Dev board handles onboard 3.3V LDO
      );

      const compPositions: { id: string; name: string; x: number; y: number; w: number; h: number; isOled: boolean; isSensor: boolean }[] = [];

      // Compute slot spacing based on number of primary modules
      const availableWidth = boardWidth - (mcuWidth + 120);
      const modSpacing = Math.min(180, availableWidth / Math.max(primaryModules.length, 1));

      primaryModules.forEach((comp, idx) => {
        const isOled = comp.name.toLowerCase().includes('oled') || comp.name.toLowerCase().includes('ssd1306');
        const isSensor = comp.category === 'Sensor' || comp.name.toLowerCase().includes('bme280') || comp.name.toLowerCase().includes('mpu');
        
        const pw = isOled ? 130 : 100;
        const ph = isOled ? 95 : 75;
        const px = startX + 260 + idx * (modSpacing + 20);
        const py = trenchY - (isOled ? 50 : 38);

        compPositions.push({ id: comp.id, name: comp.name, x: px, y: py, w: pw, h: ph, isOled, isSensor });

        // Module PCB background
        ctx.fillStyle = isOled ? '#020617' : '#064e3b';
        ctx.strokeStyle = isOled ? '#38bdf8' : '#10b981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 6);
        ctx.fill();
        ctx.stroke();

        // OLED Visual Screen Mockup
        if (isOled) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(px + 10, py + 10, pw - 20, 42);
          ctx.strokeStyle = '#0284c7';
          ctx.strokeRect(px + 10, py + 10, pw - 20, 42);

          // Simulated OLED display pixels
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 8px JetBrains Mono, monospace';
          ctx.fillText('AUTO-CIRCUIT', px + pw / 2, py + 24);
          ctx.font = '7px JetBrains Mono, monospace';
          ctx.fillStyle = '#00ff88';
          ctx.fillText('T:24.8C H:52%', px + pw / 2, py + 36);
          ctx.fillText('1013 hPa', px + pw / 2, py + 46);
        }

        // Module Label
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
      });

      // 3. LED Circuit & Series Resistor (Only rendered if an actual LED is part of the circuit)
      const ledComponent = design.components.find(c => c.name.toLowerCase().includes('led'));
      if (ledComponent) {
        const resX = startX + 220;
        const resY = startY + 110;
        // Resistor body
        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(resX, resY - 6, 36, 12, 3);
        ctx.fill();
        ctx.stroke();

        // Color bands (220Ω: Red, Red, Brown, Gold)
        ctx.fillStyle = '#ef4444'; ctx.fillRect(resX + 6, resY - 6, 3, 12);
        ctx.fillRect(resX + 13, resY - 6, 3, 12);
        ctx.fillStyle = '#78350f'; ctx.fillRect(resX + 20, resY - 6, 3, 12);
        ctx.fillStyle = '#eab308'; ctx.fillRect(resX + 27, resY - 6, 3, 12);

        // Resistor lead wires
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(resX, resY);
        ctx.lineTo(resX - 20, resY);
        ctx.moveTo(resX + 36, resY);
        ctx.lineTo(resX + 55, resY);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillText('220Ω (LED limit)', resX + 18, resY + 18);
      }

      // ── Physical Curved Jumper Wires (DuPont Cables) ─────────────
      const redRailY = startY + 28;
      const blueRailY = startY + 54;

      // 1. ESP32 Onboard 3.3V Pin to Red Rail (+)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(mcuX + 25, mcuY + 10);
      ctx.quadraticCurveTo(mcuX + 30, startY + 15, mcuX + 60, redRailY);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillText('ESP32 3V3 Pin ──▶ Red Rail (+)', mcuX + 65, redRailY - 5);

      // 2. ESP32 GND Pin to Blue Rail (-)
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(mcuX + 25, mcuY + 25);
      ctx.quadraticCurveTo(mcuX + 30, startY + 45, mcuX + 80, blueRailY);
      ctx.stroke();
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('ESP32 GND Pin ──▶ Blue Rail (-)', mcuX + 85, blueRailY + 14);

      // 3. Power Distribution: Both BME280 & SSD1306 powered from Rails
      compPositions.forEach((target) => {
        // Red rail to Component VCC
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const tapX = target.x + 25;
        ctx.moveTo(tapX, redRailY);
        ctx.quadraticCurveTo(tapX - 10, target.y - 15, target.x + 20, target.y);
        ctx.stroke();

        // Blue rail to Component GND
        ctx.strokeStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(tapX + 20, blueRailY);
        ctx.quadraticCurveTo(tapX + 10, target.y - 10, target.x + 40, target.y);
        ctx.stroke();
      });

      // 4. Parallel I2C Bus Jumpers (GPIO21 -> SDA, GPIO22 -> SCL)
      const sdaMcuX = mcuX + mcuWidth - 10;
      const sdaMcuY = mcuY + 30;
      const sclMcuX = mcuX + mcuWidth - 10;
      const sclMcuY = mcuY + 50;

      compPositions.forEach((target, idx) => {
        // SDA Jumper (Blue / Cyan) in parallel
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sdaMcuX, sdaMcuY);
        const sdaDestX = target.x + (target.isOled ? 60 : 45);
        const sdaDestY = target.y + target.h;
        ctx.bezierCurveTo((sdaMcuX + sdaDestX) / 2, sdaMcuY + 60 + idx * 18, (sdaMcuX + sdaDestX) / 2, sdaDestY + 40 + idx * 10, sdaDestX, sdaDestY);
        ctx.stroke();

        // SCL Jumper (Yellow) in parallel
        ctx.strokeStyle = '#eab308';
        ctx.beginPath();
        ctx.moveTo(sclMcuX, sclMcuY);
        const sclDestX = target.x + (target.isOled ? 85 : 70);
        const sclDestY = target.y + target.h;
        ctx.bezierCurveTo((sclMcuX + sclDestX) / 2, sclMcuY + 75 + idx * 18, (sclMcuX + sclDestX) / 2, sclDestY + 55 + idx * 10, sclDestX, sclDestY);
        ctx.stroke();
      });

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText('SDA ──▶ GPIO21 (Shared I2C Data)', sdaMcuX - 70, sdaMcuY - 6);
      ctx.fillStyle = '#eab308';
      ctx.fillText('SCL ──▶ GPIO22 (Shared I2C Clock)', sclMcuX - 70, sclMcuY + 16);

      // Bottom Legend
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Breadboard Wiring: ESP32 powers Red (+) / Blue (-) rails. BME280 & SSD1306 OLED tap rails and share I2C bus (GPIO21/22).', startX + 10, startY + boardHeight + 35);
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
          <h2>Interactive 2D Physical Breadboard View</h2>
          <p>Realistic solderless breadboard layout showing dual power rails, center trench IC straddling, and DuPont jumper cables.</p>
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
