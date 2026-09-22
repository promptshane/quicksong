import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { isPinching } from './useTimelineZoom';

const MOVE_THRESHOLD_PX = 3;

export interface HorizontalDragCallbacks {
  /** Pointer went down; capture the starting values. */
  onStart?: () => void;
  /** Horizontal distance from the start, in px (only once past a small threshold). */
  onMove: (dx: number) => void;
  /** Pointer released. `moved` is false for a plain tap. */
  onEnd?: (moved: boolean) => void;
}

/**
 * Pointer handlers for a horizontal drag on one element (an edge handle, the
 * loop bar). With `capture` false the element does not claim the pointer, so
 * a swipe can still scroll the timeline natively and only taps come through.
 * A two-finger pinch cancels the drag.
 */
export function useHorizontalDrag(callbacks: HorizontalDragCallbacks, capture = true) {
  const state = useRef<{ startX: number; moved: boolean } | null>(null);
  const cb = useRef(callbacks);
  useLayoutEffect(() => {
    cb.current = callbacks;
  });

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      state.current = { startX: e.clientX, moved: false };
      cb.current.onStart?.();
      if (!capture) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointer: the element's own move/up handlers still fire.
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = state.current;
      if (!s) return;
      if (isPinching()) {
        state.current = null;
        return;
      }
      const dx = e.clientX - s.startX;
      if (!s.moved && Math.abs(dx) < MOVE_THRESHOLD_PX) return;
      s.moved = true;
      if (capture) cb.current.onMove(dx);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      const s = state.current;
      state.current = null;
      if (s) cb.current.onEnd?.(s.moved);
    },
    onPointerCancel: () => {
      state.current = null;
    },
    // Never let a handle's tap fall through to the lane (which moves the cursor).
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
}
