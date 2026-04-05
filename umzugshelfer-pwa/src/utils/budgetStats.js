const parseDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const filterBudgetScope = (entry, scopeFilter) =>
  scopeFilter === "alle" || (entry?.budget_scope || "haushalt") === scopeFilter;

const isExpense = (entry) => (entry?.typ || "ausgabe") !== "einnahme";

const makeCategoryTotals = ({ entries, kategorien }) =>
  kategorien
    .map((name) => ({
      name,
      summe: entries
        .filter((entry) => entry.kategorie === name)
        .reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0),
    }))
    .filter((entry) => entry.summe > 0);

const makeAccountTotals = ({ entries, kontenById = {} }) => {
  const totals = new Map();

  entries.forEach((entry) => {
    if (!entry?.zahlungskonto_id) return;
    const konto = kontenById?.[entry.zahlungskonto_id];
    if (!konto) return;

    const current = totals.get(konto.id) || {
      id: konto.id,
      name: konto.name,
      farbe: konto.farbe || "#10B981",
      summe: 0,
    };
    current.summe += Math.abs(Number(entry.betrag || 0));
    totals.set(konto.id, current);
  });

  return [...totals.values()].sort((left, right) => right.summe - left.summe);
};

export const buildYearStatsData = ({
  posten,
  selJahr,
  scopeFilter,
  kategorien,
  kategoriefarben,
  monate,
  kontenById = {},
}) => {
  const yearEntries = (posten || []).filter((entry) => {
    if (!isExpense(entry) || !filterBudgetScope(entry, scopeFilter) || !entry?.datum) return false;
    const date = parseDate(entry.datum);
    return date?.getFullYear() === selJahr;
  });

  const categoryTotals = makeCategoryTotals({ entries: yearEntries, kategorien });
  const accountTotals = makeAccountTotals({ entries: yearEntries, kontenById });
  const total = yearEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0);
  const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) => {
    const summe = yearEntries
      .filter((entry) => parseDate(entry.datum)?.getMonth() === monthIndex)
      .reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0);
    return { monthIndex, summe };
  });

  let cumulative = 0;
  const cumulativeTotals = monthlyTotals.map((entry) => {
    cumulative += entry.summe;
    return cumulative;
  });

  return {
    total,
    aktiveKategorien: categoryTotals.length,
    durchschnittProMonat: total / 12,
    hasData: yearEntries.length > 0,
    categoryTotals,
    accountTotals,
    doughnutData: {
      labels: categoryTotals.map((entry) => entry.name),
      datasets: [{
        data: categoryTotals.map((entry) => entry.summe),
        backgroundColor: categoryTotals.map((entry) => `${kategoriefarben[entry.name]}CC`),
        borderColor: categoryTotals.map((entry) => kategoriefarben[entry.name]),
        borderWidth: 1,
      }],
    },
    barData: {
      labels: monate,
      datasets: [{
        label: "Ausgaben",
        data: monthlyTotals.map((entry) => entry.summe),
        backgroundColor: "rgba(239,68,68,0.7)",
        borderColor: "rgba(239,68,68,1)",
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    lineData: {
      labels: monate,
      datasets: [{
        label: "Kumulierte Ausgaben",
        data: cumulativeTotals,
        borderColor: "rgba(239,68,68,1)",
        backgroundColor: "rgba(239,68,68,0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      }],
    },
    accountDoughnutData: {
      labels: accountTotals.map((entry) => entry.name),
      datasets: [{
        data: accountTotals.map((entry) => entry.summe),
        backgroundColor: accountTotals.map((entry) => `${entry.farbe}CC`),
        borderColor: accountTotals.map((entry) => entry.farbe),
        borderWidth: 1,
      }],
    },
    accountBarData: {
      labels: accountTotals.map((entry) => entry.name),
      datasets: [{
        label: "Ausgaben",
        data: accountTotals.map((entry) => entry.summe),
        backgroundColor: accountTotals.map((entry) => `${entry.farbe}CC`),
        borderColor: accountTotals.map((entry) => entry.farbe),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
  };
};

export const buildMonthStatsData = ({
  posten,
  selJahr,
  selMonat,
  scopeFilter,
  kategorien,
  kategoriefarben,
  kontenById = {},
}) => {
  const monthEntries = (posten || []).filter((entry) => {
    if (!isExpense(entry) || !filterBudgetScope(entry, scopeFilter) || !entry?.datum) return false;
    const date = parseDate(entry.datum);
    return date?.getFullYear() === selJahr && date?.getMonth() === selMonat;
  });

  const categoryTotals = makeCategoryTotals({ entries: monthEntries, kategorien }).sort((a, b) => b.summe - a.summe);
  const accountTotals = makeAccountTotals({ entries: monthEntries, kontenById });
  const total = monthEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0);
  const groessteKategorie = categoryTotals[0] || null;

  return {
    total,
    aktiveKategorien: categoryTotals.length,
    groessteKategorie,
    hasData: monthEntries.length > 0,
    categoryTotals,
    accountTotals,
    doughnutData: {
      labels: categoryTotals.map((entry) => entry.name),
      datasets: [{
        data: categoryTotals.map((entry) => entry.summe),
        backgroundColor: categoryTotals.map((entry) => `${kategoriefarben[entry.name]}CC`),
        borderColor: categoryTotals.map((entry) => kategoriefarben[entry.name]),
        borderWidth: 1,
      }],
    },
    barData: {
      labels: categoryTotals.map((entry) => entry.name),
      datasets: [{
        label: "Ausgaben",
        data: categoryTotals.map((entry) => entry.summe),
        backgroundColor: categoryTotals.map((entry) => `${kategoriefarben[entry.name]}CC`),
        borderColor: categoryTotals.map((entry) => kategoriefarben[entry.name]),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    accountDoughnutData: {
      labels: accountTotals.map((entry) => entry.name),
      datasets: [{
        data: accountTotals.map((entry) => entry.summe),
        backgroundColor: accountTotals.map((entry) => `${entry.farbe}CC`),
        borderColor: accountTotals.map((entry) => entry.farbe),
        borderWidth: 1,
      }],
    },
    accountBarData: {
      labels: accountTotals.map((entry) => entry.name),
      datasets: [{
        label: "Ausgaben",
        data: accountTotals.map((entry) => entry.summe),
        backgroundColor: accountTotals.map((entry) => `${entry.farbe}CC`),
        borderColor: accountTotals.map((entry) => entry.farbe),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
  };
};

export const buildCashflowPreview = ({
  posten,
  scopeFilter,
  fromDateIso,
  days = 30,
}) => {
  const startDate = parseDate(fromDateIso);
  const upperDate = startDate
    ? new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const upperIso = [
    upperDate.getFullYear(),
    String(upperDate.getMonth() + 1).padStart(2, "0"),
    String(upperDate.getDate()).padStart(2, "0"),
  ].join("-");

  const items = (posten || [])
    .filter((entry) =>
      entry?.wiederholen &&
      entry?.naechstes_datum &&
      entry.naechstes_datum <= upperIso &&
      filterBudgetScope(entry, scopeFilter))
    .sort((left, right) => left.naechstes_datum.localeCompare(right.naechstes_datum));

  return {
    items,
    count: items.length,
    total: items.reduce((sum, entry) => sum + Math.abs(Number(entry.betrag || 0)), 0),
  };
};
