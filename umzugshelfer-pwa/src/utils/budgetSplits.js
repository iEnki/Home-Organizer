const toCents = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
};

const fromCents = (value) => Number((value / 100).toFixed(2));

const normalizeIds = (values = []) =>
  Array.from(new Set((values || []).filter(Boolean)));

const normalizeSplitConfig = (config) => {
  if (!config?.aktiv || !config?.payerMemberId) return null;
  const mode = config.splitMode || 'equal';
  const base = {
    payerMemberId: config.payerMemberId,
    splitMode: mode,
    teilnehmer: normalizeIds(
      (config.teilnehmer || []).includes(config.payerMemberId)
        ? config.teilnehmer
        : [config.payerMemberId, ...(config.teilnehmer || [])],
    ).sort().join(','),
  };
  if (mode === 'fixed' && config.sharesInput) {
    // fixed: Zahler hat kein Eingabefeld → rausfiltern
    const filtered = Object.fromEntries(
      Object.entries(config.sharesInput)
        .filter(([id, v]) => id !== config.payerMemberId && v != null && Number(v) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
    );
    base.sharesInput = JSON.stringify(filtered);
  }
  if (mode === 'percent' && config.sharesInput) {
    // percent: Zahler-Prozentwert explizit speichern
    const filtered = Object.fromEntries(
      Object.entries(config.sharesInput)
        .filter(([, v]) => v != null && Number(v) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
    );
    base.sharesInput = JSON.stringify(filtered);
  }
  return base;
};

export const buildEqualShares = (betragEuro, alleBeteiligtenIds, payerMemberId) => {
  if (!payerMemberId) return [];

  const alle = normalizeIds(
    (alleBeteiligtenIds || []).includes(payerMemberId)
      ? alleBeteiligtenIds
      : [payerMemberId, ...(alleBeteiligtenIds || [])],
  );
  if (alle.length < 2) return [];

  const totalCents = toCents(betragEuro);
  if (totalCents <= 0) return [];

  const schuldner = alle.filter((id) => id !== payerMemberId);
  if (schuldner.length === 0) return [];

  const baseCents = Math.floor(totalCents / alle.length);
  const restCents = totalCents - baseCents * alle.length;

  return schuldner.map((memberId, index) => ({
    member_id: memberId,
    amount_owed: fromCents(baseCents + (index < restCents ? 1 : 0)),
  }));
};

/**
 * Fixed-Split: Jeder Schuldner zahlt einen vorher festgelegten Betrag.
 * fixedMap: { [member_id]: betragInEuro } — nur Schuldner, kein Zahler.
 * Gibt null zurück, wenn ungültig (Summe > Betrag oder keine Einträge).
 */
export const buildFixedShares = (betragEuro, fixedMap, payerMemberId) => {
  if (!payerMemberId || !fixedMap) return null;
  const totalCents = toCents(betragEuro);
  if (totalCents <= 0) return null;

  const entries = Object.entries(fixedMap)
    .filter(([id, val]) => id !== payerMemberId && Number.isFinite(Number(val)) && Number(val) > 0);
  if (entries.length === 0) return null;

  const sumCents = entries.reduce((s, [, val]) => s + toCents(val), 0);
  if (sumCents > totalCents) return null;

  return entries.map(([id, val]) => ({
    member_id: id,
    amount_owed: fromCents(toCents(val)),
    share_type: 'fixed',
    share_input: Number(val),
  }));
};

/**
 * Percent-Split:
 * percentMap: { [member_id]: prozent (0-100) } — alle Beteiligten inkl. Zahler.
 * Summe aller Anteile muss exakt 100 ergeben (Toleranz ±0.01).
 * Gibt null zurück bei ungültiger Summe oder fehlendem Zahler.
 * Gibt { shares, payerShareInput } zurück — payerShareInput für payer_share_input in DB.
 */
export const buildPercentShares = (betragEuro, percentMap, payerMemberId) => {
  if (!betragEuro || !payerMemberId || !percentMap) return null;
  const totalCents = toCents(betragEuro);
  if (totalCents <= 0) return null;

  const allEntries = Object.entries(percentMap)
    .filter(([, pct]) => Number.isFinite(Number(pct)) && Number(pct) > 0);
  const sumPct = allEntries.reduce((s, [, pct]) => s + Number(pct), 0);
  if (Math.abs(sumPct - 100) > 0.01) return null;

  const payerEntry = allEntries.find(([id]) => id === payerMemberId);
  const payerPct = payerEntry ? Number(payerEntry[1]) : 0;
  const schuldnerEntries = allEntries.filter(([id]) => id !== payerMemberId);
  if (schuldnerEntries.length === 0) return null;

  const payerCents = Math.round(totalCents * payerPct / 100);
  const schuldnerTotal = totalCents - payerCents;

  // Basisbetrag für jeden Schuldner (floor)
  const rawCents = schuldnerEntries.map(([id, pct]) => ({
    id, pct: Number(pct),
    cents: Math.floor(totalCents * Number(pct) / 100),
  }));
  const rawSum = rawCents.reduce((s, e) => s + e.cents, 0);
  const restCents = schuldnerTotal - rawSum;

  // Restcent nach größtem Dezimalbruchteil verteilen
  const withFrac = rawCents.map(e => ({
    ...e,
    frac: (totalCents * e.pct / 100) - e.cents,
  })).sort((a, b) => b.frac - a.frac);

  const shares = withFrac.map((e, i) => ({
    member_id: e.id,
    amount_owed: fromCents(e.cents + (i < restCents ? 1 : 0)),
    share_type: 'percent',
    share_input: e.pct,
  }));

  return { shares, payerShareInput: payerPct };
};

/**
 * Dispatches zum richtigen Builder anhand splitConfig.splitMode.
 * Gibt { shares, payerShareInput } zurück — payerShareInput nur bei 'percent'.
 * Gibt null zurück, wenn ungültig oder Validation fehlschlägt.
 */
export const buildShares = (splitConfig) => {
  if (!splitConfig?.aktiv || !splitConfig?.payerMemberId) return null;
  switch (splitConfig.splitMode || 'equal') {
    case 'fixed': {
      const shares = buildFixedShares(splitConfig.betrag, splitConfig.sharesInput || {}, splitConfig.payerMemberId);
      if (!shares) return null;
      return { shares, payerShareInput: null };
    }
    case 'percent': {
      return buildPercentShares(splitConfig.betrag, splitConfig.sharesInput || {}, splitConfig.payerMemberId);
    }
    case 'equal':
    default: {
      const shares = buildEqualShares(splitConfig.betrag, splitConfig.teilnehmer, splitConfig.payerMemberId)
        .map(s => ({ ...s, share_type: 'equal', share_input: null }));
      if (shares.length === 0) return null;
      return { shares, payerShareInput: null };
    }
  }
};

/**
 * Validierung für UI (vor Speichern).
 * Gibt null zurück wenn ok, sonst Fehlermeldung.
 */
export const validateSplitConfig = (splitConfig) => {
  if (!splitConfig?.aktiv) return null;
  if (!splitConfig?.payerMemberId) return 'Bitte Zahler waehlen.';
  const mode = splitConfig.splitMode || 'equal';
  if (mode === 'equal') {
    const ids = Array.from(new Set(splitConfig.teilnehmer || []));
    const hatSchuldner = ids.some(id => id !== splitConfig.payerMemberId);
    if (!hatSchuldner) return 'Bitte mindestens eine weitere beteiligte Person wählen.';
  }
  if (mode === 'fixed') {
    const total = toCents(splitConfig.betrag);
    const sum = Object.entries(splitConfig.sharesInput || {})
      .filter(([id]) => id !== splitConfig.payerMemberId)
      .reduce((s, [, v]) => s + toCents(v), 0);
    if (sum > total) return 'Die Summe der festen Anteile überschreitet den Gesamtbetrag.';
    if (sum === 0) return 'Bitte mindestens einen Anteil eingeben.';
  }
  if (mode === 'percent') {
    const entries = Object.entries(splitConfig.sharesInput || {})
      .filter(([, v]) => v != null && Number(v) > 0);
    const hatPayer = entries.some(([id]) => id === splitConfig.payerMemberId);
    const hatSchuldner = entries.some(([id]) => id !== splitConfig.payerMemberId);
    const sum = entries.reduce((s, [, v]) => s + Number(v), 0);
    if (!hatPayer) return 'Bitte einen Prozentanteil für den Zahler angeben.';
    if (!hatSchuldner) return 'Bitte mindestens eine weitere beteiligte Person mit Prozentanteil angeben.';
    if (Math.abs(sum - 100) > 0.01) return `Die Prozentsumme muss 100 % ergeben (aktuell: ${sum.toFixed(2)} %).`;
  }
  return null;
};

export const berechneNettoSalden = (splitGroups = [], settlements = []) => {
  const salden = {};

  for (const group of splitGroups || []) {
    const payerId = group?.payer_member_id;
    if (!payerId) continue;

    for (const share of group?.budget_split_shares || []) {
      const cents = toCents(share?.amount_owed);
      if (cents <= 0 || !share?.member_id) continue;
      salden[share.member_id] = (salden[share.member_id] || 0) - cents;
      salden[payerId] = (salden[payerId] || 0) + cents;
    }
  }

  for (const settlement of settlements || []) {
    const cents = toCents(settlement?.amount);
    if (cents <= 0 || !settlement?.from_member_id || !settlement?.to_member_id) continue;
    salden[settlement.from_member_id] = (salden[settlement.from_member_id] || 0) + cents;
    salden[settlement.to_member_id] = (salden[settlement.to_member_id] || 0) - cents;
  }

  return Object.fromEntries(
    Object.entries(salden).map(([memberId, cents]) => [memberId, fromCents(cents)]),
  );
};

export const haushaltsHatSettlements = (settlements) => (settlements || []).length > 0;

export const istSplitGleich = (left, right) => {
  const normalizedLeft = normalizeSplitConfig(left);
  const normalizedRight = normalizeSplitConfig(right);

  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft.payerMemberId === normalizedRight.payerMemberId &&
    normalizedLeft.splitMode === normalizedRight.splitMode &&
    normalizedLeft.teilnehmer === normalizedRight.teilnehmer &&
    normalizedLeft.sharesInput === normalizedRight.sharesInput
  );
};

export const splitAmountInCents = (config) => toCents(config?.betrag);
