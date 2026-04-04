import React from "react";
import { RefreshCw } from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(value || 0)));

export default function BudgetCashflowList({ items, total, count }) {
  return (
    <section className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="flex items-center justify-between gap-2 border-b border-light-border dark:border-dark-border px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            Vorschau
          </p>
          <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Cashflow - Naechste 30 Tage
          </h3>
        </div>
        <span className="rounded-full bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
          Keine faelligen Zahlungen
        </div>
      ) : (
        <>
          <div className="divide-y divide-light-border dark:divide-dark-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-20 flex-shrink-0 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {item.naechstes_datum}
                </span>
                <span className="min-w-0 flex-1 truncate text-light-text-main dark:text-dark-text-main">
                  {item.beschreibung}
                </span>
                <RefreshCw size={11} className="flex-shrink-0 text-secondary-400" />
                <span className="flex-shrink-0 font-medium tabular-nums text-red-500">
                  {formatCurrency(item.betrag)}
                </span>
              </div>
            ))}
          </div>

          {count > 1 ? (
            <div className="flex items-center justify-between border-t border-light-border dark:border-dark-border px-4 py-3 text-sm">
              <span className="text-light-text-secondary dark:text-dark-text-secondary">Gesamt 30 Tage</span>
              <span className="font-semibold tabular-nums text-red-500">{formatCurrency(total)}</span>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
