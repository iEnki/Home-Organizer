const parseLocalDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const getGoalProgress = (ziel) => {
  const zielBetrag = Number(ziel?.ziel_betrag || 0);
  const aktuellerBetrag = Number(ziel?.aktueller_betrag || 0);
  return Math.min((aktuellerBetrag / Math.max(zielBetrag, 1)) * 100, 100);
};

export const getGoalStatus = (ziel) => {
  const zielBetrag = Number(ziel?.ziel_betrag || 0);
  const aktuellerBetrag = Number(ziel?.aktueller_betrag || 0);
  const progress = getGoalProgress(ziel);

  if (aktuellerBetrag >= zielBetrag) return "erreicht";
  if (progress >= 90) return "fast_erreicht";
  return "aktiv";
};

export const getGoalRestbetrag = (ziel) =>
  Math.max(0, Number(ziel?.ziel_betrag || 0) - Number(ziel?.aktueller_betrag || 0));

export const getGoalMonatlichNoetig = (ziel, today) => {
  if (!ziel?.zieldatum) return null;

  const restbetrag = getGoalRestbetrag(ziel);
  const targetDate = parseLocalDate(ziel.zieldatum);
  const currentDate = today instanceof Date ? today : new Date(today);

  if (!targetDate || Number.isNaN(currentDate.getTime())) return restbetrag;

  const remainingMonths =
    (targetDate.getFullYear() - currentDate.getFullYear()) * 12 +
    (targetDate.getMonth() - currentDate.getMonth());

  if (remainingMonths <= 0) return restbetrag;

  return restbetrag / remainingMonths;
};

export const groupGoalsByStatus = (ziele) => {
  const groups = [
    { key: "aktiv", label: "Aktiv", items: [] },
    { key: "fast_erreicht", label: "Fast erreicht", items: [] },
    { key: "erreicht", label: "Erreicht", items: [] },
  ];

  (ziele || []).forEach((ziel) => {
    const status = getGoalStatus(ziel);
    const group = groups.find((entry) => entry.key === status);
    if (group) group.items.push(ziel);
  });

  return groups;
};
