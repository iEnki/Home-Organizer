import { supabase } from "../supabaseClient";

const FUEL_TERMS = [
  "adblue", "avia", "autogas", "benzin", "diesel", "e5", "e10", "eni", "esso",
  "eurosuper", "jet tank", "kraftstoff", "lpg", "omv", "premium", "shell", "socar",
  "super 95", "super95", "tank", "treibstoff",
];

const normalizeText = (value) => String(value || "")
  .toLocaleLowerCase("de-AT")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function isFuelText(value) {
  const normalized = normalizeText(value);
  return Boolean(normalized) && FUEL_TERMS.some((term) => normalized.includes(term));
}

export function isFuelBudgetCandidate({ budget, invoice, positions = [] }) {
  const categoryMatch = ["tanken", "fuel", "kraftstoff"].includes(normalizeText(budget?.kategorie));
  const positionMatch = positions.some((position) => isFuelText(position.beschreibung));
  const merchantMatch = isFuelText(invoice?.lieferant_name);
  return {
    matches: categoryMatch || positionMatch || merchantMatch,
    reason: categoryMatch ? "budget_category" : positionMatch ? "invoice_position" : merchantMatch ? "fuel_merchant" : null,
    confidence: categoryMatch && (positionMatch || merchantMatch) ? 0.98 : categoryMatch ? 0.9 : positionMatch ? 0.86 : merchantMatch ? 0.72 : 0,
  };
}

export function normalizeFuelCandidate({ budget, invoice = null, positions = [], documentId = null }) {
  const detection = isFuelBudgetCandidate({ budget, invoice, positions });
  if (!detection.matches) return null;

  const fuelPositions = positions.filter((position) => isFuelText(position.beschreibung));
  const litrePositions = fuelPositions.filter((position) => {
    const unit = normalizeText(position.einheit);
    return unit === "l" || unit.startsWith("liter") || unit.startsWith("litre");
  });
  const liters = litrePositions.reduce((sum, position) => sum + (numberOrNull(position.menge) || 0), 0) || null;
  const positionTotal = fuelPositions.reduce((sum, position) => sum + (numberOrNull(position.gesamtpreis) || 0), 0) || null;
  const amount = numberOrNull(budget?.betrag) ?? numberOrNull(invoice?.brutto) ?? positionTotal ?? 0;
  const explicitUnitPrice = litrePositions
    .map((position) => numberOrNull(position.einzelpreis))
    .find((value) => value != null);
  const pricePerLiter = explicitUnitPrice ?? (liters ? amount / liters : null);
  const fuelDescription = fuelPositions.map((position) => position.beschreibung).join(" ");
  const fuelType = [
    ["Diesel", /diesel/i],
    ["Super E10", /e10/i],
    ["Super E5", /\be5\b|super\s*95|eurosuper/i],
    ["LPG", /lpg|autogas/i],
    ["AdBlue", /adblue/i],
  ].find(([, pattern]) => pattern.test(fuelDescription))?.[0] || null;

  return {
    budget_posten_id: budget.id,
    rechnung_id: invoice?.id || null,
    dokument_id: documentId || invoice?.dokument_id || null,
    erkennungsgrund: detection.reason,
    confidence: detection.confidence,
    snapshot: {
      datum: budget.datum || invoice?.rechnungsdatum || null,
      betrag: amount,
      tankstelle: invoice?.lieferant_name || budget.beschreibung || null,
      liter: liters,
      preis_pro_liter: pricePerLiter,
      kraftstoffart: fuelType,
      beschreibung: budget.beschreibung || null,
      kategorie: budget.kategorie || null,
      source_updated_at: budget.updated_at || null,
    },
  };
}

export function reconcileFuelImportState({ current = null, existingFuel = null }) {
  const orphaned = current?.status === "imported" && !existingFuel;
  if (existingFuel) return { status: "imported", orphaned: false };
  if (current?.status === "ignored") return { status: "ignored", orphaned: false };
  return { status: "pending", orphaned };
}

const errorMessage = (error) => error?.message || String(error || "Unbekannter Fehler");
const POSITION_BATCH_SIZE = 25;
const definedValues = (value) => Object.fromEntries(
  Object.entries(value || {}).filter(([, entry]) => entry !== null && entry !== undefined),
);

