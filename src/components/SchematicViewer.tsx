import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Position
} from 'reactflow';
import type { Edge, Node, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';

interface SchematicViewerProps {
  design: CircuitDesign;
}

const SchematicViewer: React.FC<SchematicViewerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { nodes, edges, netCount } = useMemo(() => {
    const mcu = design.components.find(component => component.category === 'MCU');
    const peripherals = design.components.filter(component => component.id !== mcu?.id);
    const netColors: Record<string, string> = {
      Power: '#ef5350',
      GND: '#9aa4b2',
      I2C: '#ffb74d',
      SPI: '#4fc3f7',
      UART: '#ba9cff',
    };
    const componentNodes: Node[] = design.components.map((component, index) => {
      const isMCU = component.id === mcu?.id;
      const y = isMCU ? Math.max(80, peripherals.length * 90) : 40 + index * 180;

      return {
        id: component.id,
        position: { x: isMCU ? 20 : 760, y },
        data: {
          label: (
            <div style={{ padding: '10px', textAlign: 'center', minWidth: 150 }}>
              <div style={{ fontWeight: 700, color: isMCU ? '#00d9e8' : '#e2e8f0' }}>{component.name}</div>
              <div style={{ fontSize: 10, color: '#aab4c0', margin: '4px 0' }}>{component.category}</div>
              <div style={{ fontSize: 10, color: '#d5dbe3' }}>{component.pins.join('  ·  ')}</div>
            </div>
          )
        },
        style: {
          background: 'var(--bg-panel)',
          border: `1px solid ${isMCU ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
          borderRadius: 6,
          color: 'var(--text-main)',
          boxShadow: isMCU ? '0 0 15px rgba(0,217,232,0.18)' : 'none',
          width: 210,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    const groups = new Map<string, typeof design.pinMappings>();
    design.pinMappings.forEach(mapping => {
      const key = `${mapping.protocol}:${mapping.mcuPin}:${mapping.componentPin}`;
      groups.set(key, [...(groups.get(key) ?? []), mapping]);
    });

    const netNodes: Node[] = [];
    const netEdges: Edge[] = [];
    let sharedNetIndex = 0;
    groups.forEach((mappings, key) => {
      const mapping = mappings[0];
      const color = netColors[mapping.protocol] ?? '#9aa4b2';
      const shared = mappings.length > 1;
      const showJunction = shared || ['Power', 'GND', 'SPI'].includes(mapping.protocol);
      const netId = `net-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
      const netLabel = mapping.protocol === 'Power'
        ? `${mapping.mcuPin} POWER`
        : mapping.protocol === 'GND'
          ? 'GND'
            : mapping.protocol === 'SPI'
              ? `SPI ${mapping.componentPin}`
          : ['SDA', 'SCL'].includes(mapping.componentPin)
            ? `${mapping.protocol} ${mapping.componentPin}`
            : `${mapping.protocol} ${mapping.mcuPin}`;

      if (showJunction) {
        const netY = 35 + sharedNetIndex * 88;
        sharedNetIndex += 1;
        netNodes.push({
          id: netId,
          position: { x: 405, y: netY },
          data: { label: netLabel },
          style: {
            background: '#111820',
            border: `1px solid ${color}`,
            borderRadius: 5,
            color,
            fontSize: 11,
            fontWeight: 700,
            padding: '8px 10px',
            width: 120,
            textAlign: 'center',
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
        netEdges.push({
          id: `${netId}-from-mcu`,
          source: mcu?.id ?? '',
          target: netId,
          type: 'smoothstep',
          label: mapping.mcuPin,
          labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: '#0a0c10', fillOpacity: 0.95 },
          style: { stroke: color, strokeWidth: 2.5 },
        });
        mappings.forEach((branch, index) => {
          netEdges.push({
            id: `${netId}-to-${branch.componentId}-${index}`,
            source: netId,
            target: branch.componentId,
            type: 'smoothstep',
            label: branch.componentPin,
            labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
            labelBgStyle: { fill: '#0a0c10', fillOpacity: 0.95 },
            animated: mapping.protocol === 'I2C' || mapping.protocol === 'SPI',
            style: { stroke: color, strokeWidth: 2.5 },
          });
        });
        return;
      }

      mappings.forEach((branch, index) => {
        netEdges.push({
          id: `e-${key}-${branch.componentId}-${index}`,
          source: mcu?.id ?? '',
          target: branch.componentId,
          type: 'smoothstep',
          label: `${branch.mcuPin} → ${branch.componentPin}`,
          labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: '#0a0c10', fillOpacity: 0.95 },
          animated: ['I2C', 'SPI', 'UART'].includes(branch.protocol),
          style: { stroke: color, strokeWidth: 2 },
        });
      });
    });

    return { nodes: [...componentNodes, ...netNodes], edges: netEdges, netCount: groups.size };
  }, [design]);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === canvasRef.current);
    };

    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.2, minZoom: 0.45, maxZoom: 1.15 });
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (document.fullscreenElement === canvas) {
      await document.exitFullscreen();
    } else {
      await canvas.requestFullscreen();
    }
  };

  return (
    <section className="schematic-viewer" aria-label={`${design.title} circuit diagram`}>
      <div className="schematic-heading">
        <div>
          <h2>Circuit Diagram</h2>
          <p>{design.title}</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} Components</span>
          <span className="badge badge-emerald">{netCount} Nets</span>
        </div>
      </div>
      <p className="schematic-description">{design.description}</p>
      <div className="schematic-legend" aria-label="Wire color legend">
        <span><i style={{ background: '#ef5350' }} />3.3V power</span>
        <span><i style={{ background: '#9aa4b2' }} />Ground</span>
        <span><i style={{ background: '#ffb74d' }} />I²C data and clock</span>
        <span><i style={{ background: '#4fc3f7' }} />SPI signals</span>
        <span className="schematic-legend-note">Use the controls to zoom; drag the canvas to inspect connections.</span>
      </div>

      <div className="schematic-canvas" ref={canvasRef}>
        <button
          className="schematic-fullscreen-toggle"
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen schematic' : 'View schematic fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <ReactFlow 
          nodes={nodes} 
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.45, maxZoom: 1.15 }}
          minZoom={0.35}
          onInit={instance => { flowRef.current = instance; }}
          attributionPosition="bottom-right"
        >
          <Background color="rgba(0, 240, 255, 0.1)" gap={20} />
          <Controls style={{ background: 'var(--bg-panel)', fill: 'var(--text-main)', border: '1px solid var(--border-color)' }} />
          <MiniMap 
            nodeColor={(n) => n.style?.borderColor as string || '#2b303b'}
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{ background: 'var(--bg-panel)' }}
          />
        </ReactFlow>
      </div>
    </section>
  );
};

export default SchematicViewer;
