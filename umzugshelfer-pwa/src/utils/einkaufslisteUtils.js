import { getActiveHouseholdId, supabase } from "../supabaseClient";
import { cleanKiJsonResponse, getKiClient } from "./kiClient";

export const SHOPPING_MAIN_CATEGORIES = [
  "Lebensmittel",
  "Getränke",
  "Drogerie",
  "Haushalt",
  "Elektronik",
  "Tierbedarf",
  "Baby",
  "Apotheke / Gesundheit",
  "Sonstiges",
];

export const SHOPPING_TAXONOMY = {
  Lebensmittel: [
    "Obst & Gemüse",
    "Fleisch & Geflügel",
    "Fisch",
    "Milchprodukte",
    "Käse",
    "Tiefkühl",
    "Brot & Gebäck",
    "Nudeln, Reis & Vorrat",
    "Snacks & Süßes",
    "Gewürze & Saucen",
  ],
  Getränke: ["Wasser & Softdrinks", "Säfte", "Kaffee & Tee", "Alkohol"],
  Drogerie: ["Hygiene", "Kosmetik", "Baby-Pflege", "Apotheke"],
  Haushalt: ["Reinigung", "Küchenbedarf", "Papierwaren", "Müllbeutel", "Waschmittel"],
  Elektronik: ["Batterien", "Kabel", "Zubehör", "Lampen", "Kleingeräte"],
  Tierbedarf: ["Tierfutter", "Pflege", "Zubehör"],
  Baby: ["Babynahrung", "Windeln", "Pflege"],
  "Apotheke / Gesundheit": ["Medikamente", "Erste Hilfe", "Nahrungsergänzung"],
  Sonstiges: [],
};

export const SHOPPING_MARKET_ORDER = [
  "Obst & Gemüse",
  "Fleisch & Geflügel",
  "Fisch",
  "Milchprodukte",
  "Käse",
  "Tiefkühl",
  "Brot & Gebäck",
  "Nudeln, Reis & Vorrat",
  "Gewürze & Saucen",
  "Snacks & Süßes",
  "Wasser & Softdrinks",
  "Säfte",
  "Kaffee & Tee",
  "Alkohol",
  "Reinigung",
  "Küchenbedarf",
  "Papierwaren",
  "Müllbeutel",
  "Waschmittel",
  "Hygiene",
  "Kosmetik",
  "Baby-Pflege",
  "Apotheke",
  "Batterien",
  "Kabel",
  "Zubehör",
  "Lampen",
  "Kleingeräte",
  "Tierfutter",
  "Pflege",
  "Babynahrung",
  "Windeln",
  "Medikamente",
  "Erste Hilfe",
  "Nahrungsergänzung",
  "Sonstiges",
  "Ungruppiert",
];

export const SHOPPING_SORT_MODES = ["Markt", "Kategorie", "Neueste"];

const SUBCATEGORY_TO_MAIN = Object.entries(SHOPPING_TAXONOMY).reduce(
  (acc, [mainCategory, subCategories]) => {
    subCategories.forEach((subCategory) => {
      acc[subCategory] = mainCategory;
    });
    return acc;
  },
  {}
);

const UNIT_ALIASES = {
  st: "Stück",
  stk: "Stück",
  stueck: "Stück",
  stück: "Stück",
  pack: "Packung",
  packung: "Packung",
  packungen: "Packung",
  liter: "Liter",
  l: "Liter",
  ml: "ml",
  kg: "kg",
  g: "g",
  dose: "Dose",
  dosen: "Dose",
  flasche: "Flasche",
  flaschen: "Flasche",
  rolle: "Rolle",
  rollen: "Rolle",
  sack: "Sack",
  saecke: "Sack",
  säcke: "Sack",
  beutel: "Beutel",
  tuete: "Tüte",
  tüte: "Tüte",
  tube: "Tube",
  tuben: "Tube",
  glas: "Glas",
  glaeser: "Glas",
  gläser: "Glas",
  becher: "Becher",
  kasten: "Kasten",
  karton: "Karton",
  paar: "Paar",
  satz: "Satz",
};

const NAME_ALIASES = {
  hendelbrust: "Hendlbrust",
  hendlbrust: "Hendlbrust",
  haehnchenbrust: "Hendlbrust",
  hahnchenbrust: "Hendlbrust",
  huehnerbrust: "Hendlbrust",
  hühnerbrust: "Hendlbrust",
  "aa batterien": "Batterien AA",
  "batterien aa": "Batterien AA",
  kuchenrolle: "Küchenrolle",
  kuechenrolle: "Küchenrolle",
  kuchenpapier: "Küchenpapier",
};

