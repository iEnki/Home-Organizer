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
  grid: { color: "rgba(75,85,99,0.3)" },
  ticks: { color: "rgba(156,163,175,1)", font: { size: 10 } },
};

const CARD_CLS =
  "rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-4 space-y-3";

const EmptyState = ({ text }) => (
  <div className="py-12 text-center text-light-text-secondary dark:text-dark-text-secondary">
    <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
    <p className="text-sm">{text}</p>
  </div>
);

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
      <section className={CARD_CLS}>
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:statistics.expensesByCategory")}
        </p>
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
      </section>

      <section className={CARD_CLS}>
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:statistics.expensesByMonth", { year: selJahr })}
        </p>
        <div className="h-44 sm:h-56">
          <Bar
            data={yearStats.barData}
            options={{
              ...CHART_OPTS_BASE,
              scales: {
                x: SCALE_OPTS,
                y: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} EUR` },
                },
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${t("budget:expense")}: ${Number(ctx.raw).toFixed(2)} EUR`,
                  },
                },
              },
            }}
          />
        </div>
      </section>

      <section className={CARD_CLS}>
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:statistics.cumulativeExpenses", { year: selJahr })}
        </p>
        <div className="h-40 sm:h-52">
          <Line
            data={yearStats.lineData}
            options={{
              ...CHART_OPTS_BASE,
              scales: {
                x: SCALE_OPTS,
                y: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} EUR` },
                },
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${t("budget:statistics.cumulative", { defaultValue: "Cumulative" })}: ${Number(ctx.raw).toFixed(2)} EUR`,
                  },
                },
              },
            }}
          />
        </div>
      </section>

      {yearStats.accountTotals?.length > 0 && (
        <section className={CARD_CLS}>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            {t("budget:statistics.expensesByAccount")}
          </p>
          <div className="h-44 sm:h-56">
            <Doughnut
              data={yearStats.accountDoughnutData}
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
        </section>
      )}
    </div>
  ) : (
    <div className="space-y-3">
      <section className={CARD_CLS}>
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:statistics.categoryDistribution")}
        </p>
        <div className="h-44 sm:h-56">
          <Doughnut
            data={localizeCategoryData(monthStats.doughnutData)}
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
      </section>

      <section className={CARD_CLS}>
        <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {t("budget:statistics.expensesPerCategory")}
        </p>
        <div style={{ height: `${Math.max(monthStats.categoryTotals.length * 36, 100)}px` }}>
          <Bar
            data={localizeCategoryData(monthStats.barData)}
            options={{
              ...CHART_OPTS_BASE,
              indexAxis: "y",
              scales: {
                x: {
                  ...SCALE_OPTS,
                  ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} EUR` },
                },
                y: SCALE_OPTS,
              },
              plugins: {
                ...CHART_OPTS_BASE.plugins,
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${Number(ctx.raw).toFixed(2)} EUR`,
                  },
                },
              },
            }}
          />
        </div>
      </section>

      {monthStats.accountTotals?.length > 0 && (
        <section className={CARD_CLS}>
          <p className="text-[11px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
            {t("budget:statistics.expensesByAccount")}
          </p>
          <div style={{ height: `${Math.max(monthStats.accountTotals.length * 36, 100)}px` }}>
            <Bar
              data={monthStats.accountBarData}
              options={{
                ...CHART_OPTS_BASE,
                indexAxis: "y",
                scales: {
                  x: {
                    ...SCALE_OPTS,
                    ticks: { ...SCALE_OPTS.ticks, callback: (value) => `${value} EUR` },
                  },
                  y: SCALE_OPTS,
                },
                plugins: {
                  ...CHART_OPTS_BASE.plugins,
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${Number(ctx.raw).toFixed(2)} EUR`,
                    },
                  },
                },
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
