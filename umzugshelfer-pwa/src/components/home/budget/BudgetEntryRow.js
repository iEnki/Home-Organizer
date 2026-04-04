import React, { useMemo } from "react";
import {
  ChevronDown,
  Edit2,
  FileText,
  RefreshCw,
  Receipt,
  Trash2,
} from "lucide-react";
import { getBudgetEntryMeta } from "../../../utils/budgetOverview";

const DETAIL_LABEL_CLS =
  "text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary";

const DETAIL_VALUE_CLS =
  "mt-1 text-sm text-light-text-main dark:text-dark-text-main";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(value || 0)));

export default function BudgetEntryRow({
  entry,
  ctx,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
  onPreviewInvoice,
}) {
  const meta = useMemo(() => getBudgetEntryMeta(entry, ctx), [entry, ctx]);

  return (
    <div className="bg-light-card dark:bg-canvas-2">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-light-hover/40 dark:hover:bg-canvas-3/40"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
                    {entry.beschreibung}
                  </p>

                  {meta.istRecurring && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-secondary-500/30 bg-secondary-500/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary-600 dark:text-secondary-300">
                      <RefreshCw size={10} />
                      {meta.istTemplate ? "Vorlage" : "Wiederkehrend"}
                    </span>
                  )}

                  {meta.hatRechnung && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-500">
                      <Receipt size={10} />
                      Rechnung
                    </span>
                  )}

                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.scopeColorClass}`}
                  >
                    {meta.scopeLabel}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                  <span>{entry.kategorie || "Ohne Kategorie"}</span>
                  <span>{meta.anzeigeDatumLabel}</span>
                  {meta.bewohner?.name && <span>{meta.bewohner.name}</span>}
                  {meta.konto?.name && <span>{meta.konto.name}</span>}
                </div>
              </div>

              <div className="flex items-start gap-2 pl-2">
                <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-red-500">
                  {formatCurrency(entry.betrag)}
                </span>
                <ChevronDown
                  size={16}
                  className={`mt-0.5 flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-light-border dark:border-dark-border px-3 pb-3 pt-3 space-y-3">
          {meta.datumIstProjiziert && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Dieses Datum ist für den gewählten Zukunftsmonat projiziert. Bearbeiten und Löschen
              wirken auf die zugrunde liegende Vorlage.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={DETAIL_LABEL_CLS}>Beschreibung</p>
              <p className={DETAIL_VALUE_CLS}>{entry.beschreibung}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Betrag</p>
              <p className={`${DETAIL_VALUE_CLS} tabular-nums text-red-500`}>
                {formatCurrency(entry.betrag)}
              </p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Kategorie</p>
              <p className={DETAIL_VALUE_CLS}>{entry.kategorie || "Ohne Kategorie"}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Datum</p>
              <p className={DETAIL_VALUE_CLS}>{meta.anzeigeDatumLabel}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Person</p>
              <p className={DETAIL_VALUE_CLS}>{meta.bewohner?.name || "Ohne Person"}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Scope</p>
              <p className={DETAIL_VALUE_CLS}>{meta.scopeLabel}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Konto</p>
              <p className={DETAIL_VALUE_CLS}>{meta.konto?.name || "Kein Konto"}</p>
            </div>
            {meta.istRecurring && (
              <div>
                <p className={DETAIL_LABEL_CLS}>Wiederkehrung</p>
                <p className={DETAIL_VALUE_CLS}>
                  {meta.istTemplate ? `Vorlage · ${entry.intervall || "ohne Intervall"}` : "Wiederkehrende Buchung"}
                </p>
                {meta.istTemplate && entry.naechstes_datum && (
                  <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Nächstes Datum: {entry.naechstes_datum}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className={DETAIL_LABEL_CLS}>Rechnung</p>
                <p className={DETAIL_VALUE_CLS}>
                  {meta.hatRechnung
                    ? `${meta.verknuepfteRechnungen.length} verknüpft`
                    : "Keine Rechnung verknüpft"}
                </p>
              </div>
              {meta.hatRechnung && (
                <button
                  onClick={() => onPreviewInvoice(entry)}
                  className="inline-flex items-center gap-1 rounded-card-sm border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm text-primary-500 hover:bg-primary-500/20"
                >
                  <FileText size={13} />
                  Rechnung öffnen
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => onEdit(entry)}
              className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
            >
              <Edit2 size={13} />
              Bearbeiten
            </button>
            <button
              onClick={() => onDelete(entry)}
              className="inline-flex items-center gap-1 rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500 hover:bg-red-500/20"
            >
              <Trash2 size={13} />
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
