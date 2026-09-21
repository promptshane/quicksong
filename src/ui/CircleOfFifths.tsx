import { useState } from 'react';
import { chordName, keyName } from '../model/music';
import { SLOT_DEGREES, nearestAngle, type KeyWheel, type WheelCell, type WheelRing } from '../model/keyWheel';
import type { MusicalKey } from '../model/types';

/**
 * Interactive Circle of Fifths: three chord rings (major / minor / dim) that
 * rotate so the assumed key sits at 12 o'clock. Colours come from the
 * semantic states in `keyWheel.ts`; this file only does geometry and CSS.
 */

const SIZE = 320;
const CENTER = SIZE / 2;

/** Inner/outer radius and label radius for each ring, outermost first. */
const RINGS: Record<WheelRing, { inner: number; outer: number; label: number; font: number }> = {
  major: { inner: 114, outer: 158, label: 136, font: 15 },
  minor: { inner: 74, outer: 114, label: 94, font: 13 },
  dim: { inner: 40, outer: 74, label: 57, font: 8.5 },
};

/** Angular gap between neighbouring cells, degrees each side. */
const GAP = 1.2;
/** Radial gap between rings. */
const RING_GAP = 1.5;

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CENTER + r * Math.cos(rad), CENTER + r * Math.sin(rad)];
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/** Annular sector path for one cell, centred on its slot angle. */
function sectorPath(ring: WheelRing, slot: number): string {
  const { inner, outer } = RINGS[ring];
  const ri = inner + RING_GAP / 2;
  const ro = outer - RING_GAP / 2;
  const a0 = slot * SLOT_DEGREES - SLOT_DEGREES / 2 + GAP;
  const a1 = slot * SLOT_DEGREES + SLOT_DEGREES / 2 - GAP;
  const [x0, y0] = polar(ro, a0);
  const [x1, y1] = polar(ro, a1);
  const [x2, y2] = polar(ri, a1);
  const [x3, y3] = polar(ri, a0);
  return [
    `M ${fmt(x0)} ${fmt(y0)}`,
    `A ${ro} ${ro} 0 0 1 ${fmt(x1)} ${fmt(y1)}`,
    `L ${fmt(x2)} ${fmt(y2)}`,
    `A ${ri} ${ri} 0 0 0 ${fmt(x3)} ${fmt(y3)}`,
    'Z',
  ].join(' ');
}

interface Props {
  wheel: KeyWheel;
  /** Tapped a tonic cell that is currently tappable. */
  onTapKey: (key: MusicalKey) => void;
}

export function CircleOfFifths({ wheel, onTapKey }: Props) {
  // Keep a continuous angle so the wheel always takes the short way round
  // (e.g. F -> C is one step, not eleven). Derived state, adjusted in render.
  const [angle, setAngle] = useState(wheel.rotation);
  const target = nearestAngle(angle, wheel.rotation);
  if (target !== angle) setAngle(target);

  const cellLabel = (cell: WheelCell): string | undefined => {
    if (!cell.key) return undefined;
    const name = keyName(cell.key);
    if (cell.keyState === 'assumed') return `${name} (assumed)`;
    if (!cell.tappable) return `${name} (not plausible)`;
    return wheel.mode === 'manual' ? `Choose ${name}` : `Assume ${name}`;
  };

  return (
    <div className="wheel" data-testid="key-wheel" data-rotation={wheel.rotation}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Circle of fifths">
        <g
          className="wheel-rotor"
          style={{ transform: `rotate(${target}deg)`, transformOrigin: `${CENTER}px ${CENTER}px` }}
        >
          {wheel.cells.map((cell) => {
            const d = sectorPath(cell.ring, cell.slot);
            const { label, font } = RINGS[cell.ring];
            const [lx, ly] = polar(label, cell.slot * SLOT_DEGREES);
            const name = chordName(cell.triad.root, cell.triad.quality);
            return (
              <g
                key={`${cell.ring}-${cell.slot}`}
                className="wheel-cell"
                data-testid="wheel-cell"
                data-ring={cell.ring}
                data-slot={cell.slot}
                data-chord={name}
                data-chord-state={cell.chordState}
                data-key-state={cell.keyState ?? undefined}
                role={cell.tappable ? 'button' : undefined}
                aria-label={cell.tappable ? cellLabel(cell) : undefined}
                tabIndex={cell.tappable ? 0 : undefined}
                onClick={cell.tappable && cell.key ? () => onTapKey(cell.key!) : undefined}
                onKeyDown={
                  cell.tappable && cell.key
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onTapKey(cell.key!);
                        }
                      }
                    : undefined
                }
              >
                <path className="wheel-fill" d={d} />
                <g
                  className="wheel-label"
                  style={{ transform: `translate(${lx}px, ${ly}px) rotate(${-target}deg)` }}
                >
                  <text fontSize={font} textAnchor="middle" dominantBaseline="central">
                    {name}
                  </text>
                </g>
              </g>
            );
          })}
          {/* Key halos are drawn last so they sit above neighbouring fills. */}
          {wheel.cells
            .filter((cell) => cell.keyState && cell.keyState !== 'impossible')
            .map((cell) => (
              <path
                key={`halo-${cell.ring}-${cell.slot}`}
                className="wheel-halo"
                data-key-state={cell.keyState ?? undefined}
                d={sectorPath(cell.ring, cell.slot)}
              />
            ))}
        </g>
        <circle className="wheel-hub" cx={CENTER} cy={CENTER} r={RINGS.dim.inner - RING_GAP} />
      </svg>
    </div>
  );
}
