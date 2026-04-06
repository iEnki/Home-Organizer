/**
 * budgetRecurring.js
 * Zentrale Utility für wiederkehrende Budget-Einträge.
 * Genutzt von HomeBudget.js und HomeDashboard.js.
 */

const VALID_INTERVALS = ["Täglich", "Wöchentlich", "Monatlich", "Vierteljährlich", "Jährlich"];

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
  const targetYear     = y + Math.floor(baseMonthIndex / 12);
  const targetMonth    = ((baseMonthIndex % 12) + 12) % 12; // 0–11
  const lastDay        = new Date(targetYear, targetMonth + 1, 0).getDate();
  return [
    String(targetYear),
    String(targetMonth + 1).padStart(2, "0"),
    String(Math.min(d, lastDay)).padStart(2, "0"),
  ].join("-");
};

/**
 * Nächstes Fälligkeitsdatum berechnen.
 * Wirft bei ungültigem Intervall — schützt vor Endlosschleifen in ensureRecurringBudgetEntries.
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
    case "Monatlich":       return addMonthsClamped(datum, 1);
    case "Vierteljährlich": return addMonthsClamped(datum, 3);
    case "Jährlich":        return addMonthsClamped(datum, 12);
    default:
      throw new Error(`Ungültiges Wiederholungs-Intervall: "${intervallStr}"`);
  }
};

/**
 * Monatsanfang (inklusiv) + nächsten Monatsanfang (exklusiv) als YYYY-MM-DD.
 * Für halb-offene Queries: .gte(start).lt(nextStart)
 */
export const getMonthBounds = (date = new Date()) => ({
  start:     getLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1)),
  nextStart: getLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 1)),
});

