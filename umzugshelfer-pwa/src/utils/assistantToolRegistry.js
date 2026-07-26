/**
 * assistantToolRegistry.js
 * Tool-Registry fuer den agentischen globalen Assistenten.
 *
 * Lese-Tools fuehren gezielte, RLS-geschuetzte Supabase-Queries aus.
 * Schreib-Tools (Phase 3) erzeugen AUSSCHLIESSLICH Vorschlaege (pendingAction)
 * ueber prepareAssistantAction — niemals direkte DB-Writes.
 *
 * ToolSpec: {
 *   name, description, parameters (JSON-Schema),
 *   execute: async ({ session, userId, householdId, appMode, locale, args, onProposal }) => object
 * }
 */

import { supabase } from "../supabaseClient";
import { createVerlaufQuery } from "./homeVerlauf";
import { loadCalendarEvents } from "./calendarEvents";
import { searchRecipesForAssistant } from "./assistantCapabilities";
import { buildMileageHistory, calculateConsumptionSegments } from "./kfzStats";
import { ASSISTANT_DOMAIN_CONFIG, ASSISTANT_ROUTE_MAP } from "./assistantDomains";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

const clampLimit = (value, fallback = DEFAULT_LIMIT) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.round(parsed), MAX_LIMIT);
};

/**
 * Behaelt nur die bevorzugten Felder, die in der Zeile tatsaechlich existieren.
 * Robust gegen Schema-Drift und haelt Tool-Ergebnisse klein.
 */
export const pickRowFields = (row, preferredKeys) => {
  if (!row || typeof row !== "object") return row;
  const next = {};
  preferredKeys.forEach((key) => {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      next[key] = row[key];
    }
  });
  return next;
};

const sanitizeRows = (rows, preferredKeys) =>
  (Array.isArray(rows) ? rows : []).map((row) => pickRowFields(row, preferredKeys));

/**
 * Kuerzt ein Tool-Ergebnis auf maxChars (als JSON-String).
 */
