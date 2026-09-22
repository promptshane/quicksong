import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { isPinching } from './useTimelineZoom';

const MOVE_THRESHOLD_PX = 3;
/** Same hold time as holding a block (delete) or a project card. */
const LONG_PRESS_MS = 550;

export interface HorizontalDragCallbacks {
  /** Pointer went down; capture the starting values. */
  onStart?: () => void;
  /** Horizontal distance from the start, in px (only once past a small threshold). */
  onMove: (dx: number) => void;
  /** Pointer released. `moved` is false for a plain tap. Not called after a long press. */
  onEnd?: (moved: boolean) => void;
  /** Held still for a moment. The release that follows is not a tap. */
  onLongPress?: () => void;
}

/**
 * Pointer handlers for a horizontal drag on one element (an edge handle, the
 * loop bar). With `capture` false the element does not claim the pointer, so
 * a swipe can still scroll the timeline natively and only taps come through.
 * A two-finger pinch cancels the drag.
 */
export function useHorizontalDrag(callbacks: HorizontalDragCallbacks, capture = true) {
  const state = useRef<{ startX: number; moved: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const cb = useRef(callbacks);
  useLayoutEffect(() => {
    cb.current = callbacks;
  });

  const clearHold = () => {
    const s = state.current;
    if (s?.timer) clearTimeout(s.timer);
    if (s) s.timer = null;
  };

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      const s = { startX: e.clientX, moved: false, timer: null as ReturnType<typeof setTimeout> | null };
      state.current = s;
      if (cb.current.onLongPress) {
        s.timer = setTimeout(() => {
          if (state.current !== s || s.moved) return;
          state.current = null; // the release is not a tap
          cb.current.onLongPress?.();
        }, LONG_PRESS_MS);
      }
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
        clearHold();
        state.current = null;
        return;
      }
      const dx = e.clientX - s.startX;
      if (!s.moved && Math.abs(dx) < MOVE_THRESHOLD_PX) return;
      clearHold();
      s.moved = true;
      if (capture) cb.current.onMove(dx);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      clearHold();
      const s = state.current;
      state.current = null;
      if (s) cb.current.onEnd?.(s.moved);
    },
    // Also fires when the browser takes a swipe over for native scrolling.
    onPointerCancel: () => {
      clearHold();
      state.current = null;
    },
    // No iOS callout / context menu on a hold.
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    // Never let a handle's tap fall through to the lane (which moves the cursor).
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
}
