import React, { useEffect, useState, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const TOOLTIP_WIDTH = 300;
const GAP = 14;
const PADDING = 8;

function getHighlightRect(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
    bottom: r.bottom + PADDING,
    right: r.right + PADDING,
  };
}

function getTooltipStyle(rect, position, tooltipEl) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipH = tooltipEl?.offsetHeight || 200;

  let effectivePosition = position;
  // Auto-flip: wenn unten kein Platz → top
  if (position === "bottom" && rect.bottom + GAP + tooltipH > vh - 20) {
    effectivePosition = "top";
  }
  // Auto-flip: wenn oben kein Platz → bottom
  if (position === "top" && rect.top - GAP - tooltipH < 20) {
    effectivePosition = "bottom";
  }

  const w = Math.min(TOOLTIP_WIDTH, vw - 24);
  let style = { width: w };

  if (effectivePosition === "bottom") {
    style.top = rect.bottom + GAP;
    style.left = Math.min(Math.max(rect.left, 12), vw - w - 12);
  } else if (effectivePosition === "top") {
    style.bottom = vh - rect.top + GAP;
    style.left = Math.min(Math.max(rect.left, 12), vw - w - 12);
  } else if (effectivePosition === "right") {
    style.top = Math.min(Math.max(rect.top, 12), vh - 200);
    style.left = Math.min(rect.right + GAP, vw - w - 12);
  } else if (effectivePosition === "left") {
    style.top = Math.min(Math.max(rect.top, 12), vh - 200);
    style.right = Math.min(vw - rect.left + GAP, vw - w - 12);
  }

  return { style, effectivePosition };
}

function getArrowClass(position) {
  if (position === "bottom") return "tour-arrow-top";
  if (position === "top") return "tour-arrow-bottom";
  if (position === "right") return "tour-arrow-left";
  if (position === "left") return "tour-arrow-right";
  return "";
}

/**
 * Interaktive Tour-Overlay-Komponente.
 * Hebt DOM-Elemente mit data-tour="..." hervor und zeigt Tooltip-Blasen.
 *
 * @param {Array} steps - Array von { target, title, text, position }
 * @param {number} schritt - Aktueller Schritt-Index
 * @param {Function} onSchritt - Setzt den Schritt-Index
 * @param {Function} onBeenden - Beendet und speichert die Tour
 */
