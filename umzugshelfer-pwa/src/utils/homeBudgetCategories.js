const DEFAULT_CATEGORY_FALLBACK = "Sonstiges";
const DEFAULT_COLOR_FALLBACK = "#6B7280";

export const DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS = [
  { name: "Lebensmittel", color: "#10B981", sort_order: 10, is_system: true },
  { name: "Hygieneartikel", color: "#F97316", sort_order: 20, is_system: true },
  { name: "Reinigungsmittel", color: "#06B6D4", sort_order: 30, is_system: true },
  { name: "Haushalt", color: "#3B82F6", sort_order: 40, is_system: true },
  { name: "Elektronikartikel", color: "#6366F1", sort_order: 50, is_system: true },
  { name: "Elektronikgeräte", color: "#8B5CF6", sort_order: 60, is_system: true },
  { name: "Elektronik", color: "#4F46E5", sort_order: 55, is_system: true },
  { name: "Reparaturen", color: "#F59E0B", sort_order: 70, is_system: true },
  { name: "Abonnements", color: "#A855F7", sort_order: 80, is_system: true },
  { name: "Versicherungen", color: "#EC4899", sort_order: 90, is_system: true },
  { name: "Einrichtung", color: "#14B8A6", sort_order: 100, is_system: true },
  { name: "Möbel & Einrichtung", color: "#0D9488", sort_order: 101, is_system: true },
  { name: "Moebel & Einrichtung", color: "#0D9488", sort_order: 102, is_system: true },
  { name: "Tanken", color: "#0EA5E9", sort_order: 110, is_system: true },
  { name: "Rücklagen", color: "#FB923C", sort_order: 120, is_system: true },
  { name: "Medikamente & Gesundheit", color: "#EF4444", sort_order: 130, is_system: true },
  { name: "Freizeit", color: "#22C55E", sort_order: 140, is_system: true },
  { name: "Kleidung", color: "#F472B6", sort_order: 150, is_system: true },
  { name: "Lebensmittel & Getränke", color: "#34D399", sort_order: 11, is_system: true },
  { name: DEFAULT_CATEGORY_FALLBACK, color: DEFAULT_COLOR_FALLBACK, sort_order: 999, is_system: true },
];

export const DEPRECATED_HOME_BUDGET_CATEGORY_NAMES = [
  "Elektronik",
  "Möbel & Einrichtung",
  "Moebel & Einrichtung",
  "MÃ¶bel & Einrichtung",
];

const normalizeStaticCategoryKey = (value) => String(value || "").trim().toLocaleLowerCase("de-DE");

const DEPRECATED_HOME_BUDGET_CATEGORY_KEYS = new Set(
  DEPRECATED_HOME_BUDGET_CATEGORY_NAMES.map(normalizeStaticCategoryKey),
);

const ACTIVE_HOME_BUDGET_CATEGORY_DEFINITIONS = DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS.filter(
  (entry) => !DEPRECATED_HOME_BUDGET_CATEGORY_KEYS.has(normalizeStaticCategoryKey(entry.name)),
);

export const isDeprecatedHomeBudgetCategory = (value) =>
  DEPRECATED_HOME_BUDGET_CATEGORY_KEYS.has(normalizeStaticCategoryKey(value));

export const isProtectedHomeBudgetCategory = () => false;

export const HOME_BUDGET_CATEGORIES = ACTIVE_HOME_BUDGET_CATEGORY_DEFINITIONS.map(
  (entry) => entry.name,
);

export const HOME_BUDGET_CATEGORY_COLORS = Object.fromEntries(
  ACTIVE_HOME_BUDGET_CATEGORY_DEFINITIONS.map((entry) => [entry.name, entry.color]),
);

export const DEFAULT_HOME_BUDGET_CATEGORY = DEFAULT_CATEGORY_FALLBACK;

const HOME_BUDGET_CATEGORY_LABELS_EN = new Map(
  [
    ["Lebensmittel", "Groceries"],
    ["Hygieneartikel", "Hygiene products"],
    ["Reinigungsmittel", "Cleaning products"],
    ["Haushalt", "Household"],
    ["Elektronik", "Electronics"],
    ["Elektronikartikel", "Electronics"],
    ["Elektronikgeraete", "Electronic devices"],
    ["Elektronikger?te", "Electronic devices"],
    ["Elektronikgeräte", "Electronic devices"],
    ["Reparaturen", "Repairs"],
    ["Abonnements", "Subscriptions"],
    ["Versicherungen", "Insurance"],
    ["Einrichtung", "Furnishings"],
    ["Moebel & Einrichtung", "Furniture & furnishings"],
    ["M?bel & Einrichtung", "Furniture & furnishings"],
    ["Möbel & Einrichtung", "Furniture & furnishings"],
    ["Tanken", "Fuel"],
    ["Ruecklagen", "Reserves"],
    ["R?cklagen", "Reserves"],
    ["Rücklagen", "Reserves"],
    ["Medikamente & Gesundheit", "Medication & health"],
    ["Freizeit", "Leisure"],
    ["Kleidung", "Clothing"],
    [DEFAULT_CATEGORY_FALLBACK, "Other"],
    ["Ohne Kategorie", "Uncategorised"],
  ].map(([key, label]) => [String(key).trim().toLocaleLowerCase("de-DE"), label]),
);

