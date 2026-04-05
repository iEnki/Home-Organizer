import React from "react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function BudgetAccountKpiStrip({ items }) {
  if (!items?.length) return null;

  return (
    <section className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="border-b border-light-border dark:border-dark-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          Zahlungsquellen
        </p>
        <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
          Ausgaben nach Konto
        </h3>
      </div>

      <div className="flex gap-px overflow-x-auto bg-light-border dark:bg-dark-border scrollbar-hide">
        {items.map((item) => (
          <div key={item.id} className="min-w-[150px] flex-1 bg-light-card dark:bg-canvas-2 px-3 py-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.farbe || "#10B981" }}
              />
              <p className="truncate text-xs font-medium text-light-text-main dark:text-dark-text-main">
                {item.name}
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold tabular-nums text-primary-500">
              {formatCurrency(item.summe)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
