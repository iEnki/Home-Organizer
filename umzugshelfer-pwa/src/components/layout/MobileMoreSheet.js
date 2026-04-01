import React, { useEffect } from "react";
import { X, Repeat, Settings } from "lucide-react";
import { MOBILE_NAV_REGISTRY } from "../../config/mobileNavConfig";

const MobileMoreSheet = ({
  open,
  appMode,
  activeRoute,
  onClose,
  onNavigate,
  onToggleMode,
  mobileNavFavorites,
  onOpenNavSettings,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const registry  = MOBILE_NAV_REGISTRY[appMode] || MOBILE_NAV_REGISTRY.home;
  const favKeySet = new Set(mobileNavFavorites?.[appMode] ?? []);
  const modeLabel = appMode === "home" ? "Zum Umzugsplaner wechseln" : "Zum Home Organizer wechseln";

  const handleNavigate = (path) => {
    onNavigate(path);
    onClose();
  };

  return (
    <div className="lg:hidden fixed inset-0 z-[120]">
      <button
        className="absolute inset-0 bg-canvas-0/65 backdrop-blur-sm"
        aria-label="Menü schließen"
        onClick={onClose}
      />

      <section
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-light-border dark:border-dark-border
                   bg-light-card-bg dark:bg-canvas-2 shadow-elevation-3 max-h-[82dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-light-border dark:border-dark-border bg-light-card-bg/95 dark:bg-canvas-2/95 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Mehr</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              aria-label="Menü schließen"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {registry.map((item) => {
            const Icon = item.icon;
            const active = item.path === "/home" ? activeRoute === "/home" : activeRoute.startsWith(item.path);
            const isFavorite = favKeySet.has(item.key);
            return (
              <button
                key={item.key}
                onClick={() => handleNavigate(item.path)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-card-sm border text-left transition-colors ${
                  active
                    ? "border-primary-500/40 bg-primary-500/10 text-primary-500"
                    : "border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                }`}
              >
                <Icon size={16} />
                <span className="text-sm font-medium flex-1">{item.label}</span>
                {isFavorite && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-pill
                                   bg-primary-500/10 text-primary-500 border border-primary-500/20 shrink-0">
                    Bottombar
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-4 pt-1 grid grid-cols-1 gap-2">
          <button
            onClick={onOpenNavSettings}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-pill
                       bg-light-surface-1 dark:bg-canvas-3 border border-light-border dark:border-dark-border
                       text-light-text-secondary dark:text-dark-text-secondary text-sm"
          >
            <Settings size={16} /> Bottombar anpassen
          </button>

          <button
            onClick={() => {
              onToggleMode?.();
              onClose();
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-pill bg-secondary-500/15 text-secondary-600 dark:text-secondary-300 border border-secondary-500/30"
          >
            <Repeat size={16} />
            <span className="text-sm font-medium">{modeLabel}</span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default MobileMoreSheet;
