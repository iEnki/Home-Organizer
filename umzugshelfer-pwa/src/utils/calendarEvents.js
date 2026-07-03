/**
 * calendarEvents.js
 * Wiederverwendbare Kalender-Event-Beschaffung fuer KalenderUebersicht und den
 * globalen Assistenten. Synthetisiert Events aus 5 Quellen:
 *   todo_aufgaben, home_geraete.naechste_wartung, wiederkehrende budget_posten,
 *   home_rezept_plan, umzug_meilensteine.
 */

import { supabase } from "../supabaseClient";
import { calcNaechstesDatum } from "./budgetRecurring";

const DEFAULT_LABELS = {
  priority: (prio) => `Prioritaet: ${prio || "-"}`,
  maintenanceTitle: (name) => `Wartung: ${name}`,
  manufacturer: (hersteller) => `Hersteller: ${hersteller}`,
  deviceMaintenance: () => "Geraetewartung",
  noCategory: () => "Ohne Kategorie",
  mealSlot: (slot) => ({
    breakfast: "Fruehstueck",
    lunch: "Mittagessen",
    dinner: "Abendessen",
    snack: "Snack",
  }[slot] || "Mahlzeit"),
  mealTitle: (slot, recipe) => `${slot}: ${recipe}`,
  mealUnknownRecipe: () => "Unbekanntes Rezept",
  mealServings: (count) => `${count} Portionen`,
  openRecipe: () => "Rezept oeffnen",
  movingMilestone: () => "Umzugs-Meilenstein",
};

/**
 * Expandiert einen wiederkehrenden Budget-Posten in die naechsten `count` Termine.
 * Pure Funktion (testbar).
 */
export const expandRecurringBudgetDates = (naechstesDatum, intervall, count = 3) => {
  if (!naechstesDatum) return [];
  const dates = [];
  let current = new Date(naechstesDatum);
  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      let nextString;
      try {
        nextString = calcNaechstesDatum(current.toISOString().split("T")[0], intervall);
      } catch {
        break; // Unbekanntes Intervall -> nur den ersten Termin liefern
      }
      if (!nextString) break;
      current = new Date(nextString);
    }
    if (Number.isNaN(current.getTime())) break;
    dates.push(new Date(current));
  }
  return dates;
};

/**
 * Baut die Event-Objekte aus den Rohdaten. Pure Funktion (testbar).
 * labels kann partiell ueberschrieben werden (z.B. i18n in KalenderUebersicht).
 */
export const buildCalendarEvents = ({
  appMode = "home",
  aufgaben = [],
  geraete = [],
  budget = [],
  meals = [],
  meilensteine = [],
  labels: labelOverrides = {},
} = {}) => {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const events = [];

  aufgaben.forEach((a) => {
    if (!a?.faelligkeitsdatum) return;
    const d = new Date(a.faelligkeitsdatum);
    events.push({
      id: `aufgabe-${a.id}`,
      title: a.beschreibung,
      start: d,
      end: d,
      allDay: true,
      typ: "aufgabe",
      sub: labels.priority(a.prioritaet),
      link: appMode === "home" ? "/home/aufgaben" : "/todos",
    });
  });

  geraete.forEach((g) => {
    if (!g?.naechste_wartung) return;
    events.push({
      id: `wartung-${g.id}`,
      title: labels.maintenanceTitle(g.name),
      start: new Date(g.naechste_wartung),
      end: new Date(g.naechste_wartung),
      allDay: true,
      typ: "wartung",
      sub: g.hersteller ? labels.manufacturer(g.hersteller) : labels.deviceMaintenance(),
      link: "/home/geraete",
    });
  });

  budget.forEach((b) => {
    expandRecurringBudgetDates(b.naechstes_datum, b.intervall, 3).forEach((date, i) => {
      events.push({
        id: `budget-${b.id}-${i}`,
        title: `${b.beschreibung} (${b.betrag} €)`,
        start: date,
        end: date,
        allDay: true,
        typ: "budget",
        sub: `${b.intervall} · ${b.kategorie || labels.noCategory()}`,
        link: "/home/budget",
      });
    });
  });

  meals.forEach((meal) => {
    if (!meal?.planned_date) return;
    const d = new Date(`${meal.planned_date}T00:00:00`);
    const recipeTitle = meal.home_rezepte?.titel || labels.mealUnknownRecipe();
    const slotLabel = labels.mealSlot(meal.meal_slot);
    events.push({
      id: `meal-${meal.id}`,
      title: labels.mealTitle(slotLabel, recipeTitle),
      start: d,
      end: d,
      allDay: true,
      typ: "meal",
      sub: [labels.mealServings(meal.portionen || 4), meal.notizen].filter(Boolean).join(" · "),
      link: meal.rezept_id ? `/home/kochbuch/${meal.rezept_id}` : "/home/kochbuch",
      linkLabel: labels.openRecipe(),
    });
  });

  meilensteine.forEach((m) => {
    if (!m?.datum) return;
    events.push({
      id: `meilenstein-${m.id}`,
      title: m.titel,
      start: new Date(m.datum),
      end: new Date(m.datum),
      allDay: true,
      typ: "meilenstein",
      sub: m.beschreibung || labels.movingMilestone(),
      link: "/zeitstrahl",
    });
  });

  return events;
};