/**
 * Erzeugt alle fälligen Recurring-Occurrences (Catch-up-Schleife).
 * Idempotent via upsert + Unique-Index auf (ursprung_template_id, datum).
 * Race-safe: Parallel-Loads erzeugen keine Duplikate.
 * Phase B: Kopiert Split-Konfiguration vom Template auf jede neue Occurrence.
 *
 * @param {{ supabase: object, userId: string, householdId: string, appModi?: string[] }} options
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

  // Split-Signaturen für Dedup-Key vorladen (aus faellige, VOR dem Dedup)
  const templateIds = (faellige || []).map(p => p.id).filter(Boolean);
  let splitSigMap = {};
  if (templateIds.length > 0 && householdId) {
    const { data: splitGroups, error: sigErr } = await supabase
      .from("budget_split_groups")
      .select("budget_posten_id, payer_member_id, split_mode, payer_share_input, budget_split_shares(member_id, share_type, share_input)")
      .in("budget_posten_id", templateIds)
      .eq("household_id", householdId);

    if (sigErr) throw new Error(`[budgetRecurring] Split-Preload fehlgeschlagen: ${sigErr.message}`);

    splitSigMap = Object.fromEntries(
      (splitGroups || []).map(g => {
        const sharesSig = (g.budget_split_shares || [])
          .sort((a, b) => a.member_id.localeCompare(b.member_id))
          .map(s => `${s.member_id}:${s.share_type}:${s.share_input ?? ''}`)
          .join(';');
        return [g.budget_posten_id, `${g.split_mode}|${g.payer_member_id}|${g.payer_share_input ?? ''}|${sharesSig}`];
      })
    );
  }

  // Dedup: bei mehreren wiederholen=true-Einträgen mit gleicher Signatur nur das neueste Template behalten.
  // Schützt gegen Alt-Occurrences aus dem alten UTC-Bug-Code (naechstes_datum="2026-03-31" statt "2026-04-01").
  const dedupKey = (p) =>
    `${p.user_id}|${p.beschreibung}|${p.betrag}|${p.intervall}|${p.app_modus}|${p.budget_scope || "haushalt"}|${p.bewohner_id || ""}|${p.zahlungskonto_id || ""}|${splitSigMap[p.id] || ""}`;
  const newestByKey = new Map();
  for (const p of faellige || []) {
    const key = dedupKey(p);
    if (!newestByKey.has(key) || p.datum > newestByKey.get(key).datum) {
      newestByKey.set(key, p);
    }
  }
  const zuVerarbeiten = [...newestByKey.values()];
  const zuFixende = (faellige || []).filter(p => newestByKey.get(dedupKey(p))?.id !== p.id);
  for (const p of zuFixende) {
    const { error: fixError } = await supabase
      .from("budget_posten")
      .update({ wiederholen: false, intervall: null, naechstes_datum: null })
      .eq("id", p.id);
    if (fixError) console.error(`[budgetRecurring] Auto-Fix fehlgeschlagen für ${p.id}:`, fixError);
    else console.warn(`[budgetRecurring] Orphaned duplicate template ${p.id} ("${p.beschreibung}") auto-fixed.`);
  }

  for (const p of zuVerarbeiten) {
    if (!VALID_INTERVALS.includes(p.intervall)) {
      console.warn(`[budgetRecurring] Template ${p.id} hat ungültiges Intervall "${p.intervall}" — übersprungen.`);
      continue;
    }

    let next = p.naechstes_datum;

    // Catch-up: alle überfälligen Intervalle erzeugen (stoppt am ende_datum falls gesetzt)
    while (next <= today && (!p.ende_datum || next <= p.ende_datum)) {
      const { error: upsertError } = await supabase.from("budget_posten").upsert(
        {
          user_id:              p.user_id || userId,  // Herkunft stabil halten
          beschreibung:         p.beschreibung,
          betrag:               p.betrag,
          kategorie:            p.kategorie,
          datum:                next,
          typ:                  p.typ || "ausgabe",
          app_modus:            p.app_modus,
          bewohner_id:          p.bewohner_id       || null,
          home_projekt_id:      p.home_projekt_id  || null,
          budget_scope:         p.budget_scope     || "haushalt",
          zahlungskonto_id:     p.zahlungskonto_id || null,
          wiederholen:          false,  // Occurrence = normaler abgeschlossener Eintrag
          intervall:            null,
          naechstes_datum:      null,
          ende_datum:           null,
          ursprung_template_id: p.id,
        },
        { onConflict: "ursprung_template_id,datum", ignoreDuplicates: true }
      );
      if (upsertError) throw upsertError;

      // Split-Kopie auf Occurrence übertragen (nur wenn Template einen Split hat)
      if (householdId && splitSigMap[p.id]) {
        const { data: occ, error: occErr } = await supabase
          .from("budget_posten")
          .select("id")
          .eq("ursprung_template_id", p.id)
          .eq("datum", next)
          .maybeSingle();
        if (occErr) {
          console.error(`[budgetRecurring] Occurrence-Laden fehlgeschlagen:`, occErr);
        } else if (occ?.id) {
          try {
            const { data: templateGroup, error: tgErr } = await supabase
              .from("budget_split_groups")
              .select("*, budget_split_shares(member_id, amount_owed, share_type, share_input)")
              .eq("budget_posten_id", p.id)
              .eq("household_id", householdId)
              .maybeSingle();
            if (tgErr) { console.error(`[budgetRecurring] templateGroup-Laden fehlgeschlagen:`, tgErr); }
            else if (templateGroup) {
              // Gruppe upserten (ignoreDuplicates: true bei bereits vorhandener Occurrence-Gruppe)
              const { error: ugErr } = await supabase.from("budget_split_groups").upsert({
                budget_posten_id: occ.id,
                household_id: templateGroup.household_id,
                payer_member_id: templateGroup.payer_member_id,
                split_mode: templateGroup.split_mode,
                payer_share_input: templateGroup.payer_share_input ?? null,
              }, { onConflict: "budget_posten_id", ignoreDuplicates: true });
              if (ugErr) { console.error(`[budgetRecurring] Gruppe-Upsert fehlgeschlagen:`, ugErr); }
              else {
                // WICHTIG: Gruppe NACH dem Upsert erneut lesen (ignoreDuplicates liefert ggf. keine Daten zurück)
                const { data: occGroup, error: ogErr } = await supabase
                  .from("budget_split_groups")
                  .select("id")
                  .eq("budget_posten_id", occ.id)
                  .maybeSingle();
                if (ogErr) { console.error(`[budgetRecurring] occGroup-Laden fehlgeschlagen:`, ogErr); }
                else if (occGroup?.id) {
                  const { error: usErr } = await supabase.from("budget_split_shares").upsert(
                    (templateGroup.budget_split_shares || []).map(s => ({
                      split_group_id: occGroup.id,
                      household_id: templateGroup.household_id,
                      member_id: s.member_id,
                      amount_owed: s.amount_owed,
                      share_type: s.share_type || 'equal',
                      share_input: s.share_input ?? null,
                    })),
                    { onConflict: "split_group_id,member_id", ignoreDuplicates: true }
                  );
                  if (usErr) console.error(`[budgetRecurring] Shares-Upsert fehlgeschlagen:`, usErr);
                }
              }
            }
          } catch (splitErr) {
            console.error(`[budgetRecurring] Split-Kopie für Occurrence ${occ.id} fehlgeschlagen:`, splitErr);
            // Nicht werfen — Haupt-Flow nicht blockieren
          }
        }
      }

      next = calcNaechstesDatum(next, p.intervall);
    }

    // Template abgelaufen → deaktivieren; sonst auf nächstes Datum vorsetzen
    if (p.ende_datum && next > p.ende_datum) {
      const { error: deactivateError } = await supabase
        .from("budget_posten")
        .update({ wiederholen: false, naechstes_datum: null })
        .eq("id", p.id);
      if (deactivateError) throw deactivateError;
    } else {
      const { error: updateError } = await supabase
        .from("budget_posten")
        .update({ naechstes_datum: next })
        .eq("id", p.id);
      if (updateError) throw updateError;
    }
  }
};
