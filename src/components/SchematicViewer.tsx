import React, { useMemo } from 'react';
import type { CircuitDesign } from '../types/circuit';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Position,
  MarkerType
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

interface SchematicViewerProps {
  design: CircuitDesign;
}

const SchematicViewer: React.FC<SchematicViewerProps> = ({ design }) => {
  // Convert design.components to ReactFlow Nodes
  const nodes: Node[] = useMemo(() => {
    return design.components.map((comp, index) => {
      // Basic layout math for mock arrangement
      const isMCU = comp.category === 'MCU';
      const xPos = isMCU ? 400 : (index % 2 === 0 ? 100 : 700);
      const yPos = isMCU ? 200 : 100 + (index * 80);
      
      return {
        id: comp.id,
        position: { x: xPos, y: yPos },
        data: { 
          label: (
            <div style={{ padding: '8px', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', color: isMCU ? '#00f0ff' : '#e2e8f0' }}>{comp.name}</div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>{comp.category}</div>
            </div>
          ) 
        },
        style: {
          background: 'var(--bg-panel)',
          border: `1px solid ${isMCU ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
          borderRadius: '8px',
          color: 'var(--text-main)',
          boxShadow: isMCU ? '0 0 15px rgba(0,240,255,0.2)' : 'none',
          width: 150,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  }, [design]);

  // Convert design.pinMappings to ReactFlow Edges
  const edges: Edge[] = useMemo(() => {
    const mcuNode = design.components.find(c => c.category === 'MCU');
    if (!mcuNode) return [];

    return design.pinMappings.map((pin) => {
      let strokeColor = '#8b949e'; // default
      if (pin.protocol === 'Power') strokeColor = '#00ff88';
      if (pin.protocol === 'GND') strokeColor = '#2b303b';
      if (pin.protocol === 'I2C' || pin.protocol === 'SPI') strokeColor = '#ffb800';

      return {
        id: `e-${pin.mcuPin}-${pin.componentId}-${pin.componentPin}`,
        source: mcuNode.id,
        target: pin.componentId,
        label: `${pin.mcuPin} → ${pin.componentPin}`,
        labelStyle: { fill: strokeColor, fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: 'var(--bg-panel)', color: '#fff', fillOpacity: 0.8 },
        animated: pin.protocol === 'I2C' || pin.protocol === 'SPI' || pin.protocol === 'UART',
        style: { stroke: strokeColor, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });
  }, [design]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Interactive Schematic View</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="badge badge-cyan">{design.components.length} Components</span>
          <span className="badge badge-emerald">{design.pinMappings.length} Nets</span>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)' }}>{design.description}</p>
      
      <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#0a0c10' }}>
        <ReactFlow 
          nodes={nodes} 
          edges={edges}
          fitView
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
    </div>
  );
};

export default SchematicViewer;
