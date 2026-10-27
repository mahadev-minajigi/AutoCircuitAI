import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import PromptStudio from './components/PromptStudio';
import SchematicViewer from './components/SchematicViewer';
import PinoutTable from './components/PinoutTable';
import BomTable from './components/BomTable';
import PcbViewer from './components/PcbViewer';
import DrcReport from './components/DrcReport';
import LabGuideView from './components/LabGuideView';
import BreadboardVisualizer from './components/BreadboardVisualizer';
import DesignHistory, { type HistoryEntry } from './components/DesignHistory';
import Toast, { type ToastMessage } from './components/Toast';
import IntegratedIdeWorkspace from './components/IntegratedIdeWorkspace';
import { Cpu, List, CircuitBoard, LayoutDashboard, ShieldCheck, BookOpen, Layers } from 'lucide-react';
import { generateCircuit } from './services/aiCircuitEngine';
import type { CircuitDesign } from './types/circuit';

type TabId = 'schematic' | 'breadboard' | 'lab' | 'pinout' | 'bom' | 'pcb' | 'drc';

const workflowSteps = ['Prompt', 'Analysis', 'Components', 'Circuit', 'Pin mapping', 'Validation', 'BOM', 'Firmware', 'PCB'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('schematic');
  const [isIdeOpen, setIsIdeOpen] = useState(false);
  const [design, setDesign] = useState<CircuitDesign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'e' && design) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('.export-btn')?.click();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [design]);

  const handlePromptSubmit = async (prompt: string, preset?: string) => {
    setIsGenerating(true);
    setGeneratingStep(0);

    // Simulate progressive workflow steps
    const stepInterval = setInterval(() => {
      setGeneratingStep(prev => {
        if (prev >= workflowSteps.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 150);

    setTimeout(async () => {
      clearInterval(stepInterval);
      setGeneratingStep(workflowSteps.length - 1);
      const result = await generateCircuit(prompt, preset);
      setDesign(result);
      setHistory(prev => [...prev, { design: result, prompt, timestamp: Date.now() }]);
      setIsGenerating(false);
      setActiveTab('schematic');
      showToast(`Design ready: ${result.title}`, 'success');
    }, 1500);
  };

  const handleHistorySelect = (entry: HistoryEntry) => {
    setDesign(entry.design);
    setActiveTab('schematic');
    showToast(`Loaded: ${entry.design.title}`, 'info');
  };

  const drcErrorCount = design?.drcReport?.filter(r => r.type === 'Error').length ?? 0;
  const drcWarnCount = design?.drcReport?.filter(r => r.type === 'Warning').length ?? 0;

  const explainedComponents = design?.components.filter(component => component.category !== 'MCU') ?? [];
  const signalMappings = design?.pinMappings.filter(mapping => !['Power', 'GND'].includes(mapping.protocol)) ?? [];
  const signalFlow = signalMappings.slice(0, 6).map(mapping => {
    const source = mapping.sourceComponentId
      ? design?.components.find(component => component.id === mapping.sourceComponentId)?.name
      : design?.components.find(component => component.category === 'MCU')?.name;
    const target = design?.components.find(component => component.id === mapping.componentId)?.name;
    return `${source ?? 'Controller'} ${mapping.mcuPin} → ${target ?? mapping.componentId} ${mapping.componentPin} (${mapping.protocol})`;
  });

  return (
    <div className="app-container">
      <Header currentDesign={design} onShowToast={showToast} onOpenIDE={() => setIsIdeOpen(true)} />
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <div className={`main-content ${isIdeOpen ? 'ide-mode' : ''}`}>
        {!isIdeOpen && (
          <aside className="sidebar">
            <PromptStudio onGenerate={handlePromptSubmit} isGenerating={isGenerating} />
            <DesignHistory
              history={history}
              currentDesignId={design?.id ?? null}
              onSelect={handleHistorySelect}
            />
          </aside>
        )}

        <main className="workspace">
          {isGenerating ? (
            <div className="generating-overlay">
              <div className="generating-card">
                <div className="generating-spinner" aria-hidden="true">
                  <div className="spinner-ring" />
                  <div className="spinner-ring spinner-ring-2" />
                </div>
                <h2 className="generating-title">Synthesizing Design</h2>
                <div className="generating-steps">
                  {workflowSteps.map((step, i) => (
                    <div
                      key={step}
                      className={`gen-step ${i < generatingStep ? 'done' : i === generatingStep ? 'active' : 'pending'}`}
                    >
                      <span className="gen-step-dot" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : design && isIdeOpen ? (
            <div className="standalone-ide-page">
              <IntegratedIdeWorkspace
                design={design}
                onClose={() => setIsIdeOpen(false)}
                onShowToast={showToast}
                onFirmwareChange={firmwareCode => setDesign(current => current ? { ...current, firmwareCode } : current)}
              />
            </div>
          ) : design ? (
            <>
              <div className="workspace-heading">
                <div><span className="workspace-eyebrow">CURRENT DESIGN</span><h1>{design.title}</h1></div>
                <span className={`design-status ${drcErrorCount ? 'has-errors' : ''}`}><span />{drcErrorCount ? `${drcErrorCount} issues` : drcWarnCount ? `${drcWarnCount} warnings` : 'Ready to review'}</span>
              </div>
              <section className="project-explainer" aria-label="Project explanation">
                <div className="project-explainer-intro">
                  <span className="workspace-eyebrow">PROJECT EXPLANATION</span>
                  <p>{design.description}</p>
                </div>
                <div className="project-explainer-section">
                  <h2>How the circuit works</h2>
                  <p>The {design.components.find(component => component.category === 'MCU')?.name ?? 'main controller'} runs the project firmware. The connections in the diagram show how it communicates with and controls the other listed parts. Power and ground links provide the supply and shared electrical reference shown in the design.</p>
                </div>
                {explainedComponents.length > 0 && (
                  <div className="project-explainer-section">
                    <h2>Component roles</h2>
                    <ul className="project-component-list">
                      {explainedComponents.map(component => (
                        <li key={component.id}><strong>{component.name}:</strong> {component.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {signalFlow.length > 0 && (
                  <div className="project-explainer-section">
                    <h2>Signal flow</h2>
                    <ul className="project-flow-list">{signalFlow.map(flow => <li key={flow}>{flow}</li>)}</ul>
                    {signalMappings.length > signalFlow.length && <p className="project-flow-more">The circuit diagram shows the remaining connections.</p>}
                  </div>
                )}
                {design.warnings.length > 0 && <ul>{design.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
              </section>

              <div className="tabs-header">
                {([
                  { id: 'schematic' as TabId, icon: LayoutDashboard, label: '3D Circuit', badge: null as 'error' | 'warn' | null },
                  { id: 'breadboard' as TabId, icon: Layers, label: 'Breadboard', badge: null as 'error' | 'warn' | null },
                  { id: 'lab' as TabId, icon: BookOpen, label: 'Lab guide', badge: null as 'error' | 'warn' | null },
                  { id: 'drc' as TabId, icon: ShieldCheck, label: 'Checks', badge: (drcErrorCount > 0 ? 'error' : drcWarnCount > 0 ? 'warn' : null) as 'error' | 'warn' | null },
                  { id: 'pinout' as TabId, icon: Cpu, label: 'Pin mapping', badge: null as 'error' | 'warn' | null },
                  { id: 'bom' as TabId, icon: List, label: 'BOM', badge: null as 'error' | 'warn' | null },
                  { id: 'pcb' as TabId, icon: CircuitBoard, label: 'PCB', badge: null as 'error' | 'warn' | null },
                ]).map(({ id, icon: Icon, label, badge }) => (
                  <button
                    key={id}
                    className={`tab-btn ${activeTab === id ? 'active' : ''}`}
                    onClick={() => setActiveTab(id as TabId)}
                  >
                    <Icon size={18} /> {label}
                    {badge === 'error' && <span className="tab-badge tab-badge-error">{drcErrorCount}</span>}
                    {badge === 'warn' && <span className="tab-badge tab-badge-warn">{drcWarnCount}</span>}
                  </button>
                ))}
              </div>

              <div className="tab-content">
                {activeTab === 'schematic' && <SchematicViewer design={design} />}
                {activeTab === 'breadboard' && <BreadboardVisualizer design={design} onShowToast={showToast} />}
                {activeTab === 'lab' && <LabGuideView design={design} onShowToast={showToast} />}
                {activeTab === 'drc' && <DrcReport design={design} />}
                {activeTab === 'pinout' && <PinoutTable design={design} onShowToast={showToast} />}
                {activeTab === 'bom' && <BomTable design={design} />}
                {activeTab === 'pcb' && <PcbViewer design={design} />}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                <CircuitBoard size={56} />
              </div>
              <h2>Awaiting Instructions</h2>
              <p>Enter a natural language prompt or pick a Quick Start preset to generate your first hardware design.</p>
              <div className="empty-feature-grid">
                {[
                  { icon: '🔌', title: 'Interactive Schematic', desc: 'React Flow diagram with zoom, pan, fullscreen' },
                  { icon: '📋', title: 'Pin Mapping Table', desc: 'MCU-to-component connection guide' },
                  { icon: '✅', title: 'DRC Validation', desc: 'Rule-based electrical checks' },
                  { icon: '💰', title: 'BOM in INR', desc: 'Estimated parts cost breakdown' },
                  { icon: '💾', title: 'Firmware Starter', desc: 'Copy or download .ino sketch' },
                  { icon: '🖥️', title: 'PCB Preview', desc: 'Conceptual component placement' },
                ].map(f => (
                  <div key={f.title} className="empty-feature-card">
                    <span className="empty-feature-icon">{f.icon}</span>
                    <div className="empty-feature-title">{f.title}</div>
                    <div className="empty-feature-desc">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
