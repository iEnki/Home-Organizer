import { useEffect, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";

// Emerald/Teal hue range to match app primary colors (#10B981, #06B6D4)
function createBeam(width, height) {
  const angle = -35 + Math.random() * 10;
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.10 + Math.random() * 0.14,
    hue: 155 + Math.random() * 60, // emerald (155°) → cyan (215°)
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

const opacityMap = { subtle: 0.65, medium: 0.82, strong: 1.0 };

// GPU-Budget: Der Canvas ist stark geblurrt, daher reicht eine sehr niedrige
// interne Auflösung (RENDER_SCALE statt devicePixelRatio) und 30 FPS völlig.
// Die Weichzeichnung kommt ausschließlich vom CSS-Blur des Canvas-Elements —
// ein einzelner Compositor-Blur statt ctx.filter pro Beam-Draw.
const RENDER_SCALE = 0.4;
const FRAME_INTERVAL_MS = 33; // ~30 FPS
const TOTAL_BEAMS = 16;

export function BeamsBackground({ intensity = "strong" }) {
  const canvasRef = useRef(null);
  const beamsRef = useRef([]);
  const animationFrameRef = useRef(0);
  const { theme } = useTheme();
  const isDarkRef = useRef(theme === "dark");

  useEffect(() => {
    isDarkRef.current = theme === "dark";
    if (canvasRef.current) {
      canvasRef.current.style.filter = `blur(${isDarkRef.current ? 24 : 12}px)`;
    }
  }, [theme]);

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateCanvasSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width  = Math.max(1, Math.round(w * RENDER_SCALE));
      canvas.height = Math.max(1, Math.round(h * RENDER_SCALE));
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      // Zeichenkoordinaten bleiben in CSS-Pixeln
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);

      beamsRef.current = Array.from({ length: TOTAL_BEAMS }, () => createBeam(w, h));
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    function resetBeam(beam, index, totalBeams) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const column = index % 3;
      const spacing = w / 3;

      beam.y       = h + 100;
      beam.x       = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
      beam.width   = 100 + Math.random() * 100;
      beam.speed   = 0.5 + Math.random() * 0.4;
      beam.hue     = 155 + (index * 60) / totalBeams;
      beam.opacity = 0.15 + Math.random() * 0.10;
      return beam;
    }

    function drawBeam(beam) {
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);

      const isDark = isDarkRef.current;
      const lightness = isDark ? 62 : 40;
      const opacityMultiplier = isDark ? 1 : 2.2;
      const pulsedOpacity =
        beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[intensity] * opacityMultiplier;

      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      gradient.addColorStop(0,   `hsla(${beam.hue}, 90%, ${lightness}%, 0)`);
      gradient.addColorStop(0.1, `hsla(${beam.hue}, 90%, ${lightness}%, ${pulsedOpacity * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${beam.hue}, 90%, ${lightness}%, ${pulsedOpacity})`);
      gradient.addColorStop(0.6, `hsla(${beam.hue}, 90%, ${lightness}%, ${pulsedOpacity})`);
      gradient.addColorStop(0.9, `hsla(${beam.hue}, 90%, ${lightness}%, ${pulsedOpacity * 0.5})`);
      gradient.addColorStop(1,   `hsla(${beam.hue}, 90%, ${lightness}%, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    }

    let lastFrameTs = 0;

    function animate(ts) {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Auf ~30 FPS drosseln
      if (ts - lastFrameTs < FRAME_INTERVAL_MS) return;
      // Zeitbasierte Bewegung, damit das Tempo unabhängig von der Framerate bleibt
      const dt = lastFrameTs ? Math.min(ts - lastFrameTs, 100) : FRAME_INTERVAL_MS;
      lastFrameTs = ts;
      const step = dt / 16.67;

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const totalBeams = beamsRef.current.length;
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed * step;
        beam.pulse += beam.pulseSpeed * step;
        if (beam.y + beam.length < -100) {
          resetBeam(beam, index, totalBeams);
        }
        drawBeam(beam);
      });
    }

    const start = () => {
      if (!animationFrameRef.current) {
        lastFrameTs = 0;
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    const stop = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
    };

    // Bei verstecktem Tab komplett pausieren
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    start();

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, filter: "blur(24px)" }}
      />
      {/* Statische Tiefen-Vignette — ersetzt das frühere animierte
          backdrop-filter-Overlay (Vollbild-Blur pro Frame war der
          teuerste GPU-Posten der App) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 90% at 50% 10%, rgba(2,6,8,0) 55%, rgba(2,6,8,0.10) 100%)",
        }}
      />
    </div>
  );
}

export default BeamsBackground;
