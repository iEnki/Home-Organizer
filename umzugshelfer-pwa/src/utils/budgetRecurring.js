/**
 * budgetRecurring.js
 * Zentrale Utility fuer wiederkehrende Budget-Eintraege.
 * Genutzt von HomeBudget.js und HomeDashboard.js.
 */

const VALID_INTERVALS = [
  "Täglich",
  "Wöchentlich",
  "Monatlich",
  "Vierteljährlich",
  "Jährlich",
];

export const SPLIT_ORIGINS = {
  TEMPLATE_DEFAULT: "template_default",
  INHERITED_OCCURRENCE: "inherited_occurrence",
  MANUAL_OCCURRENCE: "manual_occurrence",
};

let splitOriginSupportCache = null;

const isSplitOriginSchemaError = (error) => {
  const message = String(error?.message || error?.details || error?.hint || "");
  return /split_origin|source_template_id/i.test(message);
};

const supportsSplitOriginFields = async (supabase) => {
  if (!supabase) return false;
  if (splitOriginSupportCache != null) return splitOriginSupportCache;

  const { error } = await supabase
    .from("budget_split_groups")
    .select("id, split_origin")
    .limit(1);

  splitOriginSupportCache = !error || !isSplitOriginSchemaError(error);
  return splitOriginSupportCache;
};

/** Lokales YYYY-MM-DD ohne UTC-Verschiebung */
export const getLocalDateString = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Monate ohne JS-Monatsend-Bug addieren.
 * 31.01. + 1 Monat = 28./29.02. (nicht 03.03.)
 */