const LEGACY_CATEGORY_MAP = {
  Lebensmittel: {
    hauptkategorie: "Lebensmittel",
    unterkategorie: null,
    review_noetig: false,
  },
  Haushalt: {
    hauptkategorie: "Haushalt",
    unterkategorie: null,
    review_noetig: false,
  },
  Hygiene: {
    hauptkategorie: "Drogerie",
    unterkategorie: "Hygiene",
    review_noetig: false,
  },
  Reinigung: {
    hauptkategorie: "Haushalt",
    unterkategorie: "Reinigung",
    review_noetig: false,
  },
  Technik: {
    hauptkategorie: "Elektronik",
    unterkategorie: null,
    review_noetig: false,
  },
};

const KEYWORD_RULES = [
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Obst & Gemüse",
    keywords: ["banane", "apfel", "tomate", "gurke", "salat", "zitrone", "paprika", "zwiebel", "kartoffel", "gemuese", "obst"],
    confidence: 0.92,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Fleisch & Geflügel",
    keywords: ["hendl", "brust", "fleisch", "gefluegel", "geflugel", "huhn", "rind", "schwein", "hack"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Fisch",
    keywords: ["lachs", "thunfisch", "fisch", "garnelen", "forelle"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Milchprodukte",
    keywords: ["milch", "joghurt", "sahne", "quark", "butter", "frischkaese", "frischkäse"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Käse",
    keywords: ["kaese", "käse", "mozzarella", "parmesan", "emmentaler", "gouda"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Tiefkühl",
    keywords: ["tiefkuehl", "tiefkühl", "pizza", "pommes", "eis"],
    confidence: 0.91,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Brot & Gebäck",
    keywords: ["brot", "semmel", "weckerl", "toast", "croissant", "gebäck", "wrap", "wraps", "tortilla", "fladenbrot", "pita"],
    confidence: 0.92,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Nudeln, Reis & Vorrat",
    keywords: ["nudel", "spaghetti", "reis", "mehl", "zucker", "haferflocken", "linsen", "bohnen", "konserve"],
    confidence: 0.91,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Snacks & Süßes",
    keywords: ["schokolade", "chips", "snack", "keks", "gummibaer", "gummibär", "sues", "süß"],
    confidence: 0.9,
  },
  {
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Gewürze & Saucen",
    keywords: ["bruehe", "brühe", "senf", "ketchup", "mayonnaise", "sauce", "gewuerz", "gewürz", "essig", "oel", "öl"],
    confidence: 0.93,
  },
  {
    hauptkategorie: "Getränke",
    unterkategorie: "Wasser & Softdrinks",
    keywords: ["wasser", "cola", "limo", "softdrink", "sprudel"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Getränke",
    unterkategorie: "Säfte",
    keywords: ["saft", "orangen", "apfelsaft", "multisaft"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Getränke",
    unterkategorie: "Kaffee & Tee",
    keywords: ["kaffee", "espresso", "tee", "kakao"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Getränke",
    unterkategorie: "Alkohol",
    keywords: ["bier", "wein", "sekt", "gin", "rum", "vodka"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Drogerie",
    unterkategorie: "Hygiene",
    keywords: ["zahnpasta", "duschgel", "shampoo", "seife", "deo", "toilettenpapier", "hygiene"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Haushalt",
    unterkategorie: "Reinigung",
    keywords: ["putz", "reiniger", "spuelmittel", "spülmittel", "schwamm", "entkalker", "fensterreiniger"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Haushalt",
    unterkategorie: "Küchenbedarf",
    keywords: ["backpapier", "alufolie", "frischhaltefolie", "kuechenrolle", "küchenrolle", "kuechenpapier", "küchenpapier"],
    confidence: 0.92,
  },
  {
    hauptkategorie: "Haushalt",
    unterkategorie: "Papierwaren",
    keywords: ["taschentuch", "serviette", "papier"],
    confidence: 0.88,
  },
  {
    hauptkategorie: "Haushalt",
    unterkategorie: "Müllbeutel",
    keywords: ["muellbeutel", "mullbeutel", "müllbeutel", "abfallsack"],
    confidence: 0.96,
  },
  {
    hauptkategorie: "Haushalt",
    unterkategorie: "Waschmittel",
    keywords: ["waschmittel", "weichspueler", "weichspüler"],
    confidence: 0.96,
  },
  {
    hauptkategorie: "Elektronik",
    unterkategorie: "Batterien",
    keywords: ["batterie", "akku", "aa", "aaa"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Elektronik",
    unterkategorie: "Kabel",
    keywords: ["kabel", "usb", "hdmi", "ladung"],
    confidence: 0.94,
  },
  {
    hauptkategorie: "Elektronik",
    unterkategorie: "Lampen",
    keywords: ["lampe", "leuchtmittel", "gluehbirne", "glühbirne", "led"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Tierbedarf",
    unterkategorie: "Tierfutter",
    keywords: ["katzenfutter", "hundefutter", "tierfutter", "leckerlis"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Baby",
    unterkategorie: "Windeln",
    keywords: ["windel", "feuchttuch"],
    confidence: 0.95,
  },
  {
    hauptkategorie: "Apotheke / Gesundheit",
    unterkategorie: "Medikamente",
    keywords: ["ibuprofen", "paracetamol", "medikament", "tablette", "nasenspray"],
    confidence: 0.96,
  },
];

const WORDS_TO_KEEP_UPPERCASE = new Set(["AA", "AAA", "USB", "HDMI"]);

const SHOPPING_SUBCATEGORY_OPTIONS = Object.entries(SHOPPING_TAXONOMY).flatMap(
  ([mainCategory, subCategories]) =>
    subCategories.map((subCategory) => `${mainCategory} > ${subCategory}`)
);

const toKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatQuantity = (value) => {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return "1";
  if (Number.isInteger(numericValue)) return String(numericValue);
  return numericValue.toFixed(2).replace(/\.?0+$/, "");
};

export const parseNumericValue = (value, fallback = 1) => {
  const numericValue = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const normalizeUnit = (unit) => {
  if (!unit) return null;
  const normalizedUnit = toKey(unit);
  return UNIT_ALIASES[normalizedUnit] || null;
};

const titleCase = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const upperCandidate = part.toUpperCase();
      if (WORDS_TO_KEEP_UPPERCASE.has(upperCandidate)) return upperCandidate;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");

export const normalizeShoppingName = (rawName) => {
  const rawValue = String(rawName || "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawValue) return "";

  const key = toKey(rawValue);
  if (NAME_ALIASES[key]) return NAME_ALIASES[key];

  if (/(^|\s)(aa|aaa)\s+batter/i.test(rawValue)) {
    const size = /\baaa\b/i.test(rawValue) ? "AAA" : "AA";
    return `Batterien ${size}`;
  }
  if (/batter/i.test(rawValue) && /\b(aa|aaa)\b/i.test(rawValue)) {
    const size = /\baaa\b/i.test(rawValue) ? "AAA" : "AA";
    return `Batterien ${size}`;
  }

  return titleCase(rawValue);
};

const validateMainCategory = (category) =>
  SHOPPING_MAIN_CATEGORIES.includes(category) ? category : null;

const validateSubCategory = (subCategory, mainCategory) => {
  if (!subCategory) return null;
  const expectedMainCategory = SUBCATEGORY_TO_MAIN[subCategory];
  if (!expectedMainCategory) return null;
  if (mainCategory && expectedMainCategory !== mainCategory) return null;
  return subCategory;
};

const getEntryMainCategory = (entry) => {
  const validMainCategory = validateMainCategory(entry?.hauptkategorie);
  if (validMainCategory) return validMainCategory;

  const inferredMainCategory = SUBCATEGORY_TO_MAIN[entry?.unterkategorie];
  if (inferredMainCategory) return inferredMainCategory;

  return "Sonstiges";
};

const getEntrySubCategory = (entry) =>
  validateSubCategory(entry?.unterkategorie, getEntryMainCategory(entry)) || null;

const buildGroupLabel = (entry) => getEntryMainCategory(entry) || "Ungruppiert";

export const getSubcategoriesForMainCategory = (mainCategory) =>
  SHOPPING_TAXONOMY[mainCategory] || [];

export const splitShoppingInput = (value) =>
  String(value || "")
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

export const parseShoppingText = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return {
      original_text: "",
      normalized_name: "",
      menge: 1,
      einheit: "Stück",
    };
  }

  let working = rawValue
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  let menge = 1;
  let einheit = null;

  const suffixCompactMatch = working.match(/^(.*?)(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜ]+)$/);
  const suffixMatch = working.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜ]+)$/);
  const prefixMatch = working.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜ]+)?\s+(.+)$/);
  const matches = [suffixMatch, suffixCompactMatch, prefixMatch].filter(Boolean);

  if (matches.length > 0) {
    const match = matches[0];
    if (match === prefixMatch) {
      menge = parseNumericValue(match[1], 1);
      einheit = normalizeUnit(match[2]);
      working = match[3].trim();
    } else {
      menge = parseNumericValue(match[2], 1);
      einheit = normalizeUnit(match[3]);
      working = match[1].trim();
    }
  }

  const normalizedName = normalizeShoppingName(working);

  return {
    original_text: rawValue,
    normalized_name: normalizedName,
    name: normalizedName,
    menge,
    einheit: einheit || "Stück",
  };
};

export const mapLegacyShoppingCategory = (category) => {
  if (LEGACY_CATEGORY_MAP[category]) return LEGACY_CATEGORY_MAP[category];
  return {
    hauptkategorie: "Sonstiges",
    unterkategorie: null,
    review_noetig: Boolean(category),
  };
};

export const applyLegacyShoppingFields = (entry) => {
  const normalizedName = normalizeShoppingName(
    entry?.normalized_name || entry?.name || entry?.original_text || ""
  );
  const ruleSuggestion = normalizedName ? classifyByRules(normalizedName) : null;
  const explicitMainCategory = validateMainCategory(entry?.hauptkategorie);
  const explicitSubCategory =
    validateSubCategory(
      entry?.unterkategorie,
      explicitMainCategory || SUBCATEGORY_TO_MAIN[entry?.unterkategorie] || null
    ) || null;
  const legacy = mapLegacyShoppingCategory(entry?.kategorie);

  const shouldPreferRuleSuggestion =
    Boolean(ruleSuggestion) &&
    (
      !explicitMainCategory ||
      explicitMainCategory === "Sonstiges" ||
      (
        explicitMainCategory &&
        !explicitSubCategory &&
        ruleSuggestion.confidence >= 0.9 &&
        ruleSuggestion.hauptkategorie !== explicitMainCategory
      ) ||
      (Boolean(entry?.review_noetig) && ruleSuggestion.confidence >= 0.85)
    );

  const hauptkategorie = explicitSubCategory
    ? SUBCATEGORY_TO_MAIN[explicitSubCategory]
    : shouldPreferRuleSuggestion
      ? ruleSuggestion.hauptkategorie
      : explicitMainCategory ||
        legacy.hauptkategorie ||
        ruleSuggestion?.hauptkategorie ||
        "Sonstiges";

  const unterkategorie = validateSubCategory(
    explicitSubCategory ||
      (shouldPreferRuleSuggestion ? ruleSuggestion?.unterkategorie : null) ||
      (legacy.hauptkategorie === hauptkategorie ? legacy.unterkategorie : null) ||
      ruleSuggestion?.unterkategorie,
    hauptkategorie
  );
  const confidenceFallback = shouldPreferRuleSuggestion
    ? ruleSuggestion?.confidence
    : explicitSubCategory
      ? 0.95
      : ruleSuggestion?.confidence ?? (legacy.review_noetig ? 0.6 : 0.8);
  const confidence = Math.min(
    Math.max(parseNumericValue(entry?.confidence, confidenceFallback), 0),
    0.99
  );

  return {
    ...entry,
    hauptkategorie,
    unterkategorie,
    review_noetig:
      typeof entry?.review_noetig === "boolean"
        ? entry.review_noetig && !(confidence >= 0.9 && hauptkategorie !== "Sonstiges")
        : confidence < 0.75 || hauptkategorie === "Sonstiges",
    confidence,
    kategorie: hauptkategorie,
  };
};

const classifyByRules = (normalizedName) => {
  const key = toKey(normalizedName);
  let bestMatch = null;

  KEYWORD_RULES.forEach((rule) => {
    const hits = rule.keywords.filter((keyword) => key.includes(keyword)).length;
    if (hits === 0) return;

    const score = rule.confidence + Math.min(hits - 1, 2) * 0.01;
    if (!bestMatch || score > bestMatch.confidence) {
      bestMatch = {
        hauptkategorie: rule.hauptkategorie,
        unterkategorie: rule.unterkategorie,
        confidence: Math.min(score, 0.98),
      };
    }
  });

  return bestMatch;
};

const parseCorrectionMap = (corrections) =>
  new Map(
    (corrections || [])
      .filter((row) => row?.normalized_name)
      .map((row) => [toKey(row.normalized_name), row])
  );

const sanitizeAiSuggestion = (suggestion) => {
  if (!suggestion) return null;
  const hauptkategorie = validateMainCategory(
    suggestion.hauptkategorie || suggestion.main_category || suggestion.kategorie
  );
  const unterkategorie = validateSubCategory(
    suggestion.unterkategorie || suggestion.sub_category,
    hauptkategorie
  );

  if (!hauptkategorie && !unterkategorie) return null;

  return {
    normalized_name:
      normalizeShoppingName(
        suggestion.normalized_name || suggestion.name || suggestion.original_text
      ) || "",
    hauptkategorie: hauptkategorie || SUBCATEGORY_TO_MAIN[unterkategorie] || "Sonstiges",
    unterkategorie: unterkategorie || null,
    confidence: Math.min(
      Math.max(parseNumericValue(suggestion.confidence, 0.8), 0),
      0.99
    ),
  };
};

export const buildShoppingAiExtractionPrompt = (text) => `Extrahiere alle Einkaufsartikel aus dem Text als JSON-Array.

Pflichtregeln:
- Antworte nur mit einem JSON-Array.
- Verwende nur diese Hauptkategorien: ${SHOPPING_MAIN_CATEGORIES.join(", ")}.
- Verwende Unterkategorien nur aus dieser festen Taxonomie:
${SHOPPING_SUBCATEGORY_OPTIONS.join(", ")}.
- Keine freien Kategorien.

Felder pro Eintrag:
- original_text
- normalized_name
- menge (Zahl, default 1)
- einheit (z.B. Stück, Liter, kg, Packung)
- hauptkategorie
- unterkategorie (oder null)
- confidence (0 bis 1)

Beispiel:
[
  {
    "original_text": "Rinderbrühe 1 Flasche",
    "normalized_name": "Rinderbrühe",
    "menge": 1,
    "einheit": "Flasche",
    "hauptkategorie": "Lebensmittel",
    "unterkategorie": "Gewürze & Saucen",
    "confidence": 0.94
  }
]

Text: "${text}"
JSON-Array:`;

export const buildShoppingClassificationPrompt = (items) => `Ordne die folgenden Einkaufsartikel einer festen Taxonomie zu.

Pflichtregeln:
- Antworte nur mit einem JSON-Array.
- Nutze nur diese Hauptkategorien: ${SHOPPING_MAIN_CATEGORIES.join(", ")}.
- Nutze nur diese Unterkategorien:
${SHOPPING_SUBCATEGORY_OPTIONS.join(", ")}.
- Keine freien Kategorien.
- Wenn du unsicher bist, setze hauptkategorie auf "Sonstiges", unterkategorie auf null und confidence niedriger.

Felder pro Eintrag:
- original_text
- normalized_name
- hauptkategorie
- unterkategorie
- confidence

Artikel:
${JSON.stringify(items, null, 2)}

JSON-Array:`;

const parseAiSuggestions = (content) => {
  const cleaned = cleanKiJsonResponse(content, "array");
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [];
};

export const classifyShoppingItemsWithAi = async ({ userId, items }) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const { client, model } = await getKiClient(userId);
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein strukturierter Einkaufslisten-Klassifizierer. Antworte ausschließlich mit einem gültigen JSON-Array.",
      },
      {
        role: "user",
        content: buildShoppingClassificationPrompt(items),
      },
    ],
    temperature: 0.1,
  });

  const rawContent = response?.choices?.[0]?.message?.content || "[]";
  return parseAiSuggestions(rawContent).map(sanitizeAiSuggestion).filter(Boolean);
};

