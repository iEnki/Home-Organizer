import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChefHat, History, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { useLocale } from "../../contexts/LocaleContext";
import { useToast } from "../../hooks/useToast";
import { logVerlauf } from "../../utils/homeVerlauf";
import {
  buildRecipeLocalizedPayload,
  hasLocalizedRecipeContent,
  normalizeContentLocale,
  resolveLocalizedRecipe,
  resolveLocalizedRecipeIngredients,
  translateRecipeIfMissing,
} from "../../utils/localizedRecipeShopping";
import { findSimilarRecipes } from "../../utils/recipeDuplicateMatcher";
import { buildRecipeShoppingPreview, insertSelectedPreviewItems } from "../../utils/recipeShoppingPreview";
import { estimateRecipeNutritionIfMissing, hasRecipeNutrition } from "../../utils/recipeNutrition";
import RecipeCard from "./RecipeCard";
import RecipeListRow from "./RecipeListRow";
import RecipeDetailView from "./RecipeDetailView";
import RecipeFormModal from "./RecipeFormModal";
import RecipeImportModal from "./RecipeImportModal";
import RecipeReviewModal from "./RecipeReviewModal";
import RecipeSearchFilterToolbar from "./RecipeSearchFilterToolbar";
import RecipeListenModal from "./RecipeListenModal";
import MealPlanner from "./MealPlanner";
import RecipeDuplicateWarning from "./RecipeDuplicateWarning";
import RecipeImportHistoryModal from "./RecipeImportHistoryModal";
import RecipeShoppingPreviewModal from "./RecipeShoppingPreviewModal";
import ModalShell from "../ui/ModalShell";

const sectionVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const listContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 30 } },
};

function gruppenLabel(key, t) {
  const labels = {
    video: t("page.grouping.video"),
    manuell: t("page.grouping.manual"),
    web: t("page.grouping.web"),
    sonstiges: t("page.grouping.other"),
  };
  return labels[key] || key || t("page.grouping.other");
}

function GruppenHeader({ label, count }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
        {label}
      </span>
      <div className="h-px flex-1 bg-light-border dark:bg-dark-border" />
      <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{count}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border border-light-border bg-light-card animate-pulse dark:border-dark-border dark:bg-canvas-2">
      <div className="aspect-[4/3] sm:aspect-[16/9] bg-light-border dark:bg-canvas-3" />
      <div className="space-y-2 p-2.5 sm:space-y-2.5 sm:p-4">
        <div className="h-3.5 w-4/5 rounded bg-light-border dark:bg-canvas-3 sm:h-4" />
        <div className="hidden sm:block h-3 w-2/5 rounded bg-light-border dark:bg-canvas-3" />
        <div className="flex gap-1 pt-0.5 sm:gap-1.5 sm:pt-1">
          <div className="h-5 w-8 rounded-pill bg-light-border dark:bg-canvas-3 sm:h-6 sm:w-12" />
          <div className="h-5 w-10 rounded-pill bg-light-border dark:bg-canvas-3 sm:h-6 sm:w-16" />
        </div>
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
      <div className="h-12 w-12 flex-shrink-0 rounded-card-sm bg-light-border dark:bg-canvas-3 sm:h-14 sm:w-14" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/5 rounded bg-light-border dark:bg-canvas-3" />
        <div className="h-3 w-2/5 rounded bg-light-border dark:bg-canvas-3" />
      </div>
    </div>
  );
}

async function resolveHouseholdId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.household_id || null;
}

