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
    { text: 'Motor driver', keyword: 'motor' },
    { text: 'Drone controller', keyword: 'drone' },
    { text: 'Audio synth', keyword: 'synth' },
  ];

  const handleSuggestionClick = (keyword: string) => {
    const current = prompt.trim();
    if (!current.toLowerCase().includes(keyword)) {
      setPrompt(current ? `${current} with ${keyword}` : keyword);
    }
  };

  return (
    <div className="prompt-studio">
      <div className="prompt-section">
        <div className="prompt-section-heading"><div><span className="workspace-eyebrow">START HERE</span><h2>Describe your circuit</h2></div><Terminal size={18} /></div>
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

      <div className="prompt-section quick-start-section">
        <div className="quick-start-heading"><div><span className="workspace-eyebrow">TEMPLATES</span><h3>Quick start</h3></div></div>
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
                <span style={{ fontWeight: 600 }}>{p.label}</span>
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

    </div>
  );
};

export default PromptStudio;
