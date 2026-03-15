import React, { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

const MobileSearchSheet = ({
  open,
  searchValue,
  onSearchChange,
  searchResults,
  onSearchResultClick,
  onClose,
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const onEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[130] bg-light-bg dark:bg-canvas-1">
      <div
        className="sticky top-0 z-10 px-4 pt-3 pb-3 border-b border-light-border dark:border-dark-border
                   bg-light-card-bg/95 dark:bg-canvas-2/95 backdrop-blur"
        style={{ paddingTop: "calc(var(--safe-area-top) + 0.75rem)" }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
            />
            <input
              ref={inputRef}
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Suchen..."
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-pill
                         bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border
                         text-light-text-main dark:text-dark-text-main focus:outline-none focus:ring-2 focus:ring-secondary-500"
            />
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-card-sm border border-light-border dark:border-dark-border
                       text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-light-hover dark:hover:bg-canvas-3 flex items-center justify-center"
            aria-label="Suche schließen"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 pb-[calc(var(--mobile-bottom-offset)+1rem)]">
        {searchValue.trim().length < 2 ? (
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Mindestens 2 Zeichen eingeben.
          </p>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Keine Treffer.</p>
        ) : (
          <div className="space-y-2">
            {searchResults.map((r, idx) => (
              <button
                key={`${r.link}-${idx}`}
                onClick={() => {
                  onSearchResultClick(r.link);
                  onClose();
                }}
                className="w-full text-left px-3 py-2.5 rounded-card-sm border border-light-border dark:border-dark-border
                           bg-light-card-bg dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-600 dark:text-primary-400
                               font-medium shrink-0"
                  >
                    {r.modul}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">{r.text}</p>
                    {r.sub && (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{r.sub}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileSearchSheet;
