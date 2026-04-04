import React from "react";
import { ChevronRight, Plus } from "lucide-react";

export default function BudgetAccountsSection({
  konten,
  bewohnerById,
  onAdd,
  onEdit,
}) {
  return (
    <section className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="flex items-center justify-between gap-2 border-b border-light-border dark:border-dark-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Konten im Haushalt
          </h3>
          <span className="rounded-full bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
            {konten.length}
          </span>
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
          Noch keine Konten angelegt.
        </div>
      ) : (
        <div className="divide-y divide-light-border dark:divide-dark-border">
          {konten.map((konto) => {
            const inhaber = konto.inhaber_bewohner_id ? bewohnerById[konto.inhaber_bewohner_id] : null;

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
                    {inhaber ? ` · ${inhaber.name}` : ""}
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
