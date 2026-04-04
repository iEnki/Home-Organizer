import React, { useState } from "react";
import { FileText, File, Eye, Pencil, MoreVertical, BookOpen, Plus, Trash2, CheckCircle, Loader2 } from "lucide-react";
import { getDokDatum } from "../../../utils/dokumentArchiv";

const KATEGORIE_FARBEN = {
  Rechnung:     "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Vertrag:      "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  Handbuch:     "bg-green-500/10 text-green-600 dark:text-green-400",
  Garantie:     "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Versicherung: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  Behörde:      "bg-red-500/10 text-red-600 dark:text-red-400",
  Gesundheit:   "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  Sonstiges:    "bg-gray-500/10 text-gray-500 dark:text-gray-400",
};

const istRechnungKategorie = (dok) => {
  const typ = (dok?.dokument_typ || "").trim().toLowerCase();
  return typ === "rechnung" || (dok?.kategorie || "").trim() === "Rechnung";
};

const effektiveKategorie = (dok) => {
  if (dok?.kategorie) return dok.kategorie;
  if ((dok?.dokument_typ || "").trim().toLowerCase() === "rechnung") return "Rechnung";
  const match = dok?.beschreibung?.match(/\[([^\]]+)\]$/);
  return match ? match[1] : null;
};

const istBildDatei = (dok) =>
  (dok?.datei_typ || "").startsWith("image/") ||
  /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(dok?.dateiname || "");

const istPdfDatei = (dok) =>
  (dok?.datei_typ || "").includes("pdf") || /\.pdf$/i.test(dok?.dateiname || "");

function DateiIcon({ dok }) {
  if (istBildDatei(dok)) return <File size={18} className="text-blue-500" />;
  if (istPdfDatei(dok)) return <FileText size={18} className="text-red-500" />;
  return <FileText size={18} className="text-light-text-secondary dark:text-dark-text-secondary" />;
}

function formatDatum(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatBetrag(brutto) {
  const n = Number(brutto);
  if (!isFinite(n)) return null;
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export default function DokumentZeile({
  dok,
  vorschauUrl,
  onLoadVorschau,
  onVorschau,
  onBearbeiten,
  onLoeschen,
  onWissen,
  onBudget,
  isHighlighted,
}) {
  const [menuOffen, setMenuOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);

  const kat = effektiveKategorie(dok);
  const katFarbe = KATEGORIE_FARBEN[kat] || KATEGORIE_FARBEN.Sonstiges;
  const istRechnung = istRechnungKategorie(dok);
  const datum = getDokDatum(dok);

  // Haupttext: Lieferant bei Rechnungen, sonst Dateiname
  const haupttext = (istRechnung && dok.rechnung_info?.lieferant_name)
    ? dok.rechnung_info.lieferant_name
    : dok.dateiname;

  // Untertext: bei Rechnungen Datum + Betrag, sonst Beschreibung
  const beschreibungOhneHinweis = dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || "";
  let untertext = null;
  if (istRechnung && dok.rechnung_info) {
    const parts = [];
    if (dok.rechnung_info.rechnungsdatum) parts.push(formatDatum(dok.rechnung_info.rechnungsdatum));
    const betrag = formatBetrag(dok.rechnung_info.brutto);
    if (betrag) parts.push(betrag);
    untertext = parts.join(" · ") || null;
  } else if (beschreibungOhneHinweis) {
    untertext = beschreibungOhneHinweis;
  }

  const handleVorschauKlick = async (e) => {
    e.stopPropagation();
    if (!vorschauUrl) {
      setLaedt(true);
      try {
        await onLoadVorschau?.();
      } finally {
        setLaedt(false);
      }
    }
    onVorschau?.(dok);
  };

  return (
    <div
      data-dokument-id={dok.id}
      onClick={() => onVorschau?.(dok)}
      className={`relative flex min-w-0 max-w-full items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group first:rounded-t-card-sm last:rounded-b-card-sm
        ${isHighlighted
          ? "bg-primary-500/5 ring-1 ring-inset ring-primary-500/30"
          : "hover:bg-light-hover dark:hover:bg-canvas-3"
        }
        ${menuOffen ? "z-[202]" : ""}`}
    >
      {/* Datei-Icon */}
      <div className="w-8 h-8 rounded-lg bg-light-border dark:bg-canvas-3 flex items-center justify-center flex-shrink-0">
        <DateiIcon dok={dok} />
      </div>

      {/* Hauptinhalt */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate leading-snug">
          {haupttext}
        </p>
        {untertext && (
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
            {untertext}
          </p>
        )}
      </div>

      {/* Datum */}
      {datum && (
        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap flex-shrink-0 hidden sm:block">
          {formatDatum(datum)}
        </span>
      )}

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {kat && (
          <span className={`hidden md:inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${katFarbe}`}>
            {kat}
          </span>
        )}
        {dok.im_budget && (
          <CheckCircle size={13} className="text-green-500 flex-shrink-0" title="Im Budget" />
        )}
      </div>

      {/* Aktionen — immer sichtbar auf Mobile, bei hover auf Desktop */}
      <div
        className="flex items-center gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Vorschau */}
        <button
          onClick={handleVorschauKlick}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 hover:text-primary-500 transition-colors"
          title="Vorschau"
        >
          {laedt ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
        </button>

        {/* Bearbeiten */}
        <button
          onClick={() => onBearbeiten?.(dok)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
          title="Bearbeiten"
        >
          <Pencil size={13} />
        </button>

        {/* Mehr-Menü */}
        <div className="relative">
          <button
            onClick={() => setMenuOffen((p) => !p)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
            title="Weitere Aktionen"
          >
            <MoreVertical size={13} />
          </button>

          {menuOffen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-[200]" onClick={() => setMenuOffen(false)} />
              <div className="absolute right-0 top-8 z-[201] w-44 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 py-1 text-sm">
                <button
                  onClick={() => { setMenuOffen(false); onWissen?.(dok); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-amber-600 dark:text-amber-400"
                >
                  <BookOpen size={13} /> Als Wissen
                </button>
                {istRechnung && !dok.im_budget && (
                  <button
                    onClick={() => { setMenuOffen(false); onBudget?.(dok); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-primary-500"
                  >
                    <Plus size={13} /> Zum Budget
                  </button>
                )}
                {istRechnung && dok.im_budget && (
                  <div className="flex items-center gap-2 px-3 py-2 text-green-600 dark:text-green-400 opacity-60 cursor-default text-xs">
                    <CheckCircle size={13} /> Im Budget
                  </div>
                )}
                <div className="border-t border-light-border dark:border-dark-border my-1" />
                <button
                  onClick={() => { setMenuOffen(false); onLoeschen?.(dok.id, dok.storage_pfad, dok.dateiname); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-500"
                >
                  <Trash2 size={13} /> Löschen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
