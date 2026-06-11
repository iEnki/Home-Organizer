import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  Fuel,
  Gauge,
  ImagePlus,
  LayoutDashboard,
  ListTree,
  Pencil,
  Receipt,
  Star,
  Table2,
  Trash2,
  Upload,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { useCountUp } from "../../../hooks/useCountUp";
import useViewport from "../../../hooks/useViewport";
import { loadVehiclePhotoUrl } from "../../../utils/kfzPhotos";
import { formatKfzDisplayText } from "../../../utils/kfzPresentation";
import ModalShell from "../../ui/ModalShell";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
);

const palette = ["#10b981", "#22d3ee", "#f59e0b", "#8b5cf6", "#fb7185", "#38bdf8", "#64748b"];

export const glassPanelClass = "rounded-card border border-white/45 bg-white/72 shadow-elevation-1 backdrop-blur-xl dark:border-white/[0.09] dark:bg-[#07161d]/78 dark:shadow-[0_18px_60px_rgba(0,0,0,.28)]";

export const pageVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.045 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
};

const percentage = (value) => {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(0)} %`;
};

const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  color: "#cbd5e1",
  interaction: { intersect: false, mode: "index" },
  animation: { duration: 700, easing: "easeOutQuart" },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(4,17,23,.98)",
      borderColor: "rgba(45,212,191,.38)",
      borderWidth: 1,
      padding: 12,
      cornerRadius: 12,
      titleColor: "#f1f5f9",
      bodyColor: "#dbeafe",
      displayColors: false,
    },
  },
  scales: {
    x: {
      border: { display: false },
      grid: { display: false },
      ticks: { color: "#94a3b8", maxRotation: 0, autoSkipPadding: 18 },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: "rgba(148,163,184,.12)" },
      ticks: { color: "#94a3b8", padding: 8 },
    },
  },
};

function GlassPanel({ children, className = "", as = "section" }) {
  const reduced = useReducedMotion();
  const Component = motion[as] || motion.section;
  const moveSheen = (event) => {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--kfz-pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--kfz-pointer-y", `${event.clientY - rect.top}px`);
  };
  return (
    <Component
      variants={itemVariants}
      onMouseMove={moveSheen}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`${glassPanelClass} kfz-hover-card group ${className}`}
    >
      <span className="kfz-card-sheen" aria-hidden="true" />
      {children}
    </Component>
  );
}

export function AnimatedKpi({ icon: Icon, label, value, format, detail, trend, tone = "primary", sparkline = [] }) {
  const reduced = useReducedMotion();
  const animatedValue = useCountUp(Number(value || 0), reduced ? 0 : 650);
  const shown = format ? format(animatedValue) : animatedValue;
  const max = Math.max(...sparkline, 1);
  const accent = tone === "cyan" ? "from-secondary-500/25 text-secondary-400" : tone === "amber" ? "from-amber-500/25 text-amber-400" : "from-primary-500/25 text-primary-400";
  return (
    <GlassPanel className="relative min-w-0 overflow-hidden p-3 md:p-4">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent} via-current to-transparent opacity-80`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card-sm bg-gradient-to-br md:h-10 md:w-10 ${accent} to-transparent`}>
          <Icon size={17} />
        </span>
        {trend != null ? (
          <span className={`shrink-0 rounded-full px-1.5 py-1 text-[10px] font-semibold md:px-2 md:text-[11px] ${trend <= 0 ? "bg-primary-500/10 text-primary-500" : "bg-amber-500/10 text-amber-500"}`}>
            {percentage(trend)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 break-words text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-light-text-secondary md:mt-4 md:text-xs md:tracking-[0.14em] dark:text-dark-text-secondary">{label}</div>
      <div className="mt-1 break-words text-xl font-semibold leading-tight tracking-tight md:text-2xl">{shown}</div>
      <div className="mt-1 break-words text-[11px] leading-4 text-light-text-secondary md:text-xs dark:text-dark-text-secondary">{detail}</div>
      {sparkline.length > 1 ? (
        <div className="mt-3 flex h-6 items-end gap-1 md:mt-4 md:h-8" aria-hidden="true">
          {sparkline.slice(-12).map((point, index) => (
            <motion.span
              key={`${point}-${index}`}
              initial={reduced ? false : { height: 2 }}
              animate={{ height: `${Math.max(12, (point / max) * 100)}%` }}
              transition={{ delay: index * 0.025, duration: 0.35 }}
              className="min-w-1 flex-1 rounded-full bg-gradient-to-t from-primary-600/35 to-secondary-400/80"
            />
          ))}
        </div>
      ) : null}
    </GlassPanel>
  );
}

export function VehiclePhoto({
  document,
  alt,
  className = "",
  emptyClassName = "",
  imageClassName = "object-cover hover:scale-[1.03]",
  onClick,
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (document) loadVehiclePhotoUrl(document).then((nextUrl) => {
      if (active) setUrl(nextUrl || "");
    }).catch(() => {});
    return () => { active = false; };
  }, [document]);

  if (!url) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_55%_35%,rgba(34,211,238,.22),transparent_42%),linear-gradient(135deg,rgba(16,185,129,.12),rgba(3,16,21,.35))] ${className} ${emptyClassName}`}>
        <Car size={64} strokeWidth={1.2} className="text-primary-300/65 drop-shadow-[0_0_24px_rgba(16,185,129,.25)]" />
      </div>
    );
  }
  return (
    <button type="button" className={`block overflow-hidden ${className}`} onClick={onClick}>
      <img src={url} alt={alt || ""} loading="lazy" className={`h-full w-full transition duration-500 ${imageClassName}`} />
    </button>
  );
}

