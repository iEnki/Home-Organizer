import { getActiveHouseholdId, supabase } from "../supabaseClient";
import { calcNaechstesDatum } from "./budgetRecurring";
import {
  getBewohnerDisplayName,
  resolveKontoIdFromAiResult,
  resolveSplitPayerFromBudgetSelection,
  selectDefaultKontoForEntry,
} from "./budgetAccounts";
import { buildShares, validateSplitConfig } from "./budgetSplits";
import { applyShoppingBatch, prepareShoppingBatch } from "./einkaufslisteUtils";
import { notifyHouseholdBatchEvent } from "./pushNotifications";
import { buildInvoiceKnowledgeContent } from "./localizedKnowledge";
import {
  buildMedicationPayload,
  findExistingMedication,
  isMedicationAdviceRequest,
  medicationAdviceRefusal,
} from "./heimapotheke";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const isSplitOriginSchemaError = (error) => {
  const message = String(error?.message || error?.details || error?.hint || "");
  return /split_origin|source_template_id|payer_share_input/i.test(message);
};

const normalizeDate = (value) => {
  if (!value) return new Date().toISOString().split("T")[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  return date.toISOString().split("T")[0];
};

const buildManualInvoiceStoragePath = ({ userId, supplier, invoiceDate }) => {
  const filename = `${supplier || "rechnung"} ${invoiceDate || normalizeDate()}.pdf`
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${userId || "unknown"}/assistant-manual/${Date.now()}-${filename}`;
};

const normalizeInvoicePositions = (positions = [], category = null) => {
  const seen = new Set();
  return (Array.isArray(positions) ? positions : [])
    .map((position) => {
      const description = typeof position === "string"
        ? position
        : position?.beschreibung || position?.name || position?.titel || position?.original_text;
      return String(description || "").replace(/\s+/g, " ").trim();
    })
    .filter((description) => {
      if (!description) return false;
      const key = normalizeText(description);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((description, index) => ({
      pos_nr: index + 1,
      beschreibung: description,
      menge: null,
      einheit: null,
      einzelpreis: null,
      gesamtpreis: null,
      ust_satz: null,
      klassifikation: {
        source: "global_assistant",
        ...(category ? { budget_kategorie: category } : {}),
      },
    }));
};

const loadHouseholdId = async (session) => {
  const activeHouseholdId = getActiveHouseholdId();
  if (activeHouseholdId) return activeHouseholdId;

  const userId = session?.user?.id;
  if (!userId) throw new Error("Keine aktive Sitzung. Bitte neu anmelden.");
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const householdId = data?.household_id || null;
  if (!householdId) throw new Error("Kein aktiver Haushalt gefunden.");
  return householdId;
};

const rollbackCreatedRows = async (rows = []) => {
  for (const row of rows.reverse()) {
    try {
      await supabase.from(row.table).delete().eq("id", row.id);
    } catch {}
  }
};

const loadBewohnerOverview = async () => {
  const { data, error } = await supabase.rpc("get_bewohner_overview");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

const loadActiveBudgetAccounts = async () => {
  const { data, error } = await supabase
    .from("home_finanzkonten")
    .select("*")
    .eq("aktiv", true)
    .order("sortierung", { ascending: true });
  if (error) throw error;
  return data || [];
};

const resolveBewohnerByName = (bewohner, searchText) => {
  const normalized = normalizeText(searchText);
  if (!normalized) return null;
  const exact =
    bewohner.find((entry) => normalizeText(getBewohnerDisplayName(entry)) === normalized) ||
    bewohner.find((entry) => normalizeText(entry.name) === normalized);
  if (exact) return exact;
  return (
    bewohner.find((entry) => normalizeText(getBewohnerDisplayName(entry)).startsWith(normalized)) ||
    bewohner.find((entry) => normalizeText(getBewohnerDisplayName(entry)).includes(normalized)) ||
    null
  );
};

const createReceipt = ({
  householdId,
  domain,
  actionKind = "create",
  table,
  id,
  summary,
  requestPayload,
  resultPayload,
}) => ({
  household_id: householdId,
  domain,
  action_kind: actionKind,
  target_table: table,
  target_record_id: id || null,
  summary,
  request_payload: normalizeJsonObject(requestPayload),
  result_payload: normalizeJsonObject(resultPayload),
});

export const applyInventoryAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      name: item.name || "Unbenannt",
      kategorie: item.kategorie || null,
      status: item.status || "in_verwendung",
      menge: item.menge || 1,
      beschreibung: item.beschreibung || null,
      tags: Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : []),
    };
    const { data, error } = await supabase
      .from("home_objekte")
      .insert(payload)
      .select("id, name")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "inventar",
        table: "home_objekte",
        id: data?.id,
        summary: data?.name || payload.name,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "home_objekte",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/inventar",
    tag: `assistant-inventar-${Date.now()}`,
    title: "Neue Inventar-Eintraege",
    body: `${receipts.length} ${receipts.length === 1 ? "Inventar-Eintrag wurde" : "Inventar-Eintraege wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

export const applySupplyAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      name: item.name || "Unbenannt",
      kategorie: item.kategorie || null,
      bestand: item.bestand ?? item.menge ?? 1,
      mindestmenge: item.mindestmenge ?? 1,
      einheit: item.einheit || "Stueck",
      notizen: item.notizen || null,
    };
    const { data, error } = await supabase
      .from("home_vorraete")
      .insert(payload)
      .select("id, name")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "vorraete",
        table: "home_vorraete",
        id: data?.id,
        summary: data?.name || payload.name,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "home_vorraete",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/vorraete",
    tag: `assistant-vorraete-${Date.now()}`,
    title: "Neue Vorraete",
    body: `${receipts.length} ${receipts.length === 1 ? "Vorrat wurde" : "Vorraete wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

const normalizeMedicationAction = (action) => {
  const normalized = normalizeText(action);
  if (/beipackzettel|gebrauchsinformation/.test(normalized)) return "beipackzettel_oeffnen";
  if (/lagerort|wo|liegt/.test(normalized)) return "lagerort_abfragen";
  if (/ablauf|abgelaufen|laeuft|lauft/.test(normalized)) return "ablaufende_anzeigen";
  if (/niedrig|mindestbestand|leer|aufgebraucht/.test(normalized)) return "niedrige_anzeigen";
  if (/bestand.*(aendern|andern)|erhoehe|erhohe|reduzier|plus|minus|\+/.test(normalized)) return "bestand_aendern";
  if (/such|find|liste|welche|anzeigen|zeige|bestand/.test(normalized)) return "suchen";
  return normalized || "hinzufuegen";
};

const loadMedicationRowsForAssistant = async (session) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const { data, error } = await supabase
    .from("home_medikamente")
    .select("id, user_id, household_id, name, wirkstoff, bestand, mindestbestand, ablaufdatum, lagerort, kategorie, beipackzettel_url, beipackzettel_dokument_id")
    .or(householdId ? `user_id.eq.${userId},household_id.eq.${householdId}` : `user_id.eq.${userId}`)
    .order("name");
  if (error) throw error;
  return { householdId, rows: data || [] };
};

const medicationMatchesQuery = (entry, query) => {
  const needle = normalizeText(query);
  if (!needle) return true;
  return normalizeText([entry.name, entry.wirkstoff, entry.darreichungsform, entry.kategorie, entry.lagerort].filter(Boolean).join(" ")).includes(needle);
};

const formatMedicationLine = (entry) => {
  const parts = [`${entry.name}${entry.wirkstoff ? ` (${entry.wirkstoff})` : ""}`];
  parts.push(`Bestand ${Number(entry.bestand ?? 0).toLocaleString("de-DE")}`);
  if (entry.lagerort) parts.push(`Lagerort: ${entry.lagerort}`);
  if (entry.ablaufdatum) parts.push(`Ablauf: ${entry.ablaufdatum}`);
  if (Number(entry.bestand ?? 0) <= Number(entry.mindestbestand ?? 0)) parts.push("niedrig");
  if (entry.beipackzettel_dokument_id || entry.beipackzettel_url) parts.push("Beipackzettel vorhanden");
  return `- ${parts.join(", ")}`;
};

export const prepareMedicationAssistantAction = async ({ session, items = [] }) => {
  const item = items[0] || {};
  const action = normalizeMedicationAction(item.aktion || item.action);
  const name = item.name || item.medikament || item.query || "";

  if (isMedicationAdviceRequest(`${action} ${name} ${item.notizen || ""}`)) {
    return {
      kind: "assistant_response",
      domain: "medikamente",
      text: medicationAdviceRefusal,
    };
  }

  if (!["suchen", "lagerort_abfragen", "ablaufende_anzeigen", "niedrige_anzeigen", "beipackzettel_oeffnen"].includes(action)) {
    return null;
  }

  const { rows } = await loadMedicationRowsForAssistant(session);
  const matches = rows.filter((entry) => medicationMatchesQuery(entry, name));

  if (action === "suchen") {
    const list = (name ? matches : rows).slice(0, 12);
    return {
      kind: "assistant_response",
      domain: "medikamente",
      text: list.length
        ? `Aktuell in der Heimapotheke:\n${list.map(formatMedicationLine).join("\n")}`
        : (name ? `Ich finde kein Medikament zu "${name}" in der Heimapotheke.` : "In der Heimapotheke sind noch keine Medikamente gespeichert."),
    };
  }

  if (action === "lagerort_abfragen") {
    const match = matches[0];
    return {
      kind: "assistant_response",
      domain: "medikamente",
      text: match
        ? `${match.name} liegt ${match.lagerort ? `hier: ${match.lagerort}` : "ohne gespeicherten Lagerort"}; Bestand: ${Number(match.bestand ?? 0).toLocaleString("de-DE")}.`
        : `Ich finde kein Medikament zu "${name}" in der Heimapotheke.`,
    };
  }

  if (action === "ablaufende_anzeigen") {
    const today = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 60);
    const expiring = rows
      .filter((entry) => entry.ablaufdatum && new Date(entry.ablaufdatum) <= soon)
      .sort((a, b) => String(a.ablaufdatum).localeCompare(String(b.ablaufdatum)));
    return {
      kind: "assistant_response",
      domain: "medikamente",
      text: expiring.length
        ? `Diese Medikamente sind abgelaufen oder laufen bald ab:\n${expiring.slice(0, 12).map((entry) => {
            const expired = new Date(entry.ablaufdatum) < today;
            return `- ${entry.name}: ${entry.ablaufdatum}${expired ? " (abgelaufen)" : ""}`;
          }).join("\n")}`
        : "Es sind keine abgelaufenen oder bald ablaufenden Medikamente mit Ablaufdatum gespeichert.",
    };
  }

  if (action === "niedrige_anzeigen") {
    const low = rows.filter((entry) => Number(entry.bestand ?? 0) <= Number(entry.mindestbestand ?? 0));
    return {
      kind: "assistant_response",
      domain: "medikamente",
      text: low.length
        ? `Diese Medikamente haben niedrigen Bestand:\n${low.slice(0, 12).map(formatMedicationLine).join("\n")}`
        : "Es sind keine niedrigen Medikamentenbestände gespeichert.",
    };
  }

  if (action === "beipackzettel_oeffnen") {
    const match = matches[0];
    if (!match) {
      return {
        kind: "assistant_response",
        domain: "medikamente",
        text: `Ich finde kein Medikament zu "${name}" in der Heimapotheke.`,
      };
    }
    if (!match.beipackzettel_dokument_id && !match.beipackzettel_url) {
      return {
        kind: "assistant_response",
        domain: "medikamente",
        text: `Für ${match.name} ist kein Beipackzettel gespeichert.`,
      };
    }
    const flow = {
      type: "open_flow",
      route: "/home/heimapotheke",
      flow_key: "home_heimapotheke",
      params: { query: match.name },
      ui_state: {
        prefillQuery: match.name,
        focusMedicationId: match.id,
        focusMedicationName: match.name,
        openLeaflet: true,
      },
    };
    return {
      kind: "open_flow",
      domain: "medikamente",
      text: `Ich habe ${match.name} gefunden und kann den gespeicherten Beipackzettel öffnen.`,
      flow,
    };
  }

  return null;
};

export const applyMedicationAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  const { data: existingRows, error: existingError } = await supabase
    .from("home_medikamente")
    .select("*")
    .eq("household_id", householdId);
  if (existingError) throw existingError;
  const existing = existingRows || [];

  for (const item of items) {
    const action = item.aktion || "hinzufuegen";
    const name = item.name || item.medikament || item.query;
    if (isMedicationAdviceRequest(`${action} ${name || ""} ${item.notizen || ""}`)) {
      throw new Error(medicationAdviceRefusal);
    }

    if (["suchen", "lagerort_abfragen", "beipackzettel_oeffnen", "ablaufende_anzeigen", "niedrige_anzeigen"].includes(action)) {
      receipts.push(
        createReceipt({
          householdId,
          domain: "medikamente",
          actionKind: "search",
          table: "home_medikamente",
          id: null,
          summary: name || "Heimapotheke",
          requestPayload: item,
          resultPayload: { route: "/home/heimapotheke", query: name || "" },
        }),
      );
      continue;
    }

    if (!name) {
      throw new Error("Bitte gib den Namen des Medikaments an.");
    }

    const match = findExistingMedication(existing, item);
    if (action === "bestand_aendern" && match) {
      const delta = Number(item.bestand_delta ?? item.bestand ?? 0);
      const nextBestand = Math.max(0, Number(match.bestand || 0) + delta);
      const { data, error } = await supabase
        .from("home_medikamente")
        .update({
          bestand: nextBestand,
          lagerort: item.lagerort || match.lagerort || null,
          notizen: item.notizen || match.notizen || null,
        })
        .eq("id", match.id)
        .select("id, name, bestand")
        .single();
      if (error) throw error;
      receipts.push(
        createReceipt({
          householdId,
          domain: "medikamente",
          actionKind: "update",
          table: "home_medikamente",
          id: data?.id,
          summary: `${data?.name || name}: Bestand ${data?.bestand}`,
          requestPayload: item,
          resultPayload: data,
        }),
      );
      continue;
    }

    if (match) {
      const nextBestand = Number(match.bestand || 0) + Number(item.bestand || 1);
      const { data, error } = await supabase
        .from("home_medikamente")
        .update({
          ...buildMedicationPayload({ item: { ...match, ...item, bestand: nextBestand }, userId, householdId }),
          bestand: nextBestand,
        })
        .eq("id", match.id)
        .select("id, name, bestand")
        .single();
      if (error) throw error;
      receipts.push(
        createReceipt({
          householdId,
          domain: "medikamente",
          actionKind: "update",
          table: "home_medikamente",
          id: data?.id,
          summary: `${data?.name || name}: Bestand ${data?.bestand}`,
          requestPayload: item,
          resultPayload: data,
        }),
      );
    } else {
      const payload = buildMedicationPayload({ item: { ...item, name }, userId, householdId });
      const { data, error } = await supabase
        .from("home_medikamente")
        .insert(payload)
        .select("id, name")
        .single();
      if (error) throw error;
      receipts.push(
        createReceipt({
          householdId,
          domain: "medikamente",
          table: "home_medikamente",
          id: data?.id,
          summary: data?.name || payload.name,
          requestPayload: item,
          resultPayload: payload,
        }),
      );
    }
  }

  if (receipts.some((receipt) => receipt.action_kind !== "search")) {
    await notifyHouseholdBatchEvent({
      userId,
      table: "home_medikamente",
      action: "erstellt",
      eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
      url: "/home/heimapotheke",
      tag: `assistant-medikamente-${Date.now()}`,
      title: "Heimapotheke aktualisiert",
      body: `${receipts.length} Aktionen wurden verarbeitet.`,
      pushPolicy: "never",
    });
  }

  return { count: receipts.length, receipts };
};

export const applyDeviceAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      name: item.name || "Unbenannt",
      hersteller: item.hersteller || null,
      modell: item.modell || null,
      seriennummer: item.seriennummer || null,
      kaufdatum: item.kaufdatum ? normalizeDate(item.kaufdatum) : null,
      kaufpreis: item.kaufpreis != null ? Number(item.kaufpreis) : null,
      garantie_bis: item.garantie_bis ? normalizeDate(item.garantie_bis) : null,
      wartungsintervall_monate: item.wartungsintervall_monate || null,
      kategorie: item.kategorie || null,
      notizen: item.notizen || null,
      ort_id: item.ort_id || null,
      lagerort_id: item.lagerort_id || null,
      status: item.status || "in_verwendung",
      tags: Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : []),
      bewohner_id: item.bewohner_id || null,
      zugriffshaeufigkeit: item.zugriffshaeufigkeit || "selten",
      menge: Math.max(parseInt(item.menge, 10) || 1, 1),
    };
    const { data, error } = await supabase
      .from("home_geraete")
      .insert(payload)
      .select("id, name")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "geraete",
        table: "home_geraete",
        id: data?.id,
        summary: data?.name || payload.name,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "home_geraete",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/geraete",
    tag: `assistant-geraete-${Date.now()}`,
    title: "Neue Geraete",
    body: `${receipts.length} ${receipts.length === 1 ? "Geraet wurde" : "Geraete wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

export const applyProjectAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      name: item.name || "Neues Projekt",
      typ: item.typ || "Sonstiges",
      beschreibung: item.beschreibung || null,
      budget: item.budget || null,
      startdatum: item.startdatum || null,
      zieldatum: item.zieldatum || null,
      status: item.status || "geplant",
    };
    const { data, error } = await supabase
      .from("home_projekte")
      .insert(payload)
      .select("id, name")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "projekte",
        table: "home_projekte",
        id: data?.id,
        summary: data?.name || payload.name,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "home_projekte",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/projekte",
    tag: `assistant-projekte-${Date.now()}`,
    title: "Neue Projekte",
    body: `${receipts.length} ${receipts.length === 1 ? "Projekt wurde" : "Projekte wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

export const applyHomeTaskAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      beschreibung: item.beschreibung || "Aufgabe",
      kategorie: item.kategorie || "Sonstiges",
      prioritaet: item.prioritaet || "Mittel",
      faelligkeitsdatum: item.faelligkeitsdatum || null,
      wiederholung_typ: item.wiederholung_typ || "Keine",
      app_modus: "home",
      erledigt: false,
    };
    const { data, error } = await supabase
      .from("todo_aufgaben")
      .insert(payload)
      .select("id, beschreibung")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "aufgaben",
        table: "todo_aufgaben",
        id: data?.id,
        summary: data?.beschreibung || payload.beschreibung,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "todo_aufgaben",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/aufgaben",
    tag: `assistant-aufgaben-${Date.now()}`,
    title: "Neue Aufgaben",
    body: `${receipts.length} ${receipts.length === 1 ? "Aufgabe wurde" : "Aufgaben wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

export const applyUmzugTodoAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const payload = {
      user_id: userId,
      beschreibung: item.beschreibung || "Aufgabe",
      kategorie: item.kategorie || null,
      prioritaet: item.prioritaet || null,
      faelligkeitsdatum: item.faelligkeitsdatum || null,
      wiederholung_typ: null,
      erledigt: false,
      app_modus: "umzug",
    };
    const { data, error } = await supabase
      .from("todo_aufgaben")
      .insert(payload)
      .select("id, beschreibung")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "todos",
        table: "todo_aufgaben",
        id: data?.id,
        summary: data?.beschreibung || payload.beschreibung,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  return { count: receipts.length, receipts };
};

export const applyBudgetAiItems = async ({
  session,
  items = [],
  budgetContext = {},
}) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const bewohner = budgetContext.bewohner || (await loadBewohnerOverview());
  const aktiveFinanzkonten =
    budgetContext.aktiveFinanzkonten || (await loadActiveBudgetAccounts());
  const kontoFilter = budgetContext.kontoFilter || "";
  const appModus = budgetContext.appModus || "home";
  const receipts = [];

  for (const item of items) {
    const resolvedBewohner = resolveBewohnerByName(bewohner, item.bewohner_name);
    const resolvedScope = item.budget_scope === "privat" ? "privat" : "haushalt";
    const defaultKonto = selectDefaultKontoForEntry({
      budgetScope: resolvedScope,
      bewohnerId: resolvedBewohner?.id || null,
      konten: aktiveFinanzkonten,
    });
    const kontoAusFilter = kontoFilter
      ? aktiveFinanzkonten.find((konto) => konto.id === kontoFilter) || null
      : null;
    const resolvedKontoId =
      (item.typ || "ausgabe") === "einnahme"
        ? null
        : resolveKontoIdFromAiResult(item, aktiveFinanzkonten, bewohner) ||
          kontoAusFilter?.id ||
          defaultKonto?.id ||
          null;
    const datum = normalizeDate(item.datum);
    const payload = {
      user_id: userId,
      beschreibung: item.beschreibung || "Zahlung",
      betrag: item.betrag || 0,
      kategorie: item.kategorie || null,
      typ: item.typ || "ausgabe",
      datum,
      app_modus: appModus,
      budget_scope: resolvedScope,
      bewohner_id: resolvedBewohner?.id || null,
      zahlungskonto_id: resolvedKontoId,
      wiederholen: Boolean(item.wiederholen),
      intervall: item.intervall || null,
      naechstes_datum:
        item.wiederholen && item.intervall ? calcNaechstesDatum(datum, item.intervall) : null,
    };
    const { data, error } = await supabase
      .from("budget_posten")
      .insert(payload)
      .select("id, beschreibung")
      .single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain: "budget",
        table: "budget_posten",
        id: data?.id,
        summary: data?.beschreibung || payload.beschreibung,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "budget_posten",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/budget",
    tag: `assistant-budget-${Date.now()}`,
    title: "Neue Budget-Eintraege",
    body: `${receipts.length} ${receipts.length === 1 ? "Budget-Eintrag wurde" : "Budget-Eintraege wurden"} hinzugefuegt.`,
  });

  return { count: receipts.length, receipts };
};

