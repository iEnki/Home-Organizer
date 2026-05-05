import { cleanKiJsonResponse, getKiClient } from "./kiClient";

export const normalizeContentLocale = (locale) => (locale === "en" || locale === "en-GB" ? "en-GB" : "de");

const localizedFor = (row, locale) => row?.localized_content?.[normalizeContentLocale(locale)] || null;

const asArray = (value) => (Array.isArray(value) ? value : []);

const SHOPPING_NAME_TRANSLATIONS = {
  de: new Map([
    ["baking powder", "Backpulver"],
    ["butter sugar", "Puderzucker"],
    ["cherry jam", "Kirschmarmelade"],
    ["cooking oil", "Speiseoel"],
    ["flour", "Mehl"],
    ["milk", "Milch"],
    ["quark", "Quark"],
    ["salt", "Salz"],
    ["strawberry jam", "Erdbeermarmelade"],
    ["sugar", "Zucker"],
    ["vanilla sugar", "Vanillezucker"],
  ]),
  "en-GB": new Map([
    ["backpulver", "Baking Powder"],
    ["butterzucker", "Butter Sugar"],
    ["erdbeermarmelade", "Strawberry Jam"],
    ["kirschmarmelade", "Cherry Jam"],
    ["mehl", "Flour"],
    ["milch", "Milk"],
    ["quark", "Quark"],
    ["salz", "Salt"],
    ["speiseoel", "Cooking Oil"],
    ["speiseöl", "Cooking Oil"],
    ["vanillezucker", "Vanilla Sugar"],
    ["zucker", "Sugar"],
  ]),
};

const UNIT_TRANSLATIONS = {
  de: new Map([
    ["pinch", "Prise"],
    ["packet", "Paeckchen"],
    ["packets", "Paeckchen"],
    ["tsp", "Teeloeffel"],
    ["teaspoon", "Teeloeffel"],
    ["teaspoons", "Teeloeffel"],
    ["tbsp", "Essloeffel"],
    ["tablespoon", "Essloeffel"],
    ["tablespoons", "Essloeffel"],
  ]),
  "en-GB": new Map([
    ["prise", "pinch"],
    ["paeckchen", "packet"],
    ["päckchen", "packet"],
    ["teeloeffel", "tsp"],
    ["teelöffel", "tsp"],
    ["essloeffel", "tbsp"],
    ["esslöffel", "tbsp"],
  ]),
};

const normalizeLookupKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const applyLocalShoppingTranslation = (value, locale) => {
  const targetLocale = normalizeContentLocale(locale);
  const key = normalizeLookupKey(value);
  return SHOPPING_NAME_TRANSLATIONS[targetLocale]?.get(key) || UNIT_TRANSLATIONS[targetLocale]?.get(key) || null;
};

const looksEnglishShoppingText = (value) => {
  const key = normalizeLookupKey(value);
  return SHOPPING_NAME_TRANSLATIONS.de.has(key) || UNIT_TRANSLATIONS.de.has(key);
};

const looksGermanShoppingValue = (value) => {
  const key = normalizeLookupKey(value);
  return SHOPPING_NAME_TRANSLATIONS["en-GB"].has(key) || UNIT_TRANSLATIONS["en-GB"].has(key) || /[äöüß]/i.test(String(value || ""));
};

export const buildRecipeLocalizedPayload = (recipe = {}, ingredients = []) => ({
  title: recipe.titel || recipe.title || "",
  description: recipe.beschreibung || recipe.description || "",
  instructions: asArray(recipe.anleitung || recipe.instructions).map(String),
  notes: recipe.notizen || recipe.notes || "",
  tags: asArray(recipe.tags).map(String),
  ingredients: asArray(ingredients).map((item) => ({
    name: item.name || "",
    amount_text: item.menge_text || [item.menge, item.einheit].filter(Boolean).join(" "),
    original_text: item.original_text || "",
  })),
});

export const hasLocalizedRecipeContent = (recipe, locale) => {
  const localized = localizedFor(recipe, locale);
  return Boolean(localized?.title || localized?.description || localized?.instructions?.length || localized?.ingredients?.length);
};

export const resolveLocalizedRecipe = (recipe, locale) => {
  const localized = localizedFor(recipe, locale);
  return {
    title: localized?.title || localized?.titel || recipe?.titel || "",
    description: localized?.description || localized?.beschreibung || recipe?.beschreibung || "",
    instructions: asArray(localized?.instructions || localized?.anleitung || recipe?.anleitung).map(String),
    notes: localized?.notes || localized?.notizen || recipe?.notizen || "",
    tags: asArray(localized?.tags || recipe?.tags).map(String),
  };
};

