import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Activity, Clock3, Minus, Plus, RotateCcw, RotateCw, Sparkles, Waypoints, Zap } from 'lucide-react';
import type { CircuitDesign, Component, PinMapping } from '../types/circuit';
import { analyzeFirmwareForSimulation, firmwareDrivesPin, getLedStatesAt, getOutputStateAt } from '../services/firmwareSimulation';
import './Circuit3DViewer.css';

interface Circuit3DViewerProps {
  design: CircuitDesign;
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string | null) => void;
}

interface PartPosition {
  x: number;
  z: number;
}

interface CircuitWire {
  curve: THREE.CatmullRomCurve3;
  pulse: THREE.Mesh;
  protocol: string;
  mcuPin: string;
}

interface CircuitLed {
  lens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  componentId: string;
}

const protocolColors: Record<string, number> = {
  I2C: 0x4aa7e8,
  SPI: 0xbd86e8,
  UART: 0xf0a24d,
  ADC: 0xd9c84e,
  PWM: 0xee846a,
  GPIO: 0x43c1a0,
  I2S: 0xe486b8,
  Power: 0xef625d,
  GND: 0x68768c,
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function createPositions(components: Component[]) {
  const mcu = components.find(component => component.category === 'MCU');
  const peripherals = components.filter(component => component.id !== mcu?.id);
  const radius = peripherals.length > 8 ? 128 : 105;
  const positions = new Map<string, PartPosition>();
  if (mcu) positions.set(mcu.id, { x: 0, z: 0 });
  peripherals.forEach((component, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(peripherals.length, 1);
    positions.set(component.id, {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius * 0.78,
    });
  });
  return { mcu, positions };
}

function componentDimensions(component: Component): [number, number, number] {
  if (component.category === 'MCU') return [36, 8, 25];
  if (/display|oled|screen/i.test(component.name)) return [33, 11, 24];
  if (/motor|driver|regulator|power/i.test(`${component.name} ${component.category}`)) return [28, 12, 21];
  if (component.category === 'Passive') return [16, 5, 12];
  return [23, 9, 18];
}

function makeMaterial(color: number, roughness = 0.62) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.12 });
}

function ledColor(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('green')) return 0x28d17c;
  if (lowerName.includes('blue')) return 0x38a9ff;
  if (lowerName.includes('yellow') || lowerName.includes('amber')) return 0xffc247;
  if (lowerName.includes('white')) return 0xe7f4ff;
  return 0xff4b45;
}

