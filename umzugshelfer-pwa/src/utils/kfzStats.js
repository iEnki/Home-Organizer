import { formatKfzDisplayText } from "./kfzPresentation";

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const positiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const isoDate = (value) => String(value || "").slice(0, 10);

const inRange = (date, from, to) => {
  const value = isoDate(date);
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

const toIsoDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const previousPeriod = (from, to) => {
  if (!from) return null;
  const currentFrom = new Date(`${from}T00:00:00`);
  const currentTo = new Date(`${to || toIsoDate(new Date())}T00:00:00`);
  if (Number.isNaN(currentFrom.getTime()) || Number.isNaN(currentTo.getTime()) || currentTo < currentFrom) return null;
  const inclusiveDays = Math.round((currentTo.getTime() - currentFrom.getTime()) / 86400000) + 1;
  const previousTo = new Date(currentFrom);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - inclusiveDays + 1);
  return { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) };
};

const percentageChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const sourceRefs = (row) => [
  row.budgetId ? `budget:${row.budgetId}` : null,
  row.invoiceId ? `invoice:${row.invoiceId}` : null,
  row.documentId && (row.budgetId || row.invoiceId) ? `document:${row.documentId}` : null,
].filter(Boolean);

const deduplicateTransactions = (rows) => {
  const seen = new Set();
  const kept = [];
  rows.forEach((row) => {
    const refs = sourceRefs(row);
    if (refs.some((ref) => seen.has(ref))) return;
    refs.forEach((ref) => seen.add(ref));
    kept.push({ ...row, dedupeKey: refs[0] || `${row.type}:${row.rawId}` });
  });
  return kept;
};

export const normalizeTankStatus = (entry = {}) => {
  if (["voll", "teilweise", "unbekannt"].includes(entry.tankstatus)) {
    return {
      status: entry.tankstatus,
      source: entry.tankstatus_quelle || "manuell",
    };
  }
  if (entry.vollgetankt === true) return { status: "voll", source: "legacy" };
  if (entry.vollgetankt === false) return { status: "teilweise", source: "legacy" };
  return { status: "unbekannt", source: entry.tankstatus_quelle || "legacy" };
};

export const calculateConsumptionSegments = (fuelEntries, vehicleId = null) => {
  const grouped = new Map();
  fuelEntries
    .filter((entry) => (
      (!vehicleId || entry.fahrzeug_id === vehicleId)
      && entry.verbrauch_bestaetigt !== false
      && number(entry.kilometerstand) > 0
      && number(entry.liter) > 0
      && isoDate(entry.datum)
    ))
    .forEach((entry) => {
      const rows = grouped.get(entry.fahrzeug_id) || [];
      rows.push(entry);
      grouped.set(entry.fahrzeug_id, rows);
    });

  const segments = [];
  grouped.forEach((rows, currentVehicleId) => {
    const sorted = [...rows].sort((a, b) => {
      const dateDiff = isoDate(a.datum).localeCompare(isoDate(b.datum));
      return dateDiff || number(a.kilometerstand) - number(b.kilometerstand);
    });
    let anchor = null;
    let partialLiters = 0;
    let partialCost = 0;
    let includedEntryIds = [];
    for (const row of sorted) {
      const tankStatus = normalizeTankStatus(row);
      if (!anchor) {
        if (tankStatus.status === "voll") {
          anchor = { ...row, normalizedTankStatus: tankStatus };
        }
        continue;
      }

      const distance = number(row.kilometerstand) - number(anchor.kilometerstand);
      if (tankStatus.status !== "voll") {
        if (distance < 0) continue;
        partialLiters += number(row.liter);
        partialCost += positiveNumber(row.betrag);
        includedEntryIds.push(row.id);
        continue;
      }
      if (distance <= 0) continue;

      const liters = partialLiters + number(row.liter);
      const cost = partialCost + positiveNumber(row.betrag);
      const consumption = (liters / distance) * 100;
      if (liters > 0 && consumption >= 1 && consumption <= 50) {
        const quality = anchor.normalizedTankStatus?.source === "legacy" || tankStatus.source === "legacy"
          ? "legacy"
          : "verified";
        segments.push({
          vehicleId: currentVehicleId,
          fromDate: anchor.datum,
          toDate: row.datum,
          fromKm: number(anchor.kilometerstand),
          toKm: number(row.kilometerstand),
          distance,
          liters,
          cost,
          consumption,
          costPerKm: cost / distance,
          startEntryId: anchor.id || null,
          endEntryId: row.id || null,
          includedEntryIds: [anchor.id, ...includedEntryIds, row.id].filter(Boolean),
          intermediateEntryIds: includedEntryIds.filter(Boolean),
          quality,
        });
        anchor = { ...row, normalizedTankStatus: tankStatus };
        partialLiters = 0;
        partialCost = 0;
        includedEntryIds = [];
      }
    }
  });
  return segments;
};

