import { getActiveHouseholdId, supabase } from "../supabaseClient";
import { logVerlauf, logVerlaufBatch } from "./homeVerlauf";

const TABLE_META = {
  home_orte: { singular: "Ort", plural: "Orte", url: "/home/inventar" },
  home_lagerorte: { singular: "Lagerort", plural: "Lagerorte", url: "/home/inventar" },
  home_objekte: { singular: "Objekt", plural: "Objekte", url: "/home/inventar" },
  home_vorraete: { singular: "Vorrat", plural: "Vorraete", url: "/home/vorraete" },
  home_geraete: { singular: "Geraet", plural: "Geraete", url: "/home/geraete" },
  home_wartungen: { singular: "Wartung", plural: "Wartungen", url: "/home/geraete" },
  home_bewohner: { singular: "Bewohner", plural: "Bewohner", url: "/home/bewohner" },
  home_einkaufliste: { singular: "Einkaufsartikel", plural: "Einkaufsartikel", url: "/home/einkaufsliste" },
  todo_aufgaben: { singular: "Aufgabe", plural: "Aufgaben", url: "/home/aufgaben" },
  budget_posten: { singular: "Budget-Eintrag", plural: "Budget-Eintraege", url: "/home/budget" },
  home_projekte: { singular: "Projekt", plural: "Projekte", url: "/home/projekte" },
  home_wissen: { singular: "Wissenseintrag", plural: "Wissenseintraege", url: "/home/wissen" },
  dokumente: { singular: "Dokument", plural: "Dokumente", url: "/home/dokumente" },
  home_buecher: { singular: "Buch", plural: "Buecher", url: "/home/inventar?tab=buecher" },
};

const IMPORTANT_ACTIONS = new Set(["erstellt", "geloescht"]);

async function resolveHouseholdId(userId) {
  const activeHouseholdId = getActiveHouseholdId();
  if (activeHouseholdId) return activeHouseholdId;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.household_id || null;
}

const uniqueNonEmpty = (values = []) => [...new Set((values || []).filter(Boolean))];

const defaultEventUrl = (table) => TABLE_META[table]?.url || "/home";

const tableLabel = (table, plural = false) => {
  const meta = TABLE_META[table];
  if (meta) return plural ? meta.plural : meta.singular;
  if (!table) return plural ? "Eintraege" : "Eintrag";
  const raw = String(table).replace(/^home_/, "").replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const buildSingleEventCopy = ({ table, action, recordName }) => {
  const singular = tableLabel(table, false);
  const safeName = String(recordName || "").trim();

  if (action === "erstellt") {
    return {
      title: `Neuer ${singular}`,
      body: safeName ? `"${safeName}" wurde hinzugefuegt.` : `${singular} wurde hinzugefuegt.`,
    };
  }

  if (action === "geloescht") {
    return {
      title: `${singular} geloescht`,
      body: safeName ? `"${safeName}" wurde geloescht.` : `${singular} wurde geloescht.`,
    };
  }

  return {
    title: `${singular} aktualisiert`,
    body: safeName ? `"${safeName}" wurde aktualisiert.` : `${singular} wurde aktualisiert.`,
  };
};

const buildBatchEventCopy = ({ table, action, count }) => {
  const plural = tableLabel(table, true);
  const amount = Number(count) || 0;

  if (action === "geloescht") {
    return {
      title: `${plural} geloescht`,
      body: `${amount} ${plural} wurden geloescht.`,
    };
  }

  if (action === "geaendert") {
    return {
      title: `${plural} aktualisiert`,
      body: `${amount} ${plural} wurden aktualisiert.`,
    };
  }

  return {
    title: `Neue ${plural}`,
    body: `${amount} ${plural} wurden hinzugefuegt.`,
  };
};

const contradictsAction = (action, text) => {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  if (action === "geloescht") {
    return /hinzugef|hinzu|neu\b|erstellt/.test(normalized);
  }

  if (action === "erstellt") {
    return /geloesch|gelösch|entfernt|entfernen|delete|deleted/.test(normalized);
  }

  return false;
};

const resolveCopy = ({ action, fallback, title, body }) => ({
  title: title && !contradictsAction(action, title) ? title : fallback.title,
  body: body && !contradictsAction(action, body) ? body : fallback.body,
});

const shouldSendPush = ({ action, pushPolicy }) => {
  if (pushPolicy === false || pushPolicy === "never") return false;
  if (pushPolicy === true || pushPolicy === "always") return true;
  return IMPORTANT_ACTIONS.has(action);
};

async function resolveRecipientUserIds({
  userId,
  actorUserId = userId,
  recipientMode = "household",
  recipientUserIds = [],
  excludeActor = true,
}) {
  let baseUserIds = [];

  if (recipientMode === "custom") {
    baseUserIds = uniqueNonEmpty(recipientUserIds);
  } else if (recipientMode === "self") {
    baseUserIds = uniqueNonEmpty([userId]);
  } else {
    baseUserIds = await loadHouseholdMemberIds(userId);
  }

  if (!excludeActor || !actorUserId) return baseUserIds;
  return baseUserIds.filter((candidate) => candidate !== actorUserId);
}

export async function loadHouseholdMemberIds(userId, { excludeUserIds = [] } = {}) {
  if (!userId) return [];

  const householdId = await resolveHouseholdId(userId);
  let memberIds;

  if (!householdId) {
    memberIds = [userId];
  } else {
    const { data, error } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId);

    if (error) throw error;
    memberIds = (data || []).map((row) => row.user_id);
  }

  const excluded = new Set(uniqueNonEmpty(excludeUserIds));
  const uniqueIds = uniqueNonEmpty(memberIds);
  return uniqueIds.filter((memberId) => !excluded.has(memberId));
}