const pickCategoryData = ({ hint, aiSuggestion, ruleSuggestion }) => {
  if (hint?.hauptkategorie) {
    return {
      hauptkategorie: hint.hauptkategorie,
      unterkategorie: hint.unterkategorie,
      confidence: Math.max(parseNumericValue(hint.confidence, 0.9), 0.9),
    };
  }
  if (aiSuggestion?.hauptkategorie) return aiSuggestion;
  if (ruleSuggestion?.hauptkategorie) return ruleSuggestion;
  return {
    hauptkategorie: "Sonstiges",
    unterkategorie: null,
    confidence: 0.45,
  };
};

export const createShoppingDraft = ({
  item,
  correctionMap,
  aiSuggestion = null,
  source = "manuell",
}) => {
  const parsed = parseShoppingText(item.original_text || item.name || "");
  const normalizedName =
    normalizeShoppingName(item.normalized_name || item.name || parsed.normalized_name) ||
    parsed.normalized_name;
  const correction = correctionMap.get(toKey(normalizedName));

  if (correction) {
    return {
      original_text: item.original_text || parsed.original_text || normalizedName,
      normalized_name: normalizeShoppingName(
        correction.bevorzugter_name || correction.normalized_name || normalizedName
      ),
      name: normalizeShoppingName(
        correction.bevorzugter_name || correction.normalized_name || normalizedName
      ),
      menge: parseNumericValue(item.menge ?? parsed.menge, 1),
      einheit: normalizeUnit(item.einheit || correction.standard_einheit || parsed.einheit) || "Stück",
      hauptkategorie: correction.hauptkategorie || "Sonstiges",
      unterkategorie: validateSubCategory(
        correction.unterkategorie,
        correction.hauptkategorie || "Sonstiges"
      ),
      kategorie: correction.hauptkategorie || "Sonstiges",
      confidence: 0.99,
      review_noetig: false,
      quelle: source,
      notizen: item.notizen || null,
      vorrat_id: item.vorrat_id || null,
    };
  }

  const hintMainCategory = validateMainCategory(
    item.hauptkategorie || item.main_category || item.kategorie
  );
  const hintSubCategory = validateSubCategory(
    item.unterkategorie || item.sub_category,
    hintMainCategory
  );
  const hint = hintMainCategory
    ? {
        hauptkategorie: hintMainCategory,
        unterkategorie: hintSubCategory,
        confidence: parseNumericValue(item.confidence, hintSubCategory ? 0.95 : 0.9),
      }
    : null;

  const ruleSuggestion = classifyByRules(normalizedName);
  const categoryData = pickCategoryData({
    hint,
    aiSuggestion,
    ruleSuggestion,
  });

  const hauptkategorie = validateMainCategory(categoryData.hauptkategorie) || "Sonstiges";
  const unterkategorie =
    validateSubCategory(categoryData.unterkategorie, hauptkategorie) || null;
  const confidence = Math.min(
    Math.max(parseNumericValue(categoryData.confidence, 0.45), 0),
    0.99
  );
  const reviewNoetig = confidence < 0.75 || hauptkategorie === "Sonstiges";

  return {
    original_text: item.original_text || parsed.original_text || normalizedName,
    normalized_name: normalizedName,
    name: normalizedName,
    menge: parseNumericValue(item.menge ?? parsed.menge, 1),
    einheit: normalizeUnit(item.einheit || parsed.einheit) || "Stück",
    hauptkategorie,
    unterkategorie,
    kategorie: hauptkategorie,
    confidence,
    review_noetig: reviewNoetig,
    quelle: source,
    notizen: item.notizen || null,
    vorrat_id: item.vorrat_id || null,
  };
};

