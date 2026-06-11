import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Edit2,
  FileText,
  Link2,
  RefreshCw,
  Receipt,
  Trash2,
} from "lucide-react";
import { getBudgetEntryMeta } from "../../../utils/budgetOverview";
import {
  getBewohnerDisplayName,
  getScopeKontoHinweis,
} from "../../../utils/budgetAccounts";
import BudgetAccountBadge from "./BudgetAccountBadge";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

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

const formatInvoiceDate = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const getInvoiceTitle = (rechnung) =>
  rechnung?.lieferant_name || rechnung?.dateiname || "Rechnung";

export default function BudgetEntryRow({
  entry,
  ctx,
  isOpen,
  selectionMode = false,
  selected = false,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onPreviewInvoice,
  onOpenInvoicePositions,
  onLinkInvoice,
}) {
  const { t, i18n } = useTranslation(["budget", "common"]);
  const meta = useMemo(() => getBudgetEntryMeta(entry, ctx), [entry, ctx]);
  const categoryLabel = getHomeBudgetCategoryLabel(entry?.kategorie, i18n.language);
  const hatRechnungsPositionen = useMemo(
    () => meta.verknuepfteRechnungen.some((rechnung) => Boolean(rechnung?.rechnung_id)),
    [meta.verknuepfteRechnungen],
  );
  const kontoHinweis = useMemo(
    () => getScopeKontoHinweis({
      budgetScope: entry?.budget_scope || "haushalt",
      konto: meta.konto,
      bewohnerById: ctx?.bewohnerById,
    }),
    [ctx, entry?.budget_scope, meta.konto],
  );

  return (
    <div className="bg-light-card dark:bg-canvas-2">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-light-hover/40 dark:hover:bg-canvas-3/40"
      >
        <div className="flex items-start gap-3">
          {selectionMode && (
            <span
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-card-sm border text-[12px] ${
                selected
                  ? "border-primary-500 bg-primary-500 text-white"
                  : "border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(entry.id);
              }}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect?.(entry.id);
                }
              }}
              aria-label={`Budgetposten ${entry.beschreibung || ""} auswählen`}
            >
              {selected ? "✓" : ""}
            </span>
          )}
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

                  {meta.hatSplit && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                      {meta.istIndividuellerSplit
                        ? "Geteilt"
                        : meta.splitOriginLabel
                          ? `Geteilt · ${meta.splitOriginLabel}`
                          : "Geteilt"}
                    </span>
                  )}

                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.scopeColorClass}`}
                  >
                    {meta.scopeLabel}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                  <span>{categoryLabel}</span>
                  <span>{meta.anzeigeDatumLabel}</span>
                  {meta.bewohner && <span>{getBewohnerDisplayName(meta.bewohner)}</span>}
                  {meta.konto?.name && <BudgetAccountBadge konto={meta.konto} compact />}
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
              <p className={DETAIL_LABEL_CLS}>{t("budget:category")}</p>
              <p className={DETAIL_VALUE_CLS}>{categoryLabel}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Datum</p>
              <p className={DETAIL_VALUE_CLS}>{meta.anzeigeDatumLabel}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Person</p>
              <p className={DETAIL_VALUE_CLS}>
                {meta.bewohner ? getBewohnerDisplayName(meta.bewohner) : "Ohne Person"}
              </p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Scope</p>
              <p className={DETAIL_VALUE_CLS}>{meta.scopeLabel}</p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Kostenaufteilung</p>
              <p className={DETAIL_VALUE_CLS}>
                {meta.hatSplit ? meta.splitModeLabel || "Aktiv" : "Keine"}
              </p>
            </div>
            <div>
              <p className={DETAIL_LABEL_CLS}>Konto</p>
              {meta.konto ? (
                <div className="mt-1 space-y-1.5">
                  <BudgetAccountBadge konto={meta.konto} />
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {meta.kontoTyp || "Unbekannter Typ"}
                    {meta.kontoInhaberName ? ` · ${meta.kontoInhaberName}` : ""}
                  </p>
                </div>
              ) : (
                <p className={DETAIL_VALUE_CLS}>Kein Konto</p>
              )}
            </div>
            {meta.istRecurring && (
              <div>
                <p className={DETAIL_LABEL_CLS}>Wiederkehrung</p>
                <p className={DETAIL_VALUE_CLS}>
                  {meta.istTemplate ? `Vorlage · ${entry.intervall || "ohne Intervall"}` : "Wiederkehrende Buchung"}
                </p>
                {meta.istTemplate && entry.naechstes_datum && (
                  <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Naechstes Datum: {entry.naechstes_datum}
                  </p>
                )}
                <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {meta.istTemplate
                    ? "Nur echte Buchungen wirken im Ausgleich; die Vorlage speichert den Default."
                    : meta.istVererbterSplit
                      ? "Diese Buchung nutzt aktuell die vererbte Aufteilung der Serie."
                      : meta.istIndividuellerSplit
                        ? "Diese Buchung hat eine individuell angepasste Aufteilung."
                        : "Diese Buchung wirkt direkt im Ausgleich."}
                </p>
              </div>
            )}
          </div>

          {kontoHinweis && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {kontoHinweis}
            </div>
          )}

          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={DETAIL_LABEL_CLS}>Rechnung</p>
                {meta.hatRechnung ? (
                  <div className="mt-1 space-y-1.5">
                    {meta.verknuepfteRechnungen.map((rechnung) => {
                      const details = [
                        formatInvoiceDate(rechnung.rechnungsdatum),
                        rechnung.dateiname,
                        rechnung.brutto != null ? formatCurrency(rechnung.brutto) : null,
                      ].filter(Boolean);

                      return (
                        <div key={rechnung.link_id || rechnung.dokument_id} className="min-w-0">
                          <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
                            {getInvoiceTitle(rechnung)}
                          </p>
                          {details.length > 0 && (
                            <p className="truncate text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              {details.join(" · ")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={DETAIL_VALUE_CLS}>
                    {t("budget:invoice.noneLinked", { defaultValue: "No invoice linked" })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {hatRechnungsPositionen && (
                  <button
                    onClick={() => onOpenInvoicePositions(entry)}
                    className="inline-flex items-center gap-1 rounded-card-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <FileText size={13} />
                    Positionen
                  </button>
                )}
                {meta.hatRechnung && (
                  <button
                    onClick={() => onPreviewInvoice(entry)}
                    className="inline-flex items-center gap-1 rounded-card-sm border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm text-primary-500 hover:bg-primary-500/20"
                  >
                    <FileText size={13} />
                    Rechnung oeffnen
                  </button>
                )}
                <button
                  onClick={() => onLinkInvoice?.(entry)}
                  className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                >
                  <Link2 size={13} />
                  Rechnung zuordnen
                </button>
              </div>
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
              Loeschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
