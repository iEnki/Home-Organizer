import React from "react";
import { Search, Upload, List, LayoutGrid, X } from "lucide-react";
import { formatMonatLabel } from "../../../utils/dokumentArchiv";

const KATEGORIEN = [
  "Rechnung", "Vertrag", "Handbuch", "Garantie",
  "Versicherung", "Behörde", "Gesundheit", "Sonstiges",
];

const MONATS_NAMEN = {
  "01": "Januar", "02": "Februar", "03": "März", "04": "April",
  "05": "Mai", "06": "Juni", "07": "Juli", "08": "August",
  "09": "September", "10": "Oktober", "11": "November", "12": "Dezember",
};

export default function DokumentFilterBar({
  suchbegriff,
  onSuche,
  kategorieFilter,
  onKategorie,
  statusFilter,
  onStatus,
  monatFilter,
  onMonat,
  jahrFilter,
  onJahr,
  sortierung,
  onSortierung,
  viewMode,
  onViewMode,
  verfuegbareJahre,
  verfuegbareMonate,
  kategorieZaehlung,
  anzahlGefiltert,
  onUpload,
}) {
  const hatAktivenFilter =
    kategorieFilter !== "Alle" ||
    monatFilter !== "alle" ||
    jahrFilter !== "alle" ||
    sortierung !== "neueste" ||
    statusFilter !== "alle" ||
    suchbegriff !== "";

  const resetAlleFilter = () => {
    onSuche("");
    onKategorie("Alle");
    onMonat("alle");
    onJahr("alle");
    onSortierung("neueste");
    onStatus("alle");
  };

  const formatMonatOption = (key) => {
    const [, m] = key.split("-");
    return MONATS_NAMEN[m] || formatMonatLabel(key);
  };

  const STATUS_LABEL = { budget: "Im Budget", wissen: "Als Wissen", offen: "Offen (Rechnung)" };

  return (
    <div className="sticky top-0 z-10 bg-light-bg/95 dark:bg-canvas-0/95 backdrop-blur-sm
                    -mx-4 px-4 lg:-mx-6 lg:px-6 pb-3 pt-2
                    border-b border-light-border dark:border-dark-border space-y-2">
      {/* Zeile 1: Suche + Upload + Ansicht */}
      <div className="flex items-center gap-2">
        {/* Suchfeld */}
        <div data-tour="tour-dokumente-suche" className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
          <input
            value={suchbegriff}
            onChange={(e) => onSuche(e.target.value)}
            placeholder="Dokument suchen…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
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

        {/* Upload */}
        <button
          data-tour="tour-dokumente-upload"
          onClick={onUpload}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Upload size={13} /> Hochladen
        </button>

        {/* Ansicht-Toggle */}
        <div className="flex items-center rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden flex-shrink-0">
          <button
            onClick={() => onViewMode("archiv")}
            className={`px-2.5 py-2 transition-colors ${
              viewMode === "archiv"
                ? "bg-primary-500 text-white"
                : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            }`}
            title="Archivansicht"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => onViewMode("karten")}
            className={`px-2.5 py-2 transition-colors ${
              viewMode === "karten"
                ? "bg-primary-500 text-white"
                : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            }`}
            title="Kartenansicht"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Zeile 2: Kategorie-Chips + Monat + Jahr + Sortierung */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Kategorie-Chips (scrollbar) */}
        <div data-tour="tour-dokumente-filter" className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0 max-w-full">
          {["Alle", ...KATEGORIEN].map((kat) => {
            const aktiv = kategorieFilter === kat;
            const anzahl = kat === "Alle" ? undefined : (kategorieZaehlung[kat] || 0);
            if (kat !== "Alle" && anzahl === 0) return null;
            return (
              <button
                key={kat}
                onClick={() => onKategorie(kat)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
                  aktiv
                    ? "bg-primary-500 text-white border-primary-500"
                    : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
                }`}
              >
                {kat}
                {anzahl != null && anzahl > 0 && (
                  <span className={`text-[10px] ${aktiv ? "opacity-80" : "opacity-60"}`}>
                    {anzahl}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Trennlinie auf größeren Screens */}
        <div className="hidden sm:block w-px h-5 bg-light-border dark:bg-dark-border flex-shrink-0" />

        {/* Monat */}
        <select
          value={monatFilter}
          onChange={(e) => onMonat(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="alle">Alle Monate</option>
          {verfuegbareMonate.map((key) => (
            <option key={key} value={key}>
              {formatMonatOption(key)}
            </option>
          ))}
        </select>

        {/* Jahr */}
        <select
          value={jahrFilter}
          onChange={(e) => onJahr(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="alle">Alle Jahre</option>
          {verfuegbareJahre.map((jahr) => (
            <option key={jahr} value={jahr}>{jahr}</option>
          ))}
        </select>

        {/* Sortierung */}
        <select
          value={sortierung}
          onChange={(e) => onSortierung(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="neueste">Neueste zuerst</option>
          <option value="aelteste">Älteste zuerst</option>
          <option value="name_az">Name A–Z</option>
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => onStatus(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="alle">Alle Status</option>
          <option value="budget">Im Budget</option>
          <option value="wissen">Als Wissen</option>
          <option value="offen">Offen (Rechnung)</option>
        </select>
      </div>

      {/* Zeile 3: Aktive Filter + Treffer-Anzahl (nur wenn Filter aktiv) */}
      {hatAktivenFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {anzahlGefiltert} {anzahlGefiltert === 1 ? "Dokument" : "Dokumente"}
          </span>

          {kategorieFilter !== "Alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {kategorieFilter}
              <button onClick={() => onKategorie("Alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {monatFilter !== "alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {formatMonatLabel(monatFilter)}
              <button onClick={() => onMonat("alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {jahrFilter !== "alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {jahrFilter}
              <button onClick={() => onJahr("alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {sortierung !== "neueste" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {sortierung === "aelteste" ? "Älteste zuerst" : "Name A–Z"}
              <button onClick={() => onSortierung("neueste")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {statusFilter !== "alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {STATUS_LABEL[statusFilter]}
              <button onClick={() => onStatus("alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          <button
            onClick={resetAlleFilter}
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main underline underline-offset-2"
          >
            Alle zurücksetzen
          </button>
        </div>
      )}
    </div>
  );
}
