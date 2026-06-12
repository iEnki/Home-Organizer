import React from "react";
import { useTranslation } from "react-i18next";
import BudgetLimitRow from "./BudgetLimitRow";
import GlassSurface from "../../ui/GlassSurface";

export default function BudgetLimitsList({
  monatLabel,
  rows,
  limitsEdit,
  showAllCategories,
  onToggleShowAllCategories,
  onOpenCategoryManager,
  onStartEdit,
  onChangeEdit,
  onSave,
  onCancel,
}) {
  const { t } = useTranslation(["budget"]);
  const mitLimit = rows.filter((row) => row.limitEuro > 0).length;
  const ueberschritten = rows.filter((row) => row.status === "ueberschritten").length;

  return (
    <section className="space-y-3">
      {/* Header card */}
      <GlassSurface interactive={false} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-3.5 w-0.5 rounded-full bg-primary-500" />
            <p className="text-[11px] uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary font-medium">
              {t("budget:title")}
            </p>
          </div>
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
            {t("budget:limits.monthly")}
          </h2>
          <p className="mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {monatLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleShowAllCategories}
            className="rounded-pill border border-light-border dark:border-dark-border px-2.5 py-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:border-primary-500/50 transition-colors"
          >
            {showAllCategories ? t("budget:limits.showRelevant") : t("budget:limits.showAll")}
          </button>
          <button
            type="button"
            onClick={onOpenCategoryManager}
            className="rounded-pill border border-light-border dark:border-dark-border px-2.5 py-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:border-primary-500/50 transition-colors"
          >
            {t("budget:categories.manage")}
          </button>
          <span className="rounded-pill bg-primary-500/10 border border-primary-500/20 px-1.5 py-0.5 text-[10px] text-primary-500 font-medium">
            {t("budget:limits.withLimit", { count: mitLimit, defaultValue: `${mitLimit} mit Limit` })}
          </span>
          {ueberschritten > 0 && (
            <span className="rounded-pill bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[10px] text-red-500 font-medium">
              {t("budget:limits.exceededCount", { count: ueberschritten, defaultValue: `${ueberschritten} überschritten` })}
            </span>
          )}
        </div>
      </GlassSurface>

      {/* Limit cards list */}
      {rows.length === 0 ? (
        <GlassSurface interactive={false} className="flex flex-col items-center py-14 text-center">
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            {t("budget:limits.empty")}
          </p>
        </GlassSurface>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <BudgetLimitRow
              key={row.kategorie}
              row={row}
              index={i}
              isEditing={row.kategorie in limitsEdit}
              editValue={limitsEdit[row.kategorie] ?? ""}
              onStartEdit={() => onStartEdit(row.kategorie, row.limitEuro)}
              onChangeEdit={(value) => onChangeEdit(row.kategorie, value)}
              onSave={() => onSave(row.kategorie, limitsEdit[row.kategorie])}
              onCancel={() => onCancel(row.kategorie)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