function makeLabel(text: string) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = '600 30px Inter, system-ui, sans-serif';
  const label = text.length > 44 ? `${text.slice(0, 42)}…` : text;
  const labelWidth = Math.ceil(context.measureText(label).width);
  canvas.width = Math.max(130, labelWidth + 34);
  canvas.height = 58;
  context.font = '600 30px Inter, system-ui, sans-serif';
  context.fillStyle = 'rgba(255,255,255,.97)';
  context.strokeStyle = '#b8ccca';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 12);
  context.fill();
  context.stroke();
  context.fillStyle = '#1f3444';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 20);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const width = Math.min(92, Math.max(40, canvas.width * 0.16));
  sprite.scale.set(width, width * canvas.height / canvas.width, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function addMcuBoardDetails(scene: THREE.Scene, boardGroup: THREE.Group) {
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(120, 6, 70),
    makeMaterial(0x25835d, 0.7),
  );
  board.position.y = 0;
  board.castShadow = true;
  board.receiveShadow = true;
  boardGroup.add(board);

  const boardFace = new THREE.Mesh(
    new THREE.BoxGeometry(116, 0.6, 66),
    makeMaterial(0x30936a, 0.78),
  );
  boardFace.position.y = 3.15;
  boardGroup.add(boardFace);

  const traceMaterial = new THREE.MeshStandardMaterial({ color: 0x59ac81, roughness: 0.58, metalness: 0.1 });
  const traces = [
    [[-46, 3.55, -22], [-28, 3.55, -22], [-18, 3.55, -11]],
    [[45, 3.55, -20], [28, 3.55, -20], [18, 3.55, -10]],
    [[-44, 3.55, 20], [-26, 3.55, 20], [-17, 3.55, 10]],
    [[42, 3.55, 19], [27, 3.55, 19], [17, 3.55, 10]],
    [[0, 3.55, -27], [0, 3.55, -18]],
    [[0, 3.55, 27], [0, 3.55, 18]],
  ];
  traces.forEach(points => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point[0], point[1], point[2])));
    boardGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: traceMaterial.color, transparent: true, opacity: 0.75 })));
  });

  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xd5b15f, metalness: 0.78, roughness: 0.28 });
  const pinGeometry = new THREE.CylinderGeometry(2.15, 2.15, 7, 10);
  for (let index = 0; index < 14; index += 1) {
    const x = -47 + index * 7.2;
    for (const z of [-29, 29]) {
      const pin = new THREE.Mesh(pinGeometry, pinMaterial);
      pin.position.set(x, 6.5, z);
      pin.castShadow = true;
      boardGroup.add(pin);
    }
  }

  const holeGeometry = new THREE.CylinderGeometry(4.5, 4.5, 0.8, 20);
  const holeMaterial = makeMaterial(0xd8dfda, 0.4);
  for (const [x, z] of [[-52, -26], [52, -26], [-52, 26], [52, 26]]) {
    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.position.set(x, 3.6, z);
    boardGroup.add(hole);
  }

  const usb = new THREE.Mesh(new THREE.BoxGeometry(16, 13, 20), makeMaterial(0xb9c2c1, 0.32));
  usb.position.set(-68, 8, -14);
  usb.castShadow = true;
  boardGroup.add(usb);
  const jack = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 18, 18), makeMaterial(0x303b4b, 0.35));
  jack.rotation.x = Math.PI / 2;
  jack.position.set(-57, 8, 35);
  boardGroup.add(jack);

  const statusLed = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xd5ec8d, emissive: 0x6bb836, emissiveIntensity: 0.65 }),
  );
  statusLed.position.set(48, 8, -8);
  boardGroup.add(statusLed);

  const boardText = makeLabel('DEVELOPMENT BOARD');
  if (boardText) {
    boardText.scale.set(48, 9, 1);
    boardText.position.set(-23, 7, -25);
    boardGroup.add(boardText);
  }
  scene.add(boardGroup);
}

