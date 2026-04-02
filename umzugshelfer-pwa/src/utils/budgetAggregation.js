/**
 * budgetAggregation.js
 * Zentrale Aggregationslogik fuer Haushalt vs. Privat Budget-Scope.
 * Eintraege ohne budget_scope (Altdaten) gelten als "haushalt".
 */

/**
 * Summe der Ausgaben fuer einen bestimmten budget_scope.
 * @param {Array} posten - gefilterte Budget-Eintraege
 * @param {"haushalt"|"privat"} scope
 * @returns {number}
 */
export const sumScope = (posten, scope) =>
  posten
    .filter(p => {
      if ((p.typ || "ausgabe") === "einnahme") return false;
      return (p.budget_scope || "haushalt") === scope;
    })
    .reduce((s, p) => s + Math.abs(Number(p.betrag)), 0);

/**
 * Summe gruppiert nach bewohner_id fuer einen bestimmten Scope.
 * Key "__haushalt__" fuer Eintraege ohne bewohner_id.
 * @param {Array} posten
 * @param {"haushalt"|"privat"|null} scope - null = alle Scopes
 * @returns {Map<string, number>}
 */
export const sumByBewohner = (posten, scope) => {
  const map = new Map();
  for (const p of posten) {
    if ((p.typ || "ausgabe") === "einnahme") continue;
    if (scope && (p.budget_scope || "haushalt") !== scope) continue;
    const key = p.bewohner_id || "__haushalt__";
    map.set(key, (map.get(key) || 0) + Math.abs(Number(p.betrag)));
  }
  return map;
};
