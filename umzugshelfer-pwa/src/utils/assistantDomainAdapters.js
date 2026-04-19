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
    const geraetName = normalizeText(item.geraet_name);
    const geraet =
      (geraete || []).find((g) => normalizeText(g.name) === geraetName) ||
      (geraete || []).find((g) => normalizeText(g.name).includes(geraetName)) ||
      null;

    const payload = {
      user_id: userId,
      geraet_id: geraet?.id || null,
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
        summary: `${item.geraet_name || "Geraet"}: ${payload.typ}`,
        requestPayload: item,
        resultPayload: payload,
      }),
    );
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
