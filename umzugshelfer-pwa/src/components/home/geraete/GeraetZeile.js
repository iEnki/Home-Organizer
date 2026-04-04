import React, { useState } from "react";
import {
  Wrench, ChevronDown, FileText, MoreVertical,
  Link2, Unlink, CheckCircle, Pencil, Trash2, Eye, ExternalLink,
} from "lucide-react";
import {
  STATUS_CONFIG,
  primaereFrist,
  tageDifferenz,
  formatDatum,
} from "../../../utils/geraetStatus";

const STATUS_FARBE_KLASSEN = {
  red:   "bg-red-500/10 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  gray:  "bg-gray-500/10 text-gray-500 dark:text-gray-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${STATUS_FARBE_KLASSEN[cfg.farbe]}`}>
      {cfg.label}
    </span>
  );
}

function FristZeile({ label, datum, heute }) {
  if (!datum) return null;
  const tage = tageDifferenz(datum, heute);
  const abgelaufen = tage < 0;
  const baldFaellig = tage >= 0 && tage <= 60;
  return (
    <div className={`flex items-center gap-2 text-xs ${abgelaufen ? "line-through opacity-50" : ""}`}>
      <span className="w-36 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">{label}</span>
      <span className={`text-light-text-main dark:text-dark-text-main ${baldFaellig ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
        {formatDatum(datum)}
      </span>
      {!abgelaufen && tage !== Infinity && (
        <span className={`text-[10px] ${baldFaellig ? "text-amber-500" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>
          (noch {tage} {tage === 1 ? "Tag" : "Tage"})
        </span>
      )}
    </div>
  );
}

export default function GeraetZeile({
  g,
  status,
  heute,
  geraetWartungen,
  verknuepfteDokumente,
  isOffen,
  onToggle,
  onBearbeiten,
  onLoeschen,
  onWartungErledigt,
  onDokuModalOpen,
  onDokumentUnlink,
  onVorschau,
  onNavigate,
  isHighlighted,
}) {
  const [menuOffen, setMenuOffen] = useState(false);

  const frist = primaereFrist(g);
  const dokAnzahl = verknuepfteDokumente.length;

  return (
    <div
      data-geraet-id={g.id}
      className={`flex min-w-0 max-w-full flex-col transition-colors
        ${isHighlighted
          ? "bg-primary-500/5 ring-1 ring-inset ring-primary-500/30"
          : ""
        }`}
    >
      {/* Kollabierte Zeile */}
      <div
        onClick={onToggle}
        className="flex min-w-0 items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-light-hover dark:hover:bg-canvas-3 group"
      >
        {/* Gerät-Icon */}
        <div className="w-9 h-9 rounded-lg bg-light-border dark:bg-canvas-3 flex items-center justify-center flex-shrink-0">
          <Wrench size={16} className="text-light-text-secondary dark:text-dark-text-secondary" />
        </div>

        {/* Hauptinhalt */}
        <div className="flex-1 min-w-0">
          {/* Zeile 1: Name · Hersteller */}
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate leading-snug">
              {g.name}
            </p>
            {g.hersteller && (
              <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                · {g.hersteller}
              </span>
            )}
          </div>

          {/* Zeile 2: Kategorie-Chip + Doku-Badge + Primäre Frist */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {g.kategorie && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                {g.kategorie}
              </span>
            )}
            {dokAnzahl > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-blue-500 flex-shrink-0">
                <FileText size={10} /> {dokAnzahl}
              </span>
            )}
            {frist && (
              <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                {frist.label} {formatDatum(frist.datum)}
              </span>
            )}
          </div>
        </div>

        {/* Rechts: Status-Badge + Menü + Chevron */}
        <div
          className="flex items-center gap-1.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <StatusBadge status={status} />

          {/* 3-Punkte-Menü */}
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
                <div className="fixed inset-0 z-[200]" onClick={() => setMenuOffen(false)} />
                <div className="absolute right-0 top-8 z-[201] w-44 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 py-1 text-sm">
                  <button
                    onClick={() => { setMenuOffen(false); onBearbeiten(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
                  >
                    <Pencil size={13} /> Bearbeiten
                  </button>
                  {status === "wartung_faellig" && (
                    <button
                      onClick={() => { setMenuOffen(false); onWartungErledigt(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-primary-500"
                    >
                      <CheckCircle size={13} /> Wartung erledigt
                    </button>
                  )}
                  <div className="border-t border-light-border dark:border-dark-border my-1" />
                  <button
                    onClick={() => { setMenuOffen(false); onLoeschen(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-500"
                  >
                    <Trash2 size={13} /> Löschen
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Chevron */}
          <div onClick={onToggle} className="cursor-pointer">
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 text-light-text-secondary dark:text-dark-text-secondary ${isOffen ? "" : "-rotate-90"}`}
            />
          </div>
        </div>
      </div>

      {/* Aufgeklapptes Panel */}
      {isOffen && (
        <div className="border-t border-light-border dark:border-dark-border px-4 pb-4 pt-3 space-y-4">

          {/* Block 1: Details */}
          {(g.kaufdatum || g.kaufpreis || g.kategorie || g.seriennummer || g.modell || g.notizen) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">Details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {g.kaufdatum && (
                  <div>
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Kaufdatum</span>
                    <p className="text-light-text-main dark:text-dark-text-main font-medium">{formatDatum(g.kaufdatum)}</p>
                  </div>
                )}
                {g.kaufpreis != null && g.kaufpreis !== "" && (
                  <div>
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Kaufpreis</span>
                    <p className="text-light-text-main dark:text-dark-text-main font-medium">
                      {Number(g.kaufpreis).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </p>
                  </div>
                )}
                {g.modell && (
                  <div>
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Modell</span>
                    <p className="text-light-text-main dark:text-dark-text-main font-medium">{g.modell}</p>
                  </div>
                )}
                {g.seriennummer && (
                  <div>
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Seriennummer</span>
                    <p className="text-light-text-main dark:text-dark-text-main font-medium">{g.seriennummer}</p>
                  </div>
                )}
                {g.kategorie && (
                  <div>
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">Kategorie</span>
                    <p className="text-light-text-main dark:text-dark-text-main font-medium">{g.kategorie}</p>
                  </div>
                )}
              </div>
              {g.notizen && (
                <p className="mt-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary italic">{g.notizen}</p>
              )}
            </div>
          )}

          {/* Block 2: Fristen */}
          {(g.gewaehrleistung_bis || g.garantie_bis || g.naechste_wartung || g.wartungsintervall_monate) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">Fristen</h4>
              <div className="space-y-1">
                <FristZeile label="Gewährleistung bis" datum={g.gewaehrleistung_bis} heute={heute} />
                <FristZeile label="Herstellergarantie bis" datum={g.garantie_bis} heute={heute} />
                <FristZeile label="Nächste Wartung" datum={g.naechste_wartung} heute={heute} />
                {g.wartungsintervall_monate && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-36 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">Wartungsintervall</span>
                    <span className="text-light-text-main dark:text-dark-text-main">alle {g.wartungsintervall_monate} Monate</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Block 3: Verknüpfungen (Dokumente + Wartungsprotokoll) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dokumente */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">Dokumente</h4>
              {verknuepfteDokumente.length === 0 ? (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Keine verknüpft.</p>
              ) : (
                <div className="space-y-1 mb-2">
                  {verknuepfteDokumente.map((d) => (
                    <div key={d.id} className="flex items-center gap-1 text-xs group">
                      <FileText size={11} className="text-blue-500 flex-shrink-0" />
                      <span className="flex-1 truncate text-light-text-main dark:text-dark-text-main">{d.dateiname}</span>
                      {/* Vorschau */}
                      {d.storage_pfad && (
                        <button
                          onClick={() => onVorschau?.(d)}
                          className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors"
                          title="Vorschau"
                        >
                          <Eye size={11} />
                        </button>
                      )}
                      {/* Im Archiv öffnen */}
                      <button
                        onClick={() => onNavigate?.(d.id)}
                        className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 transition-colors"
                        title="Im Dokumentenarchiv öffnen"
                      >
                        <ExternalLink size={11} />
                      </button>
                      {/* Verknüpfung lösen */}
                      <button
                        onClick={() => onDokumentUnlink(d.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 transition-opacity"
                        title="Verknüpfung lösen"
                      >
                        <Unlink size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={onDokuModalOpen}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors mt-1"
              >
                <Link2 size={11} /> Dokument verknüpfen
              </button>
            </div>

            {/* Wartungsprotokoll */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
                Wartungsprotokoll ({geraetWartungen.length})
              </h4>
              {geraetWartungen.length === 0 ? (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Noch keine Wartungen.</p>
              ) : (
                <div className="space-y-1">
                  {geraetWartungen.slice(0, 3).map((w) => (
                    <div key={w.id} className="flex items-start gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      <span className="w-20 flex-shrink-0 font-medium">{formatDatum(w.datum)}</span>
                      <span className="truncate">{w.typ}{w.beschreibung ? ` — ${w.beschreibung}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 pt-2 border-t border-light-border dark:border-dark-border">
            <button
              onClick={onBearbeiten}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main transition-colors"
            >
              <Pencil size={11} /> Bearbeiten
            </button>
            {status === "wartung_faellig" && (
              <button
                onClick={onWartungErledigt}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm bg-primary-500 hover:bg-primary-600 text-white transition-colors"
              >
                <CheckCircle size={11} /> Wartung erledigt
              </button>
            )}
            <button
              onClick={onLoeschen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-red-500/30 hover:bg-red-500/10 text-red-500 transition-colors ml-auto"
            >
              <Trash2 size={11} /> Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
