import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Loader2, Receipt, Save } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import ModalShell from "../../ui/ModalShell";
import { useToast } from "../../../hooks/useToast";
import { syncInvoiceKnowledgeEntry } from "../../../utils/invoiceDateSync";
import { notifyHouseholdEvent } from "../../../utils/pushNotifications";
import {
  DEFAULT_HOME_BUDGET_CATEGORY,
  getSelectableHomeBudgetCategoryNames,
  normalizeHomeBudgetCategory,
} from "../../../utils/homeBudgetCategories";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "Ohne Datum";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const normalizeNumber = (val) => {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const normalized = String(val).replace(",", ".").trim();
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeClassification = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};

const INPUT_CLS =
  "mt-1 w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-2.5 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

export default function BudgetInvoicePositionsModal({
  open,
  invoice,
  categories = [],
  session,
  onClose,
  onSaved,
}) {
  const { success, error: toastError, info } = useToast();
  const [invoiceMeta, setInvoiceMeta] = useState(invoice || null);
  const [positionen, setPositionen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState(null);

  useEffect(() => {
    setInvoiceMeta(invoice || null);
  }, [invoice]);

  const defaultBudgetCategory = useMemo(
    () => normalizeHomeBudgetCategory(invoiceMeta?.budget_kategorie, DEFAULT_HOME_BUDGET_CATEGORY, {
      categories,
      preserveUnknown: true,
    }),
    [categories, invoiceMeta?.budget_kategorie],
  );

  const linkedBudgetEntryCount = Number(invoiceMeta?.linked_budget_entry_count || 0);
  const canEditCategories = linkedBudgetEntryCount === 1;

  const ladePositionen = useCallback(async () => {
    if (!invoice?.rechnung_id) {
      setPositionen([]);
      setFehler("Zu dieser Rechnung wurden keine Positionsdaten gefunden.");
      return;
    }

    setLoading(true);
    setFehler(null);

    try {
      const { data, error } = await supabase
        .from("rechnungs_positionen")
        .select("id, pos_nr, beschreibung, menge, einheit, einzelpreis, gesamtpreis, ust_satz, klassifikation")
        .eq("rechnung_id", invoice.rechnung_id)
        .order("pos_nr", { ascending: true });

      if (error) throw error;

      setPositionen(
        (data || []).map((position) => {
          const klassifikation = normalizeClassification(position.klassifikation);
          return {
            ...position,
            klassifikation,
            budget_kategorie:
              normalizeHomeBudgetCategory(klassifikation.budget_kategorie, null, {
                categories,
                preserveUnknown: true,
              }) || null,
          };
        }),
      );
    } catch (err) {
      setPositionen([]);
      setFehler(err.message || "Rechnungspositionen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [categories, invoice?.rechnung_id]);

  useEffect(() => {
    if (!open) return;
    ladePositionen();
  }, [ladePositionen, open]);

  const gesamtpreisSumme = useMemo(
    () => positionen.reduce((summe, pos) => summe + Number(normalizeNumber(pos.gesamtpreis) || 0), 0),
    [positionen],
  );

  const hatLeereBeschreibung = useMemo(
    () => positionen.some((pos) => !String(pos.beschreibung || "").trim()),
    [positionen],
  );

  const updatePosition = useCallback((id, feld, wert) => {
    setPositionen((prev) =>
      prev.map((pos) => (pos.id === id ? { ...pos, [feld]: wert } : pos)),
    );
  }, []);

  const handleSpeichern = useCallback(async () => {
    if (!invoice?.rechnung_id) {
      setFehler("Rechnungs-ID fehlt.");
      return;
    }
    if (!session?.user?.id) {
      toastError("Keine gueltige Sitzung vorhanden.");
      return;
    }
    if (positionen.length === 0) return;
    if (hatLeereBeschreibung) {
      setFehler("Jede vorhandene Position braucht eine Beschreibung.");
      return;
    }

    setSaving(true);
    setFehler(null);

    try {
      const payloadPositionen = positionen.map((pos) => {
        const klassifikation = normalizeClassification(pos.klassifikation);
        if (canEditCategories) {
          const selectedCategory = normalizeHomeBudgetCategory(pos.budget_kategorie, null, {
            categories,
          });

          if (selectedCategory && selectedCategory !== defaultBudgetCategory) {
            klassifikation.budget_kategorie = selectedCategory;
          } else {
            delete klassifikation.budget_kategorie;
          }
        }

        return {
          id: pos.id,
          beschreibung: String(pos.beschreibung || "").trim(),
          menge: normalizeNumber(pos.menge),
          einheit: String(pos.einheit || "").trim() || null,
          einzelpreis: normalizeNumber(pos.einzelpreis),
          gesamtpreis: normalizeNumber(pos.gesamtpreis),
          ust_satz: pos.ust_satz ?? null,
          klassifikation,
        };
      });

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "save_budget_invoice_positions",
        {
          p_rechnung_id: invoice.rechnung_id,
          p_positionen: payloadPositionen,
        },
      );
      if (rpcError) throw rpcError;

      const neuesBrutto = Number(
        rpcData?.brutto != null ? rpcData.brutto : gesamtpreisSumme.toFixed(2),
      );

      let wissenFehler = null;
      try {
        await syncInvoiceKnowledgeEntry({
          supabase,
          rechnungId: invoice.rechnung_id,
          userId: session.user.id,
        });
      } catch (err) {
        wissenFehler = err.message || "Wissenseintrag konnte nicht aktualisiert werden.";
      }

      const nextInvoiceMeta = {
        ...(invoiceMeta || invoice),
        brutto: neuesBrutto,
      };

      await notifyHouseholdEvent({
        userId: session.user.id,
        table: "rechnungen",
        action: "geaendert",
        recordName:
          nextInvoiceMeta.lieferant_name ||
          nextInvoiceMeta.dateiname ||
          "Rechnung",
        recordId: invoice.rechnung_id,
        url: "/home/budget",
        tag: `rechnung-update-${invoice.rechnung_id}`,
        pushPolicy: "always",
      });

      setInvoiceMeta(nextInvoiceMeta);
      success("Rechnungspositionen gespeichert.");
      if (wissenFehler) {
        info(wissenFehler, 5000);
      }
      if (onSaved) {
        await onSaved(nextInvoiceMeta);
      }
    } catch (err) {
      setFehler(err.message || "Speichern fehlgeschlagen.");
      toastError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }, [
    canEditCategories,
    categories,
    defaultBudgetCategory,
    gesamtpreisSumme,
    hatLeereBeschreibung,
    info,
    invoice,
    invoiceMeta,
    onSaved,
    positionen,
    session?.user?.id,
    success,
    toastError,
  ]);

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-card-sm border border-light-border dark:border-dark-border px-4 py-2.5 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-60"
      >
        Schliessen
      </button>
      <button
        type="button"
        onClick={handleSpeichern}
        disabled={saving || loading || positionen.length === 0}
        className="inline-flex items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Speichern
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      title="Rechnungspositionen"
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      bodyClassName="space-y-4"
      footer={footer}
    >
      {invoiceMeta && (
        <div className="rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-card-sm bg-primary-500/10 p-2 text-primary-500">
              <Receipt size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {invoiceMeta.lieferant_name || invoiceMeta.dateiname || "Rechnung"}
              </p>
              <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {formatDate(invoiceMeta.rechnungsdatum)}
                {invoiceMeta.dateiname ? ` · ${invoiceMeta.dateiname}` : ""}
              </p>
              <p className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Hauptkategorie im Budgeteintrag:{" "}
                <span className="font-medium text-light-text-main dark:text-dark-text-main">
                  {defaultBudgetCategory}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                Gesamt
              </p>
              <p className="mt-1 text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {formatCurrency(invoiceMeta.brutto)}
              </p>
            </div>
          </div>
        </div>
      )}

      {!canEditCategories && invoiceMeta?.rechnung_id && (
        <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>
              Diese Rechnung ist mehreren Budgeteintraegen zugeordnet. Positions-Kategorien
              bleiben deshalb schreibgeschuetzt, damit kein globaler Override mehrere Buchungen
              unbeabsichtigt beeinflusst.
            </p>
          </div>
        </div>
      )}

      {canEditCategories && (
        <div className="rounded-card-sm border border-primary-500/20 bg-primary-500/10 px-3 py-2 text-sm text-primary-700 dark:text-primary-200">
          Nicht gesetzte Positions-Kategorien erben automatisch die Hauptkategorie des Budgeteintrags.
        </div>
      )}

      {fehler && (
        <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {fehler}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : positionen.length === 0 ? (
        <div className="rounded-card border border-dashed border-light-border dark:border-dark-border px-4 py-8 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
          Keine Rechnungspositionen vorhanden.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {positionen.map((pos) => (
              <div
                key={pos.id}
                className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                    {pos.pos_nr ? `Position ${pos.pos_nr}` : "Position"}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    ID: {pos.id}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="md:col-span-2 xl:col-span-2">
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Beschreibung
                    </label>
                    <input
                      type="text"
                      value={pos.beschreibung || ""}
                      onChange={(event) => updatePosition(pos.id, "beschreibung", event.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Menge
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pos.menge ?? ""}
                      onChange={(event) => updatePosition(pos.id, "menge", event.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Einheit
                    </label>
                    <input
                      type="text"
                      value={pos.einheit || ""}
                      onChange={(event) => updatePosition(pos.id, "einheit", event.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Einzelpreis
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pos.einzelpreis ?? ""}
                      onChange={(event) => updatePosition(pos.id, "einzelpreis", event.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Gesamtpreis
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pos.gesamtpreis ?? ""}
                      onChange={(event) => updatePosition(pos.id, "gesamtpreis", event.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Budget-Kategorie
                    </label>
                    <select
                      value={normalizeHomeBudgetCategory(pos.budget_kategorie, defaultBudgetCategory, {
                        categories,
                        preserveUnknown: true,
                      })}
                      onChange={(event) => updatePosition(pos.id, "budget_kategorie", event.target.value)}
                      disabled={!canEditCategories}
                      className={INPUT_CLS}
                    >
                      {getSelectableHomeBudgetCategoryNames({
                        categories,
                        currentValue: pos.budget_kategorie,
                      }).map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
                    <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                      Vererbung
                    </p>
                    <p className="mt-1 text-sm text-light-text-main dark:text-dark-text-main">
                      Ohne abweichenden Override erbt diese Position{" "}
                      <span className="font-medium">{defaultBudgetCategory}</span>.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                Positionen
              </p>
              <p className="mt-1 text-sm text-light-text-main dark:text-dark-text-main">
                {positionen.length} gespeichert
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                Neue Summe
              </p>
              <p className="mt-1 text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {formatCurrency(gesamtpreisSumme)}
              </p>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}
