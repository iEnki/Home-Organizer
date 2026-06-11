import { useRef, useEffect } from "react";

/**
 * Animated scanner background — canvas 2D, PWA-friendly (no Three.js).
 * Draws a moving scan line, floating particles, and a subtle grid.
 *
 * Props:
 *   isScanning — when true the scan line sweeps faster and particles increase
 */
export default function ScannerBg({ isScanning = false }) {
  const canvasRef  = useRef(null);
  const stateRef   = useRef({ isScanning });

  useEffect(() => {
    stateRef.current.isScanning = isScanning;
  }, [isScanning]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let raf;
    // Logical pixel dimensions (independent of dpr)
    let W = 0;
    let H = 0;

    // ── Resize: use getBoundingClientRect for reliable dimensions ────────────
    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      W = rect.width  || window.innerWidth;
      H = rect.height || window.innerHeight;

      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      // setTransform resets any prior scale — call once, not cumulative
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // ── Particles ─────────────────────────────────────────────────────────────
    const mkParticle = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     Math.random() * (H || window.innerHeight),
      vx:    (Math.random() - 0.5) * 0.3,
      vy:    -(Math.random() * 0.5 + 0.08),
      alpha: Math.random() * 0.45 + 0.08,
      size:  Math.random() * 1.6 + 0.4,
      hue:   155 + Math.random() * 60,   // emerald → cyan
    });

    let particles = [];

    // Initialise after one rAF so the DOM has painted and getBCR gives real values
    const init = () => {
      resize();
      particles = Array.from({ length: 70 }, mkParticle);
      window.addEventListener("resize", resize);
      raf = requestAnimationFrame(draw);
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let scanY = -1; // sentinel — initialised on first draw
    let time  = 0;

    // ── Draw loop ─────────────────────────────────────────────────────────────
    function draw() {
      const scanning = stateRef.current.isScanning;

      if (W === 0 || H === 0) { raf = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, W, H);

      // ── Grid ────────────────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(16,185,129,0.05)";
      ctx.lineWidth   = 0.5;
      const g = 44;
      for (let x = 0; x < W; x += g) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += g) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Particles ───────────────────────────────────────────────────────────
      const target = scanning ? 120 : 70;
      while (particles.length < target) particles.push(mkParticle());
      while (particles.length > target) particles.pop();

      ctx.save();
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10 || p.x < -10 || p.x > W + 10) {
          particles[i] = { ...mkParticle(), y: H + 10 };
        }
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = `hsl(${p.hue},80%,62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // ── Scan line ────────────────────────────────────────────────────────────
      if (scanY < 0) scanY = H * 0.5;

      if (scanning) {
        scanY += 2.4;
        if (scanY > H + 8) scanY = -8;
      } else {
        // Slow sine oscillation when idle
        scanY = H * 0.5 + Math.sin(time * 0.45) * H * 0.3;
      }

      const lineAlpha = scanning ? 0.9 : 0.45;

      // Soft aura behind the line
      const aura = ctx.createLinearGradient(0, scanY - 22, 0, scanY + 22);
      aura.addColorStop(0,   "rgba(0,0,0,0)");
      aura.addColorStop(0.5, `rgba(16,185,129,${lineAlpha * 0.16})`);
      aura.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(0, scanY - 22, W, 44);

      // The glowing line
      ctx.save();
      ctx.shadowColor = "#10B981";
      ctx.shadowBlur  = scanning ? 22 : 10;

      const line = ctx.createLinearGradient(0, 0, W, 0);
      line.addColorStop(0,    "rgba(0,0,0,0)");
      line.addColorStop(0.08, `rgba(16,185,129,${lineAlpha})`);
      line.addColorStop(0.5,  `rgba(6,182,212,${lineAlpha})`);
      line.addColorStop(0.92, `rgba(16,185,129,${lineAlpha})`);
      line.addColorStop(1,    "rgba(0,0,0,0)");

      ctx.fillStyle = line;
      ctx.fillRect(0, scanY - 1, W, scanning ? 2.5 : 1.5);
      ctx.restore();

      // Tick marks when actively scanning
      if (scanning) {
        ctx.save();
        ctx.fillStyle   = "rgba(16,185,129,0.55)";
        ctx.globalAlpha = 1;
        for (let x = 0; x < W; x += 18) {
          const len = x % 90 === 0 ? 7 : 3;
          ctx.fillRect(x, scanY - len, 1, len * 2);
        }
        ctx.restore();
      }

      time += 0.016;
      raf = requestAnimationFrame(draw);
    }

    requestAnimationFrame(init);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:       "absolute",
        inset:          0,
        width:          "100%",
        height:         "100%",
        pointerEvents:  "none",
        display:        "block",
      }}
    />
  );
}
