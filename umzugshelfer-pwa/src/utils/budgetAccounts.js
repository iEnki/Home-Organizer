const normalizeText = (value) => String(value || "").trim().toLowerCase();

const isExpense = (entry) => (entry?.typ || "ausgabe") !== "einnahme";

const getActiveAccounts = (konten = []) =>
  (konten || []).filter((konto) => konto && konto.aktiv !== false);

const getNonSavingsAccounts = (konten = []) =>
  getActiveAccounts(konten).filter((konto) => konto.konto_typ !== "sparkonto");

export const getBudgetAccountMeta = (entry, kontenById = {}, bewohnerById = {}) => {
  const konto = kontenById?.[entry?.zahlungskonto_id] || null;
  const inhaber =
    konto?.inhaber_bewohner_id ? bewohnerById?.[konto.inhaber_bewohner_id] || null : null;

  return {
    konto,
    kontoName: konto?.name || null,
    kontoTyp: konto?.konto_typ || null,
    inhaber,
    inhaberName: inhaber?.name || (konto?.inhaber_typ === "household" ? "Haushalt" : null),
    isHouseholdAccount:
      Boolean(konto) &&
      (konto.inhaber_typ === "household" || konto.konto_typ === "haushaltskonto"),
    isPrivateAccount:
      Boolean(konto) &&
      (konto.inhaber_typ === "bewohner" || konto.konto_typ === "privatkonto"),
  };
};

export const selectDefaultKontoForEntry = ({
  budgetScope = "haushalt",
  bewohnerId = "",
  konten = [],
}) => {
  const active = getActiveAccounts(konten);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];

  const candidates = getNonSavingsAccounts(konten);
  if (candidates.length === 0) return null;

  if (budgetScope === "haushalt") {
    return (
      candidates.find((konto) => konto.konto_typ === "haushaltskonto") ||
      candidates.find((konto) => konto.inhaber_typ === "household") ||
      candidates[0]
    );
  }

  if (budgetScope === "privat") {
    if (bewohnerId) {
      const byOwner =
        candidates.find((konto) => konto.inhaber_bewohner_id === bewohnerId) ||
        candidates.find(
          (konto) =>
            konto.inhaber_bewohner_id === bewohnerId &&
            ["privatkonto", "kreditkarte", "paypal", "bar"].includes(konto.konto_typ),
        );
      if (byOwner) return byOwner;
    }

    return (
      candidates.find((konto) =>
        ["privatkonto", "kreditkarte", "paypal", "bar"].includes(konto.konto_typ),
      ) || null
    );
  }

  return candidates[0] || null;
};

export const getScopeKontoHinweis = ({ budgetScope = "haushalt", konto, bewohnerById = {} }) => {
  if (!konto) return null;

  const inhaber =
    konto.inhaber_bewohner_id ? bewohnerById?.[konto.inhaber_bewohner_id] || null : null;
  const inhaberName = inhaber?.name || "Bewohner";

  if (
    budgetScope === "haushalt" &&
    (konto.inhaber_typ === "bewohner" || konto.konto_typ === "privatkonto")
  ) {
    return `Haushaltsausgabe wird ueber ${inhaber ? `${inhaberName}s` : "ein"} Privatkonto bezahlt.`;
  }

  if (
    budgetScope === "privat" &&
    (konto.inhaber_typ === "household" || konto.konto_typ === "haushaltskonto")
  ) {
    return "Private Ausgabe ist auf Haushaltskonto gebucht.";
  }

  return null;
};

export const resolveKontoIdFromAiResult = (item, konten = [], bewohner = []) => {
  const active = getActiveAccounts(konten);
  if (active.length === 0) return null;

  const kontoName = normalizeText(item?.zahlungskonto_name);
  const kontoTyp = normalizeText(item?.zahlungskonto_typ);
  const bewohnerName = normalizeText(item?.bewohner_name);

  if (kontoName) {
    const exactMatch = active.find((konto) => normalizeText(konto.name) === kontoName);
    if (exactMatch) return exactMatch.id;
  }

  if (kontoTyp || bewohnerName) {
    const matchedBewohner = bewohnerName
      ? (bewohner || []).find((eintrag) => normalizeText(eintrag.name) === bewohnerName)
      : null;

    const typedMatches = active.filter((konto) => {
      const typeMatches = !kontoTyp || normalizeText(konto.konto_typ) === kontoTyp;
      const ownerMatches =
        !matchedBewohner || konto.inhaber_bewohner_id === matchedBewohner.id;
      return typeMatches && ownerMatches;
    });

    if (typedMatches.length === 1) return typedMatches[0].id;
    if (typedMatches.length > 1) {
      return typedMatches.find((konto) => konto.inhaber_bewohner_id === matchedBewohner?.id)?.id
        || typedMatches[0].id;
    }
  }

  return null;
};

export const groupSpendByAccount = (entries = [], konten = []) => {
  const kontenById = Object.fromEntries((konten || []).map((konto) => [konto.id, konto]));
  const totals = new Map();

  (entries || []).forEach((entry) => {
    if (!isExpense(entry)) return;
    const konto = kontenById[entry.zahlungskonto_id];
    if (!konto) return;

    const current = totals.get(konto.id) || {
      id: konto.id,
      name: konto.name,
      farbe: konto.farbe || "#10B981",
      konto_typ: konto.konto_typ,
      inhaber_typ: konto.inhaber_typ,
      inhaber_bewohner_id: konto.inhaber_bewohner_id || null,
      buchungen: 0,
      summe: 0,
    };
    current.buchungen += 1;
    current.summe += Math.abs(Number(entry.betrag || 0));
    totals.set(konto.id, current);
  });

  return [...totals.values()].sort((left, right) => right.summe - left.summe);
};

export const computeAccountSpend = (entries = [], konten = []) =>
  groupSpendByAccount(entries, konten).reduce((sum, item) => sum + item.summe, 0);
