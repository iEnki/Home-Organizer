const normalizeCategoryName = (value) => String(value || "").trim();

const ensureNoQueryError = (result) => {
  if (result?.error) throw result.error;
  return result;
};

const countRows = async (query) => {
  const result = ensureNoQueryError(await query);
  return Number(result.count || 0);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hasRealCategoryId = (category) => UUID_RE.test(String(category?.id || ""));

const validateDeleteInput = ({
  category,
  targetCategoryName,
  requireTarget = false,
  allowSystemCategoryDelete = false,
}) => {
  const sourceName = normalizeCategoryName(category?.name);
  const targetName = normalizeCategoryName(targetCategoryName);

  if (!category?.id || !sourceName) {
    throw new Error("Kategorie konnte nicht eindeutig bestimmt werden.");
  }
  if (category.is_system && !allowSystemCategoryDelete) {
    throw new Error("Systemkategorien können nicht gelöscht werden.");
  }
  if (requireTarget && !targetName) {
    throw new Error("Bitte wähle eine Zielkategorie aus.");
  }
  if (requireTarget && sourceName.toLocaleLowerCase("de-DE") === targetName.toLocaleLowerCase("de-DE")) {
    throw new Error("Die Zielkategorie muss eine andere Kategorie sein.");
  }

  return { sourceName, targetName };
};

export const emptyCategoryDeleteImpact = {
  budgetEntries: 0,
  budgetLimits: 0,
  splitDefaults: 0,
  invoicePositions: 0,
  total: 0,
};

export const hasCategoryDeleteReferences = (impact) => Number(impact?.total || 0) > 0;

export const loadCategoryDeleteImpact = async ({ supabase, householdId, categoryName }) => {
  const sourceName = normalizeCategoryName(categoryName);
  if (!supabase || !householdId || !sourceName) return emptyCategoryDeleteImpact;

  const [budgetEntries, budgetLimits, splitDefaults, invoicePositions] = await Promise.all([
    countRows(
      supabase
        .from("budget_posten")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .is("archived_at", null)
        .eq("kategorie", sourceName),
    ),
    countRows(
      supabase
        .from("home_budget_limits")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("kategorie", sourceName),
    ),
    countRows(
      supabase
        .from("home_budget_split_defaults")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("kategorie", sourceName),
    ),
    countRows(
      supabase
        .from("rechnungs_positionen")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("klassifikation->>budget_kategorie", sourceName),
    ),
  ]);

  return {
    budgetEntries,
    budgetLimits,
    splitDefaults,
    invoicePositions,
    total: budgetEntries + budgetLimits + splitDefaults + invoicePositions,
  };
};

const moveUniqueCategoryRows = async ({ supabase, table, householdId, sourceName, targetName }) => {
  const [{ data: sourceRows, error: sourceError }, { data: targetRows, error: targetError }] = await Promise.all([
    supabase.from(table).select("id").eq("household_id", householdId).eq("kategorie", sourceName),
    supabase.from(table).select("id").eq("household_id", householdId).eq("kategorie", targetName),
  ]);

  if (sourceError) throw sourceError;
  if (targetError) throw targetError;
  if (!sourceRows?.length) return;

  if (targetRows?.length) {
    ensureNoQueryError(
      await supabase.from(table).delete().eq("household_id", householdId).eq("kategorie", sourceName),
    );
    return;
  }

  ensureNoQueryError(
    await supabase
      .from(table)
      .update({ kategorie: targetName })
      .eq("household_id", householdId)
      .eq("kategorie", sourceName),
  );
};

const moveInvoicePositionCategories = async ({ supabase, householdId, sourceName, targetName }) => {
  const { data, error } = await supabase
    .from("rechnungs_positionen")
    .select("id, klassifikation")
    .eq("household_id", householdId)
    .eq("klassifikation->>budget_kategorie", sourceName);

  if (error) throw error;

  for (const row of data || []) {
    const klassifikation =
      row.klassifikation && typeof row.klassifikation === "object" && !Array.isArray(row.klassifikation)
        ? { ...row.klassifikation }
        : {};
    klassifikation.budget_kategorie = targetName;

    ensureNoQueryError(
      await supabase
        .from("rechnungs_positionen")
        .update({ klassifikation })
        .eq("id", row.id),
    );
  }
};

const persistCategoryDeleteMarker = async ({ supabase, householdId, userId, category }) => {
  if (!householdId) {
    throw new Error("Haushalt konnte nicht bestimmt werden.");
  }

  if (hasRealCategoryId(category)) {
    ensureNoQueryError(
      await supabase
        .from("home_budget_categories")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", category.id),
    );
    return;
  }

  const sourceName = normalizeCategoryName(category?.name);
  const { data: existingRows, error: existingError } = await supabase
    .from("home_budget_categories")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", sourceName)
    .limit(1);

  if (existingError) throw existingError;

  const existingId = existingRows?.[0]?.id;
  if (existingId) {
    ensureNoQueryError(
      await supabase
        .from("home_budget_categories")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", existingId),
    );
    return;
  }

  ensureNoQueryError(
    await supabase.from("home_budget_categories").insert({
      household_id: householdId,
      name: sourceName,
      color: category.color || "#6B7280",
      sort_order: Number.isFinite(Number(category.sort_order)) ? Number(category.sort_order) : 999,
      is_system: Boolean(category.is_system),
      is_active: false,
      created_by_user_id: userId || category.created_by_user_id || null,
    }),
  );
};

const finalizeCategoryDelete = async ({
  supabase,
  householdId,
  userId,
  category,
  persistAsInactive = false,
}) => {
  if (persistAsInactive) {
    await persistCategoryDeleteMarker({ supabase, householdId, userId, category });
    return;
  }

  if (hasRealCategoryId(category)) {
    ensureNoQueryError(await supabase.from("home_budget_categories").delete().eq("id", category.id));
    return;
  }

  ensureNoQueryError(
    await supabase
      .from("home_budget_categories")
      .delete()
      .eq("household_id", householdId)
      .eq("name", normalizeCategoryName(category?.name)),
  );
};

export const deleteBudgetCategoryDirect = async ({
  supabase,
  householdId,
  userId,
  category,
  allowSystemCategoryDelete = false,
  persistAsInactive = false,
}) => {
  validateDeleteInput({ category, allowSystemCategoryDelete });
  await finalizeCategoryDelete({ supabase, householdId, userId, category, persistAsInactive });
};

export const reassignAndDeleteBudgetCategory = async ({
  supabase,
  householdId,
  userId,
  category,
  targetCategoryName,
  allowSystemCategoryDelete = false,
  persistAsInactive = false,
}) => {
  const { sourceName, targetName } = validateDeleteInput({
    category,
    targetCategoryName,
    requireTarget: true,
    allowSystemCategoryDelete,
  });

  if (!supabase || !householdId) {
    throw new Error("Haushalt konnte nicht bestimmt werden.");
  }

  ensureNoQueryError(
    await supabase
      .from("budget_posten")
      .update({ kategorie: targetName })
      .eq("household_id", householdId)
      .is("archived_at", null)
      .eq("kategorie", sourceName),
  );

  await moveUniqueCategoryRows({
    supabase,
    table: "home_budget_limits",
    householdId,
    sourceName,
    targetName,
  });
  await moveUniqueCategoryRows({
    supabase,
    table: "home_budget_split_defaults",
    householdId,
    sourceName,
    targetName,
  });
  await moveInvoicePositionCategories({ supabase, householdId, sourceName, targetName });

  await finalizeCategoryDelete({ supabase, householdId, userId, category, persistAsInactive });
};
