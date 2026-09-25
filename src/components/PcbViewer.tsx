import React, { useEffect, useRef } from 'react';
import type { CircuitDesign } from '../types/circuit';

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

    const drawPreview = () => {
      const width = canvas.parentElement?.clientWidth || 800;
      const height = canvas.parentElement?.clientHeight || 500;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, width, height);

      const mcu = design.components.find(component => component.category === 'MCU');
      const peripherals = design.components.filter(component => component.id !== mcu?.id);
      const peripheralColumns = Math.max(1, Math.ceil(Math.sqrt(peripherals.length)));
      const columns = 1 + peripheralColumns;
      const rows = Math.max(1, Math.ceil(peripherals.length / peripheralColumns));
      const padding = 64;
      const slotWidth = 220;
      const slotHeight = 150;
      const boardWidth = padding * 2 + columns * slotWidth;
      const boardHeight = padding * 2 + rows * slotHeight;
      const scale = Math.min((width - 40) / boardWidth, (height - 40) / boardHeight, 1);
      const offsetX = (width - boardWidth * scale) / 2;
      const offsetY = (height - boardHeight * scale) / 2;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      ctx.fillStyle = '#102216';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(0, 0, boardWidth, boardHeight, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0a0c10';
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 2;
      [[20, 20], [boardWidth - 20, 20], [20, boardHeight - 20], [boardWidth - 20, boardHeight - 20]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      const positions = new Map<string, { x: number; y: number }>();
      if (mcu) {
        positions.set(mcu.id, {
          x: padding + slotWidth / 2,
          y: padding + Math.floor(rows / 2) * slotHeight + slotHeight / 2,
        });
      }
      peripherals.forEach((component, index) => {
        const column = 1 + (index % peripheralColumns);
        const row = Math.floor(index / peripheralColumns);
        positions.set(component.id, {
          x: padding + column * slotWidth + slotWidth / 2,
          y: padding + row * slotHeight + slotHeight / 2,
        });
      });

      const colors: Record<string, string> = {
        Power: '#ef5350',
        GND: '#aab4c0',
        I2C: '#ffb74d',
        SPI: '#4fc3f7',
        UART: '#ba9cff',
      };
      const pairCounts = new Map<string, number>();
      const pairIndices = new Map<string, number>();
      design.pinMappings.forEach(mapping => {
        const key = `${mcu?.id}:${mapping.componentId}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      });

      design.pinMappings.forEach(mapping => {
        const source = positions.get(mcu?.id ?? '');
        const target = positions.get(mapping.componentId);
        if (!source || !target) return;

        const pairKey = `${mcu?.id}:${mapping.componentId}`;
        const index = pairIndices.get(pairKey) ?? 0;
        pairIndices.set(pairKey, index + 1);
        const count = pairCounts.get(pairKey) ?? 1;
        const laneOffset = (index - (count - 1) / 2) * 8;
        const sourceY = source.y + laneOffset;
        const targetY = target.y + laneOffset;
        const sourceX = source.x + 76;
        const targetX = target.x - 76;
        const routeX = (sourceX + targetX) / 2;
        const color = colors[mapping.protocol] ?? '#6fbf73';

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.lineTo(routeX, sourceY);
        ctx.lineTo(routeX, targetY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.fillStyle = '#dbe4ea';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${mapping.mcuPin} / ${mapping.componentPin}`, routeX, (sourceY + targetY) / 2 - 5);
      });

      design.components.forEach(component => {
        const position = positions.get(component.id);
        if (!position) return;

        const componentWidth = 152;
        const componentHeight = 58;
        ctx.fillStyle = '#c9a227';
        for (let pin = 0; pin < 5; pin++) {
          const padY = position.y - 20 + pin * 10;
          ctx.fillRect(position.x - componentWidth / 2 - 7, padY, 7, 5);
          ctx.fillRect(position.x + componentWidth / 2, padY, 7, 5);
        }
        ctx.fillStyle = '#171b20';
        ctx.strokeStyle = component.category === 'MCU' ? '#00d9e8' : '#93a4b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(position.x - componentWidth / 2, position.y - componentHeight / 2, componentWidth, componentHeight, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(component.name, position.x, position.y - 2, componentWidth - 12);
        ctx.fillStyle = '#aab4c0';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${component.category} · ${component.package}`, position.x, position.y + 15, componentWidth - 12);
      });

      ctx.restore();
    };

    const observer = new ResizeObserver(drawPreview);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    drawPreview();
    return () => observer.disconnect();
  }, [design]);

  return (
    <section className="pcb-preview">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>PCB Layout Preview</h2>
          <p style={{ color: 'var(--text-muted)' }}>Conceptual placement for {design.title}; not fabrication-ready routing.</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} Components</span>
          <span className="badge badge-emerald">{design.pinMappings.length} Connections</span>
        </div>
      </div>

      <div className="pcb-layout-frame">
        <canvas ref={canvasRef} className="circuit-canvas" />
      </div>
    </section>
  );
};

export default PcbViewer;
