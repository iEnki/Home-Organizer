import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Home, Package, ShoppingCart, Wrench, CheckSquare,
  FolderOpen, AlertTriangle, ChevronRight, Users,
  TrendingUp, TrendingDown, Calendar, Clock, FileText, Pill,
} from "lucide-react";
import {
  motion, animate, useMotionValue, useTransform,
  AnimatePresence, useReducedMotion,
} from "framer-motion";
import { getActiveHouseholdId, supabase } from "../../supabaseClient";
import { ensureRecurringBudgetEntries, getMonthBounds, getLocalDateString } from "../../utils/budgetRecurring";
import { buildOpenPairBalances } from "../../utils/budgetLedger";
import { formatGermanCurrency } from "../../utils/formatUtils";
import { getMedicationStatus } from "../../utils/heimapotheke";
import { createVerlaufQuery } from "../../utils/homeVerlauf";
import { getVerlaufDisplayText, getVerlaufTableMeta } from "../../utils/homeVerlaufPresentation";
import { notifyHouseholdBatchEvent } from "../../utils/pushNotifications";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import useViewport from "../../hooks/useViewport";
import { getLimitProgress, getLimitStatus } from "../../utils/budgetLimits";
import { HOME_BUDGET_CATEGORY_COLORS } from "../../utils/homeBudgetCategories";
import GlassSurface, { GlassModule } from "../ui/GlassSurface";

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

