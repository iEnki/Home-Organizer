import React, { useState, useEffect, useCallback } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addMonths, addWeeks, addDays } from "date-fns";
import { de } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { supabase } from "../supabaseClient";
import { useAppMode } from "../contexts/AppModeContext";
import { CheckSquare, Wrench, DollarSign, CalendarDays, X, ChevronLeft, ChevronRight } from "lucide-react";
import useViewport from "../hooks/useViewport";

// ── date-fns Localizer (Deutsch) ────────────────────────────────────────────
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: de }),
  getDay,
  locales: { de },
});

// ── Farben je Ereignistyp ────────────────────────────────────────────────────
const EVENT_FARBEN = {
  aufgabe:     { bg: "#10B981", text: "#fff" },
  wartung:     { bg: "#F97316", text: "#fff" },
  budget:      { bg: "#06B6D4", text: "#fff" },
  meilenstein: { bg: "#8B5CF6", text: "#fff" },
};

const EVENT_ICONS = {
  aufgabe:     CheckSquare,
  wartung:     Wrench,
  budget:      DollarSign,
  meilenstein: CalendarDays,
};

// ── Datumsberechnung (wiederkehrende Events) ─────────────────────────────────
const calcNaechstesDatum = (datum, intervall) => {
  const d = new Date(datum);
  switch (intervall) {
    case "Täglich":        return addDays(d, 1);
    case "Wöchentlich":    return addWeeks(d, 1);
    case "Monatlich":      return addMonths(d, 1);
    case "Vierteljährlich":return addMonths(d, 3);
    case "Jährlich":       return addMonths(d, 12);
    default:               return d;
  }
};

// ── Event-Stil Callback ──────────────────────────────────────────────────────
const eventStyleGetter = (event) => {
  const farbe = EVENT_FARBEN[event.typ] || { bg: "#64748B", text: "#fff" };
  return {
    style: {
      backgroundColor: farbe.bg,
      color: farbe.text,
      border: "none",
      borderRadius: "8px",
      fontSize: "12px",
      padding: "2px 6px",
    },
  };
};

// ── Legende-Konfiguration je Modus ──────────────────────────────────────────
const LEGENDE_HOME  = ["aufgabe", "wartung", "budget"];
const LEGENDE_UMZUG = ["aufgabe", "meilenstein"];

