import { DEFAULT_LOCALE, normalizeLocale } from "../i18n";

export function formatNumber(value, locale = DEFAULT_LOCALE, options = {}) {
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return new Intl.NumberFormat(normalizeLocale(locale), options).format(number);
}

export function formatCurrency(value, locale = DEFAULT_LOCALE, currency = "EUR", options = {}) {
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(number);
}

export function formatDate(value, locale = DEFAULT_LOCALE, options = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(normalizeLocale(locale), options).format(date);
}

export function formatDateTime(value, locale = DEFAULT_LOCALE, options = {}) {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", ...options });
}

export function formatMonthYear(value, locale = DEFAULT_LOCALE) {
  return formatDate(value, locale, { month: "long", year: "numeric" });
}

export function compareLocale(left, right, locale = DEFAULT_LOCALE, options = {}) {
  return String(left || "").localeCompare(String(right || ""), normalizeLocale(locale), options);
}

export function normalizeLocaleLower(value, locale = DEFAULT_LOCALE) {
  return String(value || "").toLocaleLowerCase(normalizeLocale(locale));
}

export function getSpeechRecognitionLocale(locale = DEFAULT_LOCALE) {
  return normalizeLocale(locale) === "en-GB" ? "en-GB" : "de-DE";
}
