import React from "react";
import { getBadgeToneClass, getRecipeQualityBadges } from "../../utils/recipeQualityBadges";

export default function RecipeQualityBadges({ recipe, ingredients = [], t, limit = null, className = "" }) {
  const badges = getRecipeQualityBadges(recipe, ingredients, t);
  const visible = limit ? badges.slice(0, limit) : badges;
  if (visible.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {visible.map((badge) => (
        <span
          key={badge.key}
          className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-medium ${getBadgeToneClass(badge.tone)}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