export default function TourOverlay({ steps, schritt, onSchritt, onBeenden }) {
  const [highlightRect, setHighlightRect] = useState(null);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const [arrowClass, setArrowClass] = useState("");
  const tooltipRef = useRef(null);
  const retryRef = useRef(null);

  const aktuellerSchritt = steps[schritt];

  const positioniereElement = useCallback((el, position) => {
    const rect = getHighlightRect(el);
    setHighlightRect(rect);
    const { style, effectivePosition } = getTooltipStyle(rect, position, tooltipRef.current);
    setTooltipStyle(style);
    setArrowClass(getArrowClass(effectivePosition));
  }, []);

  const positionieren = useCallback(() => {
    if (!aktuellerSchritt) return;

    // Altes Retry abbrechen
    if (retryRef.current) {
      clearInterval(retryRef.current);
      retryRef.current = null;
    }

    const el = document.querySelector(`[data-tour="${aktuellerSchritt.target}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => positioniereElement(el, aktuellerSchritt.position));
      });
      return;
    }

    // Element nicht gefunden: Retry bis zu 10×100ms, dann Skip
    let versuche = 0;
    retryRef.current = setInterval(() => {
      versuche++;
      const elRetry = document.querySelector(`[data-tour="${aktuellerSchritt.target}"]`);
      if (elRetry) {
        clearInterval(retryRef.current);
        retryRef.current = null;
        elRetry.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => positioniereElement(elRetry, aktuellerSchritt.position));
        });
      } else if (versuche >= 10) {
        clearInterval(retryRef.current);
        retryRef.current = null;
        if (schritt < steps.length - 1) {
          onSchritt(schritt + 1);
        } else {
          onBeenden();
        }
      }
    }, 100);
  }, [aktuellerSchritt, schritt, steps.length, onSchritt, onBeenden, positioniereElement]);

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, []);

  useEffect(() => {
    positionieren();
  }, [positionieren]);

  useEffect(() => {
    const handleResize = () => positionieren();
    const handleScroll = () => positionieren();
    const handleKey = (e) => {
      if (e.key === "Escape") onBeenden();
      if (e.key === "ArrowRight" && schritt < steps.length - 1) onSchritt(schritt + 1);
      if (e.key === "ArrowLeft" && schritt > 0) onSchritt(schritt - 1);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [positionieren, onBeenden, onSchritt, schritt, steps.length]);

  if (!aktuellerSchritt) return null;

  return (
    <>
      {/* Tour-CSS */}
      <style>{`
        @keyframes tourFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .tour-arrow-top::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 20px;
          border: 8px solid transparent;
          border-bottom-color: #6366f1;
          border-top: 0;
        }
        .tour-arrow-bottom::before {
          content: "";
          position: absolute;
          bottom: -8px;
          left: 20px;
          border: 8px solid transparent;
          border-top-color: #6366f1;
          border-bottom: 0;
        }
        .tour-arrow-left::before {
          content: "";
          position: absolute;
          left: -8px;
          top: 16px;
          border: 8px solid transparent;
          border-right-color: #6366f1;
          border-left: 0;
        }
        .tour-arrow-right::before {
          content: "";
          position: absolute;
          right: -8px;
          top: 16px;
          border: 8px solid transparent;
          border-left-color: #6366f1;
          border-right: 0;
        }
      `}</style>

      {/* Dimm-Overlay (pointer-events blockieren außerhalb Highlight) */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-none"
        style={{ background: "rgba(0,0,0,0.6)" }}
      />

      {/* Highlight-Box um das Zielelement.
          key={schritt} erzwingt ein Remount bei jedem Schritt, damit keine
          CSS-Größen-/Positions-Animation von der alten Box zur neuen läuft. */}
      {highlightRect && (
        <div
          key={schritt}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            borderRadius: 10,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            border: "2px solid #6366f1",
            animation: "tourFadeIn 0.15s ease",
          }}
        />
      )}

      {/* Klick auf Overlay → Tour überspringen */}
      <div
        className="fixed inset-0 z-[9997]"
        onClick={onBeenden}
        aria-hidden="true"
      />

      {/* Tooltip-Blase */}
      <div
        key={`tip-${schritt}`}
        ref={tooltipRef}
        className={`fixed z-[10000] bg-white dark:bg-[#1e2130] border-2 border-[#6366f1] rounded-xl shadow-2xl p-4 ${arrowClass}`}
        style={{ ...tooltipStyle, maxWidth: Math.min(TOOLTIP_WIDTH, window.innerWidth - 24), animation: "tourFadeIn 0.15s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
            {aktuellerSchritt.title}
          </h3>
          <button
            onClick={onBeenden}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Tour beenden"
          >
            <X size={14} />
          </button>
        </div>

        {/* Text */}
        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
          {aktuellerSchritt.text}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {schritt + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onBeenden}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Überspringen
            </button>
            {schritt > 0 && (
              <button
                onClick={() => onSchritt(schritt - 1)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <ChevronLeft size={12} />
                Zurück
              </button>
            )}
            {schritt < steps.length - 1 ? (
              <button
                onClick={() => onSchritt(schritt + 1)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#6366f1] text-white hover:bg-[#4f46e5] transition-colors"
              >
                Weiter
                <ChevronRight size={12} />
              </button>
            ) : (
              <button
                onClick={onBeenden}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#6366f1] text-white hover:bg-[#4f46e5] transition-colors"
              >
                Fertig ✓
              </button>
            )}
          </div>
        </div>

        {/* Schritt-Punkte */}
        <div className="flex items-center justify-center gap-1 mt-3">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => onSchritt(i)}
              className={`rounded-full transition-all ${
                i === schritt
                  ? "w-4 h-1.5 bg-[#6366f1]"
                  : "w-1.5 h-1.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
