import React from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

export default function BudgetFilterBar({
  suchbegriff,
  onSuche,
  zeitraum,
  onZeitraum,
  zeitraumLabel,
  onPrevZeitraum,
  onNextZeitraum,
  aktiveFilter,
  anzahlGefiltert,
  onOpenFilterSheet,
  onReset,
}) {
  const aktiveFilterAnzahl = aktiveFilter.length;

  return (
    <div
      data-tour="tour-budget-uebersicht"
      className="sticky top-0 z-10 min-w-0 overflow-x-hidden bg-light-bg/95 dark:bg-canvas-0/95 backdrop-blur-sm border-b border-light-border dark:border-dark-border pb-3 pt-2 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative basis-full w-full min-w-0 sm:flex-1 sm:basis-auto">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none"
          />
          <input
            value={suchbegriff}
            onChange={(event) => onSuche(event.target.value)}
            placeholder="Buchung suchen…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
          {suchbegriff && (
            <button
              onClick={() => onSuche("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              aria-label="Suche zurücksetzen"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:min-w-fit sm:justify-start">
          <div className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-1">
            {[
              ["monat", "Monat"],
              ["jahr", "Jahr"],
              ["alle", "Alle"],
            ].map(([wert, label]) => (
              <button
                key={wert}
                onClick={() => onZeitraum(wert)}
                className={`px-2.5 py-1.5 rounded-card-sm text-xs font-medium transition-colors ${
                  zeitraum === wert
                    ? "bg-primary-500 text-white"
                    : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenFilterSheet}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-sm text-light-text-main dark:text-dark-text-main whitespace-nowrap"
          >
            <SlidersHorizontal size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
            Filter
            {aktiveFilterAnzahl > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary-500/15 text-primary-500">
                {aktiveFilterAnzahl}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-1 py-1">
          <Calendar size={13} className="ml-1 text-light-text-secondary dark:text-dark-text-secondary" />
          {zeitraum !== "alle" && (
            <button
              onClick={onPrevZeitraum}
              className="p-1 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              aria-label="Vorheriger Zeitraum"
            >
              <ChevronLeft size={13} />
            </button>
          )}
          <span className="min-w-[78px] px-1 text-center text-xs font-medium text-light-text-main dark:text-dark-text-main">
            {zeitraumLabel}
          </span>
          {zeitraum !== "alle" && (
            <button
              onClick={onNextZeitraum}
              className="p-1 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              aria-label="Nächster Zeitraum"
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
          {anzahlGefiltert} {anzahlGefiltert === 1 ? "Buchung" : "Buchungen"}
        </span>

        {aktiveFilterAnzahl > 0 && (
          <button
            onClick={onReset}
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary underline underline-offset-2"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {aktiveFilterAnzahl > 0 && (
        <div className="flex w-full gap-1.5 overflow-x-auto scrollbar-hide">
          {aktiveFilter.map((filter) => (
            <span
              key={filter.id}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-xs text-primary-500"
            >
              {filter.label}
              {typeof filter.onRemove === "function" && (
                <button
                  onClick={filter.onRemove}
                  className="hover:text-primary-600"
                  aria-label={`${filter.label} entfernen`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
