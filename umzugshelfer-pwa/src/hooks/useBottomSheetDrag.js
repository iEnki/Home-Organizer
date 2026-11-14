import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useMotionValue } from "framer-motion";
import { isBelowDismissThreshold, nearestSnapPoint } from "../utils/assistantWindowGeometry";
const DEFAULT_SNAPS = [0.45, 0.82, 1];
export const rubberband = (amount, size, factor = 0.55) => (amount * size * factor) / (size + factor * Math.abs(amount));

export default function useBottomSheetDrag({ snapPoints = DEFAULT_SNAPS, initialSnap = 0.82, onDismiss, reducedMotion = false } = {}) {
  const viewportHeight = () => window.visualViewport?.height || window.innerHeight || 1;
  const height = useMotionValue(viewportHeight() * initialSnap);
  const [snap, setSnapState] = useState(initialSnap);
  const [dragging, setDragging] = useState(false);
  const state = useRef(null);
  const animation = useRef(null);
  const cleanup = useRef(null);
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  const settle = useCallback((target, velocity = 0) => {
    animation.current?.stop();
    setSnapState(target);
    if (reducedMotion) height.set(target * viewportHeight());
    else animation.current = animate(height, target * viewportHeight(), { type: "spring", stiffness: 400, damping: Math.abs(velocity) > 300 ? 34 : 40, mass: 1, velocity });
  }, [height, reducedMotion]);
  useEffect(() => {
    const resize = () => { if (!state.current) settle(snap); };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, [settle, snap]);
  useEffect(() => () => { cleanup.current?.(); animation.current?.stop(); }, []);
  const onPointerDown = useCallback(event => {
    if (event.button && event.button !== 0) return;
    cleanup.current?.();
    animation.current?.stop();
    const vh = viewportHeight();
    const measured = event.currentTarget.parentElement.getBoundingClientRect().height;
    height.set(measured || height.get());
    state.current = { id: event.pointerId, startY: event.clientY, startHeight: height.get(), samples: [{ y: event.clientY, t: performance.now() }], moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = e => {
      const s = state.current; if (!s || e.pointerId !== s.id) return;
      const delta = e.clientY - s.startY;
      if (!s.moved && Math.abs(delta) < 8) return;
      s.moved = true; setDragging(true);
      const now = performance.now();
      s.samples = [...s.samples.filter(sample => now - sample.t < 100), { y: e.clientY, t: now }];
      const next = s.startHeight - delta;
      const min = vh * 0.15;
      height.set(next > vh ? vh + rubberband(next - vh, vh) : next < min ? min + rubberband(next - min, vh) : next);
    };
    const finish = e => {
      const s = state.current; if (!s || e.pointerId !== s.id) return;
      cleanup.current?.(); state.current = null; setDragging(false);
      const cancelled = e.type === "pointercancel";
      const first = s.samples[0], last = s.samples[s.samples.length - 1];
      const velocity = !cancelled && performance.now() - last.t < 120 ? (last.y - first.y) * 1000 / Math.max(1, last.t - first.t) : 0;
      const ratio = height.get() / vh;
      if (!cancelled && s.moved && isBelowDismissThreshold(ratio, snapPoints)) { dismiss.current?.(); return; }
      settle(nearestSnapPoint(ratio, snapPoints, velocity / vh), -velocity);
    };
    cleanup.current = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
  }, [height, settle, snapPoints]);
  return { sheetStyle: { height, maxHeight: "100dvh" }, currentSnap: snap, dragging, setSnap: settle, handleProps: { onPointerDown, style: { touchAction: "none" } } };
}
