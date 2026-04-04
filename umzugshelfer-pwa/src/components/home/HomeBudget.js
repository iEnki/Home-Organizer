import React, { useState, useEffect, useCallback } from "react";
import {
  DollarSign, Plus, Edit2, Trash2, X, Loader2, AlertCircle,
  Calendar, ChevronLeft, ChevronRight, Sparkles, RefreshCw,
  Target, TrendingUp, BarChart2, PiggyBank, Wallet, Check, FileText,
} from "lucide-react";
import { motion } from "framer-motion";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Filler,
} from "chart.js";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";
import { calcNaechstesDatum, ensureRecurringBudgetEntries, getLocalDateString } from "../../utils/budgetRecurring";
import { sumScope } from "../../utils/budgetAggregation";
import { syncInvoiceDate } from "../../utils/invoiceDateSync";

ChartJS.register(
  ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Filler,
);

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

const CHART_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "rgba(156,163,175,1)", font: { size: 11 } } } },
};
const SCALE_OPTS = {
  grid: { color: "rgba(75,85,99,0.3)" },
  ticks: { color: "rgba(156,163,175,1)", font: { size: 10 } },
};

// ─────────────── Helpers ───────────────
const fmt = (n) => Number(n || 0).toFixed(2) + " €";
const istRechnungsDokument = (dok) => {
  const kategorie = String(dok?.kategorie || "").trim().toLowerCase();
  const dokumentTyp = String(dok?.dokument_typ || "").trim().toLowerCase();
  return kategorie === "rechnung" || dokumentTyp === "rechnung";
};

