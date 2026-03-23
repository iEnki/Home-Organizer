import React, { useEffect, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Edit2,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

const MobileLocationSheet = ({
  open,
  onClose,
  orte,
  lagerorte,
  objekte,
  expandedByOrt,
  onToggleOrt,
  ausgewaehlterOrt,
  ausgewaehlterLagerort,
  onSelectAll,
  onSelectOrt,
  onSelectLagerort,
  onCreateOrt,
  onAddLagerort,
  onEditOrt,
  onDeleteOrt,
  onEditLagerort,
  onDeleteLagerort,
}) => {
  const [suche, setSuche] = useState("");
  const [offenesAktionsMenue, setOffenesAktionsMenue] = useState(null);

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

  useEffect(() => {
    if (!open) {
      setSuche("");
      setOffenesAktionsMenue(null);
    }
  }, [open]);

  const aktiveObjekteGesamt = objekte.filter((obj) => obj.status !== "entsorgt").length;

  const lagerorteVonOrt = (ortId) =>
    lagerorte.filter((lagerort) => lagerort.ort_id === ortId && lagerort.parent_id === null);

  const suchbegriff = suche.trim().toLowerCase();
  const gefilterteOrte = !suchbegriff
    ? orte
    : orte.filter((ort) => {
        const ortMatch = (ort.name || "").toLowerCase().includes(suchbegriff);
        if (ortMatch) return true;
        return lagerorteVonOrt(ort.id).some((lagerort) =>
          (lagerort.name || "").toLowerCase().includes(suchbegriff)
        );
      });

  const getLagerortCount = (lagerortId) =>
    objekte.filter((obj) => obj.lagerort_id === lagerortId).length;

  const handleSelectAll = () => {
    onSelectAll();
    onClose();
  };

  const handleSelectOrt = (ortId) => {
    onSelectOrt(ortId);
    onClose();
  };

  const handleSelectLagerort = (ortId, lagerortId) => {
    onSelectLagerort(ortId, lagerortId);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[124]">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Standorte schließen"
      />

      <section
        className="absolute inset-x-0 bottom-0 bg-light-card dark:bg-canvas-2
                   rounded-t-2xl border-t border-light-border dark:border-dark-border
                   max-h-[90dvh] overflow-y-auto shadow-elevation-3"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-light-border dark:border-dark-border bg-light-card/95 dark:bg-canvas-2/95 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-primary-500" />
              <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Standorte</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onCreateOrt}
                className="w-9 h-9 rounded-card-sm border border-light-border dark:border-dark-border
                           text-primary-500 hover:bg-light-hover dark:hover:bg-canvas-3 flex items-center justify-center"
                title="Neuer Standort"
                aria-label="Neuer Standort"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                aria-label="Standorte schließen"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative mt-3">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
            />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Standort oder Lagerort suchen..."
              className="w-full pl-8 pr-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border
                         bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="p-3">
          <button
            onClick={handleSelectAll}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-card-sm text-sm mb-2 transition-colors ${
              !ausgewaehlterOrt
                ? "bg-primary-500/10 text-primary-500 font-medium"
                : "text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
            }`}
          >
            <MapPin size={14} />
            Alle ({aktiveObjekteGesamt})
          </button>

          {gefilterteOrte.length === 0 && (
            <p className="px-2 py-4 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary">
              Keine Standorte gefunden
            </p>
          )}

          {gefilterteOrte.map((ort) => {
            const suchbegriff = suche.trim().toLowerCase();
            const alleLagerorte = lagerorteVonOrt(ort.id);
            const ortMatch = (ort.name || "").toLowerCase().includes(suchbegriff);
            const sichtbareLagerorte = suchbegriff && !ortMatch
              ? alleLagerorte.filter((lagerort) =>
                  (lagerort.name || "").toLowerCase().includes(suchbegriff)
                )
              : alleLagerorte;
            const isOffen = suchbegriff ? true : !!expandedByOrt[ort.id];
            const ortAktiv = ausgewaehlterOrt === ort.id && !ausgewaehlterLagerort;

            return (
              <div
                key={ort.id}
                className="mb-1 rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden"
              >
                <div className={`flex items-center gap-1 px-2 py-1.5 ${ortAktiv ? "bg-primary-500/10" : ""}`}>
                  <button
                    onClick={() => onToggleOrt(ort.id)}
                    className="w-8 h-8 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 flex items-center justify-center"
                    aria-label={isOffen ? "Zuklappen" : "Aufklappen"}
                  >
                    {isOffen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <button
                    onClick={() => handleSelectOrt(ort.id)}
                    className="flex-1 text-left text-sm font-medium text-light-text-main dark:text-dark-text-main truncate px-1"
                  >
                    {ort.name}
                  </button>

                  <button
                    onClick={() =>
                      setOffenesAktionsMenue((prev) => (prev === `ort-${ort.id}` ? null : `ort-${ort.id}`))
                    }
                    className="w-8 h-8 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 flex items-center justify-center"
                    aria-label="Aktionen"
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>

                {offenesAktionsMenue === `ort-${ort.id}` && (
                  <div className="px-2 pb-2 grid grid-cols-3 gap-1">
                    <button
                      onClick={() => {
                        setOffenesAktionsMenue(null);
                        onAddLagerort(ort.id);
                      }}
                      className="px-2 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Plus size={11} />
                        Lagerort
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setOffenesAktionsMenue(null);
                        onEditOrt(ort);
                      }}
                      className="px-2 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Edit2 size={11} />
                        Bearbeiten
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setOffenesAktionsMenue(null);
                        onDeleteOrt(ort.id);
                      }}
                      className="px-2 py-1.5 text-xs rounded-card-sm border border-red-500/30 text-red-500 hover:bg-red-500/10"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Trash2 size={11} />
                        Löschen
                      </span>
                    </button>
                  </div>
                )}

                {isOffen && sichtbareLagerorte.length > 0 && (
                  <div className="pb-2">
                    {sichtbareLagerorte.map((lagerort) => {
                      const lagerortAktiv = ausgewaehlterLagerort === lagerort.id;
                      return (
                        <div key={lagerort.id} className="px-2">
                          <div
                            className={`flex items-center gap-2 pl-8 pr-1 py-1.5 rounded-card-sm ${
                              lagerortAktiv ? "bg-primary-500/10" : "hover:bg-light-hover dark:hover:bg-canvas-3"
                            }`}
                          >
                            <button
                              onClick={() => handleSelectLagerort(ort.id, lagerort.id)}
                              className="flex-1 min-w-0 flex items-center gap-2 text-left"
                            >
                              <Box size={12} className="text-light-text-secondary dark:text-dark-text-secondary" />
                              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary truncate">
                                {lagerort.name}
                              </span>
                              <span className="ml-auto text-xs text-light-text-secondary dark:text-dark-text-secondary opacity-75">
                                {getLagerortCount(lagerort.id)}
                              </span>
                            </button>

                            <button
                              onClick={() =>
                                setOffenesAktionsMenue((prev) =>
                                  prev === `lagerort-${lagerort.id}` ? null : `lagerort-${lagerort.id}`
                                )
                              }
                              className="w-7 h-7 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 flex items-center justify-center"
                              aria-label="Aktionen"
                            >
                              <MoreVertical size={13} />
                            </button>
                          </div>

                          {offenesAktionsMenue === `lagerort-${lagerort.id}` && (
                            <div className="pl-8 pr-1 pb-1.5 grid grid-cols-2 gap-1">
                              <button
                                onClick={() => {
                                  setOffenesAktionsMenue(null);
                                  onEditLagerort(lagerort);
                                }}
                                className="px-2 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Edit2 size={11} />
                                  Bearbeiten
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  setOffenesAktionsMenue(null);
                                  onDeleteLagerort(lagerort.id);
                                }}
                                className="px-2 py-1.5 text-xs rounded-card-sm border border-red-500/30 text-red-500 hover:bg-red-500/10"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Trash2 size={11} />
                                  Löschen
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default MobileLocationSheet;
