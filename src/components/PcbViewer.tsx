import React, { useEffect, useRef } from 'react';
import type { CircuitDesign } from '../types/circuit';
import { Layers } from 'lucide-react';

interface PcbViewerProps {
  design: CircuitDesign;
}

const PcbViewer: React.FC<PcbViewerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 800;
    const height = canvas.parentElement?.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, width, height);

    // PCB Board (Green/Black FR4 look)
    const pcbW = 400;
    const pcbH = 300;
    const pcbX = (width - pcbW) / 2;
    const pcbY = (height - pcbH) / 2;

    ctx.fillStyle = '#102216'; // Dark Green FR4
    ctx.strokeStyle = '#22c55e'; // Bright Green Edge
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(pcbX, pcbY, pcbW, pcbH, 16);
    ctx.fill();
    ctx.stroke();

    // Mounting holes
    ctx.fillStyle = '#0a0c10';
    ctx.strokeStyle = '#c9a227'; // Gold plating
    ctx.lineWidth = 2;
    [
      [pcbX + 20, pcbY + 20],
      [pcbX + pcbW - 20, pcbY + 20],
      [pcbX + 20, pcbY + pcbH - 20],
      [pcbX + pcbW - 20, pcbY + pcbH - 20]
    ].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Mock Components Footprints
    ctx.fillStyle = '#1e1e1e';
    ctx.strokeStyle = '#444';
    
    // MCU Footprint
    ctx.fillRect(pcbX + 150, pcbY + 100, 100, 100);
    ctx.strokeRect(pcbX + 150, pcbY + 100, 100, 100);
    
    // MCU Pads
    ctx.fillStyle = '#c9a227'; // Gold pads
    for(let i=0; i<10; i++) {
      ctx.fillRect(pcbX + 140, pcbY + 105 + i * 9, 8, 4);
      ctx.fillRect(pcbX + 252, pcbY + 105 + i * 9, 8, 4);
      ctx.fillRect(pcbX + 155 + i * 9, pcbY + 90, 4, 8);
      ctx.fillRect(pcbX + 155 + i * 9, pcbY + 202, 4, 8);
    }
    
    // Sensor Footprint
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(pcbX + 60, pcbY + 130, 40, 40);
    ctx.fillStyle = '#c9a227';
    for(let i=0; i<4; i++) {
      ctx.fillRect(pcbX + 55, pcbY + 135 + i * 8, 4, 4);
      ctx.fillRect(pcbX + 101, pcbY + 135 + i * 8, 4, 4);
    }

    // Connectors
    ctx.fillStyle = '#333';
    ctx.fillRect(pcbX + 350, pcbY + 120, 30, 60);

    // Traces (Mock)
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pcbX + 105, pcbY + 140);
    ctx.lineTo(pcbX + 120, pcbY + 140);
    ctx.lineTo(pcbX + 140, pcbY + 120);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(pcbX + 105, pcbY + 150);
    ctx.lineTo(pcbX + 140, pcbY + 150);
    ctx.stroke();

  }, [design]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>2D PCB Layout Preview</h2>
          <p style={{ color: 'var(--text-muted)' }}>Estimated physical placement and routing guides.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary"><Layers size={16}/> Top Layer</button>
          <button className="btn-secondary">Bottom Layer</button>
        </div>
      </div>
      
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} className="circuit-canvas" />
      </div>
    </div>
  );
};

export default PcbViewer;