export function getLinkedFuelInvoiceIds({ budgets = [], links = [], invoices = [] }) {
  const budgetIds = new Set(budgets.map((budget) => budget.id));
  const linkedDocumentIds = new Set(links
    .filter((link) => budgetIds.has(link.entity_id))
    .map((link) => link.dokument_id)
    .filter(Boolean));
  return [...new Set(invoices
    .filter((invoice) => linkedDocumentIds.has(invoice.dokument_id))
    .map((invoice) => invoice.id)
    .filter(Boolean))];
}

async function loadFuelInvoicePositions({ householdId, invoiceIds, report }) {
  const positions = [];
  for (let offset = 0; offset < invoiceIds.length; offset += POSITION_BATCH_SIZE) {
    const batch = invoiceIds.slice(offset, offset + POSITION_BATCH_SIZE);
    const { data, error } = await supabase
      .from("rechnungs_positionen")
      .select("rechnung_id, beschreibung, menge, einheit, einzelpreis, gesamtpreis, klassifikation")
      .eq("household_id", householdId)
      .in("rechnung_id", batch);
    if (error) {
      report.errors.push({
        stage: "invoice_positions",
        message: errorMessage(error),
        invoiceIds: batch,
      });
      continue;
    }
    positions.push(...(data || []));
  }
  return positions;
}

export function buildFuelEntryPayload(importRow, vehicleId, userId) {
  const snapshot = importRow.quell_snapshot || {};
  return {
    household_id: importRow.household_id,
    fahrzeug_id: vehicleId,
    created_by_user_id: userId,
    datum: snapshot.datum || new Date().toISOString().slice(0, 10),
    betrag: numberOrNull(snapshot.betrag) || 0,
    tankstelle: snapshot.tankstelle || snapshot.beschreibung || null,
    liter: numberOrNull(snapshot.liter),
    preis_pro_liter: numberOrNull(snapshot.preis_pro_liter),
    kraftstoffart: snapshot.kraftstoffart || null,
    vollgetankt: false,
    tankstatus: "unbekannt",
    tankstatus_quelle: "import",
    verbrauch_bestaetigt: false,
    quelle: "budget",
    budget_posten_id: importRow.budget_posten_id,
    rechnung_id: importRow.rechnung_id || null,
    dokument_id: importRow.dokument_id || null,
    notizen: "Automatisch aus Budget erkannt. Kilometerstand und Volltankstatus bitte bestätigen.",
  };
}

async function createFuelEntryFromImport(importRow, vehicleId, userId) {
  const snapshot = importRow.quell_snapshot || {};
  const payload = buildFuelEntryPayload(importRow, vehicleId, userId);
  const { data: existing, error: existingError } = await supabase
    .from("home_fahrzeug_tankvorgaenge")
    .select("id")
    .eq("household_id", importRow.household_id)
    .eq("budget_posten_id", importRow.budget_posten_id)
    .maybeSingle();
  if (existingError) throw existingError;

  let fuelEntry = existing;
  let created = false;
  if (!fuelEntry && importRow.rechnung_id) {
    const { data: invoiceEntry, error: invoiceEntryError } = await supabase
      .from("home_fahrzeug_tankvorgaenge")
      .select("id")
      .eq("household_id", importRow.household_id)
      .eq("rechnung_id", importRow.rechnung_id)
      .maybeSingle();
    if (invoiceEntryError) throw invoiceEntryError;
    fuelEntry = invoiceEntry;
  }
  if (!fuelEntry) {
    const { data, error } = await supabase
      .from("home_fahrzeug_tankvorgaenge")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    fuelEntry = data;
    created = true;
  }

  const nextSnapshot = { ...snapshot, manual_review_required: false };
  const { data: updatedImport, error: updateError } = await supabase
    .from("home_fahrzeug_tank_importe")
    .update({
      fahrzeug_id: vehicleId,
      tankvorgang_id: fuelEntry.id,
      status: "imported",
      resolved_at: new Date().toISOString(),
      quell_snapshot: nextSnapshot,
    })
    .eq("id", importRow.id)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return { importRow: updatedImport, created };
}

export async function resolveFuelImport({ importRow, vehicleId, userId }) {
  if (!importRow?.id || !vehicleId) throw new Error("Tankimport und Fahrzeug sind erforderlich.");
  const result = await createFuelEntryFromImport(importRow, vehicleId, userId);
  return result.importRow;
}

export async function ignoreFuelImport(importId) {
  const { error } = await supabase
    .from("home_fahrzeug_tank_importe")
    .update({ status: "ignored", resolved_at: new Date().toISOString() })
    .eq("id", importId);
  if (error) throw error;
}

