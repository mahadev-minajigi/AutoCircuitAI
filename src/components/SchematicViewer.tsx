import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Zap, 
  RotateCcw, 
  Play, 
  Square, 
  Lightbulb, 
  Activity,
  Hand
} from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';
import OscilloscopeViewer from './OscilloscopeViewer';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  Position, 
  Handle
} from 'reactflow';
import type { Edge, Node, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';

interface SchematicViewerProps {
  design: CircuitDesign;
}

// ── Realistic Interactive IC / Component Node ─────────────────────
const SchematicIcNode = ({ data }: any) => {
  const isMCU = data.isMCU;
  const isSimulating = data.isSimulating;
  const pins: string[] = data.pins || [];
  const name: string = data.name || '';
  const category: string = data.category || '';
  const isLed = name.toLowerCase().includes('led') || category.toLowerCase() === 'actuator' && name.toLowerCase().includes('diode');
  const isOled = name.toLowerCase().includes('oled') || name.toLowerCase().includes('display') || name.toLowerCase().includes('ssd1306');
  const isSensor = category === 'Sensor' || name.toLowerCase().includes('bme280') || name.toLowerCase().includes('mpu') || name.toLowerCase().includes('dht');
  const isResistor = name.toLowerCase().includes('resistor');

  return (
    <div className={`schematic-ic-box ${isMCU ? 'schematic-mcu-box' : 'schematic-peripheral-box'} ${isSimulating ? 'sim-active-box' : ''}`}>
      {/* IC Header */}
      <div className="ic-header">
        <div className="ic-title-row">
          <span className="ic-notch" title="Pin 1 orientation notch" />
          <span className="ic-name">{name}</span>
          {isSimulating && (
            <span className="live-status-badge">
              <span className="live-pulse-dot" /> LIVE
            </span>
          )}
        </div>
        <span className="ic-category">{category} · {data.package}</span>
        {data.description && <span className="ic-description">{data.description}</span>}
      </div>

      {/* LIVE SIMULATED REAL-WORLD HARDWARE OUTPUTS */}
      {isSimulating && (
        <div className="live-hardware-feedback">
          {/* 1. Live LED Component Glow with Resistor protection */}
          {(isLed || name.toLowerCase().includes('led')) && (
            <div className="live-led-container">
              <div className={`hardware-led-bulb ${data.ledState ? 'bulb-illuminated' : 'bulb-off'}`}>
                <Lightbulb size={24} className={data.ledState ? 'led-icon-on' : 'led-icon-off'} />
              </div>
              <div className="hardware-led-info">
                <span className="hardware-label">
                  LED Status: <strong style={{ color: data.ledState ? '#00ff88' : '#64748b' }}>{data.ledState ? 'ON (Glowing 20mA)' : 'OFF'}</strong>
                </span>
                <span className="hardware-sublabel">Protected by 220Ω in series</span>
              </div>
            </div>
          )}

          {/* 2. Live OLED Display Output */}
          {isOled && (
            <div className="live-oled-screen">
              <div className="oled-header-bar">SSD1306 128x64 OLED</div>
              <div className="oled-content-text">
                <div>AutoCircuit AI</div>
                <div className="oled-metric">T: {data.sensorTemp || '24.8'}°C | H: {data.sensorHum || '52'}%</div>
                <div className="oled-bar-visual">
                  <div className="oled-bar-fill" style={{ width: `${(data.sensorTemp || 25) * 2}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* 3. Live Sensor Telemetry (BME280 / MPU6050) */}
          {isSensor && !isOled && (
            <div className="live-sensor-telemetry">
              <div className="telemetry-item">
                <span className="telemetry-label">Temp:</span>
                <span className="telemetry-val">{data.sensorTemp || '24.8'}°C</span>
              </div>
              <div className="telemetry-item">
                <span className="telemetry-label">Signal:</span>
                <span className="telemetry-val" style={{ color: '#00ff88' }}>LOCK 400kHz</span>
              </div>
            </div>
          )}

          {/* 4. Resistor Live Series Current Limiting */}
          {isResistor && (
            <div className="live-resistor-box">
              <div className="resistor-symbol">--[ 4.7kO ]--</div>
              <div className="resistor-note">I2C pull-up - approximately 0.7mA when LOW</div>
            </div>
          )}
        </div>
      )}

      {/* IC Pins Body */}
      <div className="ic-pins-container">
        {pins.map((pinName: string, index: number) => {
          const isPower = pinName === '3V3' || pinName === 'VCC' || pinName === 'VIN' || pinName === '5V';
          const isGnd = pinName === 'GND';
          const isClock = pinName.includes('SCL') || pinName.includes('SCK') || pinName.includes('BCK');
          const isData = pinName.includes('SDA') || pinName.includes('MOSI') || pinName.includes('MISO') || pinName.includes('DIN');

          return (
            <div key={pinName} className="ic-pin-row">
              <Handle type="target" position={Position.Left} id={`pin-${pinName}`} className="schematic-pin-handle" style={{ top: `${82 + index * 25}px` }} />
              <span className={`ic-pin-badge ${isPower ? 'pin-power' : isGnd ? 'pin-gnd' : isClock ? 'pin-clock' : isData ? 'pin-data' : ''} ${isSimulating ? 'pin-active-glow' : ''}`}>
                <span className="pin-num">{index + 1}</span>
                <span className="pin-lbl">{pinName}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Handles */}
      {pins.map((pinName: string, index: number) => <Handle key={`source-${pinName}`} type="source" position={Position.Right} id={`pin-${pinName}`} className="schematic-pin-handle schematic-pin-source" style={{ top: `${82 + index * 25}px` }} />)}
    </div>
  );
};

// ── Interactive Breadboard Wiring Hand Node ─────────────────────
const WiringHandNode = ({ data }: any) => {
  return (
    <div className="wiring-hand-card">
      <div className="hand-icon-wrap">
        <Hand size={22} className="hand-animated-gesture" />
      </div>
      <div className="hand-card-body">
        <div className="hand-card-title">Interactive Hand Insertion</div>
        <div className="hand-card-desc">
          Connecting <strong>{data.targetComponent || 'Component'}</strong> via breadboard jumper wires.
        </div>
        <div className="hand-card-pin">
          Pin: <code>{data.targetPin}</code> ──▶ <code>{data.mcuPin}</code>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="hand-out" className="schematic-handle" />
    </div>
  );
};

const nodeTypes = {
  schematicIc: SchematicIcNode,
  wiringHand: WiringHandNode
};

const SchematicViewer: React.FC<SchematicViewerProps> = ({ design }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Live Circuit Simulation States
  const [isSimulating, setIsSimulating] = useState(true);
  const [ledState, setLedState] = useState(true);
  const [sensorTemp, setSensorTemp] = useState(25.4);
  const [showHandWiring, setShowHandWiring] = useState(false);
  const hasLed = design.components.some(component => /\bled\b/i.test(component.name));

  // Live simulation tick: LED blinking, sensor data streaming
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setLedState(prev => !prev);
      if (design.components.some(component => component.category === 'Sensor' && /bme|dht|bmp/i.test(component.name))) setSensorTemp(prev => {
        const delta = (Math.random() - 0.5) * 0.4;
        return parseFloat((prev + delta).toFixed(1));
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isSimulating, design.components]);

  const { nodes, edges, netCount } = useMemo(() => {
    const mcu = design.components.find(c => c.category === 'MCU');
    const peripherals = design.components.filter(c => c.id !== mcu?.id);

    const wireColors: Record<string, string> = {
      Power: '#ef4444',
      GND: '#64748b',
      I2C: '#eab308',
      SPI: '#3b82f6',
      UART: '#a855f7',
      I2S: '#06b6d4',
      PWM: '#f97316',
      ADC: '#10b981',
      GPIO: '#00f0ff'
    };

    const componentNodes: Node[] = [];

    // MCU Node
    if (mcu) {
      componentNodes.push({
        id: mcu.id,
        type: 'schematicIc',
        position: { x: 80, y: Math.max(120, (peripherals.length * 150) / 2) },
        data: {
          name: mcu.name,
          description: mcu.description,
          category: mcu.category,
          package: mcu.package,
          pins: mcu.pins,
          isMCU: true,
          isSimulating,
          ledState: hasLed && ledState,
          sensorTemp
        }
      });
    }

    // Peripheral Nodes
    peripherals.forEach((comp, idx) => {
      componentNodes.push({
        id: comp.id,
        type: 'schematicIc',
          position: { x: 520 + (idx % 3) * 280, y: 30 + Math.floor(idx / 3) * 210 },
        data: {
          name: comp.name,
          description: comp.description,
          category: comp.category,
          package: comp.package,
          pins: comp.pins,
          isMCU: false,
          isSimulating,
          ledState: hasLed && ledState,
          sensorTemp
        }
      });
    });

    // Optional Hands-on Breadboard Wiring Node
    if (showHandWiring && peripherals.length > 0) {
      const firstMapping = design.pinMappings[0];
      const targetComp = design.components.find(c => c.id === firstMapping?.componentId);
      componentNodes.push({
        id: 'hand-wiring-node',
        type: 'wiringHand',
        position: { x: 380, y: 180 },
        data: {
          targetComponent: targetComp?.name || 'Sensor',
          targetPin: firstMapping?.componentPin || 'VCC',
          mcuPin: firstMapping?.mcuPin || '3V3'
        }
      });
    }

    // Schematic Edges
    const schematicEdges: Edge[] = [];
    const netCountSet = new Set<string>();

    design.pinMappings.forEach((mapping, idx) => {
      const netKey = `${mapping.protocol}:${mapping.mcuPin}:${mapping.componentPin}`;
      netCountSet.add(netKey);

      const color = mapping.wireColor || (mapping.protocol === 'Power' 
        ? '#ef4444' 
        : mapping.protocol === 'GND' 
          ? '#64748b' 
          : mapping.protocol === 'I2C' && mapping.componentPin.toLowerCase().includes('scl')
            ? '#eab308'
            : mapping.protocol === 'I2C'
              ? '#3b82f6'
              : wireColors[mapping.protocol] || '#00f0ff');

      const sourceId = mapping.sourceComponentId || mcu?.id;
      const sourceComponent = design.components.find(component => component.id === sourceId);
      const targetComponent = design.components.find(component => component.id === mapping.componentId);
      if (!sourceComponent || !targetComponent) return;

      schematicEdges.push({
        id: `wire-${idx}-${mapping.componentId}-${mapping.mcuPin}`,
        source: sourceComponent.id,
        target: mapping.componentId,
        sourceHandle: `pin-${mapping.mcuPin}`,
        targetHandle: `pin-${mapping.componentPin}`,
        type: 'smoothstep',
        // Power and ground are static; only signal nets show visual activity.
        animated: isSimulating && !['Power', 'GND'].includes(mapping.protocol),
        label: `${mapping.mcuPin} → ${mapping.componentPin} · ${mapping.protocol}`,
        labelStyle: { 
          fill: color, 
          fontWeight: 700, 
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace'
        },
        labelBgStyle: { 
          fill: '#ffffff', 
          fillOpacity: 0.95,
          rx: 4,
          ry: 4
        },
        labelBgPadding: [6, 4],
        style: { 
          stroke: color, 
          strokeWidth: 2,
          strokeDasharray: undefined
        },
        markerEnd: undefined
      });
    });

    return { nodes: componentNodes, edges: schematicEdges, netCount: netCountSet.size };
  }, [design, isSimulating, ledState, sensorTemp, showHandWiring]);

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
    flowRef.current?.fitView({ padding: 0.12, minZoom: 0.2, maxZoom: 1.2, includeHiddenNodes: true });
  };

  return (
    <section className="schematic-viewer" aria-label={`${design.title} interactive circuit simulation`}>
      {/* Top Header */}
      <div className="schematic-heading">
        <div>
          <h2>
            3D circuit overview
            {isSimulating && <span className="live-simulation-tag"><Activity size={14} /> LIVE RUNNING</span>}
          </h2>
          <p>Rotate, zoom, and inspect the generated connections. Signal animation is a visual simulation, not a hardware measurement.</p>
        </div>
        <div className="schematic-counts">
          <span className="badge badge-cyan">{design.components.length} IC Packages</span>
          <span className="badge badge-emerald">{netCount} Active Nets</span>
        </div>
      </div>

      {/* Live Simulation Controls Bar */}
      <div className="sim-control-bar">
        <div className="sim-controls-group">
          <button 
            className={`btn-sim-power ${isSimulating ? 'sim-on' : 'sim-off'}`}
            onClick={() => setIsSimulating(prev => !prev)}
            title="Toggle Live Circuit Power"
          >
            {isSimulating ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {isSimulating ? 'Simulation running' : 'Simulation paused'}
          </button>

          <button 
            className={`btn-sim-toggle ${showHandWiring ? 'active-toggle' : ''}`}
            onClick={() => setShowHandWiring(prev => !prev)}
            title="Show hands-on component wiring guidance"
          >
            <Hand size={16} />
            {showHandWiring ? 'Hands-On Guide: Active' : 'Hands-On Guide: Off'}
          </button>
        </div>

        <div className="sim-live-metrics">
          <div className="sim-metric-pill">
            <span className="metric-dot-live" style={{ background: isSimulating ? (ledState ? '#00ff88' : '#eab308') : '#64748b' }} />
            <span>Visual signal: <strong>{isSimulating ? 'Active' : 'Paused'}</strong></span>
          </div>
          <div className="sim-metric-pill">
            <span>Mapped nets: <strong>{netCount}</strong></span>
          </div>
        </div>
      </div>

      {/* Wire Color Standards Bar */}
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
          fitViewOptions={{ padding: 0.12, minZoom: 0.2, maxZoom: 1.2, includeHiddenNodes: true }}
          minZoom={0.15}
          maxZoom={1.5}
          onInit={instance => { flowRef.current = instance; }}
          attributionPosition="bottom-right"
        >
          {/* Engineering Dot Matrix / Grid Background */}
          <Background color="rgba(8, 126, 139, 0.12)" gap={24} size={1.5} />
          <Controls style={{ background: 'var(--bg-panel)', fill: 'var(--text-main)', border: '1px solid var(--border-color)' }} />
          <MiniMap 
            nodeColor={(n) => n.data?.isMCU ? '#087e8b' : '#6b9ca2'}
            maskColor="rgba(23, 33, 43, 0.12)"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)' }}
          />
        </ReactFlow>
      </div>

      {/* Suggestion 3: Integrated Virtual Oscilloscope / Protocol Bus Waveform Analyzer */}
      <OscilloscopeViewer isSimulating={isSimulating} design={design} />
    </section>
  );
};

export default SchematicViewer;
