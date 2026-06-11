import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Palette, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModalShell from "../../ui/ModalShell";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

const INPUT_CLS =
  "w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

export default function BudgetCategoryManagerModal({
  open,
  onClose,
  categories = [],
  onCreate,
  onMove,
  onChangeColor,
  onDelete,
  canDelete,
}) {
  const { t, i18n } = useTranslation(["budget", "common"]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");
  const [submitting, setSubmitting] = useState(false);

  const activeCategories = useMemo(
    () => (categories || []).filter((entry) => entry.is_active !== false),
    [categories],
  );

  const handleCreate = async () => {
    if (!onCreate) return;
    setSubmitting(true);
    try {
      const created = await onCreate({ name: newName, color: newColor });
      if (created) {
        setNewName("");
        setNewColor("#6B7280");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderCategoryRow = (entry, index, siblings) => (
    <div
      key={entry.id || entry.name}
      className="flex flex-wrap items-center gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: entry.color }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
            {getHomeBudgetCategoryLabel(entry.name, i18n.language)}
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {entry.is_active === false ? t("common:status.inactive") : t("common:status.active")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
          <Palette size={12} />
          <input
            type="color"
            value={entry.color || "#6B7280"}
            onChange={(event) => onChangeColor?.(entry, event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-light-border dark:border-dark-border bg-transparent p-1"
          />
        </label>

        {entry.is_active !== false && (
          <>
            <button
              type="button"
              onClick={() => onMove?.(entry, "up")}
              disabled={index === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 disabled:opacity-40"
              aria-label={t("budget:categories.moveUp", { defaultValue: "Move category up" })}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMove?.(entry, "down")}
              disabled={index === siblings.length - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 disabled:opacity-40"
              aria-label={t("budget:categories.moveDown", { defaultValue: "Move category down" })}
            >
              <ArrowDown size={14} />
            </button>
          </>
        )}

        {canDelete?.(entry) && (
          <button
            type="button"
            onClick={() => onDelete?.(entry)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-card-sm border border-red-500/30 text-red-500 hover:bg-red-500/10"
            aria-label={t("common:actions.delete", { defaultValue: "Delete" })}
            title={t("common:actions.delete", { defaultValue: "Delete" })}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );

  const footer = (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onClose}
        className="rounded-card-sm border border-light-border dark:border-dark-border px-4 py-2.5 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
      >
        {t("common:actions.close")}
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      title={t("budget:categories.manage", { defaultValue: "Manage categories" })}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      bodyClassName="space-y-5"
      footer={footer}
    >
      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t("budget:categories.new", { defaultValue: "New category" })}
            className={INPUT_CLS}
          />
          <input
            type="color"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            className="h-11 w-full cursor-pointer rounded-card-sm border border-light-border dark:border-dark-border bg-transparent p-1"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || !String(newName || "").trim()}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60"
          >
            <Plus size={15} />
            {t("common:actions.create")}
          </button>
        </div>
        <p className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:categories.managerHint")}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            {t("budget:categories.active", { defaultValue: "Active categories" })}
          </h3>
        </div>
        <div className="space-y-2">
          {activeCategories.length === 0 ? (
            <p className="rounded-card-sm border border-dashed border-light-border dark:border-dark-border px-4 py-6 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:categories.noActive", { defaultValue: "No active categories." })}
            </p>
          ) : (
            activeCategories.map((entry, index) => renderCategoryRow(entry, index, activeCategories))
          )}
        </div>
      </section>
    </ModalShell>
  );
}