export const buildMileageHistory = ({
  mileageEntries = [],
  fuelEntries = [],
  services = [],
  vehicleId = null,
}) => {
  const rows = [
    ...mileageEntries.map((row) => ({
      id: `mileage:${row.id}`,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      mileage: number(row.kilometerstand),
      source: row.quelle || "manuell",
    })),
    ...fuelEntries.map((row) => ({
      id: `fuel:${row.id}`,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      mileage: number(row.kilometerstand),
      source: "fuel",
    })),
    ...services.map((row) => ({
      id: `service:${row.id}`,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      mileage: number(row.kilometerstand),
      source: "service",
    })),
  ].filter((row) => (
    row.vehicleId
    && (!vehicleId || row.vehicleId === vehicleId)
    && isoDate(row.date)
    && row.mileage >= 0
  ));

  const byVehicleDate = new Map();
  rows.forEach((row) => {
    const key = `${row.vehicleId}:${isoDate(row.date)}`;
    const current = byVehicleDate.get(key);
    if (!current || row.mileage > current.mileage) byVehicleDate.set(key, row);
  });
  return [...byVehicleDate.values()].sort((a, b) => (
    a.vehicleId.localeCompare(b.vehicleId)
    || isoDate(a.date).localeCompare(isoDate(b.date))
    || a.mileage - b.mileage
  ));
};

export const calculateMileageDistance = (history, { vehicleId = null, from = "", to = "" } = {}) => {
  const grouped = new Map();
  history.filter((row) => !vehicleId || row.vehicleId === vehicleId).forEach((row) => {
    const rows = grouped.get(row.vehicleId) || [];
    rows.push(row);
    grouped.set(row.vehicleId, rows);
  });

  let total = 0;
  grouped.forEach((rows) => {
    const sorted = [...rows].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)) || a.mileage - b.mileage);
    const beforeOrAtStart = from ? sorted.filter((row) => isoDate(row.date) <= from).at(-1) : sorted[0];
    const inPeriod = sorted.filter((row) => inRange(row.date, from, to));
    const start = beforeOrAtStart || inPeriod[0];
    let lastMileage = start?.mileage;
    let distance = 0;
    inPeriod.forEach((row) => {
      if (lastMileage == null) {
        lastMileage = row.mileage;
        return;
      }
      if (row.mileage >= lastMileage) {
        distance += row.mileage - lastMileage;
        lastMileage = row.mileage;
      }
    });
    total += distance;
  });
  return total;
};

export const normalizeKfzTransactions = ({
  fuelEntries = [],
  services = [],
  expenses = [],
  vehicleId = null,
  from = "",
  to = "",
  category = "",
}) => {
  const filter = (row) => (!vehicleId || row.fahrzeug_id === vehicleId) && inRange(row.datum, from, to);
  const rows = [
    ...fuelEntries.filter(filter).map((row) => ({
      id: `fuel:${row.id}`,
      rawId: row.id,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      category: "Tanken",
      description: row.tankstelle || "Tankung",
      amount: positiveNumber(row.betrag),
      source: row.quelle || "manuell",
      documentId: row.dokument_id || null,
      budgetId: row.budget_posten_id || null,
      invoiceId: row.rechnung_id || null,
      type: "fuel",
    })),
    ...services.filter(filter).map((row) => ({
      id: `service:${row.id}`,
      rawId: row.id,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      category: "Service",
      description: row.beschreibung || row.typ || "Service",
      amount: positiveNumber(row.kosten),
      source: "service",
      documentId: row.dokument_id || null,
      budgetId: row.budget_posten_id || null,
      invoiceId: row.rechnung_id || null,
      type: "service",
    })),
    ...expenses.filter(filter).map((row) => ({
      id: `expense:${row.id}`,
      rawId: row.id,
      vehicleId: row.fahrzeug_id,
      date: row.datum,
      category: row.kategorie || "Sonstiges",
      description: row.beschreibung || row.kategorie || "Ausgabe",
      amount: positiveNumber(row.betrag),
      source: row.budget_posten_id ? "budget" : row.rechnung_id ? "rechnung" : "manuell",
      documentId: row.dokument_id || null,
      budgetId: row.budget_posten_id || null,
      invoiceId: row.rechnung_id || null,
      type: "expense",
    })),
  ];
  return deduplicateTransactions(rows)
    .filter((row) => !category || row.category === category)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

const countCalendarMonths = (from, to, monthly) => {
  if (!from) return Math.max(monthly.length, 1);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to || toIsoDate(new Date())}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return Math.max(monthly.length, 1);
  return ((end.getFullYear() - start.getFullYear()) * 12) + end.getMonth() - start.getMonth() + 1;
};

