import React from "react";
import { ChevronRight, Plus } from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function BudgetAccountsSummaryCard({
  konten,
  bewohnerById,
  kontoStatsById,
  monatLabel,
  onAdd,
  onEdit,
}) {
  return (
    <section className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="flex items-center justify-between gap-2 border-b border-light-border dark:border-dark-border px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            Zahlungsquellen
          </p>
          <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Konten im Budget
          </h3>
          <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Nutzung im aktuellen Monat {monatLabel}
          </p>
        </div>

        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-pill bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
        >
          <Plus size={12} />
          Konto
        </button>
      </div>

      {konten.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
          Noch keine aktiven Konten angelegt.
        </div>
      ) : (
        <div className="divide-y divide-light-border dark:divide-dark-border">
          {konten.map((konto) => {
            const inhaber = konto.inhaber_bewohner_id ? bewohnerById[konto.inhaber_bewohner_id] : null;
            const stats = kontoStatsById[konto.id] || { buchungen: 0, summe: 0 };

            return (
              <button
                key={konto.id}
                onClick={() => onEdit(konto)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-light-hover/40 dark:hover:bg-canvas-3/40"
              >
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: konto.farbe || "#10B981" }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
                    {konto.name}
                  </p>
                  <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {konto.konto_typ}
                    {inhaber ? ` · ${inhaber.name}` : konto.inhaber_typ === "household" ? " · Haushalt" : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {stats.buchungen} {stats.buchungen === 1 ? "Buchung" : "Buchungen"}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-primary-500">
                    {formatCurrency(stats.summe)}
                  </p>
                </div>

                <ChevronRight size={15} className="flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
