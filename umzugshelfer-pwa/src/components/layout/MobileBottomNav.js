import React from "react";
import {
  Home,
  CheckSquare,
  Package,
  DollarSign,
  LayoutDashboard,
  ListChecks,
  Archive,
  Menu,
} from "lucide-react";

const isRouteActive = (activeRoute, path) => {
  if (path === "/home") return activeRoute === "/home";
  if (path === "/dashboard") return activeRoute === "/dashboard";
  return activeRoute.startsWith(path);
};

const MobileBottomNav = ({ activeRoute, appMode, onNavigate, onOpenMore }) => {
  const items =
    appMode === "home"
      ? [
          { label: "Home", path: "/home", icon: Home },
          { label: "Aufgaben", path: "/home/aufgaben", icon: CheckSquare },
          { label: "Inventar", path: "/home/inventar", icon: Package },
          { label: "Budget", path: "/home/budget", icon: DollarSign },
          { label: "Mehr", action: "more", icon: Menu },
        ]
      : [
          { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
          { label: "To-Dos", path: "/todos", icon: ListChecks },
          { label: "Packliste", path: "/packliste", icon: Archive },
          { label: "Budget", path: "/budget", icon: DollarSign },
          { label: "Mehr", action: "more", icon: Menu },
        ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40
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
              key={item.label}
              onClick={onOpenMore}
              className={`${baseClass} text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main`}
            >
              <Icon size={18} />
              <span className="mt-0.5">{item.label}</span>
            </button>
          ) : (
            <button
              key={item.path}
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
