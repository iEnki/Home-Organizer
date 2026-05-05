import React from "react";
import { BarChart2 } from "lucide-react";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
);

const CHART_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: "rgba(156,163,175,1)",
        font: { size: 11 },
      },
    },
  },
};

const SCALE_OPTS = {
  grid: { color: "rgba(75,85,99,0.2)" },
  ticks: { color: "rgba(156,163,175,1)", font: { size: 10 } },
};

const EmptyState = ({ text }) => (
  <div className="flex flex-col items-center py-16 text-center animate-fade-in">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-light-bg dark:bg-canvas-3">
      <BarChart2 size={22} className="text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
    </div>
    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{text}</p>
  </div>
);

function ChartCard({ title, children, delay = 0 }) {
  return (
    <section
      className="relative overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card/80 dark:bg-canvas-2/80 backdrop-blur-sm shadow-elevation-1 dark:shadow-elevation-2 p-4 space-y-3 animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {/* Ambient glow blob */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary-500/5 blur-2xl" />
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-0.5 rounded-full bg-primary-500" />
        <p className="text-[11px] uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary font-medium">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

export default function BudgetStatsCharts({
  modus,
  yearStats,
  monthStats,
  selJahr,
  monatLabel,
}) {
  const { t, i18n } = useTranslation(["budget"]);
  const localizeCategoryData = (data) => ({
    ...data,
    labels: (data?.labels || []).map((label) => getHomeBudgetCategoryLabel(label, i18n.language)),
  });

  if (modus === "jahr" && !yearStats.hasData) {
    return <EmptyState text={t("budget:statistics.noExpensesYear", { year: selJahr })} />;
  }

  if (modus === "monat" && !monthStats.hasData) {
    return <EmptyState text={t("budget:statistics.noExpensesMonth", { month: monatLabel })} />;
  }

  return modus === "jahr" ? (
    <div className="space-y-3">
      <ChartCard title={t("budget:statistics.expensesByCategory")} delay={0}>
        <div className="h-44 sm:h-56">
          <Doughnut
            data={localizeCategoryData(yearStats.doughnutData)}
            options={{
              ...CHART_OPTS_BASE,
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toFixed(2)} EUR`,
                  },
                },
              },
            }}
          />
        </div>
      </ChartCard>

      <ChartCard title={t("budget:statistics.expensesByMonth", { year: selJahr })} delay={60}>
        <div className="h-44 sm:h-56">
          <Bar
            data={yearStats.barData}
            options={{
              ...CHART_OPTS_BASE,
              scales: {
                x: SCALE_OPTS,
                y: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} €` },
                },
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${t("budget:expense")}: ${Number(ctx.raw).toFixed(2)} €`,
                  },
                },
              },
            }}
          />
        </div>
      </ChartCard>

      <ChartCard title={t("budget:statistics.cumulativeExpenses", { year: selJahr })} delay={120}>
        <div className="h-40 sm:h-52">
          <Line
            data={yearStats.lineData}
            options={{
              ...CHART_OPTS_BASE,
              scales: {
                x: SCALE_OPTS,
                y: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} €` },
                },
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${t("budget:statistics.cumulative", { defaultValue: "Kumulativ" })}: ${Number(ctx.raw).toFixed(2)} €`,
                  },
                },
              },
            }}
          />
        </div>
      </ChartCard>

      {yearStats.accountTotals?.length > 0 && (
        <ChartCard title={t("budget:statistics.expensesByAccount")} delay={180}>
          <div className="h-44 sm:h-56">
            <Doughnut
              data={yearStats.accountDoughnutData}
              options={{
                ...CHART_OPTS_BASE,
                plugins: {
                  ...CHART_OPTS_BASE.plugins,
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toFixed(2)} €`,
                    },
                  },
                },
              }}
            />
          </div>
        </ChartCard>
      )}
    </div>
  ) : (
    <div className="space-y-3">
      <ChartCard title={t("budget:statistics.categoryDistribution")} delay={0}>
        <div className="h-44 sm:h-56">
          <Doughnut
            data={localizeCategoryData(monthStats.doughnutData)}
            options={{
              ...CHART_OPTS_BASE,
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toFixed(2)} €`,
                  },
                },
              },
            }}
          />
        </div>
      </ChartCard>

      <ChartCard title={t("budget:statistics.expensesPerCategory")} delay={60}>
        <div style={{ height: `${Math.max(monthStats.categoryTotals.length * 36, 100)}px` }}>
          <Bar
            data={localizeCategoryData(monthStats.barData)}
            options={{
              ...CHART_OPTS_BASE,
              indexAxis: "y",
              scales: {
                x: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} €` },
                },
                y: SCALE_OPTS,
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${Number(ctx.raw).toFixed(2)} €`,
                  },
                },
              },
            }}
          />
        </div>
      </ChartCard>

      {monthStats.accountTotals?.length > 0 && (
        <ChartCard title={t("budget:statistics.expensesByAccount")} delay={120}>
          <div style={{ height: `${Math.max(monthStats.accountTotals.length * 36, 100)}px` }}>
            <Bar
              data={monthStats.accountBarData}
              options={{
                ...CHART_OPTS_BASE,
                indexAxis: "y",
                scales: {
                  x: {
                    ...SCALE_OPTS,
                    ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} €` },
                  },
                  y: SCALE_OPTS,
                },
                plugins: {
                  ...CHART_OPTS_BASE.plugins,
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${Number(ctx.raw).toFixed(2)} €`,
                    },
                  },
                },
              }}
            />
          </div>
        </ChartCard>
      )}
    </div>
  );
}
