import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function BudgetStatsHeader({
  modus,
  onModusChange,
  navigatorLabel,
  onPrev,
  onNext,
}) {
  return (
    <section className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            Budget
          </p>
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Statistiken
          </h2>
        </div>

        <div className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-1">
          {[["jahr", "Jahr"], ["monat", "Monat"]].map(([value, label]) => (
            <button
              key={value}
              onClick={() => onModusChange(value)}
              className={`px-3 py-1.5 rounded-card-sm text-xs font-medium transition-colors ${
                modus === value
                  ? "bg-primary-500 text-white"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-2 py-1.5">
        <button
          onClick={onPrev}
          className="flex h-8 w-8 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
          aria-label="Vorheriger Zeitraum"
        >
          <ChevronLeft size={15} />
        </button>

        <span className="px-2 text-sm font-medium text-light-text-main dark:text-dark-text-main text-center">
          {navigatorLabel}
        </span>

        <button
          onClick={onNext}
          className="flex h-8 w-8 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
          aria-label="Naechster Zeitraum"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </section>
  );
}