// ─────────────── Sub-Components ───────────────
const BewohnerBadge = ({ bewohner }) => {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ backgroundColor: bewohner.farbe + "22", color: bewohner.farbe }}
    >
      {bewohner.emoji} {bewohner.name}
    </span>
  );
};

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
  const today = new Date();
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
  const ausgaben = ausgabenHaushalt + ausgabenPrivat;

  const zeitraumLabel = zeitraum === "alle" ? "Alle"
    : zeitraum === "monat" ? `${MONATE[selMonat]} ${selJahr}` : `Jahr ${selJahr}`;

  // ─── Statistik-Basismenge: Scope-Filter, aber kein Kategorie-/Bewohner-Filter ───
  const statistikBasisPosten = posten.filter(p => {
    if ((p.typ || "ausgabe") === "einnahme") return false;
    if (scopeFilter !== "alle" && (p.budget_scope || "haushalt") !== scopeFilter) return false;
    return true;
  });

  // ─── Chart Data ───
  const kategAusgaben = HOME_KATEGORIEN
    .map(k => ({
      name: k,
      summe: nachZeitraumGefiltert
        .filter(p => p.kategorie === k && (p.typ || "ausgabe") !== "einnahme" &&
          (scopeFilter === "alle" || (p.budget_scope || "haushalt") === scopeFilter))
        .reduce((s, p) => s + Math.abs(Number(p.betrag)), 0),
    }))
    .filter(k => k.summe > 0);

  const doughnutData = {
    labels: kategAusgaben.map(k => k.name),
    datasets: [{
      data: kategAusgaben.map(k => k.summe),
      backgroundColor: kategAusgaben.map(k => KATEGORIE_FARBEN[k.name] + "CC"),
      borderColor: kategAusgaben.map(k => KATEGORIE_FARBEN[k.name]),
      borderWidth: 1,
    }],
  };

  const monatsDaten = Array.from({ length: 12 }, (_, i) => {
    const mp = statistikBasisPosten.filter(p => {
      if (!p.datum) return false;
      const d = new Date(p.datum + "T00:00:00");
      return d.getFullYear() === selJahr && d.getMonth() === i;
    });
    return {
      ausgaben: mp.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0),
    };
  });

  const barData = {
    labels: MONATE,
    datasets: [
      {
        label: "Ausgaben",
        data: monatsDaten.map(m => m.ausgaben),
        backgroundColor: "rgba(239,68,68,0.7)",
        borderColor: "rgba(239,68,68,1)",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  let kumuliertAusgaben = 0;
  const lineData = {
    labels: MONATE,
    datasets: [{
      label: "Kumulierte Ausgaben",
      data: monatsDaten.map(m => { kumuliertAusgaben += m.ausgaben; return kumuliertAusgaben; }),
      borderColor: "rgba(239,68,68,1)",
      backgroundColor: "rgba(239,68,68,0.1)",
      fill: true,
      tension: 0.4,
      pointRadius: 3,
    }],
  };

  // ─── Monatsstatistik ───
  const statistikMonatPosten = statistikBasisPosten.filter(p => {
    if (!p.datum) return false;
    const d = new Date(p.datum + "T00:00:00");
    return d.getFullYear() === selJahr && d.getMonth() === selMonat;
  });
  const statistikMonatKateg = HOME_KATEGORIEN
    .map(k => ({
      name: k,
      summe: statistikMonatPosten.filter(p => p.kategorie === k).reduce((s, p) => s + Math.abs(Number(p.betrag)), 0),
    }))
    .filter(k => k.summe > 0)
    .sort((a, b) => b.summe - a.summe);
  const statistikMonatGesamt = statistikMonatPosten.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

  const barDataMonat = {
    labels: statistikMonatKateg.map(k => k.name),
    datasets: [{
      label: "Ausgaben",
      data: statistikMonatKateg.map(k => k.summe),
      backgroundColor: statistikMonatKateg.map(k => KATEGORIE_FARBEN[k.name] + "CC"),
      borderColor: statistikMonatKateg.map(k => KATEGORIE_FARBEN[k.name]),
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  const doughnutDataMonat = {
    labels: statistikMonatKateg.map(k => k.name),
    datasets: [{
      data: statistikMonatKateg.map(k => k.summe),
      backgroundColor: statistikMonatKateg.map(k => KATEGORIE_FARBEN[k.name] + "CC"),
      borderColor: statistikMonatKateg.map(k => KATEGORIE_FARBEN[k.name]),
      borderWidth: 1,
    }],
  };

  // Cashflow: scope-bewusst, 30-Tage-Grenze als ISO-String (getLocalDateString aus budgetRecurring)
  const in30Iso = getLocalDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const cashflow = posten
    .filter(p =>
      p.wiederholen &&
      p.naechstes_datum &&
      p.naechstes_datum <= in30Iso &&
      (scopeFilter === "alle" || (p.budget_scope || "haushalt") === scopeFilter)
    )
    .sort((a, b) => a.naechstes_datum.localeCompare(b.naechstes_datum));

  // Limits — nur Haushaltsausgaben messen (unabhaengig von scopeFilter)
  const aktuellerMonat = today.getMonth();
  const aktuellesJahr = today.getFullYear();
  const monatsVerbrauch = (kat) =>
    posten.filter(p => {
      if ((p.typ || "ausgabe") === "einnahme" || p.kategorie !== kat || !p.datum) return false;
      if ((p.budget_scope || "haushalt") !== "haushalt") return false;
      const d = new Date(p.datum + "T00:00:00");
      return d.getFullYear() === aktuellesJahr && d.getMonth() === aktuellerMonat;
    }).reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

  // Sparziele helpers
  const tageVerbleibend = (zieldatum) => {
    if (!zieldatum) return null;
    return Math.max(0, Math.ceil((new Date(zieldatum) - today) / 86400000));
  };
  const monatlichNoetig = (ziel) => {
    if (!ziel.zieldatum) return null;
    const d = new Date(ziel.zieldatum);
    const monate = Math.max(0.5, (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth());
    return Math.max(0, (Number(ziel.ziel_betrag) - Number(ziel.aktueller_betrag)) / monate);
  };

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
          {/* Zeitraum-Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Calendar size={15} className="text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
            <div className="flex gap-2 flex-wrap">
              {["monat", "jahr", "alle"].map(z => (
                <button
                  key={z}
                  onClick={() => setZeitraum(z)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    zeitraum === z
                      ? "bg-primary-500 text-white"
                      : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
                  }`}
                >
                  {z === "monat" ? "Monat" : z === "jahr" ? "Jahr" : "Alle"}
                </button>
              ))}
            </div>
            {zeitraum !== "alle" && (
              <div className="flex items-center gap-1 sm:ml-auto">
                <button
                  onClick={() => zeitraum === "monat" ? navigiereMonat(-1) : setSelJahr(y => y - 1)}
                  className="p-1 rounded-card-sm hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main px-2 min-w-[72px] sm:min-w-[90px] text-center">{zeitraumLabel}</span>
                <button
                  onClick={() => zeitraum === "monat" ? navigiereMonat(1) : setSelJahr(y => y + 1)}
                  className="p-1 rounded-card-sm hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

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

      {/* ════════════ TAB: STATISTIKEN ════════════ */}
      {aktiverTab === "statistiken" && (
        <div className="space-y-4">

          {/* Modus-Toggle */}
          <div className="flex gap-1 bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-1">
            {[["jahr", "Jahr", "Jahresansicht"], ["monat", "Monat", "Monatsansicht"]].map(([m, kurz, lang]) => (
              <button
                key={m}
                onClick={() => setStatistikModus(m)}
                className={`flex-1 py-1.5 rounded-card-sm text-xs font-medium transition-colors ${
                  statistikModus === m
                    ? "bg-primary-500 text-white"
                    : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
                }`}
              >
                <span className="sm:hidden">{kurz}</span>
                <span className="hidden sm:inline">{lang}</span>
              </button>
            ))}
          </div>

          {statistikModus === "jahr" ? (
            <>
              {/* Jahr-Navigator */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main">Jahresansicht</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelJahr(y => y - 1)} className="p-1 rounded hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-bold text-light-text-main dark:text-dark-text-main px-3">{selJahr}</span>
                  <button onClick={() => setSelJahr(y => y + 1)} className="p-1 rounded hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Doughnut: Ausgaben-Verteilung */}
              <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Ausgaben nach Kategorie</p>
                {kategAusgaben.length === 0 ? (
                  <p className="text-sm text-center text-light-text-secondary dark:text-dark-text-secondary py-8">Keine Ausgaben im Zeitraum</p>
                ) : (
                  <div className="h-40 sm:h-52">
                    <Doughnut data={doughnutData} options={{
                      ...CHART_OPTS_BASE,
                      plugins: {
                        ...CHART_OPTS_BASE.plugins,
                        tooltip: { callbacks: { label: c => `${c.label}: ${Number(c.raw).toFixed(2)} €` } },
                      },
                    }} />
                  </div>
                )}
              </div>

              {/* Bar: Ausgaben nach Monat */}
              <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Ausgaben nach Monat {selJahr}</p>
                <div className="h-40 sm:h-52">
                  <Bar data={barData} options={{
                    ...CHART_OPTS_BASE,
                    scales: {
                      x: SCALE_OPTS,
                      y: { ...SCALE_OPTS, ticks: { ...SCALE_OPTS.ticks, callback: v => `${v} €` } },
                    },
                    plugins: {
                      ...CHART_OPTS_BASE.plugins,
                      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(2)} €` } },
                    },
                  }} />
                </div>
              </div>

              {/* Line: Kumulierte Ausgaben */}
              <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Kumulierte Ausgaben {selJahr}</p>
                <div className="h-36 sm:h-48">
                  <Line data={lineData} options={{
                    ...CHART_OPTS_BASE,
                    scales: {
                      x: SCALE_OPTS,
                      y: { ...SCALE_OPTS, ticks: { ...SCALE_OPTS.ticks, callback: v => `${v} €` } },
                    },
                    plugins: {
                      ...CHART_OPTS_BASE.plugins,
                      tooltip: { callbacks: { label: c => `Kumuliert: ${Number(c.raw).toFixed(2)} €` } },
                    },
                  }} />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Monat-Navigator */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main">Monatsansicht</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => navigiereMonat(-1)} className="p-1 rounded hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-bold text-light-text-main dark:text-dark-text-main px-3 min-w-[72px] sm:min-w-[110px] text-center">
                    {MONATE[selMonat]} {selJahr}
                  </span>
                  <button onClick={() => navigiereMonat(1)} className="p-1 rounded hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {statistikMonatKateg.length === 0 ? (
                <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
                  <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Keine Ausgaben in {MONATE[selMonat]} {selJahr}</p>
                </div>
              ) : (
                <>
                  {/* Kennzahl */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-card border p-3 text-center bg-red-500/10 border-red-500/20">
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Gesamt</p>
                      <p className="text-sm font-bold text-red-400 tabular-nums">{statistikMonatGesamt.toFixed(2)} €</p>
                    </div>
                    <div className="rounded-card border p-3 text-center bg-light-card dark:bg-canvas-2 border-light-border dark:border-dark-border">
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorien</p>
                      <p className="text-sm font-bold text-light-text-main dark:text-dark-text-main tabular-nums">{statistikMonatKateg.length}</p>
                    </div>
                  </div>

                  {/* Doughnut: Kategorie-Verteilung */}
                  <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                    <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Verteilung nach Kategorie</p>
                    <div className="h-40 sm:h-52">
                      <Doughnut data={doughnutDataMonat} options={{
                        ...CHART_OPTS_BASE,
                        plugins: {
                          ...CHART_OPTS_BASE.plugins,
                          tooltip: { callbacks: { label: c => `${c.label}: ${Number(c.raw).toFixed(2)} €` } },
                        },
                      }} />
                    </div>
                  </div>

                  {/* Horizontales Bar: Kategorien nach Betrag */}
                  <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                    <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Ausgaben pro Kategorie</p>
                    <div style={{ height: `${Math.max(statistikMonatKateg.length * 36, 100)}px` }}>
                      <Bar data={barDataMonat} options={{
                        ...CHART_OPTS_BASE,
                        indexAxis: "y",
                        scales: {
                          x: { ...SCALE_OPTS, ticks: { ...SCALE_OPTS.ticks, callback: v => `${v} €` } },
                          y: SCALE_OPTS,
                        },
                        plugins: {
                          ...CHART_OPTS_BASE.plugins,
                          legend: { display: false },
                          tooltip: { callbacks: { label: c => `${Number(c.raw).toFixed(2)} €` } },
                        },
                      }} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Cashflow-Vorschau */}
          <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Cashflow — Nächste 30 Tage</p>
            {cashflow.length === 0 ? (
              <p className="text-sm text-center text-light-text-secondary dark:text-dark-text-secondary py-4">Keine fälligen Zahlungen</p>
            ) : (
              <div className="space-y-2">
                {cashflow.map(p => (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <span className="text-light-text-secondary dark:text-dark-text-secondary text-xs w-20 flex-shrink-0">{p.naechstes_datum}</span>
                    <span className="flex-1 text-light-text-main dark:text-dark-text-main truncate">{p.beschreibung}</span>
                    <RefreshCw size={11} className="text-secondary-400 flex-shrink-0" />
                    <span className="font-medium flex-shrink-0 tabular-nums text-red-400">
                      {Math.abs(Number(p.betrag)).toFixed(2)} €
                    </span>
                  </div>
                ))}
                {cashflow.length > 1 && (
                  <div className="border-t border-light-border dark:border-dark-border pt-2 flex justify-between text-sm">
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Gesamt 30 Tage</span>
                    <span className="font-semibold tabular-nums text-red-400">
                      {fmt(cashflow.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB: LIMITS ════════════ */}
      {aktiverTab === "limits" && (
        <div data-tour="tour-budget-limits" className="space-y-3">
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Monatliche Budgetlimits für {MONATE[aktuellerMonat]} {aktuellesJahr}. Klicke auf den Limit-Betrag zum Bearbeiten.
          </p>
          {HOME_KATEGORIEN.map(kat => {
            const limit = limits.find(l => l.kategorie === kat);
            const limitEuro = limit?.limit_euro || 0;
            const verbrauch = monatsVerbrauch(kat);
            const prozent = limitEuro > 0 ? Math.min((verbrauch / limitEuro) * 100, 100) : 0;
            const balkenFarbe = limitEuro === 0 ? "bg-canvas-3"
              : prozent >= 100 ? "bg-red-500"
              : prozent >= 75 ? "bg-amber-500"
              : "bg-green-500";
            const isEditing = kat in limitsEdit;

            return (
              <div key={kat} className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: KATEGORIE_FARBEN[kat] }} />
                    <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{kat}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary tabular-nums">{fmt(verbrauch)}</span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">/</span>
                        <input
                          type="number" step="10" min="0"
                          value={limitsEdit[kat]}
                          onChange={e => setLimitsEdit(p => ({ ...p, [kat]: e.target.value }))}
                          className="w-20 px-2 py-0.5 text-xs rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") speichereLimit(kat, limitsEdit[kat]); if (e.key === "Escape") setLimitsEdit(p => { const n = { ...p }; delete n[kat]; return n; }); }}
                        />
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">€</span>
                        <button onClick={() => speichereLimit(kat, limitsEdit[kat])} className="p-1 rounded text-green-400 hover:bg-green-500/10">
                          <Check size={13} />
                        </button>
                        <button onClick={() => setLimitsEdit(p => { const n = { ...p }; delete n[kat]; return n; })} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-red-400">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLimitsEdit(p => ({ ...p, [kat]: limitEuro.toString() }))}
                        className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors border-b border-dashed border-light-border dark:border-dark-border"
                      >
                        {limitEuro > 0 ? `/ ${fmt(limitEuro)}` : "Limit setzen"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-canvas-3 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${balkenFarbe}`}
                    initial={{ width: 0 }}
                    animate={{ width: limitEuro > 0 ? `${prozent}%` : "0%" }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                  />
                </div>
                {limitEuro === 0 && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">Kein Limit gesetzt</p>}
                {limitEuro > 0 && prozent >= 100 && <p className="text-xs text-red-400 mt-1">Budget überschritten!</p>}
                {limitEuro > 0 && prozent >= 75 && prozent < 100 && (
                  <p className="text-xs text-amber-400 mt-1">{(100 - prozent).toFixed(0)} % verbleibend</p>
                )}
              </div>
            );
          })}

          {/* Finanzkonten im Haushalt */}
          <div className="pt-2 border-t border-light-border dark:border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Konten im Haushalt</h4>
              <button
                onClick={() => { setKontenFormDaten({}); setKontenFormOffen(true); }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-pill"
              >
                <Plus size={12} /> Konto
              </button>
            </div>
            {finanzkonten.length === 0 ? (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Noch keine Konten angelegt.</p>
            ) : (
              <div className="space-y-2">
                {finanzkonten.map(k => (
                  <div key={k.id} className="flex items-center justify-between bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: k.farbe || "#10B981" }} />
                      <span className="text-sm text-light-text-main dark:text-dark-text-main">{k.name}</span>
                      <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">({k.konto_typ})</span>
                    </div>
                    <button
                      onClick={() => { setKontenFormDaten(k); setKontenFormOffen(true); }}
                      className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"
                    >
                      <Edit2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB: ZIELE ════════════ */}
      {aktiverTab === "ziele" && (
        <div data-tour="tour-budget-sparziele" className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setSparzieleModal({})}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium"
            >
              <Plus size={14} />Sparziel
            </button>
          </div>

          {sparziele.length === 0 ? (
            <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
              <PiggyBank size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Noch keine Sparziele angelegt</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sparziele.map(ziel => {
                const zielBetrag = Number(ziel.ziel_betrag);
                const aktuell = Number(ziel.aktueller_betrag);
                const prozent = Math.min((aktuell / Math.max(zielBetrag, 1)) * 100, 100);
                const tage = tageVerbleibend(ziel.zieldatum);
                const monatlich = monatlichNoetig(ziel);
                const erreicht = aktuell >= zielBetrag;

                return (
                  <div key={ziel.id} className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{ziel.emoji}</span>
                        <div>
                          <p className="font-medium text-light-text-main dark:text-dark-text-main text-sm">{ziel.name}</p>
                          {ziel.zieldatum && (
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              {tage === 0 ? "Heute fällig!" : `Noch ${tage} Tage`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setSparzieleModal(ziel)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => loescheSparziel(ziel.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-light-text-secondary dark:text-dark-text-secondary tabular-nums">{fmt(aktuell)}</span>
                        <span className="font-medium tabular-nums" style={{ color: ziel.farbe }}>{prozent.toFixed(0)} %</span>
                        <span className="text-light-text-secondary dark:text-dark-text-secondary tabular-nums">{fmt(zielBetrag)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-canvas-3 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: ziel.farbe }}
                          initial={{ width: 0 }}
                          animate={{ width: `${prozent}%` }}
                          transition={{ duration: 0.65, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                    {!erreicht && monatlich !== null && (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary tabular-nums">
                        {fmt(monatlich)} / Monat notwendig
                      </p>
                    )}
                    {erreicht && <p className="text-xs text-green-400 font-medium">🎉 Ziel erreicht!</p>}
                    {!erreicht && (
                      <button
                        onClick={() => { setEinzahlenModal(ziel); setEinzahlenBetrag(""); }}
                        className="w-full py-1.5 text-xs font-medium rounded-card-sm border text-center transition-colors hover:opacity-80"
                        style={{ borderColor: ziel.farbe + "66", color: ziel.farbe }}
                      >
                        + Einzahlen
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════ MODALS ════════════ */}
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

