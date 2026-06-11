import React from "react";
import { ChefHat, Clock, ExternalLink, Heart, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { nutritionSummaryParts } from "../../utils/recipeNutrition";
import RecipeQualityBadges from "./RecipeQualityBadges";

export default function RecipeCard({ recipe, display, ingredients = [], onOpen, onToggleFavorite }) {
  const { t } = useTranslation("recipes");
  const reduced = useReducedMotion();
  const minutes =
    recipe.gesamtzeit_minuten ||
    (recipe.vorbereitungszeit_minuten || 0) + (recipe.kochzeit_minuten || 0) ||
    null;
  const tags = display?.tags || recipe.tags || [];
  const visibleTags = tags.slice(0, 2);
  const nutritionParts = nutritionSummaryParts(recipe, t);

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(recipe)}
      whileHover={reduced ? {} : { y: -3, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={reduced ? {} : { scale: 0.97 }}
      className="group w-full overflow-hidden rounded-card border border-light-border bg-light-card text-left shadow-elevation-2 transition-[border-color,box-shadow] hover:border-primary-500/40 hover:shadow-glow-primary dark:border-dark-border dark:bg-canvas-2"
    >
      {/* Thumbnail — compact 4:3 at all sizes */}
      <div className="relative aspect-[4/3] overflow-hidden bg-light-surface-2 dark:bg-canvas-3">
        {/* Fallback — immer sichtbar, wird vom Bild überdeckt */}
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-card-sm bg-primary-500/10">
            <ChefHat size={16} className="text-primary-500" />
          </div>
          <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
            {recipe.quelle_plattform || recipe.import_typ || t("card.fallback")}
          </span>
        </div>
        {recipe.thumbnail_url && (
          <img
            src={recipe.thumbnail_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
      </div>

      <div className="space-y-1.5 p-2.5 lg:space-y-2 lg:p-3">
        {/* Title + Favorite */}
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-light-text-main dark:text-dark-text-main">
              {display?.title || recipe.titel}
            </h3>
            {/* Platform — only md+ */}
            <p className="mt-0.5 hidden truncate text-[10px] text-light-text-secondary dark:text-dark-text-secondary md:block">
              {recipe.quelle_plattform ||
                (recipe.import_typ === "manuell" ? t("card.manual") : t("card.cookbook"))}
            </p>
          </div>
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(recipe); }}
            whileTap={reduced ? {} : { scale: 0.75 }}
            className={`flex-shrink-0 rounded-card-sm p-1 transition-colors ${
              recipe.favorisiert
                ? "bg-red-500/10 text-red-500"
                : "text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
            }`}
            title={t("card.favorite")}
          >
            <Heart size={13} fill={recipe.favorisiert ? "currentColor" : "none"} />
          </motion.button>
        </div>

        {/* Description — lg+ only */}
        {(display?.description || recipe.beschreibung) && (
          <p className="hidden line-clamp-2 text-xs leading-relaxed text-light-text-secondary dark:text-dark-text-secondary lg:block">
            {display?.description || recipe.beschreibung}
          </p>
        )}

        {/* Tags — lg+ only */}
        {visibleTags.length > 0 && (
          <div className="hidden flex-wrap gap-1 lg:flex">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-primary-500/10 px-1.5 py-0.5 text-[10px] text-primary-600 dark:text-primary-400"
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="inline-flex items-center rounded-full bg-light-border px-1.5 py-0.5 text-[10px] text-light-text-secondary dark:bg-canvas-3 dark:text-dark-text-secondary">
                +{tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Gruppe badge — lg+ only */}
        {recipe.gruppe && (
          <span className="hidden w-fit rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 lg:inline-flex">
            {recipe.gruppe}
          </span>
        )}

        {/* Nutrition — lg+ only */}
        {nutritionParts.length > 0 && (
          <p className="hidden truncate text-[10px] text-light-text-secondary dark:text-dark-text-secondary lg:block">
            {nutritionParts.join(" | ")}
          </p>
        )}

        {/* Meta badges — always visible */}
        <RecipeQualityBadges recipe={recipe} ingredients={ingredients} t={t} limit={2} />

        <div className="flex flex-wrap gap-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
          <span className="inline-flex items-center gap-0.5 rounded-pill bg-light-bg px-1.5 py-0.5 dark:bg-canvas-1">
            <Users size={9} /> {recipe.portionen || 4}
          </span>
          {minutes && (
            <span className="inline-flex items-center gap-0.5 rounded-pill bg-light-bg px-1.5 py-0.5 dark:bg-canvas-1">
              <Clock size={9} /> {minutes}m
            </span>
          )}
          {recipe.quelle_url && (
            <span className="hidden items-center gap-0.5 rounded-pill bg-light-bg px-1.5 py-0.5 dark:bg-canvas-1 lg:inline-flex">
              <ExternalLink size={9} /> {t("card.source")}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
