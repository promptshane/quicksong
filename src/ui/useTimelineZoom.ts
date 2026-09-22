import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useStore } from '../state/store';

let pinching = false;

/** True while two fingers are pinching the timeline; drags stand down. */
export function isPinching(): boolean {
  return pinching;
}

/**
 * Pinch-to-zoom for a horizontally scrolling timeline (and ctrl + wheel, which
 * is what a trackpad pinch sends on desktop). The beat under the fingers stays
 * under the fingers. Returns the zoom in pixels per bar.
 */
export function useTimelineZoom(scrollRef: RefObject<HTMLDivElement | null>, beatsPerBar: number): number {
  const zoom = useStore((s) => s.timelineZoom);
  const live = useRef({ zoom, beatsPerBar });
  const anchor = useRef<{ beat: number; x: number } | null>(null);

  useEffect(() => {
    live.current = { zoom, beatsPerBar };
  }, [zoom, beatsPerBar]);

  // After a zoom renders, scroll so the anchored beat is back under the fingers.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = Math.max(0, a.beat * (zoom / beatsPerBar) - a.x);
  }, [zoom, beatsPerBar, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const zoomAt = (next: number, clientX: number) => {
      const { zoom: current, beatsPerBar: perBar } = live.current;
      // x is measured from where beat 0 sits in the scroll content (after the gutter).
      const gutter = (el.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0;
      const x = clientX - el.getBoundingClientRect().left - gutter;
      anchor.current = { beat: (el.scrollLeft + x) / (current / perBar), x };
      useStore.getState().setTimelineZoom(next);
    };

    let pinch: { distance: number; zoom: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const midX = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { distance: Math.max(1, distance(e.touches)), zoom: live.current.zoom };
      pinching = true;
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault(); // no page zoom, no scroll while pinching
      zoomAt(pinch.zoom * (distance(e.touches) / pinch.distance), midX(e.touches));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      pinch = null;
      pinching = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(live.current.zoom * Math.exp(-e.deltaY * 0.01), e.clientX);
    };
    // Safari's own pinch gesture would zoom the whole page.
    const onGesture = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGesture);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGesture);
      pinching = false;
    };
  }, [scrollRef]);

  return zoom;
}
