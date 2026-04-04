import React from "react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function BudgetKpiStrip({
  haushaltSumme,
  privatSumme,
  anzahl,
}) {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="px-3 py-3 border-r border-light-border dark:border-dark-border">
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          Haushalt
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-red-500">
          {formatCurrency(haushaltSumme)}
        </p>
      </div>

      <div className="px-3 py-3 border-r border-light-border dark:border-dark-border">
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          Privat
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-amber-500">
          {formatCurrency(privatSumme)}
        </p>
      </div>

      <div className="px-3 py-3">
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          Buchungen
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-light-text-main dark:text-dark-text-main">
          {anzahl}
        </p>
      </div>
    </div>
  );
}