export async function sendPushToUserIds({
  userIds = [],
  title,
  body,
  url = "/",
  tag = "default",
}) {
  const uniqueUserIds = uniqueNonEmpty(userIds);
  if (!uniqueUserIds.length || !title || !body) {
    return { requested: 0, sent: 0, failed: 0 };
  }

  const results = await Promise.all(
    uniqueUserIds.map((userId) =>
      supabase.functions
        .invoke("send-push", {
          body: {
            user_id: userId,
            title,
            body,
            url,
            tag,
          },
        })
        .then(() => ({ ok: true, userId }))
        .catch(() => ({ ok: false, userId })),
    ),
  );

  const sent = results.filter((result) => result.ok).length;
  return {
    requested: uniqueUserIds.length,
    sent,
    failed: uniqueUserIds.length - sent,
  };
}

export async function sendPushToHouseholdMembers({
  userId,
  title,
  body,
  url = "/",
  tag = "default",
  excludeUserIds = [],
}) {
  const memberIds = await loadHouseholdMemberIds(userId, { excludeUserIds });
  return sendPushToUserIds({ userIds: memberIds, title, body, url, tag });
}

export async function notifyHouseholdEvent({
  supabaseClient = supabase,
  userId,
  actorUserId = userId,
  table,
  action,
  recordName,
  recordId = null,
  url,
  tag,
  title,
  body,
  history = true,
  push = true,
  pushPolicy = "important",
  recipientMode = "household",
  recipientUserIds = [],
  excludeActor = true,
  historyOptions = {},
}) {
  const result = {
    historyLogged: false,
    pushAttempted: false,
    pushSent: false,
    recipientCount: 0,
  };

  if (!userId || !table || !action) return result;

  if (history) {
    await logVerlauf(supabaseClient, userId, table, recordName, action, historyOptions);
    result.historyLogged = true;
  }

  if (!push || !shouldSendPush({ action, pushPolicy })) return result;

  try {
    const recipients = await resolveRecipientUserIds({
      userId,
      actorUserId,
      recipientMode,
      recipientUserIds,
      excludeActor,
    });

    result.pushAttempted = true;
    result.recipientCount = recipients.length;

    if (!recipients.length) return result;

    const text = resolveCopy({
      action,
      fallback: buildSingleEventCopy({ table, action, recordName }),
      title,
      body,
    });
    const pushResult = await sendPushToUserIds({
      userIds: recipients,
      title: text.title,
      body: text.body,
      url: url || defaultEventUrl(table),
      tag: tag || `${table}-${action}-${recordId || Date.now()}`,
    });

    result.pushSent = pushResult.sent > 0;
    result.pushResult = pushResult;
    return result;
  } catch (error) {
    result.pushError = error;
    return result;
  }
}

export async function notifyHouseholdBatchEvent({
  supabaseClient = supabase,
  userId,
  actorUserId = userId,
  table,
  action = "erstellt",
  eintraege = [],
  url,
  tag,
  title,
  body,
  history = true,
  push = true,
  pushPolicy = "always",
  recipientMode = "household",
  recipientUserIds = [],
  excludeActor = true,
}) {
  const result = {
    historyLogged: 0,
    pushAttempted: false,
    pushSent: false,
    recipientCount: 0,
  };

  if (!userId || !table || !action) return result;

  const normalizedEntries = Array.isArray(eintraege)
    ? eintraege
        .map((eintrag) => ({
          tabelle: eintrag?.tabelle || table,
          datensatz_name: eintrag?.datensatz_name ?? eintrag?.recordName ?? eintrag?.name ?? null,
          aktion: eintrag?.aktion || action,
          options: eintrag?.options || {},
        }))
        .filter((eintrag) => eintrag.tabelle && eintrag.aktion)
    : [];

  if (normalizedEntries.length === 0) return result;

  if (history && normalizedEntries.length > 0) {
    await logVerlaufBatch(supabaseClient, userId, normalizedEntries);
    result.historyLogged = normalizedEntries.length;
  }

  if (!push || !shouldSendPush({ action, pushPolicy })) return result;

  try {
    const recipients = await resolveRecipientUserIds({
      userId,
      actorUserId,
      recipientMode,
      recipientUserIds,
      excludeActor,
    });

    result.pushAttempted = true;
    result.recipientCount = recipients.length;

    if (!recipients.length) return result;

    const count = normalizedEntries.length || 1;
    const text = resolveCopy({
      action,
      fallback: buildBatchEventCopy({ table, action, count }),
      title,
      body,
    });
    const pushResult = await sendPushToUserIds({
      userIds: recipients,
      title: text.title,
      body: text.body,
      url: url || defaultEventUrl(table),
      tag: tag || `${table}-${action}-batch-${Date.now()}`,
    });

    result.pushSent = pushResult.sent > 0;
    result.pushResult = pushResult;
    return result;
  } catch (error) {
    result.pushError = error;
    return result;
  }
}