export const truncateToolResult = (value, maxChars = 4000) => {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (typeof text !== "string") text = String(text);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}… [gekuerzt]`;
};

/**
 * Konvertiert ToolSpecs in das OpenAI-Tools-Format.
 */
export const toOpenAiTools = (specs) =>
  (Array.isArray(specs) ? specs : []).map((spec) => ({
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters || { type: "object", properties: {} },
    },
  }));

const textParam = (description) => ({ type: "string", description });

const simpleSearchTool = ({
  name,
  description,
  table,
  searchColumns,
  resultKeys,
  extraFilter,
  defaultLimit = DEFAULT_LIMIT,
}) => ({
  name,
  description,
  parameters: {
    type: "object",
    properties: {
      query: textParam("Suchbegriff (optional, leer = neueste Eintraege)"),
      limit: { type: "number", description: `Max. Anzahl (Standard ${defaultLimit})` },
    },
  },
  execute: async ({ userId, args = {} }) => {
    // count: "exact" liefert die echte Gesamtzahl passender Datensaetze —
    // wichtig fuer Zaehlfragen, da eintraege durch limit gekappt sind.
    let query = supabase.from(table).select("*", { count: "exact" }).eq("user_id", userId);
    if (extraFilter) query = extraFilter(query);
    const term = String(args.query || "").trim();
    if (term && searchColumns.length > 0) {
      query = query.or(searchColumns.map((col) => `${col}.ilike.%${term}%`).join(","));
    }
    const { data, error, count } = await query.limit(clampLimit(args.limit, defaultLimit));
    if (error) return { fehler: error.message };
    const rows = sanitizeRows(data, resultKeys);
    return { anzahl_gesamt: count ?? rows.length, angezeigt: rows.length, eintraege: rows };
  },
});

// ── Lese-Tools ────────────────────────────────────────────────────────────────

const buildInventarTool = () =>
  simpleSearchTool({
    name: "suche_inventar",
    description: "Sucht Gegenstaende im Inventar (home_objekte): Name, Kategorie, Status, Lagerort-Zuordnung.",
    table: "home_objekte",
    searchColumns: ["name", "kategorie"],
    resultKeys: ["id", "name", "kategorie", "status", "tags", "lagerort_id", "menge", "wert"],
  });

const buildVorraeteTool = () =>
  simpleSearchTool({
    name: "suche_vorraete",
    description: "Sucht Vorraete/Verbrauchsgueter (home_vorraete) mit Bestand, Einheit und Mindestmenge.",
    table: "home_vorraete",
    searchColumns: ["name", "kategorie"],
    resultKeys: ["id", "name", "kategorie", "bestand", "einheit", "mindestmenge", "ablaufdatum"],
  });

const buildMedikamenteTool = () => ({
  name: "suche_medikamente",
  description:
    "Sucht Medikamente in der Heimapotheke: Bestand, Ablaufdatum, Lagerort. KEINE medizinische Beratung, Dosierung oder Wechselwirkungen.",
  parameters: {
    type: "object",
    properties: {
      query: textParam("Medikamenten- oder Wirkstoffname (optional)"),
      nur_ablaufend: { type: "boolean", description: "Nur bald ablaufende/abgelaufene zeigen" },
    },
  },
  execute: async ({ userId, householdId, args = {} }) => {
    let query = supabase
      .from("home_medikamente")
      .select("*", { count: "exact" })
      .or(householdId ? `user_id.eq.${userId},household_id.eq.${householdId}` : `user_id.eq.${userId}`);
    const term = String(args.query || "").trim();
    if (term) query = query.or(`name.ilike.%${term}%,wirkstoff.ilike.%${term}%`);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 30));
    if (error) return { fehler: error.message };
    let rows = data || [];
    if (args.nur_ablaufend) {
      const grenze = new Date();
      grenze.setMonth(grenze.getMonth() + 2);
      rows = rows.filter((row) => row.ablaufdatum && new Date(row.ablaufdatum) <= grenze);
    }
    return {
      anzahl_gesamt: count ?? rows.length,
      angezeigt: rows.length,
      eintraege: sanitizeRows(rows, [
        "id", "name", "wirkstoff", "bestand", "mindestbestand", "ablaufdatum", "lagerort", "kategorie",
      ]),
    };
  },
});

const buildGeraeteTool = () =>
  simpleSearchTool({
    name: "suche_geraete",
    description: "Sucht Geraete (home_geraete): Hersteller, Modell, naechste Wartung, Garantie.",
    table: "home_geraete",
    searchColumns: ["name", "hersteller", "modell"],
    resultKeys: ["id", "name", "hersteller", "modell", "kategorie", "naechste_wartung", "kaufdatum", "garantie_bis", "status"],
  });

const buildBuecherTool = () =>
  simpleSearchTool({
    name: "suche_buecher",
    description: "Sucht Buecher in der Bibliothek (home_buecher), inkl. Verleih-Status.",
    table: "home_buecher",
    searchColumns: ["titel", "autor_anzeige"],
    resultKeys: ["id", "titel", "autor_anzeige", "isbn_13", "status", "verliehen_an_name", "rueckgabe_erwartet_am", "tags"],
  });

const buildWissenTool = () => ({
  name: "suche_wissen",
  description: "Sucht in der Wissensdatenbank (home_wissen): gespeicherte Erkenntnisse aus Dokumenten und Notizen.",
  parameters: {
    type: "object",
    properties: { query: textParam("Suchbegriff"), limit: { type: "number" } },
  },
  execute: async ({ userId, args = {} }) => {
    let query = supabase.from("home_wissen").select("*", { count: "exact" }).eq("user_id", userId);
    const term = String(args.query || "").trim();
    if (term) query = query.or(`titel.ilike.%${term}%,inhalt.ilike.%${term}%,kategorie.ilike.%${term}%`);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 15));
    if (error) return { fehler: error.message };
    return {
      anzahl_gesamt: count ?? (data || []).length,
      angezeigt: (data || []).length,
      eintraege: (data || []).map((row) => ({
        ...pickRowFields(row, ["id", "dokument_id", "titel", "kategorie", "tags"]),
        inhalt: row.inhalt ? `${String(row.inhalt).slice(0, 300)}${String(row.inhalt).length > 300 ? "…" : ""}` : undefined,
      })),
    };
  },
});

const buildDokumenteTool = () => ({
  name: "suche_dokumente",
  description:
    "Sucht Dokumente im Archiv (Rechnungen, Vertraege, Handbuecher, ...): Dateiname, Typ, Tags und Textinhalt.",
  parameters: {
    type: "object",
    properties: {
      query: textParam("Suchbegriff (z.B. Lieferant, Dateiname, Textinhalt)"),
      dokument_typ: textParam("Optionaler Typ-Filter, z.B. Rechnung, Vertrag, Handbuch"),
      limit: { type: "number" },
    },
  },
  execute: async ({ userId, args = {} }) => {
    let query = supabase
      .from("dokumente")
      .select("id, dateiname, dokument_typ, tags, created_at, meta, extrahierter_text", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const typ = String(args.dokument_typ || "").trim();
    if (typ) query = query.ilike("dokument_typ", `%${typ}%`);
    const term = String(args.query || "").trim();
    if (term) query = query.or(`dateiname.ilike.%${term}%,extrahierter_text.ilike.%${term}%`);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 10));
    if (error) return { fehler: error.message };
    return {
      anzahl_gesamt: count ?? (data || []).length,
      angezeigt: (data || []).length,
      eintraege: (data || []).map((row) => ({
        id: row.id,
        dateiname: row.dateiname,
        dokument_typ: row.dokument_typ || undefined,
        tags: Array.isArray(row.tags) && row.tags.length > 0 ? row.tags : undefined,
        erstellt_am: row.created_at,
        betrag: row.meta?.betrag ?? row.meta?.gesamtbetrag ?? undefined,
        lieferant: row.meta?.lieferant ?? row.meta?.lieferant_name ?? undefined,
        text_auszug: row.extrahierter_text
          ? `${String(row.extrahierter_text).slice(0, 300)}${String(row.extrahierter_text).length > 300 ? "…" : ""}`
          : undefined,
      })),
    };
  },
});

const buildRezepteTool = () => ({
  name: "suche_rezepte",
  description:
    "Listet oder sucht Rezepte im Kochbuch. Ohne query: Gesamtanzahl + neueste Rezepte (fuer Zaehl-/Uebersichtsfragen). Mit query: Suche nach Titel oder Zutat.",
  parameters: {
    type: "object",
    properties: {
      query: textParam("Suchbegriff Titel/Zutat (optional — fuer Zaehlfragen weglassen)"),
      nur_favoriten: { type: "boolean", description: "Nur Favoriten listen" },
      limit: { type: "number" },
    },
  },
  execute: async ({ userId, args = {} }) => {
    let query = supabase
      .from("home_rezepte")
      .select("id, titel, gruppe, favorisiert, status, portionen, tags", { count: "exact" })
      .eq("user_id", userId)
      .neq("status", "archiviert")
      .order("updated_at", { ascending: false });
    if (args.nur_favoriten) query = query.eq("favorisiert", true);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 15));
    if (error) return { fehler: error.message };
    const rezepte = sanitizeRows(data, ["id", "titel", "gruppe", "favorisiert", "status", "portionen", "tags"]);
    const anzahlGesamt = count ?? rezepte.length;

    const term = String(args.query || "").trim();
    if (!term) {
      return { anzahl_gesamt: anzahlGesamt, angezeigt: rezepte.length, rezepte };
    }

    const results = await searchRecipesForAssistant({ userId, query: term });
    return {
      anzahl_gesamt: anzahlGesamt,
      treffer_anzahl: results.length,
      treffer: results.map((recipe) => ({
        id: recipe.id,
        titel: recipe.title,
        beschreibung: recipe.description || undefined,
        zutaten: recipe.ingredients || undefined,
      })),
      ...(results.length === 0
        ? { hinweis: `Kein Rezept passt auf "${term}" — insgesamt gibt es aber ${anzahlGesamt} Rezepte im Kochbuch.` }
        : {}),
    };
  },
});

const buildAufgabenTool = () => ({
  name: "suche_aufgaben",
  description:
    "Sucht Aufgaben/Todos/Erinnerungen (todo_aufgaben). bereich: home | umzug. Erinnerungen haben erinnerungs_datum gesetzt.",
  parameters: {
    type: "object",
    properties: {
      bereich: { type: "string", enum: ["home", "umzug", "alle"], description: "App-Bereich (Standard: aktueller Modus)" },
      status: { type: "string", enum: ["offen", "erledigt", "alle"], description: "Standard: offen" },
      query: textParam("Search term in the description (optional)"),
      faellig_vor: textParam("Only tasks due before this date (yyyy-MM-dd, optional)"),
      limit: { type: "number" },
    },
  },
  execute: async ({ userId, appMode, args = {} }) => {
    let query = supabase.from("todo_aufgaben").select("*", { count: "exact" }).eq("user_id", userId);
    const bereich = args.bereich || appMode || "home";
    if (bereich !== "alle") query = query.in("app_modus", [bereich, "beides"]);
    const status = args.status || "offen";
    if (status === "offen") query = query.eq("erledigt", false);
    if (status === "erledigt") query = query.eq("erledigt", true);
    const term = String(args.query || "").trim();
    if (term) query = query.ilike("beschreibung", `%${term}%`);
    if (args.faellig_vor) query = query.lte("faelligkeitsdatum", args.faellig_vor);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 25));
    if (error) return { fehler: error.message };
    return {
      anzahl_gesamt: count ?? (data || []).length,
      angezeigt: (data || []).length,
      aufgaben: sanitizeRows(data, [
        "id", "beschreibung", "kategorie", "prioritaet", "erledigt", "faelligkeitsdatum", "erinnerungs_datum", "app_modus",
      ]),
    };
  },
});

const buildEinkaufslisteTool = () => ({
  name: "suche_einkaufsliste",
  description: "Listet offene Eintraege der Einkaufsliste (home_einkaufliste).",
  parameters: { type: "object", properties: { query: textParam("Suchbegriff (optional)") } },
  execute: async ({ userId, args = {} }) => {
    let query = supabase
      .from("home_einkaufliste")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .eq("erledigt", false);
    const term = String(args.query || "").trim();
    if (term) query = query.ilike("name", `%${term}%`);
    const { data, error, count } = await query.limit(MAX_LIMIT);
    if (error) return { fehler: error.message };
    return {
      anzahl_gesamt: count ?? (data || []).length,
      angezeigt: (data || []).length,
      eintraege: sanitizeRows(data, ["id", "name", "menge", "einheit", "kategorie", "notiz"]),
    };
  },
});

const buildBudgetAbfrageTool = () => ({
  name: "budget_abfrage",
  description:
    "Searches budget entries/expenses/income (budget_posten) with date range, category and text filters.",
  parameters: {
    type: "object",
    properties: {
      von: textParam("Startdatum yyyy-MM-dd (optional)"),
      bis: textParam("Enddatum yyyy-MM-dd (optional)"),
      kategorie: textParam("Kategorie-Filter (optional)"),
      typ: { type: "string", enum: ["ausgabe", "einnahme"], description: "Optional" },
      query: textParam("Search term in the description (optional)"),
      limit: { type: "number" },
    },
  },
  execute: async ({ userId, args = {} }) => {
    let query = supabase
      .from("budget_posten")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("datum", { ascending: false });
    if (args.von) query = query.gte("datum", args.von);
    if (args.bis) query = query.lte("datum", args.bis);
    if (args.kategorie) query = query.ilike("kategorie", `%${args.kategorie}%`);
    if (args.typ) query = query.eq("typ", args.typ);
    const term = String(args.query || "").trim();
    if (term) query = query.ilike("beschreibung", `%${term}%`);
    const { data, error, count } = await query.limit(clampLimit(args.limit, 30));
    if (error) return { fehler: error.message };
    return {
      anzahl_gesamt: count ?? (data || []).length,
      angezeigt: (data || []).length,
      eintraege: sanitizeRows(data, [
        "id", "beschreibung", "betrag", "datum", "kategorie", "typ", "budget_scope", "wiederholen", "intervall",
      ]),
    };
  },
});

const buildBudgetZusammenfassungTool = () => ({
  name: "budget_zusammenfassung",
  description:
    "Aggregates budget entries for a date range: totals by category, total income/expenses and balance.",
  parameters: {
    type: "object",
    properties: {
      von: textParam("Startdatum yyyy-MM-dd"),
      bis: textParam("Enddatum yyyy-MM-dd"),
    },
    required: ["von", "bis"],
  },
  execute: async ({ userId, args = {} }) => {
    const { data, error } = await supabase
      .from("budget_posten")
      .select("betrag, kategorie, typ, datum")
      .eq("user_id", userId)
      .is("archived_at", null)
      .gte("datum", args.von)
      .lte("datum", args.bis)
      .limit(1000);
    if (error) return { fehler: error.message };
    const rows = data || [];
    const kategorien = {};
    let einnahmen = 0;
    let ausgaben = 0;
    rows.forEach((row) => {
      const betrag = Number(row.betrag) || 0;
      const kat = row.kategorie || "Ohne Kategorie";
      if (row.typ === "einnahme") {
        einnahmen += betrag;
      } else {
        ausgaben += betrag;
        kategorien[kat] = (kategorien[kat] || 0) + betrag;
      }
    });
    const rund = (value) => Math.round(value * 100) / 100;
    return {
      zeitraum: { von: args.von, bis: args.bis },
      anzahl_eintraege: rows.length,
      einnahmen_gesamt: rund(einnahmen),
      ausgaben_gesamt: rund(ausgaben),
      saldo: rund(einnahmen - ausgaben),
      ausgaben_je_kategorie: Object.fromEntries(
        Object.entries(kategorien)
          .sort((a, b) => b[1] - a[1])
          .map(([kat, sum]) => [kat, rund(sum)]),
      ),
    };
  },
});

const resolveVehicles = async ({ householdId, fahrzeugName }) => {
  let query = supabase.from("home_fahrzeuge").select("*");
  if (householdId) query = query.eq("household_id", householdId);
  const { data, error } = await query.limit(20);
  if (error) return { error };
  let vehicles = data || [];
  const term = String(fahrzeugName || "").trim().toLowerCase();
  if (term) {
    vehicles = vehicles.filter(
      (v) =>
        String(v.name || "").toLowerCase().includes(term) ||
        String(v.kennzeichen || "").toLowerCase().includes(term),
    );
  }
  return { vehicles };
};

const buildKfzUebersichtTool = () => ({
  name: "kfz_uebersicht",
  description:
    "Fahrzeug-Uebersicht: Stammdaten, aktueller Kilometerstand, Verbrauch (aus Tankvorgaengen), letzte Services.",
  parameters: {
    type: "object",
    properties: { fahrzeug_name: textParam("Fahrzeugname oder Kennzeichen (optional, leer = alle)") },
  },
  execute: async ({ householdId, args = {} }) => {
    const { vehicles, error } = await resolveVehicles({ householdId, fahrzeugName: args.fahrzeug_name });
    if (error) return { fehler: error.message };
    if (vehicles.length === 0) return { anzahl: 0, fahrzeuge: [] };

    const scoped = (table, order, asc = false) => {
      let query = supabase.from(table).select("*");
      if (householdId) query = query.eq("household_id", householdId);
      return query.order(order, { ascending: asc }).limit(200);
    };
    const [fuelRes, mileageRes, servicesRes] = await Promise.all([
      scoped("home_fahrzeug_tankvorgaenge", "datum"),
      scoped("home_fahrzeug_kilometerstaende", "datum"),
      scoped("home_fahrzeug_services", "datum"),
    ]);
    const fuel = fuelRes.data || [];
    const mileage = mileageRes.data || [];
    const services = servicesRes.data || [];

    return {
      anzahl: vehicles.length,
      fahrzeuge: vehicles.map((vehicle) => {
        const history = buildMileageHistory({
          fuelEntries: fuel,
          mileageEntries: mileage,
          services,
          vehicleId: vehicle.id,
        });
        const latestMileage = history.length > 0 ? history[history.length - 1] : null;
        const segments = calculateConsumptionSegments(fuel, vehicle.id);
        const avgConsumption =
          segments.length > 0
            ? Math.round((segments.reduce((sum, s) => sum + (s.consumption || 0), 0) / segments.length) * 100) / 100
            : null;
        const vehicleServices = services.filter((s) => s.fahrzeug_id === vehicle.id).slice(0, 5);
        return {
          ...pickRowFields(vehicle, ["id", "name", "kennzeichen", "marke", "modell", "baujahr", "treibstoff"]),
          aktueller_kilometerstand: latestMileage?.mileage ?? null,
          kilometerstand_datum: latestMileage?.date ?? null,
          durchschnittsverbrauch_l_100km: avgConsumption,
          anzahl_tankvorgaenge: fuel.filter((f) => f.fahrzeug_id === vehicle.id).length,
          letzte_services: vehicleServices.map((s) =>
            pickRowFields(s, ["id", "datum", "typ", "beschreibung", "kilometerstand", "kosten", "werkstatt"]),
          ),
        };
      }),
    };
  },
});

const buildKfzTankhistorieTool = () => ({
  name: "kfz_tankhistorie",
  description: "Refuelling history for one vehicle or all vehicles: date, litres, amount and mileage.",
  parameters: {
    type: "object",
    properties: {
      fahrzeug_name: textParam("Fahrzeugname oder Kennzeichen (optional)"),
      von: textParam("Startdatum yyyy-MM-dd (optional)"),
      bis: textParam("Enddatum yyyy-MM-dd (optional)"),
      limit: { type: "number" },
    },
  },
  execute: async ({ householdId, args = {} }) => {
    const { vehicles, error } = await resolveVehicles({ householdId, fahrzeugName: args.fahrzeug_name });
    if (error) return { fehler: error.message };
    if (args.fahrzeug_name && vehicles.length === 0) {
      return { fehler: `Fahrzeug "${args.fahrzeug_name}" wurde nicht gefunden.` };
    }
    const vehicleIds = vehicles.map((v) => v.id);
    const vehicleNameById = Object.fromEntries(vehicles.map((v) => [v.id, v.name]));

    let query = supabase.from("home_fahrzeug_tankvorgaenge").select("*", { count: "exact" });
    if (householdId) query = query.eq("household_id", householdId);
    if (args.fahrzeug_name && vehicleIds.length > 0) query = query.in("fahrzeug_id", vehicleIds);
    if (args.von) query = query.gte("datum", args.von);
    if (args.bis) query = query.lte("datum", args.bis);
    const { data, error: fuelError, count } = await query
      .order("datum", { ascending: false })
      .limit(clampLimit(args.limit, 25));
    if (fuelError) return { fehler: fuelError.message };
    const rows = data || [];
    const summe = rows.reduce((sum, row) => sum + (Number(row.betrag) || 0), 0);
    const liter = rows.reduce((sum, row) => sum + (Number(row.liter) || 0), 0);
    return {
      anzahl_gesamt: count ?? rows.length,
      angezeigt: rows.length,
      betrag_summe: Math.round(summe * 100) / 100,
      liter_summe: Math.round(liter * 100) / 100,
      tankvorgaenge: rows.map((row) => ({
        ...pickRowFields(row, ["id", "datum", "liter", "betrag", "preis_pro_liter", "kilometerstand", "tankstelle", "voll"]),
        fahrzeug: vehicleNameById[row.fahrzeug_id] || undefined,
      })),
    };
  },
});

const buildKalenderTool = () => ({
  name: "kalender_ereignisse",
  description:
    "Kalender-Termine im Zeitraum: faellige Aufgaben, Geraetewartungen, wiederkehrende Zahlungen, Essensplan bzw. Umzugs-Meilensteine.",
  parameters: {
    type: "object",
    properties: {
      von: textParam("Startdatum yyyy-MM-dd"),
      bis: textParam("Enddatum yyyy-MM-dd"),
    },
    required: ["von", "bis"],
  },
  execute: async ({ userId, appMode, args = {} }) => {
    const events = await loadCalendarEvents({
      userId,
      appMode: appMode || "home",
      von: args.von,
      bis: args.bis,
    });
    return {
      anzahl: events.length,
      ereignisse: events.slice(0, MAX_LIMIT).map((event) => ({
        typ: event.typ,
        titel: event.title,
        datum: event.start instanceof Date ? event.start.toISOString().split("T")[0] : event.start,
        details: event.sub || undefined,
      })),
    };
  },
});

const buildVerlaufTool = () => ({
  name: "verlauf_abfrage",
  description: "Aktivitaetsverlauf des Haushalts (home_verlauf): wer hat wann was geaendert.",
  parameters: {
    type: "object",
    properties: {
      tabelle: textParam("Optionaler Filter auf eine Tabelle, z.B. home_objekte"),
      limit: { type: "number", description: "Standard 25" },
    },
  },
  execute: async ({ userId, householdId, args = {} }) => {
    const query = createVerlaufQuery({
      supabase,
      userId,
      householdId,
      limit: clampLimit(args.limit, 25),
      tabelle: String(args.tabelle || ""),
    });
    if (!query) return { fehler: "Verlauf nicht verfuegbar." };
    const { data, error } = await query;
    if (error) return { fehler: error.message };
    return {
      anzahl: (data || []).length,
      eintraege: sanitizeRows(data, ["tabelle", "datensatz_name", "aktion", "created_at"]),
    };
  },
});

const buildProjekteTool = () =>
  simpleSearchTool({
    name: "projekte_liste",
    description: "Listet Haushalts-Projekte (home_projekte) mit Status.",
    table: "home_projekte",
    searchColumns: ["name", "beschreibung"],
    resultKeys: ["id", "name", "beschreibung", "status", "deadline", "budget"],
  });

const buildHaushaltsaufgabenTool = () =>
  simpleSearchTool({
    name: "suche_haushaltsaufgaben",
    description:
      "Listet wiederkehrende Haushaltsaufgaben (Putzplan, Tabelle haushaltsaufgaben). Normale Home-Aufgaben liegen in suche_aufgaben.",
    table: "haushaltsaufgaben",
    searchColumns: ["name", "beschreibung"],
    resultKeys: ["id", "name", "kategorie", "beschreibung", "intervall_tage", "naechste_faelligkeit", "erledigt", "prioritaet"],
  });

const buildMitgliederTool = () => ({
  name: "haushalt_mitglieder",
  description: "Listet die Mitglieder/Bewohner des Haushalts.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    try {
      const { data, error } = await supabase.rpc("get_bewohner_overview");
      if (error) throw error;
      return {
        anzahl: (data || []).length,
        mitglieder: (data || []).map((b) => ({
          name: b.display_name || b.name,
          rolle: b.rolle || b.role || undefined,
        })),
      };
    } catch (err) {
      return { fehler: err?.message || "Mitglieder konnten nicht geladen werden." };
    }
  },
});

const buildSparzieleTool = () =>
  simpleSearchTool({
    name: "sparziele_liste",
    description: "Listet Sparziele (home_sparziele) mit Ziel- und aktuellem Betrag.",
    table: "home_sparziele",
    searchColumns: ["name"],
    resultKeys: ["id", "name", "zielbetrag", "aktueller_betrag", "zieldatum"],
  });

const buildVertraegeTool = () => ({
  name: "suche_vertraege",
  description: "Sucht Vertraege (vertraege): Anbieter, Laufzeit, Kuendigungsfrist.",
  parameters: {
    type: "object",
    properties: { query: textParam("Suchbegriff (optional)"), limit: { type: "number" } },
  },
  execute: async ({ userId, householdId, args = {} }) => {
    let query = supabase.from("vertraege").select("*");
    query = householdId ? query.eq("household_id", householdId) : query.eq("user_id", userId);
    const term = String(args.query || "").trim();
    if (term) query = query.or(`anbieter.ilike.%${term}%,vertragsname.ilike.%${term}%,vertragstyp.ilike.%${term}%`);
    const { data, error } = await query.limit(clampLimit(args.limit, 20));
    if (error) return { fehler: error.message };
    return {
      anzahl: (data || []).length,
      vertraege: sanitizeRows(data, [
        "id", "vertragsname", "anbieter", "vertragstyp", "beginn", "ende", "kuendigungsfrist", "kosten", "intervall",
      ]),
    };
  },
});

// ── Vorschlags-Tools (Schreibaktionen — NUR Vorschlaege, nie direkte Writes) ──
// Jedes Tool ruft onProposal auf; der Launcher bereitet die Aktion via
// prepareAssistantAction vor, zeigt die Vorschaukarte und wartet auf Confirm.

const proposeTool = ({ name, description, parameters, domain, op = "create", mapArgsToItems, resolveDomain }) => ({
  name,
  description,
  parameters,
  isProposal: true,
  execute: async ({ onProposal, args = {} }) => {
    if (typeof onProposal !== "function") {
      return { fehler: "Vorschlaege sind in diesem Kontext nicht moeglich." };
    }
    const items = mapArgsToItems ? mapArgsToItems(args) : [args];
    if (!Array.isArray(items) || items.length === 0) {
      return { fehler: "Keine Eintraege im Vorschlag enthalten." };
    }
    const resolvedDomain = resolveDomain ? resolveDomain(args) : domain;
    const result = await onProposal({ domain: resolvedDomain, op, items });
    if (result?.fehler) return { fehler: result.fehler };
    return {
      __proposal: true,
      zusammenfassung:
        result?.summary || `Vorschlag erstellt (${items.length} ${items.length === 1 ? "Eintrag" : "Eintraege"}). Der Nutzer muss ihn im Chat bestaetigen.`,
    };
  },
});

const PROPOSAL_DOMAINS = [
  ...Object.keys(ASSISTANT_DOMAIN_CONFIG),
  "inventar_ort",
  "inventar_lagerort",
  "bewohner",
  "wissen",
  "rezept",
  "sparziel",
  "finanzkonto",
];

const itemsArrayParam = (description) => ({
  type: "array",
  description,
  items: { type: "object" },
});

const buildWriteTools = () => [
  proposeTool({
    name: "budget_eintrag_vorschlagen",
    description: "Schlaegt neue Budget-Eintraege (Ausgaben/Einnahmen) vor. Felder je Eintrag: beschreibung, betrag, typ (ausgabe|einnahme), kategorie, datum, wiederholen, intervall.",
    domain: "budget",
    parameters: {
      type: "object",
      properties: { items: itemsArrayParam("Budget-Eintraege") },
      required: ["items"],
    },
    mapArgsToItems: (args) => args.items,
  }),
  proposeTool({
    name: "aufgabe_vorschlagen",
    description: "Proposes new tasks for home or moving workflows. Fields: beschreibung, kategorie, prioritaet (Hoch|Mittel|Niedrig), faelligkeitsdatum, bereich (home|umzug).",
    domain: "aufgaben",
    resolveDomain: (args) => (args.bereich === "umzug" ? "todos" : "aufgaben"),
    parameters: {
      type: "object",
      properties: {
        items: itemsArrayParam("Aufgaben"),
        bereich: { type: "string", enum: ["home", "umzug"], description: "Standard: home" },
      },
      required: ["items"],
    },
    mapArgsToItems: (args) => args.items,
  }),
  proposeTool({
    name: "erinnerung_vorschlagen",
    description: "Schlaegt Erinnerungen vor (Push zum Erinnerungszeitpunkt). Felder: beschreibung, erinnerungs_datum (yyyy-MM-dd, Pflicht — relative Angaben wie 'morgen' vorher umrechnen), faelligkeitsdatum, kategorie.",
    domain: "erinnerung",
    parameters: {
      type: "object",
      properties: { items: itemsArrayParam("Erinnerungen") },
      required: ["items"],
    },
    mapArgsToItems: (args) => args.items,
  }),
  proposeTool({
    name: "einkauf_vorschlagen",
    description: "Schlaegt Artikel fuer die Einkaufsliste vor. Felder: name, menge, einheit.",
    domain: "einkaufliste",
    parameters: {
      type: "object",
      properties: { items: itemsArrayParam("Einkaufsartikel") },
      required: ["items"],
    },
    mapArgsToItems: (args) => (args.items || []).map((item) => ({
      original_text: item.original_text || [item.menge, item.einheit, item.name].filter(Boolean).join(" "),
      name: item.name,
      menge: item.menge ?? 1,
      einheit: item.einheit || null,
    })),
  }),
  proposeTool({
    name: "vorrat_vorschlagen",
    description: "Schlaegt neue Vorraete vor. Felder: name, bestand, einheit, kategorie, mindestmenge.",
    domain: "vorraete",
    parameters: {
      type: "object",
      properties: { items: itemsArrayParam("Vorraete") },
      required: ["items"],
    },
    mapArgsToItems: (args) => args.items,
  }),
  proposeTool({
    name: "kfz_tank_vorschlagen",
    description: "Schlaegt einen neuen Tankvorgang vor. Felder: fahrzeug_name, datum, betrag (Pflicht), liter, preis_pro_liter, kilometerstand, tankstelle, tankstatus (voll|teilweise|unbekannt).",
    domain: "kfz_tank",
    parameters: {
      type: "object",
      properties: {
        fahrzeug_name: textParam("Fahrzeugname (optional wenn nur 1 Fahrzeug)"),
        datum: textParam("yyyy-MM-dd, Standard heute"),
        betrag: { type: "number", description: "Betrag in EUR" },
        liter: { type: "number" },
        preis_pro_liter: { type: "number" },
        kilometerstand: { type: "number" },
        tankstelle: textParam("Tankstelle (optional)"),
        tankstatus: { type: "string", enum: ["voll", "teilweise", "unbekannt"] },
      },
      required: ["betrag"],
    },
  }),
  proposeTool({
    name: "rezept_aenderung_vorschlagen",
    description: "Schlaegt eine Rezept-Aenderung vor: Favorit setzen/entfernen oder Felder aendern. Felder: titel oder rezept_id, mode (favorit|patch), favorit (bool), patch {gruppe, titel, notizen, portionen}.",
    domain: "rezept_update",
    parameters: {
      type: "object",
      properties: {
        titel: textParam("Rezepttitel zur Suche"),
        rezept_id: textParam("Rezept-ID falls bekannt"),
        mode: { type: "string", enum: ["favorit", "patch"] },
        favorit: { type: "boolean" },
        patch: { type: "object", description: "Zu aendernde Felder (gruppe, titel, notizen, portionen)" },
      },
    },
  }),
  proposeTool({
    name: "kfz_service_vorschlagen",
    description: "Schlaegt einen Fahrzeug-Service/Wartungseintrag vor. Felder: fahrzeug_name, typ, datum, kilometerstand, kosten, werkstatt, beschreibung.",
    domain: "kfz_service",
    parameters: {
      type: "object",
      properties: {
        fahrzeug_name: textParam("Fahrzeugname (optional wenn nur 1 Fahrzeug)"),
        typ: textParam("Art des Services, z.B. Oelwechsel"),
        datum: textParam("yyyy-MM-dd"),
        kilometerstand: { type: "number" },
        kosten: { type: "number" },
        werkstatt: textParam("Werkstatt (optional)"),
        beschreibung: textParam("Beschreibung (optional)"),
      },
    },
  }),
  proposeTool({
    name: "aktion_vorschlagen",
    description:
      "Generischer Vorschlag fuer alle anderen Bereiche. op: create (neu), update/delete (bestehende Datensaetze, id aus Suche noetig, Felder in patch). Domains u.a.: inventar, geraete, medikamente, buecher, projekte, rechnung, wartungen, budget_split, budget_settlement, packliste, wissen, rezept, sparziel, kfz_kilometerstand.",
    domain: null,
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string", enum: PROPOSAL_DOMAINS, description: "Ziel-Bereich" },
        op: { type: "string", enum: ["create", "update", "delete"], description: "Standard create" },
        items: itemsArrayParam("Eintraege (bei update/delete mit id, Aenderungen in patch)"),
      },
      required: ["domain", "items"],
    },
    mapArgsToItems: () => null, // wird unten ueberschrieben
  }),
];

// aktion_vorschlagen braucht Zugriff auf args.domain — eigener Executor:
const buildGenericProposeTool = () => {
  const base = buildWriteTools().find((tool) => tool.name === "aktion_vorschlagen");
  return {
    ...base,
    execute: async ({ onProposal, args = {} }) => {
      if (typeof onProposal !== "function") {
        return { fehler: "Vorschlaege sind in diesem Kontext nicht moeglich." };
      }
      const domain = String(args.domain || "");
      if (!PROPOSAL_DOMAINS.includes(domain)) {
        return { fehler: `Unbekannter Bereich: ${domain}` };
      }
      const op = ["create", "update", "delete"].includes(args.op) ? args.op : "create";
      const items = (Array.isArray(args.items) ? args.items : []).map((item) =>
        op === "create" ? item : { ...item, op },
      );
      if (items.length === 0) return { fehler: "Keine Eintraege im Vorschlag enthalten." };
      const result = await onProposal({ domain, op, items });
      if (result?.fehler) return { fehler: result.fehler };
      return {
        __proposal: true,
        zusammenfassung:
          result?.summary || `Vorschlag fuer ${domain} erstellt. Der Nutzer muss ihn im Chat bestaetigen.`,
      };
    },
  };
};

const buildOpenModuleTool = () => ({
  name: "modul_oeffnen",
  description: "Schlaegt vor, einen App-Bereich/Flow zu oeffnen (z.B. Rechnungsscanner, Buchscanner, Budget).",
  parameters: {
    type: "object",
    properties: {
      route_key: { type: "string", enum: Object.keys(ASSISTANT_ROUTE_MAP), description: "Ziel-Flow" },
      query: textParam("Optionaler Suchbegriff/Parameter fuer den Flow"),
    },
    required: ["route_key"],
  },
  isProposal: true,
  execute: async ({ onProposal, args = {} }) => {
    if (typeof onProposal !== "function") {
      return { fehler: "Navigation ist in diesem Kontext nicht moeglich." };
    }
    const result = await onProposal({
      kind: "open_flow",
      routeKey: args.route_key,
      query: args.query || "",
    });
    if (result?.fehler) return { fehler: result.fehler };
    return {
      __proposal: true,
      zusammenfassung: result?.summary || `Ich habe das Oeffnen von ${args.route_key} vorbereitet.`,
    };
  },
});

/**
 * Baut die Vorschlags-Tools (Schreibaktionen).
 */
export const buildAssistantWriteTools = ({ appMode = "home" } = {}) => {
  const tools = buildWriteTools().filter((tool) => tool.name !== "aktion_vorschlagen");
  tools.push(buildGenericProposeTool());
  tools.push(buildOpenModuleTool());
  if (appMode === "umzug") {
    return tools.filter((tool) =>
      ["budget_eintrag_vorschlagen", "aufgabe_vorschlagen", "erinnerung_vorschlagen", "aktion_vorschlagen", "modul_oeffnen"].includes(tool.name),
    );
  }
  return tools;
};

/**
 * Komplettes Toolset (Lesen + Vorschlagen).
 */
export const buildAssistantTools = ({ appMode = "home" } = {}) => [
  ...buildAssistantReadTools({ appMode }),
  ...buildAssistantWriteTools({ appMode }),
];

/**
 * Baut alle Lese-Tools. appMode steuert modus-spezifische Tools.
 */
export const buildAssistantReadTools = ({ appMode = "home" } = {}) => {
  const tools = [
    buildAufgabenTool(),
    buildBudgetAbfrageTool(),
    buildBudgetZusammenfassungTool(),
    buildKalenderTool(),
    buildDokumenteTool(),
    buildWissenTool(),
    buildVerlaufTool(),
    buildMitgliederTool(),
  ];

  if (appMode !== "umzug") {
    tools.push(
      buildInventarTool(),
      buildVorraeteTool(),
      buildMedikamenteTool(),
      buildGeraeteTool(),
      buildBuecherTool(),
      buildRezepteTool(),
      buildEinkaufslisteTool(),
      buildKfzUebersichtTool(),
      buildKfzTankhistorieTool(),
      buildProjekteTool(),
      buildHaushaltsaufgabenTool(),
      buildSparzieleTool(),
      buildVertraegeTool(),
    );
  }

  return tools;
};
