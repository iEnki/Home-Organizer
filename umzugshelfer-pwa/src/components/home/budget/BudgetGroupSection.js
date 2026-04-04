import React from "react";

export default function BudgetGroupSection({
  label,
  count,
  items,
  renderItem,
}) {
  const showHeader = Boolean(label);

  return (
    <section className="space-y-2">
      {showHeader && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            {label}
          </span>
          <span className="rounded-full bg-light-border dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
            {count}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border bg-light-card dark:bg-canvas-2">
        {items.map(renderItem)}
      </div>
    </section>
  );
}
