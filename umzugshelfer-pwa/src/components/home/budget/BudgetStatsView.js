import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingDown, LayoutGrid, Calendar, RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Filler,
} from "chart.js";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";
import { useCountUp } from "../../../hooks/useCountUp";
import GlassSurface from "../../ui/GlassSurface";

// ─── Chart.js Plugins ────────────────────────────────────────────────────────
const peakGlowPlugin = {
  id: "peakGlow",
  afterDatasetsDraw(chart) {
    // Horizontal bar charts use different coordinate geometry — skip to avoid ghost rendering
    if (chart.options?.indexAxis === "y") return;
    const { ctx, data } = chart;
    const dataset = data.datasets?.[0];
    if (!dataset) return;
    const vals = dataset.data.map(Number).filter((v) => v > 0);
    if (!vals.length) return;
    const maxVal = Math.max(...vals);
    const maxIdx = dataset.data.indexOf(maxVal);
    const meta = chart.getDatasetMeta(0);
    const bar = meta.data[maxIdx];
    if (!bar) return;
    const { x, y, base, width } = bar;
    ctx.save();
    ctx.shadowColor = "rgba(16,185,129,0.65)";
    ctx.shadowBlur = 18;
    const bg = Array.isArray(dataset.backgroundColor)
      ? dataset.backgroundColor[maxIdx]
      : dataset.backgroundColor;
    ctx.fillStyle = bg || "#10B981";
    ctx.beginPath();
    ctx.rect(x - width / 2, y, width, base - y);
    ctx.fill();
    ctx.restore();
  },
};

const donutCenterPlugin = {
  id: "donutCenter",
  afterDraw(chart) {
    if (chart.config.type !== "doughnut") return;
    const { ctx, chartArea, data } = chart;
    if (!chartArea) return;
    const total = (data.datasets?.[0]?.data || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const formatted = new Intl.NumberFormat("de-AT", {
      style: "currency", currency: "EUR",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(total);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "10px system-ui,sans-serif";
    ctx.fillStyle = "rgba(156,163,175,0.85)";
    ctx.fillText("Gesamt", cx, cy - 11);
    ctx.font = "bold 13px system-ui,sans-serif";
    ctx.fillStyle = "rgba(229,231,235,1)";
    ctx.fillText(formatted, cx, cy + 8);
    ctx.restore();
  },
};

ChartJS.register(
  ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Filler,
  peakGlowPlugin, donutCenterPlugin,
);

// ─── Formatierung ────────────────────────────────────────────────────────────
const fmt = (value) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.abs(Number(value || 0)));

const fmtCompact = (value) => {
  const n = Math.abs(Number(value || 0));
  if (n >= 10000) return `${(n / 1000).toFixed(1)} k€`;
  return fmt(n);
};

// ─── Chart-Konstanten ─────────────────────────────────────────────────────────
const SCALE = {
  grid: { color: "rgba(75,85,99,0.18)" },
  ticks: { color: "rgba(156,163,175,1)", font: { size: 10 } },
};

const TOOLTIP_STYLE = {
  backgroundColor: "#0E1B22",
  borderColor: "#10B981",
  borderWidth: 1,
  titleColor: "#E5E7EB",
  bodyColor: "#9CA3AF",
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
};

const LINE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 1200, easing: "easeInOutQuart" },
  plugins: {
    legend: { display: false },
    tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => `Kumuliert: ${fmt(ctx.raw)}` } },
  },
  scales: {
    x: SCALE,
    y: { ...SCALE, ticks: { ...SCALE.ticks, callback: (v) => `${v} €` } },
  },
};

