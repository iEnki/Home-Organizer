import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Repeat, Settings } from "lucide-react";
import { MOBILE_NAV_REGISTRY, MOBILE_NAV_ACCENTS } from "../../config/mobileNavConfig";

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
  const { t } = useTranslation(["nav"]);
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
  const modeLabel = appMode === "home" ? t("nav:mobile.switchToMove") : t("nav:mobile.switchToHome");

  const handleNavigate = (path) => {
    onNavigate(path);
    onClose();
  };

  return (
    <div className="lg:hidden fixed inset-0 z-[120]">
      <button
        className="absolute inset-0 bg-canvas-0/65 backdrop-blur-sm animate-fade-in"
        aria-label={t("nav:mobile.closeMenu")}
        onClick={onClose}
      />

      <section
        className="absolute inset-x-0 bottom-0 rounded-t-card border-t border-light-border/70 dark:border-white/[0.10]
                   bg-white/60 dark:bg-canvas-1/55 glass-chrome
                   shadow-elevation-3 max-h-[82dvh] overflow-y-auto animate-slide-in-up"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        {/* Drag-Handle */}
        <div className="pt-2.5 flex justify-center">
          <div className="h-1 w-9 rounded-pill bg-light-border dark:bg-white/15" />
        </div>

        <div className="sticky top-0 z-10 px-4 py-3 border-b border-light-border/60 dark:border-white/[0.07]
                        bg-white/70 dark:bg-canvas-1/70 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("nav:items.more")}</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary
                         hover:bg-light-hover dark:hover:bg-white/[0.06] transition-colors"
              aria-label={t("nav:mobile.closeMenu")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {registry.map((item, idx) => {
            const Icon = item.icon;
            const active = item.path === "/home" ? activeRoute === "/home" : activeRoute.startsWith(item.path);
            const isFavorite = favKeySet.has(item.key);
            const accent = MOBILE_NAV_ACCENTS[item.path] || "16,185,129";
            return (
              <button
                key={item.key}
                onClick={() => handleNavigate(item.path)}
                style={{
                  "--nav-accent": accent,
                  animationDelay: `${Math.min(idx * 22, 320)}ms`,
                  animationFillMode: "both",
                }}
                className={`relative overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-card-sm border text-left
                            animate-slide-in-up transition-colors duration-200 active:scale-[0.98] ${
                  active
                    ? "sidebar-item-active"
                    : "border-light-border/70 dark:border-white/[0.07] bg-white/30 dark:bg-white/[0.025] text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-white/[0.06]"
                }`}
              >
                <span className="sidebar-item-icon flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </span>
                <span className="text-sm font-medium flex-1">{t(item.labelKey, { defaultValue: item.label })}</span>
                {isFavorite && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-pill
                                   bg-primary-500/10 text-primary-500 border border-primary-500/20 shrink-0">
                    {t("nav:mobile.bottomBar")}
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
                       bg-white/30 dark:bg-white/[0.04] border border-light-border/70 dark:border-white/[0.10]
                       text-light-text-secondary dark:text-dark-text-secondary text-sm
                       hover:bg-light-hover dark:hover:bg-white/[0.07] transition-colors active:scale-[0.98]"
          >
            <Settings size={16} /> {t("nav:mobile.customizeBottomBar")}
          </button>

          <button
            onClick={() => {
              onToggleMode?.();
              onClose();
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-pill bg-secondary-500/15 text-secondary-600 dark:text-secondary-300
                       border border-secondary-500/30 hover:bg-secondary-500/25 transition-colors active:scale-[0.98]"
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
