/**
 * Semantische Tailwind-Klassen-Referenz
 * Einheitliche Token für alle Komponenten (Canvas, Text, Primär, Status)
 */
export const COLORS = {
  canvas: {
    page:     "bg-light-bg dark:bg-canvas-1",
    card:     "bg-light-card-bg dark:bg-canvas-2",
    elevated: "bg-light-surface-1 dark:bg-canvas-3",
    highest:  "bg-light-surface-2 dark:bg-canvas-4",
  },
  text: {
    primary:   "text-light-text-main dark:text-dark-text-main",
    secondary: "text-light-text-secondary dark:text-dark-text-secondary",
  },
  border: {
    default: "border-light-border dark:border-dark-border",
  },
  primary: {
    solid:   "bg-primary-500 hover:bg-primary-600 text-white",
    ghost:   "text-primary-500 hover:bg-primary-500/10",
    badge:   "bg-primary-500/10 text-primary-600 dark:text-primary-400",
    outline: "border border-primary-500/30 text-primary-500 hover:bg-primary-500/10",
  },
  secondary: {
    badge: "bg-secondary-500/10 text-secondary-600 dark:text-secondary-400",
  },
  status: {
    success: "bg-accent-success/10 text-accent-success",
    danger:  "bg-accent-danger/10 text-accent-danger",
    warning: "bg-accent-yellow/10 text-accent-yellow",
    info:    "bg-accent-info/10 text-accent-info",
  },
};

/**
 * Farben für Chart.js-Diagramme
 * Getrennte Paletten für Dark und Light Mode
 */
export const CHART_COLORS = {
  dark: {
    transport:   "rgba(139, 92, 246, 0.7)",
    material:    "rgba(16, 185, 129, 0.7)",
    verpflegung: "rgba(249, 115, 22, 0.7)",
    neueMoebel:  "rgba(139, 92, 246, 0.5)",
    kaution:     "rgba(234, 179, 8, 0.7)",
    makler:      "rgba(239, 68, 68, 0.7)",
    sonstiges:   "rgba(100, 116, 139, 0.7)",
    defaults: [
      "rgba(16, 185, 129, 0.7)",
      "rgba(6, 182, 212, 0.7)",
      "rgba(139, 92, 246, 0.7)",
      "rgba(249, 115, 22, 0.7)",
      "rgba(239, 68, 68, 0.6)",
      "rgba(234, 179, 8, 0.7)",
    ],
    tooltip: {
      bg:     "#0A141A",
      border: "#1E3A46",
      text:   "#E2E8F0",
      title:  "#94A3B8",
    },
    legend: { color: "#E2E8F0" },
    title:  { color: "#E2E8F0" },
  },
  light: {
    transport:   "rgba(124, 58, 237, 0.7)",
    material:    "rgba(5, 150, 105, 0.7)",
    verpflegung: "rgba(234, 88, 12, 0.7)",
    neueMoebel:  "rgba(124, 58, 237, 0.5)",
    kaution:     "rgba(202, 138, 4, 0.7)",
    makler:      "rgba(220, 38, 38, 0.7)",
    sonstiges:   "rgba(107, 114, 128, 0.7)",
    defaults: [
      "rgba(5, 150, 105, 0.7)",
      "rgba(8, 145, 178, 0.7)",
      "rgba(124, 58, 237, 0.7)",
      "rgba(234, 88, 12, 0.7)",
      "rgba(220, 38, 38, 0.6)",
      "rgba(202, 138, 4, 0.7)",
    ],
    tooltip: {
      bg:     "#FFFFFF",
      border: "#CBD5E1",
      text:   "#1F2937",
      title:  "#6B7280",
    },
    legend: { color: "#1F2937" },
    title:  { color: "#1F2937" },
  },
};
