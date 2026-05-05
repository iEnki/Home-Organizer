import { useState, useEffect } from "react";

export function useCountUp(target, duration = 600) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setVal(0);
      return;
    }
    const start = performance.now();
    let rafId;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(target * ease);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return val;
}
