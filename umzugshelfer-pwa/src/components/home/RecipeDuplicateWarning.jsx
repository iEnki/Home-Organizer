import React from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RecipeDuplicateWarning({ matches = [], compact = false }) {
  const { t } = useTranslation("recipes");
  if (!matches.length) return null;
  return (
    <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{t("duplicates.title")}</p>
          {!compact && <p className="mt-0.5 text-xs opacity-85">{t("duplicates.hint")}</p>}
          <div className="mt-2 space-y-1">
            {matches.slice(0, compact ? 2 : 4).map((match) => (
              <div key={match.recipe.id} className="flex items-center justify-between gap-2 rounded-card-sm bg-black/5 px-2 py-1 dark:bg-white/5">
                <span className="truncate">{match.recipe.titel || match.recipe.title}</span>
                <span className="shrink-0 text-xs opacity-80">
                  {t("duplicates.sharedIngredients", { count: match.sharedIngredients })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
