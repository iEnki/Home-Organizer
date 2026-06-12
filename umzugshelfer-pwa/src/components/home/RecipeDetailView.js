import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  CalendarPlus,
  Check,
  ChefHat,
  Clock,
  ExternalLink,
  Heart,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Utensils,
  Users,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { formatIngredientAmount } from "../../utils/recipeNormalize";
import { nutritionSummaryParts } from "../../utils/recipeNutrition";
import SearchableSelect from "../ui/SearchableSelect";
import RecipeCookLogPanel from "./RecipeCookLogPanel";
import RecipeCookModeModal from "./RecipeCookModeModal";
import RecipeQualityBadges from "./RecipeQualityBadges";
import { getRecipeImageUrl } from "../../utils/recipeImages";

export default function RecipeDetailView({
  recipe,
  display,
  ingredients,
  onBack,
  onEdit,
  onDelete,
  onToggleFavorite,
  onAddShopping,
  onPlanRecipe,
  onUpdateGroup,
  onRecalculateNutrition,
  supabase,
  userId,
  toast,
  groupOptions = [],
  nutritionBusy = false,
}) {
  const { t } = useTranslation("recipes");
  const reduced = useReducedMotion();
  const [servings, setServings] = useState(recipe?.portionen || 4);
  const [groupValue, setGroupValue] = useState(recipe?.gruppe || "");
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [cookLogSignal, setCookLogSignal] = useState(0);

  useEffect(() => {
    setGroupValue(recipe?.gruppe || "");
  }, [recipe?.id, recipe?.gruppe]);

  if (!recipe) return null;

  const factorBase = recipe.portionen || 4;
  const nutritionParts = nutritionSummaryParts(recipe, t);
  const recipeWarnings = Array.isArray(recipe.warnings)
    ? recipe.warnings.map((warning) => String(warning || "").trim()).filter(Boolean)
    : [];
  const minutes =
    recipe.gesamtzeit_minuten ||
    (recipe.vorbereitungszeit_minuten || 0) + (recipe.kochzeit_minuten || 0) ||
    null;
  const imageUrl = getRecipeImageUrl(recipe);

  const groupItems = [
    { value: "", label: t("detail.noGroup") },
    ...groupOptions.map((option) => ({ value: option, label: option })),
  ];

  const currentGroupName = recipe.gruppe?.trim() || null;
  const groupChanged = (groupValue || "").trim() !== (recipe.gruppe || "").trim();

  const handleSaveGroup = () => {
    onUpdateGroup?.(groupValue);
    setGroupEditorOpen(false);
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="mx-auto max-w-5xl space-y-4 px-4 py-4 lg:px-6"
    >
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-light-text-secondary transition-colors hover:text-primary-500 dark:text-dark-text-secondary dark:hover:text-primary-400"
      >
        <ArrowLeft size={15} />
        {t("detail.back")}
      </button>

      {/* ── Main card ── */}
      <div className="rounded-card border border-light-border bg-light-card shadow-elevation-2 dark:border-dark-border dark:bg-canvas-2">

        {/* Hero image */}
        <div className="relative">
          {imageUrl ? (
            <>
              <div className="aspect-[16/9] sm:aspect-[21/9] overflow-hidden rounded-t-card bg-canvas-3">
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.closest(".relative");
                    if (parent) parent.dataset.imgError = "1";
                  }}
                />
              </div>
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              {/* Title on image */}
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                <h1 className="text-xl font-bold leading-snug text-white drop-shadow sm:text-2xl">
                  {display?.title || recipe.titel}
                </h1>
                {(display?.description || recipe.beschreibung) && (
                  <p className="mt-1 line-clamp-2 text-sm text-white/80">
                    {display?.description || recipe.beschreibung}
                  </p>
                )}
              </div>
              {/* Favorite overlay button */}
              <motion.button
                type="button"
                onClick={() => onToggleFavorite(recipe)}
                whileTap={reduced ? {} : { scale: 0.80 }}
                className={`absolute right-3 top-3 rounded-full p-2.5 shadow-elevation-2 backdrop-blur-sm transition-colors ${
                  recipe.favorisiert
                    ? "bg-red-500/90 text-white"
                    : "bg-black/40 text-white hover:bg-black/60"
                }`}
              >
                <Heart size={16} fill={recipe.favorisiert ? "currentColor" : "none"} />
              </motion.button>
            </>
          ) : (
            /* No image fallback */
            <div className="flex items-center gap-4 p-5 sm:p-6">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-card-sm bg-primary-500/10">
                <ChefHat size={24} className="text-primary-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main sm:text-2xl">
                  {display?.title || recipe.titel}
                </h1>
                {(display?.description || recipe.beschreibung) && (
                  <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    {display?.description || recipe.beschreibung}
                  </p>
                )}
              </div>
              <motion.button
                type="button"
                onClick={() => onToggleFavorite(recipe)}
                whileTap={reduced ? {} : { scale: 0.80 }}
                className={`flex-shrink-0 rounded-full p-2 transition-colors ${
                  recipe.favorisiert
                    ? "bg-red-500/10 text-red-500"
                    : "text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                }`}
              >
                <Heart size={18} fill={recipe.favorisiert ? "currentColor" : "none"} />
              </motion.button>
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 sm:p-5">

          {/* ── Action bar + Meta chips ── */}
          <div className="flex flex-wrap items-center gap-2">
            {recipe.quelle_url && (
              <motion.a
                href={recipe.quelle_url}
                target="_blank"
                rel="noreferrer"
                whileTap={reduced ? {} : { scale: 0.96 }}
                className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500/10 px-3 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-500/20 dark:text-primary-400"
              >
                <ExternalLink size={13} /> {t("detail.openSource")}
              </motion.a>
            )}
            <motion.button
              type="button"
              onClick={onEdit}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-1.5 text-sm text-light-text-main transition-colors hover:border-primary-500/40 hover:bg-light-hover dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
            >
              <Pencil size={13} /> {t("detail.edit")}
            </motion.button>
            <motion.button
              type="button"
              onClick={onDelete}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="inline-flex items-center gap-1.5 rounded-pill border border-red-500/30 px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Trash2 size={13} /> {t("detail.delete")}
            </motion.button>

            {/* Spacer */}
            <div className="hidden h-5 w-px bg-light-border dark:bg-dark-border sm:block" />

            {/* Meta chips */}
            <span className="inline-flex items-center gap-1 rounded-pill bg-light-bg px-2.5 py-1 text-xs text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary">
              <Users size={11} /> {servings}
            </span>
            {minutes && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-light-bg px-2.5 py-1 text-xs text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary">
                <Clock size={11} /> {minutes} min
              </span>
            )}
            {recipe.quelle_plattform && (
              <span className="hidden rounded-pill bg-light-bg px-2.5 py-1 text-xs text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary sm:inline">
                {recipe.quelle_plattform}
              </span>
            )}

            {/* Tags */}
            {(display?.tags || recipe.tags || []).slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="hidden rounded-pill bg-primary-500/10 px-2.5 py-1 text-xs text-primary-600 dark:text-primary-400 sm:inline"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* ── Gruppe / Liste — hinter Icon ── */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={() => setGroupEditorOpen((v) => !v)}
              whileTap={reduced ? {} : { scale: 0.92 }}
              title={t("detail.groupLabel")}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                groupEditorOpen
                  ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                  : "border-light-border text-light-text-secondary hover:border-primary-500/40 hover:text-light-text-main dark:border-dark-border dark:text-dark-text-secondary dark:hover:text-dark-text-main"
              }`}
            >
              <BookMarked size={13} />
              {currentGroupName ? (
                <span className="max-w-[140px] truncate">{currentGroupName}</span>
              ) : (
                <span>{t("detail.noGroup")}</span>
              )}
            </motion.button>
          </div>

          {/* Inline group editor */}
          <AnimatePresence>
            {groupEditorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <div className="flex items-center gap-2 rounded-card-sm border border-light-border bg-light-bg p-2.5 dark:border-dark-border dark:bg-canvas-1">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      value={groupValue}
                      onValueChange={setGroupValue}
                      items={groupItems}
                      placeholder={t("detail.groupPlaceholder")}
                      searchPlaceholder={t("detail.groupSearchPlaceholder")}
                      emptyText={t("detail.groupNoResults")}
                      allowCustom
                      showSearch
                      triggerClassName="w-full justify-between px-3 py-2 text-sm"
                      className="w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveGroup}
                    disabled={!groupChanged}
                    className="flex-shrink-0 rounded-card-sm bg-primary-500 p-2 text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
                    title={t("detail.saveGroup")}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupEditorOpen(false)}
                    className="flex-shrink-0 rounded-card-sm p-2 text-light-text-secondary transition-colors hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Nutrition card ── */}
          {nutritionParts.length > 0 && (
            <div className="flex items-center gap-3 rounded-card-sm border border-primary-500/20 bg-primary-500/5 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                  {nutritionParts.join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("nutrition.estimatedPerServing")}
                </p>
              </div>
              <motion.button
                type="button"
                onClick={onRecalculateNutrition}
                disabled={nutritionBusy}
                whileTap={reduced ? {} : { scale: 0.88 }}
                title={nutritionBusy ? t("detail.recalculatingNutrition") : t("detail.recalculateNutrition")}
                className="flex-shrink-0 rounded-card-sm p-2 text-primary-500/60 transition-colors hover:bg-primary-500/10 hover:text-primary-500 disabled:opacity-40"
              >
                <RefreshCw size={14} className={nutritionBusy ? "animate-spin" : ""} />
              </motion.button>
            </div>
          )}

          {/* Nutrition refresh when no data yet */}
          {nutritionParts.length === 0 && onRecalculateNutrition && (
            <motion.button
              type="button"
              onClick={onRecalculateNutrition}
              disabled={nutritionBusy}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-1.5 text-sm text-light-text-secondary transition-colors hover:border-primary-500/40 hover:text-primary-500 disabled:opacity-50 dark:border-dark-border dark:text-dark-text-secondary"
            >
              <RefreshCw size={13} className={nutritionBusy ? "animate-spin" : ""} />
              {nutritionBusy ? t("detail.recalculatingNutrition") : t("detail.recalculateNutrition")}
            </motion.button>
          )}

          {/* ── Ingredients + Instructions ── */}
          <RecipeQualityBadges recipe={recipe} ingredients={ingredients} t={t} />

          {recipeWarnings.length > 0 && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              {recipeWarnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">

            {/* Ingredients */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-light-text-main dark:text-dark-text-main">
                  {t("detail.ingredients")}
                </h2>
                {/* Servings stepper */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {t("detail.servings")}
                  </span>
                  <div className="flex items-center overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border">
                    <button
                      type="button"
                      onClick={() => setServings((v) => Math.max(1, v - 1))}
                      className="px-2 py-1 text-light-text-secondary transition-colors hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="min-w-[2rem] border-x border-light-border bg-light-bg px-2 py-1 text-center text-xs font-medium text-light-text-main dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main">
                      {servings}
                    </span>
                    <button
                      type="button"
                      onClick={() => setServings((v) => v + 1)}
                      className="px-2 py-1 text-light-text-secondary transition-colors hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                {(ingredients || []).map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between gap-2 rounded-card-sm border border-light-border bg-light-bg px-3 py-2 dark:border-dark-border dark:bg-canvas-1"
                  >
                    <span className="text-sm text-light-text-main dark:text-dark-text-main">
                      {item.displayName || item.name}
                    </span>
                    <span className="flex-shrink-0 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {formatIngredientAmount(item, servings, factorBase) || item.displayAmountText || item.menge_text}
                    </span>
                  </div>
                ))}
              </div>

            <motion.button
              type="button"
              onClick={() => onAddShopping?.(servings)}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              <ShoppingCart size={14} /> {t("detail.addMissingShopping")}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onPlanRecipe?.(recipe)}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="ml-2 mt-3 inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-2 text-sm font-medium text-light-text-main transition-colors hover:border-primary-500/40 hover:bg-light-hover dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
            >
              <CalendarPlus size={14} /> {t("detail.planMeal")}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setCookModeOpen(true)}
              whileTap={reduced ? {} : { scale: 0.96 }}
              className="ml-2 mt-3 inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-2 text-sm font-medium text-light-text-main transition-colors hover:border-primary-500/40 hover:bg-light-hover dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
            >
              <Utensils size={14} /> {t("detail.cookMode")}
            </motion.button>
          </section>

            {/* Instructions */}
            <section>
              <h2 className="mb-3 font-semibold text-light-text-main dark:text-dark-text-main">
                {t("detail.instructions")}
              </h2>
              <ol className="space-y-2">
                {(display?.instructions || recipe.anleitung || []).map((step, index) => (
                  <li
                    key={`${index}-${step?.slice?.(0, 12)}`}
                    className="flex gap-3 rounded-card-sm border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-canvas-1"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-[10px] font-bold text-primary-600 dark:text-primary-400">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-light-text-main dark:text-dark-text-main">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {supabase && userId && (
            <RecipeCookLogPanel
              supabase={supabase}
              userId={userId}
              recipe={recipe}
              toast={toast}
              quickAddSignal={cookLogSignal}
            />
          )}
        </div>
      </div>
      <RecipeCookModeModal
        open={cookModeOpen}
        recipe={recipe}
        display={display}
        ingredients={ingredients}
        onClose={() => setCookModeOpen(false)}
        onFinished={() => {
          setCookModeOpen(false);
          setCookLogSignal((value) => value + 1);
        }}
      />
    </motion.div>
  );
}
