import i18n from "../i18n";

const REPLACEMENTS = [
  [/\bOelwechsel\b/g, "display.oilChange"],
  [/\bOelfilter\b/g, "display.oilFilter"],
  [/\bAltoel\b/g, "display.wasteOil"],
  [/\bZubehoer\b/g, "display.accessories"],
  [/\bPruefung\b/g, "display.inspection"],
  [/\bUeberpruefung\b/g, "display.review"],
  [/\bBremsfluessigkeit\b/g, "display.brakeFluid"],
];

export const formatKfzDisplayText = (value) => REPLACEMENTS.reduce(
  (text, [pattern, key]) => text.replace(pattern, i18n.t(`kfz:${key}`)),
  String(value ?? ""),
);