export function VehicleHero({ vehicle, coverPhoto, photoCount, onEdit, onGallery }) {
  const { t } = useTranslation("kfz");
  return (
    <GlassPanel className="relative min-w-0 overflow-hidden p-0">
      <div data-testid="vehicle-hero-layout" className="grid min-w-0 grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-4 p-4 md:min-h-[220px] md:grid-cols-[220px_minmax(0,1fr)] md:gap-0 md:p-0 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="relative h-32 w-full overflow-hidden rounded-card-sm bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.1),rgba(3,16,21,0.94)_72%)] md:my-4 md:ml-4 md:h-[190px] md:self-start md:rounded-card-sm xl:h-[200px]">
          <VehiclePhoto
            document={coverPhoto}
            alt={vehicle?.name}
            className="absolute inset-0 h-full w-full"
            imageClassName="object-contain object-center p-2 md:p-3"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#041117] via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#07161d]" />
          {vehicle ? <button type="button" onClick={onGallery} className="absolute bottom-2 left-2 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2 text-[10px] font-semibold text-white backdrop-blur-md md:bottom-4 md:left-4 md:min-h-10 md:gap-2 md:px-3 md:text-xs">
            <Camera size={13} /> {photoCount ? t("photos.count", { count: photoCount }) : t("photos.add")}
          </button> : null}
        </div>
        <div className="relative min-w-0 md:flex md:flex-col md:justify-center md:p-5 xl:p-7">
          <div data-testid="vehicle-hero-glow" className="pointer-events-none absolute right-5 top-5 h-24 w-24 rounded-full bg-primary-500/10 blur-3xl" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-500 md:text-xs md:tracking-[0.18em]">{t("overview.activeVehicle")}</div>
              <h2 className="mt-1 break-words text-lg font-semibold leading-tight tracking-tight md:mt-2 md:text-2xl">{vehicle ? [vehicle.name, vehicle.kennzeichen].filter(Boolean).join(" - ") : t("overview.vehicleStatus")}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-light-text-secondary md:text-sm dark:text-dark-text-secondary">{vehicle ? [vehicle.marke, vehicle.modell, vehicle.baujahr].filter(Boolean).join(" ") : t("overview.selectVehicle")}</p>
              {vehicle ? <div className="mt-3 md:hidden"><span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{t("overview.mileage")}</span><strong className="block break-words text-base">{Number(vehicle.kilometerstand || 0).toLocaleString("de-AT")} km</strong></div> : null}
            </div>
            {vehicle ? <button type="button" onClick={onEdit} className="relative z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-light-border/80 bg-white/50 transition hover:border-primary-500/40 hover:bg-primary-500/10 md:h-10 md:w-10 dark:border-white/10 dark:bg-white/5" aria-label="Fahrzeug bearbeiten"><Pencil size={15} /></button> : null}
          </div>
          {vehicle ? <dl className="mt-6 hidden grid-cols-2 gap-4 text-sm md:grid xl:gap-5">
              <div><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.mileage")}</dt><dd className="mt-1 break-words text-lg font-semibold">{Number(vehicle.kilometerstand || 0).toLocaleString("de-AT")} km</dd></div>
              <div><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.fuelType")}</dt><dd className="mt-1 font-semibold">{vehicle.kraftstoffart || "-"}</dd></div>
              <div><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.inspection")}</dt><dd className="mt-1 font-semibold">{vehicle.pickerl_termin ? new Date(`${vehicle.pickerl_termin}T00:00:00`).toLocaleDateString("de-AT") : "-"}</dd></div>
              <div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.insurance")}</dt><dd className="mt-1 break-words font-semibold">{vehicle.versicherung || "-"}</dd></div>
            </dl> : null}
        </div>
        {vehicle ? <dl className="col-span-2 grid min-w-0 grid-cols-2 gap-3 border-t border-light-border/60 pt-3 text-xs md:hidden dark:border-white/10">
          <div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.fuelType")}</dt><dd className="mt-1 break-words font-semibold">{vehicle.kraftstoffart || "-"}</dd></div>
          <div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.inspection")}</dt><dd className="mt-1 break-words font-semibold">{vehicle.pickerl_termin ? new Date(`${vehicle.pickerl_termin}T00:00:00`).toLocaleDateString("de-AT") : "-"}</dd></div>
          <div className="col-span-2 min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">{t("overview.insurance")}</dt><dd className="mt-1 break-words font-semibold">{vehicle.versicherung || "-"}</dd></div>
        </dl> : null}
      </div>
    </GlassPanel>
  );
}

