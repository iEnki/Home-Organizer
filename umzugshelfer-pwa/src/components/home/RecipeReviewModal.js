import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import RecipeFormModal from "./RecipeFormModal";
import RecipeDuplicateWarning from "./RecipeDuplicateWarning";

export default function RecipeReviewModal({ open, recipe, display, ingredients, duplicateMatches = [], onClose, onSave }) {
  const { t } = useTranslation("recipes");
  const [editOpen, setEditOpen] = useState(false);
  const [addShopping, setAddShopping] = useState(false);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    setFavorite(Boolean(recipe?.favorisiert));
  }, [recipe]);

  if (!recipe) return null;

  return (
    <>
      <ModalShell
        open={open && !editOpen}
        title={t("review.title")}
        onClose={onClose}
        maxWidthClass="max-w-4xl"
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setEditOpen(true)} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main">{t("review.edit")}</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main">{t("review.later")}</button>
              <button onClick={() => onSave({ addShopping, favorite })} className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white">{t("review.save")}</button>
            </div>
          </div>
        )}
      >
        <div className="space-y-5">
          {recipe.thumbnail_url && <img src={recipe.thumbnail_url} alt="" className="max-h-64 w-full rounded-card-sm object-cover" />}
          <div>
            <h2 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">{display?.title || recipe.titel}</h2>
            {recipe.gruppe && (
              <span className="mt-2 inline-flex rounded-pill bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400">
                {recipe.gruppe}
              </span>
            )}
            <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{display?.description || recipe.beschreibung}</p>
          </div>
          {Array.isArray(recipe.warnings) && recipe.warnings.length > 0 && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              {recipe.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          )}
          <RecipeDuplicateWarning matches={duplicateMatches} compact />
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("review.ingredients")}</h3>
              <div className="space-y-2">
                {(ingredients || []).map((item) => (
                  <div key={item.id} className="rounded-card-sm border border-light-border bg-light-bg p-2 text-sm dark:border-dark-border dark:bg-canvas-1">
                    <span className="font-medium text-light-text-main dark:text-dark-text-main">{item.displayName || item.name}</span>
                    <span className="ml-2 text-light-text-secondary dark:text-dark-text-secondary">{item.displayAmountText || item.menge_text || [item.menge, item.einheit].filter(Boolean).join(" ")}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("review.instructions")}</h3>
              <ol className="space-y-2">
                {(display?.instructions || recipe.anleitung || []).map((step, index) => (
                  <li key={`${step}-${index}`} className="rounded-card-sm border border-light-border bg-light-bg p-2 text-sm text-light-text-main dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main">
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <div className="space-y-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-2 p-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2.5 text-light-text-main dark:text-dark-text-main">
              <input type="checkbox" checked={addShopping} onChange={(e) => setAddShopping(e.target.checked)} className="h-4 w-4 cursor-pointer accent-primary-500 rounded" />
              {t("review.addShopping")}
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-light-text-main dark:text-dark-text-main">
              <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="h-4 w-4 cursor-pointer accent-primary-500 rounded" />
              {t("review.markFavorite")}
            </label>
          </div>
        </div>
      </ModalShell>
      <RecipeFormModal
        open={editOpen}
        initialRecipe={display ? { ...recipe, titel: display.title, beschreibung: display.description, anleitung: display.instructions, notizen: display.notes, tags: display.tags, gruppe: recipe.gruppe || "" } : recipe}
        initialIngredients={ingredients}
        onClose={() => setEditOpen(false)}
        onSave={(nextRecipe, nextIngredients) => {
          setEditOpen(false);
          onSave({ addShopping, favorite, recipePatch: nextRecipe, ingredientsPatch: nextIngredients });
        }}
      />
    </>
  );
}
