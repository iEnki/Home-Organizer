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
const calcNaechstesDatum = (datum, intervallStr) => {
  const d = new Date(datum);
  const map = {
    "Täglich": () => d.setDate(d.getDate() + 1),
    "Wöchentlich": () => d.setDate(d.getDate() + 7),
    "Monatlich": () => d.setMonth(d.getMonth() + 1),
    "Vierteljährlich": () => d.setMonth(d.getMonth() + 3),
    "Jährlich": () => d.setFullYear(d.getFullYear() + 1),
  };
  (map[intervallStr] || (() => {}))();
  return d.toISOString().split("T")[0];
};

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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
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

const BudgetForm = ({ initial, onSpeichern, onAbbrechen, bewohner }) => {
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

  const handleSpeichern = () => {
    if (!form.beschreibung.trim() || !form.betrag) return;
    const naechstesDatum = wiederholen ? calcNaechstesDatum(form.datum, intervall) : null;
    onSpeichern({
      ...form,
      betrag: Math.abs(Number(form.betrag)),
      wiederholen,
      intervall: wiederholen ? intervall : null,
      naechstes_datum: naechstesDatum,
      bewohner_id: form.bewohner_id || null,
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
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Intervall</label>
          <select value={intervall} onChange={e => setIntervall(e.target.value)} className={INPUT_CLS}>
            {INTERVALL_OPTIONEN.map(o => <option key={o}>{o}</option>)}
          </select>
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

    const dokumenteById = new Map((dokumentRows || []).map((d) => [d.id, d]));
    const nextMap = {};

    for (const link of (linkRows || [])) {
      const dok = dokumenteById.get(link.dokument_id);
      if (!dok || !istRechnungsDokument(dok)) continue;
      if (!nextMap[link.entity_id]) nextMap[link.entity_id] = [];
      nextMap[link.entity_id].push({
        link_id: link.id,
        dokument_id: dok.id,
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

      const { data: postenData, error: postenError } = await supabase
        .from("budget_posten").select("*").eq("user_id", userId)
        .in("app_modus", ["home", "beides"]).order("datum", { ascending: false });
      if (postenError) throw postenError;

      const fetchedData = postenData || [];
      const todayStr = new Date().toISOString().split("T")[0];
      const faellige = fetchedData.filter(p => p.wiederholen && p.naechstes_datum && p.naechstes_datum <= todayStr);
      let finalPosten = fetchedData;

      for (const p of faellige) {
        const neuesDatum = calcNaechstesDatum(p.naechstes_datum, p.intervall);
        await supabase.from("budget_posten").insert({
          user_id: userId,
          beschreibung: p.beschreibung,
          betrag: p.betrag,
          kategorie: p.kategorie,
          datum: p.naechstes_datum,
          typ: p.typ || "ausgabe",
          app_modus: p.app_modus,
          bewohner_id: p.bewohner_id || null,
          wiederholen: true,
          intervall: p.intervall,
          naechstes_datum: neuesDatum,
        });
        await supabase.from("budget_posten").update({ naechstes_datum: neuesDatum }).eq("id", p.id);
      }

      if (faellige.length > 0) {
        const { data: refreshed } = await supabase.from("budget_posten").select("*").eq("user_id", userId)
          .in("app_modus", ["home", "beides"]).order("datum", { ascending: false });
        finalPosten = refreshed || [];
      }

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
    if (modal?.id) {
      await supabase.from("budget_posten").update(daten).eq("id", modal.id);
    } else {
      await supabase.from("budget_posten").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loesche = async (eintrag) => {
    const id = eintrag?.id;
    if (!id) return;

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
      { onConflict: "user_id,kategorie" },
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
  const nachZeitraumGefiltert = posten.filter(p => {
    if (zeitraum === "alle" || !p.datum) return true;
    const d = new Date(p.datum);
    if (zeitraum === "jahr") return d.getFullYear() === selJahr;
    return d.getFullYear() === selJahr && d.getMonth() === selMonat;
  });

  const gefiltertPosten = nachZeitraumGefiltert.filter(p => {
    if ((p.typ || "ausgabe") === "einnahme") return false;
    if (kategFilter && p.kategorie !== kategFilter) return false;
    if (bewohnerFilter && p.bewohner_id !== bewohnerFilter) return false;
    return true;
  });

  const ausgaben = gefiltertPosten.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

  const zeitraumLabel = zeitraum === "alle" ? "Alle"
    : zeitraum === "monat" ? `${MONATE[selMonat]} ${selJahr}` : `Jahr ${selJahr}`;

  // ─── Chart Data ───
  const kategAusgaben = HOME_KATEGORIEN
    .map(k => ({
      name: k,
      summe: nachZeitraumGefiltert
        .filter(p => p.kategorie === k && p.typ !== "einnahme")
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
    const mp = posten.filter(p => {
      if (!p.datum || (p.typ || "ausgabe") === "einnahme") return false;
      const d = new Date(p.datum);
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
  const statistikMonatPosten = posten.filter(p => {
    if (!p.datum || (p.typ || "ausgabe") === "einnahme") return false;
    const d = new Date(p.datum);
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

  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const cashflow = posten
    .filter(p => p.wiederholen && p.naechstes_datum && p.naechstes_datum <= in30.toISOString().split("T")[0])
    .sort((a, b) => a.naechstes_datum.localeCompare(b.naechstes_datum));

  // Limits
  const aktuellerMonat = today.getMonth();
  const aktuellesJahr = today.getFullYear();
  const monatsVerbrauch = (kat) =>
    posten.filter(p => {
      if (p.typ === "einnahme" || p.kategorie !== kat || !p.datum) return false;
      const d = new Date(p.datum);
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
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
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
          <div data-tour="tour-budget-uebersicht" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-card border p-3 text-center bg-red-500/10 border-red-500/20">
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Ausgaben</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">−{ausgaben.toFixed(2)} €</p>
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
                    className="flex items-center gap-3 bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-3 group"
                  >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">{p.beschreibung}</p>
                      {p.wiederholen && (
                        <RefreshCw size={12} className="text-secondary-400 flex-shrink-0" title={`Wiederkehrend: ${p.intervall}`} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
                      <span>{p.kategorie}</span>
                      <span>{p.datum}</span>
                      <BewohnerBadge bewohner={bewohner.find(b => b.id === p.bewohner_id)} />
                    </div>
                  </div>
                  <span className="font-semibold flex-shrink-0 tabular-nums text-light-text-main dark:text-dark-text-main">
                    −{Math.abs(Number(p.betrag)).toFixed(2)} €
                  </span>
                  {hatRechnung && (
                    <button
                      onClick={() => oeffneRechnungsVorschau(p)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-card-sm border border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                    >
                      <FileText size={12} />
                      Rechnung
                    </button>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setModal(p)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => loesche(p)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
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
                  <div className="h-52">
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
                <div className="h-52">
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
                <div className="h-48">
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
                      <p className="text-sm font-bold text-red-400 tabular-nums">−{statistikMonatGesamt.toFixed(2)} €</p>
                    </div>
                    <div className="rounded-card border p-3 text-center bg-light-card dark:bg-canvas-2 border-light-border dark:border-dark-border">
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorien</p>
                      <p className="text-sm font-bold text-light-text-main dark:text-dark-text-main tabular-nums">{statistikMonatKateg.length}</p>
                    </div>
                  </div>

                  {/* Doughnut: Kategorie-Verteilung */}
                  <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                    <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3 uppercase tracking-wider">Verteilung nach Kategorie</p>
                    <div className="h-52">
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
                      −{Math.abs(Number(p.betrag)).toFixed(2)} €
                    </span>
                  </div>
                ))}
                {cashflow.length > 1 && (
                  <div className="border-t border-light-border dark:border-dark-border pt-2 flex justify-between text-sm">
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Gesamt 30 Tage</span>
                    <span className="font-semibold tabular-nums text-red-400">
                      −{fmt(cashflow.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0))}
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setRechnungVorschau(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main truncate pr-2">
                Rechnungsvorschau: {rechnungVorschau.dateiname || "Dokument"}
              </h3>
              <button onClick={() => setRechnungVorschau(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 h-[70vh] overflow-auto">
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
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
          <BudgetForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} bewohner={bewohner} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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

      {/* KI-Assistent */}
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

