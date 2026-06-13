import React from "react";
import { Search, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { STATUS_CONFIG } from "../../../utils/geraetStatus";
import { getDeviceCategoryLabel } from "./GeraetForm";
import GlassSurface from "../../ui/GlassSurface";

const STATUS_CHIP_REIHENFOLGE = [
  { key: "wartung_faellig", label: "Wartung offen" },
  { key: "gewaehrleistung_bald", label: "Gewaehrl. bald ab" },
  { key: "garantie_bald", label: "Garantie bald ab" },
  { key: "kein_beleg", label: "Ohne Dokument" },
];

export default function GeraetFilterBar({
  suchbegriff,
  onSuche,
  statusFilter,
  onStatus,
  kategorieFilter,
  onKategorie,
  sortierung,
  onSortierung,
  gruppierung,
  onGruppierung,
  verfuegbareKategorien,
  statusZaehlung,
  anzahlGefiltert,
  onAdd,
}) {
  const { t, i18n } = useTranslation(["home", "common"]);
  const statusLabel = (key, fallback) => t(`home:devicesStatus.${key}`, { defaultValue: fallback || STATUS_CONFIG[key]?.label || key });
  const hatAktivenFilter =
    statusFilter !== "alle" ||
    kategorieFilter !== "Alle" ||
    sortierung !== "frist" ||
    suchbegriff !== "";

  const resetAlleFilter = () => {
    onSuche("");
    onStatus("alle");
    onKategorie("Alle");
    onSortierung("frist");
  };

  const gesamtAnzahl = Object.values(statusZaehlung).reduce((summe, anzahl) => summe + anzahl, 0);

  return (
    <div className="sticky top-[72px] z-10 -mx-1 min-w-0 overflow-x-hidden px-1 py-1">
      <GlassSurface interactive={false} className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
            />
            <input
              value={suchbegriff}
              onChange={(event) => onSuche(event.target.value)}
              placeholder={t("home:devicesForm.searchPlaceholder")}
              className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 py-2 pl-9 pr-8 text-sm text-light-text-main dark:text-dark-text-main focus:border-primary-500 focus:outline-none"
            />
            {suchbegriff && (
              <button
                onClick={() => onSuche("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={onAdd}
            className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-primary-500 px-3 py-2 text-sm text-white transition-colors hover:bg-primary-600"
          >
            <Plus size={13} /> {t("home:devicesForm.add")}
          </button>
        </div>

        <div className="flex w-full gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => onStatus("alle")}
            className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === "alle"
                ? "border-primary-500 bg-primary-500 text-white"
                : "border-light-border bg-light-card text-light-text-secondary hover:border-primary-500/50 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-secondary"
            }`}
          >
            {t("home:householdTasks.all", { defaultValue: "All" })}
            <span className={`text-[10px] ${statusFilter === "alle" ? "opacity-80" : "opacity-60"}`}>
              {gesamtAnzahl}
            </span>
          </button>

          {STATUS_CHIP_REIHENFOLGE.map(({ key, label }) => {
            const anzahl = statusZaehlung[key] || 0;
            if (anzahl === 0) return null;
            const aktiv = statusFilter === key;

            return (
              <button
                key={key}
                onClick={() => onStatus(aktiv ? "alle" : key)}
                className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                  aktiv
                    ? "border-primary-500 bg-primary-500 text-white"
                    : "border-light-border bg-light-card text-light-text-secondary hover:border-primary-500/50 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-secondary"
                }`}
              >
                {statusLabel(key, label)}
                <span className={`text-[10px] ${aktiv ? "opacity-80" : "opacity-60"}`}>{anzahl}</span>
              </button>
            );
          })}

          {verfuegbareKategorien.length > 0 && (
            <div className="h-5 w-px flex-shrink-0 self-center bg-light-border dark:bg-dark-border" />
          )}

          {verfuegbareKategorien.map((kategorie) => {
            const aktiv = kategorieFilter === kategorie;

            return (
              <button
                key={kategorie}
                onClick={() => onKategorie(aktiv ? "Alle" : kategorie)}
                className={`flex-shrink-0 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                  aktiv
                    ? "border-primary-500 bg-primary-500 text-white"
                    : "border-light-border bg-light-card text-light-text-secondary hover:border-primary-500/50 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-secondary"
                }`}
              >
                {getDeviceCategoryLabel(kategorie, i18n.language)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortierung}
            onChange={(event) => onSortierung(event.target.value)}
            className="flex-shrink-0 rounded-card-sm border border-light-border bg-light-card px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
          >
            <option value="frist">{t("home:devicesSort.nextDeadline", { defaultValue: "Next deadline first" })}</option>
            <option value="name">Name A-Z</option>
            <option value="kaufdatum_desc">{t("home:devicesSort.purchaseDateNewest", { defaultValue: "Purchase date, newest first" })}</option>
            <option value="erstellt_desc">{t("home:devicesSort.recentlyCreated", { defaultValue: "Recently created" })}</option>
          </select>

          <select
            value={gruppierung}
            onChange={(event) => onGruppierung(event.target.value)}
            className="flex-shrink-0 rounded-card-sm border border-light-border bg-light-card px-2 py-1.5 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
          >
            <option value="keine">{t("home:devicesGroup.none", { defaultValue: "No grouping" })}</option>
            <option value="status">{t("home:devicesGroup.status", { defaultValue: "By status" })}</option>
            <option value="kategorie">{t("home:devicesGroup.category", { defaultValue: "By category" })}</option>
          </select>
        </div>

        {hatAktivenFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {t("home:devicesCount", { count: anzahlGefiltert, defaultValue: `${anzahlGefiltert} devices` })}
            </span>

            {statusFilter !== "alle" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-xs text-primary-500">
                {statusLabel(statusFilter)}
                <button onClick={() => onStatus("alle")} className="hover:text-primary-600">
                  <X size={10} />
                </button>
              </span>
            )}

            {kategorieFilter !== "Alle" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-xs text-primary-500">
                {getDeviceCategoryLabel(kategorieFilter, i18n.language)}
                <button onClick={() => onKategorie("Alle")} className="hover:text-primary-600">
                  <X size={10} />
                </button>
              </span>
            )}

            {sortierung !== "frist" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-xs text-primary-500">
                {sortierung === "name"
                  ? "Name A-Z"
                  : sortierung === "kaufdatum_desc"
                    ? t("home:devicesForm.purchaseDate")
                    : t("home:devicesSort.recentlyCreated", { defaultValue: "Recently created" })}
                <button onClick={() => onSortierung("frist")} className="hover:text-primary-600">
                  <X size={10} />
                </button>
              </span>
            )}

            <button
              onClick={resetAlleFilter}
              className="text-xs text-light-text-secondary underline underline-offset-2 hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
            >
              {t("common:actions.reset")}
            </button>
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
