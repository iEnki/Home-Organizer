import React, { useState, useEffect } from "react";
import { Edit2, PiggyBank, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const getDaysRemaining = (zieldatum, today) => {
  if (!zieldatum) return null;
  return Math.max(0, Math.ceil((new Date(zieldatum) - today) / 86400000));
};

const statusConfig = {
  aktiv: {
    labelKey: "common:status.active",
    className: "border-primary-500/20 bg-primary-500/10 text-primary-500",
  },
  fast_erreicht: {
    labelKey: "budget:goals.status.nearlyReached",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  erreicht: {
    labelKey: "budget:goals.status.reached",
    className: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  },
};

function GoalRing({ progress, size = 60, stroke = 5, farbe }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setAnimated(progress), 100);
    return () => clearTimeout(id);
  }, [progress]);

  const color = farbe || "#10B981";

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-light-bg dark:text-canvas-3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - animated / 100)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}

export default function BudgetGoalRow({
  ziel,
  meta,
  today,
  onEdit,
  onDelete,
  onDeposit,
  index = 0,
}) {
  const { t } = useTranslation(["budget", "common"]);
  const tage = getDaysRemaining(ziel.zieldatum, today);
  const status = statusConfig[meta.status] || statusConfig.aktiv;
  const farbe = ziel.farbe || "#10B981";

  return (
    <div
      className="rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border p-4 animate-slide-in-up shadow-elevation-1 dark:shadow-elevation-1 hover:shadow-elevation-2 transition-shadow duration-300"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-center gap-4">
        {/* SVG Ring with percentage label */}
        <div className="relative shrink-0">
          <GoalRing progress={meta.progress} farbe={farbe} />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: "rotate(90deg)" }}
          >
            <span className="text-[10px] font-bold tabular-nums text-light-text-main dark:text-dark-text-main">
              {meta.progress.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl leading-none">{ziel.emoji || "🎯"}</span>
                <p className="truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                  {ziel.name}
                </p>
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {t(status.labelKey)}
                </span>
              </div>
              <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {ziel.zieldatum
                  ? tage === 0
                    ? t("budget:goals.dueToday")
                    : t("budget:goals.daysLeft", { count: tage })
                  : t("budget:goals.noTargetDate")}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => onEdit(ziel)}
                className="rounded-card-sm border border-light-border dark:border-dark-border p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:border-primary-500/50 transition-colors"
                aria-label={t("budget:goals.edit")}
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => onDelete(ziel.id)}
                className="rounded-card-sm border border-light-border dark:border-dark-border p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 hover:border-red-500/50 transition-colors"
                aria-label={t("budget:goals.delete")}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                {t("budget:goals.remainingAmount")}
              </p>
              <p className="mt-0.5 font-semibold tabular-nums text-light-text-main dark:text-dark-text-main">
                {formatCurrency(meta.restbetrag)}
              </p>
            </div>
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                {t("budget:goals.monthlyNeeded")}
              </p>
              <p className="mt-0.5 font-semibold tabular-nums text-light-text-main dark:text-dark-text-main">
                {meta.monatlichNoetig === null ? "–" : formatCurrency(meta.monatlichNoetig)}
              </p>
            </div>
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                {t("budget:goals.progress")}
              </p>
              <p
                className="mt-0.5 font-semibold tabular-nums"
                style={{ color: farbe }}
              >
                {formatCurrency(ziel.aktueller_betrag)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit / Reached button */}
      <div className="mt-3 border-t border-light-border dark:border-dark-border pt-3">
        {meta.status !== "erreicht" ? (
          <button
            onClick={() => onDeposit(ziel)}
            className="inline-flex items-center gap-1.5 rounded-card-sm border px-3 py-2 text-sm font-medium transition-all hover:opacity-80 active:scale-95"
            style={{ borderColor: `${farbe}55`, color: farbe }}
          >
            <PiggyBank size={14} />
            {t("budget:goals.deposit")}
          </button>
        ) : (
          <p className="text-xs font-semibold text-green-500">
            🎉 {t("budget:goals.reached")}
          </p>
        )}
      </div>
    </div>
  );
}
