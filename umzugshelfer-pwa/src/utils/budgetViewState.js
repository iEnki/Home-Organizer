const ZEITRAUM_OPTIONEN = new Set(["monat", "jahr", "alle"]);
const SCOPE_OPTIONEN = new Set(["alle", "haushalt", "privat"]);
const SORTIERUNG_OPTIONEN = new Set([
  "datum_desc",
  "datum_asc",
  "betrag_desc",
  "betrag_asc",
  "name",
  "kategorie",
]);
const GRUPPIERUNG_OPTIONEN = new Set([
  "tag",
  "monat",
  "kategorie",
  "person",
  "konto",
  "scope",
  "keine",
]);

export const DEFAULT_BUDGET_VIEW_STATE = Object.freeze({
  suchbegriff: "",
  kategFilter: "",
  bewohnerFilter: "",
  kontoFilter: "",
  scopeFilter: "alle",
  zeitraum: "monat",
  selJahr: null,
  selMonat: null,
  sortierung: "datum_desc",
  gruppierung: "tag",
  nurWiederkehrend: false,
  nurMitRechnung: false,
});

const getTodayDate = (today) => {
  if (today instanceof Date && !Number.isNaN(today.getTime())) return today;
  return new Date();
};

const normalizeString = (value) => String(value ?? "").trim();

const normalizeBoolean = (value) => Boolean(value);

const normalizeYear = (value, today) => {
  const parsed = Number.parseInt(value, 10);
  const fallbackYear = getTodayDate(today).getFullYear();
  if (Number.isNaN(parsed) || parsed < 2000 || parsed > 2100) {
    return fallbackYear;
  }
  return parsed;
};

const normalizeMonth = (value, today) => {
  const parsed = Number.parseInt(value, 10);
  const fallbackMonth = getTodayDate(today).getMonth();
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 11) {
    return fallbackMonth;
  }
  return parsed;
};

const normalizeOption = (value, allowed, fallback) =>
  allowed.has(value) ? value : fallback;

export const sanitizeBudgetViewState = (raw, today = new Date()) => {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    suchbegriff: normalizeString(source.suchbegriff),
    kategFilter: normalizeString(source.kategFilter),
    bewohnerFilter: normalizeString(source.bewohnerFilter),
    kontoFilter: normalizeString(source.kontoFilter),
    scopeFilter: normalizeOption(
      normalizeString(source.scopeFilter),
      SCOPE_OPTIONEN,
      DEFAULT_BUDGET_VIEW_STATE.scopeFilter,
    ),
    zeitraum: normalizeOption(
      normalizeString(source.zeitraum),
      ZEITRAUM_OPTIONEN,
      DEFAULT_BUDGET_VIEW_STATE.zeitraum,
    ),
    selJahr: normalizeYear(source.selJahr, today),
    selMonat: normalizeMonth(source.selMonat, today),
    sortierung: normalizeOption(
      normalizeString(source.sortierung),
      SORTIERUNG_OPTIONEN,
      DEFAULT_BUDGET_VIEW_STATE.sortierung,
    ),
    gruppierung: normalizeOption(
      normalizeString(source.gruppierung),
      GRUPPIERUNG_OPTIONEN,
      DEFAULT_BUDGET_VIEW_STATE.gruppierung,
    ),
    nurWiederkehrend: normalizeBoolean(source.nurWiederkehrend),
    nurMitRechnung: normalizeBoolean(source.nurMitRechnung),
  };
};

export const serializeBudgetViewState = (state, today = new Date()) =>
  sanitizeBudgetViewState(state, today);

export const applyBudgetViewState = (saved, setters, today = new Date()) => {
  const next = sanitizeBudgetViewState(saved, today);
  if (!setters || typeof setters !== "object") return next;

  setters.setSuchbegriff?.(next.suchbegriff);
  setters.setKategFilter?.(next.kategFilter);
  setters.setBewohnerFilter?.(next.bewohnerFilter);
  setters.setKontoFilter?.(next.kontoFilter);
  setters.setScopeFilter?.(next.scopeFilter);
  setters.setZeitraum?.(next.zeitraum);
  setters.setSelJahr?.(next.selJahr);
  setters.setSelMonat?.(next.selMonat);
  setters.setSortierung?.(next.sortierung);
  setters.setGruppierung?.(next.gruppierung);
  setters.setNurWiederkehrend?.(next.nurWiederkehrend);
  setters.setNurMitRechnung?.(next.nurMitRechnung);

  return next;
};

export const isBudgetViewStateEqual = (a, b, today = new Date()) =>
  JSON.stringify(sanitizeBudgetViewState(a, today)) ===
  JSON.stringify(sanitizeBudgetViewState(b, today));
