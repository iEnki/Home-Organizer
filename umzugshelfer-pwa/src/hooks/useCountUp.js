import { useEffect, useRef, useState } from "react";

export function useCountUp(target, duration = 600) {
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const safeDuration = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
  const [val, setVal] = useState(safeTarget);
  const valueRef = useRef(safeTarget);

  useEffect(() => {
    valueRef.current = val;
  }, [val]);

  useEffect(() => {
    if (safeDuration === 0 || valueRef.current === safeTarget) {
      setVal(safeTarget);
      return;
    }
    const from = valueRef.current;
    const start = performance.now();
    let rafId;
    const tick = (now) => {
      const t = Math.min((now - start) / safeDuration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(from + ((safeTarget - from) * ease));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [safeDuration, safeTarget]);

  return val;
}
