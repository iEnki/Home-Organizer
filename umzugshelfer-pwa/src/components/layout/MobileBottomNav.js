import React from "react";
import { Menu } from "lucide-react";
import { MOBILE_NAV_REGISTRY } from "../../config/mobileNavConfig";

const isRouteActive = (activeRoute, path) => {
  if (path === "/home") return activeRoute === "/home";
  if (path === "/dashboard") return activeRoute === "/dashboard";
  return activeRoute.startsWith(path);
};

const MobileBottomNav = ({ activeRoute, appMode, onNavigate, onOpenMore, mobileNavFavorites }) => {
  const registry  = MOBILE_NAV_REGISTRY[appMode] || MOBILE_NAV_REGISTRY.home;
  const fixedItem = registry.find((i) => i.slot === "fixed-root");
  const favKeys   = mobileNavFavorites?.[appMode] ?? [];
  const favItems  = favKeys.map((k) => registry.find((i) => i.key === k)).filter(Boolean);
  const items     = [fixedItem, ...favItems, { label: "Mehr", action: "more", icon: Menu }].filter(Boolean);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-[90]
                 border-t border-light-border dark:border-dark-border
                 bg-light-card-bg/95 dark:bg-canvas-2/95 backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
      aria-label="Mobile Navigation"
    >
      <div className="h-16 px-2 grid grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.path ? isRouteActive(activeRoute, item.path) : false;
          const baseClass =
            "flex flex-col items-center justify-center rounded-card-sm text-[11px] font-medium transition-colors";

          return item.action === "more" ? (
            <button
              key="mehr"
              onClick={onOpenMore}
              className={`${baseClass} text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main`}
            >
              <Icon size={18} />
              <span className="mt-0.5">{item.label}</span>
            </button>
          ) : (
            <button
              key={item.key}
              onClick={() => onNavigate(item.path)}
              className={`${baseClass} ${
                active
                  ? "text-primary-500 bg-primary-500/10"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              <Icon size={18} />
              <span className="mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
