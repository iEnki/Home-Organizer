import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  closestCenter, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  addDays, addWeeks, format, isAfter, isBefore, isToday as isTodayFn,
  parseISO, startOfWeek,
} from "date-fns";
import { de, enGB } from "date-fns/locale";
import {
  CalendarDays, ChevronLeft, ChevronRight, GripVertical,
  Pencil, Plus, ShoppingCart, Trash2, Utensils,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { resolveLocalizedRecipe, resolveLocalizedRecipeIngredients } from "../../utils/localizedRecipeShopping";
import { buildRecipeShoppingPreview, combinePlannerPreviewItems, insertSelectedPreviewItems } from "../../utils/recipeShoppingPreview";
import RecipeShoppingPreviewModal from "./RecipeShoppingPreviewModal";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];

// ── Slot-Farbkonfiguration ───────────────────────────────────────────────────
const SLOT_CFG = {
  breakfast: {
    dot:    "bg-accent-yellow",
    border: "border-accent-yellow/40",
    bg:     "bg-accent-yellow/8",
    text:   "text-accent-yellow",
    over:   "border-accent-yellow bg-accent-yellow/15",
  },
  lunch: {
    dot:    "bg-primary-500",
    border: "border-primary-500/40",
    bg:     "bg-primary-500/8",
    text:   "text-primary-500",
    over:   "border-primary-500 bg-primary-500/15",
  },
  dinner: {
    dot:    "bg-secondary-500",
    border: "border-secondary-500/40",
    bg:     "bg-secondary-500/8",
    text:   "text-secondary-500",
    over:   "border-secondary-500 bg-secondary-500/15",
  },
  snack: {
    dot:    "bg-pink-500",
    border: "border-pink-500/40",
    bg:     "bg-pink-500/8",
    text:   "text-pink-500",
    over:   "border-pink-500 bg-pink-500/15",
  },
};

const toDateKey   = (date)  => format(date, "yyyy-MM-dd");
const parseDateKey = (value) => parseISO(`${value}T00:00:00`);
const makeSeriesId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getRecipe = (entry) => entry?.home_rezepte || entry?.recipe || null;

async function resolveHouseholdId(supabase, userId, recipes) {
  const fromRecipe = recipes.find((r) => r.household_id)?.household_id;
  if (fromRecipe) return fromRecipe;
  const { data } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.household_id || null;
}

function buildPlanRows({ baseEntry, recurrenceFrequency, recurrenceUntil }) {
  if (recurrenceFrequency !== "weekly") return [baseEntry];
  const start      = parseDateKey(baseEntry.planned_date);
  const hardLimit  = addWeeks(start, 51);
  const defaultEnd = addWeeks(start, 11);
  let end = recurrenceUntil ? parseDateKey(recurrenceUntil) : defaultEnd;
  if (isAfter(end, hardLimit)) end = hardLimit;
  if (isBefore(end, start))   end = start;
  const seriesId = baseEntry.series_id || makeSeriesId();
  const rows = [];
  let current = start;
  while (!isAfter(current, end)) {
    rows.push({
      ...baseEntry,
      planned_date:          toDateKey(current),
      series_id:             seriesId,
      recurrence_frequency:  "weekly",
      recurrence_until:      toDateKey(end),
    });
    current = addWeeks(current, 1);
  }
  return rows;
}

