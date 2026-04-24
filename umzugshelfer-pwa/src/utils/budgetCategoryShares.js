import { normalizeHomeBudgetCategory } from "./homeBudgetCategories";

const normalizeMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
};

const getPositionAmount = (position) => {
  const gesamtpreis = normalizeMoney(position?.gesamtpreis);
  if (gesamtpreis > 0) return gesamtpreis;

  const einzelpreis = normalizeMoney(position?.einzelpreis);
  const menge = Number(position?.menge);
  if (einzelpreis > 0 && Number.isFinite(menge) && menge > 0) {
    return einzelpreis * menge;
  }

  return 0;
};

const scaleShares = (shares, targetAmount) => {
  const total = shares.reduce((sum, share) => sum + normalizeMoney(share?.amount), 0);
  if (total <= 0 || targetAmount <= 0) return [];

  return shares
    .map((share) => ({
      category: share.category,
      amount: (normalizeMoney(share.amount) / total) * targetAmount,
    }))
    .filter((share) => share.amount > 0);
};

const mergeShares = (shares) => {
  const totals = new Map();

  shares.forEach((share) => {
    const category = normalizeHomeBudgetCategory(share?.category, null, { preserveUnknown: true });
    const amount = normalizeMoney(share?.amount);
    if (!category || amount <= 0) return;
    totals.set(category, (totals.get(category) || 0) + amount);
  });

  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .filter((share) => share.amount > 0)
    .sort((left, right) => left.category.localeCompare(right.category, "de-DE"));
};

const getSharesAmount = (shares = []) =>
  shares.reduce((sum, share) => sum + normalizeMoney(share?.amount), 0);

const buildInvoiceShares = ({
  invoice,
  fallbackCategory,
  positions = [],
  linkedBudgetEntryCount,
}) => {
  const invoiceAmount = normalizeMoney(invoice?.brutto);
  const allowPositionSplit = linkedBudgetEntryCount === 1;

  if (!allowPositionSplit) {
    return {
      shares: invoiceAmount > 0 ? [{ category: fallbackCategory, amount: invoiceAmount }] : [],
      referenceAmount: invoiceAmount,
      unresolved: invoiceAmount <= 0,
    };
  }

  const rawPositionShares = positions
    .map((position) => {
      const amount = getPositionAmount(position);
      if (amount <= 0) return null;

      const overrideCategory = normalizeHomeBudgetCategory(
        position?.klassifikation?.budget_kategorie,
        null,
        { preserveUnknown: true },
      );

      return {
        category: overrideCategory || fallbackCategory,
        amount,
      };
    })
    .filter(Boolean);

  const mergedPositionShares = mergeShares(rawPositionShares);
  const positionAmount = getSharesAmount(mergedPositionShares);
  if (mergedPositionShares.length === 0) {
    return {
      shares: invoiceAmount > 0 ? [{ category: fallbackCategory, amount: invoiceAmount }] : [],
      referenceAmount: invoiceAmount,
      unresolved: invoiceAmount <= 0,
    };
  }

  if (invoiceAmount > 0) {
    return {
      shares: scaleShares(mergedPositionShares, invoiceAmount),
      referenceAmount: invoiceAmount,
      unresolved: false,
    };
  }

  return {
    shares: mergedPositionShares,
    referenceAmount: positionAmount,
    unresolved: false,
  };
};

export const buildBudgetEntryCategoryShares = ({
  entry,
  linkedInvoices = [],
  invoicePositionsByRechnungId = {},
  invoiceBudgetEntryCountByRechnungId = {},
}) => {
  const fallbackCategory = normalizeHomeBudgetCategory(entry?.kategorie, "Sonstiges", {
    preserveUnknown: true,
  });
  const entryAmount = normalizeMoney(entry?.betrag);

  if ((entry?.typ || "ausgabe") === "einnahme" || entryAmount <= 0) {
    return [];
  }

  const validInvoices = (linkedInvoices || []).filter((invoice) => Boolean(invoice?.rechnung_id));
  if (validInvoices.length === 0) {
    return [{ category: fallbackCategory, amount: entryAmount }];
  }

  const invoiceResults = validInvoices.map((invoice) =>
    buildInvoiceShares({
      invoice,
      fallbackCategory,
      positions: invoicePositionsByRechnungId[invoice.rechnung_id] || [],
      linkedBudgetEntryCount: invoiceBudgetEntryCountByRechnungId[invoice.rechnung_id] || 0,
    }),
  );

  const aggregatedShares = mergeShares(invoiceResults.flatMap((result) => result.shares));
  const knownReferenceAmount = invoiceResults.reduce(
    (sum, result) => sum + normalizeMoney(result.referenceAmount),
    0,
  );

  if (aggregatedShares.length === 0 || knownReferenceAmount <= 0) {
    return [{ category: fallbackCategory, amount: entryAmount }];
  }

  const resolvedAmount = Math.min(entryAmount, knownReferenceAmount);
  const scaledResolvedShares = scaleShares(aggregatedShares, resolvedAmount);
  const unresolvedAmount = Math.max(entryAmount - resolvedAmount, 0);

  if (unresolvedAmount <= 0) {
    return scaledResolvedShares;
  }

  return mergeShares([
    ...scaledResolvedShares,
    { category: fallbackCategory, amount: unresolvedAmount },
  ]);
};

export const getCategoryShareAmount = (shares = [], category) =>
  shares.find((share) => share.category === category)?.amount || 0;