function createPartMesh(component: Component, selected: boolean): { group: THREE.Group; led?: CircuitLed } {
  const group = new THREE.Group();
  group.userData.componentId = component.id;
  let led: CircuitLed | undefined;
  const [width, height, depth] = componentDimensions(component);
  const outlineColor = selected ? 0x2da99c : 0x293d4d;
  const baseColor = component.category === 'MCU' ? 0x273b4d
    : component.category === 'Passive' ? 0xc49b56
      : component.category === 'Power' ? 0xb8584c
        : component.category === 'Sensor' ? 0x418f79
          : /led/i.test(component.name) ? 0xc85754
            : /display|oled|screen/i.test(component.name) ? 0x243949 : 0x466573;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.48, metalness: component.category === 'Passive' ? 0.35 : 0.18 }),
  );
  body.position.y = height / 2 + 5;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.componentId = component.id;
  group.add(body);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(width + 2.2, 1.5, depth + 2.2),
    new THREE.MeshStandardMaterial({ color: outlineColor, roughness: 0.5, metalness: 0.25 }),
  );
  rim.position.y = 5.7;
  rim.userData.componentId = component.id;
  group.add(rim);

  if (component.category === 'MCU') {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, 5.5, depth * 0.64), makeMaterial(0x111d2a, 0.38));
    chip.position.set(0, height + 10, 0);
    chip.castShadow = true;
    chip.userData.componentId = component.id;
    group.add(chip);
    const chipTop = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.6, depth * 0.3), makeMaterial(0x405164));
    chipTop.position.set(0, height + 13, 0);
    group.add(chipTop);
  } else if (component.category === 'Passive' && /resistor/i.test(component.name)) {
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(4.3, 4.3, width * 0.72, 12),
      makeMaterial(0xd2b57b, 0.62),
    );
    cylinder.rotation.z = Math.PI / 2;
    cylinder.position.set(0, height + 8, 0);
    cylinder.castShadow = true;
    group.add(cylinder);
    const bandColors = [0x9a4f36, 0xd5a62e, 0x6e3c2a];
    bandColors.forEach((color, index) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(4.38, 4.38, 1.35, 12),
        makeMaterial(color, 0.42),
      );
      band.rotation.z = Math.PI / 2;
      band.position.set((index - 1) * width * 0.17, height + 8, 0);
      group.add(band);
    });
    const leadGeometry = new THREE.CylinderGeometry(0.7, 0.7, width * 0.22, 8);
    for (const side of [-1, 1]) {
      const lead = new THREE.Mesh(leadGeometry, makeMaterial(0xb8a77f, 0.4));
      lead.rotation.z = Math.PI / 2;
      lead.position.set(side * width * 0.46, height + 8, 0);
      group.add(lead);
    }
    const value = component.name.match(/\d+(?:\.\d+)?\s*(?:k|m)?\s*(?:Ω|ohms?)/i)?.[0] ?? '';
    const text = makeLabel(value || 'R');
    if (text) {
      text.scale.set(20, 7, 1);
      text.position.set(0, height + 16, depth * 0.5 + 2);
      group.add(text);
    }
  } else if (/led|diode/i.test(component.name)) {
    const color = ledColor(component.name);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 6.6, 2, 16),
      makeMaterial(0x252e37, 0.38),
    );
    base.position.y = height + 6;
    base.castShadow = true;
    group.add(base);
    const domeMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.85 : 0.04,
      roughness: 0.2,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7.5, 18, 14), domeMaterial);
    dome.scale.y = 0.9;
    dome.position.y = height + 11.5;
    dome.castShadow = true;
    dome.userData.componentId = component.id;
    group.add(dome);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(10.5, 16, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }),
    );
    glow.position.copy(dome.position);
    glow.userData.componentId = component.id;
    group.add(glow);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 12, 8), makeMaterial(0xb8c3c0, 0.38));
      leg.position.set(side * 4, 1, 0);
      group.add(leg);
    }
    led = { lens: dome, glow, componentId: component.id };
  } else if (/display|oled|screen/i.test(component.name)) {
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 2, depth * 0.78),
      makeMaterial(0x101820, 0.3),
    );
    bezel.position.y = height + 0.5;
    bezel.castShadow = true;
    group.add(bezel);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.76, 0.8, depth * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x102b32, emissive: 0x176c69, emissiveIntensity: 0.7, roughness: 0.18 }),
    );
    screen.position.y = height + 1.8;
    group.add(screen);
    const displayLines = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.46, 0.35, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x79f2ce }),
    );
    displayLines.position.set(0, height + 2.4, -depth * 0.12);
    group.add(displayLines);
  } else if (/button|switch/i.test(component.name)) {
    const buttonBase = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 3, depth * 0.72),
      makeMaterial(0x242c35, 0.42),
    );
    buttonBase.position.y = height + 1.5;
    group.add(buttonBase);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.8, 5, 16),
      makeMaterial(0xd94f4a, 0.3),
    );
    cap.position.y = height + 5.5;
    cap.castShadow = true;
    group.add(cap);
  } else if (/buzzer|speaker|motor/i.test(component.name)) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.32, width * 0.36, height + 4, 20),
      makeMaterial(/motor/i.test(component.name) ? 0x89969b : 0x303b45, 0.32),
    );
    can.position.y = height + 3;
    can.castShadow = true;
    group.add(can);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.28, width * 0.28, 1, 20),
      makeMaterial(/motor/i.test(component.name) ? 0x39464d : 0x141d24, 0.3),
    );
    cap.position.y = height + 5.5;
    group.add(cap);
  } else {
    const chip = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.48, 3.2, depth * 0.42),
      makeMaterial(component.category === 'Sensor' ? 0x172b32 : 0x253442, 0.34),
    );
    chip.position.set(0, height + 2.1, 0);
    chip.castShadow = true;
    chip.userData.componentId = component.id;
    group.add(chip);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), makeMaterial(0xd6b76e, 0.32));
    dot.position.set(-width * 0.19, height + 4, -depth * 0.14);
    group.add(dot);
  }

  const terminalMaterial = makeMaterial(0xd7b566, 0.28);
  const terminalGeometry = new THREE.CylinderGeometry(1.5, 1.5, 6, 8);
  for (const side of [-1, 1]) {
    for (const offset of [-0.28, 0.28]) {
      const terminal = new THREE.Mesh(terminalGeometry, terminalMaterial);
      terminal.position.set(side * (width / 2 + 1), 2.5, depth * offset);
      group.add(terminal);
    }
  }

  const nameLabel = makeLabel(component.name);
  if (nameLabel) {
    nameLabel.position.set(0, height + 25, 0);
    nameLabel.userData.label = true;
    nameLabel.userData.componentId = component.id;
    group.add(nameLabel);
  }
  group.userData.componentId = component.id;
  return { group, led };
}

