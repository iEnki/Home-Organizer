import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coffee, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { formatIngredientAmount } from "../../utils/recipeNormalize";

export default function RecipeCookModeModal({ open, recipe, display, ingredients = [], onClose, onFinished }) {
  const { t } = useTranslation("recipes");
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState(new Set());
  const wakeLockRef = useRef(null);
  const steps = useMemo(() => display?.instructions || recipe?.anleitung || [], [display?.instructions, recipe?.anleitung]);

  useEffect(() => {
    if (!open) return undefined;
    setStepIndex(0);
    setChecked(new Set());
    let active = true;
    const acquireWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        wakeLockRef.current = null;
      }
    };
    acquireWakeLock();
    return () => {
      active = false;
      if (!active && wakeLockRef.current) {
        wakeLockRef.current.release?.().catch?.(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [open]);

  const toggleIngredient = (id) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ModalShell
      open={open}
      title={t("cookMode.title")}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      dialogClassName="min-h-[80vh]"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {t("cookMode.progress", { current: Math.min(stepIndex + 1, Math.max(steps.length, 1)), total: Math.max(steps.length, 1) })}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-pill border border-light-border px-3 py-2 text-sm dark:border-dark-border">
              <X size={14} /> {t("cookMode.close")}
            </button>
            <button type="button" onClick={onFinished} className="inline-flex items-center gap-1 rounded-pill bg-primary-500 px-3 py-2 text-sm font-semibold text-white">
              <Coffee size={14} /> {t("cookMode.finished")}
            </button>
          </div>
        </div>
      )}
    >
      <div className="grid min-h-[60vh] gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-2 rounded-card-sm border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-canvas-1">
          <h4 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("detail.ingredients")}</h4>
          <div className="space-y-1.5">
            {(ingredients || []).map((item, index) => {
              const id = item.id || `${item.name}-${index}`;
              const isChecked = checked.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleIngredient(id)}
                  className={`flex w-full items-center gap-2 rounded-card-sm border px-3 py-2 text-left text-sm ${
                    isChecked
                      ? "border-primary-500/30 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                      : "border-light-border bg-light-card text-light-text-main dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current">
                    {isChecked && <Check size={12} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.displayName || item.name}</span>
                  <span className="shrink-0 text-xs opacity-70">{formatIngredientAmount(item, recipe?.portionen || 4, recipe?.portionen || 4) || item.displayAmountText || item.menge_text}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex flex-col justify-between rounded-card-sm border border-light-border bg-light-card p-5 dark:border-dark-border dark:bg-canvas-2">
          <div>
            <p className="mb-3 text-sm font-medium text-primary-500">
              {display?.title || recipe?.titel}
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white">
              {stepIndex + 1}
            </div>
            <p className="mt-5 text-2xl font-semibold leading-relaxed text-light-text-main dark:text-dark-text-main sm:text-3xl">
              {steps[stepIndex] || t("cookMode.noSteps")}
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-2 rounded-pill border border-light-border px-4 py-2 text-sm disabled:opacity-40 dark:border-dark-border"
            >
              <ArrowLeft size={16} /> {t("cookMode.previous")}
            </button>
            <button
              type="button"
              onClick={() => setStepIndex((value) => Math.min(Math.max(steps.length - 1, 0), value + 1))}
              disabled={stepIndex >= steps.length - 1}
              className="inline-flex items-center gap-2 rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("cookMode.next")} <ArrowRight size={16} />
            </button>
          </div>
        </main>
      </div>
    </ModalShell>
  );
}