// ── Motion-Varianten ─────────────────────────────────────────────────────────
const sectionVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const sectionItemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 28 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 30 } },
};
const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};
const timelineVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const timelineItemVariants = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};
const warnVariants = {
  hidden: { opacity: 0, y: -10, scaleY: 0.92 },
  show: { opacity: 1, y: 0, scaleY: 1, transition: { type: "spring", stiffness: 400, damping: 30 } },
  exit: { opacity: 0, y: -8, scaleY: 0.95, transition: { duration: 0.18 } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 26, delay: 0.05 } },
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
const relativeZeit = (isoStr, t) => {
  const diff = Date.now() - new Date(isoStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return t("home:dashboard.relativeTime.justNow");
  if (h < 24) return t("home:dashboard.relativeTime.hoursAgo", { h });
  const d = Math.floor(h / 24);
  return d === 1
    ? t("home:dashboard.relativeTime.yesterday")
    : t("home:dashboard.relativeTime.daysAgo", { d });
};

const tagesBis = (datumStr) => {
  if (!datumStr) return null;
  const diff = new Date(datumStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
};

const monatLabel = () =>
  new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

const fmt = (n) =>
  Number(n).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
};

const heuteLang = () =>
  new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

const tagesFarbe = (datum) => {
  const days = tagesBis(datum);
  if (days === null) return "text-light-text-secondary dark:text-dark-text-secondary";
  if (days < 0 || days === 0) return "text-red-500";
  if (days <= 7) return "text-amber-500";
  return "text-green-500";
};

// ── Projekt-Ampelfarbe ────────────────────────────────────────────────────────
const projektAmpelFarbe = (p) => {
  const days = tagesBis(p.zieldatum);
  if (days === null) return "bg-gray-400";
  if (days < 0) return "bg-red-500";
  if (days <= 14) return "bg-amber-500";
  return "bg-green-500";
};

// ── Icon / Farb-Mappings ──────────────────────────────────────────────────────
const MODUL_ICON = {
  home_objekte: "📦", budget_posten: "💶", home_geraete: "🔧",
  home_einkaufliste: "🛒", home_projekte: "📋", home_vorraete: "🥫",
  todo_aufgaben: "✅", home_wissen: "📚", home_bewohner: "👥",
  home_wartungen: "🔧", home_orte: "📍",
  dokumente: "📄",
};

const TIMELINE_DOT_COLOR = {
  wartung: "bg-orange-400",
  ablauf:  "bg-amber-400",
  aufgabe: "bg-primary-500",
  projekt: "bg-purple-500",
};

const MODUL_COLOR = {
  home_objekte:      "bg-blue-500/15 text-blue-400",
  budget_posten:     "bg-emerald-500/15 text-emerald-400",
  rechnungen:        "bg-emerald-500/15 text-emerald-400",
  home_geraete:      "bg-orange-500/15 text-orange-400",
  home_einkaufliste: "bg-amber-500/15 text-amber-400",
  home_projekte:     "bg-purple-500/15 text-purple-400",
  home_vorraete:     "bg-teal-500/15 text-teal-400",
  todo_aufgaben:     "bg-green-500/15 text-green-400",
  home_wissen:       "bg-indigo-500/15 text-indigo-400",
  home_bewohner:     "bg-sky-500/15 text-sky-400",
  dokumente:         "bg-slate-500/15 text-slate-400",
};

const SCHNELLZUGRIFF_ITEMS = [
  { labelKey: "search",    pfad: "/home/suche",     icon: "🔍", color: "bg-sky-500/15 text-sky-400"         },
  { labelKey: "documents", pfad: "/home/dokumente", icon: "📂", color: "bg-slate-500/15 text-slate-400"     },
  { labelKey: "budget",    pfad: "/home/budget",    icon: "💶", color: "bg-emerald-500/15 text-emerald-400" },
  { labelKey: "projects",  pfad: "/home/projekte",  icon: "📋", color: "bg-purple-500/15 text-purple-400"   },
];

// ── Animated progress bar ─────────────────────────────────────────────────────
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

// ── Skeleton-Komponenten ──────────────────────────────────────────────────────
const SkeletonPulse = ({ className = "" }) => (
  <div className={`bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded ${className}`} />
);

const SkeletonCard = () => (
  <GlassSurface interactive={false} className="p-4">
    <SkeletonPulse className="w-9 h-9 rounded-card-sm mb-3" />
    <SkeletonPulse className="h-7 w-12 rounded mb-1.5" />
    <SkeletonPulse className="h-2.5 w-16 rounded mb-1" />
    <SkeletonPulse className="h-2.5 w-20 rounded" />
  </GlassSurface>
);

const SkeletonWidget = ({ className = "" }) => (
  <GlassSurface interactive={false} className={`p-4 ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      <SkeletonPulse className="w-5 h-5 rounded-full" />
      <SkeletonPulse className="h-4 w-32 rounded" />
    </div>
    <SkeletonPulse className="h-8 w-24 rounded mb-2" />
    <SkeletonPulse className="h-2.5 w-full rounded mb-1.5" />
    <SkeletonPulse className="h-2.5 w-3/4 rounded" />
  </GlassSurface>
);

const SectionHeader = ({ icon: Icon, label, iconClass = "text-primary-500" }) => (
  <div className="flex items-center gap-2 mb-3">
    {Icon && <Icon size={14} className={`${iconClass} flex-shrink-0`} />}
    <span className="text-[11px] font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest whitespace-nowrap">
      {label}
    </span>
    <div className="flex-1 h-px bg-light-border dark:bg-dark-border" />
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const HomeDashboard = ({ session }) => {
  const { t } = useTranslation(["home", "common"]);
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
    budgetMonat: { ausgabenHaushalt: 0, ausgabenPrivat: 0, buchungen: 0, vormonatAusgaben: 0, kommendeNichtMonatlich: [] },
    verlauf: [],
    timeline: [],
  });
  const [openLedgerRows, setOpenLedgerRows] = useState([]);
  const [sparziele, setSparziele] = useState([]);
  const [budgetLimitRows, setBudgetLimitRows] = useState([]);

  const resolveDashboardHouseholdId = useCallback(async () => {
    const activeHouseholdId = getActiveHouseholdId();
    if (activeHouseholdId) return activeHouseholdId;

    const { data, error } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.household_id || null;
  }, [userId]);

  const logRecurringBudgetHistory = useCallback(async (occurrences = [], householdId = null) => {
    const rows = (occurrences || []).filter((entry) => entry?.id);
    if (!userId || rows.length === 0) return;

    await notifyHouseholdBatchEvent({
      supabaseClient: supabase,
      userId,
      table: "budget_posten",
      action: "erstellt",
      eintraege: rows.map((entry) => ({
        datensatz_name: entry.beschreibung,
        options: { householdId: entry.household_id || householdId || null },
      })),
      url: "/home/budget",
      tag: `budget-recurring-history-${Date.now()}`,
      history: true,
      push: false,
    });
  }, [userId]);

  const ladeStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const householdId = await resolveDashboardHouseholdId();
      await ensureRecurringBudgetEntries({
        supabase,
        userId,
        householdId,
        appModi: ["home", "beides"],
        onCreatedOccurrences: (occurrences) => logRecurringBudgetHistory(occurrences, householdId),
      });

      const heute = getLocalDateString();
      const todayDate = new Date();
      const in30 = getLocalDateString(new Date(Date.now() + 30 * 86400000));
      const { start: monthStart,     nextStart: thisMonthEnd  } = getMonthBounds(todayDate);
      const { start: vormonatStart,  nextStart: vormonatEnd   } = getMonthBounds(new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1));
      const { start: nextMonthStart, nextStart: nextMonthEnd  } = getMonthBounds(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1));

      const [
        objekteRes, orteRes, vorraeteRes, medikamenteRes, einkaufRes,
        geraeteRes, aufgabenRes, projekteRes, bewohnerRes,
        budgetRes, aufgabenTimeline, vormonatRes, nextMonthRes,
        dokumenteRes, sparzieleRes, budgetLimitsRes,
      ] = await Promise.all([
        supabase.from("home_objekte").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("status", "entsorgt"),
        supabase.from("home_orte").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("home_vorraete").select("id, bestand, mindestmenge, name, ablaufdatum").eq("user_id", userId),
        supabase.from("home_medikamente").select("id, bestand, mindestbestand, name, ablaufdatum").eq("user_id", userId),
        supabase.from("home_einkaufliste").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("erledigt", false),
        supabase.from("home_geraete").select("id, naechste_wartung, name").eq("user_id", userId),
        supabase.from("todo_aufgaben").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("erledigt", false).in("app_modus", ["home", "beides"]).lte("faelligkeitsdatum", `${heute}T23:59:59`),
        supabase.from("home_projekte").select("id, name, zieldatum, status").eq("user_id", userId).eq("status", "in_bearbeitung").limit(3),
        supabase.from("home_bewohner").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("budget_posten").select("id, typ, betrag, datum, budget_scope, bewohner_id, kategorie").eq("user_id", userId).in("app_modus", ["home", "beides"]).is("archived_at", null).gte("datum", monthStart).lt("datum", thisMonthEnd),
        supabase.from("todo_aufgaben").select("id, beschreibung, faelligkeitsdatum, home_projekt_id, erledigt").eq("user_id", userId).eq("erledigt", false).in("app_modus", ["home", "beides"]).gte("faelligkeitsdatum", heute).lte("faelligkeitsdatum", in30).limit(10),
        supabase.from("budget_posten").select("typ, betrag, budget_scope").eq("user_id", userId).in("app_modus", ["home", "beides"]).is("archived_at", null).gte("datum", vormonatStart).lt("datum", vormonatEnd),
        supabase.from("budget_posten").select("id, beschreibung, betrag, typ, intervall, naechstes_datum, budget_scope").eq("user_id", userId).in("app_modus", ["home", "beides"]).is("archived_at", null).eq("wiederholen", true).gte("naechstes_datum", nextMonthStart).lt("naechstes_datum", nextMonthEnd),
        supabase.from("dokumente").select("id", { count: "exact", head: true }).eq("user_id", userId).in("app_modus", ["home", "beides"]),
        supabase.from("home_sparziele").select("id, name, ziel_betrag, aktueller_betrag, farbe, emoji, zieldatum").eq("user_id", userId).order("created_at"),
        supabase.from("home_budget_limits").select("kategorie, limit_euro").eq("user_id", userId),
      ]);

      if (householdId) {
        const { data: ledgerRows, error: ledgerError } = await supabase.rpc("get_budget_open_split_ledger", {
          p_household_id: householdId,
          p_as_of_date: heute,
        });
        if (ledgerError) {
          console.error("[HomeDashboard] Open-Item-Ledger konnte nicht geladen werden:", ledgerError);
          setOpenLedgerRows([]);
        } else {
          setOpenLedgerRows(ledgerRows || []);
        }
      } else {
        setOpenLedgerRows([]);
      }

      // ── Basis Stats ──
      const vorraete = vorraeteRes.data || [];
      const vorraeteRot = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge)).length;
      const medikamente = medikamenteRes.data || [];
      const medikamenteNiedrig = medikamente.filter((m) => getMedicationStatus(m).lowStock).length;
      const medikamenteAblauf = medikamente.filter((m) => m.ablaufdatum && m.ablaufdatum <= in30).length;

      const geraete = geraeteRes.data || [];
      const geraeteWartungFaellig = geraete.filter((g) => g.naechste_wartung && g.naechste_wartung <= heute).length;

      setStats({
        objekte: objekteRes.count || 0,
        orte: orteRes.count || 0,
        vorraeteRot,
        vorraeteGesamt: vorraete.length,
        medikamenteGesamt: medikamente.length,
        medikamenteNiedrig,
        medikamenteAblauf,
        einkaufOffen: einkaufRes.count || 0,
        geraete: geraete.length,
        geraeteWartungFaellig,
        aufgabenHeute: aufgabenRes.count || 0,
        projekteAktiv: (projekteRes.data || []).length,
        bewohner: bewohnerRes.count || 0,
        dokumente: dokumenteRes.count || 0,
      });
      setSparziele(sparzieleRes.data || []);

      // ── Budget-Limits berechnen ──
      const limitsData = (budgetLimitsRes.data || []).filter(l => Number(l.limit_euro) > 0);
      const postenCurrentMonth = budgetRes.data || [];
      const computedLimitRows = limitsData.map(l => {
        const verbrauch = postenCurrentMonth
          .filter(p =>
            p.typ !== "einnahme" &&
            (p.budget_scope === "haushalt" || !p.budget_scope) &&
            (p.kategorie || "Sonstiges") === l.kategorie
          )
          .reduce((sum, p) => sum + Math.abs(Number(p.betrag)), 0);
        const limitEuro = Number(l.limit_euro);
        const progress = getLimitProgress({ verbrauch, limitEuro });
        const status = getLimitStatus({ verbrauch, limitEuro });
        const color = HOME_BUDGET_CATEGORY_COLORS[l.kategorie] || "#6B7280";
        return { kategorie: l.kategorie, limitEuro, verbrauch, progress, status, color };
      });
      const LIMIT_PRIO = { ueberschritten: 0, warnung: 1, ok: 2 };
      computedLimitRows.sort((a, b) => (LIMIT_PRIO[a.status] ?? 3) - (LIMIT_PRIO[b.status] ?? 3));
      setBudgetLimitRows(computedLimitRows);

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

      // ── Budget Monat (Haushalt vs. Privat) ──
      const posten = (budgetRes.data || []).filter(p => (p.typ || "ausgabe") !== "einnahme");
      const ausgabenHaushalt = posten
        .filter(p => (p.budget_scope || "haushalt") === "haushalt")
        .reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);
      const ausgabenPrivat = posten
        .filter(p => p.budget_scope === "privat")
        .reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);
      const buchungen = posten.length;

      // ── Vormonat-Vergleich (nur Haushalt) ──
      const vormonatPosten = (vormonatRes.data || []).filter(p => (p.typ || "ausgabe") !== "einnahme");
      const vormonatAusgaben = vormonatPosten
        .filter(p => (p.budget_scope || "haushalt") === "haushalt")
        .reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

      // ── Nicht-monatliche Zahlungen nächsten Monat (nur Haushalt) ──
      const kommendeNichtMonatlich = (nextMonthRes.data || [])
        .filter(p =>
          p.intervall !== "Monatlich" &&
          (p.typ || "ausgabe") !== "einnahme" &&
          (p.budget_scope || "haushalt") === "haushalt"
        );

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
        budgetMonat: { ausgabenHaushalt, ausgabenPrivat, buchungen, vormonatAusgaben, kommendeNichtMonatlich },
        verlauf: [],
        timeline: timelineEvents,
      });

      // ── Verlauf (silent fail) ──
      const verlaufQuery = createVerlaufQuery({
        supabase,
        userId,
        householdId,
        select: "aktion, created_at, tabelle, datensatz_name",
        limit: 6,
      });
      if (verlaufQuery) {
        verlaufQuery.then(({ data }) => {
          if (data) setErweitert(e => ({ ...e, verlauf: data }));
        });
      }

    } catch (e) {
      console.error("HomeDashboard ladeStats:", e);
    } finally {
      setLoading(false);
    }
  }, [logRecurringBudgetHistory, resolveDashboardHouseholdId, userId]);

  useEffect(() => { ladeStats(); }, [ladeStats]);

  // ── Kacheln-Definition ──
  const { vorraeteAmpel, naechsteWartung } = erweitert;
  const kacheln = [
    {
      titel: t("home:dashboard.cards.inventory"),
      wert: stats.objekte,
      einheit: t("home:dashboard.cards.inventoryUnit"),
      unter: t("home:dashboard.cards.inventoryLocations", { count: stats.orte }),
      icon: Package, farbe: "blue", pfad: "/home/inventar",
      tourId: "tour-dashboard-inventar",
    },
    {
      titel: t("home:dashboard.cards.stock"),
      wert: stats.vorraeteGesamt,
      einheit: t("home:dashboard.cards.stockUnit"),
      unter: vorraeteAmpel.rot > 0
        ? t("home:dashboard.ampel.restockCount", { count: vorraeteAmpel.rot, low: vorraeteAmpel.gelb })
        : t("home:dashboard.ampel.sufficientCount", { count: vorraeteAmpel.gruen }),
      icon: ShoppingCart,
      farbe: stats.vorraeteRot > 0 ? "red" : "green",
      pfad: "/home/vorraete",
      warnung: stats.vorraeteRot > 0,
    },
    {
      titel: t("home:dashboard.cards.medicineCabinet", { defaultValue: "Heimapotheke" }),
      wert: stats.medikamenteGesamt || 0,
      einheit: t("home:dashboard.cards.medicineUnit", { defaultValue: "Medikamente" }),
      unter: (stats.medikamenteAblauf || 0) > 0
        ? t("home:dashboard.warnMedicineExpiry", { count: stats.medikamenteAblauf, defaultValue: `${stats.medikamenteAblauf} laufen bald ab` })
        : t("home:dashboard.warnMedicineLow", { count: stats.medikamenteNiedrig || 0, defaultValue: `${stats.medikamenteNiedrig || 0} niedriger Bestand` }),
      icon: Pill,
      farbe: (stats.medikamenteAblauf || stats.medikamenteNiedrig) ? "red" : "green",
      pfad: "/home/heimapotheke",
      warnung: (stats.medikamenteAblauf || stats.medikamenteNiedrig) > 0,
    },
    {
      titel: t("home:dashboard.cards.shopping"),
      wert: stats.einkaufOffen,
      einheit: t("home:dashboard.cards.shoppingUnit"),
      icon: ShoppingCart, farbe: "amber", pfad: "/home/einkaufliste",
    },
    {
      titel: t("home:dashboard.cards.devices"),
      wert: stats.geraete,
      einheit: "gespeichert",
      unter: stats.geraeteWartungFaellig > 0
        ? `${stats.geraeteWartungFaellig} Wartung fällig`
        : naechsteWartung
          ? t("home:dashboard.cards.deviceNext", { name: naechsteWartung.name, days: naechsteWartung.tage })
          : "Alles in Ordnung",
      icon: Wrench,
      farbe: stats.geraeteWartungFaellig > 0 ? "orange" : "green",
      pfad: "/home/geraete",
      warnung: stats.geraeteWartungFaellig > 0,
    },
    {
      titel: t("home:dashboard.cards.tasksToday"),
      wert: stats.aufgabenHeute,
      einheit: t("home:dashboard.cards.taskUnit"),
      icon: CheckSquare,
      farbe: stats.aufgabenHeute > 0 ? "red" : "green",
      pfad: "/home/aufgaben",
      tourId: "tour-dashboard-aufgaben",
    },
    {
      titel: t("home:dashboard.cards.activeProjects"),
      wert: stats.projekteAktiv,
      einheit: t("home:dashboard.cards.projectUnit"),
      icon: FolderOpen, farbe: "purple", pfad: "/home/projekte",
    },
    {
      titel: t("home:dashboard.cards.residents"),
      wert: stats.bewohner,
      einheit: t("home:dashboard.cards.residentUnit"),
      icon: Users, farbe: "teal", pfad: "/home/bewohner",
      tourId: "tour-dashboard-bewohner",
    },
    {
      titel: t("home:dashboard.cards.documents"),
      wert: stats.dokumente,
      einheit: t("home:dashboard.cards.documentUnit"),
      icon: FileText, farbe: "indigo", pfad: "/home/dokumente",
    },
  ];

  const farbKlassen = {
    blue:   "bg-blue-500/10 text-blue-500",
    green:  "bg-green-500/10 text-green-500",
    red:    "bg-red-500/10 text-red-500",
    amber:  "bg-amber-500/10 text-amber-500",
    teal:   "bg-teal-500/10 text-teal-500",
    orange: "bg-orange-500/10 text-orange-500",
    purple: "bg-purple-500/10 text-purple-500",
    indigo: "bg-indigo-500/10 text-indigo-500",
  };

  const SEKTIONEN = [
    {
      titel: "Räume & Objekte",
      grad: "from-blue-500 to-teal-400",
      labelFarbe: "text-blue-400",
      items: [kacheln[0], kacheln[4], kacheln[8]],
    },
    {
      titel: "Versorgung",
      grad: "from-amber-500 to-orange-400",
      labelFarbe: "text-amber-400",
      items: [kacheln[1], kacheln[2], kacheln[3]],
    },
    {
      titel: "Haushalt & Leben",
      grad: "from-purple-500 to-indigo-400",
      labelFarbe: "text-purple-400",
      items: [kacheln[5], kacheln[6], kacheln[7]],
    },
  ];

  const urgencyCount =
    (stats.aufgabenHeute > 0 ? 1 : 0) +
    (stats.vorraeteRot > 0 ? 1 : 0) +
    ((stats.medikamenteNiedrig > 0 || stats.medikamenteAblauf > 0) ? 1 : 0) +
    (stats.geraeteWartungFaellig > 0 ? 1 : 0);

  const urgentKachel =
    stats.aufgabenHeute > 0      ? kacheln.find(k => k.pfad === "/home/aufgaben") :
    stats.geraeteWartungFaellig > 0 ? kacheln.find(k => k.pfad === "/home/geraete") :
    stats.vorraeteRot > 0        ? kacheln.find(k => k.pfad === "/home/vorraete") :
    null;

  // ── Reduced Motion ────────────────────────────────────────────────────────────
  const reduced = useReducedMotion();
  const { isMobile } = useViewport();

  // ── Skeleton Loading State ────────────────────────────────────────────────────
  if (loading) {
    return (
      <GlassModule className="home-dashboard-modern min-h-full space-y-6 p-4 pb-28 md:p-6 lg:pb-8 animate-fade-in">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-11 h-11 rounded-card-sm flex-shrink-0" />
          <div className="space-y-2">
            <SkeletonPulse className="h-6 w-36 rounded" />
            <SkeletonPulse className="h-3 w-52 rounded" />
          </div>
        </div>
        {/* Kacheln-Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        {/* Row A */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SkeletonWidget />
          <SkeletonWidget />
          <SkeletonWidget />
        </div>
        {/* Row B */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonWidget />
          <GlassSurface interactive={false} className="p-4 space-y-3">
            <SkeletonPulse className="h-4 w-36 rounded mb-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonPulse className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                <SkeletonPulse className="h-3 flex-1 rounded" />
                <SkeletonPulse className="h-3 w-10 rounded flex-shrink-0" />
              </div>
            ))}
          </GlassSurface>
        </div>
      </GlassModule>
    );
  }

  const { budgetMonat, aktiveProjekte, timeline, verlauf } = erweitert;
  const offenePairBalances = buildOpenPairBalances(openLedgerRows);
  const offeneSaldoCount = offenePairBalances.length;
  const gesamtOffeneSchulden =
    offenePairBalances.reduce((sum, row) => sum + Number(row.open_amount_cents || 0), 0) / 100;


  // ── Budget Mini-Bar ──
  const budgetTotal = budgetMonat.ausgabenHaushalt + budgetMonat.ausgabenPrivat;
  const hhRatio = budgetTotal > 0 ? budgetMonat.ausgabenHaushalt / budgetTotal : 0;

  return (
    <GlassModule
      className="home-dashboard-modern min-h-full space-y-6 p-4 pb-28 md:p-6 lg:pb-8"
      variants={reduced ? {} : sectionVariants}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        data-tour="tour-dashboard-willkommen"
        variants={reduced ? {} : headerVariants}
        className="flex items-center gap-3"
      >
        <div className="w-11 h-11 rounded-card-sm bg-primary-500/15 flex items-center justify-center
                        shadow-glow-primary ring-1 ring-primary-500/20 flex-shrink-0">
          <Home size={22} className="text-primary-500" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight
                         bg-gradient-to-r from-light-text-main to-primary-600
                         dark:from-dark-text-main dark:to-primary-400
                         bg-clip-text text-transparent">
            {getGreeting()}
          </h1>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate">
            {heuteLang()} · {t("home:dashboard.subtitle")}
          </p>
        </div>
      </motion.div>

      {isMobile ? (
        /* ═══════════════════════════════════════════════════════════════════════
           MOBILE LAYOUT – Bento Grid mit Prioritäten auf einen Blick
        ═══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">

          {/* ── Alert-Strip (nur wenn Dringendes vorhanden) ─────────────────── */}
          <AnimatePresence>
            {urgencyCount > 0 && (
              <motion.div
                key="mobile-alert"
                variants={reduced ? {} : warnVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="flex items-center gap-2 px-3 py-2.5 rounded-card-sm
                           bg-amber-500/10 border border-amber-500/20"
              >
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="text-sm text-amber-300">
                  {urgencyCount === 1 ? "1 Punkt benötigt" : `${urgencyCount} Punkte benötigen`} Aufmerksamkeit
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Heute-Sektion: Aufgaben + nächstes Event ────────────────────── */}
          <motion.div
            variants={reduced ? {} : gridVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3"
          >
            <GlassSurface
              as="button"
              variants={reduced ? {} : cardVariants}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/home/aufgaben")}
              className="p-3 cursor-pointer text-left"
            >
              <CheckSquare
                size={18}
                className={`mb-2 ${stats.aufgabenHeute > 0 ? "text-red-400" : "text-primary-500"}`}
              />
              <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
                <AnimatedNumber value={stats.aufgabenHeute} />
              </div>
              <div className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">fällig</div>
              <div className="text-xs font-medium text-light-text-main dark:text-dark-text-main mt-0.5">
                Aufgaben heute
              </div>
            </GlassSurface>

            <GlassSurface
              variants={reduced ? {} : cardVariants}
              className="p-3"
            >
              <Calendar size={18} className="text-secondary-500 mb-2" />
              {timeline[0] ? (
                <>
                  <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
                    {Math.max(0, tagesBis(timeline[0].datum) ?? 0)}
                  </div>
                  <div className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">Tage</div>
                  <div className="text-xs font-medium text-light-text-main dark:text-dark-text-main mt-0.5 truncate">
                    {timeline[0].titel}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">–</div>
                  <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                    Keine Events
                  </div>
                </>
              )}
            </GlassSurface>
          </motion.div>

          {/* ── Budget + Ausgleich – kombinierte Karte (immer sichtbar) ────── */}
          <GlassSurface
            variants={reduced ? {} : cardVariants}
            initial="hidden"
            animate="show"
            data-tour="tour-dashboard-budget"
            className="w-full overflow-hidden"
          >
            {/* ── Oberer Bereich: Budget ── */}
            <button
              onClick={() => navigate("/home/budget")}
              className="w-full p-4 text-left cursor-pointer
                         hover:bg-light-hover dark:hover:bg-canvas-3
                         active:bg-light-surface-2 dark:active:bg-canvas-3
                         transition-colors duration-200"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">💶</span>
                  <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                    Budget – {monatLabel()}
                  </span>
                </div>
                <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
              </div>

              {budgetTotal === 0 ? (
                <div className="text-2xl font-bold text-light-text-secondary dark:text-dark-text-secondary mt-1">
                  0 €
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between mt-1">
                    <div className="text-3xl font-bold text-primary-500 tabular-nums">
                      {fmt(budgetMonat.ausgabenHaushalt)} €
                    </div>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                      {budgetMonat.buchungen} Buchungen
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                    <span className="flex items-center gap-0.5 text-red-400">
                      <TrendingDown size={10} /> Haushalt diesen Monat
                    </span>
                    {budgetMonat.ausgabenPrivat > 0 && (
                      <span className="text-amber-400">
                        + {fmt(budgetMonat.ausgabenPrivat)} € privat
                      </span>
                    )}
                    {budgetMonat.vormonatAusgaben > 0 && (() => {
                      const delta = budgetMonat.ausgabenHaushalt - budgetMonat.vormonatAusgaben;
                      const pct = Math.round(Math.abs(delta) / budgetMonat.vormonatAusgaben * 100);
                      const hoeher = delta > 0;
                      return (
                        <span className={`flex items-center gap-0.5 ${hoeher ? "text-red-400" : "text-green-400"}`}>
                          {hoeher ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {hoeher ? "+" : "−"}{pct}% zum Vormonat ({fmt(budgetMonat.vormonatAusgaben)} €)
                        </span>
                      );
                    })()}
                  </div>

                  {/* Haushalt / Privat Mini-Bar */}
                  {budgetTotal > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-3 text-[10px] text-light-text-secondary dark:text-dark-text-secondary mb-1">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-primary-500" />
                          Haushalt
                        </span>
                        {budgetMonat.ausgabenPrivat > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-secondary-500" />
                            Privat
                          </span>
                        )}
                      </div>
                      <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-secondary-500/20 dark:bg-canvas-3">
                        <motion.div
                          className="absolute left-0 top-0 bottom-0 bg-primary-500 rounded-full"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: hhRatio }}
                          transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
                          style={{ transformOrigin: "left", width: "100%" }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </button>

            {/* ── Trennlinie ── */}
            <div className="h-px bg-light-border dark:bg-dark-border mx-0" />

            {/* ── Unterer Bereich: Ausgleich im Haushalt ── */}
            <button
              onClick={() => navigate("/home/budget?tab=ausgleich")}
              className="w-full p-4 text-left cursor-pointer
                         hover:bg-light-hover dark:hover:bg-canvas-3
                         active:bg-light-surface-2 dark:active:bg-canvas-3
                         transition-colors duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">↔</span>
                  <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                    Ausgleich im Haushalt
                  </span>
                </div>
                {offeneSaldoCount === 0 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-pill font-semibold
                                   bg-green-500/15 text-green-400 border border-green-500/30">
                    ✓ Ausgeglichen
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-pill font-semibold
                                   bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {offeneSaldoCount} offen
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main tabular-nums">
                  {formatGermanCurrency(gesamtOffeneSchulden)} €
                </div>
                <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary mb-0.5" />
              </div>
              <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                {offeneSaldoCount === 0
                  ? "Keine offenen Positionen"
                  : `${offeneSaldoCount} offene ${offeneSaldoCount === 1 ? "Position" : "Positionen"}`}
              </div>
            </button>

            {/* ── Trennlinie ── */}
            <div className="h-px bg-light-border dark:bg-dark-border" />

            {/* ── Sparziele (Mobile) ── */}
            <button
              onClick={() => navigate("/home/budget")}
              className="w-full p-4 text-left cursor-pointer
                         hover:bg-light-hover dark:hover:bg-canvas-3
                         active:bg-light-surface-2 dark:active:bg-canvas-3
                         transition-colors duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🎯</span>
                  <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                    Sparziele
                  </span>
                  {sparziele.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-pill font-semibold
                                     bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {sparziele.length}
                    </span>
                  )}
                </div>
                <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
              </div>
              {sparziele.length === 0 ? (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Keine Sparziele angelegt.
                </p>
              ) : (
                <div className="space-y-2">
                  {sparziele.slice(0, 2).map((z) => {
                    const progress = Math.min(
                      (Number(z.aktueller_betrag) / Math.max(Number(z.ziel_betrag), 1)) * 100,
                      100
                    );
                    return (
                      <div key={z.id}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="truncate text-light-text-main dark:text-dark-text-main">
                            {z.emoji || "🎯"} {z.name}
                          </span>
                          <span className="shrink-0 ml-2 text-light-text-secondary dark:text-dark-text-secondary">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-light-border dark:bg-canvas-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-700 ${progress === 0 ? "opacity-25" : ""}`}
                            style={{ width: progress === 0 ? "3px" : `${progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                          <span>{Number(z.aktueller_betrag).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                          <span>{Number(z.ziel_betrag).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                        </div>
                      </div>
                    );
                  })}
                  {sparziele.length > 2 && (
                    <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                      +{sparziele.length - 2} weitere
                    </p>
                  )}
                </div>
              )}
            </button>

            {/* ── Trennlinie ── */}
            {budgetLimitRows.length > 0 && (
              <div className="h-px bg-light-border dark:bg-dark-border" />
            )}

            {/* ── Budgetlimits (Mobile) ── */}
            {budgetLimitRows.length > 0 && (
              <button
                onClick={() => navigate("/home/budget?tab=limits")}
                className="w-full p-4 text-left cursor-pointer
                           hover:bg-light-hover dark:hover:bg-canvas-3
                           active:bg-light-surface-2 dark:active:bg-canvas-3
                           transition-colors duration-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📊</span>
                    <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                      Budgetlimits
                    </span>
                    {budgetLimitRows.some(r => r.status === "ueberschritten") && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-pill font-semibold bg-red-500/15 text-red-500 border border-red-500/20">
                        {budgetLimitRows.filter(r => r.status === "ueberschritten").length} überschritten
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
                </div>
                <div className="space-y-2">
                  {budgetLimitRows.slice(0, 2).map((row) => {
                    const barClass = row.status === "ueberschritten" ? "bg-red-500" : row.status === "warnung" ? "bg-amber-500" : "bg-green-500";
                    const pctClass = row.status === "ueberschritten" ? "text-red-500" : row.status === "warnung" ? "text-amber-500" : "text-green-500";
                    return (
                      <div key={row.kategorie}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="flex items-center gap-1.5 truncate text-light-text-main dark:text-dark-text-main">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                            {row.kategorie}
                          </span>
                          <span className={`shrink-0 ml-2 font-medium ${pctClass}`}>{Math.round(row.progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-light-border dark:bg-canvas-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${barClass}`}
                            style={{ width: `${row.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                          <span>{Number(row.verbrauch).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                          <span>von {Number(row.limitEuro).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                        </div>
                      </div>
                    );
                  })}
                  {budgetLimitRows.length > 2 && (
                    <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">+{budgetLimitRows.length - 2} weitere</p>
                  )}
                </div>
              </button>
            )}
          </GlassSurface>

          {/* ── Urgent Card (optional, nur wenn Modul Warnung hat) ──────────── */}
          {urgentKachel && (() => {
            const UrgentIcon = urgentKachel.icon;
            return (
              <GlassSurface
                as="button"
                initial={{ opacity: 0, y: 18 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  boxShadow: [
                    "0 0 0px rgba(239,68,68,0)",
                    "0 0 16px rgba(239,68,68,0.3)",
                    "0 0 0px rgba(239,68,68,0)",
                  ],
                }}
                transition={{
                  opacity: { duration: 0.3 },
                  y: { type: "spring", stiffness: 320, damping: 30 },
                  boxShadow: { repeat: Infinity, duration: 2.4, ease: "easeInOut", delay: 0.5 },
                }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(urgentKachel.pfad)}
                className="w-full p-4 cursor-pointer border-red-500/30 text-left relative"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-card-sm ${farbKlassen[urgentKachel.farbe]}`}>
                    <UrgentIcon size={18} />
                  </div>
                  <motion.span
                    className="w-2.5 h-2.5 rounded-full bg-red-500"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                  />
                </div>
                <div className="text-3xl font-bold text-light-text-main dark:text-dark-text-main">
                  <AnimatedNumber value={urgentKachel.wert} />
                </div>
                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {urgentKachel.einheit}
                </div>
                <div className="text-base font-semibold text-light-text-main dark:text-dark-text-main mt-1">
                  {urgentKachel.titel}
                </div>
                {urgentKachel.unter && (
                  <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                    {urgentKachel.unter}
                  </div>
                )}
              </GlassSurface>
            );
          })()}

          {/* ── Haushalts-Übersichtskarte (Mobile) ──────────────────────── */}
          <GlassSurface
            data-tour="tour-dashboard-status"
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 divide-y divide-light-border dark:divide-dark-border">
              {SEKTIONEN.map((sek) => (
                <div key={sek.titel} className="relative flex flex-col">
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${sek.grad}`} />
                  <div className="px-4 pt-4 pb-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${sek.labelFarbe}`}>
                      {sek.titel}
                    </span>
                  </div>
                  {sek.items.map((k) => {
                    const Icon = k.icon;
                    return (
                      <button
                        key={k.pfad}
                        data-tour={k.tourId || undefined}
                        onClick={() => navigate(k.pfad)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-light-hover dark:hover:bg-canvas-3 active:bg-light-hover dark:active:bg-canvas-3 transition-colors text-left group"
                      >
                        <div className="relative shrink-0">
                          <div className={`w-8 h-8 rounded-card-sm flex items-center justify-center ${farbKlassen[k.farbe]}`}>
                            <Icon size={15} />
                          </div>
                          {k.warnung && (
                            <motion.span
                              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-light-card dark:ring-canvas-2"
                              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
                            {k.titel}
                          </div>
                          {k.unter && (
                            <div className="text-[10px] text-dark-text-secondary truncate leading-tight">{k.unter}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold text-light-text-main dark:text-dark-text-main leading-none">
                            <AnimatedNumber value={k.wert} />
                          </div>
                          <div className="text-[10px] text-dark-text-secondary">{k.einheit}</div>
                        </div>
                        <ChevronRight size={12} className="text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                  <div className="pb-2" />
                </div>
              ))}
            </div>
          </GlassSurface>

          {/* ── Horizontales Scroll-Row: Sekundär-Module ────────────────────── */}
          <div
            className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {[
              { label: "Aufgaben",  icon: CheckSquare, route: "/home/aufgaben",  count: stats.aufgabenHeute,  color: "text-primary-500"  },
              { label: "Projekte",  icon: FolderOpen,  route: "/home/projekte",  count: stats.projekteAktiv,  color: "text-purple-400"   },
              { label: "Bewohner",  icon: Users,        route: "/home/bewohner",  count: stats.bewohner,       color: "text-teal-400"     },
              { label: "Dokumente", icon: FileText,     route: "/home/dokumente", count: stats.dokumente,      color: "text-indigo-400"   },
            ].map(item => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.route)}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-pill
                             bg-light-card dark:bg-canvas-2
                             border border-light-border dark:border-dark-border
                             text-sm font-medium
                             text-light-text-main dark:text-dark-text-main
                             cursor-pointer hover:bg-light-hover dark:hover:bg-canvas-3
                             transition-colors duration-200"
                >
                  <ItemIcon size={14} className={item.color} />
                  <span>{item.label}</span>
                  {item.count != null && (
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Verlauf (kompakt, wenn vorhanden) ───────────────────────────── */}
          {verlauf.length > 0 && (
            <GlassSurface
              variants={reduced ? {} : cardVariants}
              initial="hidden"
              animate="show"
              className="p-4"
            >
              <SectionHeader icon={Clock} label={t("home:dashboard.recentActivity")} />
              <div className="space-y-2.5">
                {verlauf.slice(0, 4).map((v, i) => {
                  const meta = getVerlaufTableMeta(v.tabelle);
                  const emoji = MODUL_ICON[v.tabelle] || meta.emoji || "📝";
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
                                       text-sm ${MODUL_COLOR[v.tabelle] || "bg-canvas-3 text-dark-text-secondary"}`}>
                        {emoji}
                      </div>
                      <span className="text-xs text-light-text-main dark:text-dark-text-main flex-1 truncate">
                        {getVerlaufDisplayText(v)}
                      </span>
                      <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary shrink-0">
                        {relativeZeit(v.created_at, t)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GlassSurface>
          )}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════
           DESKTOP LAYOUT – unverändertes Original-Layout
        ═══════════════════════════════════════════════════════════════════════ */
        <>
          {/* ── Warnungs-Banner (AnimatePresence) ─────────────────────────── */}
          <AnimatePresence>
            {(stats.vorraeteRot > 0 || stats.medikamenteAblauf > 0 || stats.medikamenteNiedrig > 0 || stats.geraeteWartungFaellig > 0 || stats.aufgabenHeute > 0) && (
              <motion.div
                key="warn-banner"
                variants={reduced ? {} : warnVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="relative overflow-hidden rounded-card-sm origin-top"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/25 to-orange-500/20
                                border border-amber-500/35 rounded-card-sm" />
                <div className="relative p-3 flex items-start gap-2.5">
                  <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300 flex flex-wrap gap-x-3 gap-y-0.5">
                    {stats.vorraeteRot > 0 && (
                      <span>{t("home:dashboard.warnStock", { count: stats.vorraeteRot })}</span>
                    )}
                    {stats.medikamenteAblauf > 0 && (
                      <span>{t("home:dashboard.warnMedicineExpiry", { count: stats.medikamenteAblauf, defaultValue: `${stats.medikamenteAblauf} Medikamente laufen bald ab` })}</span>
                    )}
                    {stats.medikamenteNiedrig > 0 && (
                      <span>{t("home:dashboard.warnMedicineLow", { count: stats.medikamenteNiedrig, defaultValue: `${stats.medikamenteNiedrig} Medikamente mit niedrigem Bestand` })}</span>
                    )}
                    {stats.geraeteWartungFaellig > 0 && (
                      <span>{t("home:dashboard.warnDevice", { count: stats.geraeteWartungFaellig })}</span>
                    )}
                    {stats.aufgabenHeute > 0 && (
                      <span>{t("home:dashboard.warnTask", { count: stats.aufgabenHeute })}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Haushalts-Übersichtskarte (Desktop) ──────────────────────── */}
          <motion.section variants={reduced ? {} : sectionItemVariants} data-tour="tour-dashboard-status">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {SEKTIONEN.map((sek) => (
                  <GlassSurface key={sek.titel} className="relative flex flex-col overflow-hidden">
                    <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${sek.grad}`} />
                    <div className="px-4 pt-4 pb-1.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${sek.labelFarbe}`}>
                        {sek.titel}
                      </span>
                    </div>
                    {sek.items.map((k) => {
                      const Icon = k.icon;
                      return (
                        <motion.button
                          key={k.pfad}
                          data-tour={k.tourId || undefined}
                          onClick={() => navigate(k.pfad)}
                          whileTap={{ scale: 0.98 }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left group"
                        >
                          <div className="relative shrink-0">
                            <div className={`w-8 h-8 rounded-card-sm flex items-center justify-center group-hover:ring-2 group-hover:ring-primary-500/20 transition-all ${farbKlassen[k.farbe]}`}>
                              <Icon size={15} />
                            </div>
                            {k.warnung && (
                              <motion.span
                                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-light-card dark:ring-canvas-2"
                                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
                              {k.titel}
                            </div>
                            {k.unter && (
                              <div className="text-[10px] text-dark-text-secondary truncate leading-tight">{k.unter}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-bold text-light-text-main dark:text-dark-text-main leading-none">
                              <AnimatedNumber value={k.wert} />
                            </div>
                            <div className="text-[10px] text-dark-text-secondary">{k.einheit}</div>
                          </div>
                          <ChevronRight size={12} className="text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </motion.button>
                      );
                    })}
                    <div className="pb-2" />
                  </GlassSurface>
              ))}
            </div>
          </motion.section>

          {/* ── Budgetübersicht ───────────────────────────────────────────── */}
          <motion.section variants={reduced ? {} : sectionItemVariants}>
            <SectionHeader icon={TrendingUp} label="Budgetübersicht" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

                {/* Sektion 1: Budget */}
                <GlassSurface className="relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary-500 to-emerald-400" />
                  <motion.button
                    data-tour="tour-dashboard-budget"
                    whileTap={{ scale: 0.99 }}
                    onClick={() => navigate("/home/budget")}
                    className="w-full p-4 text-left group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">💶</span>
                        <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                          {t("home:dashboard.budgetTitle", { month: monatLabel() })}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {budgetMonat.ausgabenHaushalt === 0 && budgetMonat.ausgabenPrivat === 0 && budgetMonat.buchungen === 0 ? (
                      <>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                          {t("home:dashboard.noBudgetEntries")}
                        </p>
                        {budgetMonat.kommendeNichtMonatlich.length > 0 && (
                          <p className="text-xs text-amber-400 flex items-center gap-1 mt-2">
                            <AlertTriangle size={11} />
                            {t("home:dashboard.irregularPayments", {
                              count: budgetMonat.kommendeNichtMonatlich.length,
                              amount: fmt(budgetMonat.kommendeNichtMonatlich.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0)),
                            })}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-end justify-between">
                          <span className="text-2xl font-bold text-light-text-main dark:text-dark-text-main tabular-nums">
                            {fmt(budgetMonat.ausgabenHaushalt)} €
                          </span>
                          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
                            {t("home:dashboard.bookings", { count: budgetMonat.buchungen })}
                          </span>
                        </div>
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <TrendingDown size={11} /> {t("home:dashboard.householdThisMonth")}
                        </p>
                        {budgetMonat.ausgabenPrivat > 0 && (
                          <p className="text-xs text-amber-400">
                            + {fmt(budgetMonat.ausgabenPrivat)} € privat
                          </p>
                        )}
                        {budgetMonat.vormonatAusgaben > 0 && (() => {
                          const delta = budgetMonat.ausgabenHaushalt - budgetMonat.vormonatAusgaben;
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
                            {t("home:dashboard.irregularPayments", {
                              count: budgetMonat.kommendeNichtMonatlich.length,
                              amount: fmt(budgetMonat.kommendeNichtMonatlich.reduce((s, p) => s + Math.abs(Number(p.betrag)), 0)),
                            })}
                          </p>
                        )}
                        {budgetTotal > 0 && (
                          <div className="mt-2 pt-2 border-t border-light-border dark:border-dark-border">
                            <div className="flex items-center gap-3 text-[10px] text-light-text-secondary dark:text-dark-text-secondary mb-1.5">
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-primary-500" />
                                Haushalt
                              </span>
                              {budgetMonat.ausgabenPrivat > 0 && (
                                <span className="flex items-center gap-1">
                                  <span className="inline-block w-2 h-2 rounded-full bg-secondary-500" />
                                  Privat
                                </span>
                              )}
                            </div>
                            <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-secondary-500/20 dark:bg-canvas-3">
                              <motion.div
                                className="absolute left-0 top-0 bottom-0 bg-primary-500 rounded-full"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: hhRatio }}
                                transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
                                style={{ transformOrigin: "left", width: "100%" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.button>
                </GlassSurface>

                {/* Sektion 2: Ausgleich */}
                <GlassSurface className="relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 to-sky-400" />
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => navigate("/home/budget?tab=ausgleich")}
                    className="w-full p-4 text-left group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">↔</span>
                        <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                          {t("home:dashboard.settlementTitle")}
                        </span>
                      </div>
                      {offeneSaldoCount === 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-pill font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
                          ✓ Ausgeglichen
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-pill font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          {offeneSaldoCount} offen
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-2xl font-bold text-light-text-main dark:text-dark-text-main tabular-nums">
                        {formatGermanCurrency(gesamtOffeneSchulden)} €
                      </div>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {t("home:dashboard.openDebtTotal")}
                      </p>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {t("home:dashboard.openPositions", { count: offeneSaldoCount })}
                      </p>
                    </div>
                  </motion.button>
                </GlassSurface>

                {/* Sektion 3: Ziele & Limits */}
                <GlassSurface className="relative flex flex-col overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-500 to-yellow-400" />

                  {/* ── Sparziele ── */}
                  <button
                    onClick={() => navigate("/home/budget")}
                    className="w-full p-4 pb-3 text-left group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎯</span>
                        <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Sparziele</span>
                      </div>
                      <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {sparziele.length === 0 ? (
                      <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Keine Sparziele angelegt.</p>
                    ) : (
                      <div className="space-y-2">
                        {sparziele.slice(0, budgetLimitRows.length > 0 ? 2 : 3).map((z) => {
                          const progress = Math.min((Number(z.aktueller_betrag) / Math.max(Number(z.ziel_betrag), 1)) * 100, 100);
                          return (
                            <div key={z.id}>
                              <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className="text-xs text-light-text-main dark:text-dark-text-main truncate">{z.emoji || "🎯"} {z.name}</span>
                                <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary shrink-0">{Math.round(progress)}%</span>
                              </div>
                              <div className="h-1.5 bg-light-border dark:bg-canvas-3 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-700 ${progress === 0 ? "opacity-25" : ""}`}
                                  style={{ width: progress === 0 ? "3px" : `${progress}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                                <span>{Number(z.aktueller_betrag).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                                <span>{Number(z.ziel_betrag).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                              </div>
                            </div>
                          );
                        })}
                        {sparziele.length > (budgetLimitRows.length > 0 ? 2 : 3) && (
                          <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                            +{sparziele.length - (budgetLimitRows.length > 0 ? 2 : 3)} weitere
                          </p>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Trennlinie — nur wenn Limits vorhanden */}
                  {budgetLimitRows.length > 0 && (
                    <div className="mx-4 h-px bg-light-border dark:bg-dark-border" />
                  )}

                  {/* ── Budgetlimits ── */}
                  {budgetLimitRows.length > 0 && (
                    <button
                      onClick={() => navigate("/home/budget?tab=limits")}
                      className="w-full p-4 pt-3 text-left group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📊</span>
                          <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Budgetlimits</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(() => {
                            const ueberschritten = budgetLimitRows.filter(r => r.status === "ueberschritten").length;
                            const warnung = budgetLimitRows.filter(r => r.status === "warnung").length;
                            if (ueberschritten > 0) return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-pill font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
                                {ueberschritten} überschritten
                              </span>
                            );
                            if (warnung > 0) return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-pill font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                {warnung} Warnung
                              </span>
                            );
                            return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-pill font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
                                Alles OK
                              </span>
                            );
                          })()}
                          <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        {budgetLimitRows.slice(0, 3).map((row) => {
                          const barClass = row.status === "ueberschritten" ? "bg-red-500" : row.status === "warnung" ? "bg-amber-500" : "bg-green-500";
                          const pctClass = row.status === "ueberschritten" ? "text-red-500 dark:text-red-400" : row.status === "warnung" ? "text-amber-500 dark:text-amber-400" : "text-green-600 dark:text-green-400";
                          return (
                            <div key={row.kategorie}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                                  <span className="text-xs text-light-text-main dark:text-dark-text-main truncate">{row.kategorie}</span>
                                </div>
                                <span className={`text-[10px] shrink-0 font-medium ${pctClass}`}>{Math.round(row.progress)}%</span>
                              </div>
                              <div className="h-1.5 bg-light-border dark:bg-canvas-3 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${barClass}`}
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: row.progress / 100 }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  style={{ transformOrigin: "left" }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                                <span>{Number(row.verbrauch).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                                <span>von {Number(row.limitEuro).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span>
                              </div>
                            </div>
                          );
                        })}
                        {budgetLimitRows.length > 3 && (
                          <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">+{budgetLimitRows.length - 3} weitere</p>
                        )}
                      </div>
                    </button>
                  )}
                </GlassSurface>

            </div>
          </motion.section>

          {/* ── Row B: Projekte · Nächste Ereignisse ──────────────────────── */}
          <motion.section variants={reduced ? {} : sectionItemVariants}>
            <SectionHeader icon={Calendar} label={t("home:dashboard.sectionProjects") || "Projekte & Termine"} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Projekte-Widget */}
              <GlassSurface
                as="button"
                variants={cardVariants}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate("/home/projekte")}
                className="p-4 cursor-pointer text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                      {t("home:dashboard.activeProjectsTitle", { count: stats.projekteAktiv })}
                    </span>
                  </div>
                  <ChevronRight size={14} className="text-light-text-secondary dark:text-dark-text-secondary
                                                     opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {aktiveProjekte.length === 0 ? (
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    {t("home:dashboard.noProjects")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {aktiveProjekte.map(p => (
                      <div key={p.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${projektAmpelFarbe(p)}`} />
                            <span className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
                              {p.name}
                            </span>
                          </div>
                          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary ml-2 flex-shrink-0 tabular-nums">
                            {p.progress}%
                          </span>
                        </div>
                        <AnimBar ratio={p.progress / 100} color="bg-purple-500" />
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          {p.todoGesamt > 0 && <span>✅ {p.todoErledigt}/{p.todoGesamt}</span>}
                          {p.zieldatum && (
                            <span>{t("home:dashboard.projectDue", { date: new Date(p.zieldatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) })}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassSurface>

              {/* Nächste Ereignisse — vertikale Timeline */}
              <GlassSurface
                variants={cardVariants}
                className="p-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={15} className="text-primary-500" />
                  <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                    {t("home:dashboard.next30Days")}
                  </span>
                </div>

                {timeline.length === 0 ? (
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    {t("home:dashboard.noEvents")}
                  </p>
                ) : (
                  <motion.div
                    variants={timelineVariants}
                    initial="hidden"
                    animate="show"
                    className="relative space-y-3 pl-1"
                  >
                    <div className="absolute left-[6px] top-2 bottom-2
                                    w-0.5 bg-light-border dark:bg-dark-border" />

                    {timeline.map((e, i) => {
                      const tage = tagesBis(e.datum);
                      const isOverdue = tage !== null && tage < 0;
                      const isUrgent  = tage !== null && tage >= 0 && tage <= 1;
                      const isHodie   = tage === 0;
                      const dotColor  = TIMELINE_DOT_COLOR[e.typ] || "bg-canvas-4";

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
                          className="flex items-start gap-3 rounded-card-sm -mx-1 px-1 py-0.5"
                        >
                          <motion.div
                            className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5 z-10
                                        ring-2 ring-light-card dark:ring-canvas-2 ${dotColor}`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 + i * 0.05 }}
                          />
                          <span className="text-xs text-light-text-main dark:text-dark-text-main flex-1 truncate leading-5 min-w-0">
                            {e.titel}
                          </span>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {isHodie && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-pill
                                               bg-red-500/15 text-red-400 border border-red-500/30">
                                heute
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-pill
                                               bg-red-500/15 text-red-400 border border-red-500/30">
                                überfällig
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-pill font-medium
                                              bg-light-surface-2 dark:bg-canvas-3
                                              border border-light-border dark:border-dark-border
                                              ${tagesFarbe(e.datum)}`}>
                              {new Date(e.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </GlassSurface>
            </div>
          </motion.section>

          {/* ── Aktivitäts-Feed ───────────────────────────────────────────── */}
          {verlauf.length > 0 && (
            <motion.section variants={reduced ? {} : sectionItemVariants}>
              <GlassSurface
                variants={cardVariants}
                className="p-4"
              >
                <SectionHeader icon={Clock} label={t("home:dashboard.recentActivity")} />
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="relative space-y-2.5"
                >
                  <div className="absolute left-[13px] top-3.5 bottom-0
                                  w-0.5 bg-light-border dark:bg-dark-border" />

                  {verlauf.map((v, i) => {
                    const meta = getVerlaufTableMeta(v.tabelle);
                    const emoji = MODUL_ICON[v.tabelle] || meta.emoji || "📝";
                    const colorClass = MODUL_COLOR[v.tabelle] || "bg-canvas-3 text-dark-text-secondary";

                    return (
                      <motion.div key={i} variants={listItemVariants} className="flex items-center gap-3 relative">
                        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                                         text-sm z-10 ring-2 ring-light-card dark:ring-canvas-2 ${colorClass}`}>
                          {emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs text-light-text-main dark:text-dark-text-main truncate">
                            {getVerlaufDisplayText(v)}
                          </span>
                          <span className="block text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                            {meta.label}
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-pill flex-shrink-0
                                         bg-light-surface-2 dark:bg-canvas-3
                                         border border-light-border dark:border-dark-border
                                         text-light-text-secondary dark:text-dark-text-secondary">
                          {relativeZeit(v.created_at, t)}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </GlassSurface>
            </motion.section>
          )}

          {/* ── Schnellzugriff ────────────────────────────────────────────── */}
          <motion.section variants={reduced ? {} : sectionItemVariants}>
            <SectionHeader label={t("home:dashboard.quickAccess")} />
            <motion.div
              variants={gridVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {SCHNELLZUGRIFF_ITEMS.map((item) => (
                <GlassSurface
                  as="button"
                  key={item.pfad}
                  variants={cardVariants}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(item.pfad)}
                  className="flex items-center gap-3 p-3 cursor-pointer text-left"
                >
                  <div className={`w-9 h-9 rounded-card-sm flex items-center justify-center
                                   text-xl flex-shrink-0 ${item.color}`}>
                    {item.icon}
                  </div>
                  <span className="text-sm text-light-text-main dark:text-dark-text-main flex-1 min-w-0 truncate">
                    {t(`home:dashboard.quickLabels.${item.labelKey}`)}
                  </span>
                  <ChevronRight
                    size={14}
                    className="text-light-text-secondary dark:text-dark-text-secondary
                               opacity-0 group-hover:opacity-100 flex-shrink-0
                               transition-opacity duration-150"
                  />
                </GlassSurface>
              ))}
            </motion.div>
          </motion.section>
        </>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.dashboard}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </GlassModule>
  );
};

export default HomeDashboard;