// ── Plan-Item (Drag-Karte) ───────────────────────────────────────────────────
function PlanItem({ entry, recipe, label, onEdit, onDelete, onOpen, dragDisabled = false }) {
  const { t } = useTranslation("recipes");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan-${entry.id}`,
    data: { entry },
    disabled: dragDisabled,
  });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-card-sm border border-light-border dark:border-dark-border
        bg-light-bg dark:bg-canvas-1 p-2.5
        hover:border-primary-500/30 hover:shadow-elevation-1
        transition-all duration-200 cursor-default
        ${isDragging ? "opacity-40 scale-95" : ""}`}
    >
      {/* Zeile 1: Grip + Thumbnail + Titel (volle Breite) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 cursor-grab rounded p-0.5
                     text-light-text-secondary/40 dark:text-dark-text-secondary/40
                     hover:text-primary-500 transition-colors touch-none"
          title={t("mealPlanner.drag")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>

        {recipe?.thumbnail_url ? (
          <img
            src={recipe.thumbnail_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-card-sm object-cover"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-card-sm bg-primary-500/10">
            <Utensils size={12} className="text-primary-500" />
          </div>
        )}

        <button
          type="button"
          onClick={() => recipe && onOpen?.(recipe)}
          className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold
                     text-light-text-main dark:text-dark-text-main
                     hover:text-primary-500 transition-colors"
        >
          {label}
        </button>
      </div>

      {/* Zeile 2: Portionen + Notizen + Actions (bündig unter Titel) */}
      <div className="mt-1.5 flex items-start gap-1.5 pl-[50px]">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-nowrap items-center gap-1.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
            <span className="shrink-0">{t("mealPlanner.servingsShort", { count: entry.portionen || recipe?.portionen || 4 })}</span>
            {entry.recurrence_frequency === "weekly" && (
              <span className="shrink-0 rounded-full bg-primary-500/10 px-1.5 py-0.5 text-primary-500">
                {t("mealPlanner.repeatsWeekly")}
              </span>
            )}
          </div>
          {entry.notizen && (
            <p className="truncate text-[10px] text-light-text-secondary dark:text-dark-text-secondary italic">
              {entry.notizen}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="rounded p-1 text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-primary-500/10 hover:text-primary-500 transition-colors"
            aria-label={t("mealPlanner.edit", { defaultValue: "Bearbeiten" })}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry)}
            className="rounded p-1 text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-accent-danger/10 hover:text-accent-danger transition-colors"
            aria-label={t("mealPlanner.delete", { defaultValue: "Löschen" })}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plan-Slot (Drop-Zone) ────────────────────────────────────────────────────
function PlanSlot({ id, children, label, slotKey, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const cfg       = SLOT_CFG[slotKey] || SLOT_CFG.dinner;
  const hasItems  = React.Children.count(children) > 0;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-card-sm border p-2 transition-all duration-200
        ${isOver
          ? `${cfg.over} border-solid`
          : hasItems
            ? `border-light-border dark:border-dark-border bg-light-bg/50 dark:bg-canvas-1/50`
            : `border-dashed border-light-border/60 dark:border-dark-border/60 bg-transparent`
        }`}
      style={{ minHeight: 80 }}
    >
      {/* Slot header */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${cfg.text}`}>
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={`rounded p-0.5 transition-colors
            text-light-text-secondary/50 dark:text-dark-text-secondary/50
            hover:${cfg.text} hover:bg-light-hover dark:hover:bg-canvas-3`}
          aria-label={`${label} hinzufügen`}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Items or empty hint */}
      {hasItems ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <div className="flex items-center justify-center" style={{ minHeight: 44 }}>
          <button
            type="button"
            onClick={onAdd}
            className={`flex items-center gap-1 text-[10px] ${cfg.text} opacity-40 hover:opacity-70 transition-opacity`}
          >
            <Plus size={11} /> hinzufügen
          </button>
        </div>
      )}
    </div>
  );
}