const addMonthsClamped = (dateStr, monthsToAdd) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const baseMonthIndex = (m - 1) + monthsToAdd;
  const targetYear = y + Math.floor(baseMonthIndex / 12);
  const targetMonth = ((baseMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return [
    String(targetYear),
    String(targetMonth + 1).padStart(2, "0"),
    String(Math.min(d, lastDay)).padStart(2, "0"),
  ].join("-");
};

/**
 * Naechstes Faelligkeitsdatum berechnen.
 * Wirft bei ungueltigem Intervall, damit keine Endlosschleifen entstehen.
 */
export const calcNaechstesDatum = (datum, intervallStr) => {
  switch (intervallStr) {
    case "Täglich": {
      const d = new Date(`${datum}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return getLocalDateString(d);
    }
    case "Wöchentlich": {
      const d = new Date(`${datum}T00:00:00`);
      d.setDate(d.getDate() + 7);
      return getLocalDateString(d);
    }
    case "Monatlich":
      return addMonthsClamped(datum, 1);
    case "Vierteljährlich":
      return addMonthsClamped(datum, 3);
    case "Jährlich":
      return addMonthsClamped(datum, 12);
    default:
      throw new Error(`Ungueltiges Wiederholungs-Intervall: "${intervallStr}"`);
  }
};

/**
 * Monatsanfang (inklusiv) + naechster Monatsanfang (exklusiv) als YYYY-MM-DD.
 */
export const getMonthBounds = (date = new Date()) => ({
  start: getLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1)),
  nextStart: getLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 1)),
});

export const getRecurringOccurrenceDateForMonth = (template, year, month) => {
  if (!template?.wiederholen || !template?.datum || !template?.intervall) return null;

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = getLocalDateString(new Date(year, month + 1, 0));
  let current = template.datum;
  let iterations = 0;

  while (current < monthStart && iterations < 1000) {
    current = calcNaechstesDatum(current, template.intervall);
    iterations += 1;
  }

  if (iterations >= 1000) return null;
  if (template.ende_datum && current > template.ende_datum) return null;
  if (current < monthStart || current > monthEnd) return null;

  return current;
};

export const findOccurrenceForTemplateMonth = async ({
  supabase,
  templateId,
  year,
  month,
}) => {
  if (!supabase || !templateId || year == null || month == null) return null;

  const { start, nextStart } = getMonthBounds(new Date(year, month, 1));
  const { data, error } = await supabase
    .from("budget_posten")
    .select("*")
    .eq("ursprung_template_id", templateId)
    .gte("datum", start)
    .lt("datum", nextStart)
    .order("datum", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const ensureTemplateOccurrenceForMonth = async ({
  supabase,
  template,
  userId,
  year,
  month,
}) => {
  if (!supabase || !template?.id || !template?.wiederholen) return null;

  const existing = await findOccurrenceForTemplateMonth({
    supabase,
    templateId: template.id,
    year,
    month,
  });
  if (existing) return existing;

  const occurrenceDate = getRecurringOccurrenceDateForMonth(template, year, month);
  if (!occurrenceDate) return null;

  const { data, error } = await supabase
    .from("budget_posten")
    .upsert(
      {
        user_id: template.user_id || userId || null,
        beschreibung: template.beschreibung,
        betrag: template.betrag,
        kategorie: template.kategorie,
        datum: occurrenceDate,
        typ: template.typ || "ausgabe",
        app_modus: template.app_modus,
        bewohner_id: template.bewohner_id || null,
        home_projekt_id: template.home_projekt_id || null,
        budget_scope: template.budget_scope || "haushalt",
        zahlungskonto_id: template.zahlungskonto_id || null,
        wiederholen: false,
        intervall: null,
        naechstes_datum: null,
        ende_datum: null,
        ursprung_template_id: template.id,
      },
      { onConflict: "ursprung_template_id,datum", ignoreDuplicates: false }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data || null;
};

const groupHasAllocations = (group) =>
  (group?.budget_split_shares || []).some(
    (share) =>
      Array.isArray(share?.budget_settlement_allocations) &&
      share.budget_settlement_allocations.length > 0,
  );

const loadTemplateSplitGroup = async ({ supabase, templateId, householdId }) => {
  if (!supabase || !templateId || !householdId) return null;

  const { data, error } = await supabase
    .from("budget_split_groups")
    .select(`
      *,
      budget_split_shares(
        member_id,
        amount_owed,
        share_type,
        share_input,
        budget_settlement_allocations(id)
      )
    `)
    .eq("budget_posten_id", templateId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const loadOccurrenceSplitGroups = async ({ supabase, occurrenceIds, householdId }) => {
  if (!supabase || !householdId || !Array.isArray(occurrenceIds) || occurrenceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("budget_split_groups")
    .select(`
      *,
      budget_split_shares(
        member_id,
        amount_owed,
        share_type,
        share_input,
        budget_settlement_allocations(id)
      )
    `)
    .eq("household_id", householdId)
    .in("budget_posten_id", occurrenceIds);

  if (error) throw error;
  return data || [];
};

const writeOccurrenceSplitGroup = async ({
  supabase,
  occurrenceId,
  householdId,
  templateGroup,
  sourceTemplateId,
}) => {
  const insertPayload = {
    budget_posten_id: occurrenceId,
    household_id: householdId,
    payer_member_id: templateGroup.payer_member_id,
    split_mode: templateGroup.split_mode,
    payer_share_input: templateGroup.payer_share_input ?? null,
    split_origin: SPLIT_ORIGINS.INHERITED_OCCURRENCE,
    source_template_id: sourceTemplateId || null,
  };

  let insertedGroup = null;
  let groupError = null;
  ({ data: insertedGroup, error: groupError } = await supabase
    .from("budget_split_groups")
    .insert(insertPayload)
    .select("id")
    .single());

  if (groupError && isSplitOriginSchemaError(groupError)) {
    const { split_origin, source_template_id, ...legacyPayload } = insertPayload;
    ({ data: insertedGroup, error: groupError } = await supabase
      .from("budget_split_groups")
      .insert(legacyPayload)
      .select("id")
      .single());
  }

  if (groupError) throw groupError;

  if ((templateGroup.budget_split_shares || []).length === 0) return insertedGroup;

  const { error: sharesError } = await supabase.from("budget_split_shares").insert(
    (templateGroup.budget_split_shares || []).map((share) => ({
      split_group_id: insertedGroup.id,
      household_id: householdId,
      member_id: share.member_id,
      amount_owed: share.amount_owed,
      share_type: share.share_type || "equal",
      share_input: share.share_input ?? null,
    })),
  );

  if (sharesError) {
    await supabase.from("budget_split_groups").delete().eq("id", insertedGroup.id);
    throw sharesError;
  }

  return insertedGroup;
};

export const propagateTemplateSplitToOccurrences = async ({
  supabase,
  householdId,
  templateId,
  occurrenceIds = null,
}) => {
  if (!supabase || !householdId || !templateId) {
    return {
      updatedOccurrenceIds: [],
      removedOccurrenceIds: [],
      skippedManualOccurrenceIds: [],
      skippedProtectedOccurrenceIds: [],
    };
  }

  let occurrenceQuery = supabase
    .from("budget_posten")
    .select("id")
    .eq("ursprung_template_id", templateId);

  if (Array.isArray(occurrenceIds) && occurrenceIds.length > 0) {
    occurrenceQuery = occurrenceQuery.in("id", occurrenceIds);
  }

  const { data: occurrences, error: occurrenceError } = await occurrenceQuery;
  if (occurrenceError) throw occurrenceError;

  const occurrenceRows = occurrences || [];
  if (occurrenceRows.length === 0) {
    return {
      updatedOccurrenceIds: [],
      removedOccurrenceIds: [],
      skippedManualOccurrenceIds: [],
      skippedProtectedOccurrenceIds: [],
    };
  }

  const resolvedOccurrenceIds = occurrenceRows.map((entry) => entry.id);
  const [templateGroup, occurrenceGroups] = await Promise.all([
    loadTemplateSplitGroup({ supabase, templateId, householdId }),
    loadOccurrenceSplitGroups({ supabase, occurrenceIds: resolvedOccurrenceIds, householdId }),
  ]);

  const occurrenceGroupByPostenId = Object.fromEntries(
    occurrenceGroups.map((group) => [group.budget_posten_id, group]),
  );
  const hasOriginSupport = await supportsSplitOriginFields(supabase);

  const updatedOccurrenceIds = [];
  const removedOccurrenceIds = [];
  const skippedManualOccurrenceIds = [];
  const skippedProtectedOccurrenceIds = [];

  for (const occurrence of occurrenceRows) {
    const existingGroup = occurrenceGroupByPostenId[occurrence.id] || null;
    const origin = existingGroup?.split_origin || null;

    if (!hasOriginSupport && existingGroup) {
      // Legacy-DB ohne Herkunftsfelder: unbekannte bestehende Occurrence-Splits nicht anfassen.
      skippedManualOccurrenceIds.push(occurrence.id);
      continue;
    }

    if (existingGroup && origin === SPLIT_ORIGINS.MANUAL_OCCURRENCE) {
      skippedManualOccurrenceIds.push(occurrence.id);
      continue;
    }

    if (existingGroup && groupHasAllocations(existingGroup)) {
      skippedProtectedOccurrenceIds.push(occurrence.id);
      continue;
    }

    if (!templateGroup) {
      if (existingGroup) {
        const { error: deleteError } = await supabase
          .from("budget_split_groups")
          .delete()
          .eq("id", existingGroup.id);
        if (deleteError) throw deleteError;
        removedOccurrenceIds.push(occurrence.id);
      }
      continue;
    }

    if (existingGroup) {
      const { error: deleteExistingError } = await supabase
        .from("budget_split_groups")
        .delete()
        .eq("id", existingGroup.id);
      if (deleteExistingError) throw deleteExistingError;
    }

    await writeOccurrenceSplitGroup({
      supabase,
      occurrenceId: occurrence.id,
      householdId,
      templateGroup,
      sourceTemplateId: templateId,
    });
    updatedOccurrenceIds.push(occurrence.id);
  }

  return {
    updatedOccurrenceIds,
    removedOccurrenceIds,
    skippedManualOccurrenceIds,
    skippedProtectedOccurrenceIds,
  };
};

/**
 * Erzeugt alle faelligen Recurring-Occurrences (Catch-up-Schleife).
 * Idempotent via upsert + Unique-Index auf (ursprung_template_id, datum).
 * Race-safe: Parallel-Loads erzeugen keine Duplikate.
 */
export const ensureRecurringBudgetEntries = async ({
  supabase,
  userId,
  householdId,
  appModi = ["home", "beides"],
}) => {
  const today = getLocalDateString();

  const { data: faellige, error: fetchError } = await supabase
    .from("budget_posten")
    .select("*")
    .eq("user_id", userId)
    .eq("wiederholen", true)
    .in("app_modus", appModi)
    .lte("naechstes_datum", today)
    .not("naechstes_datum", "is", null);

  if (fetchError) throw fetchError;

  const templateIds = (faellige || []).map((p) => p.id).filter(Boolean);
  let splitSigMap = {};
  if (templateIds.length > 0 && householdId) {
    const { data: splitGroups, error: sigErr } = await supabase
      .from("budget_split_groups")
      .select("budget_posten_id, payer_member_id, split_mode, payer_share_input, budget_split_shares(member_id, share_type, share_input)")
      .in("budget_posten_id", templateIds)
      .eq("household_id", householdId);

    if (sigErr) throw new Error(`[budgetRecurring] Split-Preload fehlgeschlagen: ${sigErr.message}`);

    splitSigMap = Object.fromEntries(
      (splitGroups || []).map((group) => {
        const sharesSig = (group.budget_split_shares || [])
          .sort((left, right) => left.member_id.localeCompare(right.member_id))
          .map((share) => `${share.member_id}:${share.share_type}:${share.share_input ?? ""}`)
          .join(";");

        return [
          group.budget_posten_id,
          `${group.split_mode}|${group.payer_member_id}|${group.payer_share_input ?? ""}|${sharesSig}`,
        ];
      }),
    );
  }

  const dedupKey = (entry) =>
    `${entry.user_id}|${entry.beschreibung}|${entry.betrag}|${entry.intervall}|${entry.app_modus}|${entry.budget_scope || "haushalt"}|${entry.bewohner_id || ""}|${entry.zahlungskonto_id || ""}|${splitSigMap[entry.id] || ""}`;

  const newestByKey = new Map();
  for (const entry of faellige || []) {
    const key = dedupKey(entry);
    if (!newestByKey.has(key) || entry.datum > newestByKey.get(key).datum) {
      newestByKey.set(key, entry);
    }
  }

  const zuVerarbeiten = [...newestByKey.values()];
  const zuFixende = (faellige || []).filter((entry) => newestByKey.get(dedupKey(entry))?.id !== entry.id);

  for (const entry of zuFixende) {
    const { error: fixError } = await supabase
      .from("budget_posten")
      .update({ wiederholen: false, intervall: null, naechstes_datum: null })
      .eq("id", entry.id);

    if (fixError) {
      console.error(`[budgetRecurring] Auto-Fix fehlgeschlagen fuer ${entry.id}:`, fixError);
    } else {
      console.warn(`[budgetRecurring] Orphaned duplicate template ${entry.id} ("${entry.beschreibung}") auto-fixed.`);
    }
  }

  for (const template of zuVerarbeiten) {
    if (!VALID_INTERVALS.includes(template.intervall)) {
      console.warn(
        `[budgetRecurring] Template ${template.id} hat ungueltiges Intervall "${template.intervall}" und wird uebersprungen.`,
      );
      continue;
    }

    let next = template.naechstes_datum;

    while (next <= today && (!template.ende_datum || next <= template.ende_datum)) {
      const { error: upsertError } = await supabase.from("budget_posten").upsert(
        {
          user_id: template.user_id || userId,
          beschreibung: template.beschreibung,
          betrag: template.betrag,
          kategorie: template.kategorie,
          datum: next,
          typ: template.typ || "ausgabe",
          app_modus: template.app_modus,
          bewohner_id: template.bewohner_id || null,
          home_projekt_id: template.home_projekt_id || null,
          budget_scope: template.budget_scope || "haushalt",
          zahlungskonto_id: template.zahlungskonto_id || null,
          wiederholen: false,
          intervall: null,
          naechstes_datum: null,
          ende_datum: null,
          ursprung_template_id: template.id,
        },
        { onConflict: "ursprung_template_id,datum", ignoreDuplicates: true },
      );
      if (upsertError) throw upsertError;

      if (householdId && splitSigMap[template.id]) {
        const { data: occurrence, error: occurrenceError } = await supabase
          .from("budget_posten")
          .select("id")
          .eq("ursprung_template_id", template.id)
          .eq("datum", next)
          .maybeSingle();

        if (occurrenceError) {
          console.error("[budgetRecurring] Occurrence-Laden fehlgeschlagen:", occurrenceError);
        } else if (occurrence?.id) {
          try {
            await propagateTemplateSplitToOccurrences({
              supabase,
              householdId,
              templateId: template.id,
              occurrenceIds: [occurrence.id],
            });
          } catch (splitError) {
            console.error(`[budgetRecurring] Split-Propagation fuer Occurrence ${occurrence.id} fehlgeschlagen:`, splitError);
          }
        }
      }

      next = calcNaechstesDatum(next, template.intervall);
    }

    if (template.ende_datum && next > template.ende_datum) {
      const { error: deactivateError } = await supabase
        .from("budget_posten")
        .update({ wiederholen: false, naechstes_datum: null })
        .eq("id", template.id);
      if (deactivateError) throw deactivateError;
    } else {
      const { error: updateError } = await supabase
        .from("budget_posten")
        .update({ naechstes_datum: next })
        .eq("id", template.id);
      if (updateError) throw updateError;
    }
  }
};
