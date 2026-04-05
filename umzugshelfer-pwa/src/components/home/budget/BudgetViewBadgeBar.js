import React from "react";
import { Bookmark, Star } from "lucide-react";

export default function BudgetViewBadgeBar({
  activeView,
  isCustom,
  onOpenViews,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main min-w-0">
        <Bookmark size={14} className="text-primary-500 shrink-0" />
        <span className="text-light-text-secondary dark:text-dark-text-secondary shrink-0">
          Ansicht:
        </span>
        <span className="font-medium truncate">
          {isCustom || !activeView ? "Benutzerdefiniert" : activeView.name}
        </span>
      </span>

      {!isCustom && activeView?.is_default && (
        <span className="inline-flex items-center gap-1 rounded-pill border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-300">
          <Star size={11} />
          Standard
        </span>
      )}

      {typeof onOpenViews === "function" && (
        <button
          onClick={onOpenViews}
          className="ml-auto rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs font-medium text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
        >
          Ansichten
        </button>
      )}
    </div>
  );
}
