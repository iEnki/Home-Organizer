import React from "react";
import { useTranslation } from "react-i18next";
import { TrendingDown, LayoutGrid, Tag } from "lucide-react";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";
import { useCountUp } from "../../../hooks/useCountUp";
import GlassSurface from "../../ui/GlassSurface";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function KpiCard({ label, value, icon: Icon, accentFrom, accentTo, subValue, delay = 0 }) {
  return (
    <GlassSurface
      className="relative overflow-hidden p-4"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }}
      />
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-card-sm transition-colors duration-200"
        style={{ background: `${accentFrom}18` }}
      >
        <Icon size={17} style={{ color: accentFrom }} />
      </div>
      <p className="text-xl font-bold tabular-nums text-light-text-main dark:text-dark-text-main leading-tight truncate">
        {value}
      </p>
      {subValue && (
        <p className="mt-0.5 text-xs tabular-nums text-light-text-secondary dark:text-dark-text-secondary truncate">
          {subValue}
        </p>
      )}
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
        {label}
      </p>
    </GlassSurface>
  );
}

function AnimatedCurrencyCard({ label, icon, amount, accentFrom, accentTo, delay }) {
  const animated = useCountUp(Math.abs(Number(amount || 0)), 700);
  return (
    <KpiCard
      label={label}
      value={formatCurrency(animated)}
      icon={icon}
      accentFrom={accentFrom}
      accentTo={accentTo}
      delay={delay}
    />
  );
}

export default function BudgetStatsKpiStrip({ modus, yearStats, monthStats }) {
  const { t, i18n } = useTranslation(["budget"]);

  if (modus === "jahr") {
    return (
      <div className="grid grid-cols-3 gap-3">
        <AnimatedCurrencyCard
          label={t("budget:statistics.totalYear")}
          icon={TrendingDown}
          amount={yearStats.total}
          accentFrom="#FB7185"
          accentTo="#F97316"
          delay={0}
        />
        <KpiCard
          label={t("budget:statistics.activeCategories", { defaultValue: "Kategorien" })}
          value={yearStats.aktiveKategorien}
          icon={LayoutGrid}
          accentFrom="#06B6D4"
          accentTo="#8B5CF6"
          delay={80}
        />
        <AnimatedCurrencyCard
          label={t("budget:statistics.averageMonth")}
          icon={Tag}
          amount={yearStats.durchschnittProMonat}
          accentFrom="#10B981"
          accentTo="#06B6D4"
          delay={160}
        />
      </div>
    );
  }

  const grossteKat = monthStats.groessteKategorie;
  const grossteLabel = grossteKat
    ? getHomeBudgetCategoryLabel(grossteKat.name, i18n.language) || "-"
    : "-";

  return (
    <div className="grid grid-cols-3 gap-3">
      <AnimatedCurrencyCard
        label={t("budget:statistics.totalMonth")}
        icon={TrendingDown}
        amount={monthStats.total}
        accentFrom="#FB7185"
        accentTo="#F97316"
        delay={0}
      />
      <KpiCard
        label={t("budget:statistics.activeCategories", { defaultValue: "Kategorien" })}
        value={monthStats.aktiveKategorien}
        icon={LayoutGrid}
        accentFrom="#06B6D4"
        accentTo="#8B5CF6"
        delay={80}
      />
      <KpiCard
        label={t("budget:statistics.largestCategory")}
        value={grossteLabel}
        icon={Tag}
        accentFrom="#10B981"
        accentTo="#06B6D4"
        subValue={grossteKat?.summe ? formatCurrency(grossteKat.summe) : null}
        delay={160}
      />
    </div>
  );
}
