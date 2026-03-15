/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  safelist: [
    "bg-blue-500/30", "text-blue-300",
    "bg-indigo-500/30", "text-indigo-300",
    "bg-green-500/30", "text-green-300",
    "bg-pink-500/30", "text-pink-300",
    "bg-purple-500/30", "text-purple-300",
    "bg-yellow-500/30", "text-yellow-300",
    "bg-amber-500/40", "text-amber-200",
    "bg-teal-500/30", "text-teal-300",
    "bg-red-500/30", "text-red-300",
    "bg-orange-500/30", "text-orange-300",
    "bg-lime-500/30", "text-lime-300",
    "bg-sky-600/40", "text-sky-200",
  ],
  theme: {
    extend: {
      colors: {
        // ── Primary Palette: Emerald / Teal ─────────────────────────────
        primary: {
          50:  "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",  // main: buttons, active states, brand
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#022C22",
        },

        // ── Secondary Palette: Cyan / Sky ────────────────────────────────
        secondary: {
          50:  "#ECFEFF",
          100: "#CFFAFE",
          200: "#A5F3FC",
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",  // focus rings, progress, glows
          600: "#0891B2",
          700: "#0E7490",
          800: "#155E75",
          900: "#164E63",
          950: "#083344",
        },

        // ── Canvas Scale: Deep Dark Backgrounds ─────────────────────────
        "canvas-0": "#020608",   // deepest / vignette
        "canvas-1": "#061015",   // page background (dark)
        "canvas-2": "#0A141A",   // card / panel background (dark)
        "canvas-3": "#0E1B22",   // elevated surface (dark)
        "canvas-4": "#13232B",   // highest elevation (dark)

        // ── Light Surface Scale ──────────────────────────────────────────
        "light-surface":   "#F7FAFC",
        "light-surface-1": "#F1F5F9",
        "light-surface-2": "#E8EEF2",

        // ── Accent Colors ────────────────────────────────────────────────
        "accent-warm":    "#F97316",   // orange highlights
        "accent-yellow":  "#F59E0B",   // amber warnings
        "accent-info":    "#38BDF8",   // sky blue info
        "accent-success": "#22C55E",   // bright green success
        "accent-orange":  "#FB923C",   // softer orange
        "accent-danger":  "#FB7185",   // rose danger

        // ── Backward-Compatible Aliases ──────────────────────────────────
        // These map all old token names to new system values so the 40+
        // existing components continue to work without any changes.

        // Dark tokens → new canvas / primary values
        "dark-bg":             "#061015",  // was #111827 → canvas-1
        "dark-card-bg":        "#0A141A",  // was #1f2937 → canvas-2
        "dark-card":           "#0A141A",  // was undefined → canvas-2
        "dark-hover":          "#0E1B22",  // was undefined → canvas-3
        "dark-text-main":      "#E2E8F0",  // was #e5e7eb → soft slate-200
        "dark-text-secondary": "#94A3B8",  // was #9ca3af → slate-400
        "dark-accent-green":   "#10B981",  // was #2ecc71 → primary-500
        "dark-accent-purple":  "#8B5CF6",  // unchanged violet-500
        "dark-accent-orange":  "#F97316",  // → accent-warm
        "dark-border":         "#1E3A46",  // was #374151 → teal-tinted border

        // Light tokens → new surface values
        "light-bg":            "#F7FAFC",  // → light-surface
        "light-card-bg":       "#FFFFFF",  // unchanged
        "light-card":          "#FFFFFF",  // was undefined
        "light-hover":         "#F1F5F9",  // was undefined → light-surface-1
        "light-text-main":     "#1F2937",  // unchanged gray-800
        "light-text-secondary":"#6B7280",  // unchanged gray-500
        "light-accent-green":  "#10B981",  // → primary-500 (unified)
        "light-accent-purple": "#8B5CF6",  // unchanged violet-500
        "light-accent-orange": "#F59E0B",  // → accent-yellow
        "light-border":        "#CBD5E1",  // was #d1d5db → slight blue tint

        // Legacy globals
        "primary-dark":        "#059669",  // → primary-600
        "accent":              "#10B981",  // → primary-500
        "danger-color":        "#FB7185",  // → accent-danger
        "danger-color-dark":   "#F43F5E",  // deeper rose
        "info-blue":           "#38BDF8",  // → accent-info
        "prio-high":           "#FB7185",
        "prio-medium":         "#F59E0B",
        "prio-low":            "#38BDF8",

        // Legacy neutral tokens (kept for safety)
        "neutral-light":  "#ecf0f1",
        "neutral-medium": "#bdc3c7",
        "neutral-dark":   "#95a5a6",
      },

      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },

      borderRadius: {
        card:           "24px",   // premium large cards (was 12px)
        "card-sm":      "16px",   // inner nested cards / rows
        "sidebar-tile": "14px",   // sidebar icon tiles
        pill:           "9999px", // full pill buttons / badges
        xl:             "12px",   // general rounded (alias for rounded-xl)
      },

      boxShadow: {
        // Existing (kept for backward-compat)
        card:        "0 4px 12px rgba(0, 0, 0, 0.08)",
        "card-hover":"0 6px 16px rgba(0, 0, 0, 0.12)",
        button:      "0 2px 8px rgba(0,0,0,0.1)",

        // New elevation shadows (neutral)
        "elevation-1": "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        "elevation-2": "0 4px 16px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)",
        "elevation-3": "0 8px 32px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.35)",

        // Colored glow shadows
        "glow-primary":   "0 0 24px rgba(16,185,129,0.25), 0 0 8px rgba(16,185,129,0.15)",
        "glow-secondary": "0 0 24px rgba(6,182,212,0.25), 0 0 8px rgba(6,182,212,0.15)",
        "glow-accent":    "0 0 16px rgba(249,115,22,0.2)",
        "inner-glow":     "inset 0 1px 0 rgba(255,255,255,0.05)",
        "sidebar-active": "0 4px 12px rgba(16,185,129,0.3), 0 2px 4px rgba(0,0,0,0.4)",
      },

      animation: {
        "pulse-once":    "pulse-once 1s ease-out forwards",
        "fade-in":       "fade-in 200ms ease-out",
        "slide-in-left": "slide-in-left 250ms cubic-bezier(0.22,1,0.36,1)",
        "slide-in-up":   "slide-in-up 200ms ease-out",
        "check-pop":     "check-pop 0.35s cubic-bezier(0.22,1,0.36,1) forwards",
        "shimmer":       "shimmer 1.5s linear infinite",
      },

      keyframes: {
        "pulse-once": {
          "0%":   { opacity: "0.5", transform: "scale(0.95)" },
          "50%":  { opacity: "1",   transform: "scale(1.02)" },
          "100%": { opacity: "1",   transform: "scale(1)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-left": {
          "0%":   { transform: "translateX(-16px)", opacity: "0" },
          "100%": { transform: "translateX(0)",     opacity: "1" },
        },
        "slide-in-up": {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
        "check-pop": {
          "0%":   { transform: "scale(0) rotate(-10deg)", opacity: "0" },
          "60%":  { transform: "scale(1.25) rotate(5deg)" },
          "100%": { transform: "scale(1) rotate(0deg)",   opacity: "1" },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
