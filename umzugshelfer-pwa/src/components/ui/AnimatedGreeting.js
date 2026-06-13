import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * AnimatedGreeting — adaptiert vom 21st.dev "Samsung Hello"-Texteffekt
 * (Samsung Bold Tech Style). Das Original animiert hartkodierte SVG-Pfade
 * für "hello"; hier übertragen auf dynamischen Text: Buchstaben federn
 * gestaffelt mit scale/rotateY herein (initial wie im Original:
 * opacity 0, scale 0.7, rotateY -15), danach zeichnet sich eine
 * Cyan-Akzentlinie wie die "futuristic accent lines" des Effekts.
 *
 * Wichtig: Der Farbverlauf läuft pro Buchstabe über color-mix
 * (CSS-Klassen .animated-greeting / .greeting-letter in index.css) —
 * NICHT über bg-clip-text auf dem Parent, denn transformierte
 * Kind-Elemente bilden eigene Stacking-Contexts, auf die das
 * Background-Clipping nicht durchgreift (Buchstaben wären während
 * der Animation unsichtbar).
 *
 * Props:
 *  text      – der anzuzeigende Text (re-animiert bei Änderung via key)
 *  className – zusätzliche Klassen für den Wrapper
 */
const LETTER_INITIAL = { opacity: 0, scale: 0.7, rotateY: -15, y: 8 };
const LETTER_ANIMATE = { opacity: 1, scale: 1, rotateY: 0, y: 0 };

export default function AnimatedGreeting({ text, className = "" }) {
  const reduced = useReducedMotion();
  const letters = Array.from(text);
  const mixFor = (i) =>
    letters.length > 1 ? Math.round((i / (letters.length - 1)) * 100) : 0;

  if (reduced) {
    return (
      <span className={`animated-greeting ${className}`} aria-label={text}>
        <span aria-hidden="true">
          {letters.map((ch, i) => (
            <span key={`${i}-${ch}`} className="greeting-letter" style={{ "--greet-mix": mixFor(i) }}>
              {ch === " " ? " " : ch}
            </span>
          ))}
        </span>
      </span>
    );
  }

  const lineDelay = 0.25 + letters.length * 0.045;

  return (
    <span
      key={text}
      className={`animated-greeting relative inline-block pb-1 ${className}`}
      style={{ perspective: 600 }}
      aria-label={text}
    >
      <span aria-hidden="true">
        {letters.map((ch, i) => (
          <motion.span
            key={`${i}-${ch}`}
            className="greeting-letter inline-block"
            style={{ "--greet-mix": mixFor(i) }}
            initial={LETTER_INITIAL}
            animate={LETTER_ANIMATE}
            transition={{
              delay: 0.15 + i * 0.045,
              type: "spring",
              stiffness: 280,
              damping: 20,
              opacity: { duration: 0.3, delay: 0.15 + i * 0.045 },
            }}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        ))}
      </span>

      {/* Tech-Akzentlinie — zeichnet sich nach den Buchstaben von links */}
      <motion.span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[2px] w-full rounded-pill
                   bg-gradient-to-r from-primary-500 via-secondary-400 to-transparent"
        style={{
          transformOrigin: "left center",
          boxShadow: "0 0 8px rgba(6, 182, 212, 0.45)",
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.7 }}
        transition={{ duration: 0.9, delay: lineDelay, ease: "easeOut" }}
      />
    </span>
  );
}
