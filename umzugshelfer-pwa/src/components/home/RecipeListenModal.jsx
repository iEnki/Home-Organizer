import React, { useMemo, useState } from "react";
import { BookMarked, Check, ChefHat, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { getRecipeImageUrl } from "../../utils/recipeImages";

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.18 } },
  exit: { opacity: 0, x: -6, transition: { duration: 0.12 } },
};

const recipeItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
  exit: { opacity: 0, y: 4, transition: { duration: 0.12 } },
};

export default function RecipeListenModal({ open, onClose, recipes, supabase, userId, onUpdate }) {
  const { t } = useTranslation("recipes");
  const [selectedList, setSelectedList] = useState(null);
  const [creatingName, setCreatingName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingList, setRenamingList] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const listen = useMemo(() => {
    const counts = {};
    recipes.forEach((recipe) => {
      if (recipe.gruppe?.trim()) {
        counts[recipe.gruppe.trim()] = (counts[recipe.gruppe.trim()] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [recipes]);

  const listRecipes = useMemo(
    () => (selectedList ? recipes.filter((recipe) => recipe.gruppe?.trim() === selectedList) : []),
    [recipes, selectedList],
  );

  const availableToAdd = useMemo(() => {
    if (!selectedList) return [];
    const q = pickerSearch.trim().toLowerCase();
    return recipes
      .filter((recipe) => recipe.gruppe?.trim() !== selectedList)
      .filter((recipe) => !q || (recipe.titel || "").toLowerCase().includes(q));
  }, [pickerSearch, recipes, selectedList]);

  const handleCreateList = async () => {
    const name = creatingName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onUpdate?.({ type: "noop" });
      setCreatingName("");
      setCreating(false);
      setSelectedList(name);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecipeToList = async (recipe) => {
    if (!selectedList || saving) return;
    setSaving(true);
    try {
      await supabase.from("home_rezepte").update({ gruppe: selectedList }).eq("id", recipe.id);
      await onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRecipeFromList = async (recipe) => {
    if (saving) return;
    setSaving(true);
    try {
      await supabase.from("home_rezepte").update({ gruppe: null }).eq("id", recipe.id);
      await onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const handleRenameList = async () => {
    const newName = renameValue.trim();
    if (!newName || !renamingList || saving) return;
    setSaving(true);
    try {
      const ids = recipes.filter((recipe) => recipe.gruppe?.trim() === renamingList).map((recipe) => recipe.id);
      if (ids.length > 0) {
        await supabase.from("home_rezepte").update({ gruppe: newName }).in("id", ids);
      }
      if (selectedList === renamingList) setSelectedList(newName);
      setRenamingList(null);
      setRenameValue("");
      await onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = async (listName) => {
    if (saving) return;
    setSaving(true);
    try {
      const ids = recipes.filter((recipe) => recipe.gruppe?.trim() === listName).map((recipe) => recipe.id);
      if (ids.length > 0) {
        await supabase.from("home_rezepte").update({ gruppe: null }).in("id", ids);
      }
      if (selectedList === listName) setSelectedList(null);
      await onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedList(null);
    setCreating(false);
    setCreatingName("");
    setRenamingList(null);
    setRenameValue("");
    setPickerOpen(false);
    setPickerSearch("");
    onClose?.();
  };

  return (
    <ModalShell
      open={open}
      title={t("lists.title")}
      onClose={handleClose}
      maxWidthClass="max-w-2xl"
      bodyClassName="p-0"
      footer={(
        <button
          type="button"
          onClick={handleClose}
          className="ml-auto rounded-card-sm px-4 py-2 text-sm font-medium text-light-text-secondary transition-colors hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
        >
          {t("lists.close")}
        </button>
      )}
    >
      <div className="flex min-h-0 divide-x divide-light-border dark:divide-dark-border" style={{ minHeight: "380px", maxHeight: "60vh" }}>
        <div className="flex w-2/5 flex-shrink-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-light-border px-3 py-2.5 dark:border-dark-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
              {t("lists.lists")}
            </span>
            <button
              type="button"
              onClick={() => { setCreating(true); setCreatingName(""); }}
              className="flex items-center gap-1 rounded-card-sm px-2 py-1 text-xs font-medium text-primary-500 hover:bg-primary-500/10 transition-colors"
            >
              <Plus size={12} /> {t("lists.new")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            <AnimatePresence>
              {creating && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex gap-1 p-1 pb-1.5">
                    <input
                      autoFocus
                      value={creatingName}
                      onChange={(event) => setCreatingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreateList();
                        if (event.key === "Escape") { setCreating(false); setCreatingName(""); }
                      }}
                      placeholder={t("lists.namePlaceholder")}
                      className="flex-1 min-w-0 rounded-card-sm border border-primary-500/50 bg-light-bg px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:bg-canvas-1 dark:text-dark-text-main"
                    />
                    <button type="button" onClick={handleCreateList} disabled={!creatingName.trim()} className="flex-shrink-0 rounded-card-sm bg-primary-500 p-1.5 text-white disabled:opacity-40 hover:bg-primary-600 transition-colors">
                      <Check size={12} />
                    </button>
                    <button type="button" onClick={() => { setCreating(false); setCreatingName(""); }} className="flex-shrink-0 rounded-card-sm p-1.5 text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {listen.length === 0 && !creating && (
              <div className="py-8 text-center">
                <BookMarked size={28} className="mx-auto mb-2 text-light-text-secondary/40 dark:text-dark-text-secondary/40" />
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("lists.empty")}</p>
                <p className="mt-0.5 text-[10px] text-light-text-secondary/60 dark:text-dark-text-secondary/60">{t("lists.createFirst")}</p>
              </div>
            )}

            <AnimatePresence>
              {listen.map((list) => (
                <motion.div key={list.name} variants={itemVariants} initial="hidden" animate="show" exit="exit" layout>
                  {renamingList === list.name ? (
                    <div className="flex gap-1 p-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleRenameList();
                          if (event.key === "Escape") { setRenamingList(null); setRenameValue(""); }
                        }}
                        className="flex-1 min-w-0 rounded-card-sm border border-primary-500/50 bg-light-bg px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:bg-canvas-1 dark:text-dark-text-main"
                      />
                      <button type="button" onClick={handleRenameList} className="flex-shrink-0 rounded-card-sm bg-primary-500 p-1.5 text-white hover:bg-primary-600 transition-colors">
                        <Check size={12} />
                      </button>
                      <button type="button" onClick={() => { setRenamingList(null); setRenameValue(""); }} className="flex-shrink-0 rounded-card-sm p-1.5 text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`group flex cursor-pointer items-center justify-between gap-1 rounded-card-sm px-2 py-1.5 transition-colors ${
                        selectedList === list.name
                          ? "bg-primary-500/10 text-primary-600 dark:text-primary-400"
                          : "hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
                      }`}
                      onClick={() => { setSelectedList(list.name); setPickerOpen(false); }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{list.name}</p>
                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                          {t("lists.recipeCount", { count: list.count })}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRenamingList(list.name);
                            setRenameValue(list.name);
                          }}
                          className="rounded p-1 text-light-text-secondary hover:text-primary-500 dark:text-dark-text-secondary transition-colors"
                          title={t("lists.rename")}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); handleDeleteList(list.name); }}
                          className="rounded p-1 text-light-text-secondary hover:text-red-500 dark:text-dark-text-secondary transition-colors"
                          title={t("lists.delete")}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {!selectedList ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <BookMarked size={32} className="text-light-text-secondary/30 dark:text-dark-text-secondary/30" />
              <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{t("lists.selectList")}</p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("lists.selectHint")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-light-border px-3 py-2.5 dark:border-dark-border">
                <span className="truncate text-xs font-semibold text-light-text-main dark:text-dark-text-main">{selectedList}</span>
                <button
                  type="button"
                  onClick={() => { setPickerOpen((value) => !value); setPickerSearch(""); }}
                  className="flex flex-shrink-0 items-center gap-1 rounded-card-sm px-2 py-1 text-xs font-medium text-primary-500 hover:bg-primary-500/10 transition-colors"
                >
                  <Plus size={12} /> {t("lists.add")}
                </button>
              </div>

              <AnimatePresence>
                {pickerOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-b border-light-border dark:border-dark-border">
                    <div className="p-2">
                      <div className="relative">
                        <Search size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
                        <input
                          autoFocus
                          value={pickerSearch}
                          onChange={(event) => setPickerSearch(event.target.value)}
                          placeholder={t("lists.searchRecipe")}
                          className="w-full rounded-card-sm border border-light-border bg-light-bg py-1.5 pl-7 pr-2 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main"
                        />
                      </div>
                    </div>
                    <div className="max-h-32 overflow-y-auto px-2 pb-2 space-y-0.5">
                      {availableToAdd.length === 0 ? (
                        <p className="py-2 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("lists.noMoreRecipes")}</p>
                      ) : (
                        availableToAdd.map((recipe) => (
                          <button
                            key={recipe.id}
                            type="button"
                            onClick={() => handleAddRecipeToList(recipe)}
                            className="flex w-full items-center gap-2 rounded-card-sm px-2 py-1.5 text-left text-xs hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                          >
                            {getRecipeImageUrl(recipe) ? (
                              <img src={getRecipeImageUrl(recipe)} alt="" className="h-7 w-7 flex-shrink-0 rounded object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-light-surface-2 dark:bg-canvas-3">
                                <ChefHat size={11} className="text-primary-500/60" />
                              </div>
                            )}
                            <span className="flex-1 truncate text-light-text-main dark:text-dark-text-main">{recipe.titel}</span>
                            <Plus size={11} className="flex-shrink-0 text-primary-500" />
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {listRecipes.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                    <ChefHat size={28} className="text-light-text-secondary/30 dark:text-dark-text-secondary/30" />
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("lists.noRecipesInList")}</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {listRecipes.map((recipe) => (
                      <motion.div
                        key={recipe.id}
                        variants={recipeItemVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        layout
                        className="group flex items-center gap-2 rounded-card-sm px-2 py-1.5 hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                      >
                        {getRecipeImageUrl(recipe) ? (
                          <img src={getRecipeImageUrl(recipe)} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-light-surface-2 dark:bg-canvas-3">
                            <ChefHat size={13} className="text-primary-500/60" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-light-text-main dark:text-dark-text-main">{recipe.titel}</p>
                          {recipe.quelle_plattform && (
                            <p className="truncate text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{recipe.quelle_plattform}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipeFromList(recipe)}
                          className="flex-shrink-0 rounded p-1 text-light-text-secondary opacity-0 transition-all group-hover:opacity-100 hover:text-red-500 dark:text-dark-text-secondary"
                          title={t("lists.removeFromList")}
                        >
                          <X size={13} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
