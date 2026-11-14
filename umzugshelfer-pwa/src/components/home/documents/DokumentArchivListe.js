import React, { useState } from "react";
import { FolderOpen, ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { formatMonatLabel } from "../../../utils/dokumentArchiv";
import DokumentZeile from "./DokumentZeile";

const listVariants = {
  hidden: {},
  show: {},
};

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
  const reduced = useReducedMotion();

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
    <div className="document-month-list">
      {reihenfolge.map((key) => {
        const doks = map[key];
        const istZugeklappt = collapsed.has(key);
        return (
          <div key={key}>
            {/* Monats-Header — Toggle-Button */}
            <button
              onClick={() => toggleCollapse(key)}
              aria-expanded={!istZugeklappt}
              className="w-full flex items-center gap-2.5 px-1 pb-2 text-left group"
            >
              <motion.span
                animate={{ rotate: istZugeklappt ? -90 : 0 }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 28 }}
                style={{ display: "flex", flexShrink: 0 }}
              >
                <ChevronDown size={13} className="text-light-text-secondary dark:text-dark-text-secondary" />
              </motion.span>
              <span className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary group-hover:text-primary-500 transition-colors">
                {formatMonatLabel(key)}
              </span>
              <span className="flex-1 h-px bg-light-border dark:bg-dark-border" aria-hidden="true" />
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-500 border border-primary-500/20 flex-shrink-0">
                {doks.length}
              </span>
            </button>

            {/* Dokumentzeilen — AnimatePresence für Höhen-Übergang */}
            <AnimatePresence initial={false}>
              {!istZugeklappt && (
                <motion.div
                  key={`sec-${key}`}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-visible"
                >
                  <motion.div
                    variants={reduced ? {} : listVariants}
                    initial="hidden"
                    animate="show"
                    className="document-month-rows"
                  >
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
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