export const resolveLocalizedRecipeIngredients = (recipe, ingredients = [], locale) => {
  const localizedIngredients = asArray(localizedFor(recipe, locale)?.ingredients);
  return asArray(ingredients).map((item, index) => {
    const localized = localizedIngredients[index] || {};
    return {
      ...item,
      displayName: localized.name || item.name || "",
      displayAmountText: localized.amount_text || localized.menge_text || item.menge_text || "",
      displayOriginalText: localized.original_text || item.original_text || "",
    };
  });
};

export const resolveLocalizedShoppingEntry = (entry, locale) => {
  const localized = localizedFor(entry, locale);
  return {
    name: localized?.name || entry?.name || "",
    notes: localized?.notizen || localized?.notes || entry?.notizen || "",
    originalText: localized?.original_text || entry?.original_text || "",
  };
};

export const hasLocalizedShoppingContent = (entry, locale) => {
  const targetLocale = normalizeContentLocale(locale);
  const localized = localizedFor(entry, locale);
  if (!localized?.name && !localized?.notes && !localized?.notizen && !localized?.original_text) return false;
  if (targetLocale === "de" && looksEnglishShoppingText(localized?.name)) return false;
  if (targetLocale === "en-GB" && looksGermanShoppingValue(localized?.name)) return false;
  return true;
};

const parseJsonObject = (raw) => {
  const cleaned = cleanKiJsonResponse(raw || "{}", "object") || raw || "{}";
  return JSON.parse(cleaned);
};

// Kept as a helper for legacy language detection edge cases.
// eslint-disable-next-line no-unused-vars
const looksGermanShoppingText = (entry) => {
  const text = `${entry?.name || ""} ${entry?.notizen || ""} ${entry?.original_text || ""}`.toLowerCase();
  return /[äöüß]/.test(text) || /\b(aus|rezept|stueck|stück|packung|milch|speiseoel|speiseöl|salz|zucker|mehl|gemuese|gemüse|kaese|käse)\b/.test(text);
};

const pickShoppingSourceForTranslation = (entry, targetLocale) => {
  const preferredLocale = targetLocale === "de" ? "en-GB" : "de";
  const preferred = entry?.localized_content?.[preferredLocale];
  const fallbackLocale = Object.keys(entry?.localized_content || {}).find((key) => key !== targetLocale);
  const fallback = fallbackLocale ? entry.localized_content[fallbackLocale] : null;
  const source = preferred || fallback || {};
  return {
    name: source.name || entry?.name || "",
    notes: source.notes || source.notizen || entry?.notizen || "",
    original_text: source.original_text || entry?.original_text || source.name || entry?.name || "",
  };
};

export async function translateRecipeIfMissing({ supabase, userId, recipe, ingredients = [], locale }) {
  const targetLocale = normalizeContentLocale(locale);
  if (!recipe?.id || !supabase || hasLocalizedRecipeContent(recipe, targetLocale)) return recipe;

  const base = buildRecipeLocalizedPayload(recipe, ingredients);
  if ((recipe.sprache === targetLocale || recipe.ziel_locale === targetLocale) && base.title) {
    const nextContent = { ...(recipe.localized_content || {}), [targetLocale]: base };
    await supabase.from("home_rezepte").update({ localized_content: nextContent }).eq("id", recipe.id);
    return { ...recipe, localized_content: nextContent };
  }

  const targetName = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  const { client, model } = await getKiClient(userId);
  const response = await client.chat.completions.create({
    model,
    context: "kochbuch",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Translate recipe display content to ${targetName}. Return only JSON. Preserve quantities, units, ingredient order and step order. Do not invent ingredients.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          target_locale: targetLocale,
          required_shape: {
            title: "string",
            description: "string",
            instructions: ["string"],
            notes: "string",
            tags: ["string"],
            ingredients: [{ name: "string", amount_text: "string", original_text: "string" }],
          },
          recipe: base,
        }),
      },
    ],
  });
  const translated = parseJsonObject(response?.choices?.[0]?.message?.content || "{}");
  const nextPayload = {
    title: translated.title || base.title,
    description: translated.description || base.description,
    instructions: asArray(translated.instructions).length ? asArray(translated.instructions).map(String) : base.instructions,
    notes: translated.notes || base.notes,
    tags: asArray(translated.tags).length ? asArray(translated.tags).map(String) : base.tags,
    ingredients: asArray(translated.ingredients).length ? asArray(translated.ingredients) : base.ingredients,
  };
  const nextContent = { ...(recipe.localized_content || {}), [targetLocale]: nextPayload };
  await supabase.from("home_rezepte").update({ localized_content: nextContent }).eq("id", recipe.id);
  return { ...recipe, localized_content: nextContent };
}

