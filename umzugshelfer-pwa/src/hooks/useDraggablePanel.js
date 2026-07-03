import { useCallback, useEffect, useRef, useState } from "react";
import { clampToViewport } from "../utils/assistantWindowGeometry";

/**
 * useDraggablePanel
 * Frei verschiebbares fixed-Element (Desktop-Panel oder Blase) via Pointer-Events.
 *
 * @param {boolean} enabled          Drag aktiv (z.B. nur Desktop)
 * @param {{x,y}|null} initialPosition  Startposition (null = noch nicht bekannt)
 * @param {function} onDragEnd       ({x, y}) => void — z.B. Persistenz
 * @param {number} padding           Mindestabstand zum Viewport-Rand
 *
 * dragHandleProps auf das Handle-Element legen (onPointerDown).
 * elementRef auf das bewegte Element legen (fuer Groessenmessung).
 */
export default function useDraggablePanel({ enabled = true, initialPosition = null, onDragEnd, padding = 8 } = {}) {
  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const elementRef = useRef(null);
  const dragState = useRef(null);
  const frame = useRef(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // Initialposition uebernehmen, sobald sie (asynchron) bekannt wird —
  // aber eine bereits per Drag gesetzte Position nicht ueberschreiben.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && initialPosition) {
      initializedRef.current = true;
      setPosition(initialPosition);
    }
  }, [initialPosition]);

  const measure = useCallback(() => {
    const el = elementRef.current;
    return {
      width: el?.offsetWidth || 0,
      height: el?.offsetHeight || 0,
    };
  }, []);

  const clamp = useCallback(
    (next) => {
      const { width, height } = measure();
      return clampToViewport({
        ...next,
        width,
        height,
        vw: window.innerWidth,
        vh: window.innerHeight,
        padding,
      });
    },
    [measure, padding],
  );

  // Bei Resize wieder in den Viewport klemmen.
  useEffect(() => {
    if (!enabled) return undefined;
    const onResize = () => {
      setPosition((current) => (current ? clamp(current) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp, enabled]);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const onPointerDown = useCallback(
    (event) => {
      if (!enabled) return;
      // Buttons/Inputs im Handle nicht als Drag-Start werten.
      if (event.target.closest("button, input, select, textarea, a")) return;
      const el = elementRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dragState.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);

      const handleMove = (moveEvent) => {
        const state = dragState.current;
        if (!state || moveEvent.pointerId !== state.pointerId) return;
        state.moved = true;
        const next = {
          x: moveEvent.clientX - state.offsetX,
          y: moveEvent.clientY - state.offsetY,
        };
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          setPosition(clamp(next));
        });
      };

      const handleUp = (upEvent) => {
        const state = dragState.current;
        if (!state || upEvent.pointerId !== state.pointerId) return;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        dragState.current = null;
        setDragging(false);
        if (state.moved) {
          setPosition((current) => {
            if (current) onDragEndRef.current?.(current);
            return current;
          });
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [clamp, enabled],
  );

  return {
    position,
    setPosition,
    dragging,
    elementRef,
    dragHandleProps: enabled ? { onPointerDown, style: { touchAction: "none" } } : {},
  };
}
