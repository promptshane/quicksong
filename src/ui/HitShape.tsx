/**
 * One hit, drawn as what it is: a vertical strike whose height is the
 * velocity, then a line dropping off across the duration. Fills its
 * positioned parent and takes its colour from `currentColor`, so the same
 * shape serves piano and guitar, big timelines and small overview strips.
 */
export function HitShape({ velocity, className = '' }: { velocity: number; className?: string }) {
  const v = Math.max(0, Math.min(1, velocity));
  const top = 100 - Math.round(v * 100);
  return (
    <span className={`hit-shape ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={`0,${top} 100,100 0,100`} />
        <line x1="0" y1={top} x2="100" y2="100" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="hit-strike" style={{ height: `${v * 100}%` }} />
    </span>
  );
}
