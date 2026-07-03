import { useCallback, useMemo, useRef, useState } from "react";
import { isBelowDismissThreshold, nearestSnapPoint } from "../utils/assistantWindowGeometry";

const DEFAULT_SNAP_POINTS = [0.45, 0.82, 1];

/**
 * useBottomSheetDrag
 * Hoehen-Drag fuer ein Mobile-Bottom-Sheet mit Snap-Punkten (vh-Anteile).
 * Ziehen unter den kleinsten Snap loest onDismiss aus (=> minimieren).
 */
export default function useBottomSheetDrag({
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = 0.82,
  onDismiss,
  reducedMotion = false,
} = {}) {
  const [snap, setSnap] = useState(initialSnap);
  const [dragRatio, setDragRatio] = useState(null); // Hoehe waehrend des Ziehens
  const dragState = useRef(null);
  const frame = useRef(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const onPointerDown = useCallback(
    (event) => {
      const vh = window.innerHeight || 1;
      dragState.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startRatio: snap,
        lastY: event.clientY,
        lastTime: performance.now(),
        velocity: 0,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);

      const handleMove = (moveEvent) => {
        const state = dragState.current;
        if (!state || moveEvent.pointerId !== state.pointerId) return;
        const now = performance.now();
        const dt = Math.max(1, now - state.lastTime);
        state.velocity = ((moveEvent.clientY - state.lastY) / vh) * (1000 / dt);
        state.lastY = moveEvent.clientY;
        state.lastTime = now;
        const delta = (moveEvent.clientY - state.startY) / vh;
        const ratio = Math.min(1, Math.max(0.15, state.startRatio - delta));
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => setDragRatio(ratio));
      };

      const handleUp = (upEvent) => {
        const state = dragState.current;
        if (!state || upEvent.pointerId !== state.pointerId) return;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        if (frame.current) cancelAnimationFrame(frame.current);
        dragState.current = null;

        const delta = (upEvent.clientY - state.startY) / vh;
        const ratio = Math.min(1, Math.max(0.1, state.startRatio - delta));
        setDragRatio(null);
        if (isBelowDismissThreshold(ratio, snapPoints)) {
          onDismissRef.current?.();
          return;
        }
        setSnap(nearestSnapPoint(ratio, snapPoints, state.velocity));
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [snap, snapPoints],
  );

  const sheetStyle = useMemo(() => {
    const ratio = dragRatio ?? snap;
    return {
      height: `${Math.round(ratio * 100)}vh`,
      maxHeight: "100vh",
      transition:
        dragRatio !== null || reducedMotion ? "none" : "height 220ms cubic-bezier(0.2, 0.9, 0.3, 1)",
    };
  }, [dragRatio, reducedMotion, snap]);

  return {
    sheetStyle,
    currentSnap: snap,
    dragging: dragRatio !== null,
    handleProps: { onPointerDown, style: { touchAction: "none" } },
    setSnap,
  };
}
