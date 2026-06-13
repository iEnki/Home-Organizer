import React from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { MOBILE_NAV_REGISTRY, MOBILE_NAV_ACCENTS } from "../../config/mobileNavConfig";

const isRouteActive = (activeRoute, path) => {
  if (path === "/home") return activeRoute === "/home";
  if (path === "/dashboard") return activeRoute === "/dashboard";
  return activeRoute.startsWith(path);
};

const MobileBottomNav = ({ activeRoute, appMode, onNavigate, onOpenMore, mobileNavFavorites }) => {
  const { t } = useTranslation(["nav"]);
  const registry  = MOBILE_NAV_REGISTRY[appMode] || MOBILE_NAV_REGISTRY.home;
  const fixedItem = registry.find((i) => i.slot === "fixed-root");
  const favKeys   = mobileNavFavorites?.[appMode] ?? [];
  const favItems  = favKeys.map((k) => registry.find((i) => i.key === k)).filter(Boolean);
  const items     = [fixedItem, ...favItems, { labelKey: "nav:items.more", label: "Mehr", action: "more", icon: Menu }].filter(Boolean);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-[90]
                 border-t border-light-border/70 dark:border-white/[0.08]
                 bg-white/55 dark:bg-canvas-1/50 glass-chrome"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
      aria-label={t("nav:mobile.label")}
    >
      <div className="h-16 mobile-nav-safe-x grid grid-cols-5 gap-1 py-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.path ? isRouteActive(activeRoute, item.path) : false;
          const accent = MOBILE_NAV_ACCENTS[item.path] || "16,185,129";
          const baseClass =
            "relative flex flex-col items-center justify-center rounded-card-sm text-[11px] font-medium " +
            "transition-all duration-200 active:scale-95";

          return item.action === "more" ? (
            <button
              key="mehr"
              onClick={onOpenMore}
              className={`${baseClass} text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main`}
            >
              <Icon size={18} />
              <span className="mt-0.5">{t(item.labelKey, { defaultValue: item.label })}</span>
            </button>
          ) : (
            <button
              key={item.key}
              onClick={() => onNavigate(item.path)}
              style={{ "--nav-accent": accent }}
              className={`${baseClass} ${
                active
                  ? "mobile-nav-item-active"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              <span className="sidebar-item-icon flex items-center justify-center">
                <Icon size={18} />
              </span>
              <span className="mt-0.5">{t(item.labelKey, { defaultValue: item.label })}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
