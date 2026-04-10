/**
 * ISBN-Normalisierung und Validierung.
 * Unterstützt ISBN-10 und ISBN-13.
 */

/** Entfernt alle nicht-alphanumerischen Zeichen (Bindestriche, Leerzeichen, etc.) */
export function normalizeIsbn(raw) {
  if (!raw) return "";
  return String(raw).replace(/[\s-]/g, "").toUpperCase();
}

/** Prüft die Prüfziffer einer ISBN-10 (Modulo-11) */
export function isValidIsbn10(isbn) {
  if (!isbn || isbn.length !== 10) return false;
  const digits = isbn.split("");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = parseInt(digits[i], 10);
    if (isNaN(d)) return false;
    sum += (10 - i) * d;
  }
  const last = digits[9];
  sum += last === "X" ? 10 : parseInt(last, 10);
  if (isNaN(sum) && last !== "X") return false;
  return sum % 11 === 0;
}

/** Prüft die Prüfziffer einer ISBN-13 (EAN-13) */
export function isValidIsbn13(isbn) {
  if (!isbn || isbn.length !== 13) return false;
  const digits = isbn.split("");
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    if (isNaN(d)) return false;
    sum += (i % 2 === 0 ? 1 : 3) * d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[12], 10);
}

/** Gibt true zurück, wenn isbn eine gültige ISBN-10 oder ISBN-13 ist */
export function isValidIsbn(isbn) {
  const norm = normalizeIsbn(isbn);
  return isValidIsbn13(norm) || isValidIsbn10(norm);
}
