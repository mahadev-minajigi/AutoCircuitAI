import React from 'react';
import { Clock, ChevronRight, Cpu } from 'lucide-react';
import type { CircuitDesign } from '../types/circuit';

export interface HistoryEntry {
  design: CircuitDesign;
  prompt: string;
  timestamp: number;
}

interface DesignHistoryProps {
  history: HistoryEntry[];
  currentDesignId: string | null;
  onSelect: (entry: HistoryEntry) => void;
}

const DesignHistory: React.FC<DesignHistoryProps> = ({ history, currentDesignId, onSelect }) => {
  if (history.length === 0) return null;

  return (
    <div className="design-history">
      <h3 className="history-title">
        <Clock size={16} color="var(--accent-cyan)" />
        <span>Design History</span>
        <span className="history-count">{history.length}</span>
      </h3>
      <div className="history-list">
        {[...history].reverse().map((entry) => {
          const isActive = entry.design.id === currentDesignId;
          const mcu = entry.design.components.find(c => c.category === 'MCU');
          return (
            <div
              key={entry.timestamp}
              className={`history-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(entry)}
            >
              <div className="history-item-content">
                <div className="history-item-title">{entry.design.title}</div>
                <div className="history-item-meta">
                  <Cpu size={11} />
                  <span>{mcu?.name || 'Unknown'} · {entry.design.components.length} parts · {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <ChevronRight size={14} className="history-item-arrow" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DesignHistory;
