import React from "react";
import { ChefHat, Clock, Heart, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { nutritionSummaryParts } from "../../utils/recipeNutrition";
import RecipeQualityBadges from "./RecipeQualityBadges";

export const listRowVariants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

export default function RecipeListRow({ recipe, display, ingredients = [], onOpen, onToggleFavorite }) {
  const { t } = useTranslation("recipes");
  const reduced = useReducedMotion();
  const minutes =
    recipe.gesamtzeit_minuten ||
    (recipe.vorbereitungszeit_minuten || 0) + (recipe.kochzeit_minuten || 0) ||
    null;
  const tags = display?.tags || recipe.tags || [];
  const nutritionParts = nutritionSummaryParts(recipe, t);

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(recipe)}
      variants={reduced ? {} : listRowVariants}
      whileTap={reduced ? {} : { scale: 0.99 }}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-card-sm last:rounded-b-card-sm hover:bg-light-hover dark:hover:bg-canvas-3"
    >
      {/* Thumbnail */}
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-card-sm bg-light-surface-2 dark:bg-canvas-3 sm:h-14 sm:w-14">
        <div className="flex h-full w-full items-center justify-center">
          <ChefHat size={16} className="text-primary-500/50" />
        </div>
        {recipe.thumbnail_url && (
          <img
            src={recipe.thumbnail_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug text-light-text-main dark:text-dark-text-main">
          {display?.title || recipe.titel}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {recipe.quelle_plattform || (recipe.import_typ === "manuell" ? t("card.manual") : t("card.cookbook"))}
          </span>
          {minutes && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
              <Clock size={10} /> {minutes}m
            </span>
          )}
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
            <Users size={10} /> {recipe.portionen || 4}
          </span>
        </div>
        {tags[0] && (
          <span className="mt-0.5 hidden sm:inline-flex items-center rounded-full bg-primary-500/10 px-1.5 py-0.5 text-[10px] text-primary-600 dark:text-primary-400">
            {tags[0]}
          </span>
        )}
        {recipe.gruppe && (
          <span className="ml-1 mt-0.5 hidden sm:inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            {recipe.gruppe}
          </span>
        )}
        {nutritionParts.length > 0 && (
          <span className="ml-1 mt-0.5 hidden sm:inline text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
            {nutritionParts[0]}
          </span>
        )}
        <RecipeQualityBadges recipe={recipe} ingredients={ingredients} t={t} limit={2} className="mt-1" />
      </div>

      {/* Favorite button — always visible on mobile, hover-only on desktop */}
      <motion.button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(recipe); }}
        whileTap={reduced ? {} : { scale: 0.75 }}
        className={`flex-shrink-0 rounded-card-sm p-1.5 transition-colors ${
          recipe.favorisiert
            ? "text-red-500"
            : "text-light-text-secondary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:text-dark-text-secondary"
        }`}
        title={t("card.favorite")}
      >
        <Heart size={14} fill={recipe.favorisiert ? "currentColor" : "none"} />
      </motion.button>
    </motion.button>
  );
}
