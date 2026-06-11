import React, { useMemo, useState, useEffect } from "react";
import { CheckCircle2, CircleAlert, PackageCheck, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";

const STATUS_ICON = {
  missing: ShoppingCart,
  uncertain: CircleAlert,
  available: PackageCheck,
  existing: CheckCircle2,
};

export default function RecipeShoppingPreviewModal({
  open,
  title,
  preview,
  selectedIds = [],
  busy = false,
  onSelectionChange,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation("recipes");
  const [localSelected, setLocalSelected] = useState(new Set(selectedIds));

  useEffect(() => {
    setLocalSelected(new Set(selectedIds));
  }, [selectedIds, open]);

  const items = preview?.items || [];
  const grouped = preview?.grouped || {};
  const selectableCount = items.filter((item) => item.status === "missing" || item.status === "uncertain").length;
  const selectedCount = localSelected.size;

  const groups = useMemo(() => ([
    ["missing", t("shoppingPreview.groups.missing")],
    ["uncertain", t("shoppingPreview.groups.uncertain")],
    ["available", t("shoppingPreview.groups.available")],
    ["existing", t("shoppingPreview.groups.existing")],
  ]), [t]);

  const toggle = (id) => {
    const next = new Set(localSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocalSelected(next);
    onSelectionChange?.(Array.from(next));
  };

  return (
    <ModalShell
      open={open}
      title={title || t("shoppingPreview.title")}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {t("shoppingPreview.selected", { selected: selectedCount, total: selectableCount })}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main">
              {t("shoppingPreview.cancel")}
            </button>
            <button
              type="button"
              onClick={() => onConfirm?.(Array.from(localSelected))}
              disabled={busy || selectedCount === 0}
              className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("shoppingPreview.adding") : t("shoppingPreview.add")}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {items.length === 0 && (
          <p className="rounded-card-sm border border-light-border p-4 text-sm text-light-text-secondary dark:border-dark-border dark:text-dark-text-secondary">
            {t("shoppingPreview.empty")}
          </p>
        )}
        {groups.map(([status, label]) => {
          const groupItems = grouped[status] || [];
          if (groupItems.length === 0) return null;
          const Icon = STATUS_ICON[status] || ShoppingCart;
          const selectable = status === "missing" || status === "uncertain";
          return (
            <section key={status} className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                <Icon size={15} className={status === "uncertain" ? "text-amber-500" : "text-primary-500"} />
                {label}
                <span className="text-xs font-normal text-light-text-secondary dark:text-dark-text-secondary">{groupItems.length}</span>
              </h4>
              <div className="divide-y divide-light-border overflow-hidden rounded-card-sm border border-light-border dark:divide-dark-border dark:border-dark-border">
                {groupItems.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 bg-light-card px-3 py-2 text-sm dark:bg-canvas-2">
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={localSelected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        className="h-4 w-4 rounded border-light-border text-primary-500"
                      />
                    ) : (
                      <span className="h-4 w-4" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-light-text-main dark:text-dark-text-main">{item.name}</span>
                      <span className="block truncate text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {[item.amountText, item.recipeTitle].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-pill bg-light-bg px-2 py-0.5 text-[10px] text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary">
                      {item.category}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ModalShell>
  );
}