const DONUT_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "68%",
  animation: { animateRotate: true, duration: 900, easing: "easeOutQuart" },
  plugins: {
    legend: { display: false },
    tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}` } },
  },
};

const MONTH_BAR_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  clip: false,
  animation: {
    duration: 700,
    easing: "easeOutQuart",
    delay: (ctx) => ctx.dataIndex * 40,
  },
  plugins: {
    legend: { display: false },
    tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => fmt(ctx.raw) } },
  },
  scales: {
    x: { ...SCALE, min: 0, ticks: { ...SCALE.ticks, callback: (v) => `${v} €` } },
    y: SCALE,
  },
};

const ACCOUNT_BAR_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  clip: false,
  animation: {
    duration: 700,
    easing: "easeOutQuart",
    delay: (ctx) => ctx.dataIndex * 50,
  },
  plugins: {
    legend: { display: false },
    tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => fmt(ctx.raw) } },
  },
  scales: {
    x: { ...SCALE, min: 0, ticks: { ...SCALE.ticks, callback: (v) => `${v} €` } },
    y: SCALE,
  },
};

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
const extractHex = (cssColor) => (typeof cssColor === "string" ? cssColor.slice(0, 7) : "#10B981");

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getElapsedDays = (year, month) => {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() === month) return today.getDate();
  if (new Date(year, month + 1, 0) < today) return getDaysInMonth(year, month);
  return 1;
};

const groupCashflowByRelative = (items) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = { heute: [], diese_woche: [], naechste_woche: [], spaeter: [] };
  (items || []).forEach((item) => {
    if (!item.naechstes_datum) return;
    const d = new Date(`${item.naechstes_datum}T00:00:00`);
    const diff = Math.round((d - today) / 86400000);
    if (diff <= 0) groups.heute.push(item);
    else if (diff <= 7) groups.diese_woche.push(item);
    else if (diff <= 14) groups.naechste_woche.push(item);
    else groups.spaeter.push(item);
  });
  return groups;
};

const buildLineGradient = (ctx, chartArea) => {
  if (!chartArea) return "rgba(6,182,212,0.15)";
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(6,182,212,0.28)");
  gradient.addColorStop(1, "rgba(6,182,212,0)");
  return gradient;
};

// ─── Primitive Komponenten ────────────────────────────────────────────────────
function SectionHeader({ label, delay = 0 }) {
  return (
    <div className="flex items-center gap-2 mb-3 animate-fade-in" style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}>
      <div className="h-3.5 w-0.5 rounded-full bg-primary-500" />
      <span className="text-[11px] uppercase tracking-widest font-medium text-light-text-secondary dark:text-dark-text-secondary">
        {label}
      </span>
    </div>
  );
}

function GlassCard({ children, delay = 0, className = "" }) {
  return (
    <GlassSurface
      className={`relative overflow-hidden p-4 ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-500/5 blur-2xl" />
      {children}
    </GlassSurface>
  );
}

function KpiCard({ label, value, icon: Icon, accentFrom, accentTo, sub, delay = 0 }) {
  return (
    <GlassSurface
      className="relative overflow-hidden p-4"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }} />
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-card-sm transition-colors" style={{ background: `${accentFrom}18` }}>
        <Icon size={17} style={{ color: accentFrom }} />
      </div>
      <p className="text-xl font-bold tabular-nums text-light-text-main dark:text-dark-text-main leading-tight truncate">{value}</p>
      {sub && <p className="mt-0.5 text-xs tabular-nums text-light-text-secondary dark:text-dark-text-secondary">{sub}</p>}
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">{label}</p>
    </GlassSurface>
  );
}

