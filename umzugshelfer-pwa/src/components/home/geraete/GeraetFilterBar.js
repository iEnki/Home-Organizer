import React from "react";
import { Search, Plus, X } from "lucide-react";
import { STATUS_CONFIG, STATUS_PRIORITAET } from "../../../utils/geraetStatus";

const STATUS_CHIP_REIHENFOLGE = [
  { key: "wartung_faellig",      label: "Wartung offen" },
  { key: "gewaehrleistung_bald", label: "Gewährl. bald ab" },
  { key: "garantie_bald",        label: "Garantie bald ab" },
  { key: "kein_beleg",           label: "Ohne Dokument" },
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

  const gesamtAnzahl = Object.values(statusZaehlung).reduce((s, n) => s + n, 0);

  return (
    <div className="sticky top-0 z-10 min-w-0 overflow-x-hidden bg-light-bg/95 dark:bg-canvas-0/95 backdrop-blur-sm
                    lg:-mx-6 lg:px-6 pb-3 pt-2
                    border-b border-light-border dark:border-dark-border space-y-2">

      {/* Zeile 1: Suche + Hinzufügen */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
          <input
            value={suchbegriff}
            onChange={(e) => onSuche(e.target.value)}
            placeholder="Gerät suchen…"
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
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Plus size={13} /> Gerät hinzufügen
        </button>
      </div>

      {/* Zeile 2: Status-Chips + Kategorie-Chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide w-full">
        {/* Alle-Chip */}
        <button
          onClick={() => onStatus("alle")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
            statusFilter === "alle"
              ? "bg-primary-500 text-white border-primary-500"
              : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
          }`}
        >
          Alle
          <span className={`text-[10px] ${statusFilter === "alle" ? "opacity-80" : "opacity-60"}`}>
            {gesamtAnzahl}
          </span>
        </button>

        {/* Status-Chips */}
        {STATUS_CHIP_REIHENFOLGE.map(({ key, label }) => {
          const anzahl = statusZaehlung[key] || 0;
          if (anzahl === 0) return null;
          const aktiv = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => onStatus(aktiv ? "alle" : key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
                aktiv
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
              }`}
            >
              {label}
              <span className={`text-[10px] ${aktiv ? "opacity-80" : "opacity-60"}`}>{anzahl}</span>
            </button>
          );
        })}

        {/* Trennlinie */}
        {verfuegbareKategorien.length > 0 && (
          <div className="w-px h-5 bg-light-border dark:bg-dark-border flex-shrink-0 self-center" />
        )}

        {/* Kategorie-Chips */}
        {verfuegbareKategorien.map((kat) => {
          const aktiv = kategorieFilter === kat;
          return (
            <button
              key={kat}
              onClick={() => onKategorie(aktiv ? "Alle" : kat)}
              className={`px-2.5 py-1 rounded-pill text-xs font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
                aktiv
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
              }`}
            >
              {kat}
            </button>
          );
        })}
      </div>

      {/* Zeile 3: Sortierung + Gruppierung */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={sortierung}
          onChange={(e) => onSortierung(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="frist">Nächste Frist zuerst</option>
          <option value="name">Name A–Z</option>
          <option value="kaufdatum_desc">Kaufdatum neueste zuerst</option>
          <option value="erstellt_desc">Zuletzt angelegt</option>
        </select>

        <select
          value={gruppierung}
          onChange={(e) => onGruppierung(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 flex-shrink-0"
        >
          <option value="keine">Keine Gruppierung</option>
          <option value="status">Nach Status</option>
          <option value="kategorie">Nach Kategorie</option>
        </select>
      </div>

      {/* Zeile 4: Aktive Filter + Treffer-Anzahl */}
      {hatAktivenFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {anzahlGefiltert} {anzahlGefiltert === 1 ? "Gerät" : "Geräte"}
          </span>

          {statusFilter !== "alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {STATUS_CONFIG[statusFilter]?.label || statusFilter}
              <button onClick={() => onStatus("alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {kategorieFilter !== "Alle" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {kategorieFilter}
              <button onClick={() => onKategorie("Alle")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {sortierung !== "frist" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              {sortierung === "name" ? "Name A–Z" : sortierung === "kaufdatum_desc" ? "Kaufdatum" : "Zuletzt angelegt"}
              <button onClick={() => onSortierung("frist")} className="hover:text-primary-600">
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
