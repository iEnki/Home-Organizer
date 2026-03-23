import React, { useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";

const MobileFilterSheet = ({
  open,
  onClose,
  statusFilter,
  onStatusChange,
  statusLabel,
  bewohnerFilter,
  onBewohnerChange,
  bewohner,
  onReset,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[125]">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Filter schließen"
      />

      <section
        className="absolute inset-x-0 bottom-0 bg-light-card dark:bg-canvas-2
                   rounded-t-2xl border-t border-light-border dark:border-dark-border
                   max-h-[86dvh] overflow-y-auto shadow-elevation-3"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border bg-light-card/95 dark:bg-canvas-2/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-primary-500" />
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Filter</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            aria-label="Filter schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border
                         bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
            >
              <option value="">Alle Status</option>
              {Object.entries(statusLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {bewohner.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Bewohner
              </label>
              <select
                value={bewohnerFilter}
                onChange={(e) => onBewohnerChange(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border
                           bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
              >
                <option value="">Alle Bewohner</option>
                {bewohner.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    {eintrag.emoji} {eintrag.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-2 grid grid-cols-2 gap-2">
            <button
              onClick={onReset}
              className="px-3 py-2.5 rounded-card-sm border border-light-border dark:border-dark-border
                         text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
            >
              Zurücksetzen
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2.5 rounded-pill bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              Fertig
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MobileFilterSheet;
