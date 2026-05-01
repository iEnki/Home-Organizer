import React from "react";
import { useTranslation } from "react-i18next";
import { Search, X, Plus, ScanLine, ScanBarcode, Camera, LayoutList, LayoutGrid } from "lucide-react";
import { BUCH_STATUS, BUCH_SORTIERUNGEN } from "../../../utils/buecher";

const inputCls =
  "px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

const iconBtnCls =
  "flex items-center justify-center p-2.5 rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 transition-colors";

export default function BuecherFilterBar({
  suche,
  onSucheChange,
  statusFilter,
  onStatusFilterChange,
  sortierung,
  onSortierungChange,
  onNeu,
  ansicht,
  onAnsichtChange,
  onScanEinzel,
  onScanStapel,
  onFotoAnalyse,
}) {
  const { t } = useTranslation(["books"]);

  return (
    <div className="space-y-2 mb-4">
      {/* Zeile 1: Suche + Sortierung + Neu */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
          <input
            type="text"
            value={suche}
            onChange={(e) => onSucheChange(e.target.value)}
            placeholder={t("books:filter.searchPlaceholder")}
            className={`${inputCls} pl-8 w-full`}
          />
          {suche && (
            <button
              onClick={() => onSucheChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <select
          value={sortierung}
          onChange={(e) => onSortierungChange(e.target.value)}
          className={`${inputCls} shrink-0 max-w-[130px] sm:max-w-none`}
        >
          {BUCH_SORTIERUNGEN.map((s) => (
            <option key={s.value} value={s.value}>{t(`books:sort.${s.value}`, { defaultValue: s.label })}</option>
          ))}
        </select>
        <button
          onClick={onNeu}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-card-sm bg-primary-500 text-white font-medium shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">{t("books:filter.addBook")}</span>
        </button>
      </div>

      {/* Zeile 2: Ansicht + Scan-Aktionen */}
      <div className="flex items-center gap-2">
        {/* Ansicht-Toggle */}
        <div className="flex rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden shrink-0">
          <button
            onClick={() => onAnsichtChange("liste")}
            className={`flex items-center justify-center px-2.5 py-2 transition-colors ${
              ansicht === "liste"
                ? "bg-teal-500 text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
            }`}
            title={t("books:filter.listView")}
          >
            <LayoutList size={15} />
          </button>
          <button
            onClick={() => onAnsichtChange("karten")}
            className={`flex items-center justify-center px-2.5 py-2 border-l border-light-border dark:border-dark-border transition-colors ${
              ansicht === "karten"
                ? "bg-teal-500 text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
            }`}
            title={t("books:filter.cardView")}
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        {/* Trennlinie */}
        <div className="h-5 w-px bg-light-border dark:bg-dark-border shrink-0" />

        {/* Scan-Aktionen */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={onScanEinzel}
            className={`${iconBtnCls} flex-1 sm:flex-none sm:w-auto gap-1.5`}
            title={t("books:filter.scanSingle")}
          >
            <ScanLine size={15} />
            <span className="text-xs sm:hidden">{t("books:filter.scanSingleBtn")}</span>
          </button>
          <button
            onClick={onScanStapel}
            className={`${iconBtnCls} flex-1 sm:flex-none sm:w-auto gap-1.5`}
            title={t("books:filter.scanBatch")}
          >
            <ScanBarcode size={15} />
            <span className="text-xs sm:hidden">{t("books:filter.scanBatchBtn")}</span>
          </button>
          <button
            onClick={onFotoAnalyse}
            className={`${iconBtnCls} flex-1 sm:flex-none sm:w-auto gap-1.5`}
            title={t("books:filter.scanPhoto")}
          >
            <Camera size={15} />
            <span className="text-xs sm:hidden">{t("books:filter.scanPhotoBtn")}</span>
          </button>
        </div>
      </div>

      {/* Zeile 3: Status-Chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onStatusFilterChange("")}
          className={`px-3 py-1 text-xs rounded-pill border transition-colors ${
            statusFilter === ""
              ? "bg-primary-500 text-white border-primary-500"
              : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
          }`}
        >
          {t("books:filter.all")}
        </button>
        {Object.keys(BUCH_STATUS)
          .filter((key) => key !== "entsorgt")
          .map((key) => (
            <button
              key={key}
              onClick={() => onStatusFilterChange(key === statusFilter ? "" : key)}
              className={`px-3 py-1 text-xs rounded-pill border transition-colors ${
                statusFilter === key
                  ? "bg-teal-500 text-white border-teal-500"
                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
              }`}
            >
              {t(`books:status.${key}`)}
            </button>
          ))}
      </div>
    </div>
  );
}
