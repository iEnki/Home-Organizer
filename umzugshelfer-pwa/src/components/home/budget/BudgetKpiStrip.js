import React from "react";
import { Home, User, Hash } from "lucide-react";
import { useCountUp } from "../../../hooks/useCountUp";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function KpiCard({ label, value, icon: Icon, accentFrom, accentTo, delay = 0 }) {
  return (
    <div
      className="relative overflow-hidden rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border shadow-elevation-1 dark:shadow-elevation-2 p-4 group hover:shadow-elevation-2 dark:hover:shadow-glow-primary transition-shadow duration-300 animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {/* Top gradient accent line */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }}
      />

      {/* Icon box */}
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-card-sm transition-colors duration-200"
        style={{ background: `${accentFrom}18` }}
      >
        <Icon size={17} style={{ color: accentFrom }} />
      </div>

      {/* Value */}
      <p className="text-xl font-bold tabular-nums text-light-text-main dark:text-dark-text-main leading-tight">
        {value}
      </p>

      {/* Label */}
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
        {label}
      </p>
    </div>
  );
}

function AnimatedCurrencyCard({ label, icon, amount, accentFrom, accentTo, delay }) {
  const animatedVal = useCountUp(Math.abs(Number(amount || 0)), 700);
  const formatted = formatCurrency(animatedVal);
  return (
    <KpiCard
      label={label}
      value={formatted}
      icon={icon}
      accentFrom={accentFrom}
      accentTo={accentTo}
      delay={delay}
    />
  );
}

export default function BudgetKpiStrip({ haushaltSumme, privatSumme, anzahl }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <AnimatedCurrencyCard
        label="Haushalt"
        icon={Home}
        amount={haushaltSumme}
        accentFrom="#10B981"
        accentTo="#06B6D4"
        delay={0}
      />
      <AnimatedCurrencyCard
        label="Privat"
        icon={User}
        amount={privatSumme}
        accentFrom="#F97316"
        accentTo="#F59E0B"
        delay={80}
      />
      <KpiCard
        label="Buchungen"
        value={anzahl}
        icon={Hash}
        accentFrom="#06B6D4"
        accentTo="#8B5CF6"
        delay={160}
      />
    </div>
  );
}
