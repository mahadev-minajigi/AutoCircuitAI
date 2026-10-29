import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cable, Check, CircleAlert, Code2, Cpu, Layers, Play, Route, Wrench } from 'lucide-react';
import type { CircuitDesign, Component } from '../types/circuit';
import CodeEditor from './CodeEditor';
import './IntegratedIdeWorkspace.css';

const Circuit3DViewer = lazy(() => import('./Circuit3DViewer'));

type DetailTab = 'overview' | 'components' | 'connections' | 'checks';

interface IntegratedIdeWorkspaceProps {
  design: CircuitDesign;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onFirmwareChange: (source: string) => void;
}

const workflow = [
  { title: 'Inspect the circuit', detail: 'Explore the generated circuit and run its visual simulation.' },
  { title: 'Review connections', detail: 'Check the actual pin mapping and electrical warnings.' },
  { title: 'Edit the firmware', detail: 'Start from the sketch generated for this circuit.' },
  { title: 'Compile and test', detail: 'Compile the sketch, then validate the circuit simulation.' },
];

const IntegratedIdeWorkspace: React.FC<IntegratedIdeWorkspaceProps> = ({
  design,
  onClose,
  onShowToast,
  onFirmwareChange,
}) => {
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const circuitRef = useRef<HTMLElement>(null);
  const firmwareRef = useRef<HTMLElement>(null);
  const mcu = design.components.find(component => component.category === 'MCU');
  const selectedComponent = design.components.find(component => component.id === selectedComponentId);
  const issueCount = design.drcReport?.filter(rule => rule.type === 'Error' || rule.type === 'Warning').length ?? 0;
  const usedPins = useMemo(() => {
    const pins = design.pinMappings
      .filter(mapping => !mapping.sourceComponentId || mapping.sourceComponentId === mcu?.id)
      .map(mapping => mapping.mcuPin)
      .filter(pin => !['Power', 'GND'].includes(pin));
    return [...new Set(pins)];
  }, [design.pinMappings, mcu?.id]);

  const scrollTo = (target: 'circuit' | 'firmware') => {
    (target === 'circuit' ? circuitRef : firmwareRef).current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const connectedMappings = (component: Component) => design.pinMappings.filter(mapping =>
    mapping.componentId === component.id || mapping.sourceComponentId === component.id
  );

  return (
    <div className="circuit-ide" aria-label="Prompt-generated circuit IDE">
      <header className="circuit-ide-header">
        <button className="btn-secondary" onClick={onClose}><ArrowLeft size={16} /> Back to design</button>
        <div className="circuit-ide-heading">
          <span className="circuit-ide-mark"><Code2 size={20} /></span>
          <div><span className="workspace-eyebrow">PROMPT-GENERATED WORKSPACE</span><h1>{design.title}</h1></div>
        </div>
        <div className="circuit-ide-meta">
          <span><Cpu size={14} />{mcu?.name ?? 'MCU not detected'}</span>
          <span><Layers size={14} />{design.components.length} parts</span>
          <span><Route size={14} />{design.pinMappings.length} connections</span>
        </div>
      </header>

      <nav className="circuit-ide-nav" aria-label="IDE sections">
        <button className="active" onClick={() => scrollTo('circuit')}><Layers size={16} /> Circuit & steps</button>
        <button onClick={() => { setDetailTab('connections'); scrollTo('circuit'); }}><Cable size={16} /> Connections</button>
        <button onClick={() => scrollTo('firmware')}><Code2 size={16} /> Code & compile</button>
        <div className="circuit-ide-nav-note"><Play size={14} /> Circuit, parts, and firmware are from this prompt</div>
      </nav>

      <section className="circuit-ide-workspace" ref={circuitRef} aria-label="Generated circuit and design details">
        <div className="circuit-ide-viewer">
          <Suspense fallback={<div className="circuit-3d-loading" role="status">Loading circuit...</div>}>
            <Circuit3DViewer
              design={design}
              selectedComponentId={selectedComponentId}
              onSelectComponent={componentId => {
                setSelectedComponentId(componentId);
                if (componentId) setDetailTab('components');
              }}
            />
          </Suspense>
        </div>

        <aside className="circuit-ide-details">
          <section className="circuit-progress-card">
            <div className="circuit-progress-heading"><span className="circuit-progress-icon"><Check size={19} /></span><div><span className="workspace-eyebrow">BUILD PROGRESS</span><strong>Design ready to inspect</strong></div></div>
            <div className="circuit-progress-track"><span /></div>
            <div className="circuit-progress-count">4 steps <span>Generated from your prompt</span></div>
          </section>

          <div className="circuit-detail-tabs" role="tablist" aria-label="Generated design details">
            {([
              ['overview', 'Overview'],
              ['components', 'Parts'],
              ['connections', 'Pins'],
              ['checks', 'Checks'],
            ] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={detailTab === id} className={detailTab === id ? 'selected' : ''} onClick={() => setDetailTab(id)}>{label}</button>
            ))}
          </div>

          <div className="circuit-detail-content">
            {detailTab === 'overview' && <>
              <span className="workspace-eyebrow">REQUEST SUMMARY</span>
              <h2>{design.title.replace(/^AI Generated:\s*/i, '')}</h2>
              <p>{design.description}</p>
              <div className="circuit-step-list">
                {workflow.map((step, index) => <div className="circuit-step" key={step.title}>
                  <span>{index + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div>
                </div>)}
              </div>
            </>}

            {detailTab === 'components' && <>
              <span className="workspace-eyebrow">COMPONENTS IN THIS DESIGN</span>
              <div className="circuit-component-list">
                {design.components.map(component => <button key={component.id} className={selectedComponentId === component.id ? 'selected' : ''} onClick={() => setSelectedComponentId(component.id)}>
                  <span className={`circuit-component-dot ${component.category.toLowerCase()}`} />
                  <span><strong>{component.name}</strong><small>{component.category} · {component.package}</small></span>
                  <span className="circuit-component-count">{connectedMappings(component).length}</span>
                </button>)}
              </div>
              {selectedComponent && <div className="circuit-selected-component"><strong>{selectedComponent.name}</strong><p>{selectedComponent.description}</p><small>{selectedComponent.pins.join(' · ')}</small></div>}
            </>}

            {detailTab === 'connections' && <>
              <span className="workspace-eyebrow">GENERATED PIN MAPPING</span>
              <div className="circuit-connection-list">
                {design.pinMappings.map((mapping, index) => {
                  const target = design.components.find(component => component.id === mapping.componentId);
                  const source = mapping.sourceComponentId ? design.components.find(component => component.id === mapping.sourceComponentId) : mcu;
                  return <div className="circuit-connection" key={`${mapping.componentId}-${mapping.componentPin}-${index}`}>
                    <span className="connection-protocol">{mapping.protocol}</span>
                    <strong>{source?.name ?? 'Controller'} · {mapping.sourceComponentPin || mapping.mcuPin}</strong>
                    <span className="connection-arrow">→</span>
                    <strong>{target?.name ?? mapping.componentId} · {mapping.componentPin}</strong>
                    <small>{mapping.description}</small>
                  </div>;
                })}
              </div>
            </>}

            {detailTab === 'checks' && <>
              <span className="workspace-eyebrow">DESIGN RULE CHECKS</span>
              <div className="circuit-check-summary">
                {issueCount ? <><CircleAlert size={18} /><strong>{issueCount} item{issueCount === 1 ? '' : 's'} need review</strong></> : <><Check size={18} /><strong>No reported warnings or errors</strong></>}
              </div>
              <div className="circuit-check-list">
                {(design.drcReport ?? []).map((rule, index) => <div key={`${rule.type}-${index}`} className={`circuit-check ${rule.type.toLowerCase()}`}>
                  <span>{rule.type === 'Pass' ? <Check size={15} /> : <CircleAlert size={15} />}</span><p>{rule.message}</p>
                </div>)}
                {!design.drcReport?.length && <p className="circuit-empty-note">No DRC results are available for this design.</p>}
              </div>
              {usedPins.length > 0 && <p className="circuit-used-pins"><strong>MCU signal pins:</strong> {usedPins.join(', ')}</p>}
            </>}
          </div>
          <button className="circuit-open-code" onClick={() => scrollTo('firmware')}><Code2 size={16} /> Open generated firmware <ArrowLeft size={15} /></button>
        </aside>
      </section>

      <section className="circuit-firmware-section" ref={firmwareRef} aria-label="Generated firmware editor">
        <div className="circuit-firmware-heading">
          <div><span className="workspace-eyebrow">PROMPT-MATCHED CODE</span><h2>Firmware & compile</h2><p>Sketch generated for the parts and pin mappings shown above.</p></div>
          <span className="circuit-firmware-target"><Wrench size={15} /> {mcu?.name ?? 'Select a board in the editor'}</span>
        </div>
        <CodeEditor
          design={design}
          onShowToast={onShowToast}
          onClose={() => scrollTo('circuit')}
          onFirmwareChange={onFirmwareChange}
        />
      </section>
    </div>
  );
};

export default IntegratedIdeWorkspace;