function mcuPinPosition(pin: string): THREE.Vector3 {
  const hash = hashString(pin);
  const side = hash % 4;
  const offset = ((hash >> 3) % 9 - 4) * 10;
  if (side === 0) return new THREE.Vector3(offset, 5, -31);
  if (side === 1) return new THREE.Vector3(56, 5, offset * 0.55);
  if (side === 2) return new THREE.Vector3(offset, 5, 31);
  return new THREE.Vector3(-56, 5, offset * 0.55);
}

function connectPoint(position: PartPosition, component: Component) {
  const [, height, depth] = componentDimensions(component);
  return new THREE.Vector3(position.x, height + 7, position.z + depth / 2);
}

function buildWire(
  scene: THREE.Scene,
  mapping: PinMapping,
  index: number,
  components: Component[],
  positions: Map<string, PartPosition>,
  mcu: Component | undefined,
) {
  const targetComponent = components.find(component => component.id === mapping.componentId);
  const targetPosition = positions.get(mapping.componentId);
  if (!targetComponent || !targetPosition) return null;
  const sourceComponent = mapping.sourceComponentId
    ? components.find(component => component.id === mapping.sourceComponentId)
    : mcu;
  const sourcePosition = positions.get(sourceComponent?.id ?? '');
  if (!sourceComponent || !sourcePosition) return null;
  const start = mapping.sourceComponentId
    ? connectPoint(sourcePosition, sourceComponent).add(new THREE.Vector3(index % 2 ? 3 : -3, 2, 0))
    : mcuPinPosition(mapping.mcuPin);
  const end = connectPoint(targetPosition, targetComponent);
  const rise = 16 + (index % 4) * 3;
  const curve = new THREE.CatmullRomCurve3([
    start,
    new THREE.Vector3(start.x, rise, start.z + 9),
    new THREE.Vector3((start.x + end.x) / 2, rise + 5, (start.z + end.z) / 2),
    new THREE.Vector3(end.x, rise, end.z - 8),
    end,
  ]);
  const color = mapping.wireColor ? Number.parseInt(mapping.wireColor.replace('#', ''), 16) : protocolColors[mapping.protocol] ?? 0x57b7c8;
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 32, 0.72, 6, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.04, emissive: color, emissiveIntensity: 0.06 }),
  );
  wire.userData.protocol = mapping.protocol;
  scene.add(wire);

  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 10, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  pulse.userData.offset = index * 0.137;
  scene.add(pulse);
  return { curve, pulse, protocol: mapping.protocol, mcuPin: mapping.mcuPin } satisfies CircuitWire;
}