// ─── Monatsbalken (Jahr-Ansicht) ───────────────────────────────────────────────
function MonthlyBars({ labels, values, delay = 0 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 120 + delay); return () => clearTimeout(id); }, [delay]);

  const max = Math.max(...values, 0.01);
  const peakIdx = values.indexOf(max);
  const minNonZero = Math.min(...values.filter((v) => v > 0));
  const minIdx = values.indexOf(minNonZero);

  return (
    <GlassCard delay={delay}>
      <SectionHeader label="Monatsverlauf" />
      <div className="flex items-end gap-1 h-28">
        {values.map((val, i) => {
          const pct = max > 0 ? (val / max) * 100 : 0;
          const isPeak = i === peakIdx && val > 0;
          const isMin = i === minIdx && val > 0 && val !== max;
          const barColor = isPeak
            ? "#10B981"
            : isMin
            ? "#FB7185"
            : "#10B98166";
          const glowColor = isPeak ? "0 0 8px rgba(16,185,129,0.6)" : "none";

          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center gap-0.5">
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex whitespace-nowrap rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-3 px-1.5 py-0.5 text-[10px] text-light-text-main dark:text-dark-text-main shadow-elevation-2">
                {fmtCompact(val)}
              </div>
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t-sm cursor-default transition-all duration-700 ease-out"
                  style={{
                    height: mounted ? `${pct}%` : "0%",
                    minHeight: val > 0 ? "3px" : "0",
                    background: barColor,
                    boxShadow: glowColor,
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
              </div>
              <span className={`text-[9px] font-medium ${isPeak ? "text-primary-500" : isMin ? "text-accent-danger" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-primary-500 inline-block" /> Höchster Monat</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-accent-danger inline-block" /> Niedrigster Monat</span>
      </div>
    </GlassCard>
  );
}

// ─── Kategorie-Ranking ────────────────────────────────────────────────────────
function CategoryRanking({ categoryTotals, colorMap, total, delay = 0 }) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 80 + delay); return () => clearTimeout(id); }, [delay]);

  const top = categoryTotals.slice(0, 8);
  const maxVal = top[0]?.summe || 1;

  return (
    <GlassCard delay={delay}>
      <SectionHeader label="Kategorien" />
      <div className="space-y-2.5">
        {top.map((cat, i) => {
          const pct = total > 0 ? (cat.summe / total) * 100 : 0;
          const relPct = maxVal > 0 ? (cat.summe / maxVal) * 100 : 0;
          const color = colorMap[cat.name] || "#10B981";
          const label = getHomeBudgetCategoryLabel(cat.name, i18n.language) || cat.name;

          return (
            <div
              key={cat.name}
              className="animate-slide-in-up"
              style={{ animationDelay: `${delay + i * 45}ms`, animationFillMode: "both" }}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate text-light-text-main dark:text-dark-text-main">{label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 tabular-nums">
                  <span className="text-light-text-secondary dark:text-dark-text-secondary text-[10px]">{pct.toFixed(1)}%</span>
                  <span className="font-medium text-light-text-main dark:text-dark-text-main">{fmtCompact(cat.summe)}</span>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-light-bg dark:bg-canvas-3">
                <div
                  className="h-full rounded-pill transition-all duration-700 ease-out"
                  style={{
                    width: mounted ? `${relPct}%` : "0%",
                    background: color,
                    transitionDelay: `${i * 50}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
        {categoryTotals.length === 0 && (
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Keine Kategorien</p>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Tagesrate (Monat-Ansicht) ────────────────────────────────────────────────
function DailyRateCard({ total, selJahr, selMonat, delay = 0 }) {
  const elapsed = getElapsedDays(selJahr, selMonat);
  const daysInMonth = getDaysInMonth(selJahr, selMonat);
  const dailyRate = elapsed > 0 ? total / elapsed : 0;
  const projected = dailyRate * daysInMonth;
  const animatedDaily = useCountUp(dailyRate, 600);
  const animatedProjected = useCountUp(projected, 700);

  return (
    <div
      className="grid grid-cols-2 gap-3 animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="relative overflow-hidden rounded-card border border-secondary-500/25 bg-secondary-500/5 dark:bg-secondary-500/8 p-4">
        <div className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rounded-full bg-secondary-500/20 blur-xl" />
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">Ø pro Tag</p>
        <p className="mt-1 text-xl font-bold tabular-nums text-secondary-500">{fmt(animatedDaily)}</p>
        <p className="mt-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{elapsed} Tage erfasst</p>
      </div>
      <div className="relative overflow-hidden rounded-card border border-accent-warm/25 bg-accent-warm/5 dark:bg-accent-warm/8 p-4">
        <div className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rounded-full bg-accent-warm/20 blur-xl" />
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">Hochrechnung</p>
        <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: "#F97316" }}>{fmt(animatedProjected)}</p>
        <p className="mt-0.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{daysInMonth} Tage/Monat</p>
      </div>
    </div>
  );
}

// ─── Konto-Breakdown ──────────────────────────────────────────────────────────
function AccountBreakdown({ accountTotals, total, delay = 0 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 100 + delay); return () => clearTimeout(id); }, [delay]);

  if (!accountTotals?.length) return null;

  return (
    <GlassCard delay={delay}>
      <SectionHeader label="Konten" />
      <div className="space-y-3">
        {accountTotals.map((acc, i) => {
          const pct = total > 0 ? (acc.summe / total) * 100 : 0;
          const farbe = acc.farbe || "#10B981";

          return (
            <div
              key={acc.id}
              className="animate-slide-in-up"
              style={{ animationDelay: `${delay + i * 50}ms`, animationFillMode: "both" }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: farbe, background: `${farbe}33` }} />
                  <span className="truncate font-medium text-light-text-main dark:text-dark-text-main">{acc.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 tabular-nums">
                  <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{pct.toFixed(1)}%</span>
                  <span className="font-semibold text-light-text-main dark:text-dark-text-main">{fmt(acc.summe)}</span>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-light-bg dark:bg-canvas-3">
                <div
                  className="h-full rounded-pill transition-all duration-700 ease-out"
                  style={{ width: mounted ? `${pct}%` : "0%", background: farbe, transitionDelay: `${i * 60}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ─── Cashflow-Vorschau ────────────────────────────────────────────────────────
function CashflowPreview({ items, total, count, delay = 0 }) {
  const groups = useMemo(() => groupCashflowByRelative(items), [items]);
  const hasItems = count > 0;

  const GroupSection = ({ label, entries, colorClass }) => {
    if (!entries.length) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-medium text-light-text-secondary dark:text-dark-text-secondary px-1">{label}</p>
        {entries.map((item, i) => (
          <div
            key={item.id || `${item.naechstes_datum}-${i}`}
            className="flex items-center gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2.5 animate-slide-in-up"
            style={{ animationDelay: `${delay + i * 30}ms`, animationFillMode: "both" }}
          >
            <div className="flex h-7 w-12 shrink-0 items-center justify-center rounded-card-sm bg-primary-500/10 px-1">
              <span className="text-[9px] font-bold tabular-nums text-primary-500 text-center leading-tight">
                {item.naechstes_datum?.slice(5).replace("-", ".")}
              </span>
            </div>
            <RefreshCw size={10} className="shrink-0 text-secondary-400" />
            <span className="min-w-0 flex-1 truncate text-xs text-light-text-main dark:text-dark-text-main">{item.beschreibung}</span>
            <span className={`shrink-0 text-xs font-semibold tabular-nums ${colorClass}`}>{fmt(item.betrag)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <GlassCard delay={delay}>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader label="Cashflow — nächste 30 Tage" />
        {count > 0 && (
          <span className="text-xs tabular-nums font-medium text-accent-danger">
            {fmt(total)}
          </span>
        )}
      </div>

      {!hasItems ? (
        <div className="flex flex-col items-center py-8 text-center animate-fade-in">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-light-bg dark:bg-canvas-3">
            <Calendar size={18} className="text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
          </div>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Keine fälligen Zahlungen</p>
        </div>
      ) : (
        <div className="space-y-3">
          <GroupSection label="Heute / Überfällig" entries={groups.heute} colorClass="text-accent-danger" />
          <GroupSection label="Diese Woche" entries={groups.diese_woche} colorClass="text-accent-warm" />
          <GroupSection label="Nächste Woche" entries={groups.naechste_woche} colorClass="text-accent-yellow" />
          <GroupSection label="Später" entries={groups.spaeter} colorClass="text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      )}
    </GlassCard>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function BudgetStatsView({
  modus,
  yearStats,
  monthStats,
  selJahr,
  selMonat,
  monatLabel,
  cashflowItems,
  cashflowTotal,
  cashflowCount,
}) {
  const { i18n } = useTranslation(["budget"]);
  const isYear = modus === "jahr";
  const stats = isYear ? yearStats : monthStats;

  const animatedTotal = useCountUp(stats?.total || 0, 700);

  // Kategorie-Farbmap aus Chart-Daten
  const colorMap = useMemo(() => {
    const data = stats?.doughnutData;
    if (!data) return {};
    const map = {};
    (data.labels || []).forEach((name, i) => {
      const raw = data.datasets?.[0]?.backgroundColor?.[i];
      map[name] = extractHex(raw);
    });
    return map;
  }, [stats]);

  // Monatliche Werte für Custom-Bars
  const monthlyValues = useMemo(() => yearStats?.barData?.datasets?.[0]?.data || [], [yearStats]);
  const monthLabels = useMemo(() => yearStats?.barData?.labels || [], [yearStats]);

  // Bester Monat
  const peakMonth = useMemo(() => {
    if (!monthlyValues.length) return null;
    const max = Math.max(...monthlyValues);
    const idx = monthlyValues.indexOf(max);
    return max > 0 ? { label: monthLabels[idx], value: max } : null;
  }, [monthlyValues, monthLabels]);

  // Styled Line — cyan mit Gradient-Fill
  const styledLineData = useMemo(() => {
    if (!yearStats?.lineData) return null;
    return {
      ...yearStats.lineData,
      datasets: [{
        ...yearStats.lineData.datasets?.[0],
        borderColor: "#06B6D4",
        backgroundColor: (context) => {
          const { ctx, chartArea } = context.chart;
          return buildLineGradient(ctx, chartArea);
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#06B6D4",
        pointBorderColor: "#0E1B22",
        pointBorderWidth: 1.5,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    };
  }, [yearStats]);

  // Styled Month Horizontal Bar — Kategorie-Farben
  const styledMonthBarData = useMemo(() => {
    if (!monthStats?.barData) return null;
    const data = monthStats.barData;
    const colors = (data.labels || []).map((name) => colorMap[name] || "#10B981");
    return {
      ...data,
      labels: (data.labels || []).map((l) => getHomeBudgetCategoryLabel(l, i18n.language) || l),
      datasets: [{
        ...data.datasets?.[0],
        backgroundColor: colors.map((c) => `${c}99`),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: { topRight: 4, bottomRight: 4 },
        borderSkipped: "start",
      }],
    };
  }, [monthStats, colorMap, i18n.language]);

  // Styled Account Bar
  const styledAccountBarData = useMemo(() => {
    if (!stats?.accountBarData) return null;
    const data = stats.accountBarData;
    const colors = (stats.accountTotals || []).map((acc) => acc.farbe || "#10B981");
    return {
      ...data,
      datasets: [{
        ...data.datasets?.[0],
        backgroundColor: colors.map((c) => `${c}99`),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: { topRight: 4, bottomRight: 4 },
        borderSkipped: "start",
      }],
    };
  }, [stats]);

  const localizeDoughnut = (data) => ({
    ...data,
    labels: (data?.labels || []).map((l) => getHomeBudgetCategoryLabel(l, i18n.language) || l),
  });

  const hasData = stats?.hasData;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center py-20 text-center animate-fade-in">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-light-bg dark:bg-canvas-3">
          <TrendingDown size={24} className="text-light-text-secondary dark:text-dark-text-secondary opacity-40" />
        </div>
        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">Keine Daten</p>
        <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
          {isYear ? `Keine Ausgaben in ${selJahr}` : `Keine Ausgaben in ${monatLabel}`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── KPI-Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label={isYear ? "Gesamt " + selJahr : "Gesamt " + monatLabel}
          value={fmt(animatedTotal)}
          icon={TrendingDown}
          accentFrom="#FB7185"
          accentTo="#F97316"
          delay={0}
        />
        {isYear ? (
          <KpiCard
            label="Ø pro Monat"
            value={fmtCompact(yearStats.durchschnittProMonat)}
            icon={Calendar}
            accentFrom="#10B981"
            accentTo="#06B6D4"
            delay={80}
          />
        ) : (
          <KpiCard
            label="Kategorien"
            value={monthStats.aktiveKategorien}
            icon={LayoutGrid}
            accentFrom="#06B6D4"
            accentTo="#8B5CF6"
            delay={80}
          />
        )}
        {isYear && peakMonth ? (
          <KpiCard
            label="Höchster Monat"
            value={peakMonth.label}
            icon={ArrowUpRight}
            accentFrom="#F97316"
            accentTo="#F59E0B"
            sub={fmtCompact(peakMonth.value)}
            delay={160}
          />
        ) : (
          <KpiCard
            label="Größte Kategorie"
            value={getHomeBudgetCategoryLabel(stats?.groessteKategorie?.name || stats?.categoryTotals?.[0]?.name, i18n.language) || "–"}
            icon={ArrowUpRight}
            accentFrom="#F97316"
            accentTo="#F59E0B"
            sub={stats?.groessteKategorie ? fmtCompact(stats.groessteKategorie.summe) : fmtCompact(stats?.categoryTotals?.[0]?.summe)}
            delay={160}
          />
        )}
      </div>

      {/* ── Tagesrate (nur Monat) ── */}
      {!isYear && (
        <DailyRateCard total={monthStats.total} selJahr={selJahr} selMonat={selMonat} delay={80} />
      )}

      {/* ── Monatsverlauf CSS-Bars (nur Jahr) ── */}
      {isYear && monthlyValues.length > 0 && (
        <MonthlyBars labels={monthLabels} values={monthlyValues} delay={60} />
      )}

      {/* ── Kategorie-Ranking ── */}
      {stats.categoryTotals?.length > 0 && (
        <CategoryRanking
          categoryTotals={stats.categoryTotals}
          colorMap={colorMap}
          total={stats.total}
          delay={120}
        />
      )}

      {/* ── Donut-Chart (Kategorien) ── */}
      {stats.doughnutData && (
        <GlassCard delay={180}>
          <SectionHeader label={isYear ? "Ausgaben nach Kategorie" : "Kategorienverteilung"} />
          <div className="h-48 sm:h-56">
            <Doughnut
              data={localizeDoughnut(stats.doughnutData)}
              options={DONUT_OPTS}
            />
          </div>
        </GlassCard>
      )}

      {/* ── Horizontaler Bar-Chart (nur Monat) ── */}
      {!isYear && styledMonthBarData && monthStats.categoryTotals.length > 0 && (
        <GlassCard delay={240}>
          <SectionHeader label="Ausgaben je Kategorie" />
          <div style={{ height: `${Math.max(monthStats.categoryTotals.length * 36, 120)}px` }}>
            <Bar data={styledMonthBarData} options={MONTH_BAR_OPTS} />
          </div>
        </GlassCard>
      )}

      {/* ── Kumulativer Trend (nur Jahr) ── */}
      {isYear && styledLineData && (
        <GlassCard delay={260}>
          <SectionHeader label={`Kumulierte Ausgaben ${selJahr}`} />
          <div className="h-40 sm:h-52">
            <Line data={styledLineData} options={LINE_OPTS} />
          </div>
        </GlassCard>
      )}

      {/* ── Konto-Breakdown ── */}
      {stats.accountTotals?.length > 0 && (
        <AccountBreakdown
          accountTotals={stats.accountTotals}
          total={stats.total}
          delay={isYear ? 320 : 200}
        />
      )}

      {/* ── Konto-Chart (wenn mehrere Konten) ── */}
      {stats.accountTotals?.length > 1 && styledAccountBarData && (
        <GlassCard delay={isYear ? 380 : 260}>
          <SectionHeader label="Ausgaben nach Konto" />
          <div style={{ height: `${Math.max(stats.accountTotals.length * 36, 100)}px` }}>
            <Bar data={styledAccountBarData} options={ACCOUNT_BAR_OPTS} />
          </div>
        </GlassCard>
      )}

      {/* ── Cashflow-Vorschau ── */}
      <CashflowPreview
        items={cashflowItems}
        total={cashflowTotal}
        count={cashflowCount}
        delay={isYear ? 440 : 320}
      />

    </div>
  );
}