export const getHomeBudgetCategoryLabel = (value, locale = "de") => {
  const raw = normalizeCategoryName(value);
  if (!raw) return locale === "en-GB" ? "Uncategorised" : "Ohne Kategorie";
  if (locale !== "en-GB") return raw;
  return HOME_BUDGET_CATEGORY_LABELS_EN.get(raw.toLocaleLowerCase("de-DE")) || raw;
};

const normalizeCategoryName = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeCategoryKey = (value) => {
  const normalized = normalizeCategoryName(value);
  return normalized ? normalized.toLocaleLowerCase("de-DE") : null;
};

const normalizeCategoryRow = (entry, index = 0) => {
  if (!entry) return null;
  if (typeof entry === "string") {
    return {
      id: `name-${normalizeCategoryKey(entry) || index}`,
      name: entry,
      color: HOME_BUDGET_CATEGORY_COLORS[entry] || DEFAULT_COLOR_FALLBACK,
      sort_order: (index + 1) * 10,
      is_system: Boolean(HOME_BUDGET_CATEGORY_COLORS[entry]),
      is_active: true,
    };
  }

  const name = normalizeCategoryName(entry.name);
  if (!name) return null;

  return {
    id: entry.id || `row-${normalizeCategoryKey(name) || index}`,
    household_id: entry.household_id || null,
    name,
    color: String(entry.color || HOME_BUDGET_CATEGORY_COLORS[name] || DEFAULT_COLOR_FALLBACK),
    sort_order: Number.isFinite(Number(entry.sort_order)) ? Number(entry.sort_order) : (index + 1) * 10,
    is_system: entry.is_system !== false,
    is_active: entry.is_active !== false,
    created_by_user_id: entry.created_by_user_id || null,
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null,
  };
};

export const getDefaultHomeBudgetCategories = () =>
  ACTIVE_HOME_BUDGET_CATEGORY_DEFINITIONS.map((entry, index) => normalizeCategoryRow(entry, index));

export const sortHomeBudgetCategoryRows = (categories = []) =>
  (categories || [])
    .map(normalizeCategoryRow)
    .filter(Boolean)
    .sort((left, right) => {
      if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
      return left.name.localeCompare(right.name, "de-DE");
    });

export const buildSelectableHomeBudgetCategoryRows = (storedCategories = []) => {
  const normalizedStoredCategories = sortHomeBudgetCategoryRows(storedCategories);
  const storedKeys = new Set(
    normalizedStoredCategories.map((entry) => normalizeCategoryKey(entry.name)).filter(Boolean),
  );
  const hiddenDefaultKeys = new Set(
    normalizedStoredCategories
      .filter((entry) => entry.is_active === false)
      .map((entry) => normalizeCategoryKey(entry.name))
      .filter(Boolean),
  );
  const defaultCategories = getDefaultHomeBudgetCategories().filter((entry) => {
    const key = normalizeCategoryKey(entry.name);
    return key && !storedKeys.has(key) && !hiddenDefaultKeys.has(key);
  });
  const visibleStoredCategories = normalizedStoredCategories.filter((entry) => entry.is_active !== false);

  return sortHomeBudgetCategoryRows([...defaultCategories, ...visibleStoredCategories]);
};

export const findHomeBudgetCategory = (value, categories = []) => {
  const targetKey = normalizeCategoryKey(value);
  if (!targetKey) return null;

  return sortHomeBudgetCategoryRows(categories).find(
    (entry) => normalizeCategoryKey(entry.name) === targetKey,
  ) || null;
};

export const normalizeHomeBudgetCategory = (value, fallback = null, options = {}) => {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return fallback;

  const categoryRow = findHomeBudgetCategory(
    normalized,
    options.categories && options.categories.length > 0
      ? options.categories
      : getDefaultHomeBudgetCategories(),
  );

  if (categoryRow?.name) return categoryRow.name;
  if (options.preserveUnknown) return normalized;
  return fallback;
};