// ── Planner-Modal ────────────────────────────────────────────────────────────
function PlannerModal({ open, mode, recipes, initial, slotLabels, activeLocale, onClose, onSave }) {
  const { t } = useTranslation("recipes");
  const [recipeId,       setRecipeId]       = useState("");
  const [plannedDate,    setPlannedDate]    = useState("");
  const [mealSlot,       setMealSlot]       = useState("dinner");
  const [portionen,      setPortionen]      = useState("4");
  const [notizen,        setNotizen]        = useState("");
  const [recurrence,     setRecurrence]     = useState("none");
  const [recurrenceUntil,setRecurrenceUntil]= useState("");
  const [scope,          setScope]          = useState("single");

  const INPUT_CLS = "w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 transition-colors";
  const LABEL_CLS = "mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary";

  useEffect(() => {
    if (!open) return;
    const recipe = getRecipe(initial);
    setRecipeId(initial?.rezept_id || recipe?.id || "");
    setPlannedDate(initial?.planned_date || toDateKey(new Date()));
    setMealSlot(initial?.meal_slot || "dinner");
    setPortionen(String(initial?.portionen || recipe?.portionen || 4));
    setNotizen(initial?.notizen || "");
    setRecurrence(initial?.recurrence_frequency === "weekly" ? "weekly" : "none");
    setRecurrenceUntil(initial?.recurrence_until || "");
    setScope("single");
  }, [initial, open]);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);
  const isSeriesEdit   = mode === "edit" && initial?.series_id;

  const footer = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-card-sm border border-light-border dark:border-dark-border
                   px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main
                   hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
      >
        {t("mealPlanner.cancel")}
      </button>
      <button
        type="button"
        onClick={() => onSave({
          recipeId, plannedDate, mealSlot,
          portionen: Number(portionen) > 0 ? Number(portionen) : selectedRecipe?.portionen || 4,
          notizen: notizen.trim() || null,
          recurrence,
          recurrenceUntil: recurrence === "weekly" ? recurrenceUntil || null : null,
          scope,
        })}
        disabled={!recipeId || !plannedDate || !mealSlot}
        className="flex-1 rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-semibold
                   text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {mode === "edit" ? t("mealPlanner.saveChanges") : t("mealPlanner.save")}
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      title={mode === "edit" ? t("mealPlanner.editTitle") : t("mealPlanner.addTitle")}
      onClose={onClose}
      footer={footer}
      maxWidthClass="max-w-lg"
      bodyClassName="space-y-3"
    >
      <label className="block">
        <span className={LABEL_CLS}>{t("mealPlanner.recipe")}</span>
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={INPUT_CLS}>
          <option value="">{t("mealPlanner.selectRecipe")}</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {resolveLocalizedRecipe(r, activeLocale).title || r.titel}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLS}>{t("mealPlanner.date")}</span>
          <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={INPUT_CLS} />
        </label>
        <label className="block">
          <span className={LABEL_CLS}>{t("mealPlanner.slot")}</span>
          <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value)} className={INPUT_CLS}>
            {MEAL_SLOTS.map((slot) => <option key={slot} value={slot}>{slotLabels[slot]}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={LABEL_CLS}>{t("mealPlanner.servings")}</span>
        <input type="number" min="1" value={portionen} onChange={(e) => setPortionen(e.target.value)} className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className={LABEL_CLS}>{t("mealPlanner.notes")}</span>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} rows={3} className={`${INPUT_CLS} resize-none`} />
      </label>

      {mode !== "edit" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLS}>{t("mealPlanner.repeat")}</span>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={INPUT_CLS}>
              <option value="none">{t("mealPlanner.repeatNone")}</option>
              <option value="weekly">{t("mealPlanner.repeatWeekly")}</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>{t("mealPlanner.repeatUntil")}</span>
            <input
              type="date" value={recurrenceUntil}
              onChange={(e) => setRecurrenceUntil(e.target.value)}
              disabled={recurrence !== "weekly"}
              className={`${INPUT_CLS} disabled:opacity-50`}
            />
          </label>
        </div>
      )}

      {isSeriesEdit && (
        <label className="block">
          <span className={LABEL_CLS}>{t("mealPlanner.scope")}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={INPUT_CLS}>
            <option value="single">{t("mealPlanner.scopeSingle")}</option>
            <option value="future">{t("mealPlanner.scopeFuture")}</option>
          </select>
        </label>
      )}
    </ModalShell>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────
