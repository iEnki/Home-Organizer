import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  format, addMonths, addDays,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  isSameMonth, isSameDay, isToday as isTodayFn,
  eachDayOfInterval,
} from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "../supabaseClient";
import { useAppMode } from "../contexts/AppModeContext";
import {
  CheckSquare, Wrench, DollarSign, CalendarDays, Utensils,
  X, ChevronLeft, ChevronRight, LayoutList, LayoutGrid,
} from "lucide-react";
import useViewport from "../hooks/useViewport";
import GlassSurface, { glassPageVariants, glassSurfaceClass } from "./ui/GlassSurface";

// ── Design-Konfiguration je Ereignistyp ─────────────────────────────────────
const EVENT_CFG = {
  aufgabe:     {
    hex: "#10B981",
    dot: "bg-primary-500",
    pill: "bg-primary-500/20 text-primary-500 border border-primary-500/30",
    badge: "border-primary-500/30 bg-primary-500/15 text-primary-500",
    glow: "hover:shadow-glow-primary",
  },
  wartung:     {
    hex: "#F97316",
    dot: "bg-accent-warm",
    pill: "bg-accent-warm/20 text-accent-warm border border-accent-warm/30",
    badge: "border-accent-warm/30 bg-accent-warm/15 text-accent-warm",
    glow: "hover:shadow-elevation-2",
  },
  budget:      {
    hex: "#06B6D4",
    dot: "bg-secondary-500",
    pill: "bg-secondary-500/20 text-secondary-500 border border-secondary-500/30",
    badge: "border-secondary-500/30 bg-secondary-500/15 text-secondary-500",
    glow: "hover:shadow-glow-secondary",
  },
  meilenstein: {
    hex: "#8B5CF6",
    dot: "bg-purple-500",
    pill: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    badge: "border-purple-500/30 bg-purple-500/15 text-purple-400",
    glow: "hover:shadow-elevation-2",
  },
  meal:        {
    hex: "#EC4899",
    dot: "bg-pink-500",
    pill: "bg-pink-500/20 text-pink-500 border border-pink-500/30",
    badge: "border-pink-500/30 bg-pink-500/15 text-pink-500",
    glow: "hover:shadow-elevation-2",
  },
};

const EVENT_ICONS = {
  aufgabe:     CheckSquare,
  wartung:     Wrench,
  budget:      DollarSign,
  meilenstein: CalendarDays,
  meal:        Utensils,
};

const LEGENDE_HOME  = ["aufgabe", "wartung", "budget", "meal"];
const LEGENDE_UMZUG = ["aufgabe", "meilenstein"];

// ── Datum-Hilfsfunktionen ────────────────────────────────────────────────────
const calcNaechstesDatum = (datum, intervall) => {
  const d = new Date(datum);
  switch (intervall) {
    case "Täglich":         return addDays(d, 1);
    case "Wöchentlich":     return addDays(d, 7);
    case "Monatlich":       return addMonths(d, 1);
    case "Vierteljährlich": return addMonths(d, 3);
    case "Jährlich":        return addMonths(d, 12);
    default:                return d;
  }
};

