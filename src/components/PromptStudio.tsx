import React, { useState } from 'react';
import { Sparkles, Terminal, Cpu } from 'lucide-react';

interface PromptStudioProps {
  onGenerate: (prompt: string, preset?: string) => void;
  isGenerating: boolean;
}

const PromptStudio: React.FC<PromptStudioProps> = ({ onGenerate, isGenerating }) => {
  const defaultPrompt = 'Design a temperature, humidity and pressure monitoring system using ESP32, BME280 and OLED display.';
  const [prompt, setPrompt] = useState(defaultPrompt);

  const presets = [
    { id: 'esp32-weather', label: 'IoT Weather Station', mcu: 'ESP32' }
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Terminal size={20} color="var(--accent-cyan)" /> Design Prompt
        </h2>
        <textarea
          className="textarea-glass"
          placeholder="Describe your hardware project..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: '16px', justifyContent: 'center', padding: '12px' }}
          onClick={() => onGenerate(prompt.trim() || defaultPrompt)}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? <Sparkles className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {isGenerating ? 'Synthesizing...' : 'Generate Design'}
        </button>
      </div>

      <div style={{ marginTop: '8px' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Quick Start
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {presets.map(p => (
            <div
              key={p.id}
              style={{
                padding: '12px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s'
              }}
              onClick={() => onGenerate(defaultPrompt, p.id)}
              className="preset-card"
            >
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={12} /> {p.mcu}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="project-description-box">
        AutoCircuit AI converts natural-language hardware requirements into an initial electronic design. It generates
        component selection, circuit connections, pin mapping, BOM, firmware, basic electrical validation and PCB
        visualization.
      </div>
    </div>
  );
};

export default PromptStudio;