export function VehicleSwitcher({ vehicles, selectedVehicleId, coverByVehicleId, onSelect }) {
  const { t } = useTranslation("kfz");
  if (vehicles.length < 2) return null;
  return (
    <motion.div data-testid="vehicle-switcher" variants={itemVariants} initial="hidden" animate="show" className="hidden gap-2 overflow-hidden md:flex">
      <button type="button" onClick={() => onSelect("")} className={`flex min-w-32 snap-start items-center gap-2 rounded-card-sm border p-2 text-left transition ${!selectedVehicleId ? "border-primary-500/40 bg-primary-500/10" : "border-light-border bg-white/55 dark:border-white/10 dark:bg-[#07161d]/72"}`}>
        <span className="flex h-10 w-12 items-center justify-center rounded-xl bg-primary-500/10 text-primary-500"><Car size={20} /></span>
        <span className="text-xs font-semibold">{t("allVehicles")}</span>
      </button>
      {vehicles.map((vehicle) => (
        <button key={vehicle.id} type="button" onClick={() => onSelect(vehicle.id)} className={`flex min-w-48 snap-start items-center gap-2 rounded-card-sm border p-2 text-left transition ${selectedVehicleId === vehicle.id ? "border-primary-500/40 bg-primary-500/10 shadow-glow-primary" : "border-light-border bg-white/55 dark:border-white/10 dark:bg-[#07161d]/72"}`}>
          <VehiclePhoto document={coverByVehicleId[vehicle.id]} alt={vehicle.name} className="h-11 w-16 shrink-0 rounded-xl" />
          <span className="min-w-0"><strong className="block truncate text-xs">{vehicle.name}</strong><span className="block truncate text-[11px] text-light-text-secondary dark:text-dark-text-secondary">{vehicle.kennzeichen || vehicle.modell || "-"}</span></span>
        </button>
      ))}
    </motion.div>
  );
}

