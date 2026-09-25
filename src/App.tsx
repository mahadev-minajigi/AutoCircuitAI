import { useState } from 'react';
import Header from './components/Header';
import PromptStudio from './components/PromptStudio';
import SchematicViewer from './components/SchematicViewer';
import PinoutTable from './components/PinoutTable';
import BomTable from './components/BomTable';
import CodeEditor from './components/CodeEditor';
import PcbViewer from './components/PcbViewer';
import DrcReport from './components/DrcReport';
import { Cpu, List, FileCode2, CircuitBoard, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { generateCircuit } from './services/aiCircuitEngine';
import type { CircuitDesign } from './types/circuit';

function App() {
  const [activeTab, setActiveTab] = useState<'schematic' | 'pinout' | 'bom' | 'code' | 'pcb' | 'drc'>('schematic');
  const [design, setDesign] = useState<CircuitDesign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const workflowSteps = [
    'User Prompt',
    'Requirement Analysis',
    'Component Selection',
    'Circuit Generation',
    'Pin Mapping',
    'DRC Validation',
    'BOM',
    'Firmware',
    'PCB Preview'
  ];

  const handlePromptSubmit = async (prompt: string, preset?: string) => {
    setIsGenerating(true);
    setTimeout(() => {
      const result = generateCircuit(prompt, preset);
      setDesign(result);
      setIsGenerating(false);
      setActiveTab('schematic');
    }, 1500);
  };

  return (
    <div className="app-container">
      <Header currentDesign={design} />

      <div className="main-content">
        <aside className="sidebar">
          <PromptStudio onGenerate={handlePromptSubmit} isGenerating={isGenerating} />
        </aside>

        <main className="workspace">
          {design ? (
            <>
              <div className="project-summary-box">
                <div className="project-summary-tag">AI-assisted hardware design and circuit generation</div>
                <p>
                  Current prototype: understands supported hardware requirements, selects compatible components,
                  generates circuit connections, creates pin mapping, builds a BOM, produces starter firmware,
                  performs rule-based electrical validation, and provides a PCB preview.
                </p>
              </div>

              <div className="workflow-indicator" aria-label="Design workflow">
                {workflowSteps.map((step, index) => (
                  <div key={step} className={`workflow-step ${index === workflowSteps.length - 1 ? 'last' : ''}`}>
                    <span className="workflow-number">{index + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              <div className="tabs-header">
                <button
                  className={`tab-btn ${activeTab === 'schematic' ? 'active' : ''}`}
                  onClick={() => setActiveTab('schematic')}
                >
                  <LayoutDashboard size={18} /> Schematic
                </button>
                <button
                  className={`tab-btn ${activeTab === 'drc' ? 'active' : ''}`}
                  onClick={() => setActiveTab('drc')}
                >
                  <ShieldCheck size={18} /> DRC Report
                  {design.drcReport?.some(r => r.type === 'Error') && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-rose)', marginLeft: 4 }}></span>
                  )}
                </button>
                <button
                  className={`tab-btn ${activeTab === 'pinout' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pinout')}
                >
                  <Cpu size={18} /> Pin Mapping
                </button>
                <button
                  className={`tab-btn ${activeTab === 'bom' ? 'active' : ''}`}
                  onClick={() => setActiveTab('bom')}
                >
                  <List size={18} /> BOM
                </button>
                <button
                  className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`}
                  onClick={() => setActiveTab('code')}
                >
                  <FileCode2 size={18} /> Firmware
                </button>
                <button
                  className={`tab-btn ${activeTab === 'pcb' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pcb')}
                >
                  <CircuitBoard size={18} /> PCB Preview
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'schematic' && <SchematicViewer design={design} />}
                {activeTab === 'drc' && <DrcReport design={design} />}
                {activeTab === 'pinout' && <PinoutTable design={design} />}
                {activeTab === 'bom' && <BomTable design={design} />}
                {activeTab === 'code' && <CodeEditor design={design} />}
                {activeTab === 'pcb' && <PcbViewer design={design} />}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <CircuitBoard size={64} style={{ opacity: 0.2, marginBottom: '24px' }} />
              <h2>Awaiting Instructions</h2>
              <p style={{ marginTop: '8px' }}>Enter a natural language prompt to generate a simple hardware design demo.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