// ── Komponente ───────────────────────────────────────────────────────────────
const KalenderUebersicht = ({ session }) => {
  const userId = session?.user?.id;
  const { appMode } = useAppMode();
  const { isMobile } = useViewport();
  const [events,          setEvents]          = useState([]);
  const [ladend,          setLadend]          = useState(true);
  const [ansicht,         setAnsicht]         = useState(
    () => (typeof window !== "undefined" && window.innerWidth < 768 ? "agenda" : "month")
  );
  const [selectedEvent,   setSelectedEvent]   = useState(null);
  const [datum,           setDatum]           = useState(new Date());
  const viewOptionen = isMobile ? ["agenda", "month"] : ["month", "week"];
  const kalenderHoehe = isMobile ? 480 : 600;
  const kalenderTitel = format(
    datum,
    ansicht === "month" ? "MMMM yyyy" : "dd. MMM yyyy",
    { locale: de }
  );

  const handleKalenderNavigate = (richtung) => {
    setDatum((vorher) => {
      if (ansicht === "month") return addMonths(vorher, richtung);
      if (ansicht === "week") return addWeeks(vorher, richtung);
      return addDays(vorher, richtung * 7);
    });
  };

  useEffect(() => {
    if (isMobile && ansicht === "week") setAnsicht("agenda");
    if (!isMobile && ansicht === "agenda") setAnsicht("month");
  }, [isMobile, ansicht]);

  const ladeEvents = useCallback(async () => {
    if (!userId) return;
    setLadend(true);
    const alleEvents = [];

    try {
      // 1. Aufgaben — nur für den aktiven Modus
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
          sub: `Priorität: ${a.prioritaet || "–"}`,
          link: appMode === "home" ? "/home/aufgaben" : "/todos",
        });
      });

      if (appMode === "home") {
        // 2. Gerätewartungen (nur Home Organizer)
        const { data: geraete } = await supabase
          .from("home_geraete")
          .select("id, name, naechste_wartung, hersteller")
          .eq("user_id", userId)
          .not("naechste_wartung", "is", null);

        (geraete || []).forEach((g) => {
          const d = new Date(g.naechste_wartung);
          alleEvents.push({
            id: `wartung-${g.id}`,
            title: `Wartung: ${g.name}`,
            start: d, end: d, allDay: true,
            typ: "wartung",
            sub: g.hersteller ? `Hersteller: ${g.hersteller}` : "Gerätewartung",
            link: "/home/geraete",
          });
        });

        // 3. Wiederkehrende Budget-Einträge (nur Home Organizer)
        const { data: budget } = await supabase
          .from("budget_posten")
          .select("id, beschreibung, betrag, intervall, naechstes_datum, kategorie")
          .eq("user_id", userId)
          .eq("wiederholen", true)
          .not("naechstes_datum", "is", null);

        (budget || []).forEach((b) => {
          let naechst = new Date(b.naechstes_datum);
          for (let i = 0; i < 3; i++) {
            if (i > 0) naechst = calcNaechstesDatum(naechst.toISOString().split("T")[0], b.intervall);
            const d = new Date(naechst);
            alleEvents.push({
              id: `budget-${b.id}-${i}`,
              title: `${b.beschreibung} (${b.betrag} €)`,
              start: d, end: d, allDay: true,
              typ: "budget",
              sub: `${b.intervall} · ${b.kategorie || "Keine Kategorie"}`,
              link: "/home/budget",
            });
          }
        });
      } else {
        // 4. Umzug-Meilensteine (nur Umzugplaner, Tabelle optional)
        try {
          const { data: meilensteine } = await supabase
            .from("umzug_meilensteine")
            .select("id, titel, datum, beschreibung")
            .eq("user_id", userId)
            .not("datum", "is", null);

          (meilensteine || []).forEach((m) => {
            const d = new Date(m.datum);
            alleEvents.push({
              id: `meilenstein-${m.id}`,
              title: m.titel,
              start: d, end: d, allDay: true,
              typ: "meilenstein",
              sub: m.beschreibung || "Umzugsmeilenstein",
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
  }, [userId, appMode]);

  useEffect(() => { ladeEvents(); }, [ladeEvents]);

  // ── Legende ───────────────────────────────────────────────────────────────
  const legendeTypen = appMode === "home" ? LEGENDE_HOME : LEGENDE_UMZUG;
  const LEGENDE_LABELS = { aufgabe: "Aufgaben", wartung: "Wartungen", budget: "Zahlungen", meilenstein: "Meilensteine" };
  const Legende = () => (
    <div className="flex flex-wrap gap-3 text-xs">
      {legendeTypen.map((typ) => (
        <div key={typ} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EVENT_FARBEN[typ].bg }} />
          <span className="text-light-text-secondary dark:text-dark-text-secondary">{LEGENDE_LABELS[typ]}</span>
        </div>
      ))}
    </div>
  );

  // ── Event-Detail-Modal ────────────────────────────────────────────────────
  const EventModal = ({ event }) => {
    const Icon = EVENT_ICONS[event.typ] || CalendarDays;
    const farbe = EVENT_FARBEN[event.typ] || { bg: "#64748B" };
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-canvas-0/70 backdrop-blur-sm"
           onClick={() => setSelectedEvent(null)}>
        <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-3 w-full max-w-sm p-5 space-y-4"
             onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-card-sm flex items-center justify-center shrink-0"
                   style={{ backgroundColor: `${farbe.bg}20` }}>
                <Icon size={18} style={{ color: farbe.bg }} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main leading-tight">
                  {event.title}
                </h3>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {format(event.start, "dd. MMMM yyyy", { locale: de })}
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedEvent(null)}
                    className="w-7 h-7 rounded-card-sm flex items-center justify-center
                               text-light-text-secondary dark:text-dark-text-secondary
                               hover:bg-light-surface-1 dark:hover:bg-canvas-3 shrink-0">
              <X size={16} />
            </button>
          </div>
          {event.sub && (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {event.sub}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Kalender</h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
            {appMode === "home"
              ? "Aufgaben, Wartungen & Zahlungen im Überblick"
              : "Aufgaben & Meilensteine im Überblick"}
          </p>
        </div>
        <div className="flex gap-2">
          {viewOptionen.map((v) => (
            <button key={v} onClick={() => setAnsicht(v)}
                    className={`px-3 py-1.5 rounded-pill text-sm font-medium transition-colors
                      ${ansicht === v ? "bg-primary-500 text-white" : "bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-2 dark:hover:bg-canvas-4"}`}>
              {v === "month" ? "Monat" : v === "week" ? "Woche" : "Agenda"}
            </button>
          ))}
        </div>
      </div>

      <Legende />

      {isMobile && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => handleKalenderNavigate(-1)}
            className="w-9 h-9 rounded-card-sm border border-light-border dark:border-dark-border
                       bg-light-card-bg dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary
                       flex items-center justify-center"
            aria-label="Vorheriger Zeitraum"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold text-light-text-main dark:text-dark-text-main capitalize">
            {kalenderTitel}
          </div>
          <button
            onClick={() => handleKalenderNavigate(1)}
            className="w-9 h-9 rounded-card-sm border border-light-border dark:border-dark-border
                       bg-light-card-bg dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary
                       flex items-center justify-center"
            aria-label="Nächster Zeitraum"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Kalender */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-4
                      [&_.rbc-calendar]:bg-transparent
                      [&_.rbc-header]:bg-light-surface-1 [&_.rbc-header]:dark:bg-canvas-3
                      [&_.rbc-header]:text-light-text-secondary [&_.rbc-header]:dark:text-dark-text-secondary
                      [&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:py-2
                      [&_.rbc-month-view]:border [&_.rbc-month-view]:border-light-border [&_.rbc-month-view]:dark:border-dark-border [&_.rbc-month-view]:rounded-card-sm
                      [&_.rbc-day-bg]:border-light-border/50 [&_.rbc-day-bg]:dark:border-dark-border/50
                      [&_.rbc-today]:bg-primary-500/5
                      [&_.rbc-off-range-bg]:bg-light-surface-1/50 [&_.rbc-off-range-bg]:dark:bg-canvas-1/50
                      [&_.rbc-date-cell]:text-light-text-secondary [&_.rbc-date-cell]:dark:text-dark-text-secondary [&_.rbc-date-cell]:text-xs [&_.rbc-date-cell]:p-1
                      [&_.rbc-toolbar]:mb-4 [&_.rbc-toolbar]:flex [&_.rbc-toolbar]:flex-wrap [&_.rbc-toolbar]:gap-2
                      [&_.rbc-toolbar-label]:text-light-text-main [&_.rbc-toolbar-label]:dark:text-dark-text-main [&_.rbc-toolbar-label]:font-semibold
                      [&_.rbc-btn-group]:flex [&_.rbc-btn-group]:gap-1
                      [&_.rbc-btn-group_button]:rounded-card-sm [&_.rbc-btn-group_button]:border [&_.rbc-btn-group_button]:border-light-border [&_.rbc-btn-group_button]:dark:border-dark-border
                      [&_.rbc-btn-group_button]:bg-light-surface-1 [&_.rbc-btn-group_button]:dark:bg-canvas-3
                      [&_.rbc-btn-group_button]:text-light-text-main [&_.rbc-btn-group_button]:dark:text-dark-text-main [&_.rbc-btn-group_button]:text-sm [&_.rbc-btn-group_button]:px-3 [&_.rbc-btn-group_button]:py-1.5
                      [&_.rbc-btn-group_button.rbc-active]:bg-primary-500 [&_.rbc-btn-group_button.rbc-active]:text-white [&_.rbc-btn-group_button.rbc-active]:border-primary-500
                      [&_.rbc-week-view]:border [&_.rbc-week-view]:border-light-border [&_.rbc-week-view]:dark:border-dark-border [&_.rbc-week-view]:rounded-card-sm
                      [&_.rbc-time-view]:border [&_.rbc-time-view]:border-light-border [&_.rbc-time-view]:dark:border-dark-border [&_.rbc-time-view]:rounded-card-sm
                       [&_.rbc-time-header]:bg-light-surface-1 [&_.rbc-time-header]:dark:bg-canvas-3
                       [&_.rbc-time-content]:bg-light-card-bg [&_.rbc-time-content]:dark:bg-canvas-2
                       [&_.rbc-timeslot-group]:border-light-border/30 [&_.rbc-timeslot-group]:dark:border-dark-border/30
                       [&_.rbc-current-time-indicator]:bg-primary-500
                       [&_.rbc-agenda-view_table]:text-xs [&_.rbc-agenda-view_table]:border-light-border [&_.rbc-agenda-view_table]:dark:border-dark-border">
        {ladend ? (
          <div className="h-96 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-light-text-secondary dark:text-dark-text-secondary">
              <CalendarDays size={32} className="animate-pulse text-primary-500" />
              <span className="text-sm">Ereignisse werden geladen…</span>
            </div>
          </div>
        ) : (
          <Calendar
            localizer={localizer}
            events={events}
            view={ansicht}
            onView={setAnsicht}
            date={datum}
            onNavigate={setDatum}
            style={{ height: kalenderHoehe }}
            views={isMobile ? ["month", "agenda"] : ["month", "week", "day", "agenda"]}
            toolbar={!isMobile}
            popup
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(event) => setSelectedEvent(event)}
            culture="de"
            messages={{
              next: "Vor", previous: "Zurück", today: "Heute",
              month: "Monat", week: "Woche", day: "Tag", agenda: "Agenda",
              noEventsInRange: "Keine Ereignisse in diesem Zeitraum",
              showMore: (n) => `+${n} weitere`,
            }}
          />
        )}
      </div>

      {/* Event-Detail-Modal */}
      {selectedEvent && <EventModal event={selectedEvent} />}
    </div>
  );
};

export default KalenderUebersicht;
