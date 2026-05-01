const MOJIBAKE_REPLACEMENTS = [
  ["ÃƒÅ¸", "ß"],
  ["ÃƒÂ¼", "ü"],
  ["ÃƒÂ¶", "ö"],
  ["ÃƒÂ¤", "ä"],
  ["ÃƒÅ“", "Ü"],
  ["ÃƒÂ„", "Ä"],
  ["ÃƒÂ–", "Ö"],
  ["ÃƒÂ©", "é"],
  ["Ãƒâ€”", "×"],
  ["ÃƒÂ—", "×"],
  ["Ã‚Â²", "²"],
  ["Ã‚Â³", "³"],
  ["Ã¢â€šÂ¬", "€"],
  ["Ã¢â‚¬Å“", "\""],
  ["Ã¢â‚¬Â", "\""],
  ["Ã¢â‚¬Â³", "\""],
  ["ÃŸ", "ß"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Ã¤", "ä"],
  ["Ãœ", "Ü"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ã©", "é"],
  ["Â²", "²"],
  ["Â³", "³"],
  ["â‚¬", "€"],
];

const MOJIBAKE_PATTERN = /(?:Ã|Â|â|�)/;

export function repairMojibakeText(value) {
  if (typeof value !== "string" || !MOJIBAKE_PATTERN.test(value)) return value;

  return MOJIBAKE_REPLACEMENTS.reduce(
    (text, [broken, fixed]) => text.split(broken).join(fixed),
    value
  );
}

export function repairMojibakeFields(row, fields) {
  if (!row || typeof row !== "object") return row;

  return fields.reduce(
    (next, field) => ({
      ...next,
      [field]: repairMojibakeText(next[field]),
    }),
    { ...row }
  );
}
