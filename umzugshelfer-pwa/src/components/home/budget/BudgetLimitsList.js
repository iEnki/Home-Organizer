import React from "react";
import BudgetLimitRow from "./BudgetLimitRow";

export default function BudgetLimitsList({
  monatLabel,
  rows,
  limitsEdit,
  onStartEdit,
  onChangeEdit,
  onSave,
  onCancel,
}) {
  const mitLimit = rows.filter((row) => row.limitEuro > 0).length;
  const ueberschritten = rows.filter((row) => row.status === "ueberschritten").length;

  return (
    <section className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="border-b border-light-border dark:border-dark-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
              Budget
            </p>
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Monatliche Limits
            </h2>
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {monatLabel}
            </p>
          </div>

          <div className="flex gap-2">
            <span className="rounded-full bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
              Mit Limit {mitLimit}
            </span>
            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">
              Ueberschritten {ueberschritten}
            </span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-light-border dark:divide-dark-border">
        {rows.map((row) => (
          <BudgetLimitRow
            key={row.kategorie}
            row={row}
            isEditing={row.kategorie in limitsEdit}
            editValue={limitsEdit[row.kategorie] ?? ""}
            onStartEdit={() => onStartEdit(row.kategorie, row.limitEuro)}
            onChangeEdit={(value) => onChangeEdit(row.kategorie, value)}
            onSave={() => onSave(row.kategorie, limitsEdit[row.kategorie])}
            onCancel={() => onCancel(row.kategorie)}
          />
        ))}
      </div>
    </section>
  );
}