const dedupeDrafts = (drafts) => {
  const mergedMap = new Map();

  drafts.forEach((draft) => {
    const key = `${toKey(draft.normalized_name)}|${toKey(draft.einheit)}`;
    const current = mergedMap.get(key);
    if (!current) {
      mergedMap.set(key, {
        ...draft,
        client_id: `${key}-${mergedMap.size}`,
        merged_original_texts: [draft.original_text],
      });
      return;
    }

    current.menge += parseNumericValue(draft.menge, 1);
    current.confidence = Math.max(current.confidence || 0, draft.confidence || 0);
    current.review_noetig = current.review_noetig || draft.review_noetig;
    current.merged_original_texts.push(draft.original_text);

    if (!current.unterkategorie && draft.unterkategorie) {
      current.unterkategorie = draft.unterkategorie;
    }
    if (
      current.hauptkategorie === "Sonstiges" &&
      draft.hauptkategorie &&
      draft.hauptkategorie !== "Sonstiges"
    ) {
      current.hauptkategorie = draft.hauptkategorie;
      current.kategorie = draft.hauptkategorie;
    }
  });

  return Array.from(mergedMap.values());
};

export const areUnitsCompatible = (unitA, unitB) => {
  const normalizedA = normalizeUnit(unitA);
  const normalizedB = normalizeUnit(unitB);
  if (!normalizedA || !normalizedB) return true;
  return normalizedA === normalizedB;
};

