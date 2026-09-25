import React, { useState } from 'react';
import { Sparkles, Terminal, Cpu } from 'lucide-react';

interface PromptStudioProps {
  onGenerate: (prompt: string, preset?: string) => void;
  isGenerating: boolean;
}

const PromptStudio: React.FC<PromptStudioProps> = ({ onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');

  const presets = [
    { id: 'esp32-weather', label: 'IoT Weather Station', mcu: 'ESP32' },
    { id: 'stm32-drone', label: 'Drone Controller', mcu: 'STM32' },
    { id: 'rpi-pico-synth', label: 'MIDI Synthesizer', mcu: 'RP2040' },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Terminal size={20} color="var(--accent-cyan)" /> Design Prompt
        </h2>
        <textarea 
          className="textarea-glass"
          placeholder="Describe your hardware project... e.g., 'Design a smart plant monitor using ESP32 with a soil moisture sensor and an OLED display.'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button 
          className="btn-primary" 
          style={{ width: '100%', marginTop: '16px', justifyContent: 'center', padding: '12px' }}
          onClick={() => onGenerate(prompt)}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? <Sparkles className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {isGenerating ? 'Synthesizing...' : 'Generate Circuit'}
        </button>
      </div>

      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Quick Start Presets
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
              onClick={() => onGenerate('', p.id)}
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
    </div>
  );
};

export default PromptStudio;
