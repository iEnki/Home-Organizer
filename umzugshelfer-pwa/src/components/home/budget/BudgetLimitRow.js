import React, { useState, useEffect } from "react";
import { Check, Edit2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

const progressGradient = (progress) => {
  if (progress > 90) return "linear-gradient(90deg, #F97316, #FB7185)";
  if (progress > 70) return "linear-gradient(90deg, #10B981, #F59E0B)";
  return "linear-gradient(90deg, #10B981, #06B6D4)";
};

export default function BudgetLimitRow({
  row,
  isEditing,
  editValue,
  onStartEdit,
  onChangeEdit,
  onSave,
  onCancel,
  index = 0,
}) {
  const { t, i18n } = useTranslation(["budget", "common"]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 60 + index * 60);
    return () => clearTimeout(id);
  }, [index]);

  const categoryLabel = getHomeBudgetCategoryLabel(row.kategorie, i18n.language);
  const statusLabel = {
    kein_limit: t("budget:limits.noLimit", { defaultValue: "Kein Limit" }),
    ok: t("budget:limits.ok", { defaultValue: "OK" }),
    warnung: t("budget:limits.warning", { defaultValue: "Warnung" }),
    ueberschritten: t("budget:limits.exceeded", { defaultValue: "Überschritten" }),
  }[row.status] || row.meta.statusLabel;

  const summaryText = row.limitEuro > 0
    ? t("budget:limits.summaryWithLimit", {
        spent: row.meta.verbrauchText,
        limit: row.meta.limitText,
        defaultValue: `${row.meta.verbrauchText} von ${row.meta.limitText}`,
      })
    : t("budget:limits.summaryWithoutLimit", {
        spent: row.meta.verbrauchText,
        defaultValue: `${row.meta.verbrauchText} ohne Limit`,
      });

  const hintText = row.status === "kein_limit"
    ? t("budget:limits.noLimitSet", { defaultValue: "Noch kein Limit gesetzt" })
    : row.status === "warnung"
      ? t("budget:limits.remainingPercent", {
          percent: Math.max(0, 100 - Number(row.progress || 0)).toFixed(0),
          defaultValue: `${Math.max(0, 100 - Number(row.progress || 0)).toFixed(0)}% verbleibend`,
        })
      : row.status === "ueberschritten"
        ? t("budget:limits.budgetExceeded", { defaultValue: "Budget überschritten!" })
        : row.meta.hintText;

  const clampedProgress = Math.min(Number(row.progress || 0), 100);

  return (
    <div
      className="rounded-card-sm bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border p-4 space-y-3 animate-slide-in-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: row.color }}
          />
          <span className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
            {categoryLabel}
          </span>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${row.meta.statusBadgeClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
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
                aria-label={t("budget:limits.saveLimit", { defaultValue: "Limit speichern" })}
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
              className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border px-2 py-1 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:border-primary-500/50 transition-colors"
            >
              <Edit2 size={11} />
              {row.limitEuro > 0 ? row.meta.limitText : t("budget:limits.setLimit", { defaultValue: "Limit setzen" })}
            </button>
          )}
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-center justify-between text-xs tabular-nums text-light-text-secondary dark:text-dark-text-secondary">
        <span>{summaryText}</span>
        {row.limitEuro > 0 && (
          <span className={clampedProgress >= 90 ? "text-accent-danger font-medium" : ""}>
            {clampedProgress.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Animated gradient progress bar */}
      <div className="relative h-2 overflow-hidden rounded-pill bg-light-bg dark:bg-canvas-3">
        <div
          className="absolute inset-y-0 left-0 rounded-pill transition-all duration-1000 ease-out"
          style={{
            width: mounted && row.limitEuro > 0 ? `${clampedProgress}%` : "0%",
            background: progressGradient(clampedProgress),
          }}
        />
      </div>

      {/* Hint text */}
      {hintText && (
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{hintText}</p>
      )}
    </div>
  );
}
