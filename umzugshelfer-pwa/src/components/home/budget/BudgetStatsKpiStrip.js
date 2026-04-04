import React from "react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function BudgetStatsKpiStrip({
  modus,
  yearStats,
  monthStats,
}) {
  const metrics = modus === "jahr"
    ? [
        { label: "Gesamt Jahr", value: formatCurrency(yearStats.total), accent: "text-red-500" },
        { label: "Kategorien aktiv", value: yearStats.aktiveKategorien, accent: "text-light-text-main dark:text-dark-text-main" },
        { label: "Durchschnitt/Monat", value: formatCurrency(yearStats.durchschnittProMonat), accent: "text-primary-500" },
      ]
    : [
        { label: "Gesamt Monat", value: formatCurrency(monthStats.total), accent: "text-red-500" },
        { label: "Kategorien aktiv", value: monthStats.aktiveKategorien, accent: "text-light-text-main dark:text-dark-text-main" },
        { label: "Groesste Kategorie", value: monthStats.groessteKategorie?.name || "-", accent: "text-primary-500" },
      ];

  return (
    <section className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-border dark:bg-dark-border sm:grid-cols-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="bg-light-card dark:bg-canvas-2 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            {metric.label}
          </p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${metric.accent}`}>
            {metric.value}
          </p>
          {modus === "monat" && metric.label === "Groesste Kategorie" && monthStats.groessteKategorie?.summe ? (
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary tabular-nums">
              {formatCurrency(monthStats.groessteKategorie.summe)}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
