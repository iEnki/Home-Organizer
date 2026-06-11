const hasValue = (value) => value !== null && value !== undefined && value !== "";

function hasNutrition(recipe) {
  return [
    recipe?.kalorien_pro_portion,
    recipe?.protein_pro_portion_g,
    recipe?.kohlenhydrate_pro_portion_g,
    recipe?.fett_pro_portion_g,
    recipe?.kalorien_gesamt,
  ].some(hasValue);
}

function hasUncertainAmounts(recipe, ingredients = []) {
  const warningText = Array.isArray(recipe?.warnings)
    ? recipe.warnings.join(" ").toLowerCase()
    : String(recipe?.warnings || "").toLowerCase();
  return (
    ingredients.some((item) => item?.geschaetzt) ||
    warningText.includes("menge") ||
    warningText.includes("quantity") ||
    warningText.includes("estimated") ||
    warningText.includes("geschaetzt") ||
    warningText.includes("geschätzt")
  );
}

export function getRecipeQualityBadges(recipe, ingredients = [], t = null) {
  if (!recipe) return [];
  const translate = (key, fallback) => (t ? t(`quality.${key}`, { defaultValue: fallback }) : fallback);
  const badges = [];

  if (["video", "web", "ki"].includes(recipe.import_typ)) {
    badges.push({ key: "aiImport", label: translate("aiImport", "KI-Import"), tone: "primary" });
  }
  if (recipe.status === "review") {
    badges.push({ key: "reviewOpen", label: translate("reviewOpen", "Review offen"), tone: "amber" });
  }
  if (recipe.quelle_url) {
    badges.push({ key: "source", label: translate("source", "Quelle"), tone: "slate" });
  }
  if (hasNutrition(recipe)) {
    badges.push({ key: "nutritionEstimated", label: translate("nutritionEstimated", "Naehrwerte geschaetzt"), tone: "emerald" });
  }
  if (hasUncertainAmounts(recipe, ingredients)) {
    badges.push({ key: "uncertainAmounts", label: translate("uncertainAmounts", "Unsichere Mengen"), tone: "amber" });
  }

  return badges;
}

export function getBadgeToneClass(tone) {
  const tones = {
    primary: "bg-primary-500/10 text-primary-600 dark:text-primary-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    slate: "bg-light-bg text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary",
  };
  return tones[tone] || tones.slate;
}