export default function MealPlanner({
  supabase, userId, recipes, ingredientsByRecipe,
  activeLocale, toast, initialRecipe,
  onInitialRecipeHandled, onOpenRecipe,
}) {
  const { t, i18n } = useTranslation("recipes");
  const locale      = i18n.language === "en-GB" ? enGB : de;

  const [weekStart,      setWeekStart]      = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [planEntries,    setPlanEntries]    = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [modalState,     setModalState]     = useState(null);
  const [activeDragEntry,setActiveDragEntry]= useState(null);
  const [shoppingBusy,   setShoppingBusy]   = useState(false);
  const [shoppingPreview, setShoppingPreview] = useState(null);
  const [shoppingPreviewIds, setShoppingPreviewIds] = useState([]);
  // Mobile: selected day index (0-6)
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const diff  = Math.floor((today - start) / 86400000);
    return Math.min(Math.max(diff, 0), 6);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const days    = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6];

  const slotLabels = useMemo(() => ({
    breakfast: t("mealPlanner.slots.breakfast"),
    lunch:     t("mealPlanner.slots.lunch"),
    dinner:    t("mealPlanner.slots.dinner"),
    snack:     t("mealPlanner.slots.snack"),
  }), [t]);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("home_rezept_plan")
        .select("*, home_rezepte(*)")
        .gte("planned_date", toDateKey(weekStart))
        .lte("planned_date", toDateKey(weekEnd))
        .order("planned_date", { ascending: true })
        .order("meal_slot",    { ascending: true })
        .order("sort_order",   { ascending: true });
      if (error) throw error;
      setPlanEntries(data || []);
    } catch (err) {
      toast.error(err.message || t("mealPlanner.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [supabase, t, toast, userId, weekEnd, weekStart]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  useEffect(() => {
    if (!initialRecipe) return;
    setModalState({
      mode: "create",
      initial: {
        rezept_id:    initialRecipe.id,
        portionen:    initialRecipe.portionen || 4,
        planned_date: toDateKey(new Date()),
        meal_slot:    "dinner",
        home_rezepte: initialRecipe,
      },
    });
    onInitialRecipeHandled?.();
  }, [initialRecipe, onInitialRecipeHandled]);

  // When week changes, snap selected day index to 0 (Monday of new week)
  const goToWeek = (delta) => {
    setWeekStart((prev) => addWeeks(prev, delta));
    setSelectedDayIdx(0);
  };

  const goToToday = () => {
    const today = new Date();
    const newStart = startOfWeek(today, { weekStartsOn: 1 });
    setWeekStart(newStart);
    const diff = Math.floor((today - newStart) / 86400000);
    setSelectedDayIdx(Math.min(Math.max(diff, 0), 6));
  };

  const bySlot = useMemo(() => {
    const map = {};
    for (const day of days) {
      const key = toDateKey(day);
      map[key] = {};
      MEAL_SLOTS.forEach((slot) => { map[key][slot] = []; });
    }
    planEntries.forEach((entry) => {
      if (!map[entry.planned_date]) return;
      if (!map[entry.planned_date][entry.meal_slot]) map[entry.planned_date][entry.meal_slot] = [];
      map[entry.planned_date][entry.meal_slot].push(entry);
    });
    return map;
  }, [days, planEntries]);

  const openCreate = (plannedDate, mealSlot) =>
    setModalState({ mode: "create", initial: { planned_date: plannedDate, meal_slot: mealSlot } });

  const openEdit = (entry) => setModalState({ mode: "edit", initial: entry });

  const saveEntry = async (values) => {
    try {
      const recipe      = recipes.find((r) => r.id === values.recipeId);
      const householdId = await resolveHouseholdId(supabase, userId, recipes);
      if (!householdId || !recipe) throw new Error(t("mealPlanner.saveFailed"));

      if (modalState?.mode === "edit" && modalState.initial?.id) {
        const patch = {
          rezept_id: values.recipeId,
          meal_slot: values.mealSlot,
          portionen: values.portionen,
          notizen:   values.notizen,
        };
        if (values.scope === "future" && modalState.initial.series_id) {
          const { error } = await supabase
            .from("home_rezept_plan").update(patch)
            .eq("series_id", modalState.initial.series_id)
            .gte("planned_date", modalState.initial.planned_date);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("home_rezept_plan")
            .update({ ...patch, planned_date: values.plannedDate })
            .eq("id", modalState.initial.id);
          if (error) throw error;
        }
      } else {
        const baseEntry = {
          household_id:          await resolveHouseholdId(supabase, userId, recipes),
          user_id:               userId,
          rezept_id:             values.recipeId,
          planned_date:          values.plannedDate,
          meal_slot:             values.mealSlot,
          portionen:             values.portionen,
          notizen:               values.notizen,
          sort_order:            0,
          recurrence_frequency:  values.recurrence,
          recurrence_until:      values.recurrenceUntil,
        };
        const rows = buildPlanRows({
          baseEntry,
          recurrenceFrequency: values.recurrence,
          recurrenceUntil:     values.recurrenceUntil,
        });
        const { error } = await supabase.from("home_rezept_plan").insert(rows);
        if (error) throw error;
      }
      setModalState(null);
      await loadPlan();
      toast.success(t("mealPlanner.saved"));
    } catch (err) {
      toast.error(err.message || t("mealPlanner.saveFailed"));
    }
  };

  const deleteEntry = async (entry) => {
    const deleteFuture = entry.series_id && window.confirm(t("mealPlanner.deleteSeriesConfirm"));
    try {
      const query = supabase.from("home_rezept_plan").delete();
      const { error } = deleteFuture
        ? await query.eq("series_id", entry.series_id).gte("planned_date", entry.planned_date)
        : await query.eq("id", entry.id);
      if (error) throw error;
      await loadPlan();
      toast.success(t("mealPlanner.deleted"));
    } catch (err) {
      toast.error(err.message || t("mealPlanner.deleteFailed"));
    }
  };

  const handleDragStart = ({ active }) => setActiveDragEntry(active?.data?.current?.entry || null);

  const handleDragEnd = async ({ active, over }) => {
    setActiveDragEntry(null);
    if (!active?.data?.current?.entry || !over?.id) return;
    const [plannedDate, mealSlot] = String(over.id).split("|");
    const entry = active.data.current.entry;
    if (!plannedDate || !mealSlot || (entry.planned_date === plannedDate && entry.meal_slot === mealSlot)) return;
    const targetEntries = bySlot[plannedDate]?.[mealSlot] || [];
    const nextOrder = targetEntries.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), -1) + 1;
    try {
      const { error } = await supabase
        .from("home_rezept_plan")
        .update({ planned_date: plannedDate, meal_slot: mealSlot, sort_order: nextOrder })
        .eq("id", entry.id);
      if (error) throw error;
      await loadPlan();
    } catch (err) {
      toast.error(err.message || t("mealPlanner.moveFailed"));
    }
  };

  const buildShoppingList = async () => {
    if (planEntries.length === 0) { toast.info(t("mealPlanner.shoppingEmpty")); return; }
    setShoppingBusy(true);
    try {
      const recipeIds = Array.from(new Set(planEntries.map((e) => e.rezept_id).filter(Boolean)));
      const { data: ingredientRows, error } = await supabase
        .from("home_rezept_zutaten").select("*").in("rezept_id", recipeIds)
        .order("sortierung", { ascending: true });
      if (error) throw error;
      const ingredientsMap = { ...ingredientsByRecipe };
      (ingredientRows || []).forEach((item) => {
        if (!ingredientsMap[item.rezept_id]) ingredientsMap[item.rezept_id] = [];
        if (!ingredientsMap[item.rezept_id].some((x) => x.id === item.id)) {
          ingredientsMap[item.rezept_id].push(item);
        }
      });
      const previews = [];
      for (const entry of planEntries) {
        const recipe = getRecipe(entry);
        if (!recipe) continue;
        const localizedIngredients = resolveLocalizedRecipeIngredients(recipe, ingredientsMap[entry.rezept_id] || [], activeLocale);
        previews.push(await buildRecipeShoppingPreview({
          supabase,
          userId,
          recipe,
          ingredients: localizedIngredients,
          locale: activeLocale,
          servings: entry.portionen || recipe.portionen || 4,
        }));
      }
      const combined = combinePlannerPreviewItems(previews);
      if (combined.items.length === 0) {
        toast.info(t("mealPlanner.shoppingNoMissing", { skipped: 0 }));
      } else {
        setShoppingPreview({
          title: t("shoppingPreview.mealPlannerTitle"),
          items: combined.items,
          grouped: combined.grouped,
        });
        setShoppingPreviewIds(combined.selectedIds);
      }
    } catch (err) {
      toast.error(err.message || t("mealPlanner.shoppingFailed"));
    } finally {
      setShoppingBusy(false);
    }
  };

  // ── Day-Karten-Renderer ────────────────────────────────────────────────────
  const renderDayCard = (day, i, compact = false) => {
    const dateKey = toDateKey(day);
    const today   = isTodayFn(day);
    const totalItems = MEAL_SLOTS.reduce(
      (n, slot) => n + (bySlot[dateKey]?.[slot]?.length || 0), 0
    );

    return (
      <section
        key={dateKey}
        className={`rounded-card border shadow-elevation-1 overflow-hidden transition-all
          animate-slide-in-up
          ${today
            ? "border-primary-500/40 bg-primary-500/5 dark:bg-primary-500/5 dark:border-primary-500/30"
            : "border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2"
          }`}
        style={{ animationDelay: `${i * 55}ms`, animationFillMode: "both" }}
      >
        {/* Day header */}
        <div className={`px-3 py-2.5 border-b flex items-center justify-between gap-2
          ${today
            ? "border-primary-500/20 bg-primary-500/8"
            : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 flex-col items-center justify-center rounded-card-sm shrink-0
              ${today
                ? "bg-primary-500 shadow-glow-primary"
                : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border"
              }`}
            >
              <span className={`text-[9px] font-bold uppercase leading-none tracking-widest
                ${today ? "text-white/70" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>
                {format(day, "EEE", { locale })}
              </span>
              <span className={`text-sm font-bold leading-none mt-0.5
                ${today ? "text-white" : "text-light-text-main dark:text-dark-text-main"}`}>
                {format(day, "d")}
              </span>
            </div>
            <div>
              <p className={`text-xs font-semibold leading-tight
                ${today ? "text-primary-500" : "text-light-text-main dark:text-dark-text-main"}`}>
                {format(day, "EEEE", { locale })}
              </p>
              <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                {format(day, "dd. MMM", { locale })}
              </p>
            </div>
          </div>
          {totalItems > 0 && (
            <span className="rounded-pill bg-primary-500/15 px-2 py-0.5 text-[10px] font-semibold text-primary-500">
              {totalItems}
            </span>
          )}
        </div>

        {/* Slots */}
        <div className="p-2 space-y-2">
          {MEAL_SLOTS.map((slot) => (
            <PlanSlot
              key={`${dateKey}|${slot}`}
              id={`${dateKey}|${slot}`}
              label={slotLabels[slot]}
              slotKey={slot}
              onAdd={() => openCreate(dateKey, slot)}
            >
              {(bySlot[dateKey]?.[slot] || []).map((entry) => {
                const recipe = getRecipe(entry);
                const label  = recipe
                  ? (resolveLocalizedRecipe(recipe, activeLocale).title || recipe.titel)
                  : t("mealPlanner.unknownRecipe");
                return (
                  <PlanItem
                    key={entry.id}
                    entry={entry}
                    recipe={recipe}
                    label={label}
                    onEdit={openEdit}
                    onDelete={deleteEntry}
                    onOpen={onOpenRecipe}
                  />
                );
              })}
            </PlanSlot>
          ))}
        </div>
      </section>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-1 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">

          {/* Title */}
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-0.5 rounded-full bg-primary-500 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {t("mealPlanner.title")}
              </h2>
              <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                {format(weekStart, "dd. MMM", { locale })} – {format(weekEnd, "dd. MMM yyyy", { locale })}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Shopping list button */}
            <button
              type="button"
              onClick={buildShoppingList}
              disabled={shoppingBusy}
              className="inline-flex items-center gap-1.5 rounded-pill bg-accent-yellow
                         px-3 py-1.5 text-xs font-semibold text-white
                         hover:opacity-90 disabled:opacity-50 transition-opacity shadow-elevation-1"
            >
              <ShoppingCart size={13} />
              {shoppingBusy ? t("mealPlanner.shoppingBusy") : t("mealPlanner.shoppingButton")}
            </button>

            {/* Today */}
            <button
              type="button"
              onClick={goToToday}
              className="rounded-pill border border-light-border dark:border-dark-border
                         px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main
                         hover:border-primary-500 hover:text-primary-500 transition-colors"
            >
              {t("mealPlanner.today")}
            </button>

            {/* Week navigation */}
            <div className="flex overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border">
              <button
                type="button"
                onClick={() => goToWeek(-1)}
                className="border-r border-light-border dark:border-dark-border p-2
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                aria-label="Vorherige Woche"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => goToWeek(1)}
                className="p-2 text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                aria-label="Nächste Woche"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex h-48 items-center justify-center rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-1 gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary animate-pulse">
          <CalendarDays size={18} className="text-primary-500" />
          {t("mealPlanner.loading")}
        </div>
      )}

      {!loading && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragEntry(null)}
        >
          {/* ── Mobile: Day-Picker strip + single day ─────────────────────── */}
          <div className="lg:hidden space-y-3">
            {/* Horizontal day-pill strip */}
            <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide px-0.5">
              {days.map((day, i) => {
                const dateKey  = toDateKey(day);
                const today    = isTodayFn(day);
                const isActive = i === selectedDayIdx;
                const count    = MEAL_SLOTS.reduce(
                  (n, slot) => n + (bySlot[dateKey]?.[slot]?.length || 0), 0
                );
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDayIdx(i)}
                    className={`flex shrink-0 flex-col items-center rounded-card-sm px-3 py-2 transition-all
                      ${isActive
                        ? "bg-primary-500 text-white shadow-glow-primary"
                        : today
                          ? "border border-primary-500/40 bg-primary-500/10 text-primary-500"
                          : "border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary"
                      }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest leading-none">
                      {format(day, "EEE", { locale })}
                    </span>
                    <span className={`text-base font-bold leading-tight mt-0.5
                      ${isActive ? "text-white" : "text-light-text-main dark:text-dark-text-main"}`}>
                      {format(day, "d")}
                    </span>
                    {count > 0 && (
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full
                        ${isActive ? "bg-white/70" : "bg-primary-500"}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Single selected day */}
            {renderDayCard(days[selectedDayIdx], 0)}
          </div>

          {/* ── Desktop: 7-Spalten-Grid ───────────────────────────────────── */}
          <div className="hidden lg:grid gap-3 lg:grid-cols-7">
            {days.map((day, i) => renderDayCard(day, i))}
          </div>

          {/* DragOverlay */}
          <DragOverlay>
            {activeDragEntry ? (
              <div className="w-56 rounded-card-sm border border-primary-500/50 bg-light-card dark:bg-canvas-2 p-2.5 shadow-elevation-3 opacity-95">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-card-sm bg-primary-500/10">
                    <Utensils size={12} className="text-primary-500" />
                  </div>
                  <p className="text-xs font-semibold text-light-text-main dark:text-dark-text-main line-clamp-2">
                    {resolveLocalizedRecipe(getRecipe(activeDragEntry) || {}, activeLocale).title
                      || getRecipe(activeDragEntry)?.titel
                      || t("mealPlanner.unknownRecipe")}
                  </p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && planEntries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-1 text-center animate-fade-in">
          <div className="relative mb-4">
            <div className="w-14 h-14 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <CalendarDays size={22} className="text-primary-500" />
            </div>
            <div className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-accent-yellow/90 flex items-center justify-center">
              <Plus size={11} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1">
            {t("mealPlanner.empty")}
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {t("mealPlanner.emptyHint", { defaultValue: "Tippe auf + in einem Slot, um ein Rezept einzuplanen." })}
          </p>
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <PlannerModal
        open={!!modalState}
        mode={modalState?.mode || "create"}
        recipes={recipes}
        initial={modalState?.initial}
        slotLabels={slotLabels}
        activeLocale={activeLocale}
        onClose={() => setModalState(null)}
        onSave={saveEntry}
      />
      <RecipeShoppingPreviewModal
        open={!!shoppingPreview}
        title={shoppingPreview?.title}
        preview={shoppingPreview}
        selectedIds={shoppingPreviewIds}
        busy={shoppingBusy}
        onSelectionChange={setShoppingPreviewIds}
        onClose={() => setShoppingPreview(null)}
        onConfirm={async (ids) => {
          setShoppingBusy(true);
          try {
            const result = await insertSelectedPreviewItems({ supabase, userId, previewItems: shoppingPreview?.items || [], selectedIds: ids, locale: activeLocale });
            if (result.inserted === 0) toast.info(t("mealPlanner.shoppingNoMissing", { skipped: result.skipped }));
            else toast.success(t("mealPlanner.shoppingCreated", { inserted: result.inserted, skipped: result.skipped }));
            setShoppingPreview(null);
          } catch (err) {
            toast.error(err.message || t("mealPlanner.shoppingFailed"));
          } finally {
            setShoppingBusy(false);
          }
        }}
      />
    </div>
  );
}
