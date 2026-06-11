import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "../../ui/ModalShell";
import {
  DEFAULT_HOME_BUDGET_CATEGORY,
  getHomeBudgetCategoryLabel,
} from "../../../utils/homeBudgetCategories";

const FIELD_ROW_CLS =
  "rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3";

export default function BudgetBulkEditModal({
  open,
  entries = [],
  linkedInvoices = [],
  positionCount = 0,
  categories = [],
  onClose,
  onApply,
}) {
  const [applyBudgetCategory, setApplyBudgetCategory] = useState(false);
  const [applyPositionCategory, setApplyPositionCategory] = useState(false);
  const [applyBudgetDate, setApplyBudgetDate] = useState(false);
  const [applyInvoiceDate, setApplyInvoiceDate] = useState(false);
  const [category, setCategory] = useState(categories[0]?.name || DEFAULT_HOME_BUDGET_CATEGORY);
  const [dateValue, setDateValue] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const validInvoices = useMemo(
    () => linkedInvoices.filter((invoice) => Boolean(invoice?.rechnung_id)),
    [linkedInvoices],
  );
  const availableCategories = useMemo(
    () => (categories.length > 0 ? categories : [{ name: DEFAULT_HOME_BUDGET_CATEGORY }]),
    [categories],
  );

  const canSubmit =
    entries.length > 0 &&
    (
      applyBudgetCategory ||
      applyPositionCategory ||
      applyBudgetDate ||
      applyInvoiceDate
    ) &&
    (!applyBudgetCategory || category) &&
    (!applyPositionCategory || category) &&
    (!applyBudgetDate || dateValue) &&
    (!applyInvoiceDate || dateValue);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onApply?.({
        applyBudgetCategory,
        applyPositionCategory,
        applyBudgetDate,
        applyInvoiceDate,
        category,
        date: dateValue,
      });
    } catch (err) {
      setError(err.message || "Massenbearbeitung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      open
      title="Mehrere Einträge bearbeiten"
      onClose={saving ? undefined : onClose}
      maxWidthClass="max-w-2xl"
      bodyClassName="space-y-4"
      footer={(
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex-1 rounded-pill bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" />
                Speichern...
              </span>
            ) : "Änderungen anwenden"}
          </button>
        </div>
      )}
    >
      <div className="rounded-card-sm border border-primary-500/20 bg-primary-500/10 px-3 py-3 text-sm text-light-text-main dark:text-dark-text-main">
        <p className="font-medium">{entries.length} Budgetposten ausgewählt</p>
        <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
          {validInvoices.length} verknüpfte Rechnungen · {positionCount} Rechnungspositionen
        </p>
      </div>

      {error && (
        <p className="rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className={FIELD_ROW_CLS}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={applyBudgetCategory}
            onChange={(event) => setApplyBudgetCategory(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Budget-Kategorie ändern
            </span>
            <span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Ändert Anzeige und Fallback-Kategorie der ausgewählten Budgetposten.
            </span>
          </span>
        </label>
      </div>

      <div className={FIELD_ROW_CLS}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={applyPositionCategory}
            onChange={(event) => setApplyPositionCategory(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Alle Rechnungspositionen auf Kategorie setzen
            </span>
            <span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Überschreibt nur die Positionskategorie für Statistik und Limits.
            </span>
          </span>
        </label>
      </div>

      {(applyBudgetCategory || applyPositionCategory) && (
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        >
          {availableCategories.map((item) => (
            <option key={item.name} value={item.name}>
              {getHomeBudgetCategoryLabel(item.name)}
            </option>
          ))}
        </select>
      )}

      <div className={FIELD_ROW_CLS}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={applyBudgetDate}
            onChange={(event) => setApplyBudgetDate(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Budgetdatum ändern
            </span>
            <span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Ändert das Datum der ausgewählten Budgetposten.
            </span>
          </span>
        </label>
      </div>

      <div className={FIELD_ROW_CLS}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={applyInvoiceDate}
            onChange={(event) => setApplyInvoiceDate(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Rechnungsdatum ändern
            </span>
            <span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Nutzt die vorhandene Rechnungssynchronisierung inklusive Wissenseinträgen.
            </span>
          </span>
        </label>
      </div>

      {(applyBudgetDate || applyInvoiceDate) && (
        <input
          type="date"
          value={dateValue}
          onChange={(event) => setDateValue(event.target.value)}
          className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      )}
    </ModalShell>
  );
}