export function KfzOverview({
  stats,
  selectedVehicle,
  coverPhoto,
  photoCount,
  period,
  setPeriod,
  dueItems,
  onEditVehicle,
  onOpenGallery,
  onShowCosts,
  money,
  formatDate,
}) {
  const { t } = useTranslation("kfz");
  const { isMobile } = useViewport();
  const monthlyValues = stats.monthly.map(([, value]) => value);
  const overviewChartOptions = useMemo(() => ({
    ...chartBase,
    animation: isMobile ? { duration: 450, easing: "easeOutQuart" } : chartBase.animation,
    scales: {
      x: {
        ...chartBase.scales.x,
        ticks: {
          ...chartBase.scales.x.ticks,
          autoSkip: true,
          maxTicksLimit: isMobile ? 4 : 12,
          autoSkipPadding: isMobile ? 8 : 18,
          font: { size: isMobile ? 10 : 12 },
        },
      },
      y: {
        ...chartBase.scales.y,
        ticks: {
          ...chartBase.scales.y.ticks,
          maxTicksLimit: isMobile ? 5 : 8,
          font: { size: isMobile ? 10 : 12 },
        },
      },
    },
  }), [isMobile]);
  const costData = {
    labels: stats.monthly.map(([label]) => label),
    datasets: [{
      type: "bar",
      label: "Kosten",
      data: monthlyValues,
      borderRadius: 10,
      borderSkipped: false,
      maxBarThickness: 46,
      categoryPercentage: 0.72,
      barPercentage: 0.78,
      backgroundColor: monthlyValues.map((_, index) => (
        index === monthlyValues.length - 1 ? "rgba(45,212,191,.88)" : "rgba(16,185,129,.68)"
      )),
      borderColor: monthlyValues.map((_, index) => (
        index === monthlyValues.length - 1 ? "rgba(103,232,249,.9)" : "rgba(52,211,153,.72)"
      )),
      borderWidth: 1,
    }],
  };
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="min-w-0 max-w-full space-y-5 overflow-x-clip">
      <div data-testid="kpi-grid" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <AnimatedKpi icon={WalletCards} label={t("overview.totalCost")} value={stats.totalCost} format={money} detail={period === "all" ? t("overview.allTime") : t("overview.lastMonths", { count: period })} trend={stats.comparison.totalCostChange} sparkline={monthlyValues} />
        <AnimatedKpi icon={Gauge} label={t("overview.costPerKm")} value={stats.costPerKm || 0} format={(value) => stats.costPerKm == null ? "-" : money(value)} detail={t("overview.evaluatedKm", { count: stats.totalDistance.toLocaleString("de-AT") })} tone="cyan" sparkline={monthlyValues} />
        <AnimatedKpi icon={Fuel} label={t("overview.consumption")} value={stats.averageConsumption || 0} format={(value) => stats.averageConsumption == null ? "-" : `${value.toFixed(1)} l/100 km`} detail={t("overview.fullTankOnly")} tone="amber" />
        <AnimatedKpi icon={Car} label={t("overview.mileage")} value={selectedVehicle?.kilometerstand || 0} format={(value) => selectedVehicle ? `${Math.round(value).toLocaleString("de-AT")} km` : "-"} detail={selectedVehicle?.kennzeichen || t("overview.selectVehicle")} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.42fr_.58fr]">
        <GlassPanel className="p-4 md:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0"><h2 className="font-semibold">{t("overview.costTrend")}</h2><p className="break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("overview.costTrendHint")}</p></div>
            <select className="w-full rounded-full border border-light-border bg-white/50 px-3 py-2 text-xs md:w-auto dark:border-white/10 dark:bg-white/5" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="6">6 Monate</option><option value="12">12 Monate</option><option value="24">24 Monate</option><option value="all">Gesamt</option>
            </select>
          </div>
          {stats.monthly.length ? <div className="h-56 min-w-0 md:h-64"><Bar options={overviewChartOptions} data={costData} /></div> : <ChartEmpty />}
        </GlassPanel>
        <GlassPanel className="p-4 md:p-5">
          <h2 className="font-semibold">{t("overview.nextDates")}</h2>
          <div className="mt-4 space-y-1">
            {dueItems.length ? dueItems.slice(0, 6).map((item, index) => (
              <motion.div variants={itemVariants} key={item.id} className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-card-sm px-2 py-3 transition hover:bg-primary-500/[0.06] md:grid-cols-[2rem_minmax(0,1fr)_auto]">
                <span className="relative flex h-8 w-8 items-center justify-center">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.days == null || item.days <= 7 ? "bg-red-500 shadow-[0_0_14px_rgba(239,68,68,.55)]" : "bg-amber-500"}`} />
                  {index < dueItems.slice(0, 6).length - 1 ? <span className="absolute left-1/2 top-7 h-7 w-px bg-light-border dark:bg-white/10" /> : null}
                </span>
                <span className="min-w-0 break-words text-sm font-medium">{item.label}</span>
                <span className="col-start-2 text-xs text-light-text-secondary md:col-start-auto md:whitespace-nowrap dark:text-dark-text-secondary">{item.days < 0 ? "überfällig" : item.days === 0 ? "heute" : `${item.days} Tage`}</span>
              </motion.div>
            )) : <div className="flex min-h-52 flex-col items-center justify-center text-center"><CheckCircle2 className="text-primary-500" /><strong className="mt-3 text-sm">{t("overview.noDates")}</strong></div>}
          </div>
        </GlassPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[.92fr_1.08fr]">
        <GlassPanel className="p-4 md:p-5">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{t("overview.recent")}</h2><button type="button" onClick={onShowCosts} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-500 md:text-sm">{t("overview.showAll")} <ChevronRight size={14} /></button></div>
          <div className="divide-y divide-light-border/70 dark:divide-white/[0.07]">
            {stats.transactions.slice(0, 6).map((row) => (
              <motion.div variants={itemVariants} key={row.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-3 md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:items-center">
                <span className="row-span-2 flex h-10 w-10 items-center justify-center rounded-card-sm bg-gradient-to-br from-primary-500/18 to-secondary-500/8 text-primary-500">{row.type === "fuel" ? <Fuel size={17} /> : row.type === "service" ? <Wrench size={17} /> : <Receipt size={17} />}</span>
                <div className="min-w-0"><div className="line-clamp-2 break-words text-sm font-medium">{formatKfzDisplayText(row.description)}</div></div>
                <strong className="col-start-2 row-start-2 break-words text-sm md:col-start-3 md:row-start-1 md:whitespace-nowrap">{money(row.amount)}</strong>
                <div className="col-start-2 row-start-3 break-words text-xs text-light-text-secondary md:row-start-2 dark:text-dark-text-secondary">{row.category} - {formatDate(row.date)}</div>
              </motion.div>
            ))}
            {!stats.transactions.length ? <div className="py-12 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("overview.noActivity")}</div> : null}
          </div>
        </GlassPanel>
        <VehicleHero vehicle={selectedVehicle} coverPhoto={coverPhoto} photoCount={photoCount} onEdit={onEditVehicle} onGallery={onOpenGallery} />
      </div>
    </motion.div>
  );
}

function ChartEmpty({ title, hint } = {}) {
  const { t } = useTranslation("kfz");
  return <div className="flex h-64 flex-col items-center justify-center rounded-card-sm border border-dashed border-light-border/80 px-5 text-center dark:border-white/10"><Gauge className="text-light-text-secondary dark:text-dark-text-secondary" /><strong className="mt-3 text-sm">{title || t("analytics.noData")}</strong><span className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{hint || t("analytics.noDataHint")}</span></div>;
}

export function KfzAnalytics({ stats }) {
  const { t } = useTranslation("kfz");
  const [view, setView] = useState("charts");
  const reduced = useReducedMotion();
  const currency = (value) => new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
  const averageMonthlyCost = stats.averageMonthlyCost ?? (stats.monthly.length ? stats.totalCost / stats.monthly.length : 0);
  const topCategory = stats.categoryShares[0] || null;
  const viewOptions = [
    ["charts", t("analytics.views.charts"), LayoutDashboard],
    ["insights", t("analytics.views.insights"), ListTree],
    ["ledger", t("analytics.views.ledger"), Table2],
  ];
  const analyticsViewVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 6 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.2 } },
    exit: { opacity: 0, y: reduced ? 0 : -4, transition: { duration: reduced ? 0 : 0.12 } },
  };
  const doughnutData = {
    labels: stats.categoryShares.map((row) => row.label),
    datasets: [{ data: stats.categoryShares.map((row) => row.value), backgroundColor: palette, borderWidth: 0, hoverOffset: 5 }],
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    interaction: { mode: "nearest", intersect: true },
    animation: chartBase.animation,
    plugins: {
      ...chartBase.plugins,
      tooltip: { ...chartBase.plugins.tooltip, callbacks: { label: (context) => `${context.label}: ${context.formattedValue} EUR` } },
    },
  };
  const consumptionData = {
    labels: stats.consumptionSegments.map((row) => new Date(`${row.toDate}T00:00:00`).toLocaleDateString("de-AT")),
    datasets: [{
      label: "l/100 km",
      data: stats.consumptionSegments.map((row) => row.consumption),
      borderColor: "#22d3ee",
      backgroundColor: "rgba(34,211,238,.12)",
      pointBackgroundColor: "#10b981",
      pointBorderWidth: 0,
      pointRadius: 3,
      fill: true,
      tension: 0.34,
    }],
  };
  const consumptionOptions = {
    ...chartBase,
    plugins: {
      ...chartBase.plugins,
      tooltip: {
        ...chartBase.plugins.tooltip,
        callbacks: {
          title: (items) => {
            const segment = stats.consumptionSegments[items[0]?.dataIndex];
            return segment ? `${new Date(`${segment.fromDate}T00:00:00`).toLocaleDateString("de-AT")} - ${new Date(`${segment.toDate}T00:00:00`).toLocaleDateString("de-AT")}` : "";
          },
          label: (context) => `${Number(context.raw || 0).toFixed(1)} l/100 km`,
          afterLabel: (context) => {
            const segment = stats.consumptionSegments[context.dataIndex];
            if (!segment) return "";
            return `${segment.distance.toLocaleString("de-AT")} km, ${segment.liters.toFixed(2)} l, ${segment.intermediateEntryIds.length} Zwischentankungen`;
          },
        },
      },
    },
  };
  const consumptionEmpty = stats.consumptionState === "waiting_for_full"
    ? { title: t("analytics.waitingForFull"), hint: t("analytics.waitingForFullHint") }
    : { title: t("analytics.noFullAnchor"), hint: t("analytics.noFullAnchorHint") };
  const rankingData = {
    labels: stats.vehicleRanking.map((row) => row.label),
    datasets: [{
      label: "Gesamtkosten",
      data: stats.vehicleRanking.map((row) => row.cost),
      backgroundColor: stats.vehicleRanking.map((_, index) => palette[index % palette.length]),
      borderColor: stats.vehicleRanking.map((_, index) => `${palette[index % palette.length]}cc`),
      borderWidth: 1,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 44,
      categoryPercentage: 0.7,
      barPercentage: 0.72,
    }],
  };
  const rankingOptions = {
    ...chartBase,
    indexAxis: "y",
    interaction: { intersect: true, mode: "nearest" },
    plugins: {
      ...chartBase.plugins,
      tooltip: {
        ...chartBase.plugins.tooltip,
        callbacks: { label: (context) => `${context.dataset.label}: ${currency(context.raw)}` },
      },
    },
    scales: {
      x: {
        ...chartBase.scales.x,
        beginAtZero: true,
        grid: { color: "rgba(148,163,184,.1)" },
        ticks: {
          ...chartBase.scales.x.ticks,
          callback: (value) => new Intl.NumberFormat("de-AT", { notation: "compact", maximumFractionDigits: 1 }).format(value),
        },
      },
      y: {
        ...chartBase.scales.y,
        grid: { display: false },
        ticks: { ...chartBase.scales.y.ticks, autoSkip: false },
      },
    },
  };
  const rankingHeight = Math.min(320, Math.max(180, stats.vehicleRanking.length * 62));
  return (
    <div className="min-w-0 space-y-5">
      <div className={`${glassPanelClass} grid grid-cols-3 gap-1 p-1.5 md:flex md:w-fit`}>
        {viewOptions.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`relative inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-card-sm px-2 text-xs font-semibold transition md:px-4 md:text-sm ${
              view === id
                ? "text-primary-700 dark:text-primary-200"
                : "text-light-text-secondary hover:bg-white/50 dark:text-dark-text-secondary dark:hover:bg-white/[0.05]"
            }`}
          >
            {view === id ? <motion.span layoutId="kfz-analytics-view" className="absolute inset-0 -z-10 rounded-card-sm border border-primary-500/25 bg-primary-500/10 shadow-glow-primary" /> : null}
            <Icon size={15} className="shrink-0" />
            <span className="min-w-0 break-words">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="sync" initial={false}>
        {view === "charts" ? (
          <motion.div key="charts" variants={analyticsViewVariants} initial="hidden" animate="show" exit="exit" className="grid gap-5 xl:grid-cols-2">
            <GlassPanel className="p-5">
              <h3 className="font-semibold">{t("analytics.costMix")}</h3>
              <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("analytics.costMixHint")}</p>
              {stats.categoryShares.length ? (
                <div className="mt-5 grid min-w-0 items-center gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="relative h-52">
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white/95 text-center shadow-[0_0_28px_rgba(15,23,42,.08)] dark:bg-[#07161d] dark:shadow-[0_0_28px_rgba(0,0,0,.3)]">
                      <strong className="max-w-[88px] break-words text-sm leading-tight">{currency(stats.totalCost)}</strong>
                      <span className="mt-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">{t("analytics.categories")}: {stats.categoryShares.length}</span>
                    </div>
                  </div>
                  <div className="space-y-3">{stats.categoryShares.slice(0, 7).map((row, index) => <div key={row.label} className="flex items-center gap-3 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} /><span className="min-w-0 flex-1 truncate">{row.label}</span><strong>{Math.round(row.share * 100)} %</strong></div>)}</div>
                </div>
              ) : <ChartEmpty />}
            </GlassPanel>
            <GlassPanel className="p-5">
              <h3 className="font-semibold">{t("analytics.consumptionTrend")}</h3>
              <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("analytics.consumptionHint")}</p>
              {stats.consumptionSegments.length ? (
                <>
                  <div className="mt-5 h-72"><Line options={consumptionOptions} data={consumptionData} /></div>
                  <div className="mt-4 grid gap-2">
                    {stats.consumptionSegments.slice(-3).reverse().map((segment) => (
                      <div key={`${segment.vehicleId}:${segment.fromDate}:${segment.toDate}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-card-sm border border-light-border/70 px-3 py-2 text-xs dark:border-white/10">
                        <span className="min-w-0 break-words">
                          {new Date(`${segment.fromDate}T00:00:00`).toLocaleDateString("de-AT")} - {new Date(`${segment.toDate}T00:00:00`).toLocaleDateString("de-AT")}
                          {" · "}{segment.intermediateEntryIds.length} {t("analytics.intermediateRefuellings")}
                        </span>
                        <span className="font-semibold">{segment.consumption.toFixed(1)} l/100 km · {segment.quality === "legacy" ? t("analytics.legacyQuality") : t("analytics.verifiedQuality")}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <ChartEmpty {...consumptionEmpty} />}
            </GlassPanel>
            <GlassPanel className="p-5 xl:col-span-2"><h3 className="font-semibold">{t("analytics.ranking")}</h3><p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("analytics.rankingHint")}</p>{stats.vehicleRanking.some((row) => row.cost > 0) ? <div className="mt-5 min-w-0" style={{ height: rankingHeight }}><Bar options={rankingOptions} data={rankingData} /></div> : <ChartEmpty />}</GlassPanel>
          </motion.div>
        ) : null}

        {view === "insights" ? (
          <motion.div key="insights" variants={analyticsViewVariants} initial="hidden" animate="show" exit="exit" className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [t("analytics.insights.total"), currency(stats.totalCost), t("analytics.insights.totalHint")],
                [t("analytics.insights.monthlyAverage"), currency(averageMonthlyCost), t("analytics.insights.monthlyAverageHint")],
                [t("analytics.insights.topCategory"), topCategory?.label || "-", topCategory ? `${Math.round(topCategory.share * 100)} %` : t("analytics.noData")],
                [t("analytics.insights.bookings"), stats.transactions.length.toLocaleString("de-AT"), t("analytics.insights.bookingsHint")],
              ].map(([label, value, hint]) => (
                <GlassPanel key={label} className="p-5">
                  <span className="text-xs font-semibold uppercase tracking-[0.13em] text-light-text-secondary dark:text-dark-text-secondary">{label}</span>
                  <strong className="mt-3 block break-words text-2xl">{value}</strong>
                  <span className="mt-1 block text-xs text-light-text-secondary dark:text-dark-text-secondary">{hint}</span>
                </GlassPanel>
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
              <GlassPanel className="p-5">
                <h3 className="font-semibold">{t("analytics.insights.categoryRanking")}</h3>
                <div className="mt-5 space-y-4">
                  {stats.categoryShares.length ? stats.categoryShares.map((row, index) => (
                    <div key={row.label} className="group/row">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-xs text-light-text-secondary">{index + 1}</span>
                        <span className="min-w-0 flex-1 break-words font-medium">{row.label}</span>
                        <strong>{currency(row.value)}</strong>
                      </div>
                      <div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-light-border/60 dark:bg-white/10">
                        <motion.div initial={reduced ? false : { width: 0 }} animate={{ width: `${Math.max(2, row.share * 100)}%` }} className="h-full rounded-full bg-gradient-to-r from-primary-500 to-secondary-400" />
                      </div>
                    </div>
                  )) : <ChartEmpty />}
                </div>
              </GlassPanel>
              <GlassPanel className="p-5">
                <h3 className="font-semibold">{t("analytics.ranking")}</h3>
                <div className="mt-4 space-y-2">
                  {stats.vehicleRanking.length ? stats.vehicleRanking.map((row) => (
                    <div key={row.vehicleId} className="flex items-center gap-3 rounded-card-sm border border-transparent px-3 py-3 transition hover:border-primary-500/20 hover:bg-primary-500/[0.06]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-sm font-bold text-primary-500">{row.rank}</span>
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.label}</span>
                      <strong className="text-sm">{currency(row.cost)}</strong>
                    </div>
                  )) : <ChartEmpty />}
                </div>
              </GlassPanel>
            </div>
          </motion.div>
        ) : null}

        {view === "ledger" ? (
          <motion.div key="ledger" variants={analyticsViewVariants} initial="hidden" animate="show" exit="exit" className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <GlassPanel className="p-5">
              <h3 className="font-semibold">{t("analytics.ledger.months")}</h3>
              <div className="mt-4 space-y-2">
                {stats.monthly.length ? [...stats.monthly].reverse().map(([month, value]) => (
                  <div key={month} className="flex items-center justify-between gap-3 rounded-card-sm px-3 py-3 transition hover:bg-primary-500/[0.06]">
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{month}</span>
                    <strong>{currency(value)}</strong>
                  </div>
                )) : <ChartEmpty />}
              </div>
            </GlassPanel>
            <GlassPanel className="overflow-hidden p-0">
              <div className="p-5"><h3 className="font-semibold">{t("analytics.ledger.bookings")}</h3><p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("analytics.ledger.hint")}</p></div>
              {stats.transactions.length ? (
                <div className="divide-y divide-light-border/70 dark:divide-white/[0.07]">
                  {stats.transactions.slice(0, 20).map((row) => (
                    <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-primary-500/[0.06] md:grid-cols-[110px_120px_minmax(0,1fr)_auto] md:items-center">
                      <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{new Date(`${row.date}T00:00:00`).toLocaleDateString("de-AT")}</span>
                      <span className="col-start-1 row-start-2 text-xs font-semibold text-primary-500 md:col-start-2 md:row-start-1">{row.category}</span>
                      <span className="col-span-2 min-w-0 break-words text-sm md:col-span-1">{formatKfzDisplayText(row.description)}</span>
                      <strong className="col-start-2 row-start-1 text-right text-sm md:col-start-4">{currency(row.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : <div className="p-5"><ChartEmpty /></div>}
            </GlassPanel>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function VehiclePhotoGallery({
  open,
  onClose,
  vehicle,
  photos,
  busy,
  onUpload,
  onSetCover,
  onDelete,
}) {
  const { t } = useTranslation("kfz");
  const [preview, setPreview] = useState(null);
  useEffect(() => { if (!open) setPreview(null); }, [open]);
  return (
    <>
      <ModalShell
        open={open}
        onClose={onClose}
        title={`${t("photos.title")}${vehicle ? ` - ${vehicle.name}` : ""}`}
        maxWidthClass="max-w-5xl"
        dialogClassName="!border-white/10 !bg-white/90 dark:!bg-[#07161d]/95 backdrop-blur-2xl"
        bodyClassName="!max-w-full !overflow-x-clip !p-4 md:!p-5"
      >
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="min-w-0 break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("photos.hint")}</p>
          <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-4 text-sm font-semibold text-white shadow-glow-primary md:w-auto">
            <ImagePlus size={16} /> {t("photos.import")}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="hidden" disabled={busy} onChange={(event) => onUpload([...event.target.files])} />
          </label>
        </div>
        {photos.length ? (
          <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3">
            {photos.map((photo) => (
              <motion.article layout key={photo.id} className="group relative overflow-hidden rounded-card-sm border border-light-border bg-light-card dark:border-white/10 dark:bg-white/[0.04]">
                <VehiclePhoto document={photo} alt={photo.dateiname} onClick={() => setPreview(photo)} className="aspect-[4/3] w-full" />
                {photo.role === "vehicle_cover" ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary-500 px-2 py-1 text-[11px] font-semibold text-white shadow-glow-primary"><Star size={12} fill="currentColor" /> {t("photos.cover")}</span> : null}
                <div className="flex min-w-0 items-center gap-1 p-2">
                  <button type="button" disabled={busy || photo.role === "vehicle_cover"} onClick={() => onSetCover(photo)} className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-card-sm px-1 text-center text-xs font-semibold leading-tight hover:bg-primary-500/10 disabled:opacity-45"><Star size={14} className="shrink-0" /> <span className="break-words">{t("photos.setCover")}</span></button>
                  <button type="button" disabled={busy} onClick={() => onDelete(photo)} className="flex h-9 w-9 items-center justify-center rounded-card-sm text-red-500 hover:bg-red-500/10" aria-label={t("photos.delete")}><Trash2 size={15} /></button>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <label className="mt-5 flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-primary-500/30 bg-primary-500/[0.04] text-center">
            <Upload size={28} className="text-primary-500" /><strong className="mt-3">{t("photos.empty")}</strong><span className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("photos.formats")}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="hidden" disabled={busy} onChange={(event) => onUpload([...event.target.files])} />
          </label>
        )}
      </ModalShell>
      <AnimatePresence>
        {preview ? <PhotoPreview photo={preview} onClose={() => setPreview(null)} /> : null}
      </AnimatePresence>
    </>
  );
}

function PhotoPreview({ photo, onClose }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    loadVehiclePhotoUrl(photo).then((nextUrl) => {
      if (active) setUrl(nextUrl || "");
    }).catch(() => {});
    return () => { active = false; };
  }, [photo]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Schließen"><X /></button>
      {url ? <motion.img initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} src={url} alt={photo.dateiname} className="max-h-[90vh] max-w-full rounded-card object-contain" onClick={(event) => event.stopPropagation()} /> : null}
    </motion.div>
  );
}

export function KfzAlert({ children }) {
  return <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 rounded-card-sm border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 backdrop-blur-xl dark:text-red-300"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{children}</motion.div>;
}
