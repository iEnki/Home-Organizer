export const centsToEuro = (value) => Number((Number(value || 0) / 100).toFixed(2));

export const buildOpenSaldoMap = (ledgerRows = []) => {
  const salden = {};

  (ledgerRows || []).forEach((row) => {
    const cents = Number(row?.open_amount_cents || 0);
    if (cents <= 0) return;

    salden[row.from_member_id] = (salden[row.from_member_id] || 0) - cents;
    salden[row.to_member_id] = (salden[row.to_member_id] || 0) + cents;
  });

  return Object.fromEntries(
    Object.entries(salden).map(([memberId, cents]) => [memberId, centsToEuro(cents)]),
  );
};

export const buildOpenPairBalances = (ledgerRows = []) => {
  const pairMap = new Map();

  (ledgerRows || []).forEach((row) => {
    const cents = Number(row?.open_amount_cents || 0);
    if (cents <= 0 || !row?.from_member_id || !row?.to_member_id) return;

    const key = `${row.from_member_id}::${row.to_member_id}`;
    const existing = pairMap.get(key) || {
      from_member_id: row.from_member_id,
      to_member_id: row.to_member_id,
      open_amount_cents: 0,
      oldest_origin_date: row.origin_date || null,
      oldest_age_days: Number(row.age_days || 0),
      share_count: 0,
    };

    existing.open_amount_cents += cents;
    existing.share_count += 1;

    if (!existing.oldest_origin_date || (row.origin_date && row.origin_date < existing.oldest_origin_date)) {
      existing.oldest_origin_date = row.origin_date || existing.oldest_origin_date;
      existing.oldest_age_days = Number(row.age_days || 0);
    } else if (Number(row.age_days || 0) > existing.oldest_age_days) {
      existing.oldest_age_days = Number(row.age_days || 0);
    }

    pairMap.set(key, existing);
  });

  return Array.from(pairMap.values()).sort((left, right) => {
    if (right.open_amount_cents !== left.open_amount_cents) {
      return right.open_amount_cents - left.open_amount_cents;
    }
    return String(left.oldest_origin_date || "").localeCompare(String(right.oldest_origin_date || ""));
  });
};

export const buildSettlementSuggestions = (ledgerRows = []) =>
  buildOpenPairBalances(ledgerRows).map((row, index) => ({
    id: `${row.from_member_id}-${row.to_member_id}-${index}`,
    ...row,
  }));
