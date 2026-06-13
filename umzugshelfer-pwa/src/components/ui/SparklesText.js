import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * SparklesText — JS-Port des 21st.dev/Magic-UI "sparkles-text".
 * Funkelnde Sterne um einen Text; Farben default auf die App-Palette
 * (Emerald/Cyan) statt der Original-Violett/Pink-Töne.
 *
 * Props:
 *  text          – der anzuzeigende Text
 *  className     – Klassen für den Wrapper
 *  sparklesCount – Anzahl gleichzeitiger Sterne (default 6)
 *  colors        – { first, second } Hex-Farben der Sterne
 *  underline     – zeichnet die Akzentlinie unter dem Text (wie AnimatedGreeting)
 */
const SPARKLE_PATH =
  "M9.82531 0.843845C10.0553 0.215178 10.9446 0.215178 11.1746 0.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L0.843814 11.1747C0.215148 10.9447 0.215148 10.0553 0.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531 0.843845Z";

function Sparkle({ x, y, color, delay, scale }) {
  return (
    <motion.svg
      className="pointer-events-none absolute z-20"
      initial={{ opacity: 0, left: x, top: y }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, scale, 0],
        rotate: [75, 120, 150],
      }}
      transition={{ duration: 0.8, repeat: Infinity, delay }}
      width="14"
      height="14"
      viewBox="0 0 21 21"
      aria-hidden="true"
    >
      <path d={SPARKLE_PATH} fill={color} />
    </motion.svg>
  );
}

export default function SparklesText({
  text,
  className = "",
  sparklesCount = 6,
  colors = { first: "#34D399", second: "#22D3EE" },
  underline = false,
}) {
  const reduced = useReducedMotion();
  const [sparkles, setSparkles] = useState([]);

  useEffect(() => {
    if (reduced) return undefined;

    const generateStar = () => ({
      id: `${Math.random()}-${Date.now()}`,
      x: `${Math.random() * 100}%`,
      y: `${Math.random() * 100}%`,
      color: Math.random() > 0.5 ? colors.first : colors.second,
      delay: Math.random() * 2,
      scale: Math.random() * 1 + 0.3,
      lifespan: Math.random() * 10 + 5,
    });

    setSparkles(Array.from({ length: sparklesCount }, generateStar));

    const interval = setInterval(() => {
      setSparkles((current) =>
        current.map((star) =>
          star.lifespan <= 0 ? generateStar() : { ...star, lifespan: star.lifespan - 0.1 },
        ),
      );
    }, 100);

    // GPU/CPU-Budget: Funkeln läuft nur kurz nach dem Mount (= Seitenwechsel
    // dank key={text}) und stoppt dann — sonst liefen Interval + Endlos-
    // Animationen dauerhaft im Idle weiter.
    const stopTimer = setTimeout(() => {
      clearInterval(interval);
      setSparkles([]);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(stopTimer);
    };
  }, [colors.first, colors.second, sparklesCount, text, reduced]);

  const accentLine = underline ? (
    <motion.span
      aria-hidden="true"
      className="absolute bottom-0 left-0 h-[2px] w-full rounded-pill
                 bg-gradient-to-r from-primary-500 via-secondary-400 to-transparent"
      style={{
        transformOrigin: "left center",
        boxShadow: "0 0 8px rgba(6, 182, 212, 0.45)",
      }}
      initial={reduced ? false : { scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 0.7 }}
      transition={{ duration: 0.9, delay: 0.35, ease: "easeOut" }}
    />
  ) : null;

  if (reduced) {
    return (
      <span className={`relative inline-block ${underline ? "pb-1" : ""} ${className}`}>
        {text}
        {accentLine}
      </span>
    );
  }

  return (
    <span className={`relative inline-block ${underline ? "pb-1" : ""} ${className}`}>
      {sparkles.map((sparkle) => (
        <Sparkle key={sparkle.id} {...sparkle} />
      ))}
      {text}
      {accentLine}
    </span>
  );
}