export const getDuplicateSuggestions = (drafts, existingEntries) =>
  drafts
    .map((draft) => {
      const existingEntry = (existingEntries || []).find(
        (entry) =>
          !entry.erledigt &&
          toKey(entry.normalized_name || entry.name) === toKey(draft.normalized_name) &&
          areUnitsCompatible(entry.einheit, draft.einheit)
      );

      if (!existingEntry) return null;

      return {
        client_id: draft.client_id,
        existing_id: existingEntry.id,
        existing_entry: existingEntry,
        draft,
      };
    })
    .filter(Boolean);

const normalizeExistingEntry = (entry) => applyLegacyShoppingFields(entry);

export const getShoppingGroupSortKey = (groupLabel, sortMode) => {
  if (sortMode === "Markt") {
    const marketIndices = (SHOPPING_TAXONOMY[groupLabel] || [])
      .map((subCategory) => SHOPPING_MARKET_ORDER.indexOf(subCategory))
      .filter((index) => index !== -1);

    if (marketIndices.length > 0) return Math.min(...marketIndices);

    const index = SHOPPING_MARKET_ORDER.indexOf(groupLabel);
    return index === -1 ? SHOPPING_MARKET_ORDER.length + 1 : index;
  }

  if (sortMode === "Kategorie") {
    const mainCategory = SUBCATEGORY_TO_MAIN[groupLabel] || groupLabel;
    const mainCategoryIndex = SHOPPING_MAIN_CATEGORIES.indexOf(mainCategory);
    return mainCategoryIndex === -1 ? SHOPPING_MAIN_CATEGORIES.length + 1 : mainCategoryIndex;
  }

  return 999;
};

