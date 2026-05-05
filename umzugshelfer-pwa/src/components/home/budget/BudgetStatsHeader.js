import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function BudgetStatsHeader({
  modus,
  onModusChange,
  navigatorLabel,
  onPrev,
  onNext,
}) {
  const { t } = useTranslation(["budget"]);

  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Period navigator */}
      <div className="flex items-center gap-1 rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border px-2 py-1 shadow-elevation-1 dark:shadow-elevation-1">
        <button
          onClick={onPrev}
          className="flex h-8 w-8 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:bg-primary-500/10 transition-colors duration-150"
          aria-label={t("budget:period.previous")}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="min-w-[9rem] px-2 text-center text-sm font-semibold text-light-text-main dark:text-dark-text-main tabular-nums">
          {navigatorLabel}
        </span>
        <button
          onClick={onNext}
          className="flex h-8 w-8 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:bg-primary-500/10 transition-colors duration-150"
          aria-label={t("budget:period.next")}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Mode toggle pill */}
      <div className="inline-flex self-start sm:self-auto items-center gap-1 rounded-pill bg-light-bg dark:bg-canvas-3 border border-light-border dark:border-dark-border p-1">
        {[["jahr", t("budget:period.year")], ["monat", t("budget:period.month")]].map(([value, label]) => (
          <button
            key={value}
            onClick={() => onModusChange(value)}
            className={`rounded-pill px-4 py-1.5 text-xs font-medium transition-all duration-200 ${
              modus === value
                ? "bg-primary-500 text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
            style={modus === value ? { boxShadow: "0 0 12px rgba(16,185,129,0.35)" } : {}}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
