import React from "react";
import { useTranslation } from "react-i18next";
import { Search, X, Plus, ScanLine, ScanBarcode, Camera, LayoutList, LayoutGrid } from "lucide-react";
import { BUCH_STATUS, BUCH_SORTIERUNGEN } from "../../../utils/buecher";
import GlassSurface from "../../ui/GlassSurface";

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
    <GlassSurface interactive={false} className="space-y-2.5 mb-4 p-3">
      {/* Row 1: Search + Sort + Add */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
          <input
            type="text"
            value={suche}
            onChange={(e) => onSucheChange(e.target.value)}
            placeholder={t("books:filter.searchPlaceholder")}
            className="w-full pl-8 pr-8 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card/80 dark:bg-canvas-2/80 backdrop-blur-sm text-light-text-main dark:text-dark-text-main placeholder:text-light-text-secondary dark:placeholder:text-dark-text-secondary focus:outline-none focus:border-secondary-500 transition-colors"
          />
          {suche && (
            <button
              onClick={() => onSucheChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <select
          value={sortierung}
          onChange={(e) => onSortierungChange(e.target.value)}
          className="shrink-0 max-w-[130px] sm:max-w-none px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-secondary-500 transition-colors"
        >
          {BUCH_SORTIERUNGEN.map((s) => (
            <option key={s.value} value={s.value}>{t(`books:sort.${s.value}`, { defaultValue: s.label })}</option>
          ))}
        </select>
        <button
          onClick={onNeu}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-card-sm bg-primary-500 hover:bg-primary-600 text-white font-medium shrink-0 transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">{t("books:filter.addBook")}</span>
        </button>
      </div>

      {/* Row 2: View toggle + Scan actions */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden shrink-0 bg-light-card dark:bg-canvas-2">
          <button
            onClick={() => onAnsichtChange("liste")}
            className={`flex items-center justify-center px-2.5 py-2 transition-colors ${
              ansicht === "liste"
                ? "bg-secondary-500 text-white"
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
                ? "bg-secondary-500 text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
            }`}
            title={t("books:filter.cardView")}
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        <div className="h-5 w-px bg-light-border dark:bg-dark-border shrink-0" />

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            onClick={onScanEinzel}
            title={t("books:filter.scanSingle")}
            className="flex items-center gap-1.5 px-2.5 py-2 flex-1 sm:flex-none rounded-card-sm border border-secondary-500/40 text-secondary-500 hover:bg-secondary-500/10 hover:border-secondary-500 transition-colors text-xs"
          >
            <ScanLine size={14} />
            <span className="sm:hidden">{t("books:filter.scanSingleBtn")}</span>
          </button>
          <button
            onClick={onScanStapel}
            title={t("books:filter.scanBatch")}
            className="flex items-center gap-1.5 px-2.5 py-2 flex-1 sm:flex-none rounded-card-sm border border-secondary-500/40 text-secondary-500 hover:bg-secondary-500/10 hover:border-secondary-500 transition-colors text-xs"
          >
            <ScanBarcode size={14} />
            <span className="sm:hidden">{t("books:filter.scanBatchBtn")}</span>
          </button>
          <button
            onClick={onFotoAnalyse}
            title={t("books:filter.scanPhoto")}
            className="flex items-center gap-1.5 px-2.5 py-2 flex-1 sm:flex-none rounded-card-sm border border-secondary-500/40 text-secondary-500 hover:bg-secondary-500/10 hover:border-secondary-500 transition-colors text-xs"
          >
            <Camera size={14} />
            <span className="sm:hidden">{t("books:filter.scanPhotoBtn")}</span>
          </button>
        </div>
      </div>

      {/* Row 3: Status chips */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => onStatusFilterChange("")}
          className={`px-3 py-1 text-xs rounded-pill border transition-colors ${
            statusFilter === ""
              ? "bg-primary-500 text-white border-primary-500"
              : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 hover:text-light-text-main dark:hover:text-dark-text-main"
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
                  ? "bg-primary-500 text-white border-primary-500"
                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              {t(`books:status.${key}`)}
            </button>
          ))}
      </div>
    </GlassSurface>
  );
}
