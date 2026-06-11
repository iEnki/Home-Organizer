const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRealDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

export const parseLocalizedDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return { iso: "", error: null };
  const match = raw.match(DATE_RE);
  if (!match) return { iso: "", error: "Bitte TT.MM.JJJJ verwenden." };
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!isRealDate(year, month, day)) return { iso: "", error: "Dieses Datum ist ungültig." };
  return { iso: `${yearText}-${monthText}-${dayText}`, error: null };
};

export const formatLocalizedDateInput = (isoValue) => {
  const raw = String(isoValue || "").split("T")[0];
  const match = raw.match(ISO_RE);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
};

export const isIsoDate = (value) => {
  const match = String(value || "").match(ISO_RE);
  if (!match) return false;
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
};
