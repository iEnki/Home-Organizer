import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign, Plus, Edit2, Trash2, X, Loader2, AlertCircle,
  Sparkles, RefreshCw,
  Target, TrendingUp, BarChart2, Wallet,
  FileText,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";
import { calcNaechstesDatum, ensureRecurringBudgetEntries, getLocalDateString } from "../../utils/budgetRecurring";
import { sumScope } from "../../utils/budgetAggregation";
import { syncInvoiceDate } from "../../utils/invoiceDateSync";
import {
  computeBudgetOverviewKpis,
  groupBudgetEntries,
  matchBudgetSearch,
  sortBudgetEntries,
} from "../../utils/budgetOverview";
import {
  buildCashflowPreview,
  buildMonthStatsData,
  buildYearStatsData,
} from "../../utils/budgetStats";
import {
  formatLimitMeta,
  getLimitProgress,
  getLimitStatus,
} from "../../utils/budgetLimits";
import {
  getGoalMonatlichNoetig,
  getGoalProgress,
  getGoalRestbetrag,
  getGoalStatus,
  groupGoalsByStatus,
} from "../../utils/budgetGoals";
import BudgetFilterBar from "./budget/BudgetFilterBar";
import BudgetFilterSheet from "./budget/BudgetFilterSheet";
import BudgetGroupSection from "./budget/BudgetGroupSection";
import BudgetEntryRow from "./budget/BudgetEntryRow";
import BudgetKpiStrip from "./budget/BudgetKpiStrip";
import BudgetStatsHeader from "./budget/BudgetStatsHeader";
import BudgetStatsKpiStrip from "./budget/BudgetStatsKpiStrip";
import BudgetStatsCharts from "./budget/BudgetStatsCharts";
import BudgetCashflowList from "./budget/BudgetCashflowList";
import BudgetLimitsList from "./budget/BudgetLimitsList";
import BudgetAccountsSection from "./budget/BudgetAccountsSection";
import BudgetGoalsList from "./budget/BudgetGoalsList";

// ─────────────── Constants ───────────────
const HOME_KATEGORIEN = [
  "Lebensmittel", "Haushalt", "Reparaturen", "Abonnements",
  "Versicherungen", "Einrichtung", "Tanken", "Rücklagen", "Sonstiges",
];
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const INTERVALL_OPTIONEN = ["Täglich", "Wöchentlich", "Monatlich", "Vierteljährlich", "Jährlich"];

const KATEGORIE_FARBEN = {
  "Lebensmittel": "#10B981", "Haushalt": "#3B82F6", "Reparaturen": "#F59E0B",
  "Abonnements": "#8B5CF6", "Versicherungen": "#EC4899", "Einrichtung": "#14B8A6",
  "Tanken": "#0EA5E9",
  "Rücklagen": "#F97316", "Sonstiges": "#6B7280",
};
const EMOJI_OPTIONEN = ["🎯", "🏠", "✈️", "🚗", "💻", "📱", "🎓", "💍", "🛋️", "🎸", "🌴", "💰"];
const FARB_OPTIONEN = ["#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#F97316", "#14B8A6", "#EF4444"];
const BewohnerBadge = () => null;

// ─────────────── Helpers ───────────────
const fmt = (n) => Number(n || 0).toFixed(2) + " €";
const istRechnungsDokument = (dok) => {
  const kategorie = String(dok?.kategorie || "").trim().toLowerCase();
  const dokumentTyp = String(dok?.dokument_typ || "").trim().toLowerCase();
  return kategorie === "rechnung" || dokumentTyp === "rechnung";
};

// ─────────────── Sub-Components ───────────────
const ModalWrapper = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)]">
    <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
        <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{title}</h3>
        <button onClick={onClose} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main">
          <X size={18} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

// ─────────────── BudgetForm ───────────────
const INPUT_CLS = "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