export const getActiveHomeBudgetCategories = (categories = []) =>
  sortHomeBudgetCategoryRows(categories).filter((entry) => entry.is_active !== false);

export const getActiveHomeBudgetCategoryNames = (categories = []) =>
  getActiveHomeBudgetCategories(categories).map((entry) => entry.name);

export const getSelectableHomeBudgetCategoryNames = ({
  categories = [],
  currentValue = null,
} = {}) => {
  const activeNames = getActiveHomeBudgetCategoryNames(categories);
  const currentName = normalizeHomeBudgetCategory(currentValue, null, {
    categories,
    preserveUnknown: true,
  });

  if (!currentName || activeNames.includes(currentName)) return activeNames;
  return [...activeNames, currentName];
};

export const buildRelevantHomeBudgetCategoryNames = ({
  categories = [],
  usedCategories = [],
} = {}) => {
  const normalizedRows = sortHomeBudgetCategoryRows(categories);
  const usedKeys = new Set(
    (usedCategories || [])
      .map((value) => normalizeCategoryKey(value))
      .filter(Boolean),
  );

  const relevantRows = normalizedRows.filter(
    (entry) => entry.is_active !== false || usedKeys.has(normalizeCategoryKey(entry.name)),
  );

  const result = relevantRows.map((entry) => entry.name);
  const knownKeys = new Set(result.map((name) => normalizeCategoryKey(name)));

  (usedCategories || []).forEach((value) => {
    const normalized = normalizeCategoryName(value);
    const normalizedKey = normalizeCategoryKey(value);
    if (!normalized || !normalizedKey || knownKeys.has(normalizedKey)) return;
    knownKeys.add(normalizedKey);
    result.push(normalized);
  });

  return result;
};

const stringToColor = (value) => {
  const input = normalizeCategoryName(value) || DEFAULT_COLOR_FALLBACK;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 55%)`;
};

// Palette of visually distinct chart colors used when deduplicating
const CHART_DEDUP_PALETTE = [
  "#10B981", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899", "#F43F5E", "#F97316", "#F59E0B",
  "#EAB308", "#84CC16", "#22C55E", "#14B8A6", "#0EA5E9",
  "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
  "#DC2626", "#0891B2", "#4F46E5", "#C026D3", "#EA580C",
];

// Returns true for colors that appear black/near-black in charts
const isTooDark = (hex) => {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return true;
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance: anything below 25/255 is indistinguishable from black
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 25;
};

export const buildHomeBudgetCategoryColorMap = ({
  categories = [],
  usedCategories = [],
} = {}) => {
  const colorMap = { ...HOME_BUDGET_CATEGORY_COLORS };

  sortHomeBudgetCategoryRows(categories).forEach((entry) => {
    colorMap[entry.name] = entry.color || colorMap[entry.name] || stringToColor(entry.name);
  });

  (usedCategories || []).forEach((value) => {
    const normalized = normalizeHomeBudgetCategory(value, null, {
      categories,
      preserveUnknown: true,
    });
    if (!normalized || colorMap[normalized]) return;
    colorMap[normalized] = stringToColor(normalized);
  });

  if (!colorMap[DEFAULT_CATEGORY_FALLBACK]) {
    colorMap[DEFAULT_CATEGORY_FALLBACK] = DEFAULT_COLOR_FALLBACK;
  }

  // 1. Replace near-black colors (stored as #000000 or similar) with a computed distinct color
  Object.keys(colorMap).forEach((name) => {
    if (isTooDark(colorMap[name])) {
      colorMap[name] = stringToColor(name);
    }
  });

  // 2. Deduplicate: when two categories share the exact same color, replace the later one
  const seen = new Map(); // normalizedHex → first category that claimed it
  const usedHexes = () => new Set(Object.values(colorMap).map((c) => c.toUpperCase()));

  Object.keys(colorMap).forEach((name) => {
    const key = colorMap[name].toUpperCase();
    if (seen.has(key)) {
      // Find the first palette color not yet used by any other category
      const taken = usedHexes();
      const replacement = CHART_DEDUP_PALETTE.find((c) => !taken.has(c.toUpperCase()))
        ?? stringToColor(name + "​"); // zero-width-space suffix ensures different hash
      colorMap[name] = replacement;
      seen.set(replacement.toUpperCase(), name);
    } else {
      seen.set(key, name);
    }
  });

  return colorMap;
};

export const getHomeBudgetCategoryColor = (value, colorMap = {}) => {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return DEFAULT_COLOR_FALLBACK;
  return colorMap[normalized] || HOME_BUDGET_CATEGORY_COLORS[normalized] || stringToColor(normalized);
};