/**
 * Laedt die Rohdaten fuer den Kalender.
 * mealVon/mealBis (yyyy-MM-dd) begrenzen den Essensplan-Zeitraum.
 */
export const loadCalendarRawData = async ({ userId, appMode = "home", mealVon, mealBis }) => {
  if (!userId) {
    return { aufgaben: [], geraete: [], budget: [], meals: [], meilensteine: [] };
  }

  const raw = { aufgaben: [], geraete: [], budget: [], meals: [], meilensteine: [] };

  const { data: aufgaben } = await supabase
    .from("todo_aufgaben")
    .select("id, beschreibung, faelligkeitsdatum, prioritaet")
    .eq("user_id", userId)
    .eq("erledigt", false)
    .eq("app_modus", appMode)
    .not("faelligkeitsdatum", "is", null);
  raw.aufgaben = aufgaben || [];

  if (appMode === "home") {
    const [geraeteRes, budgetRes] = await Promise.all([
      supabase
        .from("home_geraete")
        .select("id, name, naechste_wartung, hersteller")
        .eq("user_id", userId)
        .not("naechste_wartung", "is", null),
      supabase
        .from("budget_posten")
        .select("id, beschreibung, betrag, intervall, naechstes_datum, kategorie")
        .eq("user_id", userId)
        .is("archived_at", null)
        .eq("wiederholen", true)
        .not("naechstes_datum", "is", null),
    ]);
    raw.geraete = geraeteRes.data || [];
    raw.budget = budgetRes.data || [];

    let mealQuery = supabase
      .from("home_rezept_plan")
      .select("id, planned_date, meal_slot, portionen, notizen, rezept_id, home_rezepte(id, titel, thumbnail_url)")
      .eq("user_id", userId);
    if (mealVon) mealQuery = mealQuery.gte("planned_date", mealVon);
    if (mealBis) mealQuery = mealQuery.lte("planned_date", mealBis);
    const { data: meals } = await mealQuery;
    raw.meals = meals || [];
  } else {
    try {
      const { data: meilensteine } = await supabase
        .from("umzug_meilensteine")
        .select("id, titel, datum, beschreibung")
        .eq("user_id", userId)
        .not("datum", "is", null);
      raw.meilensteine = meilensteine || [];
    } catch (_) {
      // Tabelle optional
    }
  }

  return raw;
};

/**
 * Komfort-Funktion: laedt und baut Events in einem Schritt.
 * von/bis (yyyy-MM-dd) filtern optional das Endergebnis.
 */
export const loadCalendarEvents = async ({ userId, appMode = "home", von, bis, labels } = {}) => {
  const raw = await loadCalendarRawData({ userId, appMode, mealVon: von, mealBis: bis });
  let events = buildCalendarEvents({ appMode, ...raw, labels });
  if (von) {
    const vonDate = new Date(`${von}T00:00:00`);
    events = events.filter((event) => event.start >= vonDate);
  }
  if (bis) {
    const bisDate = new Date(`${bis}T23:59:59`);
    events = events.filter((event) => event.start <= bisDate);
  }
  return events.sort((a, b) => a.start - b.start);
};
