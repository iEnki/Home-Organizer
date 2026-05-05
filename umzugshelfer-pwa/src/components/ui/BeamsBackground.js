import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
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

export function BeamsBackground({ intensity = "strong" }) {
  const canvasRef = useRef(null);
  const beamsRef = useRef([]);
  const animationFrameRef = useRef(0);
  const MINIMUM_BEAMS = 20;
  const { theme } = useTheme();
  const isDarkRef = useRef(theme === "dark");

  useEffect(() => {
    isDarkRef.current = theme === "dark";
    if (canvasRef.current) {
      canvasRef.current.style.filter = `blur(${isDarkRef.current ? 15 : 8}px)`;
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
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);

      const totalBeams = Math.ceil(MINIMUM_BEAMS * 1.5);
      beamsRef.current = Array.from({ length: totalBeams }, () => createBeam(w, h));
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

    function animate() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);
      ctx.filter = `blur(${isDarkRef.current ? 35 : 18}px)`;

      const totalBeams = beamsRef.current.length;
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;
        if (beam.y + beam.length < -100) {
          resetBeam(beam, index, totalBeams);
        }
        drawBeam(beam);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
        style={{ position: "absolute", inset: 0, filter: "blur(15px)" }}
      />
      {/* Subtle pulsing depth overlay */}
      <motion.div
        style={{ position: "absolute", inset: 0, backdropFilter: "blur(40px)" }}
        animate={{ opacity: [0.04, 0.12, 0.04] }}
        transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
      />
    </div>
  );
}

export default BeamsBackground;