export const sortShoppingEntries = (entries, sortMode) => {
  if (sortMode === "Neueste") {
    return [...entries].sort(
      (left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0)
    );
  }

  return [...entries].sort((left, right) => {
    const normalizedLeft = normalizeExistingEntry(left);
    const normalizedRight = normalizeExistingEntry(right);
    const leftGroup = buildGroupLabel(normalizedLeft);
    const rightGroup = buildGroupLabel(normalizedRight);
    const leftGroupOrder = getShoppingGroupSortKey(leftGroup, sortMode);
    const rightGroupOrder = getShoppingGroupSortKey(rightGroup, sortMode);
    const leftSubCategory = getEntrySubCategory(normalizedLeft);
    const rightSubCategory = getEntrySubCategory(normalizedRight);

    if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder;
    if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup, "de");

    if (sortMode === "Markt") {
      const leftSubCategoryOrder = getShoppingGroupSortKey(leftSubCategory || "Sonstiges", "Markt");
      const rightSubCategoryOrder = getShoppingGroupSortKey(
        rightSubCategory || "Sonstiges",
        "Markt"
      );

      if (leftSubCategoryOrder !== rightSubCategoryOrder) {
        return leftSubCategoryOrder - rightSubCategoryOrder;
      }
    }

    if ((leftSubCategory || "") !== (rightSubCategory || "")) {
      return (leftSubCategory || "").localeCompare(rightSubCategory || "", "de");
    }

    const leftName = normalizedLeft.normalized_name || normalizedLeft.name || "";
    const rightName = normalizedRight.normalized_name || normalizedRight.name || "";
    return leftName.localeCompare(rightName, "de");
  });
};