// ── MonatsAnsicht ────────────────────────────────────────────────────────────
function MonthView({ datum, events, onEventClick }) {
  const gridStart = startOfWeek(startOfMonth(datum), { weekStartsOn: 1 });
  const gridEnd   = endOfWeek(endOfMonth(datum), { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsForDay = (day) =>
    events.filter((e) => isSameDay(new Date(e.start), day));

  const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <GlassSurface interactive={false} className="overflow-hidden rounded-card-sm">
      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 bg-light-surface-1 dark:bg-canvas-3 border-b border-light-border dark:border-dark-border">
        {WOCHENTAGE_KURZ.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold tracking-widest uppercase text-light-text-secondary dark:text-dark-text-secondary">
            {d}
          </div>
        ))}
      </div>

      {/* Tag-Zellen */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = eventsForDay(day);
          const inMonth   = isSameMonth(day, datum);
          const today     = isTodayFn(day);
          const isWeekend = i % 7 >= 5;

          return (
            <div
              key={i}
              className={[
                "min-h-[68px] sm:min-h-[80px] p-1 border-b border-r border-light-border/40 dark:border-dark-border/40",
                i % 7 === 6 ? "border-r-0" : "",
                !inMonth ? "bg-light-surface-1/50 dark:bg-canvas-1/50" : "bg-light-card dark:bg-canvas-2",
                isWeekend && inMonth ? "bg-light-surface-1/30 dark:bg-canvas-2/60" : "",
              ].join(" ")}
            >
              {/* Tageszahl */}
              <div className={[
                "mb-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[11px] sm:text-xs font-medium transition-colors",
                today
                  ? "bg-primary-500 text-white font-bold shadow-glow-primary"
                  : inMonth
                    ? "text-light-text-main dark:text-dark-text-main"
                    : "text-light-text-secondary/40 dark:text-dark-text-secondary/40",
              ].join(" ")}>
                {format(day, "d")}
              </div>

              {/* Event-Pills */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => {
                  const cfg = EVENT_CFG[ev.typ] || EVENT_CFG.aufgabe;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      className={`w-full text-left rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold truncate transition-opacity hover:opacity-75 ${cfg.pill}`}
                    >
                      {ev.title}
                    </button>
                  );
                })}
                {dayEvents.length > 2 && (
                  <p className="text-[9px] pl-1 text-light-text-secondary dark:text-dark-text-secondary">
                    +{dayEvents.length - 2}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassSurface>
  );
}

// ── Listen-/Agenda-Ansicht ───────────────────────────────────────────────────
function AgendaView({ datum, events, onEventClick }) {
  const monthStart = startOfMonth(datum);
  const monthEnd   = endOfMonth(datum);

  const upcoming = [...events]
    .filter((e) => {
      const d = new Date(e.start);
      return d >= monthStart && d <= monthEnd;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Gruppierung nach Datum
  const grouped = upcoming.reduce((acc, ev) => {
    const key = format(new Date(ev.start), "yyyy-MM-dd");
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped).sort();

  if (!dateKeys.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-3">
          <CalendarDays size={22} className="text-primary-500" />
        </div>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          Keine Termine in diesem Monat
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dateKeys.map((key, gi) => {
        const dayDate = new Date(key);
        const today   = isTodayFn(dayDate);
        return (
          <div
            key={key}
            className="animate-slide-in-up"
            style={{ animationDelay: `${gi * 50}ms`, animationFillMode: "both" }}
          >
            {/* Datumsstreifen */}
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-card-sm flex flex-col items-center justify-center shrink-0 border
                ${today
                  ? "bg-primary-500 border-primary-500 text-white shadow-glow-primary"
                  : "bg-light-surface-1 dark:bg-canvas-3 border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
              >
                <span className="text-[9px] font-bold uppercase leading-none tracking-wider">
                  {format(dayDate, "EEE", { locale: de })}
                </span>
                <span className="text-sm font-bold leading-none mt-0.5">
                  {format(dayDate, "d")}
                </span>
              </div>
              <div className="flex-1 h-px bg-light-border dark:bg-dark-border" />
              <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary shrink-0 uppercase tracking-wider">
                {format(dayDate, "MMMM", { locale: de })}
              </span>
            </div>

            {/* Event-Karten */}
            <div className="space-y-2 pl-12 sm:pl-14">
              {grouped[key].map((ev, i) => {
                const cfg  = EVENT_CFG[ev.typ] || EVENT_CFG.aufgabe;
                const Icon = EVENT_ICONS[ev.typ] || CalendarDays;
                return (
                  <GlassSurface
                    as="button"
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className="w-full rounded-card-sm p-3 text-left"
                    style={{ animationDelay: `${gi * 50 + i * 35}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon-Box */}
                      <div
                        className="w-7 h-7 rounded-card-sm flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: `${cfg.hex}20` }}
                      >
                        <Icon size={14} style={{ color: cfg.hex }} />
                      </div>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate group-hover:text-primary-500 transition-colors">
                          {ev.title}
                        </p>
                        {ev.sub && (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate">
                            {ev.sub}
                          </p>
                        )}
                      </div>

                      {/* Typ-Badge */}
                      <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${cfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {ev.typ}
                      </div>
                    </div>
                  </GlassSurface>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Event-Detail-Modal ───────────────────────────────────────────────────────
function EventModal({ event, onClose, onOpenLink }) {
  const Icon  = EVENT_ICONS[event.typ] || CalendarDays;
  const cfg   = EVENT_CFG[event.typ] || EVENT_CFG.aufgabe;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-canvas-0/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`${glassSurfaceClass} relative w-full max-w-sm overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top-border */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${cfg.hex}, transparent)` }} />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-card-sm flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${cfg.hex}20` }}
              >
                <Icon size={20} style={{ color: cfg.hex }} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main leading-tight">
                  {event.title}
                </h3>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {format(new Date(event.start), "EEEE, dd. MMMM yyyy", { locale: de })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-card-sm flex items-center justify-center shrink-0
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Subtitle */}
          {event.sub && (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {event.sub}
            </p>
          )}

          {/* Typ-Badge */}
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {event.typ}
          </div>
          {event.link && (
            <button
              type="button"
              onClick={() => onOpenLink(event.link)}
              className="w-full rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600"
            >
              {event.linkLabel || "Open"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────
const KalenderUebersicht = ({ session }) => {
  const { t }   = useTranslation(["home"]);
  const reducedMotion = useReducedMotion();
  const userId  = session?.user?.id;
  const { appMode } = useAppMode();
  const { isMobile } = useViewport();
  const routerNavigate = useNavigate();

  const [events,        setEvents]        = useState([]);
  const [ladend,        setLadend]        = useState(true);
  const [ansicht,       setAnsicht]       = useState("month");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [datum,         setDatum]         = useState(new Date());

  // Monat navigieren
  const navigate = (dir) => setDatum((prev) => addMonths(prev, dir));

  // ── Daten laden ────────────────────────────────────────────────────────────
  const ladeEvents = useCallback(async () => {
    if (!userId) return;
    setLadend(true);
    const alleEvents = [];

    try {
      // 1. Aufgaben
      const { data: aufgaben } = await supabase
        .from("todo_aufgaben")
        .select("id, beschreibung, faelligkeitsdatum, prioritaet")
        .eq("user_id", userId)
        .eq("erledigt", false)
        .eq("app_modus", appMode)
        .not("faelligkeitsdatum", "is", null);

      (aufgaben || []).forEach((a) => {
        const d = new Date(a.faelligkeitsdatum);
        alleEvents.push({
          id: `aufgabe-${a.id}`,
          title: a.beschreibung,
          start: d, end: d, allDay: true,
          typ: "aufgabe",
          sub: t("home:calendar.priority", { priority: a.prioritaet || "–" }),
          link: appMode === "home" ? "/home/aufgaben" : "/todos",
        });
      });

      if (appMode === "home") {
        // 2. Gerätewartungen
        const { data: geraete } = await supabase
          .from("home_geraete")
          .select("id, name, naechste_wartung, hersteller")
          .eq("user_id", userId)
          .not("naechste_wartung", "is", null);

        (geraete || []).forEach((g) => {
          alleEvents.push({
            id: `wartung-${g.id}`,
            title: t("home:calendar.maintenanceTitle", { name: g.name }),
            start: new Date(g.naechste_wartung), end: new Date(g.naechste_wartung), allDay: true,
            typ: "wartung",
            sub: g.hersteller
              ? t("home:calendar.manufacturer", { manufacturer: g.hersteller })
              : t("home:calendar.deviceMaintenance"),
            link: "/home/geraete",
          });
        });

        // 3. Wiederkehrende Budget-Einträge
        const { data: budget } = await supabase
          .from("budget_posten")
          .select("id, beschreibung, betrag, intervall, naechstes_datum, kategorie")
          .eq("user_id", userId)
          .is("archived_at", null)
          .eq("wiederholen", true)
          .not("naechstes_datum", "is", null);

        (budget || []).forEach((b) => {
          let naechst = new Date(b.naechstes_datum);
          for (let i = 0; i < 3; i++) {
            if (i > 0) naechst = calcNaechstesDatum(naechst.toISOString().split("T")[0], b.intervall);
            alleEvents.push({
              id: `budget-${b.id}-${i}`,
              title: `${b.beschreibung} (${b.betrag} €)`,
              start: new Date(naechst), end: new Date(naechst), allDay: true,
              typ: "budget",
              sub: `${b.intervall} · ${b.kategorie || t("home:calendar.noCategory")}`,
              link: "/home/budget",
            });
          }
        });

        // 4. Essensplaner
        const { data: meals } = await supabase
          .from("home_rezept_plan")
          .select("id, planned_date, meal_slot, portionen, notizen, rezept_id, home_rezepte(id, titel, thumbnail_url)")
          .eq("user_id", userId)
          .gte("planned_date", format(startOfMonth(datum), "yyyy-MM-dd"))
          .lte("planned_date", format(endOfMonth(datum), "yyyy-MM-dd"));

        const mealSlotLabels = {
          breakfast: t("home:calendar.mealSlots.breakfast"),
          lunch: t("home:calendar.mealSlots.lunch"),
          dinner: t("home:calendar.mealSlots.dinner"),
          snack: t("home:calendar.mealSlots.snack"),
        };
        (meals || []).forEach((meal) => {
          const d = new Date(`${meal.planned_date}T00:00:00`);
          const recipeTitle = meal.home_rezepte?.titel || t("home:calendar.mealUnknownRecipe");
          const slotLabel = mealSlotLabels[meal.meal_slot] || t("home:calendar.meal");
          alleEvents.push({
            id: `meal-${meal.id}`,
            title: t("home:calendar.mealTitle", { slot: slotLabel, recipe: recipeTitle }),
            start: d, end: d, allDay: true,
            typ: "meal",
            sub: [
              t("home:calendar.mealServings", { count: meal.portionen || 4 }),
              meal.notizen,
            ].filter(Boolean).join(" · "),
            link: meal.rezept_id ? `/home/kochbuch/${meal.rezept_id}` : "/home/kochbuch",
            linkLabel: t("home:calendar.openRecipe"),
          });
        });
      } else {
        // 5. Umzug-Meilensteine
        try {
          const { data: meilensteine } = await supabase
            .from("umzug_meilensteine")
            .select("id, titel, datum, beschreibung")
            .eq("user_id", userId)
            .not("datum", "is", null);

          (meilensteine || []).forEach((m) => {
            alleEvents.push({
              id: `meilenstein-${m.id}`,
              title: m.titel,
              start: new Date(m.datum), end: new Date(m.datum), allDay: true,
              typ: "meilenstein",
              sub: m.beschreibung || t("home:calendar.movingMilestone"),
              link: "/zeitstrahl",
            });
          });
        } catch (_) { /* Tabelle optional */ }
      }

    } catch (err) {
      console.error("Fehler beim Laden der Kalenderevents:", err);
    } finally {
      setLadend(false);
    }

    setEvents(alleEvents);
  }, [userId, appMode, t, datum]);

  useEffect(() => { ladeEvents(); }, [ladeEvents]);

  // ── Legende ────────────────────────────────────────────────────────────────
  const legendeTypen = appMode === "home" ? LEGENDE_HOME : LEGENDE_UMZUG;
  const LEGENDE_LABELS = {
    aufgabe:     t("home:calendar.legend.tasks"),
    wartung:     t("home:calendar.legend.maintenance"),
    budget:      t("home:calendar.legend.payments"),
    meilenstein: t("home:calendar.legend.milestones"),
    meal:        t("home:calendar.legend.meals"),
  };

  const VIEWS = [
    { key: "month",  label: isMobile ? "Monat" : "Monatsansicht",  Icon: LayoutGrid },
    { key: "agenda", label: isMobile ? "Liste" : "Listenansicht",  Icon: LayoutList },
  ];

  return (
    <div className="home-glass-modern glass-module relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8">

      {/* Seitentitel */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
            {t("home:calendar.title")}
          </h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
            {appMode === "home"
              ? t("home:calendar.subtitleHome")
              : t("home:calendar.subtitleMove")}
          </p>
        </div>

        {/* Ansicht-Toggle */}
        <div className={`${glassSurfaceClass} flex items-center gap-1 rounded-card-sm p-1`}>
          {VIEWS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setAnsicht(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm text-sm font-medium transition-all
                ${ansicht === key
                  ? "bg-light-card dark:bg-canvas-2 text-primary-500 shadow-elevation-1"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kalender-Hauptkarte */}
      <GlassSurface interactive={false} className="overflow-hidden">

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-0.5 rounded-full bg-primary-500 shrink-0" />
            <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main capitalize">
              {format(datum, "MMMM yyyy", { locale: de })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDatum(new Date())}
              className="px-2.5 py-1 text-xs rounded-pill border border-light-border dark:border-dark-border
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:border-primary-500 hover:text-primary-500 transition-colors"
            >
              Heute
            </button>
            <div className="flex items-center rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden">
              <button
                onClick={() => navigate(-1)}
                aria-label={t("home:calendar.previous")}
                className="w-8 h-8 flex items-center justify-center
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors
                           border-r border-light-border dark:border-dark-border"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => navigate(1)}
                aria-label={t("home:calendar.next")}
                className="w-8 h-8 flex items-center justify-center
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-light-border dark:border-dark-border">
          {legendeTypen.map((typ) => {
            const cfg = EVENT_CFG[typ];
            return (
              <div key={typ} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                  {LEGENDE_LABELS[typ]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Inhalt */}
        <div className="p-4">
          {ladend ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 animate-pulse">
              <CalendarDays size={28} className="text-primary-500" />
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {t("home:calendar.loading")}
              </span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={ansicht}
                variants={reducedMotion ? {} : glassPageVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {ansicht === "month"
                  ? <MonthView datum={datum} events={events} onEventClick={setSelectedEvent} />
                  : <AgendaView datum={datum} events={events} onEventClick={setSelectedEvent} />}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </GlassSurface>

      {/* Event-Detail-Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onOpenLink={(link) => {
            setSelectedEvent(null);
            routerNavigate(link);
          }}
        />
      )}
    </div>
  );
};

export default KalenderUebersicht;
