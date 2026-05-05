import React from "react";
import { Plus } from "lucide-react";
import BudgetGoalRow from "./BudgetGoalRow";

export default function BudgetGoalsList({
  groups,
  today,
  onCreate,
  onEdit,
  onDelete,
  onDeposit,
}) {
  const nonEmptyGroups = groups.filter((group) => group.items.length > 0);
  let globalIndex = 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border px-4 py-3 shadow-elevation-1 dark:shadow-elevation-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-3.5 w-0.5 rounded-full bg-primary-500" />
            <p className="text-[11px] uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary font-medium">
              Sparen
            </p>
          </div>
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Sparziele
          </h2>
        </div>

        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors active:scale-95"
          style={{ boxShadow: "0 0 12px rgba(16,185,129,0.3)" }}
        >
          <Plus size={14} />
          Sparziel
        </button>
      </div>

      {/* Empty state */}
      {nonEmptyGroups.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 py-16 text-center animate-fade-in">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-light-bg dark:bg-canvas-3">
            <span className="text-2xl">🎯</span>
          </div>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Noch keine Sparziele angelegt
          </p>
        </div>
      ) : (
        nonEmptyGroups.map((group) => (
          <section key={group.key} className="space-y-2">
            {/* Group header */}
            <div className="flex items-center gap-2 px-1">
              <div className="h-3 w-0.5 rounded-full bg-primary-500/60" />
              <span className="text-xs font-semibold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">
                {group.label}
              </span>
              <span className="rounded-pill bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-medium">
                {group.items.length}
              </span>
            </div>

            {/* Goal cards */}
            <div className="space-y-2">
              {group.items.map((item) => {
                const idx = globalIndex++;
                return (
                  <BudgetGoalRow
                    key={item.ziel.id}
                    ziel={item.ziel}
                    meta={item.meta}
                    today={today}
                    index={idx}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDeposit={onDeposit}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