const BudgetForm = ({ initial, onSpeichern, onAbbrechen, bewohner, finanzkonten }) => {
  const [form, setForm] = useState({
    beschreibung: initial?.beschreibung || "",
    kategorie: initial?.kategorie || "Haushalt",
    betrag: initial?.betrag ? Math.abs(Number(initial.betrag)) : "",
    datum: initial?.datum || new Date().toISOString().split("T")[0],
    bewohner_id: initial?.bewohner_id || "",
    typ: "ausgabe",
    app_modus: "home",
  });
  const [wiederholen, setWiederholen] = useState(initial?.wiederholen || false);
  const [intervall, setIntervall] = useState(initial?.intervall || "Monatlich");
  const [endeModus, setEndeModus] = useState(initial?.ende_datum ? "datum" : "endlos");
  const [endeDatum, setEndeDatum] = useState(initial?.ende_datum || "");
  const [budgetScope, setBudgetScope] = useState(initial?.budget_scope || "haushalt");
  const [zahlungskontoId, setZahlungskontoId] = useState(initial?.zahlungskonto_id || "");

  const handleSpeichern = () => {
    if (!form.beschreibung.trim() || !form.betrag) return;
    const naechstesDatum = wiederholen ? calcNaechstesDatum(form.datum, intervall) : null;
    onSpeichern({
      ...form,
      betrag: Math.abs(Number(form.betrag)),
      wiederholen,
      intervall: wiederholen ? intervall : null,
      naechstes_datum: naechstesDatum,
      ende_datum: wiederholen && endeModus === "datum" && endeDatum ? endeDatum : null,
      bewohner_id: form.bewohner_id || null,
      budget_scope: budgetScope,
      zahlungskonto_id: zahlungskontoId || null,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Beschreibung*</label>
        <input
          value={form.beschreibung}
          onChange={e => setForm(p => ({ ...p, beschreibung: e.target.value }))}
          placeholder="z.B. Supermarkt"
          className={INPUT_CLS}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
          <select value={form.kategorie} onChange={e => setForm(p => ({ ...p, kategorie: e.target.value }))} className={INPUT_CLS}>
            {HOME_KATEGORIEN.map(k => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Betrag (€)*</label>
          <input
            type="number" step="0.01" min="0"
            value={form.betrag}
            onChange={e => setForm(p => ({ ...p, betrag: e.target.value }))}
            placeholder="0,00" className={INPUT_CLS}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Datum</label>
        <input type="date" value={form.datum} onChange={e => setForm(p => ({ ...p, datum: e.target.value }))} className={INPUT_CLS} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={wiederholen} onChange={e => setWiederholen(e.target.checked)} className="w-4 h-4 rounded accent-primary-500" />
        <span className="text-sm text-light-text-main dark:text-dark-text-main">Wiederkehrend</span>
      </label>
      {wiederholen && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Intervall</label>
            <select value={intervall} onChange={e => setIntervall(e.target.value)} className={INPUT_CLS}>
              {INTERVALL_OPTIONEN.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Wiederholung endet</label>
            <div className="flex gap-2 mb-2">
              {[["endlos", "Endlos"], ["datum", "Bis Datum"]].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEndeModus(v)}
                  className={`flex-1 px-3 py-1.5 rounded-card-sm text-xs font-medium border transition-colors ${
                    endeModus === v
                      ? "bg-primary-500 text-white border-primary-500"
                      : "bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main border-light-border dark:border-dark-border"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {endeModus === "datum" && (
              <input
                type="date"
                value={endeDatum}
                onChange={e => setEndeDatum(e.target.value)}
                min={form.datum}
                className={INPUT_CLS}
              />
            )}
          </div>
        </div>
      )}
      {bewohner?.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Person</label>
          <select value={form.bewohner_id} onChange={e => setForm(p => ({ ...p, bewohner_id: e.target.value }))} className={INPUT_CLS}>
            <option value="">— Kein Bewohner —</option>
            {bewohner.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Anrechnung</label>
        <div className="flex gap-2">
          {[["haushalt", "Haushalt"], ["privat", "Privat"]].map(([s, l]) => (
            <button key={s} type="button" onClick={() => setBudgetScope(s)}
              className={`flex-1 py-1.5 rounded-card-sm text-sm font-medium border transition-colors ${
                budgetScope === s
                  ? "bg-primary-500 text-white border-primary-500"
                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {finanzkonten?.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Bezahlt von</label>
          <select value={zahlungskontoId} onChange={e => setZahlungskontoId(e.target.value)} className={INPUT_CLS}>
            <option value="">— Kein Konto —</option>
            {finanzkonten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
          Abbrechen
        </button>
        <button
          onClick={handleSpeichern}
          disabled={!form.beschreibung.trim() || !form.betrag}
          className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

// ─────────────── SparzieleModal ───────────────
const SparzieleModal = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    name: initial?.name || "",
    ziel_betrag: initial?.ziel_betrag || "",
    aktueller_betrag: initial?.aktueller_betrag || 0,
    zieldatum: initial?.zieldatum || "",
    farbe: initial?.farbe || "#10B981",
    emoji: initial?.emoji || "🎯",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">Emoji</label>
        <div className="flex flex-wrap gap-2">
          {EMOJI_OPTIONEN.map(e => (
            <button
              key={e}
              onClick={() => setForm(p => ({ ...p, emoji: e }))}
              className={`w-9 h-9 rounded-card-sm text-lg flex items-center justify-center border transition-all ${
                form.emoji === e
                  ? "bg-primary-500/20 border-primary-500"
                  : "bg-light-card dark:bg-canvas-1 border-light-border dark:border-dark-border"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name*</label>
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Urlaub Hawaii" className={INPUT_CLS} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Zielbetrag (€)*</label>
          <input type="number" step="0.01" min="0" value={form.ziel_betrag} onChange={e => setForm(p => ({ ...p, ziel_betrag: e.target.value }))} placeholder="0,00" className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Aktuell (€)</label>
          <input type="number" step="0.01" min="0" value={form.aktueller_betrag} onChange={e => setForm(p => ({ ...p, aktueller_betrag: e.target.value }))} placeholder="0,00" className={INPUT_CLS} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Zieldatum</label>
        <input type="date" value={form.zieldatum} onChange={e => setForm(p => ({ ...p, zieldatum: e.target.value }))} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">Farbe</label>
        <div className="flex flex-wrap gap-2">
          {FARB_OPTIONEN.map(f => (
            <button
              key={f}
              onClick={() => setForm(p => ({ ...p, farbe: f }))}
              className={`w-8 h-8 rounded-full border-2 transition-all ${form.farbe === f ? "border-white scale-110" : "border-transparent"}`}
              style={{ backgroundColor: f }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
          Abbrechen
        </button>
        <button
          onClick={() => { if (form.name.trim() && form.ziel_betrag) onSpeichern(form); }}
          disabled={!form.name.trim() || !form.ziel_betrag}
          className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

// ─────────────── KontoForm ───────────────
const KONTO_TYP_OPTIONEN = ["haushaltskonto", "privatkonto", "kreditkarte", "paypal", "bar", "sparkonto"];

const KontoForm = ({ initial, bewohner, onSpeichern, onDeaktivieren, onAbbrechen }) => {
  const [form, setForm] = useState({
    id: initial?.id || undefined,
    name: initial?.name || "",
    konto_typ: initial?.konto_typ || "haushaltskonto",
    inhaber_typ: initial?.inhaber_typ || "household",
    inhaber_bewohner_id: initial?.inhaber_bewohner_id || "",
    farbe: initial?.farbe || "#10B981",
    sortierung: initial?.sortierung || 0,
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name*</label>
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={INPUT_CLS} placeholder="z.B. Haushaltskonto" />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Typ</label>
        <select value={form.konto_typ} onChange={e => setForm(p => ({ ...p, konto_typ: e.target.value }))} className={INPUT_CLS}>
          {KONTO_TYP_OPTIONEN.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      {bewohner?.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Inhaber</label>
          <select value={form.inhaber_bewohner_id} onChange={e => setForm(p => ({ ...p, inhaber_bewohner_id: e.target.value, inhaber_typ: e.target.value ? "bewohner" : "household" }))} className={INPUT_CLS}>
            <option value="">— Haushalt —</option>
            {bewohner.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Farbe</label>
        <div className="flex gap-2 flex-wrap">
          {FARB_OPTIONEN.map(f => (
            <button key={f} type="button" onClick={() => setForm(p => ({ ...p, farbe: f }))}
              className={`w-7 h-7 rounded-full border-2 transition-all ${form.farbe === f ? "border-white scale-110" : "border-transparent"}`}
              style={{ backgroundColor: f }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
          Abbrechen
        </button>
        {form.id && onDeaktivieren && (
          <button onClick={() => onDeaktivieren(form.id)} className="px-3 py-2 text-sm border border-amber-500/30 text-amber-500 rounded-card-sm hover:bg-amber-500/10">
            Deaktivieren
          </button>
        )}
        <button
          onClick={() => { if (form.name.trim()) onSpeichern(form); }}
          disabled={!form.name.trim()}
          className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

// ─────────────── Main Component ───────────────
const HomeBudget = ({ session }) => {
  const userId = session?.user?.id;
  const today = useMemo(() => new Date(), []);
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("budget");

  // Data
  const [loading, setLoading] = useState(true);
  const [posten, setPosten] = useState([]);
  const [bewohner, setBewohner] = useState([]);
  const [limits, setLimits] = useState([]);
  const [sparziele, setSparziele] = useState([]);
  const [fehler, setFehler] = useState(null);

  // UI
  const [aktiverTab, setAktiverTab] = useState("uebersicht");
  const [modal, setModal] = useState(null);
  const [sparzieleModal, setSparzieleModal] = useState(null);
  const [einzahlenModal, setEinzahlenModal] = useState(null);
  const [einzahlenBetrag, setEinzahlenBetrag] = useState("");
  const [kiOffen, setKiOffen] = useState(false);
  const [budgetRechnungMap, setBudgetRechnungMap] = useState({});
  const [rechnungVorschau, setRechnungVorschau] = useState(null);
  const [rechnungsLoeschDialog, setRechnungsLoeschDialog] = useState(null);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);

  // Filters
  const [kategFilter, setKategFilter] = useState("");
  const [bewohnerFilter, setBewohnerFilter] = useState("");
  const [zeitraum, setZeitraum] = useState("monat");
  const [selJahr, setSelJahr] = useState(today.getFullYear());
  const [selMonat, setSelMonat] = useState(today.getMonth());

  // Statistiken-Modus
  const [statistikModus, setStatistikModus] = useState("jahr"); // "jahr" | "monat"

  // Limit inline editing
  const [limitsEdit, setLimitsEdit] = useState({});

  // Finanzkonten
  const [finanzkonten, setFinanzkonten] = useState([]);

  // Scope-Filter
  const [scopeFilter, setScopeFilter] = useState("alle"); // "alle" | "haushalt" | "privat"
  const [suchbegriff, setSuchbegriff] = useState("");
  const [sortierung, setSortierung] = useState("datum_desc");
  const [gruppierung, setGruppierung] = useState("tag");
  const [filterSheetOffen, setFilterSheetOffen] = useState(false);
  const [nurWiederkehrend, setNurWiederkehrend] = useState(false);
  const [nurMitRechnung, setNurMitRechnung] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  // Finanzkonten-CRUD
  const [kontenFormOffen, setKontenFormOffen] = useState(false);
  const [kontenFormDaten, setKontenFormDaten] = useState(null); // null = neu, object = bearbeiten

  const ladeBudgetRechnungen = useCallback(async (budgetPosten) => {
    const ids = (budgetPosten || []).map((p) => p.id).filter(Boolean);
    if (ids.length === 0) {
      setBudgetRechnungMap({});
      return;
    }

    const { data: linkRows, error: linkErr } = await supabase
      .from("dokument_links")
      .select("id, dokument_id, entity_id, created_at")
      .eq("entity_type", "budget_posten")
      .in("entity_id", ids);
    if (linkErr) throw linkErr;

    const dokumentIds = Array.from(new Set((linkRows || []).map((l) => l.dokument_id).filter(Boolean)));
    if (dokumentIds.length === 0) {
      setBudgetRechnungMap({});
      return;
    }

    const { data: dokumentRows, error: dokErr } = await supabase
      .from("dokumente")
      .select("id, dateiname, datei_typ, storage_pfad, kategorie, dokument_typ")
      .in("id", dokumentIds);
    if (dokErr) throw dokErr;

    const { data: rechnungRows, error: rechnungErr } = await supabase
      .from("rechnungen")
      .select("id, dokument_id, rechnungsdatum")
      .in("dokument_id", dokumentIds);
    if (rechnungErr) throw rechnungErr;

    const dokumenteById = new Map((dokumentRows || []).map((d) => [d.id, d]));
    const rechnungByDokId = new Map((rechnungRows || []).map((row) => [row.dokument_id, row]));
    const nextMap = {};

    for (const link of (linkRows || [])) {
      const dok = dokumenteById.get(link.dokument_id);
      const rechnung = rechnungByDokId.get(link.dokument_id);
      if (!dok || !istRechnungsDokument(dok)) continue;
      if (!nextMap[link.entity_id]) nextMap[link.entity_id] = [];
      nextMap[link.entity_id].push({
        link_id: link.id,
        dokument_id: dok.id,
        rechnung_id: rechnung?.id || null,
        rechnungsdatum: rechnung?.rechnungsdatum || null,
        dateiname: dok.dateiname,
        datei_typ: dok.datei_typ,
        storage_pfad: dok.storage_pfad,
        created_at: link.created_at || null,
      });
    }

    Object.keys(nextMap).forEach((entityId) => {
      nextMap[entityId].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    });
    setBudgetRechnungMap(nextMap);
  }, []);

  // ─── Data Loading ───
  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      supabase.rpc("get_bewohner_overview")
        .then(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            setBewohner(
              data.map((b) => ({
                id: b.id,
                name: b.display_name || b.name || "Bewohner",
                farbe: b.farbe || "#10B981",
                emoji: b.emoji || "👤",
              })),
            );
          }
        });

      supabase.from("home_budget_limits").select("*").eq("user_id", userId)
        .then(({ data }) => { if (data) setLimits(data); });

      supabase.from("home_sparziele").select("*").eq("user_id", userId).order("created_at")
        .then(({ data }) => { if (data) setSparziele(data); });

      // Finanzkonten laden (Proxy schreibt user_id → household_id um → lädt Haushaltskonten)
      supabase.from("home_finanzkonten").select("*").eq("user_id", userId).eq("aktiv", true).order("sortierung")
        .then(({ data }) => { if (data) setFinanzkonten(data); });

      await ensureRecurringBudgetEntries({ supabase, userId, appModi: ["home", "beides"] });

      const { data: refreshed, error: refreshError } = await supabase
        .from("budget_posten").select("*").eq("user_id", userId)
        .in("app_modus", ["home", "beides"]).order("datum", { ascending: false });
      if (refreshError) throw refreshError;
      const finalPosten = refreshed || [];

      setPosten(finalPosten);
      await ladeBudgetRechnungen(finalPosten);
    } catch (e) {
      setFehler("Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [ladeBudgetRechnungen, userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // ─── CRUD ───
  const oeffneRechnungsVorschau = async (eintrag) => {
    const rechnungen = budgetRechnungMap[eintrag?.id] || [];
    if (rechnungen.length === 0) return;

    const erste = rechnungen[0];
    setRechnungVorschau({
      dokument_id: erste.dokument_id,
      dateiname: erste.dateiname,
      datei_typ: erste.datei_typ,
      url: null,
      loading: true,
      fehler: null,
    });

    try {
      const { data, error } = await supabase.storage
        .from("user-dokumente")
        .createSignedUrl(erste.storage_pfad, 60 * 30);
      if (error || !data?.signedUrl) {
        throw new Error("Signed URL konnte nicht erstellt werden.");
      }
      setRechnungVorschau((prev) => (prev ? { ...prev, url: data.signedUrl, loading: false } : prev));
    } catch (err) {
      setRechnungVorschau((prev) => (prev ? { ...prev, loading: false, fehler: err.message } : prev));
    }
  };

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    try {
      if (modal?.id) {
        const verknuepfteRechnung = (budgetRechnungMap[modal.id] || []).find((eintrag) => eintrag.rechnung_id);
        if (verknuepfteRechnung?.rechnung_id) {
          await syncInvoiceDate({
            supabase,
            rechnungId: verknuepfteRechnung.rechnung_id,
            neuesDatum: daten.datum,
            userId,
          });

          const { datum, ...rest } = daten;
          if (Object.keys(rest).length > 0) {
            await supabase.from("budget_posten").update(rest).eq("id", modal.id);
          }
        } else {
          await supabase.from("budget_posten").update(daten).eq("id", modal.id);
        }
      } else {
        await supabase.from("budget_posten").insert(payload);
      }
      setModal(null);
      ladeDaten();
    } catch (err) {
      setFehler(`Speichern fehlgeschlagen: ${err.message}`);
    }
  };

  const loesche = async (eintrag) => {
    const id = eintrag?.id;
    if (!id) return;

    // Vorlage (wiederholen=true): zugehörige Occurrences mitlöschen
    if (eintrag.wiederholen) {
      const { data: occurrences } = await supabase
        .from("budget_posten").select("id").eq("ursprung_template_id", id);
      const anzahl = (occurrences || []).length;
      const msg = anzahl > 0
        ? `Wiederkehrende Zahlung und ${anzahl} zugehörige Buchung${anzahl !== 1 ? "en" : ""} löschen?`
        : "Wiederkehrende Zahlung löschen?";
      if (!window.confirm(msg)) return;
      if (anzahl > 0) {
        await supabase.from("budget_posten").delete().eq("ursprung_template_id", id);
      }
      await supabase.from("budget_posten").delete().eq("id", id);
      ladeDaten();
      return;
    }

    const verknuepfteRechnungen = budgetRechnungMap[id] || [];
    if (verknuepfteRechnungen.length === 0) {
      if (!window.confirm("Eintrag löschen?")) return;
      await supabase.from("budget_posten").delete().eq("id", id);
      ladeDaten();
      return;
    }

    setRechnungsLoeschDialog({ eintrag, rechnungen: verknuepfteRechnungen });
  };

  const loescheNurBudget = async () => {
    if (!rechnungsLoeschDialog?.eintrag?.id) return;
    setLoeschenLaeuft(true);
    try {
      const budgetId = rechnungsLoeschDialog.eintrag.id;
      const { error: budgetErr } = await supabase.from("budget_posten").delete().eq("id", budgetId);
      if (budgetErr) throw budgetErr;

      const { error: linkErr } = await supabase
        .from("dokument_links")
        .delete()
        .eq("entity_type", "budget_posten")
        .eq("entity_id", budgetId);
      if (linkErr) throw linkErr;

      setRechnungsLoeschDialog(null);
      await ladeDaten();
    } catch (err) {
      setFehler(`Löschen fehlgeschlagen: ${err.message}`);
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  const loescheKomplett = async () => {
    if (!rechnungsLoeschDialog?.rechnungen?.length) return;
    setLoeschenLaeuft(true);
    try {
      const dokumentIds = Array.from(
        new Set(rechnungsLoeschDialog.rechnungen.map((r) => r.dokument_id).filter(Boolean)),
      );
      for (const dokumentId of dokumentIds) {
        await deleteInvoiceCascade({ supabase, dokumentId });
      }

      setRechnungsLoeschDialog(null);
      await ladeDaten();
    } catch (err) {
      setFehler(`Komplett-Löschung fehlgeschlagen: ${err.message}`);
    } finally {
      setLoeschenLaeuft(false);
    }
  };

  const speichereLimit = async (kategorie, wert) => {
    const euro = parseFloat(wert);
    if (isNaN(euro) || euro < 0) return;
    await supabase.from("home_budget_limits").upsert(
      { user_id: userId, kategorie, limit_euro: euro },
      { onConflict: "household_id,kategorie" },
    );
    setLimitsEdit(p => { const n = { ...p }; delete n[kategorie]; return n; });
    supabase.from("home_budget_limits").select("*").eq("user_id", userId)
      .then(({ data }) => { if (data) setLimits(data); });
  };

  const speichereSparziel = async (daten) => {
    const payload = {
      user_id: userId,
      name: daten.name,
      ziel_betrag: parseFloat(daten.ziel_betrag),
      aktueller_betrag: parseFloat(daten.aktueller_betrag) || 0,
      zieldatum: daten.zieldatum || null,
      farbe: daten.farbe,
      emoji: daten.emoji,
      updated_at: new Date().toISOString(),
    };
    if (sparzieleModal?.id) {
      await supabase.from("home_sparziele").update(payload).eq("id", sparzieleModal.id);
    } else {
      await supabase.from("home_sparziele").insert(payload);
    }
    setSparzieleModal(null);
    supabase.from("home_sparziele").select("*").eq("user_id", userId).order("created_at")
      .then(({ data }) => { if (data) setSparziele(data); });
  };

  const loescheSparziel = async (id) => {
    if (!window.confirm("Sparziel löschen?")) return;
    await supabase.from("home_sparziele").delete().eq("id", id);
    setSparziele(p => p.filter(s => s.id !== id));
  };

  const einzahlen = async () => {
    if (!einzahlenModal || !einzahlenBetrag) return;
    const neu = Number(einzahlenModal.aktueller_betrag) + parseFloat(einzahlenBetrag);
    await supabase.from("home_sparziele").update({ aktueller_betrag: neu, updated_at: new Date().toISOString() }).eq("id", einzahlenModal.id);
    setSparziele(p => p.map(s => s.id === einzahlenModal.id ? { ...s, aktueller_betrag: neu } : s));
    setEinzahlenModal(null);
    setEinzahlenBetrag("");
  };

  const navigiereMonat = (delta) => {
    let m = selMonat + delta, j = selJahr;
    if (m < 0) { m = 11; j--; }
    if (m > 11) { m = 0; j++; }
    setSelMonat(m); setSelJahr(j);
  };

  // ─── Computed Values ───
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const selMonatStart     = new Date(selJahr, selMonat, 1);
  const isFutureMonth     = zeitraum === "monat" && selMonatStart > currentMonthStart;

  /** Projiziertes Datum eines Templates für den aktuell gewählten Monat berechnen */
  const getProjiziertesDatum = (p) => {
    if (!isFutureMonth || !p.wiederholen || !p.naechstes_datum || !p.intervall) return p.datum;
    const targetStart = `${selJahr}-${String(selMonat + 1).padStart(2, "0")}-01`;
    let projected = p.naechstes_datum;
    let iterations = 0;
    while (projected < targetStart && iterations < 500) {
      projected = calcNaechstesDatum(projected, p.intervall);
      iterations++;
    }
    const pd = new Date(projected + "T00:00:00");
    return (pd.getFullYear() === selJahr && pd.getMonth() === selMonat) ? projected : p.datum;
  };

  const nachZeitraumGefiltert = posten.filter(p => {
    if (zeitraum === "alle" || !p.datum) return true;
    const d = new Date(p.datum + "T00:00:00"); // T00:00:00 verhindert UTC-Offset-Fehler für den 1. des Monats
    if (zeitraum === "jahr") return d.getFullYear() === selJahr;
    if (d.getFullYear() === selJahr && d.getMonth() === selMonat) return true;
    // Zukunftsmonat: wiederkehrende Templates mitanzeigen — naechstes_datum iterativ vorwärtsprojizieren
    if (isFutureMonth && p.wiederholen && p.naechstes_datum && p.intervall) {
      const targetStart = `${selJahr}-${String(selMonat + 1).padStart(2, "0")}-01`;
      let projected = p.naechstes_datum;
      let iterations = 0;
      while (projected < targetStart && iterations < 500) {
        projected = calcNaechstesDatum(projected, p.intervall);
        iterations++;
      }
      const pd = new Date(projected + "T00:00:00");
      if (pd.getFullYear() === selJahr && pd.getMonth() === selMonat) {
        return !p.ende_datum || projected <= p.ende_datum;
      }
      return false;
    }
    return false;
  });

  // Vollständig gefilterte Menge — Basis für Karten UND Liste
  const sichtbarePosten = nachZeitraumGefiltert.filter(p => {
    if (kategFilter    && p.kategorie   !== kategFilter)                          return false;
    if (bewohnerFilter && p.bewohner_id !== bewohnerFilter)                       return false;
    if (scopeFilter !== "alle" && (p.budget_scope || "haushalt") !== scopeFilter) return false;
    return true;
  });

  const gefiltertPosten = sichtbarePosten.filter(p => (p.typ || "ausgabe") !== "einnahme");

  // Karten-Summen aus sichtbarePosten (konsistent mit der angezeigten Liste)
  const ausgabenHaushalt = sumScope(sichtbarePosten, "haushalt");
  const ausgabenPrivat   = sumScope(sichtbarePosten, "privat");
  // Rückwärtskompatible Variable für bestehende Logik (z.B. speichereLimit)
  const zeitraumLabel = zeitraum === "alle" ? "Alle"
    : zeitraum === "monat" ? `${MONATE[selMonat]} ${selJahr}` : `Jahr ${selJahr}`;

  const bewohnerById = useMemo(
    () => Object.fromEntries((bewohner || []).map((eintrag) => [eintrag.id, eintrag])),
    [bewohner],
  );

  const kontoById = useMemo(
    () => Object.fromEntries((finanzkonten || []).map((konto) => [konto.id, konto])),
    [finanzkonten],
  );

  const overviewCtx = useMemo(
    () => ({
      bewohnerById,
      kontoById,
      budgetRechnungMap,
      isFutureMonth,
      selJahr,
      selMonat,
    }),
    [bewohnerById, kontoById, budgetRechnungMap, isFutureMonth, selJahr, selMonat],
  );

  const overviewBasis = useMemo(
    () =>
      nachZeitraumGefiltert.filter((p) => {
        if (kategFilter && p.kategorie !== kategFilter) return false;
        if (bewohnerFilter && p.bewohner_id !== bewohnerFilter) return false;
        if (scopeFilter !== "alle" && (p.budget_scope || "haushalt") !== scopeFilter) return false;
        return true;
      }),
    [nachZeitraumGefiltert, kategFilter, bewohnerFilter, scopeFilter],
  );

  const overviewMitQuickFiltern = useMemo(
    () =>
      overviewBasis.filter((p) => {
        if (nurWiederkehrend && !(p.wiederholen || p.ursprung_template_id)) return false;
        if (nurMitRechnung && !(budgetRechnungMap[p.id] || []).length) return false;
        return true;
      }),
    [overviewBasis, nurWiederkehrend, nurMitRechnung, budgetRechnungMap],
  );

  const overviewMitSuche = useMemo(
    () =>
      overviewMitQuickFiltern.filter((entry) => matchBudgetSearch(entry, suchbegriff, overviewCtx)),
    [overviewMitQuickFiltern, suchbegriff, overviewCtx],
  );

  const gefilterteUebersichtPosten = useMemo(
    () => overviewMitSuche.filter((p) => (p.typ || "ausgabe") !== "einnahme"),
    [overviewMitSuche],
  );

  const sortierteUebersichtPosten = useMemo(
    () => sortBudgetEntries(gefilterteUebersichtPosten, sortierung, overviewCtx),
    [gefilterteUebersichtPosten, sortierung, overviewCtx],
  );

  const gruppierteUebersichtPosten = useMemo(
    () => groupBudgetEntries(sortierteUebersichtPosten, gruppierung, overviewCtx),
    [sortierteUebersichtPosten, gruppierung, overviewCtx],
  );

  const overviewKpis = useMemo(
    () => computeBudgetOverviewKpis(gefilterteUebersichtPosten),
    [gefilterteUebersichtPosten],
  );

  useEffect(() => {
    setExpandedRows({});
  }, [
    zeitraum,
    selJahr,
    selMonat,
    kategFilter,
    bewohnerFilter,
    scopeFilter,
    suchbegriff,
    sortierung,
    gruppierung,
    nurWiederkehrend,
    nurMitRechnung,
  ]);

  const resetOverviewFilter = useCallback(() => {
    setSuchbegriff("");
    setKategFilter("");
    setBewohnerFilter("");
    setScopeFilter("alle");
    setNurWiederkehrend(false);
    setNurMitRechnung(false);
    setSortierung("datum_desc");
    setGruppierung("tag");
  }, []);

  const aktiveFilter = [
    kategFilter
      ? {
          id: "kategorie",
          label: `Kategorie: ${kategFilter}`,
          onRemove: () => setKategFilter(""),
        }
      : null,
    bewohnerFilter && bewohnerById[bewohnerFilter]
      ? {
          id: "person",
          label: `Person: ${bewohnerById[bewohnerFilter].name}`,
          onRemove: () => setBewohnerFilter(""),
        }
      : null,
    scopeFilter !== "alle"
      ? {
          id: "scope",
          label: `Scope: ${scopeFilter === "privat" ? "Privat" : "Haushalt"}`,
          onRemove: () => setScopeFilter("alle"),
        }
      : null,
    nurWiederkehrend
      ? {
          id: "wiederkehrend",
          label: "Nur wiederkehrend",
          onRemove: () => setNurWiederkehrend(false),
        }
      : null,
    nurMitRechnung
      ? {
          id: "rechnung",
          label: "Nur mit Rechnung",
          onRemove: () => setNurMitRechnung(false),
        }
      : null,
  ].filter(Boolean);

  // ─── Statistik-Basismenge: Scope-Filter, aber kein Kategorie-/Bewohner-Filter ───
  const statsYearView = useMemo(
    () =>
      buildYearStatsData({
        posten,
        selJahr,
        scopeFilter,
        kategorien: HOME_KATEGORIEN,
        kategoriefarben: KATEGORIE_FARBEN,
        monate: MONATE,
      }),
    [posten, selJahr, scopeFilter],
  );

  const statsMonthView = useMemo(
    () =>
      buildMonthStatsData({
        posten,
        selJahr,
        selMonat,
        scopeFilter,
        kategorien: HOME_KATEGORIEN,
        kategoriefarben: KATEGORIE_FARBEN,
      }),
    [posten, selJahr, selMonat, scopeFilter],
  );

  const cashflowView = useMemo(
    () =>
      buildCashflowPreview({
        posten,
        scopeFilter,
        fromDateIso: getLocalDateString(today),
      }),
    [posten, scopeFilter, today],
  );

  const limitsCurrentMonth = today.getMonth();
  const limitsCurrentYear = today.getFullYear();
  const limitsMonthLabel = `${MONATE[limitsCurrentMonth]} ${limitsCurrentYear}`;

  const limitRowsView = useMemo(
    () =>
      HOME_KATEGORIEN.map((kategorie) => {
        const limit = limits.find((entry) => entry.kategorie === kategorie);
        const limitEuro = Number(limit?.limit_euro || 0);
        const verbrauch = posten
          .filter((entry) => {
            if ((entry.typ || "ausgabe") === "einnahme" || entry.kategorie !== kategorie || !entry.datum) return false;
            if ((entry.budget_scope || "haushalt") !== "haushalt") return false;
            const datum = new Date(`${entry.datum}T00:00:00`);
            return datum.getFullYear() === limitsCurrentYear && datum.getMonth() === limitsCurrentMonth;
          })
          .reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0);

        const progress = getLimitProgress({ verbrauch, limitEuro });
        const status = getLimitStatus({ verbrauch, limitEuro });

        return {
          kategorie,
          color: KATEGORIE_FARBEN[kategorie],
          limitEuro,
          verbrauch,
          progress,
          status,
          meta: formatLimitMeta({ verbrauch, limitEuro, progress, status, fmt }),
        };
      }),
    [limits, posten, limitsCurrentMonth, limitsCurrentYear],
  );

  const goalGroupsView = useMemo(
    () =>
      groupGoalsByStatus(sparziele).map((group) => ({
        ...group,
        items: group.items.map((ziel) => ({
          ziel,
          meta: {
            progress: getGoalProgress(ziel),
            status: getGoalStatus(ziel),
            restbetrag: getGoalRestbetrag(ziel),
            monatlichNoetig: getGoalMonatlichNoetig(ziel, today),
          },
        })),
      })),
    [sparziele, today],
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
    </div>
  );

  const TABS = [
    { id: "uebersicht", label: "Übersicht", icon: Wallet },
    { id: "statistiken", label: "Statistiken", icon: BarChart2 },
    { id: "limits", label: "Limits", icon: TrendingUp },
    { id: "ziele", label: "Ziele", icon: Target },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">Finanzmanager</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30 transition-colors"
          >
            <Sparkles size={15} /><span className="hidden sm:inline">KI</span>
          </button>
          <button
            data-tour="tour-budget-hinzufuegen"
            onClick={() => setModal({})}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium whitespace-nowrap shrink-0"
          >
            <Plus size={14} />Eintrag
          </button>
        </div>
      </div>

      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      {/* Tab Navigation */}
      <div data-tour="tour-budget-tabs" className="flex gap-1 bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setAktiverTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-card-sm text-xs font-medium transition-colors ${
              aktiverTab === tab.id
                ? "bg-primary-500 text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
          >
            <tab.icon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════ TAB: ÜBERSICHT ════════════ */}
      {aktiverTab === "uebersicht" && (
        <>
          <BudgetFilterBar
            suchbegriff={suchbegriff}
            onSuche={setSuchbegriff}
            zeitraum={zeitraum}
            onZeitraum={setZeitraum}
            zeitraumLabel={zeitraumLabel}
            onPrevZeitraum={() => (zeitraum === "monat" ? navigiereMonat(-1) : setSelJahr((y) => y - 1))}
            onNextZeitraum={() => (zeitraum === "monat" ? navigiereMonat(1) : setSelJahr((y) => y + 1))}
            aktiveFilter={aktiveFilter}
            anzahlGefiltert={gefilterteUebersichtPosten.length}
            onOpenFilterSheet={() => setFilterSheetOffen(true)}
            onReset={resetOverviewFilter}
          />

          <BudgetKpiStrip
            haushaltSumme={overviewKpis.haushaltSumme}
            privatSumme={overviewKpis.privatSumme}
            anzahl={overviewKpis.anzahl}
          />

          {gefilterteUebersichtPosten.length === 0 ? (
            <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 py-12 text-center text-light-text-secondary dark:text-dark-text-secondary">
              <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Einträge im gewählten Zeitraum</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gruppierteUebersichtPosten.map((gruppe) => (
                <BudgetGroupSection
                  key={gruppe.key}
                  label={gruppierung === "keine" ? "" : gruppe.label}
                  count={gruppe.items.length}
                  items={gruppe.items}
                  renderItem={(entry) => (
                    <BudgetEntryRow
                      key={entry.id}
                      entry={entry}
                      ctx={overviewCtx}
                      isOpen={Boolean(expandedRows[entry.id])}
                      onToggle={() =>
                        setExpandedRows((prev) => ({
                          ...prev,
                          [entry.id]: !prev[entry.id],
                        }))
                      }
                      onEdit={setModal}
                      onDelete={loesche}
                      onPreviewInvoice={oeffneRechnungsVorschau}
                    />
                  )}
                />
              ))}
            </div>
          )}

          <BudgetFilterSheet
            offen={filterSheetOffen}
            onClose={() => setFilterSheetOffen(false)}
            kategFilter={kategFilter}
            onKategorie={setKategFilter}
            bewohnerFilter={bewohnerFilter}
            onBewohner={setBewohnerFilter}
            scopeFilter={scopeFilter}
            onScope={setScopeFilter}
            nurWiederkehrend={nurWiederkehrend}
            onNurWiederkehrend={setNurWiederkehrend}
            nurMitRechnung={nurMitRechnung}
            onNurMitRechnung={setNurMitRechnung}
            sortierung={sortierung}
            onSortierung={setSortierung}
            gruppierung={gruppierung}
            onGruppierung={setGruppierung}
            kategorien={HOME_KATEGORIEN}
            bewohner={bewohner}
            onReset={resetOverviewFilter}
          />

          {false && (
            <>

          {/* Ausgaben-Karten */}
          <div data-tour="tour-budget-uebersicht" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-card border p-3 text-center bg-red-500/10 border-red-500/20">
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Haushalt</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">{ausgabenHaushalt.toFixed(2)} €</p>
            </div>
            <div className="rounded-card border p-3 text-center bg-amber-500/10 border-amber-500/20">
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Privat</p>
              <p className="text-sm font-bold text-amber-400 tabular-nums">{ausgabenPrivat.toFixed(2)} €</p>
            </div>
            <div className="rounded-card border p-3 text-center bg-light-card dark:bg-canvas-2 border-light-border dark:border-dark-border">
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Buchungen</p>
              <p className="text-sm font-bold text-light-text-main dark:text-dark-text-main tabular-nums">{gefiltertPosten.length}</p>
            </div>
          </div>

          {/* Filter-Leiste */}
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setKategFilter("")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  !kategFilter ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                }`}
              >
                Alle Kategorien
              </button>
              {HOME_KATEGORIEN.map(k => (
                <button
                  key={k}
                  onClick={() => setKategFilter(kategFilter === k ? "" : k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    kategFilter === k ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            {bewohner.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setBewohnerFilter("")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !bewohnerFilter ? "bg-teal-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                  }`}
                >
                  Alle Personen
                </button>
                {bewohner.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBewohnerFilter(b.id)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      bewohnerFilter === b.id ? "text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                    }`}
                    style={bewohnerFilter === b.id ? { backgroundColor: b.farbe } : {}}
                  >
                    {b.emoji} {b.name}
                  </button>
                ))}
              </div>
            )}
            {/* Scope-Filter */}
            <div className="flex gap-2 flex-wrap">
              {[["alle", "Alle"], ["haushalt", "Haushalt"], ["privat", "Privat"]].map(([s, l]) => (
                <button
                  key={s}
                  onClick={() => setScopeFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    scopeFilter === s
                      ? s === "privat" ? "bg-amber-500 text-white" : "bg-primary-500 text-white"
                      : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Eintrags-Liste */}
          {gefiltertPosten.length === 0 ? (
            <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
              <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Einträge im gewählten Zeitraum</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gefiltertPosten.map(p => {
                const verknuepfteRechnungen = budgetRechnungMap[p.id] || [];
                const hatRechnung = verknuepfteRechnungen.length > 0;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-3 group"
                  >
                  {/* Textblock: Beschreibung + Metadaten */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">{p.beschreibung}</p>
                        {(p.wiederholen || p.ursprung_template_id) && (
                          <RefreshCw size={12} className="text-secondary-400 flex-shrink-0" title={p.wiederholen ? `Wiederkehrend: ${p.intervall}` : "Wiederkehrende Zahlung"} />
                        )}
                        {p.budget_scope === "privat" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-medium flex-shrink-0">Privat</span>
                        )}
                      </div>
                      {/* Betrag auf Mobile (inline rechts neben Beschreibung) */}
                      <span className="sm:hidden font-semibold flex-shrink-0 tabular-nums text-sm text-red-400">
                        {Math.abs(Number(p.betrag)).toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap mt-0.5">
                      <span>{p.kategorie}</span>
                      <span>{getProjiziertesDatum(p)}</span>
                      <BewohnerBadge bewohner={bewohner.find(b => b.id === p.bewohner_id)} />
                    </div>
                  </div>
                  {/* Aktionsbereich: Rechnung + Betrag (Desktop) + Edit/Löschen */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                    {hatRechnung && (
                      <button
                        onClick={() => oeffneRechnungsVorschau(p)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-card-sm border border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors flex-shrink-0"
                      >
                        <FileText size={12} />
                        <span className="hidden sm:inline">Rechnung</span>
                      </button>
                    )}
                    {/* Betrag auf Desktop */}
                    <span className="hidden sm:block font-semibold flex-shrink-0 tabular-nums text-red-400 w-24 text-right">
                      {Math.abs(Number(p.betrag)).toFixed(2)} €
                    </span>
                    <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => setModal(p)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => loesche(p)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </>
      )}

      {/* ════════════ TAB: STATISTIKEN ════════════ */}
      {/* Budget Statistiken */}
      {aktiverTab === "statistiken" && (
        <div className="space-y-4">
          <BudgetStatsHeader
            modus={statistikModus}
            onModusChange={setStatistikModus}
            navigatorLabel={statistikModus === "jahr" ? `${selJahr}` : `${MONATE[selMonat]} ${selJahr}`}
            onPrev={() => (statistikModus === "jahr" ? setSelJahr((jahr) => jahr - 1) : navigiereMonat(-1))}
            onNext={() => (statistikModus === "jahr" ? setSelJahr((jahr) => jahr + 1) : navigiereMonat(1))}
          />

          <BudgetStatsKpiStrip
            modus={statistikModus}
            yearStats={statsYearView}
            monthStats={statsMonthView}
          />

          <BudgetStatsCharts
            modus={statistikModus}
            yearStats={statsYearView}
            monthStats={statsMonthView}
            selJahr={selJahr}
            monatLabel={`${MONATE[selMonat]} ${selJahr}`}
          />

          <BudgetCashflowList
            items={cashflowView.items}
            total={cashflowView.total}
            count={cashflowView.count}
          />
        </div>
      )}
      {/* Budget Limits */}
      {aktiverTab === "limits" && (
        <div data-tour="tour-budget-limits" className="space-y-3">
          <BudgetLimitsList
            monatLabel={`Monatliche Budgetlimits fuer ${limitsMonthLabel}. Klicke auf den Limit-Betrag zum Bearbeiten.`}
            rows={limitRowsView}
            limitsEdit={limitsEdit}
            onStartEdit={(kategorie, limitEuro) => setLimitsEdit((prev) => ({ ...prev, [kategorie]: String(limitEuro || 0) }))}
            onChangeEdit={(kategorie, value) => setLimitsEdit((prev) => ({ ...prev, [kategorie]: value }))}
            onSave={speichereLimit}
            onCancel={(kategorie) => setLimitsEdit((prev) => {
              const next = { ...prev };
              delete next[kategorie];
              return next;
            })}
          />

          <BudgetAccountsSection
            konten={finanzkonten}
            bewohnerById={bewohnerById}
            onAdd={() => { setKontenFormDaten({}); setKontenFormOffen(true); }}
            onEdit={(konto) => { setKontenFormDaten(konto); setKontenFormOffen(true); }}
          />
        </div>
      )}
      {/* Budget Ziele */}
      {aktiverTab === "ziele" && (
        <div data-tour="tour-budget-sparziele">
          <BudgetGoalsList
            groups={goalGroupsView}
            today={today}
            onCreate={() => setSparzieleModal({})}
            onEdit={setSparzieleModal}
            onDelete={loescheSparziel}
            onDeposit={(ziel) => {
              setEinzahlenModal(ziel);
              setEinzahlenBetrag("");
            }}
          />
        </div>
      )}
      {rechnungVorschau && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)] flex items-center justify-center"
          onClick={() => setRechnungVorschau(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] flex flex-col rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main truncate pr-2">
                Rechnungsvorschau: {rechnungVorschau.dateiname || "Dokument"}
              </h3>
              <button onClick={() => setRechnungVorschau(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {rechnungVorschau.loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
                </div>
              ) : rechnungVorschau.fehler ? (
                <div className="h-full flex items-center justify-center text-sm text-red-500">
                  {rechnungVorschau.fehler}
                </div>
              ) : rechnungVorschau.url ? (
                rechnungVorschau.datei_typ === "application/pdf" ? (
                  <iframe
                    src={rechnungVorschau.url}
                    title={rechnungVorschau.dateiname || "Rechnung"}
                    className="w-full h-full rounded-card-sm border border-light-border dark:border-dark-border bg-white"
                  />
                ) : (
                  <img
                    src={rechnungVorschau.url}
                    alt={rechnungVorschau.dateiname || "Rechnung"}
                    className="w-full h-full object-contain rounded-card-sm"
                  />
                )
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Keine Vorschau verfügbar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {rechnungsLoeschDialog && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)] flex items-center justify-center">
          <div className="w-full max-w-md rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3">
            <div className="p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                Rechnung verknüpft
              </h3>
              <p className="text-xs mt-1 text-light-text-secondary dark:text-dark-text-secondary">
                Soll nur der Budgeteintrag entfernt werden oder die komplette Rechnung aus der Datenbank?
              </p>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => setRechnungsLoeschDialog(null)}
                disabled={loeschenLaeuft}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                Abbrechen
              </button>
              <button
                onClick={loescheNurBudget}
                disabled={loeschenLaeuft}
                className="w-full px-3 py-2 text-sm rounded-card-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
              >
                {loeschenLaeuft ? "Bitte warten..." : "Nur aus Budget löschen"}
              </button>
              <button
                onClick={loescheKomplett}
                disabled={loeschenLaeuft}
                className="w-full px-3 py-2 text-sm rounded-pill bg-red-500 text-white hover:bg-red-600"
              >
                {loeschenLaeuft ? "Bitte warten..." : "Komplett aus DB löschen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal !== null && (
        <ModalWrapper title={modal.id ? "Eintrag bearbeiten" : "Neuer Eintrag"} onClose={() => setModal(null)}>
          <BudgetForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} bewohner={bewohner} finanzkonten={finanzkonten} />
        </ModalWrapper>
      )}

      {sparzieleModal !== null && (
        <ModalWrapper
          title={sparzieleModal.id ? "Sparziel bearbeiten" : "Neues Sparziel"}
          onClose={() => setSparzieleModal(null)}
        >
          <SparzieleModal
            initial={sparzieleModal.id ? sparzieleModal : null}
            onSpeichern={speichereSparziel}
            onAbbrechen={() => setSparzieleModal(null)}
          />
        </ModalWrapper>
      )}

      {einzahlenModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)]">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-sm w-full border border-light-border dark:border-dark-border">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {einzahlenModal.emoji} Einzahlen
              </h3>
              <button onClick={() => setEinzahlenModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Aktuell: {fmt(einzahlenModal.aktueller_betrag)} / {fmt(einzahlenModal.ziel_betrag)}
              </p>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Betrag (€)*</label>
                <input
                  type="number" step="0.01" min="0"
                  value={einzahlenBetrag}
                  onChange={e => setEinzahlenBetrag(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && einzahlenBetrag) einzahlen(); }}
                  placeholder="0,00"
                  autoFocus
                  className={INPUT_CLS}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEinzahlenModal(null)} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
                  Abbrechen
                </button>
                <button
                  onClick={einzahlen}
                  disabled={!einzahlenBetrag}
                  className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
                >
                  Einzahlen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.budget}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {/* Finanzkonten-Modal */}
      {kontenFormOffen && (
        <ModalWrapper
          title={kontenFormDaten?.id ? "Konto bearbeiten" : "Neues Konto"}
          onClose={() => { setKontenFormOffen(false); setKontenFormDaten(null); }}
        >
          <KontoForm
            initial={kontenFormDaten}
            bewohner={bewohner}
            onSpeichern={async (daten) => {
              if (daten.id) {
                await supabase.from("home_finanzkonten").update(daten).eq("id", daten.id);
              } else {
                await supabase.from("home_finanzkonten").insert({ ...daten, user_id: userId });
              }
              setKontenFormOffen(false);
              setKontenFormDaten(null);
              supabase.from("home_finanzkonten").select("*").eq("user_id", userId).eq("aktiv", true).order("sortierung")
                .then(({ data }) => { if (data) setFinanzkonten(data); });
            }}
            onDeaktivieren={async (id) => {
              if (!window.confirm("Konto deaktivieren? Bestehende Buchungen behalten die Referenz.")) return;
              await supabase.from("home_finanzkonten").update({ aktiv: false }).eq("id", id);
              setKontenFormOffen(false);
              setKontenFormDaten(null);
              setFinanzkonten(p => p.filter(k => k.id !== id));
            }}
            onAbbrechen={() => { setKontenFormOffen(false); setKontenFormDaten(null); }}
          />
        </ModalWrapper>
      )}

      {/* KI-Assistent — budget_scope wird als "haushalt" Default gesetzt */}
      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="budget"
          onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              const datum = new Date().toISOString().split("T")[0];
              const naechstesDatum = item.wiederholen && item.intervall ? calcNaechstesDatum(datum, item.intervall) : null;
              await supabase.from("budget_posten").insert({
                user_id: session.user.id,
                beschreibung: item.beschreibung || "Zahlung",
                betrag: item.betrag || 0,
                kategorie: item.kategorie || null,
                typ: item.typ || "ausgabe",
                datum,
                app_modus: "home",
                budget_scope: "haushalt",
                wiederholen: item.wiederholen || false,
                intervall: item.intervall || null,
                naechstes_datum: naechstesDatum,
              });
            }
            ladeDaten();
          }}
        />
      )}
    </div>
  );
};

export default HomeBudget;

