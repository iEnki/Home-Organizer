import React from "react";
import { useTranslation } from "react-i18next";
import { Search, Upload, List, LayoutGrid, X } from "lucide-react";
import { formatMonatLabel } from "../../../utils/dokumentArchiv";

const KATEGORIEN = ["Rechnung", "Vertrag", "Handbuch", "Garantie", "Versicherung", "Behörde", "Gesundheit", "Medikamente", "Sonstiges"];
const MONATS_NAMEN = { "01": "Januar", "02": "Februar", "03": "März", "04": "April", "05": "Mai", "06": "Juni", "07": "Juli", "08": "August", "09": "September", "10": "Oktober", "11": "November", "12": "Dezember" };

export default function DokumentFilterBar({
  suchbegriff, onSuche, kategorieFilter, onKategorie, statusFilter, onStatus,
  monatFilter, onMonat, jahrFilter, onJahr, sortierung, onSortierung, viewMode,
  onViewMode, verfuegbareJahre, verfuegbareMonate, kategorieZaehlung, anzahlGefiltert,
  onUpload, children,
}) {
  const { t } = useTranslation(["documents", "common"]);
  const label = key => t(`documents:archiveLayout.${key}`);
  const categoryLabel = kat => kat === "Alle" ? label("allCategories") : t(`documents:categories.${kat}`, { defaultValue: kat });
  const kategorien = ["Alle", ...KATEGORIEN, ...Object.keys(kategorieZaehlung || {}).filter(kat => kat && kat !== "Alle" && !KATEGORIEN.includes(kat))]
    .filter(kat => kat === "Alle" || kat === kategorieFilter || (kategorieZaehlung?.[kat] || 0) > 0);
  const hatAktivenFilter = kategorieFilter !== "Alle" || monatFilter !== "alle" || jahrFilter !== "alle" || sortierung !== "neueste" || statusFilter !== "alle" || suchbegriff !== "";
  const resetAlleFilter = () => { onSuche(""); onKategorie("Alle"); onMonat("alle"); onJahr("alle"); onSortierung("neueste"); onStatus("alle"); };
  // The original option labels and values are preserved; only their placement changes.
  const formatMonatOption = key => MONATS_NAMEN[key.split("-")[1]] || formatMonatLabel(key);
  const statusLabels = { budget: label("inBudget"), wissen: label("asKnowledge"), offen: label("openInvoice") };
  const chips = [
    kategorieFilter !== "Alle" && [categoryLabel(kategorieFilter), () => onKategorie("Alle")],
    monatFilter !== "alle" && [formatMonatLabel(monatFilter), () => onMonat("alle")],
    jahrFilter !== "alle" && [jahrFilter, () => onJahr("alle")],
    sortierung !== "neueste" && [label(sortierung === "aelteste" ? "oldest" : "nameAz"), () => onSortierung("neueste")],
    statusFilter !== "alle" && [statusLabels[statusFilter], () => onStatus("alle")],
  ].filter(Boolean);
  const filterFields = () => <div className="document-filter-fields">
    <label>{label("year")}<select value={jahrFilter} onChange={e => onJahr(e.target.value)}><option value="alle">{label("allYears")}</option>{verfuegbareJahre.map(jahr => <option key={jahr} value={jahr}>{jahr}</option>)}</select></label>
    <label>{label("month")}<select value={monatFilter} onChange={e => onMonat(e.target.value)}><option value="alle">{label("allMonths")}</option>{verfuegbareMonate.map(key => <option key={key} value={key}>{formatMonatOption(key)}</option>)}</select></label>
    <label>{label("status")}<select value={statusFilter} onChange={e => onStatus(e.target.value)}><option value="alle">{label("allStatus")}</option>{Object.entries(statusLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
    <label>{label("sort")}<select value={sortierung} onChange={e => onSortierung(e.target.value)}><option value="neueste">{label("newest")}</option><option value="aelteste">{label("oldest")}</option><option value="name_az">{label("nameAz")}</option></select></label>
  </div>;
  return <div className="document-archive-layout">
    <aside className="document-category-sidebar" aria-label={label("categories")}>
      <h2>{label("categories")}</h2>
      <nav aria-label={label("categories")}>{kategorien.map(kat => <button type="button" key={kat} aria-pressed={kategorieFilter === kat} onClick={() => onKategorie(kat)}>
        <span>{categoryLabel(kat)}</span>{kat !== "Alle" && <span className="tabular-nums">{kategorieZaehlung?.[kat] || 0}</span>}
      </button>)}</nav>
    </aside>
    <div className="document-archive-main">
      <div className="document-search-toolbar">
        <div data-tour="tour-dokumente-suche" className="document-search-field">
          <Search size={18} aria-hidden="true" />
          <input aria-label={label("search")} placeholder={label("search")} value={suchbegriff} onChange={e => onSuche(e.target.value)} />
          {suchbegriff && <button type="button" aria-label={label("clearSearch")} onClick={() => onSuche("")}><X size={18} /></button>}
        </div>
        <div className="document-toolbar-actions">
          <button type="button" data-tour="tour-dokumente-upload" onClick={onUpload} className="document-upload bg-primary-500 text-white"><Upload size={17} aria-hidden="true" />{t("documents:upload")}</button>
          <div className="document-view-switch" role="group" aria-label={label("view")}>
            {[["archiv", List, "listView"], ["karten", LayoutGrid, "cardView"]].map(([mode, Icon, key]) => <button type="button" key={mode} aria-label={label(key)} title={label(key)} aria-pressed={viewMode === mode} onClick={() => onViewMode(mode)}><Icon size={18} /></button>)}
          </div>
        </div>
      </div>
      <div data-tour="tour-dokumente-filter" className="document-filter-area">
        <label className="document-mobile-category">{label("categories")}<select value={kategorieFilter} onChange={e => onKategorie(e.target.value)}>{kategorien.map(kat => <option key={kat} value={kat}>{categoryLabel(kat)}{kat !== "Alle" ? ` (${kategorieZaehlung?.[kat] || 0})` : ""}</option>)}</select></label>
        <div className="document-desktop-filters">{filterFields()}</div>
        <details className="document-mobile-filters"><summary>{label("moreFilters")}</summary>{filterFields()}</details>
      </div>
      <div className="document-active-filters">
        <span role="status" aria-live="polite">{t("documents:archiveLayout.count", { count: anzahlGefiltert })}</span>
        {chips.map(([text, clear], index) => <button type="button" key={index} className="document-filter-chip" onClick={clear} aria-label={t("documents:archiveLayout.removeFilter", { filter: text })}>{text}<X size={14} aria-hidden="true" /></button>)}
        {hatAktivenFilter && <button type="button" className="document-reset" onClick={resetAlleFilter}>{label("reset")}</button>}
      </div>
      {children}
    </div>
  </div>;
}