export const prepareShoppingAssistantAction = async ({
  session,
  items = [],
  source = "ki",
  existingEntries = null,
}) => {
  const userId = session?.user?.id;
  const rawItems = items.map((item) => ({
    original_text: item.original_text || item.name || "",
    name: item.name || item.normalized_name || item.original_text || "",
    normalized_name: item.normalized_name || item.name || item.original_text || "",
    menge: item.menge ?? 1,
    einheit: item.einheit || "Stueck",
    hauptkategorie: item.hauptkategorie || item.kategorie || "Sonstiges",
    unterkategorie: item.unterkategorie || null,
    confidence: item.confidence ?? null,
  }));

  const prepared = await prepareShoppingBatch({
    rawItems,
    userId,
    source,
    existingEntries,
  });

  const decisions = {};
  prepared.duplicates.forEach((duplicate) => {
    decisions[duplicate.client_id] = {
      action: "merge",
      existingEntry: duplicate.existing_entry,
    };
  });

  return {
    kind: "shopping",
    prepared,
    decisions,
    previewItems: prepared.drafts,
  };
};

export const applyPreparedShoppingAssistantAction = async ({
  session,
  preparedAction,
}) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const result = await applyShoppingBatch({
    userId,
    drafts: preparedAction?.prepared?.drafts || [],
    decisions: preparedAction?.decisions || {},
  });

  const receipts = (preparedAction?.prepared?.drafts || []).map((draft) =>
    createReceipt({
      householdId,
      domain: "einkaufliste",
      table: "home_einkaufliste",
      id: null,
      summary: draft.name || draft.original_text || "Einkaufsartikel",
      actionKind: "upsert",
      requestPayload: draft,
      resultPayload: result,
    }),
  );

  const neueEinkaufsEintraege = (preparedAction?.prepared?.drafts || []).filter(
    (draft) => preparedAction?.decisions?.[draft.client_id]?.action !== "merge",
  );

  await notifyHouseholdBatchEvent({
    userId,
    table: "home_einkaufliste",
    action: "erstellt",
    eintraege: neueEinkaufsEintraege.map((draft) => ({
      datensatz_name: draft.name || draft.original_text || "Einkaufsartikel",
    })),
    url: "/home/einkaufsliste",
    tag: `assistant-shopping-${Date.now()}`,
    title: "Neue Einkaufsartikel",
    body: `${result.inserted} ${result.inserted === 1 ? "Einkaufsartikel wurde" : "Einkaufsartikel wurden"} hinzugefuegt.`,
    push: result.inserted > 0,
    history: neueEinkaufsEintraege.length > 0,
  });

  return { count: result.inserted + result.merged, receipts, result };
};

