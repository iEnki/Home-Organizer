import React from "react";

export default function BudgetAccountBadge({
  konto,
  compact = false,
}) {
  if (!konto?.name) return null;

  return (
    <span
      title={konto.konto_typ || konto.name}
      className={`inline-flex items-center gap-1 rounded-pill border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-secondary dark:text-dark-text-secondary ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      }`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: konto.farbe || "#10B981" }}
      />
      <span className="truncate">{konto.name}</span>
    </span>
  );
}
