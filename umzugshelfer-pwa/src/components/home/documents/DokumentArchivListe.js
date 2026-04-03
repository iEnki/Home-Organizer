import React, { useState } from "react";
import { FolderOpen, ChevronDown } from "lucide-react";
import { formatMonatLabel } from "../../../utils/dokumentArchiv";
import DokumentZeile from "./DokumentZeile";

export default function DokumentArchivListe({
  gruppiertNachMonat,
  vorschauUrls,
  loadPreviewUrl,
  highlightedDokumentId,
  onVorschau,
  onBearbeiten,
  onLoeschen,
  onWissen,
  onBudget,
}) {
  const { map, reihenfolge } = gruppiertNachMonat;
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleCollapse = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (reihenfolge.length === 0) {
    return (
      <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
        <FolderOpen size={40} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">Keine Dokumente gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      {reihenfolge.map((key) => {
        const doks = map[key];
        const istZugeklappt = collapsed.has(key);
        return (
          <div key={key}>
            {/* Monats-Header — Toggle-Button */}
            <button
              onClick={() => toggleCollapse(key)}
              className="w-full flex items-center gap-2 px-1 pb-1.5 text-left group"
            >
              <ChevronDown
                size={13}
                className={`transition-transform duration-150 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0 ${
                  istZugeklappt ? "-rotate-90" : ""
                }`}
              />
              <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide group-hover:text-primary-500 transition-colors">
                {formatMonatLabel(key)}
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                {doks.length}
              </span>
            </button>

            {/* Dokumentzeilen — nur wenn nicht zugeklappt */}
            {!istZugeklappt && (
              <div className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border overflow-hidden">
                {doks.map((dok) => (
                  <DokumentZeile
                    key={dok.id}
                    dok={dok}
                    vorschauUrl={vorschauUrls[dok.id]}
                    onLoadVorschau={() => loadPreviewUrl(dok)}
                    onVorschau={onVorschau}
                    onBearbeiten={onBearbeiten}
                    onLoeschen={onLoeschen}
                    onWissen={onWissen}
                    onBudget={onBudget}
                    isHighlighted={highlightedDokumentId === dok.id}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
