import { useState } from 'react';
import { ARP_PRESETS, arpSteps, customize, toggleArpStep } from '../model/arpeggio';
import { midiToName } from '../model/music';
import { eighthGrouping, eighthSlotLabel } from '../model/time';
import type { ArpPattern, TimeSignature } from '../model/types';

interface ArpEditorProps {
  arp: ArpPattern;
  /** The chord's notes, low to high (rows of the grid); used for labels and row count. */
  tones: number[];
  timeSignature: TimeSignature;
  onChange: (arp: ArpPattern) => void;
  testId: string;
}

/**
 * Picking / arpeggio pattern: a preset (Up, Down, Up & down, Bass + chord)
 * at quarter- or eighth-note speed, then — only if wanted — a grid to set
 * exactly which note plays on each eighth of the bar (rows = the chord's
 * notes, lowest at the bottom).
 */
export function ArpEditor({ arp, tones, timeSignature, onChange, testId }: ArpEditorProps) {
  const [showGrid, setShowGrid] = useState(arp.preset === 'custom');
  const rows = Math.max(1, tones.length);
  const steps = arpSteps(arp, rows, timeSignature);
  const group = eighthGrouping(timeSignature);

  return (
    <div className="arp-editor" data-testid={testId}>
      <div className="option-grid arp-presets">
        {ARP_PRESETS.map((p) => (
          <button
            key={p.preset}
            className={`btn small ${arp.preset === p.preset ? 'active' : ''}`}
            onClick={() => onChange({ preset: p.preset, rate: arp.rate })}
            aria-pressed={arp.preset === p.preset}
            data-arp-preset={p.preset}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <div className="seg" style={{ flex: 1 }}>
          {(['quarter', 'eighth'] as const).map((rate) => (
            <button
              key={rate}
              className={arp.rate === rate && arp.preset !== 'custom' ? 'on' : ''}
              onClick={() => onChange({ preset: arp.preset === 'custom' ? 'up' : arp.preset, rate })}
              data-arp-rate={rate}
            >
              {rate === 'quarter' ? '♩ Quarter notes' : '♪ Eighth notes'}
            </button>
          ))}
        </div>
        <button className={`btn small ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(!showGrid)} data-testid={`${testId}-customize`}>
          {arp.preset === 'custom' ? 'Custom ▾' : 'Customize'}
        </button>
      </div>

      {showGrid && (
        <div className="arp-grid" role="grid" aria-label="Which note plays on each eighth">
          {Array.from({ length: rows }, (_, r) => rows - 1 - r).map((tone) => (
            <div key={tone} className="arp-row" role="row">
              <span className="arp-note">{tones[tone] !== undefined ? midiToName(tones[tone]) : tone + 1}</span>
              {steps.map((cell, slot) => (
                <button
                  key={slot}
                  className={`arp-cell ${cell.includes(tone) ? 'on' : ''} ${slot > 0 && slot % group === 0 ? 'group-start' : ''}`}
                  onClick={() =>
                    onChange(toggleArpStep(arp.preset === 'custom' ? arp : customize(arp, rows, timeSignature), slot, tone, timeSignature))
                  }
                  aria-pressed={cell.includes(tone)}
                  aria-label={`${eighthSlotLabel(slot, timeSignature)}: ${tones[tone] !== undefined ? midiToName(tones[tone]) : `note ${tone + 1}`}`}
                  data-arp-cell={`${slot}-${tone}`}
                />
              ))}
            </div>
          ))}
          <div className="arp-row arp-labels" aria-hidden>
            <span className="arp-note" />
            {steps.map((_, slot) => (
              <span key={slot} className={`arp-count ${slot > 0 && slot % group === 0 ? 'group-start' : ''}`}>
                {eighthSlotLabel(slot, timeSignature)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
