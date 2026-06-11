const REPLACEMENTS = [
  [/\bOelwechsel\b/g, "Ölwechsel"],
  [/\bOelfilter\b/g, "Ölfilter"],
  [/\bAltoel\b/g, "Altöl"],
  [/\bZubehoer\b/g, "Zubehör"],
  [/\bPruefung\b/g, "Prüfung"],
  [/\bUeberpruefung\b/g, "Überprüfung"],
  [/\bBremsfluessigkeit\b/g, "Bremsflüssigkeit"],
];

export const formatKfzDisplayText = (value) => REPLACEMENTS.reduce(
  (text, [pattern, replacement]) => text.replace(pattern, replacement),
  String(value ?? ""),
);
