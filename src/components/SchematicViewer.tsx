import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Zap, RotateCcw } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  Position, 
  MarkerType,
  Handle
} from 'reactflow';
import type { Edge, Node, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';

interface SchematicViewerProps {
  design: CircuitDesign;
}

// Custom IC / Module Schematic Node Component
const SchematicIcNode = ({ data }: any) => {
  const isMCU = data.isMCU;
  const pins: string[] = data.pins || [];

  return (
    <div className={`schematic-ic-box ${isMCU ? 'schematic-mcu-box' : 'schematic-peripheral-box'}`}>
      {/* IC Header */}
      <div className="ic-header">
        <div className="ic-title-row">
          <span className="ic-notch" title="Pin 1 orientation notch" />
          <span className="ic-name">{data.name}</span>
        </div>
        <span className="ic-category">{data.category} · {data.package}</span>
      </div>

      {/* IC Pins Body */}
      <div className="ic-pins-container">
        {pins.map((pinName: string, index: number) => {
          const isPower = pinName === '3V3' || pinName === 'VCC' || pinName === 'VIN' || pinName === '5V';
          const isGnd = pinName === 'GND';
          const isClock = pinName.includes('SCL') || pinName.includes('SCK') || pinName.includes('BCK');
          const isData = pinName.includes('SDA') || pinName.includes('MOSI') || pinName.includes('MISO') || pinName.includes('DIN');

          return (
            <div key={pinName} className="ic-pin-row">
              <span className={`ic-pin-badge ${isPower ? 'pin-power' : isGnd ? 'pin-gnd' : isClock ? 'pin-clock' : isData ? 'pin-data' : ''}`}>
                <span className="pin-num">{index + 1}</span>
                <span className="pin-lbl">{pinName}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Target & Source Handles for ReactFlow */}
      <Handle type="target" position={Position.Left} id="left-in" className="schematic-handle" />
      <Handle type="source" position={Position.Right} id="right-out" className="schematic-handle" />
    </div>
  );
};

const nodeTypes = {
  schematicIc: SchematicIcNode
};

const SchematicViewer: React.FC<SchematicViewerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { nodes, edges, netCount } = useMemo(() => {
    const mcu = design.components.find(c => c.category === 'MCU');
    const peripherals = design.components.filter(c => c.id !== mcu?.id);

    const wireColors: Record<string, string> = {
      Power: '#ef4444', // Red for VCC
      GND: '#64748b',   // Dark Slate for Ground
      I2C: '#eab308',   // Yellow for I2C Clock / Blue for Data
      SPI: '#3b82f6',   // Blue for SPI
      UART: '#a855f7',  // Purple for Serial
      I2S: '#06b6d4',   // Cyan for Digital Audio
      PWM: '#f97316',   // Orange for PWM
      ADC: '#10b981',   // Emerald for Analog
      GPIO: '#00f0ff'   // Cyan default
    };

    // 1. Build Component Nodes with realistic Electronics IC appearance
    const componentNodes: Node[] = [];

    // Place MCU on Left side with clear schematic spacing
    if (mcu) {
      componentNodes.push({
        id: mcu.id,
        type: 'schematicIc',
        position: { x: 50, y: Math.max(80, (peripherals.length * 220) / 2 - 100) },
        data: {
          name: mcu.name,
          category: mcu.category,
          package: mcu.package,
          pins: mcu.pins,
          isMCU: true
        }
      });
    }

    // Place Peripheral ICs on Right side arranged neatly
    peripherals.forEach((comp, idx) => {
      componentNodes.push({
        id: comp.id,
        type: 'schematicIc',
        position: { x: 620, y: 50 + idx * 240 },
        data: {
          name: comp.name,
          category: comp.category,
          package: comp.package,
          pins: comp.pins,
          isMCU: false
        }
      });
    });

    // 2. Build Realistic Schematic Net Edges with Color Coding & Pin Labels
    const schematicEdges: Edge[] = [];
    const netCountSet = new Set<string>();

    design.pinMappings.forEach((mapping, idx) => {
      const netKey = `${mapping.protocol}:${mapping.mcuPin}:${mapping.componentPin}`;
      netCountSet.add(netKey);

      const color = mapping.protocol === 'Power' 
        ? '#ef4444' 
        : mapping.protocol === 'GND' 
          ? '#64748b' 
          : mapping.protocol === 'I2C' && mapping.componentPin.toLowerCase().includes('scl')
            ? '#eab308' // Yellow for SCL
            : mapping.protocol === 'I2C'
              ? '#3b82f6' // Blue for SDA
              : wireColors[mapping.protocol] || '#00f0ff';

      schematicEdges.push({
        id: `wire-${idx}-${mapping.componentId}-${mapping.mcuPin}`,
        source: mcu?.id || '',
        target: mapping.componentId,
        sourceHandle: 'right-out',
        targetHandle: 'left-in',
        type: 'smoothstep', // Realistic right-angle PCB/schematic routing
        animated: mapping.protocol === 'I2C' || mapping.protocol === 'SPI' || mapping.protocol === 'I2S',
        label: `${mapping.mcuPin} ──▶ ${mapping.componentPin} (${mapping.protocol})`,
        labelStyle: { 
          fill: color, 
          fontWeight: 700, 
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace'
        },
        labelBgStyle: { 
          fill: '#0f131a', 
          fillOpacity: 0.95,
          rx: 4,
          ry: 4
        },
        labelBgPadding: [6, 4],
        style: { 
          stroke: color, 
          strokeWidth: mapping.protocol === 'Power' || mapping.protocol === 'GND' ? 2.5 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: color,
          width: 14,
          height: 14
        }
      });
    });

    return { nodes: componentNodes, edges: schematicEdges, netCount: netCountSet.size };
  }, [design]);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === canvasRef.current);
    };

    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (document.fullscreenElement === canvas) {
      await document.exitFullscreen();
    } else {
      await canvas.requestFullscreen();
    }
  };

  const handleResetView = () => {
    flowRef.current?.fitView({ padding: 0.2, minZoom: 0.45, maxZoom: 1.15 });
  };

  return (
    <section className="schematic-viewer" aria-label={`${design.title} practical circuit schematic`}>
      {/* Top Header */}
      <div className="schematic-heading">
        <div>
          <h2>Practical Electrical Circuit Diagram</h2>
          <p>{design.title} — Real-world IC pinout and connection schematic for laboratory implementation.</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} IC Packages</span>
          <span className="badge badge-emerald">{netCount} Active Nets</span>
        </div>
      </div>

      {/* Wire Color Code Standards for Lab Students */}
      <div className="schematic-standards-bar">
        <div className="standards-title">
          <Zap size={15} /> Standard Lab Wire Color Codes:
        </div>
        <div className="standards-items">
          <span className="standard-item"><i style={{ background: '#ef4444' }} /> Red: 3.3V VCC Power</span>
          <span className="standard-item"><i style={{ background: '#64748b' }} /> Black: Common Ground (GND)</span>
          <span className="standard-item"><i style={{ background: '#eab308' }} /> Yellow: Clock (SCL / SCK)</span>
          <span className="standard-item"><i style={{ background: '#3b82f6' }} /> Blue: Data (SDA / MOSI)</span>
          <span className="standard-item"><i style={{ background: '#a855f7' }} /> Purple: SPI CS / UART</span>
          <span className="standard-item"><i style={{ background: '#00f0ff' }} /> Cyan: GPIO / Control</span>
        </div>
      </div>

      {/* Interactive Schematic Canvas */}
      <div className="schematic-canvas" ref={canvasRef}>
        <div className="schematic-toolbar">
          <button 
            className="toolbar-btn" 
            onClick={handleResetView} 
            title="Reset Zoom & Center View"
          >
            <RotateCcw size={16} /> Fit View
          </button>
          <button
            className="toolbar-btn"
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} Fullscreen
          </button>
        </div>

        <ReactFlow 
          nodes={nodes} 
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.45, maxZoom: 1.15 }}
          minZoom={0.3}
          maxZoom={1.5}
          onInit={instance => { flowRef.current = instance; }}
          attributionPosition="bottom-right"
        >
          {/* Engineering Dot Matrix / Grid Background */}
          <Background color="rgba(0, 240, 255, 0.08)" gap={24} size={1.5} />
          <Controls style={{ background: 'var(--bg-panel)', fill: 'var(--text-main)', border: '1px solid var(--border-color)' }} />
          <MiniMap 
            nodeColor={(n) => n.data?.isMCU ? '#00f0ff' : '#3b82f6'}
            maskColor="rgba(0, 0, 0, 0.75)"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)' }}
          />
        </ReactFlow>
      </div>
    </section>
  );
};

export default SchematicViewer;