export async function reactivateFuelImport(importRow) {
  if (!importRow?.id) throw new Error("Tankimport ist erforderlich.");
  const { data, error } = await supabase
    .from("home_fahrzeug_tank_importe")
    .update({
      status: "pending",
      fahrzeug_id: null,
      tankvorgang_id: null,
      resolved_at: null,
      quell_snapshot: {
        ...(importRow.quell_snapshot || {}),
        manual_review_required: true,
      },
    })
    .eq("id", importRow.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function resetFuelImportAfterTankDeletion(importRow, { ignore = false } = {}) {
  if (!importRow?.id) return null;
  const { data, error } = await supabase
    .from("home_fahrzeug_tank_importe")
    .update({
      status: ignore ? "ignored" : "pending",
      fahrzeug_id: null,
      tankvorgang_id: null,
      resolved_at: ignore ? new Date().toISOString() : null,
      quell_snapshot: {
        ...(importRow.quell_snapshot || {}),
        manual_review_required: !ignore,
      },
    })
    .eq("id", importRow.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function syncFuelImports({ householdId, userId, includeInvoicePositions = false }) {
  const report = {
    detected: 0,
    newlyImported: 0,
    pending: 0,
    existing: 0,
    ignored: 0,
    repaired: 0,
    archived: 0,
    foreignHousehold: 0,
    errors: [],
  };
  if (!householdId || !userId) return { pending: [], imported: [], ignored: [], report };

  const [
    budgetsResponse,
    vehiclesResponse,
    importsResponse,
    linksResponse,
    invoicesResponse,
    fuelEntriesResponse,
  ] = await Promise.all([
    supabase.from("budget_posten").select("id, household_id, beschreibung, betrag, datum, kategorie, archived_at, updated_at").eq("household_id", householdId),
    supabase.from("home_fahrzeuge").select("id, status").eq("household_id", householdId).eq("status", "aktiv"),
    supabase.from("home_fahrzeug_tank_importe").select("*").eq("household_id", householdId),
    supabase.from("dokument_links").select("dokument_id, entity_id, entity_type").eq("household_id", householdId).eq("entity_type", "budget_posten"),
    supabase.from("rechnungen").select("id, dokument_id, lieferant_name, rechnungsdatum, brutto").eq("household_id", householdId),
    supabase.from("home_fahrzeug_tankvorgaenge").select("id, budget_posten_id, rechnung_id, fahrzeug_id").eq("household_id", householdId),
  ]);
  const responseError = [
    budgetsResponse, vehiclesResponse, importsResponse, linksResponse, invoicesResponse, fuelEntriesResponse,
  ].find((response) => response.error)?.error;
  if (responseError) throw responseError;

  const allBudgets = budgetsResponse.data || [];
  const budgets = allBudgets.filter((budget) => !budget.archived_at);
  report.archived = allBudgets.filter((budget) => (
    budget.archived_at && isFuelBudgetCandidate({ budget }).matches
  )).length;
  const vehicles = vehiclesResponse.data || [];
  const currentImports = importsResponse.data || [];
  const links = linksResponse.data || [];
  const invoices = invoicesResponse.data || [];
  const fuelEntries = fuelEntriesResponse.data || [];
  const documentByBudget = new Map(links.map((link) => [link.entity_id, link.dokument_id]));
  const invoiceByDocument = new Map(invoices.map((invoice) => [invoice.dokument_id, invoice]));

  try {
    const { data: foreignBudgets, error: foreignBudgetError } = await supabase
      .from("budget_posten")
      .select("id, household_id, kategorie, beschreibung, archived_at")
      .neq("household_id", householdId)
      .is("archived_at", null);
    if (foreignBudgetError) throw foreignBudgetError;
    report.foreignHousehold = (foreignBudgets || []).filter((budget) => (
      isFuelBudgetCandidate({ budget }).matches || isFuelText(budget.beschreibung)
    )).length;
  } catch (foreignBudgetError) {
    console.warn("Haushaltsfremde Budgetposten konnten nicht geprüft werden:", foreignBudgetError);
  }

  let positions = [];
  if (includeInvoicePositions) {
    const linkedInvoiceIds = getLinkedFuelInvoiceIds({ budgets, links, invoices });
    if (linkedInvoiceIds.length) {
      positions = await loadFuelInvoicePositions({
        householdId,
        invoiceIds: linkedInvoiceIds,
        report,
      });
    }
  }

  const positionsByInvoice = new Map();
  positions.forEach((position) => {
    const rows = positionsByInvoice.get(position.rechnung_id) || [];
    rows.push(position);
    positionsByInvoice.set(position.rechnung_id, rows);
  });
  const importByBudget = new Map(currentImports.map((row) => [row.budget_posten_id, row]));
  const fuelByBudget = new Map(fuelEntries.filter((row) => row.budget_posten_id).map((row) => [row.budget_posten_id, row]));
  const fuelByInvoice = new Map(fuelEntries.filter((row) => row.rechnung_id).map((row) => [row.rechnung_id, row]));
  const candidates = budgets.map((budget) => {
    const documentId = documentByBudget.get(budget.id) || null;
    const invoice = documentId ? invoiceByDocument.get(documentId) : null;
    return normalizeFuelCandidate({
      budget,
      invoice,
      documentId,
      positions: invoice ? positionsByInvoice.get(invoice.id) || [] : [],
    });
  }).filter(Boolean);
  report.detected = candidates.length;
  const candidateBudgetIds = new Set(candidates.map((candidate) => candidate.budget_posten_id));

  if (includeInvoicePositions) {
    const stalePendingIds = currentImports
      .filter((row) => row.status === "pending" && !candidateBudgetIds.has(row.budget_posten_id))
      .map((row) => row.id);
    if (stalePendingIds.length) {
      const { error } = await supabase.from("home_fahrzeug_tank_importe").delete().in("id", stalePendingIds);
      if (error) report.errors.push({ stage: "cleanup", message: errorMessage(error) });
    }
  }

  const rows = [];
  for (const candidate of candidates) {
    const current = importByBudget.get(candidate.budget_posten_id);
    const existingFuel = fuelByBudget.get(candidate.budget_posten_id)
      || (candidate.rechnung_id ? fuelByInvoice.get(candidate.rechnung_id) : null);
    const { status, orphaned } = reconcileFuelImportState({ current, existingFuel });
    if (orphaned) report.repaired += 1;
    const payload = {
      household_id: householdId,
      budget_posten_id: candidate.budget_posten_id,
      rechnung_id: candidate.rechnung_id,
      dokument_id: candidate.dokument_id,
      erkennungsgrund: candidate.erkennungsgrund,
      confidence: candidate.confidence,
      quell_snapshot: {
        ...(current?.quell_snapshot || {}),
        ...definedValues(candidate.snapshot),
      },
      status,
      fahrzeug_id: existingFuel?.fahrzeug_id || (status === "ignored" ? current?.fahrzeug_id || null : null),
      tankvorgang_id: existingFuel?.id || null,
      resolved_at: status === "imported"
        ? current?.resolved_at || new Date().toISOString()
        : status === "ignored"
          ? current?.resolved_at || new Date().toISOString()
          : null,
    };
    try {
      const { data, error } = await supabase
        .from("home_fahrzeug_tank_importe")
        .upsert(payload, { onConflict: "household_id,budget_posten_id" })
        .select("*")
        .single();
      if (error) throw error;
      rows.push(data);
      if (existingFuel) report.existing += 1;
    } catch (candidateError) {
      report.errors.push({
        budgetPostenId: candidate.budget_posten_id,
        description: candidate.snapshot.tankstelle || candidate.snapshot.beschreibung,
        stage: "candidate",
        message: errorMessage(candidateError),
      });
    }
  }

  if (vehicles.length === 1) {
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].status === "pending" && !rows[index].quell_snapshot?.manual_review_required) {
        try {
          const result = await createFuelEntryFromImport(rows[index], vehicles[0].id, userId);
          rows[index] = result.importRow;
          if (result.created) report.newlyImported += 1;
          else report.existing += 1;
        } catch (candidateError) {
          report.errors.push({
            budgetPostenId: rows[index].budget_posten_id,
            description: rows[index].quell_snapshot?.tankstelle || rows[index].quell_snapshot?.beschreibung,
            stage: "import",
            message: errorMessage(candidateError),
          });
        }
      }
    }
  }

  report.pending = rows.filter((row) => row.status === "pending").length;
  report.ignored = rows.filter((row) => row.status === "ignored").length;
  return {
    pending: rows.filter((row) => row.status === "pending"),
    imported: rows.filter((row) => row.status === "imported"),
    ignored: rows.filter((row) => row.status === "ignored"),
    report,
  };
}
