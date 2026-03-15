import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import {
  Users,
  DollarSign,
  ListChecks,
  AlertTriangle,
  CalendarClock,
  Archive,
  Zap,
  CheckCircle,
  Home,
  FolderOpen,
  TrendingUp as GesamtFortschrittIcon,
} from "lucide-react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { formatGermanCurrency } from "../utils/formatUtils";
import { useTheme } from "../contexts/ThemeContext";
import { useAppMode } from "../contexts/AppModeContext";
import UmzugAbschlussModal from "./home/UmzugAbschlussModal";

// ── Animated count-up number ──────────────────────────────────────────────────
const AnimatedNumber = ({ value, decimals = 0 }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v)
  );
  useEffect(() => {
    const controls = animate(count, value, { duration: 0.7, ease: "easeOut" });
    return controls.stop;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <motion.span>{rounded}</motion.span>;
};

// ── Animated progress bar (scaleX) ───────────────────────────────────────────
const AnimBar = ({ ratio, color = "bg-primary-500", height = "h-1.5" }) => (
  <div className={`w-full bg-light-border dark:bg-dark-border rounded-full ${height} overflow-hidden`}>
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.min(Math.max(ratio, 0), 1) }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      style={{ transformOrigin: "left" }}
    />
  </div>
);

ChartJS.register(ArcElement, Tooltip, Legend);

