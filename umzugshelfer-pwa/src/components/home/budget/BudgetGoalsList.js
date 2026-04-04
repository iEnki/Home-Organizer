import React from "react";
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            Sparen
          </p>
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            Sparziele
          </h2>
        </div>

        <button
          onClick={onCreate}
          className="rounded-pill bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          Sparziel
        </button>
      </div>

      {nonEmptyGroups.length === 0 ? (
        <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 py-12 text-center text-light-text-secondary dark:text-dark-text-secondary">
          Noch keine Sparziele angelegt
        </div>
      ) : (
        nonEmptyGroups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                {group.label}
              </span>
              <span className="rounded-full bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                {group.items.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 divide-y divide-light-border dark:divide-dark-border">
              {group.items.map((item) => (
                <BudgetGoalRow
                  key={item.ziel.id}
                  ziel={item.ziel}
                  meta={item.meta}
                  today={today}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDeposit={onDeposit}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
