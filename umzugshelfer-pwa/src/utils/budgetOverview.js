import { calcNaechstesDatum } from "./budgetRecurring";

const MONTH_FORMATTER_SHORT = new Intl.DateTimeFormat("de-AT", {
  month: "short",
  year: "numeric",
});

const DAY_FORMATTER = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const pad = (value) => String(value).padStart(2, "0");

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatMonthKey = (dateStr) => {
  const date = parseLocalDate(dateStr);
  if (!date) return "unbekannt";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const formatMonthLabel = (dateStr) => {
  const date = parseLocalDate(dateStr);
  return date ? MONTH_FORMATTER_SHORT.format(date) : "Unbekannt";
};

const formatTagLabel = (dateStr) => {
  const date = parseLocalDate(dateStr);
  if (!date) return "Unbekannt";
  return DAY_FORMATTER
    .format(date)
    .replace(".", ".")
    .replace(/\s/g, " ");
};

const formatDisplayDate = (dateStr) => {
  const date = parseLocalDate(dateStr);
  return date ? DISPLAY_DATE_FORMATTER.format(date) : "Unbekannt";
};

const getProjectedDate = (entry, ctx) => {
  if (
    !ctx?.isFutureMonth ||
    !entry?.wiederholen ||
    !entry?.naechstes_datum ||
    !entry?.intervall
  ) {
    return entry?.datum || null;
  }

  const targetStart = `${ctx.selJahr}-${pad((ctx.selMonat || 0) + 1)}-01`;
  let projected = entry.naechstes_datum;
  let iterations = 0;

  while (projected < targetStart && iterations < 500) {
    projected = calcNaechstesDatum(projected, entry.intervall);
    iterations += 1;
  }

  const projectedDate = parseLocalDate(projected);
  if (!projectedDate) return entry?.datum || null;

  if (
    projectedDate.getFullYear() === ctx.selJahr &&
    projectedDate.getMonth() === ctx.selMonat &&
    (!entry?.ende_datum || projected <= entry.ende_datum)
  ) {
    return projected;
  }

  return entry?.datum || null;
};

const getScopeLabel = (scope) => (scope === "privat" ? "Privat" : "Haushalt");

const getScopeColorClass = (scope) =>
  scope === "privat"
    ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30"
    : "bg-primary-500/10 text-primary-500 border-primary-500/20";

export const getBudgetEntryMeta = (entry, ctx = {}) => {
  const bewohner = ctx.bewohnerById?.[entry?.bewohner_id] || null;
  const konto = ctx.kontoById?.[entry?.zahlungskonto_id] || null;
  const verknuepfteRechnungen = ctx.budgetRechnungMap?.[entry?.id] || [];
  const scope = entry?.budget_scope || "haushalt";
  const anzeigeDatum = getProjectedDate(entry, ctx);
  const datumIstProjiziert =
    Boolean(entry?.wiederholen) &&
    Boolean(anzeigeDatum) &&
    Boolean(entry?.datum) &&
    anzeigeDatum !== entry.datum;

  return {
    bewohner,
    konto,
    scopeLabel: getScopeLabel(scope),
    scopeColorClass: getScopeColorClass(scope),
    hatRechnung: verknuepfteRechnungen.length > 0,
    verknuepfteRechnungen,
    istTemplate: Boolean(entry?.wiederholen),
    istOccurrence: Boolean(entry?.ursprung_template_id),
    istRecurring: Boolean(entry?.wiederholen || entry?.ursprung_template_id),
    anzeigeDatum,
    anzeigeDatumLabel: formatDisplayDate(anzeigeDatum),
    sortierDatum: anzeigeDatum || entry?.datum || "",
    gruppenKeyTag: anzeigeDatum || entry?.datum || "unbekannt",
    gruppenKeyMonat: formatMonthKey(anzeigeDatum || entry?.datum),
    gruppenLabelTag: formatTagLabel(anzeigeDatum || entry?.datum),
    gruppenLabelMonat: formatMonthLabel(anzeigeDatum || entry?.datum),
    datumIstProjiziert,
  };
};

export const matchBudgetSearch = (entry, query, ctx = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const meta = getBudgetEntryMeta(entry, ctx);
  const haystack = [
    entry?.beschreibung,
    entry?.kategorie,
    meta.bewohner?.name,
    meta.konto?.name,
    meta.scopeLabel,
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizedQuery);
};

export const sortBudgetEntries = (entries, sortierung = "datum_desc", ctx = {}) => {
  const metaById = new Map(entries.map((entry) => [entry.id, getBudgetEntryMeta(entry, ctx)]));
  const sorted = [...entries];

  sorted.sort((left, right) => {
    const leftMeta = metaById.get(left.id);
    const rightMeta = metaById.get(right.id);

    switch (sortierung) {
      case "datum_asc":
        return String(leftMeta?.sortierDatum || "").localeCompare(String(rightMeta?.sortierDatum || ""));
      case "betrag_desc":
        return Math.abs(Number(right?.betrag || 0)) - Math.abs(Number(left?.betrag || 0));
      case "betrag_asc":
        return Math.abs(Number(left?.betrag || 0)) - Math.abs(Number(right?.betrag || 0));
      case "name":
        return String(left?.beschreibung || "").localeCompare(String(right?.beschreibung || ""), "de");
      case "kategorie":
        return String(left?.kategorie || "").localeCompare(String(right?.kategorie || ""), "de");
      case "datum_desc":
      default:
        return String(rightMeta?.sortierDatum || "").localeCompare(String(leftMeta?.sortierDatum || ""));
    }
  });

  return sorted;
};

export const groupBudgetEntries = (entries, gruppierung = "tag", ctx = {}) => {
  if (gruppierung === "keine") {
    return [{ key: "alle", label: "", items: entries }];
  }

  const groups = new Map();

  entries.forEach((entry) => {
    const meta = getBudgetEntryMeta(entry, ctx);
    let key = "unbekannt";
    let label = "Unbekannt";

    switch (gruppierung) {
      case "monat":
        key = meta.gruppenKeyMonat;
        label = meta.gruppenLabelMonat;
        break;
      case "kategorie":
        key = entry?.kategorie || "ohne-kategorie";
        label = entry?.kategorie || "Ohne Kategorie";
        break;
      case "person":
        key = entry?.bewohner_id || "ohne-person";
        label = meta.bewohner?.name || "Ohne Person";
        break;
      case "scope":
        key = entry?.budget_scope || "haushalt";
        label = meta.scopeLabel;
        break;
      case "tag":
      default:
        key = meta.gruppenKeyTag;
        label = meta.gruppenLabelTag;
        break;
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, items: [] });
    }

    groups.get(key).items.push(entry);
  });

  const result = [...groups.values()];

  result.sort((left, right) => {
    if (gruppierung === "tag") {
      return String(right.key).localeCompare(String(left.key));
    }

    if (gruppierung === "monat") {
      return String(right.key).localeCompare(String(left.key));
    }

    return String(left.label).localeCompare(String(right.label), "de");
  });

  return result;
};

export const computeBudgetOverviewKpis = (entries) => {
  const result = {
    haushaltSumme: 0,
    privatSumme: 0,
    anzahl: 0,
  };

  (entries || []).forEach((entry) => {
    if ((entry?.typ || "ausgabe") === "einnahme") return;
    const value = Math.abs(Number(entry?.betrag || 0));
    if ((entry?.budget_scope || "haushalt") === "privat") {
      result.privatSumme += value;
    } else {
      result.haushaltSumme += value;
    }
    result.anzahl += 1;
  });

  return result;
};
