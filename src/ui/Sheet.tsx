import type { ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra class on the sheet itself (e.g. "tall" for content-heavy panels). */
  className?: string;
}

/** Bottom sheet used for every small editing dialog. */
export function Sheet({ title, onClose, children, className }: SheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${className ?? ''}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">{title}</div>
        {children}
        <button className="btn ghost wide" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