export const applyPacklisteAiActions = async ({
  session,
  items = [],
  kisten = [],
  suggestCategory = () => "Sonstiges",
}) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const kistenIdCache = {};
  const receipts = [];

  for (const item of items) {
    if (item.aktion === "gegenstand_hinzufuegen") {
      if (!item.gegenstand || !item.kiste) continue;
      const kisteName = item.kiste.trim();
      let kisteId = kistenIdCache[kisteName];

      if (!kisteId) {
        const localMatch = kisten.find(
          (entry) => normalizeText(entry.name) === normalizeText(kisteName),
        );
        if (localMatch?.id) {
          kisteId = localMatch.id;
        } else {
          const { data: existingKiste, error: findError } = await supabase
            .from("pack_kisten")
            .select("id")
            .eq("name", kisteName)
            .eq("user_id", userId)
            .maybeSingle();
          if (findError) throw findError;
          if (existingKiste?.id) {
            kisteId = existingKiste.id;
          } else {
            const { data: neueKiste, error: createError } = await supabase
              .from("pack_kisten")
              .insert({
                user_id: userId,
                name: kisteName,
                qr_code_wert: `KISTE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              })
              .select("id, name")
              .single();
            if (createError) throw createError;
            kisteId = neueKiste.id;
            receipts.push(
              createReceipt({
                householdId,
                domain: "packliste",
                table: "pack_kisten",
                id: neueKiste.id,
                summary: neueKiste.name,
                requestPayload: item,
                resultPayload: neueKiste,
              }),
            );
          }
        }
        kistenIdCache[kisteName] = kisteId;
      }

      const gegenstandPayload = {
        user_id: userId,
        beschreibung: item.gegenstand.trim(),
        menge:
          item.menge && Number.isInteger(item.menge) && item.menge > 0 ? item.menge : 1,
        kiste_id: kisteId,
        kategorie: item.kategorie || suggestCategory(item.gegenstand.trim()) || "Sonstiges",
      };
      const { data, error } = await supabase
        .from("pack_gegenstaende")
        .insert(gegenstandPayload)
        .select("id, beschreibung")
        .single();
      if (error) throw error;
      receipts.push(
        createReceipt({
          householdId,
          domain: "packliste",
          table: "pack_gegenstaende",
          id: data?.id,
          summary: data?.beschreibung || gegenstandPayload.beschreibung,
          requestPayload: item,
          resultPayload: gegenstandPayload,
        }),
      );
    } else if (item.aktion === "raum_zuweisen") {
      if (!item.kiste_name || !item.raum) continue;
      const kisteName = item.kiste_name.trim();
      const existingKiste =
        kisten.find((entry) => normalizeText(entry.name) === normalizeText(kisteName)) ||
        (
          (
            await supabase
              .from("pack_kisten")
              .select("id, name")
              .eq("name", kisteName)
              .eq("user_id", userId)
              .maybeSingle()
          ).data || null
        );
      if (!existingKiste?.id) continue;
      const { error } = await supabase
        .from("pack_kisten")
        .update({ raum_neu: item.raum.trim() })
        .match({ id: existingKiste.id, user_id: userId });
      if (error) throw error;
      receipts.push(
        createReceipt({
          householdId,
          domain: "packliste",
          table: "pack_kisten",
          id: existingKiste.id,
          summary: `${existingKiste.name} -> ${item.raum.trim()}`,
          actionKind: "update",
          requestPayload: item,
          resultPayload: { id: existingKiste.id, raum_neu: item.raum.trim() },
        }),
      );
    }
  }

  return { count: receipts.length, receipts };
};

export const applyWartungAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const { data: geraete } = await supabase
    .from("home_geraete")
    .select("id, name")
    .eq("user_id", userId);
  const receipts = [];

  for (const item of items) {
    const explicitGeraetId = item.geraet_id || item.device_id || null;
    const geraetName = normalizeText(item.geraet_name);
    const geraet =
      (explicitGeraetId && (geraete || []).find((g) => g.id === explicitGeraetId)) ||
      (geraete || []).find((g) => normalizeText(g.name) === geraetName) ||
      (geraete || []).find((g) => normalizeText(g.name).includes(geraetName)) ||
      null;

    if (!geraet?.id) {
      throw new Error("Bitte waehle ein vorhandenes Geraet aus. Wartungen koennen nicht ohne Geraet gespeichert werden.");
    }

    const payload = {
      user_id: userId,
      geraet_id: geraet.id,
      datum: normalizeDate(item.datum),
      typ: item.typ || "Wartung",
      beschreibung: item.beschreibung || null,
      kosten: item.kosten != null ? Number(item.kosten) : null,
      durchgefuehrt_von: item.durchgefuehrt_von || null,
      naechste_faelligkeit: item.naechste_faelligkeit
        ? normalizeDate(item.naechste_faelligkeit)
        : null,
      notizen: item.notizen || null,
    };
    const { data, error } = await supabase
      .from("home_wartungen")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;

    receipts.push(
      createReceipt({
        householdId,
        domain: "wartungen",
        table: "home_wartungen",
        id: data?.id,
        summary: `${geraet.name || item.geraet_name || "Geraet"}: ${payload.typ}`,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  return { count: receipts.length, receipts };
};

export const applyManualInvoiceAssistantItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const createdRows = [];
    const amount = Number(item.brutto ?? item.betrag ?? item.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Der Rechnungsbetrag muss groesser als 0 sein.");
    }
    const invoiceDate = normalizeDate(item.rechnungsdatum || item.datum || item.date);
    const supplier = item.lieferant_name || item.firma || item.haendler || "Unbekannte Firma";
    const description = item.beschreibung || item.zweck || "Manuelle Rechnung";
    const category = item.kategorie || "Sonstiges";
    const invoicePositions = normalizeInvoicePositions(item.positionen, category);
    const storagePath = buildManualInvoiceStoragePath({ userId, supplier, invoiceDate });

    try {
      const documentPayload = {
        user_id: userId,
        household_id: householdId,
        app_modus: "home",
        dateiname: `${supplier} ${invoiceDate}.pdf`.replace(/[\\/:*?"<>|]/g, "-"),
        beschreibung: description,
        storage_pfad: storagePath,
        datei_typ: null,
        kategorie: "Rechnung",
        dokument_typ: "rechnung",
      };
      const { data: documentData, error: documentError } = await supabase
        .from("dokumente")
        .insert(documentPayload)
        .select("id")
        .single();
      if (documentError) throw documentError;
      createdRows.push({ table: "dokumente", id: documentData.id });

      const invoicePayload = {
        household_id: householdId,
        dokument_id: documentData.id,
        lieferant_name: supplier,
        rechnungsnummer: item.rechnungsnummer || null,
        rechnungsdatum: invoiceDate,
        waehrung: item.waehrung || "EUR",
        brutto: Math.abs(amount),
        raw_text: item.raw_text || null,
        confidence: item.confidence ?? null,
        extraktion: {
          source: "global_assistant",
          description,
          category,
        },
      };
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("rechnungen")
        .insert(invoicePayload)
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;
      createdRows.push({ table: "rechnungen", id: invoiceData.id });

      let insertedPositions = [];
      if (invoicePositions.length > 0) {
        const { data: positionData, error: positionError } = await supabase
          .from("rechnungs_positionen")
          .insert(
            invoicePositions.map((position) => ({
              ...position,
              household_id: householdId,
              rechnung_id: invoiceData.id,
            })),
          )
          .select("id, pos_nr, beschreibung, menge, einheit, einzelpreis, gesamtpreis, ust_satz, klassifikation");
        if (positionError) throw positionError;
        insertedPositions = positionData || [];
        insertedPositions.forEach((position) => {
          if (position?.id) createdRows.push({ table: "rechnungs_positionen", id: position.id });
        });
      }

      const budgetPayload = {
        user_id: userId,
        household_id: householdId,
        beschreibung: description,
        betrag: Math.abs(amount),
        datum: invoiceDate,
        kategorie: category,
        app_modus: "home",
        typ: "ausgabe",
        budget_scope: item.budget_scope === "privat" ? "privat" : "haushalt",
        zahlungskonto_id: item.zahlungskonto_id || null,
        bewohner_id: item.bewohner_id || null,
      };
      const { data: budgetData, error: budgetError } = await supabase
        .from("budget_posten")
        .insert(budgetPayload)
        .select("id, beschreibung")
        .single();
      if (budgetError) throw budgetError;
      createdRows.push({ table: "budget_posten", id: budgetData.id });

      const invoiceSummary = {
        kind: "invoice",
        documentClass: "rechnung",
        documentType: "rechnung",
        merchant: supplier,
        date: invoiceDate,
        amount: Math.abs(amount),
        currency: item.waehrung || "EUR",
        headline: description,
        items: insertedPositions.map((position) => ({
          name: position.beschreibung,
          beschreibung: position.beschreibung,
          menge: position.menge,
          einheit: position.einheit,
          einzelpreis: position.einzelpreis,
          gesamtpreis: position.gesamtpreis,
          klassifikation: position.klassifikation || {},
        })),
      };
      const knowledgeTitle = `Rechnung - ${supplier} - ${invoiceDate}`;
      const { data: knowledgeData, error: knowledgeError } = await supabase
        .from("home_wissen")
        .insert({
          user_id: userId,
          household_id: householdId,
          titel: knowledgeTitle,
          inhalt: buildInvoiceKnowledgeContent(invoiceSummary, "de"),
          kategorie: "Rechnungen & Belege",
          tags: ["rechnung", supplier.toLowerCase().split(" ")[0]].filter(Boolean),
          dokument_id: documentData.id,
          rechnung_id: invoiceData.id,
          herkunft: "auto_full",
          summary: invoiceSummary,
          localized_content: {
            de: {
              title: knowledgeTitle,
              content: buildInvoiceKnowledgeContent(invoiceSummary, "de"),
              headline: description,
            },
            "en-GB": {
              title: knowledgeTitle,
              content: buildInvoiceKnowledgeContent(invoiceSummary, "en-GB"),
              headline: description,
            },
          },
          source_locale: "de",
        })
        .select("id")
        .single();
      if (knowledgeError) throw knowledgeError;
      createdRows.push({ table: "home_wissen", id: knowledgeData.id });

      const { error: linkError } = await supabase.from("dokument_links").insert([
        {
          household_id: householdId,
          dokument_id: documentData.id,
          entity_type: "rechnung",
          entity_id: invoiceData.id,
          role: "original",
        },
        {
          household_id: householdId,
          dokument_id: documentData.id,
          entity_type: "budget_posten",
          entity_id: budgetData.id,
          role: "expense",
        },
        {
          household_id: householdId,
          dokument_id: documentData.id,
          entity_type: "home_wissen",
          entity_id: knowledgeData.id,
          role: "knowledge",
        },
      ]);
      if (linkError) throw linkError;

      receipts.push(
        createReceipt({
          householdId,
          domain: "rechnung",
          table: "rechnungen",
          id: invoiceData.id,
          summary: `${supplier}: ${Math.abs(amount)} ${item.waehrung || "EUR"}`,
          requestPayload: item,
          resultPayload: {
            dokument_id: documentData.id,
            rechnung_id: invoiceData.id,
            budget_posten_id: budgetData.id,
            wissen_id: knowledgeData.id,
            rechnungs_positionen: insertedPositions.map((position) => position.id).filter(Boolean),
          },
        }),
      );
    } catch (error) {
      await rollbackCreatedRows(createdRows);
      throw error;
    }
  }

  await notifyHouseholdBatchEvent({
    userId,
    table: "rechnungen",
    action: "erstellt",
    eintraege: receipts.map((receipt) => ({ datensatz_name: receipt.summary })),
    url: "/home/budget",
    tag: `assistant-invoice-${Date.now()}`,
    title: "Neue Rechnung gespeichert",
    body: `${receipts.length} ${receipts.length === 1 ? "Rechnung wurde" : "Rechnungen wurden"} gespeichert.`,
  });

  const budgetReceipts = receipts.filter((receipt) => receipt?.resultPayload?.budget_posten_id);
  if (budgetReceipts.length > 0) {
    await notifyHouseholdBatchEvent({
      userId,
      table: "budget_posten",
      action: "erstellt",
      eintraege: budgetReceipts.map((receipt) => ({
        datensatz_name: receipt.summary,
        options: { householdId: receipt.householdId },
      })),
      url: "/home/budget",
      tag: `assistant-invoice-budget-history-${Date.now()}`,
      history: true,
      push: false,
    });
  }

  return { count: receipts.length, receipts };
};

export const applySimpleHomeAssistantItems = async ({ session, domain, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  const insertOne = async ({ table, payload, select = "id, name", summaryField = "name" }) => {
    const { data, error } = await supabase.from(table).insert(payload).select(select).single();
    if (error) throw error;
    receipts.push(
      createReceipt({
        householdId,
        domain,
        table,
        id: data?.id,
        summary: data?.[summaryField] || payload[summaryField] || payload.name || payload.titel || payload.beschreibung,
        requestPayload: payload,
        resultPayload: data || payload,
      }),
    );
  };

  for (const item of items) {
    if (domain === "inventar_ort") {
      await insertOne({
        table: "home_orte",
        payload: {
          user_id: userId,
          name: item.name || "Neuer Standort",
          typ: item.typ || "Wohnung",
          adresse: item.adresse || null,
          notizen: item.notizen || null,
        },
      });
    } else if (domain === "inventar_lagerort") {
      let ortId = item.ort_id || null;
      if (!ortId) {
        const { data: firstOrt } = await supabase
          .from("home_orte")
          .select("id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        ortId = firstOrt?.id || null;
      }
      if (!ortId) throw new Error("Bitte lege zuerst einen Standort an oder waehle einen Standort fuer den Lagerort.");
      await insertOne({
        table: "home_lagerorte",
        payload: {
          user_id: userId,
          ort_id: ortId,
          name: item.name || "Neuer Lagerort",
          typ: item.typ || "Regal",
          beschreibung: item.beschreibung || null,
          qr_code_wert: item.qr_code_wert || null,
        },
      });
    } else if (domain === "bewohner") {
      await insertOne({
        table: "home_bewohner",
        payload: {
          user_id: userId,
          name: item.name || "Bewohner",
          farbe: item.farbe || "#10B981",
          emoji: item.emoji || ":)",
        },
      });
    } else if (domain === "wissen") {
      await insertOne({
        table: "home_wissen",
        payload: {
          user_id: userId,
          household_id: householdId,
          titel: item.titel || "Wissenseintrag",
          inhalt: item.inhalt || item.beschreibung || "",
          kategorie: item.kategorie || "Allgemein",
          tags: Array.isArray(item.tags) ? item.tags : [],
          herkunft: "manuell",
          summary: { manual_override: true },
        },
        select: "id, titel",
        summaryField: "titel",
      });
    } else if (domain === "rezept") {
      await insertOne({
        table: "home_rezepte",
        payload: {
          user_id: userId,
          household_id: householdId,
          titel: item.titel || "Neues Rezept",
          beschreibung: item.beschreibung || null,
          portionen: item.portionen || 4,
          tags: Array.isArray(item.tags) ? item.tags : [],
          anleitung: Array.isArray(item.anleitung) ? item.anleitung : [],
          import_typ: "manuell",
          analyse_modus: "web",
          status: "gespeichert",
          sprache: item.sprache || "de",
          ziel_locale: item.ziel_locale || "de",
        },
        select: "id, titel",
        summaryField: "titel",
      });
    } else if (domain === "sparziel") {
      await insertOne({
        table: "home_sparziele",
        payload: {
          user_id: userId,
          name: item.name || "Sparziel",
          ziel_betrag: Number(item.ziel_betrag || item.betrag || 0),
          aktueller_betrag: Number(item.aktueller_betrag || 0),
          zieldatum: item.zieldatum || null,
          farbe: item.farbe || "#10B981",
          emoji: item.emoji || "Ziel",
        },
      });
    } else if (domain === "finanzkonto") {
      await insertOne({
        table: "home_finanzkonten",
        payload: {
          user_id: userId,
          created_by_user_id: userId,
          household_id: householdId,
          name: item.name || "Finanzkonto",
          konto_typ: item.konto_typ || "haushaltskonto",
          inhaber_typ: item.inhaber_typ || "household",
          aktiv: true,
          farbe: item.farbe || "#10B981",
        },
      });
    }
  }

  return { count: receipts.length, receipts };
};

export const applyBuecherAiItems = async ({ session, items = [] }) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const receipts = [];

  for (const item of items) {
    const autoren = item.autor
      ? [item.autor]
      : Array.isArray(item.autoren)
        ? item.autoren
        : [];
    const payload = {
      user_id: userId,
      created_by_user_id: userId,
      household_id: householdId,
      titel: item.titel || "Unbekannter Titel",
      autor_anzeige: autoren.length > 0 ? autoren.join(", ") : null,
      autoren,
      isbn_13: item.isbn_13 || null,
      status: ["im_regal", "verliehen", "vermisst", "verschenkt", "entsorgt"].includes(item.status)
        ? item.status
        : "im_regal",
      tags: Array.isArray(item.tags) ? item.tags : [],
      notizen: item.notizen || null,
      anzahl: 1,
    };
    const { data, error } = await supabase
      .from("home_buecher")
      .insert(payload)
      .select("id, titel")
      .single();
    if (error) throw error;

    receipts.push(
      createReceipt({
        householdId,
        domain: "buecher",
        table: "home_buecher",
        id: data?.id,
        summary: data?.titel || payload.titel,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
  }

  return { count: receipts.length, receipts };
};

const buildAssistantSplitConfig = ({
  splitItem,
  bewohner,
  resolvedBewohnerId,
  resolvedKontoId,
  kontenById,
  bewohnerById,
}) => {
  const payerMember =
    resolveBewohnerByName(bewohner, splitItem.payer_member_name) ||
    bewohnerById[
      resolveSplitPayerFromBudgetSelection({
        bewohnerId: resolvedBewohnerId,
        zahlungskontoId: resolvedKontoId,
        kontenById,
        bewohnerById,
      })
    ] ||
    null;

  if (!payerMember?.id) {
    throw new Error("Zahler fuer die Kostenaufteilung konnte nicht aufgeloest werden.");
  }

  const splitMode = splitItem.split_mode || "equal";
  const participants = Array.isArray(splitItem.participants) ? splitItem.participants : [];
  const participantIds = Array.from(
    new Set(
      [payerMember.id, ...participants
        .map((name) => resolveBewohnerByName(bewohner, name)?.id)
        .filter(Boolean)],
    ),
  );

  const sharesInput = {};
  (splitItem.shares || []).forEach((share) => {
    const member = resolveBewohnerByName(bewohner, share.member_name);
    if (!member?.id) return;
    if (splitMode === "percent") {
      sharesInput[member.id] = Number(share.percent);
    } else {
      sharesInput[member.id] = Number(share.amount);
    }
  });

  return {
    aktiv: true,
    betrag: Number(splitItem.betrag || 0),
    payerMemberId: payerMember.id,
    splitMode,
    teilnehmer: participantIds,
    sharesInput,
  };
};

export const applyBudgetSplitAiItems = async ({
  session,
  items = [],
  budgetContext = {},
}) => {
  const userId = session?.user?.id;
  const householdId = await loadHouseholdId(session);
  const bewohner = budgetContext.bewohner || (await loadBewohnerOverview());
  const konten = budgetContext.aktiveFinanzkonten || (await loadActiveBudgetAccounts());
  const bewohnerById = Object.fromEntries(bewohner.map((entry) => [entry.id, entry]));
  const kontenById = Object.fromEntries(konten.map((entry) => [entry.id, entry]));
  const receipts = [];

  for (const item of items) {
    const resolvedBewohner = resolveBewohnerByName(bewohner, item.bewohner_name);
    const resolvedScope =
      item.budget_scope === "haushalt" || item.budget_scope === "privat"
        ? item.budget_scope
        : "haushalt";
    const defaultKonto = selectDefaultKontoForEntry({
      budgetScope: resolvedScope,
      bewohnerId: resolvedBewohner?.id || null,
      konten,
    });
    const resolvedKontoId =
      resolveKontoIdFromAiResult(item, konten, bewohner) || defaultKonto?.id || null;

    const splitConfig = buildAssistantSplitConfig({
      splitItem: item,
      bewohner,
      resolvedBewohnerId: resolvedBewohner?.id || null,
      resolvedKontoId,
      kontenById,
      bewohnerById,
    });
    const splitValidationError = validateSplitConfig(splitConfig);
    if (splitValidationError) {
      throw new Error(splitValidationError);
    }

    const budgetPayload = {
      user_id: userId,
      beschreibung: item.beschreibung || "Budget-Split",
      betrag: item.betrag || 0,
      kategorie: item.kategorie || null,
      typ: item.typ || "ausgabe",
      datum: normalizeDate(item.datum),
      app_modus: budgetContext.appModus || "home",
      budget_scope: resolvedScope,
      bewohner_id: resolvedBewohner?.id || null,
      zahlungskonto_id: resolvedKontoId,
      wiederholen: false,
      intervall: null,
      naechstes_datum: null,
    };
    const { data: neuerPosten, error: budgetError } = await supabase
      .from("budget_posten")
      .insert(budgetPayload)
      .select("id, beschreibung")
      .single();
    if (budgetError) throw budgetError;

    const builtShares = buildShares(splitConfig);
    if (!builtShares) {
      throw new Error("Kostenaufteilung konnte nicht berechnet werden.");
    }

    const insertPayload = {
      budget_posten_id: neuerPosten.id,
      household_id: householdId,
      payer_member_id: splitConfig.payerMemberId,
      split_mode: splitConfig.splitMode || "equal",
      payer_share_input: builtShares.payerShareInput ?? null,
      split_origin: "manual_occurrence",
      source_template_id: null,
    };

    let groupData = null;
    let groupError = null;
    ({ data: groupData, error: groupError } = await supabase
      .from("budget_split_groups")
      .insert(insertPayload)
      .select("id")
      .single());

    if (groupError && isSplitOriginSchemaError(groupError)) {
      const { split_origin, source_template_id, payer_share_input, ...legacyPayload } = insertPayload;
      ({ data: groupData, error: groupError } = await supabase
        .from("budget_split_groups")
        .insert(legacyPayload)
        .select("id")
        .single());
    }

    if (groupError) throw groupError;

    const sharesPayload = builtShares.shares.map((share) => ({
      ...share,
      split_group_id: groupData.id,
      household_id: householdId,
    }));
    const { error: sharesError } = await supabase
      .from("budget_split_shares")
      .insert(sharesPayload);
    if (sharesError) throw sharesError;

    receipts.push(
      createReceipt({
        householdId,
        domain: "budget_split",
        table: "budget_posten",
        id: neuerPosten.id,
        summary: neuerPosten.beschreibung,
        requestPayload: item,
        resultPayload: {
          budget: budgetPayload,
          split: insertPayload,
          shares: sharesPayload,
        },
      }),
    );
  }

  return { count: receipts.length, receipts };
};

export const applyBudgetSettlementAiItems = async ({ session, items = [] }) => {
  const householdId = await loadHouseholdId(session);
  const bewohner = await loadBewohnerOverview();
  const receipts = [];

  for (const item of items) {
    const fromMember = resolveBewohnerByName(bewohner, item.from_member_name);
    const toMember = resolveBewohnerByName(bewohner, item.to_member_name);

    if (!fromMember?.id || !toMember?.id) {
      throw new Error("Beteiligte fuer den Ausgleich konnten nicht aufgeloest werden.");
    }

    const { data, error } = await supabase.rpc("create_budget_settlement_with_allocations", {
      p_household_id: householdId,
      p_from_member_id: fromMember.id,
      p_to_member_id: toMember.id,
      p_amount: Number(item.amount || 0),
      p_date: normalizeDate(item.date),
      p_note: item.note || null,
    });
    if (error) throw error;

    const created = Array.isArray(data) ? data[0] : data;
    receipts.push(
      createReceipt({
        householdId,
        domain: "budget_settlement",
        table: "budget_settlements",
        id: created?.settlement_id || null,
        summary: `${getBewohnerDisplayName(fromMember)} -> ${getBewohnerDisplayName(toMember)} (${item.amount} EUR)`,
        requestPayload: item,
        resultPayload: created,
      }),
    );
  }

  return { count: receipts.length, receipts };
};

export const prepareAssistantAction = async ({
  domain,
  session,
  items,
  context = {},
}) => {
  if (domain === "medikamente") {
    const medicationAction = await prepareMedicationAssistantAction({ session, items });
    if (medicationAction) return medicationAction;
  }

  if (domain === "einkaufliste") {
    return prepareShoppingAssistantAction({
      session,
      items,
      source: "ki",
      existingEntries: context.existingEntries || null,
    });
  }

  return {
    kind: "records",
    domain,
    items,
  };
};

export const commitAssistantAction = async ({
  preparedAction,
  session,
  context = {},
}) => {
  const domain = preparedAction?.domain || preparedAction?.kind;

  if (preparedAction?.kind === "shopping") {
    return applyPreparedShoppingAssistantAction({
      session,
      preparedAction,
    });
  }

  switch (domain) {
    case "inventar":
      return applyInventoryAiItems({ session, items: preparedAction.items });
    case "vorraete":
      return applySupplyAiItems({ session, items: preparedAction.items });
    case "medikamente":
      return applyMedicationAiItems({ session, items: preparedAction.items });
    case "geraete":
      return applyDeviceAiItems({ session, items: preparedAction.items });
    case "projekte":
      return applyProjectAiItems({ session, items: preparedAction.items });
    case "aufgaben":
      return applyHomeTaskAiItems({ session, items: preparedAction.items });
    case "todos":
      return applyUmzugTodoAiItems({ session, items: preparedAction.items });
    case "budget":
      return applyBudgetAiItems({
        session,
        items: preparedAction.items,
        budgetContext: context.budgetContext || {},
      });
    case "wartungen":
      return applyWartungAiItems({ session, items: preparedAction.items });
    case "buecher":
      return applyBuecherAiItems({ session, items: preparedAction.items });
    case "budget_split":
      return applyBudgetSplitAiItems({
        session,
        items: preparedAction.items,
        budgetContext: context.budgetContext || {},
      });
    case "budget_settlement":
      return applyBudgetSettlementAiItems({
        session,
        items: preparedAction.items,
      });
    case "rechnung":
      return applyManualInvoiceAssistantItems({ session, items: preparedAction.items });
    case "inventar_ort":
    case "inventar_lagerort":
    case "bewohner":
    case "wissen":
    case "rezept":
    case "sparziel":
    case "finanzkonto":
      return applySimpleHomeAssistantItems({
        session,
        domain,
        items: preparedAction.items,
      });
    case "packliste":
      return applyPacklisteAiActions({
        session,
        items: preparedAction.items,
        kisten: context.kisten || [],
        suggestCategory: context.suggestCategory,
      });
    default:
      throw new Error(`Keine Commit-Strategie fuer ${domain} vorhanden.`);
  }
};