export const filterShoppingEntries = (entries, { search = "", filter = "Alle" } = {}) => {
  const normalizedSearch = toKey(search);

  return entries.filter((entry) => {
    const enhancedEntry = normalizeExistingEntry(entry);
    const matchesSearch =
      !normalizedSearch ||
      toKey(
        [
          enhancedEntry.name,
          enhancedEntry.normalized_name,
          enhancedEntry.hauptkategorie,
          enhancedEntry.unterkategorie,
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(normalizedSearch);

    if (!matchesSearch) return false;

    if (filter === "Alle") return true;
    if (filter === "Offen") return !enhancedEntry.erledigt;
    if (filter === "Erledigt") return Boolean(enhancedEntry.erledigt);
    if (filter === "Prüfen") return Boolean(enhancedEntry.review_noetig);
    if (filter === "Ungruppiert") {
      return !enhancedEntry.hauptkategorie || !enhancedEntry.unterkategorie;
    }
    return enhancedEntry.hauptkategorie === filter;
  });
};

export const buildShoppingGroups = (entries, sortMode = "Markt") => {
  if (sortMode === "Neueste") {
    return [
      {
        label: "Neueste",
        items: sortShoppingEntries(entries, "Neueste"),
      },
    ];
  }

  const groupMap = new Map();
  sortShoppingEntries(entries, sortMode).forEach((entry) => {
    const enhancedEntry = normalizeExistingEntry(entry);
    const label = buildGroupLabel(enhancedEntry);
    const current = groupMap.get(label) || [];
    current.push(enhancedEntry);
    groupMap.set(label, current);
  });

  return Array.from(groupMap.entries())
    .sort(
      ([leftLabel], [rightLabel]) =>
        getShoppingGroupSortKey(leftLabel, sortMode) -
          getShoppingGroupSortKey(rightLabel, sortMode) ||
        leftLabel.localeCompare(rightLabel, "de")
    )
    .map(([label, items]) => ({ label, items }));
};

export const getShoppingEntrySubtitle = (entry) => {
  return `${formatQuantity(parseNumericValue(entry.menge, 1))} ${entry.einheit || "Stück"}`;
};

export const getShoppingFilterOptions = () => [
  "Alle",
  ...SHOPPING_MAIN_CATEGORIES,
  "Offen",
  "Erledigt",
  "Prüfen",
  "Ungruppiert",
];

const resolveCurrentHouseholdId = async () => {
  const activeHouseholdId = getActiveHouseholdId();
  if (activeHouseholdId) return activeHouseholdId;

  const { data, error } = await supabase.rpc("get_current_household_id");
  if (error) throw error;
  return data;
};

export const fetchShoppingCorrections = async () => {
  const { data, error } = await supabase
    .from("home_einkauf_korrekturen")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

export const fetchOpenShoppingEntries = async (userId) => {
  const { data, error } = await supabase
    .from("home_einkaufliste")
    .select("*")
    .eq("user_id", userId)
    .eq("erledigt", false);

  if (error) throw error;
  return (data || []).map(normalizeExistingEntry);
};

export const saveShoppingCorrection = async ({ entry, userId }) => {
  const householdId = await resolveCurrentHouseholdId();
  if (!householdId || !entry?.normalized_name) return null;

  const payload = {
    household_id: householdId,
    normalized_name: normalizeShoppingName(entry.normalized_name || entry.name),
    bevorzugter_name: normalizeShoppingName(entry.name || entry.normalized_name),
    hauptkategorie: entry.hauptkategorie || entry.kategorie || "Sonstiges",
    unterkategorie: validateSubCategory(
      entry.unterkategorie,
      entry.hauptkategorie || entry.kategorie || "Sonstiges"
    ),
    standard_einheit: normalizeUnit(entry.einheit) || "Stück",
    created_by_user_id: userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("home_einkauf_korrekturen")
    .upsert(payload, {
      onConflict: "household_id,normalized_name",
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const prepareShoppingBatch = async ({
  rawItems,
  userId,
  source = "manuell",
  corrections = null,
  existingEntries = null,
}) => {
  const correctionRows = corrections || (await fetchShoppingCorrections());
  const correctionMap = parseCorrectionMap(correctionRows);
  const existingOpenEntries = existingEntries || (await fetchOpenShoppingEntries(userId));

  const normalizedItems = (rawItems || []).map((item) =>
    typeof item === "string" ? { original_text: item } : item
  );

  let drafts = normalizedItems.map((item) =>
    createShoppingDraft({
      item,
      correctionMap,
      source,
    })
  );

  const uncertainDrafts = drafts.filter(
    (draft) =>
      draft.hauptkategorie === "Sonstiges" ||
      draft.review_noetig ||
      (!draft.unterkategorie && parseNumericValue(draft.confidence, 0) < 0.92)
  );

  if (uncertainDrafts.length > 0) {
    try {
      const aiSuggestions = await classifyShoppingItemsWithAi({
        userId,
        items: uncertainDrafts.map((draft) => ({
          original_text: draft.original_text,
          normalized_name: draft.normalized_name,
        })),
      });
      const aiSuggestionMap = new Map(
        aiSuggestions.map((suggestion) => [toKey(suggestion.normalized_name), suggestion])
      );

      drafts = normalizedItems.map((item) =>
        createShoppingDraft({
          item,
          correctionMap,
          source,
          aiSuggestion: aiSuggestionMap.get(
            toKey(normalizeShoppingName(item.normalized_name || item.name || item.original_text))
          ),
        })
      );
    } catch (_error) {
      // Fallback bleibt auf regelbasierter Zuordnung.
    }
  }

  const dedupedDrafts = dedupeDrafts(drafts);
  const duplicates = getDuplicateSuggestions(dedupedDrafts, existingOpenEntries);

  return {
    drafts: dedupedDrafts,
    duplicates,
    existingEntries: existingOpenEntries,
  };
};

const buildInsertPayload = ({ draft, userId }) => ({
  user_id: userId,
  vorrat_id: draft.vorrat_id || null,
  name: draft.name,
  original_text: draft.original_text,
  normalized_name: draft.normalized_name,
  menge: draft.menge,
  einheit: draft.einheit,
  kategorie: draft.hauptkategorie,
  hauptkategorie: draft.hauptkategorie,
  unterkategorie: draft.unterkategorie,
  confidence: draft.confidence,
  review_noetig: draft.review_noetig,
  quelle: draft.quelle || "manuell",
  notizen: draft.notizen || null,
  erledigt: false,
});

export const applyShoppingBatch = async ({
  userId,
  drafts,
  decisions = {},
}) => {
  const inserts = [];
  const mergeUpdates = new Map();

  drafts.forEach((draft) => {
    const decision = decisions[draft.client_id] || { action: "insert" };
    if (decision.action === "merge" && decision.existingEntry) {
      const existingEntry = decision.existingEntry;
      const current = mergeUpdates.get(existingEntry.id) || {
        ...existingEntry,
        menge: parseNumericValue(existingEntry.menge, 1),
      };
      current.menge += parseNumericValue(draft.menge, 1);
      if (!current.hauptkategorie || current.hauptkategorie === "Sonstiges") {
        current.hauptkategorie = draft.hauptkategorie;
        current.kategorie = draft.hauptkategorie;
      }
      if (!current.unterkategorie && draft.unterkategorie) {
        current.unterkategorie = draft.unterkategorie;
      }
      if (!current.normalized_name) current.normalized_name = draft.normalized_name;
      if (!current.original_text) current.original_text = draft.original_text;
      if (!current.einheit && draft.einheit) current.einheit = draft.einheit;
      current.review_noetig = current.review_noetig && draft.review_noetig;
      current.confidence = Math.max(
        parseNumericValue(current.confidence, 0),
        parseNumericValue(draft.confidence, 0)
      );
      mergeUpdates.set(existingEntry.id, current);
      return;
    }

    inserts.push(buildInsertPayload({ draft, userId }));
  });

  const updatePromises = Array.from(mergeUpdates.values()).map((entry) =>
    supabase
      .from("home_einkaufliste")
      .update({
        menge: entry.menge,
        einheit: entry.einheit || "Stück",
        normalized_name: entry.normalized_name || entry.name,
        original_text: entry.original_text || entry.name,
        hauptkategorie: entry.hauptkategorie || entry.kategorie || "Sonstiges",
        unterkategorie: entry.unterkategorie || null,
        kategorie: entry.hauptkategorie || entry.kategorie || "Sonstiges",
        confidence: entry.confidence || 0.9,
        review_noetig: entry.review_noetig,
      })
      .eq("id", entry.id)
  );

  const insertPromise = inserts.length
    ? supabase.from("home_einkaufliste").insert(inserts)
    : Promise.resolve({ error: null });

  const results = await Promise.all([...updatePromises, insertPromise]);
  const failedResult = results.find((result) => result?.error);
  if (failedResult?.error) throw failedResult.error;

  return {
    inserted: inserts.length,
    merged: mergeUpdates.size,
  };
};
