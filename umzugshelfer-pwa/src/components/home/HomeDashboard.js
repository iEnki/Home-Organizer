import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Package, ShoppingCart, Wrench, CheckSquare,
  FolderOpen, AlertTriangle, ChevronRight, Loader2, Users,
  TrendingUp, TrendingDown, Calendar, Clock, FileText,
} from "lucide-react";
import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import { supabase } from "../../supabaseClient";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

// ── Animated count-up number ─────────────────────────────────────────────────
const AnimatedNumber = ({ value }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);
  useEffect(() => {
    const controls = animate(count, value, { duration: 0.7, ease: "easeOut" });
    return controls.stop;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <motion.span>{rounded}</motion.span>;
};

// ── Animations ──────────────────────────────────────────────────────────────
const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
};
const gridVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};
const listVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
};
const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
};
const timelineVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.04 } },
};
const timelineItemVariants = {
  hidden: { opacity: 0, x: -4 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
const relativeZeit = (isoStr) => {
  const diff = Date.now() - new Date(isoStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "gerade eben";
  if (h < 24) return `vor ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
};

const tagesBis = (datumStr) => {
  if (!datumStr) return null;
  const diff = new Date(datumStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
};

const monatLabel = () =>
  new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

const fmt = (n) =>
  Number(n).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const MODUL_ICON = {
  home_objekte: "📦", budget_posten: "💶", home_geraete: "🔧",
  home_einkaufliste: "🛒", home_projekte: "📋", home_vorraete: "🥫",
  todo_aufgaben: "✅", home_wissen: "📚", home_bewohner: "👥",
  home_wartungen: "🔧", home_orte: "📍",
  dokumente: "📄",
};

const AKTION_LABEL = {
  erstellt:     "erstellt",
  geaendert:    "geändert",
  geloescht:    "gelöscht",
  aktualisiert: "aktualisiert",
};

// ── Animated progress bar ────────────────────────────────────────────────────
const AnimBar = ({ ratio, color = "bg-primary-500" }) => (
  <div className="h-2 w-full bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.min(Math.max(ratio, 0), 1) }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ transformOrigin: "left" }}
    />
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const HomeDashboard = ({ session }) => {
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("dashboard");

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    objekte: 0, orte: 0,
    vorraeteRot: 0, vorraeteGesamt: 0,
    einkaufOffen: 0,
    geraete: 0, geraeteWartungFaellig: 0,
    aufgabenHeute: 0,
    projekteAktiv: 0,
    bewohner: 0,
    dokumente: 0,
  });
  const [erweitert, setErweitert] = useState({
    vorraeteAmpel: { rot: 0, gelb: 0, gruen: 0 },
    naechsteWartung: null,
    aktiveProjekte: [],
    budgetMonat: { ausgaben: 0, buchungen: 0, vormonatAusgaben: 0, kommendeNichtMonatlich: [] },
    verlauf: [],
    timeline: [],
  });

  const ladeStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const heute = new Date().toISOString().split("T")[0];
      const aktuellerMonat = heute.slice(0, 7);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

      const todayDate = new Date();
      const vormonatDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
      const vormonat = vormonatDate.toISOString().slice(0, 7);
      const nextMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1).toISOString().split("T")[0];
      const nextMonthEnd   = new Date(todayDate.getFullYear(), todayDate.getMonth() + 2, 0).toISOString().split("T")[0];

      const [
        objekteRes, orteRes, vorraeteRes, einkaufRes,
        geraeteRes, aufgabenRes, projekteRes, bewohnerRes,
        budgetRes, aufgabenTimeline, vormonatRes, nextMonthRes,
        dokumenteRes,
      ] = await Promise.all([
        supabase.from("home_objekte").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("status", "entsorgt"),
        supabase.from("home_orte").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("home_vorraete").select("id, bestand, mindestmenge, name, ablaufdatum").eq("user_id", userId),
        supabase.from("home_einkaufliste").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("erledigt", false),
        supabase.from("home_geraete").select("id, naechste_wartung, name").eq("user_id", userId),
        supabase.from("todo_aufgaben").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("erledigt", false).in("app_modus", ["home", "beides"]).lte("faelligkeitsdatum", `${heute}T23:59:59`),
        supabase.from("home_projekte").select("id, name, zieldatum, status").eq("user_id", userId).eq("status", "in_bearbeitung").limit(3),
        supabase.from("home_bewohner").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("budget_posten").select("id, typ, betrag, datum").eq("user_id", userId).gte("datum", `${aktuellerMonat}-01`).lte("datum", `${aktuellerMonat}-31`),
        supabase.from("todo_aufgaben").select("id, beschreibung, faelligkeitsdatum, home_projekt_id, erledigt").eq("user_id", userId).eq("erledigt", false).in("app_modus", ["home", "beides"]).gte("faelligkeitsdatum", heute).lte("faelligkeitsdatum", in30).limit(10),
        supabase.from("budget_posten").select("typ, betrag").eq("user_id", userId).gte("datum", `${vormonat}-01`).lte("datum", `${vormonat}-31`),
        supabase.from("budget_posten").select("id, beschreibung, betrag, intervall, naechstes_datum").eq("user_id", userId).eq("wiederholen", true).gte("naechstes_datum", nextMonthStart).lte("naechstes_datum", nextMonthEnd),
        supabase.from("dokumente").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);

      // ── Basis Stats ──
      const vorraete = vorraeteRes.data || [];
      const vorraeteRot = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge)).length;

      const geraete = geraeteRes.data || [];
      const geraeteWartungFaellig = geraete.filter((g) => g.naechste_wartung && g.naechste_wartung <= heute).length;

      setStats({
        objekte: objekteRes.count || 0,
        orte: orteRes.count || 0,
        vorraeteRot,
        vorraeteGesamt: vorraete.length,
        einkaufOffen: einkaufRes.count || 0,
        geraete: geraete.length,
        geraeteWartungFaellig,
        aufgabenHeute: aufgabenRes.count || 0,
        projekteAktiv: (projekteRes.data || []).length,
        bewohner: bewohnerRes.count || 0,
        dokumente: dokumenteRes.count || 0,
      });

      // ── Vorräte-Ampel ──
      const ampelRot   = vorraete.filter(v => Number(v.bestand) < Number(v.mindestmenge)).length;
      const ampelGelb  = vorraete.filter(v => Number(v.bestand) >= Number(v.mindestmenge) && Number(v.bestand) < Number(v.mindestmenge) * 1.2).length;
      const ampelGruen = vorraete.filter(v => Number(v.bestand) >= Number(v.mindestmenge) * 1.2).length;

      // ── Nächste Wartung ──
      const gFaellig = geraete
        .filter(g => g.naechste_wartung)
        .sort((a, b) => a.naechste_wartung.localeCompare(b.naechste_wartung));
      const naechsteWartung = gFaellig.length
        ? { name: gFaellig[0].name, datum: gFaellig[0].naechste_wartung, tage: tagesBis(gFaellig[0].naechste_wartung) }
        : null;

      // ── Aktive Projekte mit Progress ──
      const projekte = projekteRes.data || [];
      const projektIds = projekte.map(p => p.id);
      let aktiveProjekte = [];
      if (projektIds.length > 0) {
        const { data: projektTodos } = await supabase
          .from("todo_aufgaben")
          .select("id, erledigt, home_projekt_id")
          .eq("user_id", userId)
          .in("home_projekt_id", projektIds);
        const todos = projektTodos || [];
        aktiveProjekte = projekte.slice(0, 2).map(p => {
          const pt = todos.filter(t => t.home_projekt_id === p.id);
          const erledigt = pt.filter(t => t.erledigt).length;
          return {
            ...p,
            progress: pt.length ? Math.round(erledigt / pt.length * 100) : 0,
            todoGesamt: pt.length,
            todoErledigt: erledigt,
          };
        });
      }

      // ── Budget Monat (nur Ausgaben) ──
      const posten = (budgetRes.data || []).filter(p => (p.typ || "ausgabe") !== "einnahme");
      const ausgaben = posten.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);
      const buchungen = posten.length;

      // ── Vormonat-Vergleich ──
      const vormonatPosten = (vormonatRes.data || []).filter(p => (p.typ || "ausgabe") !== "einnahme");
      const vormonatAusgaben = vormonatPosten.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

      // ── Nicht-monatliche Zahlungen nächsten Monat ──
      const kommendeNichtMonatlich = (nextMonthRes.data || [])
        .filter(p => p.intervall !== "Monatlich" && (p.typ || "ausgabe") !== "einnahme");

      // ── Timeline: Wartungen + Ablauf + Aufgaben ──
      const timelineEvents = [
        ...geraete
          .filter(g => g.naechste_wartung && g.naechste_wartung >= heute && g.naechste_wartung <= in30)
          .map(g => ({ typ: "wartung", titel: g.name, datum: g.naechste_wartung })),
        ...vorraete
          .filter(v => v.ablaufdatum && v.ablaufdatum >= heute && v.ablaufdatum <= in30)
          .map(v => ({ typ: "ablauf", titel: v.name, datum: v.ablaufdatum })),
        ...(aufgabenTimeline.data || [])
          .map(a => ({ typ: "aufgabe", titel: a.beschreibung, datum: a.faelligkeitsdatum?.split("T")[0] }))
          .filter(a => a.datum),
      ]
        .sort((a, b) => a.datum.localeCompare(b.datum))
        .slice(0, 5);

      setErweitert({
        vorraeteAmpel: { rot: ampelRot, gelb: ampelGelb, gruen: ampelGruen },
        naechsteWartung,
        aktiveProjekte,
        budgetMonat: { ausgaben, buchungen, vormonatAusgaben, kommendeNichtMonatlich },
        verlauf: [],
        timeline: timelineEvents,
      });

      // ── Verlauf (silent fail) ──
      supabase
        .from("home_verlauf")
        .select("aktion, created_at, tabelle, datensatz_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6)
        .then(({ data }) => {
          if (data) setErweitert(e => ({ ...e, verlauf: data }));
        });

    } catch (e) {
      console.error("HomeDashboard ladeStats:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeStats(); }, [ladeStats]);

  // ── Kacheln-Definition ──
  const { vorraeteAmpel, naechsteWartung } = erweitert;
  const kacheln = [
    {
      titel: "Inventar",
      wert: stats.objekte,
      einheit: "Objekte",
      unter: `${stats.orte} Standorte`,
      icon: Package, farbe: "blue", pfad: "/home/inventar",
      tourId: "tour-dashboard-inventar",
    },
    {
      titel: "Vorräte",
      wert: stats.vorraeteGesamt,
      einheit: "Artikel",
      unter: vorraeteAmpel.rot > 0
        ? `${vorraeteAmpel.rot} nachkaufen · ${vorraeteAmpel.gelb} knapp`
        : `${vorraeteAmpel.gruen} gut versorgt`,
      icon: ShoppingCart,
      farbe: stats.vorraeteRot > 0 ? "red" : "green",
      pfad: "/home/vorraete",
      warnung: stats.vorraeteRot > 0,
    },
    {
      titel: "Einkaufsliste",
      wert: stats.einkaufOffen,
      einheit: "offen",
      icon: ShoppingCart, farbe: "amber", pfad: "/home/einkaufliste",
    },
    {
      titel: "Geräte",
      wert: stats.geraeteWartungFaellig,
      einheit: "Wartung fällig",
      unter: naechsteWartung
        ? `Nächste: ${naechsteWartung.name} in ${naechsteWartung.tage}d`
        : `${stats.geraete} Geräte gesamt`,
      icon: Wrench,
      farbe: stats.geraeteWartungFaellig > 0 ? "orange" : "green",
      pfad: "/home/geraete",
      warnung: stats.geraeteWartungFaellig > 0,
    },
    {
      titel: "Aufgaben heute",
      wert: stats.aufgabenHeute,
      einheit: "fällig",
      icon: CheckSquare,
      farbe: stats.aufgabenHeute > 0 ? "red" : "green",
      pfad: "/home/aufgaben",
      tourId: "tour-dashboard-aufgaben",
    },
    {
      titel: "Aktive Projekte",
      wert: stats.projekteAktiv,
      einheit: "in Bearbeitung",
      icon: FolderOpen, farbe: "purple", pfad: "/home/projekte",
    },
    {
      titel: "Bewohner",
      wert: stats.bewohner,
      einheit: "im Haushalt",
      icon: Users, farbe: "teal", pfad: "/home/bewohner",
      tourId: "tour-dashboard-bewohner",
    },
    {
      titel: "Dokumente",
      wert: stats.dokumente,
      einheit: "gespeichert",
      icon: FileText, farbe: "indigo", pfad: "/home/dokumente",
    },
  ];

  const farbKlassen = {
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-green-500/10 text-green-500",
    red: "bg-red-500/10 text-red-500",
    amber: "bg-amber-500/10 text-amber-500",
    teal: "bg-teal-500/10 text-teal-500",
    orange: "bg-orange-500/10 text-orange-500",
    purple: "bg-purple-500/10 text-purple-500",
    indigo: "bg-indigo-500/10 text-indigo-500",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  const { budgetMonat, aktiveProjekte, timeline, verlauf } = erweitert;

  // ── Timeline Helpers ──
  const TIMELINE_ICON = { wartung: "🔧", ablauf: "⚠️", aufgabe: "✅", projekt: "📋" };
  const tagesLabel = (datum) => {
    const t = tagesBis(datum);
    if (t === null) return "";
    if (t < 0) return `${Math.abs(t)}d überfällig`;
    if (t === 0) return "heute";
    return `in ${t}d`;
  };
  const tagesFarbe = (datum) => {
    const t = tagesBis(datum);
    if (t === null) return "text-light-text-secondary dark:text-dark-text-secondary";
    if (t < 0 || t === 0) return "text-red-500";
    if (t <= 7) return "text-amber-500";
    return "text-green-500";
  };

  // ── Projekt Ampel ──
  const projektAmpel = (p) => {
    const t = tagesBis(p.zieldatum);
    if (t === null) return "bg-gray-400";
    if (t < 0) return "bg-red-500";
    if (t <= 14) return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div data-tour="tour-dashboard-willkommen" className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
          <Home size={22} className="text-primary-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
            Home Organizer
          </h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Dein Zuhause im Überblick
          </p>
        </div>
      </div>

      {/* Warnungs-Banner */}
      {(stats.vorraeteRot > 0 || stats.geraeteWartungFaellig > 0 || stats.aufgabenHeute > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, x: [0, -4, 4, -3, 3, -1, 1, 0] }}
          transition={{ duration: 0.5, x: { delay: 0.3, duration: 0.45 } }}
          className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2"
        >
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-400 flex flex-wrap gap-x-3">
            {stats.vorraeteRot > 0 && <span>{stats.vorraeteRot} Vorrat unter Mindestmenge</span>}
            {stats.geraeteWartungFaellig > 0 && <span>{stats.geraeteWartungFaellig} Gerätewartung fällig</span>}
            {stats.aufgabenHeute > 0 && <span>{stats.aufgabenHeute} Aufgabe(n) heute fällig</span>}
          </div>
        </motion.div>
      )}

      {/* Status-Kacheln */}
      <motion.div
        data-tour="tour-dashboard-status"
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      >
        {kacheln.map((k) => {
          const Icon = k.icon;
          return (
            <motion.button
              key={k.pfad}
              data-tour={k.tourId || undefined}
              variants={cardVariants}
              whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(k.pfad)}
              animate={k.warnung ? {
                boxShadow: [
                  "0 0 0px rgba(239,68,68,0)",
                  "0 0 10px rgba(239,68,68,0.35)",
                  "0 0 0px rgba(239,68,68,0)",
                ],
              } : {}}
              transition={k.warnung ? { repeat: Infinity, duration: 2.4, ease: "easeInOut" } : {}}
              className="relative p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/50 transition-colors duration-200 text-left group"
            >
              {k.warnung && (
                <motion.span
                  className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                />
              )}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${farbKlassen[k.farbe]}`}>
                <Icon size={18} />
              </div>
              <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
                <AnimatedNumber value={k.wert} />
              </div>
              <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {k.einheit}
              </div>
              <div className="text-xs font-medium text-light-text-main dark:text-dark-text-main mt-1">
                {k.titel}
              </div>
              {k.unter && (
                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 leading-tight">
                  {k.unter}
                </div>
              )}
              <ChevronRight size={14} className="absolute bottom-3 right-3 text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          );
        })}
      </motion.div>

      {/* Row A: Budget & Vorräte-Ampel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Budget-Widget */}
        <motion.button
          data-tour="tour-dashboard-budget"
          variants={cardVariants}
          initial="hidden"
          animate="show"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => navigate("/home/budget")}
          className="p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/50 transition-colors text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">💶</span>
              <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                Budget – {monatLabel()}
              </span>
            </div>
            <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {budgetMonat.ausgaben === 0 ? (
            <>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Noch keine Buchungen diesen Monat.
              </p>
              {budgetMonat.kommendeNichtMonatlich.length > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1 mt-2">
                  <AlertTriangle size={11} />
                  {budgetMonat.kommendeNichtMonatlich.length}× unregelmäßige Zahlung nächsten Monat ({fmt(budgetMonat.kommendeNichtMonatlich.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0))} €)
                </p>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-light-text-main dark:text-dark-text-main tabular-nums">
                  {fmt(budgetMonat.ausgaben)} €
                </span>
                <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
                  {budgetMonat.buchungen} Buchung{budgetMonat.buchungen !== 1 ? "en" : ""}
                </span>
              </div>
              <p className="text-xs text-red-400 flex items-center gap-1">
                <TrendingDown size={11} /> Ausgaben diesen Monat
              </p>
              {budgetMonat.vormonatAusgaben > 0 && (() => {
                const delta = budgetMonat.ausgaben - budgetMonat.vormonatAusgaben;
                const pct = Math.round(Math.abs(delta) / budgetMonat.vormonatAusgaben * 100);
                const hoeher = delta > 0;
                return (
                  <p className={`text-xs flex items-center gap-1 ${hoeher ? "text-red-400" : "text-green-500"}`}>
                    {hoeher ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {hoeher ? "+" : "−"}{pct}% zum Vormonat ({fmt(budgetMonat.vormonatAusgaben)} €)
                  </p>
                );
              })()}
              {budgetMonat.kommendeNichtMonatlich.length > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  {budgetMonat.kommendeNichtMonatlich.length}× unregelmäßige Zahlung nächsten Monat ({fmt(budgetMonat.kommendeNichtMonatlich.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0))} €)
                </p>
              )}
            </div>
          )}
        </motion.button>

        {/* Vorräte-Ampel-Widget */}
        <motion.button
          variants={cardVariants}
          initial="hidden"
          animate="show"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => navigate("/home/vorraete")}
          className="p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/50 transition-colors text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🛒</span>
              <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                Vorräte – {stats.vorraeteGesamt} Artikel
              </span>
            </div>
            <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {stats.vorraeteGesamt === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Noch keine Vorräte angelegt.
            </p>
          ) : (
            <div className="space-y-1.5">
              {[
                { count: vorraeteAmpel.rot,   farbe: "bg-red-500",   label: "nachkaufen",   delay: 0,   alert: vorraeteAmpel.rot > 0 },
                { count: vorraeteAmpel.gelb,  farbe: "bg-amber-500", label: "knapp",        delay: 0.1, alert: false },
                { count: vorraeteAmpel.gruen, farbe: "bg-green-500", label: "gut versorgt", delay: 0.2, alert: false },
              ].map(({ count, farbe, label, delay, alert }) => (
                <motion.div
                  key={label}
                  className="flex items-center gap-3 rounded-lg px-2 py-0.5 -mx-2"
                  animate={alert ? {
                    backgroundColor: ["rgba(239,68,68,0)", "rgba(239,68,68,0.08)", "rgba(239,68,68,0)"],
                  } : {}}
                  transition={alert ? { repeat: Infinity, duration: 2.2, ease: "easeInOut" } : {}}
                >
                  <motion.div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${farbe}`}
                    initial={{ scale: 0 }}
                    animate={alert
                      ? { scale: [1, 1.45, 1], opacity: [1, 0.65, 1] }
                      : { scale: 1 }}
                    transition={alert
                      ? { repeat: Infinity, duration: 1.6, ease: "easeInOut", delay }
                      : { delay, type: "spring", stiffness: 300, damping: 20 }}
                  />
                  <span className="text-xl font-bold text-light-text-main dark:text-dark-text-main w-8 text-right">
                    <AnimatedNumber value={count} />
                  </span>
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    {label}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.button>
      </div>

      {/* Row B: Projekte & Nächste Ereignisse */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Projekte-Widget */}
        <motion.button
          variants={cardVariants}
          initial="hidden"
          animate="show"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => navigate("/home/projekte")}
          className="p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/50 transition-colors text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                Aktive Projekte ({stats.projekteAktiv})
              </span>
            </div>
            <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {aktiveProjekte.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Keine aktiven Projekte.
            </p>
          ) : (
            <div className="space-y-3">
              {aktiveProjekte.map(p => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${projektAmpel(p)}`} />
                      <span className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary ml-2 flex-shrink-0">
                      {p.progress}%
                    </span>
                  </div>
                  <AnimBar ratio={p.progress / 100} color="bg-purple-500" />
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {p.todoGesamt > 0 && <span>✅ {p.todoErledigt}/{p.todoGesamt}</span>}
                    {p.zieldatum && (
                      <span>fällig {new Date(p.zieldatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.button>

        {/* Nächste Ereignisse */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="show"
          className="p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-primary-500" />
            <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Nächste 30 Tage
            </span>
          </div>

          {timeline.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Keine anstehenden Ereignisse.
            </p>
          ) : (
            <motion.div variants={timelineVariants} initial="hidden" animate="show" className="space-y-2">
              {timeline.map((e, i) => {
                const t = tagesBis(e.datum);
                const isOverdue = t !== null && t < 0;
                const isUrgent  = t !== null && t >= 0 && t <= 1;
                return (
                  <motion.div
                    key={i}
                    variants={timelineItemVariants}
                    animate={isOverdue
                      ? { x: [0, -3, 3, -2, 2, 0], backgroundColor: ["rgba(239,68,68,0)", "rgba(239,68,68,0.1)", "rgba(239,68,68,0)"] }
                      : isUrgent
                      ? { backgroundColor: ["rgba(245,158,11,0)", "rgba(245,158,11,0.08)", "rgba(245,158,11,0)"] }
                      : {}}
                    transition={isOverdue
                      ? { x: { delay: 0.6 + i * 0.1, duration: 0.4 }, backgroundColor: { delay: 0.6 + i * 0.1, repeat: Infinity, duration: 2.5 } }
                      : isUrgent
                      ? { backgroundColor: { repeat: Infinity, duration: 2.5, delay: i * 0.1 } }
                      : {}}
                    className="flex items-center gap-2.5 rounded px-1 -mx-1"
                  >
                    <span className="text-sm flex-shrink-0">{TIMELINE_ICON[e.typ] || "📌"}</span>
                    <span className="text-xs text-light-text-main dark:text-dark-text-main flex-1 truncate">
                      {e.titel}
                    </span>
                    <span className={`text-xs font-medium flex-shrink-0 ${tagesFarbe(e.datum)}`}>
                      {tagesLabel(e.datum)}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Aktivitäts-Feed */}
      {verlauf.length > 0 && (
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="show"
          className="p-4 rounded-xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-primary-500" />
            <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Letzte Aktivitäten
            </span>
          </div>
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
            {verlauf.map((v, i) => (
              <motion.div key={i} variants={listItemVariants} className="flex items-center gap-2.5">
                <span className="text-sm flex-shrink-0">
                  {MODUL_ICON[v.tabelle] || "📝"}
                </span>
                <span className="text-xs text-light-text-main dark:text-dark-text-main flex-1 truncate">
                  {v.datensatz_name && <span className="font-medium">{v.datensatz_name} </span>}
                  {AKTION_LABEL[v.aktion] || v.aktion}
                </span>
                <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                  {relativeZeit(v.created_at)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      {/* Schnellzugriff */}
      <div>
        <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-3">
          Schnellzugriff
        </h2>
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {[
            { label: "Objekt suchen", pfad: "/home/suche",      icon: "🔍" },
            { label: "Dokumente",     pfad: "/home/dokumente",  icon: "📂" },
            { label: "Budget",        pfad: "/home/budget",     icon: "💶" },
            { label: "Projekte",      pfad: "/home/projekte",   icon: "📋" },
          ].map((item) => (
            <motion.button
              key={item.pfad}
              variants={cardVariants}
              whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(item.pfad)}
              className="flex items-center gap-2 p-3 rounded-lg bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors text-sm text-light-text-main dark:text-dark-text-main"
            >
              <span>{item.icon}</span>
              {item.label}
            </motion.button>
          ))}
        </motion.div>
      </div>

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.dashboard}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeDashboard;
