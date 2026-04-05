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

  return {
    payerMemberId: config.payerMemberId,
    teilnehmer: normalizeIds(
      config.teilnehmer?.includes(config.payerMemberId)
        ? config.teilnehmer
        : [config.payerMemberId, ...(config.teilnehmer || [])],
    )
      .sort()
      .join(","),
  };
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
    normalizedLeft.teilnehmer === normalizedRight.teilnehmer
  );
};

export const splitAmountInCents = (config) => toCents(config?.betrag);