// ── Umzugsfortschritt-Phasen ──────────────────────────────────────────────────
const PHASEN = [
  {
    name: "Vor dem Umzug",
    kategorien: ["Verträge", "Organisation", "Finanzen", "Dokumente", "Ausmisten", "Wohnung"],
    farbe: { bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  },
  {
    name: "Umzugstag",
    kategorien: ["Umzugstag", "Transport"],
    farbe: { bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  },
  {
    name: "Nach dem Umzug",
    kategorien: ["Behörde", "Versorger", "Gesundheit", "Sonstiges", "Fahrzeuge", "Küche", "Bad", "Kinderzimmer"],
    farbe: { bar: "bg-primary-500", text: "text-primary-600 dark:text-primary-400", badge: "bg-primary-500/10 text-primary-600 dark:text-primary-400" },
  },
];

// ── Chart-Farbpaletten ────────────────────────────────────────────────────────
const kategorieFarbenDark = {
  Transport:    "rgba(139, 92, 246, 0.7)",
  Material:     "rgba(16, 185, 129, 0.7)",
  Verpflegung:  "rgba(249, 115, 22, 0.7)",
  "Neue Möbel": "rgba(139, 92, 246, 0.5)",
  Kaution:      "rgba(234, 179, 8, 0.7)",
  Makler:       "rgba(239, 68, 68, 0.7)",
  Sonstiges:    "rgba(100, 116, 139, 0.7)",
};
const defaultChartColorsDark = [
  "rgba(16, 185, 129, 0.7)",
  "rgba(6, 182, 212, 0.7)",
  "rgba(139, 92, 246, 0.7)",
  "rgba(249, 115, 22, 0.7)",
  "rgba(239, 68, 68, 0.6)",
  "rgba(234, 179, 8, 0.7)",
];

const kategorieFarbenLight = {
  Transport:    "rgba(124, 58, 237, 0.7)",
  Material:     "rgba(5, 150, 105, 0.7)",
  Verpflegung:  "rgba(234, 88, 12, 0.7)",
  "Neue Möbel": "rgba(124, 58, 237, 0.5)",
  Kaution:      "rgba(202, 138, 4, 0.7)",
  Makler:       "rgba(220, 38, 38, 0.7)",
  Sonstiges:    "rgba(107, 114, 128, 0.7)",
};
const defaultChartColorsLight = [
  "rgba(5, 150, 105, 0.7)",
  "rgba(8, 145, 178, 0.7)",
  "rgba(124, 58, 237, 0.7)",
  "rgba(234, 88, 12, 0.7)",
  "rgba(220, 38, 38, 0.6)",
  "rgba(202, 138, 4, 0.7)",
];

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  date.setUTCHours(12);
  return date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
};

// ── Sub-Komponenten ───────────────────────────────────────────────────────────

/** Heldenbegrüßung mit Nutzername */
const HeroHeader = ({ session }) => {
  const name = session?.user?.user_metadata?.full_name
    || session?.user?.email?.split("@")[0]
    || "Nutzer";
  return (
    <div className="pt-2 pb-1">
      <p className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
        {getGreeting()},
      </p>
      <h1 className="text-3xl lg:text-4xl font-bold tracking-tight
                     text-light-text-main dark:text-dark-text-main">
        {name} 👋
      </h1>
    </div>
  );
};

/** Übersichtskarte: Umzugsfortschritt + Kisten + Todos */
const UmzugSummaryCard = ({
  gesamtFortschrittProzent,
  kistenGepacktCount, kistenGesamtCount,
  packlisteItemsCount, todosErledigt, todosGesamt,
}) => {
  const todosProzent = todosGesamt > 0 ? Math.round((todosErledigt / todosGesamt) * 100) : 0;
  return (
    <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2
                    border border-light-border dark:border-dark-border p-5 lg:p-6
                    hover:shadow-elevation-3 transition-shadow duration-300">
      {/* Gesamtfortschritt */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-1">
            Gesamtfortschritt
          </p>
          <p className="text-5xl font-bold text-light-text-main dark:text-dark-text-main leading-none">
            <AnimatedNumber value={gesamtFortschrittProzent} />
            <span className="text-2xl font-semibold text-light-text-secondary dark:text-dark-text-secondary ml-1">%</span>
          </p>
        </div>
        <motion.div
          className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center"
          animate={gesamtFortschrittProzent >= 100
            ? { scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }
            : {}}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          <GesamtFortschrittIcon size={22} className="text-primary-500" />
        </motion.div>
      </div>

      {/* Animated Gradient Progress Bar */}
      <div className="mb-4">
        <AnimBar
          ratio={gesamtFortschrittProzent / 100}
          color="bg-gradient-to-r from-primary-500 to-secondary-500"
          height="h-1.5"
        />
      </div>

      {/* Kisten + Todos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm p-3
                        border border-light-border/50 dark:border-dark-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Archive size={14} className="text-primary-500" />
            <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">Kisten</span>
          </div>
          <p className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
            <AnimatedNumber value={kistenGepacktCount} />
            <span className="text-sm font-normal text-light-text-secondary dark:text-dark-text-secondary">/<AnimatedNumber value={kistenGesamtCount} /></span>
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary"><AnimatedNumber value={packlisteItemsCount} /> Items</p>
        </div>
        <div className="bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm p-3
                        border border-light-border/50 dark:border-dark-border/50">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks size={14} className="text-secondary-500" />
            <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">To-Dos</span>
          </div>
          <p className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
            <AnimatedNumber value={todosErledigt} />
            <span className="text-sm font-normal text-light-text-secondary dark:text-dark-text-secondary">/<AnimatedNumber value={todosGesamt} /></span>
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary"><AnimatedNumber value={todosProzent} />% erledigt</p>
        </div>
      </div>
    </div>
  );
};

/** Schnellzugriff-Kacheln: 6 Haupt-Features im 2×3-Grid */
const KategorienCard = ({ navigate }) => {
  const features = [
    { name: "Packliste",   icon: Archive,      path: "/packliste",      color: "text-violet-400",  bg: "bg-violet-500/10" },
    { name: "Budget",      icon: DollarSign,   path: "/budget",         color: "text-primary-400", bg: "bg-primary-500/10" },
    { name: "To-Dos",      icon: ListChecks,   path: "/todos",          color: "text-secondary-400",bg: "bg-secondary-500/10" },
    { name: "Kontakte",    icon: Users,        path: "/kontakte",       color: "text-pink-400",    bg: "bg-pink-500/10" },
    { name: "Dokumente",   icon: FolderOpen,   path: "/dokumente",      color: "text-amber-400",   bg: "bg-amber-500/10" },
    { name: "Zeitstrahl",  icon: CalendarClock,path: "/zeitstrahl",     color: "text-sky-400",     bg: "bg-sky-500/10" },
  ];

  return (
    <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2
                    border border-light-border dark:border-dark-border p-5 lg:p-6
                    hover:shadow-elevation-3 transition-shadow duration-300">
      <h3 className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary
                     uppercase tracking-wider mb-4">
        Schnellzugriff
      </h3>
      <motion.div
        className="grid grid-cols-3 gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      >
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <motion.button
              key={f.path}
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22,1,0.36,1] } } }}
              whileHover={{ scale: 1.05, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(f.path)}
              className="flex flex-col items-center gap-2 p-3 rounded-card-sm
                         bg-light-surface-1 dark:bg-canvas-3
                         border border-light-border dark:border-dark-border
                         hover:border-primary-500/30 hover:bg-light-surface-2 dark:hover:bg-canvas-4
                         hover:shadow-elevation-1 transition-colors duration-200 group"
            >
              <div className={`w-9 h-9 rounded-lg ${f.bg} flex items-center justify-center`}>
                <Icon size={18} className={f.color} />
              </div>
              <span className="text-xs font-medium text-light-text-main dark:text-dark-text-main
                               text-center leading-tight">
                {f.name}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
};

/** Aktive Aufgaben: Die 3 wichtigsten offenen Todos */
const AktiveAufgabenCard = ({ todos }) => {
  const heute = new Date().toISOString().split("T")[0];
  return (
    <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2
                    border border-light-border dark:border-dark-border p-5 lg:p-6
                    hover:shadow-elevation-3 transition-shadow duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary
                       uppercase tracking-wider">
          Wichtige Aufgaben
        </h3>
        <Link
          to="/todos"
          className="text-xs text-primary-500 hover:text-primary-400 font-medium transition-colors"
        >
          Alle →
        </Link>
      </div>

      {todos.length > 0 ? (
        <motion.ul
          className="space-y-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
          {todos.map((todo, idx) => {
            const isHoch = todo.prioritaet === "Hoch";
            const isHeute = todo.faelligkeitsdatum?.split("T")[0] === heute;
            const isAlert = isHoch || isHeute;
            return (
              <motion.li
                key={idx}
                variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0, transition: { duration: 0.25 } } }}
              >
                <Link
                  to="/todos"
                  className="flex items-start gap-3 p-2.5 rounded-card-sm
                             bg-light-surface-1 dark:bg-canvas-3
                             border border-light-border/50 dark:border-dark-border/50
                             hover:border-primary-500/30 hover:bg-light-surface-2 dark:hover:bg-canvas-4
                             transition-all duration-150 group block"
                >
                  <motion.div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0
                                ${isHoch ? "bg-accent-danger" : "bg-primary-500"}`}
                    animate={isAlert
                      ? { scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }
                      : {}}
                    transition={isAlert
                      ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" }
                      : {}}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">
                      {todo.beschreibung}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isHoch && (
                        <span className="text-xs font-medium text-accent-danger">Hohe Priorität</span>
                      )}
                      {todo.faelligkeitsdatum && (
                        <span className={`text-xs ${isHeute ? "text-accent-danger font-medium" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>
                          {isHeute ? "⚡ Heute fällig" : formatDate(todo.faelligkeitsdatum)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      ) : (
        <motion.div
          className="flex flex-col items-center justify-center py-6 text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <CheckCircle size={28} className="text-primary-500 mb-2 opacity-60" />
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Alle wichtigen Aufgaben erledigt!
          </p>
        </motion.div>
      )}
    </div>
  );
};

/** Kontakte-Übersicht + Budget-Mini-Bar */
const KontakteCard = ({ kontakteCount, budgetAusgegeben, budgetGesamt, kostenNachKategorie, theme, doughnutOptions }) => {
  const budgetProzent = budgetGesamt > 0 ? (budgetAusgegeben / budgetGesamt) * 100 : 0;
  const budgetKritisch = budgetGesamt > 0 && budgetProzent >= 80;

  return (
    <motion.div
      className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2
                  border border-light-border dark:border-dark-border p-5 lg:p-6
                  hover:shadow-elevation-3 transition-shadow duration-300"
      animate={budgetKritisch ? {
        boxShadow: [
          "0 0 0px rgba(239,68,68,0)",
          "0 0 12px rgba(239,68,68,0.3)",
          "0 0 0px rgba(239,68,68,0)",
        ],
      } : {}}
      transition={budgetKritisch ? { repeat: Infinity, duration: 2.6, ease: "easeInOut" } : {}}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Kontakte */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Users size={16} className="text-violet-400" />
            </div>
            <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Kontakte
            </span>
          </div>
          <p className="text-4xl font-bold text-light-text-main dark:text-dark-text-main mb-1">
            <AnimatedNumber value={kontakteCount} />
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-3">
            Gespeicherte Kontakte
          </p>
          <Link
            to="/kontakte"
            className="inline-flex items-center gap-1.5 text-xs font-medium
                       text-primary-500 hover:text-primary-400 transition-colors"
          >
            Alle anzeigen →
          </Link>
        </div>

        {/* Budget + Donut-Chart */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${budgetKritisch ? "bg-red-500/10" : "bg-primary-500/10"}`}>
              <motion.span
                animate={budgetKritisch ? { scale: [1, 1.2, 1] } : {}}
                transition={budgetKritisch ? { repeat: Infinity, duration: 1.8, ease: "easeInOut" } : {}}
              >
                <DollarSign size={16} className={budgetKritisch ? "text-red-500" : "text-primary-500"} />
              </motion.span>
            </div>
            <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Budget
            </span>
          </div>
          <p className="text-sm font-bold text-light-text-main dark:text-dark-text-main mb-1">
            {formatGermanCurrency(budgetAusgegeben)} € / {formatGermanCurrency(budgetGesamt)} €
          </p>
          <div className="mb-1">
            <AnimBar
              ratio={budgetProzent / 100}
              color={budgetKritisch ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-primary-500 to-secondary-500"}
              height="h-1.5"
            />
          </div>
          <motion.p
            className={`text-xs mb-3 ${budgetKritisch ? "text-red-500 font-medium" : "text-light-text-secondary dark:text-dark-text-secondary"}`}
            animate={budgetKritisch ? { opacity: [1, 0.6, 1] } : {}}
            transition={budgetKritisch ? { repeat: Infinity, duration: 1.5 } : {}}
          >
            <AnimatedNumber value={Math.round(budgetProzent)} />% verbraucht
            {budgetKritisch && " ⚠️"}
          </motion.p>

          {/* Mini Donut */}
          {kostenNachKategorie ? (
            <div className="h-28 relative">
              <Doughnut data={kostenNachKategorie} options={doughnutOptions} />
            </div>
          ) : (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Noch keine Ausgaben erfasst.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Haupt-Komponente ───────────────────────────────────────────────────────────
const Dashboard = ({ session }) => {
  const userId   = session?.user?.id;
  const { theme } = useTheme();
  const navigate  = useNavigate();

  // ── State ─────────────────────────────────────────────────────────────────────
  const [kontakteCount,         setKontakteCount]         = useState(0);
  const [gesamtbudget,          setGesamtbudget]          = useState(0);
  const [budgetAusgegeben,      setBudgetAusgegeben]      = useState(0);
  const [todosErledigt,         setTodosErledigt]         = useState(0);
  const [todosGesamt,           setTodosGesamt]           = useState(0);
  const [packlisteItemsCount,   setPacklisteItemsCount]   = useState(0);
  const [kistenGesamtCount,     setKistenGesamtCount]     = useState(0);
  const [kistenGepacktCount,    setKistenGepacktCount]    = useState(0);
  const [renovierungErledigt,   setRenovierungErledigt]   = useState(0);
  const [renovierungGesamt,     setRenovierungGesamt]     = useState(0);
  const [phasenTodos,           setPhasenTodos]           = useState([]);
  const [naechsteDeadlines,     setNaechsteDeadlines]     = useState([]);
  const [offeneTodosWichtig,    setOffeneTodosWichtig]    = useState([]);
  const [kostenNachKategorie,   setKostenNachKategorie]   = useState(null);
  const [loading,               setLoading]               = useState(true);
  const [error,                 setError]                 = useState(null);
  const [gesamtFortschrittProzent, setGesamtFortschrittProzent] = useState(0);
  const [zeigeAbschlussModal,   setZeigeAbschlussModal]  = useState(false);
  const { umzugAbgeschlossen, markUmzugAbgeschlossen, switchToHome } = useAppMode();

  // ── Datenabruf (unverändert) ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setKontakteCount(0); setGesamtbudget(0); setBudgetAusgegeben(0);
      setTodosGesamt(0); setTodosErledigt(0); setPacklisteItemsCount(0);
      setKistenGesamtCount(0); setKistenGepacktCount(0);
      setNaechsteDeadlines([]); setOffeneTodosWichtig([]); setKostenNachKategorie(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { count: kontakteData } = await supabase
        .from("kontakte").select("*", { count: "exact", head: true }).eq("user_id", userId);
      setKontakteCount(kontakteData || 0);

      const { data: profileData, error: profileError } = await supabase
        .from("user_profile").select("gesamtbudget").eq("id", userId).single();
      if (profileError && profileError.code !== "PGRST116") throw profileError;
      const currentGesamtbudget = profileData?.gesamtbudget || 0;
      setGesamtbudget(currentGesamtbudget);

      const { data: todosDataRes } = await supabase
        .from("todo_aufgaben")
        .select("erledigt, beschreibung, faelligkeitsdatum, prioritaet, kategorie")
        .eq("user_id", userId);
      setTodosGesamt(todosDataRes?.length || 0);
      setTodosErledigt(todosDataRes?.filter((t) => t.erledigt).length || 0);
      setPhasenTodos(todosDataRes || []);

      const { data: kistenDataForPackliste, error: kistenError } = await supabase
        .from("pack_kisten").select("id").eq("user_id", userId);
      if (kistenError) throw kistenError;

      const { data: gegenstaendeData, error: gegenstaendeError } = await supabase
        .from("pack_gegenstaende").select("id, kiste_id").eq("user_id", userId);
      if (gegenstaendeError) throw gegenstaendeError;

      const totalItems  = (gegenstaendeData || []).length;
      const gesamtKisten = (kistenDataForPackliste || []).length;
      setKistenGesamtCount(gesamtKisten);
      setPacklisteItemsCount(totalItems);
      setKistenGepacktCount(gesamtKisten);

      const { data: renovierungData } = await supabase
        .from("renovierungs_posten").select("status").eq("user_id", userId);
      const renovGesamt  = (renovierungData || []).length;
      const renovErledigt = (renovierungData || []).filter((r) => r.status === "Erledigt").length;
      setRenovierungGesamt(renovGesamt);
      setRenovierungErledigt(renovErledigt);

      const heuteString = new Date().toISOString().split("T")[0];
      const { data: deadlineTodos } = await supabase
        .from("todo_aufgaben")
        .select("id, beschreibung, faelligkeitsdatum")
        .eq("user_id", userId).eq("erledigt", false)
        .gte("faelligkeitsdatum", heuteString)
        .order("faelligkeitsdatum", { ascending: true }).limit(3);
      const { data: deadlineBudgetsFromDB } = await supabase
        .from("budget_posten")
        .select("id, beschreibung, datum, betrag, teilzahlungen:budget_teilzahlungen(betrag_teilzahlung)")
        .eq("user_id", userId).gte("datum", heuteString)
        .order("datum", { ascending: true }).limit(3);

      const deadlines = [];
      (deadlineTodos || []).forEach((item) =>
        deadlines.push({ id: `todo-${item.id}`, beschreibung: item.beschreibung, datum: item.faelligkeitsdatum, typ: "To-Do", link: "/todos" })
      );
      (deadlineBudgetsFromDB || []).forEach((item) => {
        const summeBezahlt = item.teilzahlungen.reduce((sum, tz) => sum + tz.betrag_teilzahlung, 0);
        if (item.betrag > summeBezahlt) {
          deadlines.push({ id: `budget-${item.id}`, beschreibung: `${item.beschreibung} (Budget)`, datum: item.datum, typ: "Zahlung", link: "/budget" });
        }
      });
      deadlines.sort((a, b) => new Date(a.datum) - new Date(b.datum));
      setNaechsteDeadlines(deadlines.slice(0, 3));

      const offene = (todosDataRes || [])
        .filter((t) => !t.erledigt)
        .sort((a, b) => (b.prioritaet === "Hoch" ? 1 : -1) - (a.prioritaet === "Hoch" ? 1 : -1)
          || new Date(a.faelligkeitsdatum) - new Date(b.faelligkeitsdatum))
        .slice(0, 3);
      setOffeneTodosWichtig(offene);

      const { data: alleBudgetPosten, error: budgetPostenError } = await supabase
        .from("budget_posten")
        .select("kategorie, teilzahlungen:budget_teilzahlungen(betrag_teilzahlung)")
        .eq("user_id", userId);
      if (budgetPostenError) throw budgetPostenError;

      let totalAusgegeben = 0;
      const ausgabenProKategorie = {};
      if (alleBudgetPosten) {
        alleBudgetPosten.forEach((posten) => {
          const kat = posten.kategorie || "Sonstiges";
          const summePosten = posten.teilzahlungen.reduce((s, tz) => s + (parseFloat(tz.betrag_teilzahlung) || 0), 0);
          totalAusgegeben += summePosten;
          if (summePosten > 0) ausgabenProKategorie[kat] = (ausgabenProKategorie[kat] || 0) + summePosten;
        });
      }
      setBudgetAusgegeben(totalAusgegeben);

      if (Object.keys(ausgabenProKategorie).length > 0) {
        const labels = Object.keys(ausgabenProKategorie);
        const dataValues = Object.values(ausgabenProKategorie);
        const currentKatFarben   = theme === "dark" ? kategorieFarbenDark   : kategorieFarbenLight;
        const currentDefColors   = theme === "dark" ? defaultChartColorsDark : defaultChartColorsLight;
        const backgroundColors   = labels.map((l, i) => currentKatFarben[l] || currentDefColors[i % currentDefColors.length]);
        const borderColors       = backgroundColors.map((c) => c.replace(/0\.[5-7]/, "1"));
        setKostenNachKategorie({
          labels,
          datasets: [{ label: "Ausgaben nach Kategorie", data: dataValues, backgroundColor: backgroundColors, borderColor: borderColors, borderWidth: 1 }],
        });
      } else {
        setKostenNachKategorie(null);
      }
    } catch (err) {
      console.error("Fehler Dashboard:", err);
      setError("Dashboard nicht geladen.");
    } finally {
      setLoading(false);
    }
  }, [userId, theme]);

  useEffect(() => {
    if (userId) fetchData();
    else setLoading(false);
    const handleStorageChange = (event) => {
      if (event.key === `umzugsBudgetGesamt_${userId}` && userId) {
        const savedBudget = localStorage.getItem(`umzugsBudgetGesamt_${userId}`);
        setGesamtbudget(savedBudget ? parseFloat(savedBudget) : 0);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [fetchData, userId]);

  // ── Berechnete Werte ──────────────────────────────────────────────────────────
  const budgetProzent         = gesamtbudget > 0 ? (budgetAusgegeben / gesamtbudget) * 100 : 0;
  const todosProzent          = todosGesamt > 0 ? (todosErledigt / todosGesamt) * 100 : 0;
  const kistenGepacktProzent  = kistenGesamtCount > 0 ? (kistenGepacktCount / kistenGesamtCount) * 100 : 0;
  const renovierungProzent    = renovierungGesamt > 0 ? (renovierungErledigt / renovierungGesamt) * 100 : 0;

  useEffect(() => {
    let progressSum = 0; let progressCount = 0;
    if (todosGesamt > 0)        { progressSum += todosProzent;       progressCount++; }
    if (kistenGesamtCount > 0)  { progressSum += kistenGepacktProzent; progressCount++; }
    if (renovierungGesamt > 0)  { progressSum += renovierungProzent; progressCount++; }
    setGesamtFortschrittProzent(progressCount > 0 ? Math.round(progressSum / progressCount) : 0);
  }, [todosProzent, kistenGepacktProzent, todosGesamt, kistenGesamtCount, renovierungProzent, renovierungGesamt]);

  const heuteStringFürHinweise = new Date().toISOString().split("T")[0];
  const aufgabenHeuteFaellig   = naechsteDeadlines.filter((d) => d.typ === "To-Do" && d.datum === heuteStringFürHinweise).length;
  const budgetWarnungAktiv     = gesamtbudget > 0 && budgetProzent >= 80;

  // ── Chart Options ─────────────────────────────────────────────────────────────
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        bodyColor:    theme === "dark" ? "#E2E8F0" : "#1F2937",
        titleColor:   theme === "dark" ? "#94A3B8" : "#6B7280",
        backgroundColor: theme === "dark" ? "#0A141A" : "#FFFFFF",
        borderColor:  theme === "dark" ? "#1E3A46" : "#CBD5E1",
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            let label = context.label ? `${context.label}: ` : "";
            if (context.parsed !== null) {
              label += new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(context.parsed);
            }
            return label;
          },
        },
      },
      title: { display: false },
    },
    cutout: "65%",
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Lade Dashboard…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 flex flex-col items-center gap-3">
        <AlertTriangle size={40} className="text-accent-danger" />
        <p className="text-accent-danger font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* ── Held-Begrüßung ────────────────────────────────────────────────────── */}
      <HeroHeader session={session} />

      {/* ── Warnbanner ────────────────────────────────────────────────────────── */}
      {(budgetWarnungAktiv || aufgabenHeuteFaellig > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, x: [0, -4, 4, -3, 3, -1, 1, 0] }}
          transition={{ duration: 0.5, x: { delay: 0.3, duration: 0.45 } }}
          className="p-3 rounded-card-sm border border-accent-warm/30 bg-accent-warm/5"
        >
          <div className="flex items-center gap-2 text-accent-warm">
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              <Zap size={18} className="shrink-0" />
            </motion.span>
            <div>
              <p className="font-semibold text-sm">Wichtige Hinweise</p>
              <ul className="list-disc list-inside text-xs mt-0.5 space-y-0.5">
                {budgetWarnungAktiv && <li>Budget zu {budgetProzent.toFixed(0)}% ausgeschöpft!</li>}
                {aufgabenHeuteFaellig > 0 && (
                  <li>{aufgabenHeuteFaellig} Aufgabe{aufgabenHeuteFaellig > 1 ? "n sind" : " ist"} heute fällig!</li>
                )}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Banner: Umzug abgeschlossen ───────────────────────────────────────── */}
      {gesamtFortschrittProzent >= 100 && !umzugAbgeschlossen && (
        <div className="p-4 rounded-card-sm border border-primary-500/30 bg-primary-500/5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-primary-500 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">
                  Umzug abgeschlossen! 🎉
                </p>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Möchtest du in den Home Organizer wechseln?
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => markUmzugAbgeschlossen()}
                className="px-3 py-1.5 text-xs border border-primary-500/30 rounded-pill
                           text-primary-500 hover:bg-primary-500/10 transition-colors"
              >
                Nicht jetzt
              </button>
              <button
                onClick={() => setZeigeAbschlussModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs
                           bg-primary-500 hover:bg-primary-600 text-white rounded-pill font-medium transition-colors"
              >
                <Home size={12} />
                Wechseln
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Abschluss-Modal ───────────────────────────────────────────────────── */}
      {zeigeAbschlussModal && (
        <UmzugAbschlussModal
          session={session}
          onAbschluss={() => { markUmzugAbgeschlossen(); switchToHome(); setZeigeAbschlussModal(false); }}
          onSchliessen={() => { markUmzugAbgeschlossen(); setZeigeAbschlussModal(false); }}
        />
      )}

      {/* ── 2-spaltiges asymmetrisches Grid (2+3 Spalten) ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 pb-6">

        {/* Linke Spalte: 2/5 */}
        <div className="lg:col-span-2 space-y-4">
          <UmzugSummaryCard
            gesamtFortschrittProzent={gesamtFortschrittProzent}
            kistenGepacktCount={kistenGepacktCount}
            kistenGesamtCount={kistenGesamtCount}
            packlisteItemsCount={packlisteItemsCount}
            todosErledigt={todosErledigt}
            todosGesamt={todosGesamt}
          />
          <AktiveAufgabenCard todos={offeneTodosWichtig} />
        </div>

        {/* Rechte Spalte: 3/5 */}
        <div className="lg:col-span-3 space-y-4">
          <KategorienCard navigate={navigate} />
          <KontakteCard
            kontakteCount={kontakteCount}
            budgetAusgegeben={budgetAusgegeben}
            budgetGesamt={gesamtbudget}
            kostenNachKategorie={kostenNachKategorie}
            theme={theme}
            doughnutOptions={doughnutOptions}
          />
        </div>
      </div>

      {/* ── Phasen-Checkliste ──────────────────────────────────────────────────── */}
      {phasenTodos.length > 0 && (
        <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2
                        border border-light-border dark:border-dark-border p-5 lg:p-6 mb-6">
          <h2 className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary
                         uppercase tracking-wider mb-4">
            Umzugsfortschritt nach Phase
          </h2>
          <div className="space-y-4">
            {PHASEN.map((phase) => {
              const phaseTodos = phasenTodos.filter((t) => phase.kategorien.includes(t.kategorie));
              const gesamt     = phaseTodos.length;
              const erledigt   = phaseTodos.filter((t) => t.erledigt).length;
              const prozent    = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
              return (
                <div key={phase.name}>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${phase.farbe.text}`}>{phase.name}</span>
                      <motion.span
                        className={`text-xs px-1.5 py-0.5 rounded ${phase.farbe.badge}`}
                        animate={prozent === 100 ? { scale: [1, 1.15, 1] } : {}}
                        transition={prozent === 100 ? { delay: 0.8, duration: 0.4 } : {}}
                      >
                        <AnimatedNumber value={erledigt} />/{gesamt}
                      </motion.span>
                    </div>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                      <AnimatedNumber value={prozent} />%
                    </span>
                  </div>
                  <AnimBar ratio={prozent / 100} color={phase.farbe.bar} height="h-2" />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-3">
            Nur kategorisierte Aufgaben werden gezählt.{" "}
            <Link to="/todos" className="text-primary-500 hover:text-primary-400 underline">
              Alle To-Dos anzeigen
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