export async function translateShoppingEntryIfMissing({ supabase, userId, entry, locale }) {
  const targetLocale = normalizeContentLocale(locale);
  if (!entry?.id || !supabase || hasLocalizedShoppingContent(entry, targetLocale)) return entry;
  const sourceItem = pickShoppingSourceForTranslation(entry, targetLocale);
  const localName = applyLocalShoppingTranslation(sourceItem.name, targetLocale);
  const localOriginalText = applyLocalShoppingTranslation(sourceItem.original_text, targetLocale);

  const targetName = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  const { client, model } = await getKiClient(userId);
  const response = await client.chat.completions.create({
    model,
    context: "kochbuch",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `Translate a shopping-list item to ${targetName}. Return only JSON. Do not translate category values.` },
      {
        role: "user",
        content: JSON.stringify({
          required_shape: { name: "string", notes: "string", original_text: "string" },
          item: sourceItem,
        }),
      },
    ],
  });
  const translated = parseJsonObject(response?.choices?.[0]?.message?.content || "{}");
  const nextContent = {
    ...(entry.localized_content || {}),
    [targetLocale]: {
      name: translated.name || localName || localOriginalText || sourceItem.name || entry.name || "",
      notes: translated.notes || sourceItem.notes || entry.notizen || "",
      original_text: translated.original_text || localOriginalText || localName || sourceItem.original_text || entry.original_text || entry.name || "",
    },
  };
  await supabase.from("home_einkaufliste").update({ localized_content: nextContent }).eq("id", entry.id);
  return { ...entry, localized_content: nextContent };
}

export async function translateShoppingEntriesIfMissing({ supabase, userId, entries = [], locale }) {
  const targetLocale = normalizeContentLocale(locale);
  const missingEntries = asArray(entries).filter(
    (entry) => entry?.id && !hasLocalizedShoppingContent(entry, targetLocale)
  );
  if (!supabase || !userId || missingEntries.length === 0) return [];

  const sourceItems = missingEntries.map((entry) => {
    const sourceItem = pickShoppingSourceForTranslation(entry, targetLocale);
    return {
      id: entry.id,
      item: sourceItem,
      local_name: applyLocalShoppingTranslation(sourceItem.name, targetLocale),
      local_original_text: applyLocalShoppingTranslation(sourceItem.original_text, targetLocale),
    };
  });

  const targetName = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  const { client, model } = await getKiClient(userId);
  const response = await client.chat.completions.create({
    model,
    context: "kochbuch",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Translate shopping-list item display content to ${targetName}. Return only JSON. Do not translate category values. Preserve quantities and units.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          target_locale: targetLocale,
          required_shape: {
            items: [{ id: "string", name: "string", notes: "string", original_text: "string" }],
          },
          items: sourceItems.map(({ id, item }) => ({ id, ...item })),
        }),
      },
    ],
  });

  const translated = parseJsonObject(response?.choices?.[0]?.message?.content || "{}");
  const translatedItems = asArray(translated.items);
  const translatedById = new Map(translatedItems.map((item) => [String(item.id), item]));

  const updatedEntries = await Promise.all(
    sourceItems.map(async ({ id, item: sourceItem, local_name: localName, local_original_text: localOriginalText }) => {
      const entry = missingEntries.find((candidate) => candidate.id === id);
      const translatedItem = translatedById.get(String(id)) || {};
      const nextContent = {
        ...(entry.localized_content || {}),
        [targetLocale]: {
          name: translatedItem.name || localName || localOriginalText || sourceItem.name || entry.name || "",
          notes: translatedItem.notes || sourceItem.notes || entry.notizen || "",
          original_text:
            translatedItem.original_text ||
            localOriginalText ||
            localName ||
            sourceItem.original_text ||
            entry.original_text ||
            entry.name ||
            "",
        },
      };
      await supabase.from("home_einkaufliste").update({ localized_content: nextContent }).eq("id", id);
      return { ...entry, localized_content: nextContent };
    })
  );

  return updatedEntries;
}
