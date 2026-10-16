import React, { useState } from 'react';
import { Sparkles, Terminal, Cpu, Rocket, Music } from 'lucide-react';

interface PromptStudioProps {
  onGenerate: (prompt: string, preset?: string) => void;
  isGenerating: boolean;
}

const PromptStudio: React.FC<PromptStudioProps> = ({ onGenerate, isGenerating }) => {
  const defaultPrompt = 'Design a temperature, humidity and pressure monitoring system using ESP32, BME280 and OLED display.';
  const [prompt, setPrompt] = useState(defaultPrompt);

  const presets = [
    { id: 'esp32-weather', label: 'IoT Weather Station', mcu: 'ESP32', description: 'BME280 + OLED via I2C', icon: Cpu },
    { id: 'stm32-drone', label: 'Flight Controller', mcu: 'STM32', description: 'MPU6000 IMU via SPI', icon: Rocket },
    { id: 'rpi-pico-synth', label: 'MIDI Synthesizer', mcu: 'RP2040', description: 'I2S DAC + MIDI Input', icon: Music },
  ];

  const suggestions = [
    { text: 'Add "motor" for L298N driver', keyword: 'motor' },
    { text: 'Use "drone" for STM32 flight controller', keyword: 'drone' },
    { text: 'Use "synth" for RP2040 audio project', keyword: 'synth' },
  ];

  const handleSuggestionClick = (keyword: string) => {
    const current = prompt.trim();
    if (!current.toLowerCase().includes(keyword)) {
      setPrompt(current ? `${current} with ${keyword}` : keyword);
    }
  };

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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (prompt.trim() && !isGenerating) onGenerate(prompt.trim());
            }
          }}
        />

        <div className="prompt-suggestions">
          {suggestions.map(s => (
            <button
              key={s.keyword}
              className="suggestion-chip"
              onClick={() => handleSuggestionClick(s.keyword)}
              title={s.text}
            >
              + {s.text}
            </button>
          ))}
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: '12px', justifyContent: 'center', padding: '12px' }}
          onClick={() => onGenerate(prompt.trim() || defaultPrompt)}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? <Sparkles className="spin-icon" size={18} /> : <Sparkles size={18} />}
          {isGenerating ? 'Synthesizing...' : 'Generate Design'}
        </button>

        <div className="shortcut-hint">Ctrl + Enter to generate</div>
      </div>

      <div style={{ marginTop: '8px' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Quick Start
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {presets.map(p => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className="preset-card"
                onClick={() => !isGenerating && onGenerate(defaultPrompt, p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onGenerate(defaultPrompt, p.id)}
              >
                <div className="preset-card-content">
                  <span style={{ fontWeight: 500 }}>{p.label}</span>
                  <span className="preset-description">{p.description}</span>
                </div>
                <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <Icon size={12} /> {p.mcu}
                </span>
              </div>
            );
          })}
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