export const buildKfzStats = ({
  vehicles = [],
  fuelEntries = [],
  services = [],
  expenses = [],
  mileageEntries = [],
  vehicleId = null,
  from = "",
  to = "",
  category = "",
}) => {
  const transactions = normalizeKfzTransactions({ fuelEntries, services, expenses, vehicleId, from, to, category });
  const comparisonRange = previousPeriod(from, to);
  const previousTransactions = comparisonRange
    ? normalizeKfzTransactions({
      fuelEntries,
      services,
      expenses,
      vehicleId,
      from: comparisonRange.from,
      to: comparisonRange.to,
      category,
    })
    : [];
  const allConsumptionSegments = calculateConsumptionSegments(fuelEntries, vehicleId);
  const consumptionSegments = allConsumptionSegments.filter((row) => inRange(row.toDate, from, to));
  const consumptionFuelEntries = fuelEntries.filter((entry) => (
    (!vehicleId || entry.fahrzeug_id === vehicleId)
    && entry.verbrauch_bestaetigt !== false
    && number(entry.kilometerstand) > 0
    && number(entry.liter) > 0
    && isoDate(entry.datum)
  ));
  const fullAnchorCount = consumptionFuelEntries.filter((entry) => normalizeTankStatus(entry).status === "voll").length;
  const consumptionState = consumptionSegments.length
    ? "ready"
    : fullAnchorCount > 0
      ? "waiting_for_full"
      : "no_full_anchor";
  const mileageHistory = buildMileageHistory({ mileageEntries, fuelEntries, services, vehicleId });
  const totalDistance = calculateMileageDistance(mileageHistory, { vehicleId, from, to });
  const consumptionDistance = consumptionSegments.reduce((sum, row) => sum + row.distance, 0);
  const totalLiters = consumptionSegments.reduce((sum, row) => sum + row.liters, 0);
  const totalCost = transactions.reduce((sum, row) => sum + row.amount, 0);
  const previousTotalCost = previousTransactions.reduce((sum, row) => sum + row.amount, 0);
  const monthlyMap = new Map();
  const categoryMap = new Map();
  transactions.forEach((row) => {
    const month = String(row.date || "").slice(0, 7) || "ohne Datum";
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + row.amount);
    categoryMap.set(row.category, (categoryMap.get(row.category) || 0) + row.amount);
  });
  const visibleVehicles = vehicleId ? vehicles.filter((vehicle) => vehicle.id === vehicleId) : vehicles;
  const byVehicle = visibleVehicles.map((vehicle) => {
    const vehicleRows = transactions.filter((row) => row.vehicleId === vehicle.id);
    const vehicleSegments = consumptionSegments.filter((row) => row.vehicleId === vehicle.id);
    const cost = vehicleRows.reduce((sum, row) => sum + row.amount, 0);
    const distance = calculateMileageDistance(mileageHistory, { vehicleId: vehicle.id, from, to });
    const consumptionKm = vehicleSegments.reduce((sum, row) => sum + row.distance, 0);
    const liters = vehicleSegments.reduce((sum, row) => sum + row.liters, 0);
    return {
      vehicleId: vehicle.id,
      label: [vehicle.name, vehicle.kennzeichen].filter(Boolean).join(" - "),
      cost,
      distance,
      costPerKm: distance > 0 ? cost / distance : null,
      consumption: consumptionKm > 0 ? (liters / consumptionKm) * 100 : null,
    };
  });
  const categories = [...categoryMap.entries()].sort((left, right) => right[1] - left[1]);
  const categoryShares = categories.map(([label, value]) => ({
    label,
    value,
    share: totalCost > 0 ? value / totalCost : 0,
  }));
  const vehicleRanking = [...byVehicle]
    .sort((left, right) => right.cost - left.cost)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const monthly = [...monthlyMap.entries()].sort(([left], [right]) => left.localeCompare(right));
  const latestMonth = monthly.at(-1)?.[1] || 0;
  const previousMonth = monthly.at(-2)?.[1] || 0;
  const monthCount = countCalendarMonths(from, to, monthly);
  return {
    transactions,
    consumptionSegments,
    consumptionState,
    fullAnchorCount,
    mileageHistory,
    totalCost,
    totalDistance,
    consumptionDistance,
    averageConsumption: consumptionDistance > 0 ? (totalLiters / consumptionDistance) * 100 : null,
    costPerKm: totalDistance > 0 ? totalCost / totalDistance : null,
    averageMonthlyCost: monthCount > 0 ? totalCost / monthCount : 0,
    monthCount,
    monthly,
    categories,
    categoryShares,
    byVehicle,
    vehicleRanking,
    comparison: {
      range: comparisonRange,
      previousTotalCost,
      totalCostChange: comparisonRange ? percentageChange(totalCost, previousTotalCost) : null,
      latestMonth,
      previousMonth,
      monthlyChange: monthly.length > 1 ? percentageChange(latestMonth, previousMonth) : null,
    },
  };
};

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;

export const buildKfzCsv = (transactions, vehicleById = {}) => {
  const header = ["Datum", "Fahrzeug", "Kategorie", "Beschreibung", "Betrag", "Quelle"];
  const rows = transactions.map((row) => [
    row.date,
    vehicleById[row.vehicleId]?.name || "",
    formatKfzDisplayText(row.category),
    formatKfzDisplayText(row.description),
    row.amount.toFixed(2).replace(".", ","),
    row.source,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\r\n")}`;
};