export default function HomeKochbuch({ session }) {
  const { t } = useTranslation("recipes");
  const { locale } = useLocale();
  const activeLocale = normalizeContentLocale(locale);
  const userId = session?.user?.id;
  const { rezeptId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const reduced = useReducedMotion();

  const [recipes, setRecipes] = useState([]);
  const [ingredientsByRecipe, setIngredientsByRecipe] = useState({});
  const [householdId, setHouseholdId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("alle");
  const [sortierung, setSortierung] = useState("neueste");
  const [gruppierung, setGruppierung] = useState("keine");
  const [viewMode, setViewMode] = useState("kacheln");
  const [period, setPeriod] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reviewRecipe, setReviewRecipe] = useState(null);
  const [translationQueue, setTranslationQueue] = useState(new Set());
  const nutritionAttemptsRef = useRef(new Set());
  const [listenModalOffen, setListenModalOffen] = useState(false);
  const [listenFilter, setListenFilter] = useState(null);
  const [searchInZutaten, setSearchInZutaten] = useState(false);
  const [nutritionBusyId, setNutritionBusyId] = useState(null);
  const [activeTab, setActiveTab] = useState("recipes");
  const [plannerInitialRecipe, setPlannerInitialRecipe] = useState(null);
  const [importHistoryOpen, setImportHistoryOpen] = useState(false);
  const [shoppingPreview, setShoppingPreview] = useState(null);
  const [shoppingPreviewIds, setShoppingPreviewIds] = useState([]);
  const [shoppingPreviewBusy, setShoppingPreviewBusy] = useState(false);
  const [pendingRecipeSave, setPendingRecipeSave] = useState(null);

  useEffect(() => {
    const assistantFlow = location.state?.assistantFlow;
    if (!assistantFlow) return;
    const startModal = assistantFlow.ui_state?.startModal;
    const prefillQuery = assistantFlow.ui_state?.prefillQuery || assistantFlow.params?.query || "";
    if (prefillQuery) setQuery(prefillQuery);
    if (startModal === "import") setImportOpen(true);
    if (startModal === "form") setFormOpen(true);
    if (startModal === "listen") setListenModalOffen(true);
    if (startModal === "mealPlanner") setActiveTab("planner");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const currentHouseholdId = await resolveHouseholdId(userId);
      setHouseholdId(currentHouseholdId);
      if (!currentHouseholdId) throw new Error(t("toast.noHousehold"));
      const { data: recipeRows, error } = await supabase
        .from("home_rezepte")
        .select("*")
        .eq("household_id", currentHouseholdId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const recipeIds = (recipeRows || []).map((item) => item.id);
      let ingredientsMap = {};
      if (recipeIds.length > 0) {
        const { data: ingredientRows } = await supabase
          .from("home_rezept_zutaten")
          .select("*")
          .in("rezept_id", recipeIds)
          .order("sortierung", { ascending: true });
        ingredientsMap = (ingredientRows || []).reduce((acc, item) => {
          if (!acc[item.rezept_id]) acc[item.rezept_id] = [];
          acc[item.rezept_id].push(item);
          return acc;
        }, {});
      }
      setRecipes(recipeRows || []);
      setIngredientsByRecipe(ingredientsMap);
      if (rezeptId) {
        setSelected((recipeRows || []).find((item) => item.id === rezeptId) || null);
      }
    } catch (err) {
      toast.error(err.message || t("toast.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [rezeptId, t, toast, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!userId || recipes.length === 0) return;
    recipes.forEach((recipe) => {
      if (hasLocalizedRecipeContent(recipe, activeLocale) || translationQueue.has(`${recipe.id}:${activeLocale}`)) return;
      const key = `${recipe.id}:${activeLocale}`;
      setTranslationQueue((current) => new Set(current).add(key));
      translateRecipeIfMissing({
        supabase,
        userId,
        recipe,
        ingredients: ingredientsByRecipe[recipe.id] || [],
        locale: activeLocale,
      })
        .then((updatedRecipe) => {
          if (!updatedRecipe?.localized_content) return;
          setRecipes((current) => current.map((item) => item.id === updatedRecipe.id ? updatedRecipe : item));
          setSelected((current) => current?.id === updatedRecipe.id ? updatedRecipe : current);
          setReviewRecipe((current) => current?.id === updatedRecipe.id ? updatedRecipe : current);
        })
        .catch((err) => console.warn("Rezeptuebersetzung fehlgeschlagen", err))
        .finally(() => {
          setTranslationQueue((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        });
    });
  }, [activeLocale, ingredientsByRecipe, recipes, translationQueue, userId]);

  useEffect(() => {
    if (!userId) return;
    const candidates = [selected, reviewRecipe].filter(Boolean);
    candidates.forEach((recipe) => {
      const key = recipe.id;
      if (hasRecipeNutrition(recipe) || nutritionAttemptsRef.current.has(key)) return;
      nutritionAttemptsRef.current.add(key);
      estimateRecipeNutritionIfMissing({
        supabase,
        userId,
        recipe,
        ingredients: ingredientsByRecipe[recipe.id] || [],
        locale: activeLocale,
      })
        .then((updatedRecipe) => {
          if (!updatedRecipe || updatedRecipe === recipe) return;
          setRecipes((current) => current.map((item) => item.id === updatedRecipe.id ? updatedRecipe : item));
          setSelected((current) => current?.id === updatedRecipe.id ? updatedRecipe : current);
          setReviewRecipe((current) => current?.id === updatedRecipe.id ? updatedRecipe : current);
        })
        .catch((err) => console.warn("Naehrwertschaetzung fehlgeschlagen", err));
    });
  }, [activeLocale, ingredientsByRecipe, reviewRecipe, selected, userId]);

  const verfuegbareListen = useMemo(() => {
    const seen = new Set();
    recipes.forEach((r) => { if (r.gruppe?.trim()) seen.add(r.gruppe.trim()); });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "de"));
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const MS_DAY = 86400000;

    return recipes.filter((recipe) => {
      // Kategorie
      if (filter === "favoriten" && !recipe.favorisiert) return false;
      if (filter === "video" && recipe.import_typ !== "video") return false;
      if (filter === "manuell" && recipe.import_typ !== "manuell") return false;

      // Listen-Filter
      if (listenFilter !== null && recipe.gruppe?.trim() !== listenFilter) return false;

      // Zeitraum-Filter
      if (period !== "all" && recipe.created_at) {
        const age = now - new Date(recipe.created_at).getTime();
        if (period === "week" && age > 7 * MS_DAY) return false;
        if (period === "two_weeks" && age > 14 * MS_DAY) return false;
        if (period === "month" && age > 30 * MS_DAY) return false;
      }

      // Datumsbereich
      if (startDate && recipe.created_at) {
        if (new Date(recipe.created_at) < new Date(startDate)) return false;
      }
      if (endDate && recipe.created_at) {
        if (new Date(recipe.created_at) > new Date(endDate + "T23:59:59")) return false;
      }

      // Volltextsuche (Titel/Tags oder Zutaten)
      if (!q) return true;
      if (searchInZutaten) {
        const zutaten = ingredientsByRecipe[recipe.id] || [];
        return zutaten.some((z) => (z.name || "").toLowerCase().includes(q));
      }
      const display = resolveLocalizedRecipe(recipe, activeLocale);
      return [
        display.title,
        display.description,
        ...(display.tags || []),
        recipe.titel,
        recipe.beschreibung,
        ...(recipe.tags || []),
      ].join(" ").toLowerCase().includes(q);
    });
  }, [activeLocale, endDate, filter, ingredientsByRecipe, listenFilter, period, query, recipes, searchInZutaten, startDate]);

  const { sortiert, gruppenReihenfolge, gruppiert } = useMemo(() => {
    const arr = [...filtered];

    if (sortierung === "aelteste") {
      arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortierung === "name_az") {
      arr.sort((a, b) => {
        const ta = resolveLocalizedRecipe(a, activeLocale).title || a.titel || "";
        const tb = resolveLocalizedRecipe(b, activeLocale).title || b.titel || "";
        return ta.localeCompare(tb, "de");
      });
    } else if (sortierung === "kochzeit") {
      arr.sort((a, b) => {
        const ta = a.gesamtzeit_minuten || ((a.vorbereitungszeit_minuten || 0) + (a.kochzeit_minuten || 0)) || 9999;
        const tb = b.gesamtzeit_minuten || ((b.vorbereitungszeit_minuten || 0) + (b.kochzeit_minuten || 0)) || 9999;
        return ta - tb;
      });
    }

    if (gruppierung === "keine") {
      return { sortiert: arr, gruppenReihenfolge: [], gruppiert: {} };
    }

    const map = {};
    const order = [];
    arr.forEach((recipe) => {
      let key;
      if (gruppierung === "import_typ") {
        key = recipe.import_typ || "sonstiges";
      } else if (gruppierung === "tag") {
        const tags = resolveLocalizedRecipe(recipe, activeLocale).tags || recipe.tags || [];
        key = tags[0] || "ohne-tag";
      } else if (gruppierung === "favorit") {
        key = recipe.favorisiert ? "favoriten" : "weitere";
      } else if (gruppierung === "gruppe") {
        key = recipe.gruppe?.trim() || "ohne-gruppe";
      } else {
        key = "alle";
      }
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(recipe);
    });

    return { sortiert: arr, gruppenReihenfolge: order, gruppiert: map };
  }, [filtered, sortierung, gruppierung, activeLocale]);

  const hasActiveFilters =
    query !== "" ||
    filter !== "alle" ||
    sortierung !== "neueste" ||
    gruppierung !== "keine" ||
    period !== "all" ||
    startDate !== "" ||
    endDate !== "" ||
    listenFilter !== null ||
    searchInZutaten;

  const handleReset = () => {
    setQuery("");
    setFilter("alle");
    setSortierung("neueste");
    setGruppierung("keine");
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    setListenFilter(null);
    setSearchInZutaten(false);
  };

  const loadRecipeForReview = async (recipeId) => {
    const { data: recipe } = await supabase.from("home_rezepte").select("*").eq("id", recipeId).maybeSingle();
    const { data: ingredients } = await supabase.from("home_rezept_zutaten").select("*").eq("rezept_id", recipeId).order("sortierung");
    if (recipe) {
      setIngredientsByRecipe((prev) => ({ ...prev, [recipe.id]: ingredients || [] }));
      setReviewRecipe(recipe);
      setImportOpen(false);
      setImportHistoryOpen(false);
      await loadData();
    }
  };

  const saveRecipe = async (recipeData, ingredients, options = {}) => {
    if (!userId) return;
    try {
      if (!options.skipDuplicateCheck) {
        const matches = findSimilarRecipes({
          recipes,
          ingredientsByRecipe,
          candidateRecipe: recipeData,
          candidateIngredients: ingredients,
        });
        if (matches.length > 0) {
          setPendingRecipeSave({ kind: "create", recipeData, ingredients, matches });
          return;
        }
      }
      const currentHouseholdId = householdId || await resolveHouseholdId(userId);
      if (!currentHouseholdId) throw new Error(t("toast.noHousehold"));
      const payload = {
        ...recipeData,
        household_id: currentHouseholdId,
        user_id: userId,
        sprache: activeLocale,
        ziel_locale: activeLocale,
        localized_content: {
          ...(recipeData.localized_content || {}),
          [activeLocale]: buildRecipeLocalizedPayload(recipeData, ingredients),
        },
      };
      const { data: recipe, error } = await supabase
        .from("home_rezepte")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      if (ingredients.length > 0) {
        await supabase.from("home_rezept_zutaten").insert(ingredients.map((item) => ({ ...item, household_id: recipe.household_id, rezept_id: recipe.id })));
      }
      await logVerlauf(supabase, userId, "home_rezepte", recipe.titel, "erstellt");
      setFormOpen(false);
      await loadData();
      toast.success(t("toast.saved"));
    } catch (err) {
      toast.error(err.message || t("toast.saveFailed"));
    }
  };

  const saveReview = async ({ addShopping, favorite, recipePatch, ingredientsPatch }, options = {}) => {
    if (!reviewRecipe) return;
    try {
      const patch = recipePatch || {};
      const currentIngredients = ingredientsPatch || ingredientsByRecipe[reviewRecipe.id] || [];
      if (!options.skipDuplicateCheck) {
        const matches = findSimilarRecipes({
          recipes,
          ingredientsByRecipe,
          candidateRecipe: { ...reviewRecipe, ...patch },
          candidateIngredients: currentIngredients,
          excludeRecipeId: reviewRecipe.id,
        });
        if (matches.length > 0) {
          setPendingRecipeSave({ kind: "review", payload: { addShopping, favorite, recipePatch, ingredientsPatch }, matches });
          return;
        }
      }
      const localizedPatch = {
        ...(reviewRecipe.localized_content || {}),
        [activeLocale]: buildRecipeLocalizedPayload({ ...reviewRecipe, ...patch }, currentIngredients),
      };
      const isPrimaryLocale = activeLocale === (reviewRecipe.ziel_locale || reviewRecipe.sprache || "de");
      const neutralPatch = {};
      if (Object.prototype.hasOwnProperty.call(patch, "gruppe")) neutralPatch.gruppe = patch.gruppe || null;
      const { error } = await supabase
        .from("home_rezepte")
        .update({ ...(isPrimaryLocale ? patch : neutralPatch), ...neutralPatch, favorisiert: favorite, status: "gespeichert", localized_content: localizedPatch })
        .eq("id", reviewRecipe.id);
      if (error) throw error;
      if (ingredientsPatch && isPrimaryLocale) {
        await supabase.from("home_rezept_zutaten").delete().eq("rezept_id", reviewRecipe.id);
        if (ingredientsPatch.length > 0) {
          await supabase.from("home_rezept_zutaten").insert(ingredientsPatch.map((item) => ({
            ...item,
            rezept_id: reviewRecipe.id,
            household_id: reviewRecipe.household_id,
          })));
        }
      }
      if (addShopping) {
        const preview = await buildRecipeShoppingPreview({
          supabase,
          userId,
          recipe: { ...reviewRecipe, ...patch },
          ingredients: currentIngredients,
          locale: activeLocale,
          servings: reviewRecipe.portionen || 4,
        });
        await insertSelectedPreviewItems({
          supabase,
          userId,
          previewItems: preview.items,
          selectedIds: preview.selectedIds,
          locale: activeLocale,
        });
      }
      await logVerlauf(supabase, userId, "home_rezepte", patch.titel || reviewRecipe.titel, "gespeichert");
      setReviewRecipe(null);
      await loadData();
      toast.success(t("toast.saved"));
    } catch (err) {
      toast.error(err.message || t("toast.reviewSaveFailed"));
    }
  };

  const toggleFavorite = async (recipe) => {
    await supabase.from("home_rezepte").update({ favorisiert: !recipe.favorisiert }).eq("id", recipe.id);
    await loadData();
  };

  const updateSelectedGroup = async (value) => {
    if (!selected) return;
    const gruppe = String(value || "").trim() || null;
    try {
      const { error } = await supabase.from("home_rezepte").update({ gruppe }).eq("id", selected.id);
      if (error) throw error;
      const updated = { ...selected, gruppe };
      setSelected(updated);
      setRecipes((current) => current.map((item) => item.id === selected.id ? { ...item, gruppe } : item));
      toast.success(t("toast.groupSaved"));
    } catch (err) {
      toast.error(err.message || t("toast.groupSaveFailed"));
    }
  };

  const recalculateSelectedNutrition = async () => {
    if (!selected || !userId) return;
    setNutritionBusyId(selected.id);
    try {
      const updatedRecipe = await estimateRecipeNutritionIfMissing({
        supabase,
        userId,
        recipe: selected,
        ingredients: ingredientsByRecipe[selected.id] || [],
        locale: activeLocale,
        force: true,
      });
      setRecipes((current) => current.map((item) => item.id === updatedRecipe.id ? updatedRecipe : item));
      setSelected((current) => current?.id === updatedRecipe.id ? updatedRecipe : current);
      toast.success(t("toast.nutritionRecalculated"));
    } catch (err) {
      toast.error(err.message || t("toast.nutritionRecalculateFailed"));
    } finally {
      setNutritionBusyId(null);
    }
  };

  const deleteRecipe = async () => {
    if (!selected || !window.confirm(t("confirm.delete", { title: selected.titel }))) return;
    await supabase.from("home_rezepte").delete().eq("id", selected.id);
    await logVerlauf(supabase, userId, "home_rezepte", selected.titel, "geloescht");
    setSelected(null);
    navigate("/home/kochbuch");
    await loadData();
  };

  const addShoppingForSelected = async (servings = null) => {
    try {
      const ingredients = resolveLocalizedRecipeIngredients(selected, ingredientsByRecipe[selected.id] || [], activeLocale);
      const preview = await buildRecipeShoppingPreview({
        supabase,
        userId,
        recipe: selected,
        ingredients,
        locale: activeLocale,
        servings: servings || selected.portionen || 4,
      });
      setShoppingPreview({ title: t("shoppingPreview.title"), items: preview.items, grouped: preview.grouped });
      setShoppingPreviewIds(preview.selectedIds);
    } catch (err) {
      toast.error(err.message || t("mealPlanner.shoppingFailed"));
    }
  };

  const updateSelectedRecipe = async (recipePatch, ingredientRows, options = {}) => {
    if (!selected) return;
    try {
      if (!options.skipDuplicateCheck) {
        const matches = findSimilarRecipes({
          recipes,
          ingredientsByRecipe,
          candidateRecipe: { ...selected, ...recipePatch },
          candidateIngredients: ingredientRows,
          excludeRecipeId: selected.id,
        });
        if (matches.length > 0) {
          setPendingRecipeSave({ kind: "edit", recipePatch, ingredientRows, matches });
          return;
        }
      }
      const localizedContent = {
        ...(selected.localized_content || {}),
        [activeLocale]: buildRecipeLocalizedPayload({ ...selected, ...recipePatch }, ingredientRows),
      };
      const isPrimaryLocale = activeLocale === (selected.ziel_locale || selected.sprache || "de");
      const neutralPatch = {};
      if (Object.prototype.hasOwnProperty.call(recipePatch, "gruppe")) neutralPatch.gruppe = recipePatch.gruppe || null;
      const { error: updateError } = await supabase
        .from("home_rezepte")
        .update(isPrimaryLocale ? { ...recipePatch, localized_content: localizedContent } : { ...neutralPatch, localized_content: localizedContent })
        .eq("id", selected.id);
      if (updateError) throw updateError;
      if (isPrimaryLocale) {
        const { error: deleteError } = await supabase.from("home_rezept_zutaten").delete().eq("rezept_id", selected.id);
        if (deleteError) throw deleteError;
        if (ingredientRows.length) {
          const { error: insertError } = await supabase.from("home_rezept_zutaten").insert(ingredientRows.map((item) => ({ ...item, rezept_id: selected.id, household_id: selected.household_id })));
          if (insertError) throw insertError;
        }
      }
      setFormOpen(false);
      await loadData();
      toast.success(t("toast.saved"));
    } catch (err) {
      toast.error(err.message || t("toast.saveFailed"));
    }
  };

  const planRecipe = (recipe) => {
    setPlannerInitialRecipe(recipe);
    setSelected(null);
    setActiveTab("planner");
    navigate("/home/kochbuch");
  };

  const confirmPendingRecipeSave = async () => {
    const pending = pendingRecipeSave;
    setPendingRecipeSave(null);
    if (!pending) return;
    if (pending.kind === "create") {
      await saveRecipe(pending.recipeData, pending.ingredients, { skipDuplicateCheck: true });
    } else if (pending.kind === "review") {
      await saveReview(pending.payload, { skipDuplicateCheck: true });
    } else if (pending.kind === "edit") {
      await updateSelectedRecipe(pending.recipePatch, pending.ingredientRows, { skipDuplicateCheck: true });
    }
  };

  const duplicateConfirmModal = (
    <ModalShell
      open={!!pendingRecipeSave}
      title={t("duplicates.modalTitle")}
      onClose={() => setPendingRecipeSave(null)}
      maxWidthClass="max-w-xl"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPendingRecipeSave(null)} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main">
            {t("duplicates.cancel")}
          </button>
          <button type="button" onClick={confirmPendingRecipeSave} className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white">
            {t("duplicates.saveAnyway")}
          </button>
        </div>
      )}
    >
      <RecipeDuplicateWarning matches={pendingRecipeSave?.matches || []} />
    </ModalShell>
  );

  if (selected) {
    const display = resolveLocalizedRecipe(selected, activeLocale);
    const displayIngredients = resolveLocalizedRecipeIngredients(selected, ingredientsByRecipe[selected.id] || [], activeLocale);
    return (
      <>
        <RecipeDetailView
          recipe={selected}
          display={display}
          ingredients={displayIngredients}
          onBack={() => { setSelected(null); navigate("/home/kochbuch"); }}
          onEdit={() => setFormOpen(true)}
          onDelete={deleteRecipe}
          onToggleFavorite={toggleFavorite}
          onAddShopping={addShoppingForSelected}
          onPlanRecipe={planRecipe}
          onUpdateGroup={updateSelectedGroup}
          onRecalculateNutrition={recalculateSelectedNutrition}
          supabase={supabase}
          userId={userId}
          toast={toast}
          groupOptions={verfuegbareListen}
          nutritionBusy={nutritionBusyId === selected.id}
        />
        <RecipeFormModal
          open={formOpen}
          initialRecipe={{ ...selected, titel: display.title, beschreibung: display.description, anleitung: display.instructions, notizen: display.notes, tags: display.tags, gruppe: selected.gruppe || "" }}
          initialIngredients={displayIngredients.map((item) => ({ ...item, name: item.displayName || item.name, menge_text: item.displayAmountText || item.menge_text, original_text: item.displayOriginalText || item.original_text }))}
          onClose={() => setFormOpen(false)}
          onSave={updateSelectedRecipe}
        />
        <RecipeShoppingPreviewModal
          open={!!shoppingPreview}
          title={shoppingPreview?.title}
          preview={shoppingPreview}
          selectedIds={shoppingPreviewIds}
          busy={shoppingPreviewBusy}
          onSelectionChange={setShoppingPreviewIds}
          onClose={() => setShoppingPreview(null)}
          onConfirm={async (ids) => {
            setShoppingPreviewBusy(true);
            try {
              const result = await insertSelectedPreviewItems({ supabase, userId, previewItems: shoppingPreview?.items || [], selectedIds: ids, locale: activeLocale });
              toast.success(t("toast.shoppingAdded", { count: result.inserted }));
              setShoppingPreview(null);
            } catch (err) {
              toast.error(err.message || t("mealPlanner.shoppingFailed"));
            } finally {
              setShoppingPreviewBusy(false);
            }
          }}
        />
        {duplicateConfirmModal}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-4 lg:px-6">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 26 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <ChefHat size={24} className="text-primary-500" />
          <div>
            <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">{t("page.title")}</h1>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("page.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportHistoryOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main hover:bg-light-hover transition-colors dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
          >
            <History size={15} /> {t("imports.button")}
          </button>
          <button
            onClick={() => { setActiveTab("recipes"); setImportOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
          >
            <Upload size={15} /> {t("page.import")}
          </button>
          <button
            onClick={() => { setActiveTab("recipes"); setFormOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main hover:bg-light-hover transition-colors dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
          >
            <Plus size={15} /> {t("page.manual")}
          </button>
        </div>
      </motion.div>

      <div className="inline-flex rounded-card-sm border border-light-border bg-light-surface-1 p-1 dark:border-dark-border dark:bg-canvas-3">
        <button
          type="button"
          onClick={() => setActiveTab("recipes")}
          className={`inline-flex items-center gap-1.5 rounded-card-sm px-3 py-1.5 text-sm font-medium transition ${
            activeTab === "recipes"
              ? "bg-light-card text-primary-500 shadow-elevation-1 dark:bg-canvas-2"
              : "text-light-text-secondary hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
          }`}
        >
          <ChefHat size={14} /> {t("mealPlanner.tabs.recipes")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("planner")}
          className={`inline-flex items-center gap-1.5 rounded-card-sm px-3 py-1.5 text-sm font-medium transition ${
            activeTab === "planner"
              ? "bg-light-card text-primary-500 shadow-elevation-1 dark:bg-canvas-2"
              : "text-light-text-secondary hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
          }`}
        >
          <CalendarDays size={14} /> {t("mealPlanner.tabs.planner")}
        </button>
      </div>

      {activeTab === "planner" ? (
        <MealPlanner
          supabase={supabase}
          userId={userId}
          recipes={recipes}
          ingredientsByRecipe={ingredientsByRecipe}
          activeLocale={activeLocale}
          toast={toast}
          initialRecipe={plannerInitialRecipe}
          onInitialRecipeHandled={() => setPlannerInitialRecipe(null)}
          onOpenRecipe={(recipe) => { setSelected(recipe); navigate(`/home/kochbuch/${recipe.id}`); }}
        />
      ) : (
        <>

      {/* Search & Filter Toolbar */}
      <RecipeSearchFilterToolbar
        searchValue={query}
        onSearchChange={setQuery}
        sortValue={sortierung}
        onSortChange={setSortierung}
        filterValue={filter}
        onFilterChange={setFilter}
        gruppenValue={gruppierung}
        onGruppenChange={setGruppierung}
        periodValue={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchInZutaten={searchInZutaten}
        onSearchInZutatenChange={setSearchInZutaten}
        verfuegbareListen={verfuegbareListen}
        listenFilter={listenFilter}
        onListenFilterChange={setListenFilter}
        hasActiveFilters={hasActiveFilters}
        onReset={handleReset}
        totalCount={sortiert.length}
        onManageLists={() => setListenModalOffen(true)}
      />

      {/* Content */}
      {loading ? (
        viewMode === "liste" ? (
          <div className="overflow-hidden rounded-card border border-light-border bg-light-card divide-y divide-light-border dark:divide-dark-border dark:border-dark-border dark:bg-canvas-2">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonListRow key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )
      ) : sortiert.length === 0 ? (
        <div className="rounded-card border border-light-border bg-light-card py-12 text-center text-light-text-secondary dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-secondary">
          {t("page.empty")}
        </div>
      ) : viewMode === "liste" ? (
        /* ── Liste-Ansicht ── */
        gruppierung === "keine" ? (
          <motion.div
            key={`list-flat-${sortierung}-${filter}-${query}`}
            variants={reduced ? {} : listContainerVariants}
            initial="hidden"
            animate="show"
            className="overflow-hidden rounded-card border border-light-border bg-light-card divide-y divide-light-border dark:divide-dark-border dark:border-dark-border dark:bg-canvas-2"
          >
            {sortiert.map((recipe) => (
              <RecipeListRow
                key={recipe.id}
                recipe={recipe}
                display={resolveLocalizedRecipe(recipe, activeLocale)}
                ingredients={ingredientsByRecipe[recipe.id] || []}
                onOpen={(item) => { setSelected(item); navigate(`/home/kochbuch/${item.id}`); }}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </motion.div>
        ) : (
          <div className="space-y-6">
            {gruppenReihenfolge.map((key) => (
              <section key={key}>
                <GruppenHeader label={key === "ohne-tag" ? t("page.grouping.noTag") : key === "ohne-gruppe" ? t("page.grouping.noGroup") : key === "weitere" ? t("page.grouping.moreRecipes") : gruppenLabel(key, t)} count={gruppiert[key].length} />
                <motion.div
                  variants={reduced ? {} : listContainerVariants}
                  initial="hidden"
                  animate="show"
                  className="overflow-hidden rounded-card border border-light-border bg-light-card divide-y divide-light-border dark:divide-dark-border dark:border-dark-border dark:bg-canvas-2"
                >
                  {gruppiert[key].map((recipe) => (
                    <RecipeListRow
                      key={recipe.id}
                      recipe={recipe}
                      display={resolveLocalizedRecipe(recipe, activeLocale)}
                      ingredients={ingredientsByRecipe[recipe.id] || []}
                      onOpen={(item) => { setSelected(item); navigate(`/home/kochbuch/${item.id}`); }}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </motion.div>
              </section>
            ))}
          </div>
        )
      ) : gruppierung === "keine" ? (
        /* ── Kachel-Ansicht flat ── */
        <motion.div
          key={`flat-${sortierung}-${filter}-${query}`}
          variants={reduced ? {} : sectionVariants}
          initial="hidden"
          animate="show"
          className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
        >
          {sortiert.map((recipe) => (
            <motion.div key={recipe.id} variants={reduced ? {} : cardVariants}>
              <RecipeCard
                recipe={recipe}
                display={resolveLocalizedRecipe(recipe, activeLocale)}
                ingredients={ingredientsByRecipe[recipe.id] || []}
                onOpen={(item) => { setSelected(item); navigate(`/home/kochbuch/${item.id}`); }}
                onToggleFavorite={toggleFavorite}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        /* ── Kachel-Ansicht gruppiert ── */
        <div className="space-y-8">
          {gruppenReihenfolge.map((key) => (
            <section key={key}>
              <GruppenHeader label={key === "ohne-tag" ? t("page.grouping.noTag") : key === "ohne-gruppe" ? t("page.grouping.noGroup") : key === "weitere" ? t("page.grouping.moreRecipes") : gruppenLabel(key, t)} count={gruppiert[key].length} />
              <motion.div
                variants={reduced ? {} : sectionVariants}
                initial="hidden"
                animate="show"
                className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
              >
                {gruppiert[key].map((recipe) => (
                  <motion.div key={recipe.id} variants={reduced ? {} : cardVariants}>
                    <RecipeCard
                      recipe={recipe}
                      display={resolveLocalizedRecipe(recipe, activeLocale)}
                      ingredients={ingredientsByRecipe[recipe.id] || []}
                      onOpen={(item) => { setSelected(item); navigate(`/home/kochbuch/${item.id}`); }}
                      onToggleFavorite={toggleFavorite}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}

      <RecipeListenModal
        open={listenModalOffen}
        onClose={() => setListenModalOffen(false)}
        recipes={recipes}
        supabase={supabase}
        userId={userId}
        onUpdate={loadData}
      />
      <RecipeFormModal open={formOpen && !selected} onClose={() => setFormOpen(false)} onSave={saveRecipe} />
      <RecipeImportModal open={importOpen} onClose={() => setImportOpen(false)} onReviewReady={loadRecipeForReview} />
      <RecipeReviewModal
        open={!!reviewRecipe}
        recipe={reviewRecipe}
        display={reviewRecipe ? resolveLocalizedRecipe(reviewRecipe, activeLocale) : null}
        ingredients={reviewRecipe ? resolveLocalizedRecipeIngredients(reviewRecipe, ingredientsByRecipe[reviewRecipe.id] || [], activeLocale) : []}
        duplicateMatches={reviewRecipe ? findSimilarRecipes({
          recipes,
          ingredientsByRecipe,
          candidateRecipe: reviewRecipe,
          candidateIngredients: ingredientsByRecipe[reviewRecipe.id] || [],
          excludeRecipeId: reviewRecipe.id,
        }) : []}
        onClose={() => setReviewRecipe(null)}
        onSave={saveReview}
      />
      <RecipeImportHistoryModal
        open={importHistoryOpen}
        householdId={householdId}
        onClose={() => setImportHistoryOpen(false)}
        onOpenReview={loadRecipeForReview}
      />
      <RecipeShoppingPreviewModal
        open={!!shoppingPreview}
        title={shoppingPreview?.title}
        preview={shoppingPreview}
        selectedIds={shoppingPreviewIds}
        busy={shoppingPreviewBusy}
        onSelectionChange={setShoppingPreviewIds}
        onClose={() => setShoppingPreview(null)}
        onConfirm={async (ids) => {
          setShoppingPreviewBusy(true);
          try {
            const result = await insertSelectedPreviewItems({ supabase, userId, previewItems: shoppingPreview?.items || [], selectedIds: ids, locale: activeLocale });
            toast.success(t("toast.shoppingAdded", { count: result.inserted }));
            setShoppingPreview(null);
          } catch (err) {
            toast.error(err.message || t("mealPlanner.shoppingFailed"));
          } finally {
            setShoppingPreviewBusy(false);
          }
        }}
      />
      {duplicateConfirmModal}
        </>
      )}
    </div>
  );
}
