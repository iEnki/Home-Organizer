import React from "react";
import { BookMarked, LayoutGrid, List, Search, Wheat, X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import SearchableSelect from "../ui/SearchableSelect";
import GlassSurface from "../ui/GlassSurface";

export default function RecipeSearchFilterToolbar({
  searchValue = "",
  onSearchChange,
  sortValue = "neueste",
  onSortChange,
  filterValue = "alle",
  onFilterChange,
  gruppenValue = "keine",
  onGruppenChange,
  periodValue = "all",
  onPeriodChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  viewMode = "kacheln",
  onViewModeChange,
  searchInZutaten = false,
  onSearchInZutatenChange,
  verfuegbareListen = [],
  listenFilter = null,
  onListenFilterChange,
  hasActiveFilters = false,
  onReset,
  totalCount,
  onManageLists,
}) {
  const { t } = useTranslation("recipes");
  const reduced = useReducedMotion();

  const sortItems = [
    { value: "neueste", label: t("toolbar.sort.newest") },
    { value: "aelteste", label: t("toolbar.sort.oldest") },
    { value: "name_az", label: t("toolbar.sort.nameAz") },
    { value: "kochzeit", label: t("toolbar.sort.cookTime") },
  ];
  const filterItems = [
    { value: "alle", label: t("toolbar.filter.all") },
    { value: "favoriten", label: t("toolbar.filter.favorites") },
    { value: "video", label: t("toolbar.filter.video") },
    { value: "manuell", label: t("toolbar.filter.manual") },
  ];
  const groupItems = [
    { value: "keine", label: t("toolbar.group.none") },
    { value: "import_typ", label: t("toolbar.group.type") },
    { value: "tag", label: t("toolbar.group.tag") },
    { value: "favorit", label: t("toolbar.group.favorites") },
    { value: "gruppe", label: t("toolbar.group.group") },
  ];
  const periodOptions = [
    { value: "week", label: t("toolbar.period.week") },
    { value: "two_weeks", label: t("toolbar.period.twoWeeks") },
    { value: "month", label: t("toolbar.period.month") },
    { value: "all", label: t("toolbar.period.all") },
  ];

  return (
    <GlassSurface
      interactive={false}
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 32, delay: 0.06 }}
      className="overflow-hidden"
    >
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
            />
            <input
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchInZutaten ? t("toolbar.searchIngredientPlaceholder") : t("toolbar.searchRecipePlaceholder")}
              aria-label={t("toolbar.searchAria")}
              className="w-full rounded-card-sm border border-light-border bg-light-bg py-2 pl-9 pr-8 text-sm text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
                aria-label={t("toolbar.clearSearch")}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSearchInZutatenChange?.(!searchInZutaten)}
            title={searchInZutaten ? t("toolbar.disableIngredientSearch") : t("toolbar.enableIngredientSearch")}
            className={`flex flex-shrink-0 items-center gap-1 rounded-card-sm border px-2 py-2 text-xs transition-colors ${
              searchInZutaten
                ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                : "border-light-border bg-light-card text-light-text-secondary hover:border-primary-500/50 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-secondary"
            }`}
          >
            <Wheat size={14} />
            <span className="hidden sm:inline">{t("toolbar.ingredients")}</span>
          </button>

          <div
            className="flex flex-shrink-0 items-center overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border"
            role="group"
            aria-label={t("toolbar.viewSwitch")}
          >
            <button
              type="button"
              onClick={() => onViewModeChange?.("kacheln")}
              title={t("toolbar.gridView")}
              className={`px-2.5 py-2 transition-colors ${
                viewMode === "kacheln"
                  ? "bg-primary-500 text-white"
                  : "bg-light-card text-light-text-secondary hover:bg-light-hover dark:bg-canvas-2 dark:text-dark-text-secondary dark:hover:bg-canvas-3"
              }`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange?.("liste")}
              title={t("toolbar.listView")}
              className={`px-2.5 py-2 transition-colors ${
                viewMode === "liste"
                  ? "bg-primary-500 text-white"
                  : "bg-light-card text-light-text-secondary hover:bg-light-hover dark:bg-canvas-2 dark:text-dark-text-secondary dark:hover:bg-canvas-3"
              }`}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={sortValue}
            onValueChange={onSortChange}
            items={sortItems}
            placeholder={t("toolbar.sort.placeholder")}
            triggerClassName="flex-shrink-0"
          />
          <SearchableSelect
            value={filterValue}
            onValueChange={onFilterChange}
            items={filterItems}
            placeholder={t("toolbar.filter.all")}
            triggerClassName="flex-shrink-0"
          />
          <SearchableSelect
            value={gruppenValue}
            onValueChange={onGruppenChange}
            items={groupItems}
            placeholder={t("toolbar.group.none")}
            triggerClassName="flex-shrink-0"
          />

          <div className="hidden h-5 w-px bg-light-border dark:bg-dark-border sm:block" />

          <div
            className="flex items-center overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border"
            role="group"
            aria-label={t("toolbar.period.label")}
          >
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPeriodChange?.(opt.value)}
                className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  periodValue === opt.value
                    ? "bg-primary-500 text-white"
                    : "bg-light-card text-light-text-secondary hover:bg-light-hover dark:bg-canvas-2 dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                } ${opt.value !== periodOptions[0].value ? "border-l border-light-border dark:border-dark-border" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange?.(e.target.value)}
              aria-label={t("toolbar.startDate")}
              className="rounded-card-sm border border-light-border bg-light-bg px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none [color-scheme:light] dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main dark:[color-scheme:dark]"
            />
            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange?.(e.target.value)}
              aria-label={t("toolbar.endDate")}
              className="rounded-card-sm border border-light-border bg-light-bg px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none [color-scheme:light] dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main dark:[color-scheme:dark]"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="whitespace-nowrap text-xs text-light-text-secondary underline underline-offset-2 hover:text-primary-500 dark:text-dark-text-secondary dark:hover:text-primary-400 transition-colors self-center"
            >
              {t("toolbar.reset")}
            </button>
          )}
        </div>

        <AnimatePresence>
          {verfuegbareListen.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <BookMarked size={12} className="flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary" />
                <button
                  type="button"
                  onClick={() => onListenFilterChange?.(null)}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors ${
                    listenFilter === null
                      ? "bg-primary-500 text-white"
                      : "bg-light-bg text-light-text-secondary hover:bg-light-hover dark:bg-canvas-1 dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                  }`}
                >
                  {t("toolbar.allLists")}
                </button>
                {verfuegbareListen.map((liste) => (
                  <button
                    key={liste}
                    type="button"
                    onClick={() => onListenFilterChange?.(listenFilter === liste ? null : liste)}
                    className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors ${
                      listenFilter === liste
                        ? "bg-primary-500 text-white"
                        : "bg-light-bg text-light-text-secondary hover:bg-light-hover dark:bg-canvas-1 dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                    }`}
                  >
                    {liste}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-light-border px-4 py-2 dark:border-dark-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
              {t("toolbar.lists")}
            </span>
            <span className="truncate text-xs text-light-text-secondary/60 dark:text-dark-text-secondary/60">
              {totalCount != null ? t("toolbar.recipeCount", { count: totalCount }) : t("toolbar.noneAvailable")}
            </span>
          </div>
          {onManageLists && (
            <button
              type="button"
              onClick={onManageLists}
              className="flex-shrink-0 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors dark:hover:text-primary-400"
            >
              {t("toolbar.manage")}
            </button>
          )}
        </div>
      </div>
    </GlassSurface>
  );
}
