const DEFAULT_CATEGORY_FALLBACK = "Sonstiges";
const DEFAULT_COLOR_FALLBACK = "#6B7280";

export const DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS = [
  { name: "Lebensmittel", color: "#10B981", sort_order: 10, is_system: true },
  { name: "Hygieneartikel", color: "#F97316", sort_order: 20, is_system: true },
  { name: "Reinigungsmittel", color: "#06B6D4", sort_order: 30, is_system: true },
  { name: "Haushalt", color: "#3B82F6", sort_order: 40, is_system: true },
  { name: "Elektronikartikel", color: "#6366F1", sort_order: 50, is_system: true },
  { name: "Elektronikgeräte", color: "#8B5CF6", sort_order: 60, is_system: true },
  { name: "Reparaturen", color: "#F59E0B", sort_order: 70, is_system: true },
  { name: "Abonnements", color: "#A855F7", sort_order: 80, is_system: true },
  { name: "Versicherungen", color: "#EC4899", sort_order: 90, is_system: true },
  { name: "Einrichtung", color: "#14B8A6", sort_order: 100, is_system: true },
  { name: "Tanken", color: "#0EA5E9", sort_order: 110, is_system: true },
  { name: "Rücklagen", color: "#FB923C", sort_order: 120, is_system: true },
  { name: "Medikamente & Gesundheit", color: "#EF4444", sort_order: 130, is_system: true },
  { name: "Freizeit", color: "#22C55E", sort_order: 140, is_system: true },
  { name: "Kleidung", color: "#F472B6", sort_order: 150, is_system: true },
  { name: DEFAULT_CATEGORY_FALLBACK, color: DEFAULT_COLOR_FALLBACK, sort_order: 999, is_system: true },
];

export const HOME_BUDGET_CATEGORIES = DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS.map(
  (entry) => entry.name,
);

export const HOME_BUDGET_CATEGORY_COLORS = Object.fromEntries(
  DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS.map((entry) => [entry.name, entry.color]),
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
  DEFAULT_HOME_BUDGET_CATEGORY_DEFINITIONS.map((entry, index) => normalizeCategoryRow(entry, index));

export const sortHomeBudgetCategoryRows = (categories = []) =>
  (categories || [])
    .map(normalizeCategoryRow)
    .filter(Boolean)
    .sort((left, right) => {
      if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
      return left.name.localeCompare(right.name, "de-DE");
    });

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

  return colorMap;
};

export const getHomeBudgetCategoryColor = (value, colorMap = {}) => {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return DEFAULT_COLOR_FALLBACK;
  return colorMap[normalized] || HOME_BUDGET_CATEGORY_COLORS[normalized] || stringToColor(normalized);
};
