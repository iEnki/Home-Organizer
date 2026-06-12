import React from "react";
import { Plus } from "lucide-react";
import BudgetGoalRow from "./BudgetGoalRow";
import GlassSurface from "../../ui/GlassSurface";

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
      <GlassSurface interactive={false} className="flex items-center justify-between gap-3 px-4 py-3">
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
      </GlassSurface>

      {/* Empty state */}
      {nonEmptyGroups.length === 0 ? (
        <GlassSurface interactive={false} className="flex flex-col items-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-light-bg dark:bg-canvas-3">
            <span className="text-2xl">🎯</span>
          </div>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Noch keine Sparziele angelegt
          </p>
        </GlassSurface>
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
