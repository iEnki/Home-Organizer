import React from "react";
import { Check, Edit2, X } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

export default function BudgetLimitRow({
  row,
  isEditing,
  editValue,
  onStartEdit,
  onChangeEdit,
  onSave,
  onCancel,
}) {
  const { t, i18n } = useTranslation(["budget", "common"]);
  const categoryLabel = getHomeBudgetCategoryLabel(row.kategorie, i18n.language);
  const statusLabel = {
    kein_limit: t("budget:limits.noLimit", { defaultValue: "No limit" }),
    ok: t("budget:limits.ok", { defaultValue: "OK" }),
    warnung: t("budget:limits.warning", { defaultValue: "Warning" }),
    ueberschritten: t("budget:limits.exceeded", { defaultValue: "Exceeded" }),
  }[row.status] || row.meta.statusLabel;
  const summaryText = row.limitEuro > 0
    ? t("budget:limits.summaryWithLimit", {
        spent: row.meta.verbrauchText,
        limit: row.meta.limitText,
        defaultValue: `${row.meta.verbrauchText} of ${row.meta.limitText}`,
      })
    : t("budget:limits.summaryWithoutLimit", {
        spent: row.meta.verbrauchText,
        defaultValue: `${row.meta.verbrauchText} without limit`,
      });
  const hintText = row.status === "kein_limit"
    ? t("budget:limits.noLimitSet", { defaultValue: "No limit set" })
    : row.status === "warnung"
      ? t("budget:limits.remainingPercent", {
          percent: Math.max(0, 100 - Number(row.progress || 0)).toFixed(0),
          defaultValue: `${Math.max(0, 100 - Number(row.progress || 0)).toFixed(0)}% remaining`,
        })
      : row.status === "ueberschritten"
        ? t("budget:limits.budgetExceeded", { defaultValue: "Budget exceeded!" })
        : row.meta.hintText;

  return (
    <div className="bg-light-card dark:bg-canvas-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
              {categoryLabel}
            </span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${row.meta.statusBadgeClass}`}>
              {statusLabel}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            <span className="tabular-nums">{summaryText}</span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas-3">
            <motion.div
              className={`h-full rounded-full ${row.meta.progressBarClass}`}
              initial={{ width: 0 }}
              animate={{ width: row.limitEuro > 0 ? `${row.progress}%` : "0%" }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            />
          </div>

          {hintText ? (
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {hintText}
            </p>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-start gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="10"
                min="0"
                value={editValue}
                onChange={(event) => onChangeEdit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSave();
                  if (event.key === "Escape") onCancel();
                }}
                autoFocus
                className="w-20 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-2 py-1 text-xs text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={onSave}
                className="rounded p-1 text-green-500 hover:bg-green-500/10"
                aria-label={t("budget:limits.saveLimit", { defaultValue: "Save limit" })}
              >
                <Check size={13} />
              </button>
              <button
                onClick={onCancel}
                className="rounded p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
                aria-label={t("common:actions.cancel")}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={onStartEdit}
              className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border px-2 py-1 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500"
            >
              <Edit2 size={12} />
              {row.limitEuro > 0 ? row.meta.limitText : t("budget:limits.setLimit", { defaultValue: "Set limit" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
