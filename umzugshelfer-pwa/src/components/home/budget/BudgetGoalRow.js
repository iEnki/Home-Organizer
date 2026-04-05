import React from "react";
import { Edit2, PiggyBank, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

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
    label: "Aktiv",
    className: "border-primary-500/20 bg-primary-500/10 text-primary-500",
  },
  fast_erreicht: {
    label: "Fast erreicht",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  erreicht: {
    label: "Erreicht",
    className: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  },
};

export default function BudgetGoalRow({
  ziel,
  meta,
  today,
  onEdit,
  onDelete,
  onDeposit,
}) {
  const tage = getDaysRemaining(ziel.zieldatum, today);
  const status = statusConfig[meta.status];

  return (
    <div className="bg-light-card dark:bg-canvas-2 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{ziel.emoji || "Ziel"}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
                {ziel.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {ziel.zieldatum ? <span>{tage === 0 ? "Heute faellig" : `Noch ${tage} Tage`}</span> : <span>Ohne Zieldatum</span>}
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary sm:grid-cols-3">
            <div>
              <p>Restbetrag</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                {formatCurrency(meta.restbetrag)}
              </p>
            </div>
            <div>
              <p>Monatlich nötig</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                {meta.monatlichNoetig === null ? "-" : formatCurrency(meta.monatlichNoetig)}
              </p>
            </div>
            <div>
              <p>Fortschritt</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                {meta.progress.toFixed(0)} %
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="tabular-nums text-light-text-secondary dark:text-dark-text-secondary">
                {formatCurrency(ziel.aktueller_betrag)}
              </span>
              <span className="tabular-nums text-light-text-secondary dark:text-dark-text-secondary">
                {formatCurrency(ziel.ziel_betrag)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-canvas-3">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: ziel.farbe || "#10B981" }}
                initial={{ width: 0 }}
                animate={{ width: `${meta.progress}%` }}
                transition={{ duration: 0.65, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2">
          <button
            onClick={() => onEdit(ziel)}
            className="rounded-card-sm border border-light-border dark:border-dark-border p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"
            aria-label="Ziel bearbeiten"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => onDelete(ziel.id)}
            className="rounded-card-sm border border-light-border dark:border-dark-border p-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
            aria-label="Ziel loeschen"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {meta.status !== "erreicht" ? (
        <button
          onClick={() => onDeposit(ziel)}
          className="mt-3 inline-flex items-center gap-1 rounded-card-sm border px-3 py-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ borderColor: `${ziel.farbe || "#10B981"}66`, color: ziel.farbe || "#10B981" }}
        >
          <PiggyBank size={14} />
          Einzahlen
        </button>
      ) : (
        <p className="mt-3 text-xs font-medium text-green-500">Ziel erreicht</p>
      )}
    </div>
  );
}