const Circuit3DViewer: React.FC<Circuit3DViewerProps> = ({ design, selectedComponentId, onSelectComponent }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const partGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const wireGroupsRef = useRef<Map<string, THREE.Object3D[]>>(new Map());
  const labelSpritesRef = useRef<THREE.Sprite[]>([]);
  const wiresRef = useRef<CircuitWire[]>([]);
  const onSelectRef = useRef(onSelectComponent);
  const poweredRef = useRef(true);
  const wiresVisibleRef = useRef(true);
  const simulationElapsedRef = useRef(0);
  const simulationPlan = useMemo(() => analyzeFirmwareForSimulation(design), [design]);
  const simulationPlanRef = useRef(simulationPlan);
  const [camera, setCamera] = useState({ labels: true, wires: true, powered: true });
  const [simulationTimeMs, setSimulationTimeMs] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const mcu = design.components.find(component => component.category === 'MCU');

  useEffect(() => { onSelectRef.current = onSelectComponent; }, [onSelectComponent]);
  useEffect(() => { simulationPlanRef.current = simulationPlan; }, [simulationPlan]);
  useEffect(() => {
    simulationElapsedRef.current = 0;
  }, [design.id]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      console.error('Unable to initialize the interactive circuit renderer.', error);
      setRenderError('The interactive circuit view is unavailable in this browser. Enable WebGL or use a browser with graphics acceleration.');
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Interactive circuit board. Drag to rotate and select components for details.');
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf4f2');
    sceneRef.current = scene;

    const viewCamera = new THREE.PerspectiveCamera(36, mount.clientWidth / Math.max(mount.clientHeight, 1), 1, 1800);
    viewCamera.position.set(205, 190, 245);
    cameraRef.current = viewCamera;
    const controls = new OrbitControls(viewCamera, renderer.domElement);
    controls.target.set(0, 18, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 130;
    controls.maxDistance = 620;
    controls.maxPolarAngle = Math.PI * 0.49;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x66765e, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-120, 230, 160);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xd0e8ff, 1.25);
    fillLight.position.set(150, 100, -130);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(440, 44, 0x8eaaa5, 0xc4d5d1);
    grid.position.y = -4;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.34;
    scene.add(grid);

    const boardGroup = new THREE.Group();
    addMcuBoardDetails(scene, boardGroup);
    const { mcu: generatedMcu, positions } = createPositions(design.components);
    const partGroups = new Map<string, THREE.Group>();
    const labels: THREE.Sprite[] = [];
    const leds: CircuitLed[] = [];

    design.components.forEach(component => {
      const position = positions.get(component.id);
      if (!position || component.id === generatedMcu?.id) return;
      const { group: partGroup, led } = createPartMesh(component, false);
      if (led) leds.push(led);
      partGroup.position.set(position.x, 3, position.z);
      partGroup.traverse(object => {
        if (object instanceof THREE.Sprite && object.userData.label) labels.push(object);
      });
      partGroups.set(component.id, partGroup);
      scene.add(partGroup);
    });

    if (generatedMcu) {
      const { group: mcuGroup, led } = createPartMesh(generatedMcu, false);
      if (led) leds.push(led);
      mcuGroup.position.set(0, 7, 0);
      mcuGroup.traverse(object => {
        if (object instanceof THREE.Sprite && object.userData.label) labels.push(object);
      });
      partGroups.set(generatedMcu.id, mcuGroup);
      scene.add(mcuGroup);
    }

    const wires: CircuitWire[] = [];
    const wireGroups = new Map<string, THREE.Object3D[]>();
    design.pinMappings.forEach((mapping, index) => {
      const wire = buildWire(scene, mapping, index, design.components, positions, generatedMcu);
      if (!wire) return;
      wires.push(wire);
      const group = [wire.pulse];
      wireGroups.set(mapping.componentId, [...(wireGroups.get(mapping.componentId) ?? []), ...group]);
      if (mapping.sourceComponentId) {
        wireGroups.set(mapping.sourceComponentId, [...(wireGroups.get(mapping.sourceComponentId) ?? []), ...group]);
      }
    });

    wiresRef.current = wires;
    wireGroupsRef.current = wireGroups;
    partGroupsRef.current = partGroups;
    labelSpritesRef.current = labels;

    const hitRaycaster = new THREE.Raycaster();
    const normalizedPointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const handlePointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDown || Math.abs(pointerDown.x - event.clientX) + Math.abs(pointerDown.y - event.clientY) > 5) {
        pointerDown = null;
        return;
      }
      pointerDown = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      normalizedPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      normalizedPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      hitRaycaster.setFromCamera(normalizedPointer, viewCamera);
      const intersections = hitRaycaster.intersectObjects([...partGroups.values()], true);
      let object: THREE.Object3D | null = intersections[0]?.object ?? null;
      while (object && !object.userData.componentId) object = object.parent;
      onSelectRef.current(typeof object?.userData.componentId === 'string' ? object.userData.componentId : null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'q' || key === 'e') {
        viewCamera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), key === 'q' ? -0.12 : 0.12).add(controls.target);
        controls.update();
        event.preventDefault();
        return;
      }
      const direction = viewCamera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3().crossVectors(direction, viewCamera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, direction).normalize();
      const pan = new THREE.Vector3();
      if (key === 'a' || key === 'arrowleft') pan.add(right);
      else if (key === 'd' || key === 'arrowright') pan.sub(right);
      else if (key === 'w' || key === 'arrowup') pan.sub(up);
      else if (key === 's' || key === 'arrowdown') pan.add(up);
      else return;
      pan.multiplyScalar(event.shiftKey ? 18 : 10);
      viewCamera.position.add(pan);
      controls.target.add(pan);
      controls.update();
      event.preventDefault();
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('keydown', handleKeyDown);

    let frame = 0;
    let previousFrameTime = 0;
    let lastHudUpdate = 0;
    const animate = (time: number) => {
      controls.update();
      const activePlan = simulationPlanRef.current;
      if (previousFrameTime > 0 && poweredRef.current && activePlan.isSupported) {
        simulationElapsedRef.current = (simulationElapsedRef.current + time - previousFrameTime) % activePlan.durationMs;
      }
      previousFrameTime = time;
      const simulationElapsed = simulationElapsedRef.current;
      if (time - lastHudUpdate >= 100) {
        setSimulationTimeMs(simulationElapsed);
        lastHudUpdate = time;
      }
      const ledStates = getLedStatesAt(activePlan, simulationElapsed);
      wires.forEach(wire => {
        const active = firmwareDrivesPin(activePlan, wire.mcuPin)
          && getOutputStateAt(activePlan, wire.mcuPin, simulationElapsed) === true;
        wire.pulse.visible = wiresVisibleRef.current && active;
        if (active) {
          const offset = Number(wire.pulse.userData.offset) || 0;
          wire.pulse.position.copy(wire.curve.getPoint((simulationElapsed / activePlan.durationMs + offset) % 1));
        }
      });
      leds.forEach(led => {
        const lit = ledStates.get(led.componentId) === true;
        led.lens.material.emissiveIntensity = lit ? 1.8 : 0.04;
        led.lens.material.opacity = lit ? 0.98 : 0.64;
        led.glow.material.opacity = lit ? 0.2 : 0;
        led.glow.scale.setScalar(lit ? 1.12 : 0.86);
      });
      renderer.render(scene, viewCamera);
      frame = requestAnimationFrame(animate);
    };
    animate(0);

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = Math.max(mount.clientHeight, 1);
      viewCamera.aspect = width / height;
      viewCamera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('keydown', handleKeyDown);
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            if ('map' in material && material.map) material.map.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      partGroupsRef.current.clear();
      wireGroupsRef.current.clear();
      labelSpritesRef.current = [];
      wiresRef.current = [];
    };
  }, [design.components, design.pinMappings]);

  useEffect(() => {
    partGroupsRef.current.forEach((group, componentId) => {
      const active = componentId === selectedComponentId;
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material;
        if (Array.isArray(material)) return;
        if (material instanceof THREE.MeshStandardMaterial && object.userData.componentId === componentId) {
          material.emissive.set(active ? 0x146e66 : 0x000000);
          material.emissiveIntensity = active ? 0.55 : 0;
        }
      });
    });
  }, [selectedComponentId]);

  useEffect(() => {
    poweredRef.current = camera.powered;
    wiresVisibleRef.current = camera.wires;
    labelSpritesRef.current.forEach(label => { label.visible = camera.labels; });
    sceneRef.current?.traverse(object => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TubeGeometry) {
        object.visible = camera.wires;
      }
    });
    wiresRef.current.forEach(wire => {
      wire.pulse.visible = camera.wires && firmwareDrivesPin(simulationPlan, wire.mcuPin);
    });
  }, [camera.labels, camera.powered, camera.wires, simulationPlan]);

  const resetCamera = useCallback(() => {
    const controls = controlsRef.current;
    const viewCamera = cameraRef.current;
    if (!controls || !viewCamera) return;
    viewCamera.position.set(205, 190, 245);
    controls.target.set(0, 18, 0);
    controls.update();
    onSelectComponent(null);
  }, [onSelectComponent]);

  const rotate = (direction: number) => {
    const controls = controlsRef.current;
    const viewCamera = cameraRef.current;
    if (!controls || !viewCamera) return;
    viewCamera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * 0.2).add(controls.target);
    controls.update();
  };

  const zoom = (amount: number) => {
    const controls = controlsRef.current;
    const viewCamera = cameraRef.current;
    if (!controls || !viewCamera) return;
    const offset = viewCamera.position.clone().sub(controls.target);
    offset.multiplyScalar(amount);
    const distance = offset.length();
    if (distance < controls.minDistance || distance > controls.maxDistance) return;
    viewCamera.position.copy(controls.target).add(offset);
    controls.update();
  };

  const toggleWires = () => {
    setCamera(current => ({ ...current, wires: !current.wires }));
    sceneRef.current?.traverse(object => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TubeGeometry) object.visible = !camera.wires;
    });
  };
  const togglePowered = () => {
    setCamera(current => ({ ...current, powered: !current.powered }));
  };

  const componentCount = design.components.length;
  const connectionCount = design.pinMappings.length;
  const timelineDuration = simulationPlan.isSupported ? simulationPlan.durationMs : 1000;
  const timelineValue = simulationPlan.isSupported ? simulationTimeMs % timelineDuration : 0;
  const formattedTime = `${(timelineValue / 1000).toFixed(2)}s / ${(timelineDuration / 1000).toFixed(2)}s`;

  return (
    <section className="circuit-3d-viewer" aria-label="Interactive circuit view">
      <header className="circuit-3d-heading">
        <div><span className="workspace-eyebrow">PROMPT-GENERATED CIRCUIT</span><h2>{design.title}</h2><p>Drag to rotate · Right-drag to pan · Scroll to zoom · Scrub the firmware timeline to inspect modeled outputs</p></div>
        <span className="circuit-3d-component-count"><strong>{componentCount}</strong> parts <i /> <strong>{connectionCount}</strong> connections</span>
      </header>

      <div className="circuit-3d-stage">
        <div className="circuit-3d-canvas" ref={mountRef} />
        {renderError && <div className="circuit-3d-error" role="alert">{renderError}</div>}
        <div className="circuit-3d-controls" aria-label="Circuit view controls">
          <button onClick={() => rotate(-1)} title="Rotate left" aria-label="Rotate left"><RotateCcw size={17} /></button>
          <button onClick={() => zoom(1.12)} title="Zoom out" aria-label="Zoom out"><Minus size={18} /></button>
          <button onClick={() => zoom(0.89)} title="Zoom in" aria-label="Zoom in"><Plus size={18} /></button>
          <button onClick={resetCamera} title="Reset camera" aria-label="Reset camera"><RotateCw size={17} /></button>
          <button className={camera.wires ? 'selected' : ''} onClick={toggleWires} title="Toggle connection wires" aria-label="Toggle connection wires"><Waypoints size={17} /></button>
          <button className={camera.labels ? 'selected' : ''} onClick={() => setCamera(current => ({ ...current, labels: !current.labels }))} title="Toggle component labels" aria-label="Toggle component labels"><Sparkles size={16} /></button>
          <button className={camera.powered ? 'powered' : ''} onClick={togglePowered} title={camera.powered ? 'Pause visual simulation' : 'Run visual simulation'} aria-label={camera.powered ? 'Pause simulation' : 'Run simulation'}><Zap size={17} /></button>
        </div>
        <div className="circuit-3d-tip" title={simulationPlan.message}>{camera.powered ? (simulationPlan.isSupported ? 'Firmware outputs · visual model' : 'Firmware not simulated') : 'Visual simulation paused'} · {mcu?.name ?? 'Board not identified'}</div>
      </div>
      <div className={`circuit-3d-timeline ${simulationPlan.isSupported ? 'is-supported' : ''}`}>
        <div className="circuit-3d-timeline-heading">
          <span><Clock3 size={14} /> TIME VIEW</span>
          <strong>{simulationPlan.isSupported ? formattedTime : 'Unavailable for this sketch'}</strong>
          <span className="circuit-3d-timeline-status"><Activity size={13} /> {simulationPlan.isSupported ? 'Firmware visual model' : 'No guessed behavior'}</span>
        </div>
        <input
          type="range"
          min={0}
          max={timelineDuration}
          step={10}
          value={timelineValue}
          disabled={!simulationPlan.isSupported}
          aria-label="Scrub the firmware visual simulation timeline"
          onPointerDown={() => {
            if (simulationPlan.isSupported) setCamera(current => ({ ...current, powered: false }));
          }}
          onChange={event => {
            const nextTime = Number(event.currentTarget.value);
            setCamera(current => ({ ...current, powered: false }));
            simulationElapsedRef.current = nextTime;
            setSimulationTimeMs(nextTime);
          }}
        />
        <small>{simulationPlan.isSupported ? 'LED states and output pulses follow this modeled loop time. This is a visual preview, not an electrical simulation.' : simulationPlan.message}</small>
      </div>
      <footer className="circuit-3d-legend">
        {Object.entries(protocolColors).map(([protocol, color]) => (
          <span key={protocol}><i style={{ background: `#${color.toString(16).padStart(6, '0')}` }} />{protocol}</span>
        ))}
        <small>Visual connection preview; confirm pinout, power requirements, and wiring before assembly.</small>
      </footer>
    </section>
  );
};

export default Circuit3DViewer;
