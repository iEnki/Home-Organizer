import React, { useEffect } from "react";
import {
  X,
  Home,
  Package,
  ShoppingCart,
  Wrench,
  Users,
  FolderOpen,
  DollarSign,
  Search,
  BookOpen,
  History,
  LayoutDashboard,
  ListChecks,
  Archive,
  Paintbrush,
  Calculator,
  CalendarClock,
  CalendarDays,
  LogOut,
  UserCircle2,
  Repeat,
} from "lucide-react";

const HOME_LINKS = [
  { label: "Home", path: "/home", icon: Home },
  { label: "Inventar", path: "/home/inventar", icon: Package },
  { label: "Vorräte", path: "/home/vorraete", icon: ShoppingCart },
  { label: "Einkauf", path: "/home/einkaufliste", icon: ShoppingCart },
  { label: "Aufgaben", path: "/home/aufgaben", icon: ListChecks },
  { label: "Geräte", path: "/home/geraete", icon: Wrench },
  { label: "Projekte", path: "/home/projekte", icon: FolderOpen },
  { label: "Bewohner", path: "/home/bewohner", icon: Users },
  { label: "Budget", path: "/home/budget", icon: DollarSign },
  { label: "Suche", path: "/home/suche", icon: Search },
  { label: "Wissen", path: "/home/wissen", icon: BookOpen },
  { label: "Verlauf", path: "/home/verlauf", icon: History },
  { label: "Kalender", path: "/kalender", icon: CalendarDays },
  { label: "Profil", path: "/profil", icon: UserCircle2 },
];

const UMZUG_LINKS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Kontakte", path: "/kontakte", icon: Users },
  { label: "Budget", path: "/budget", icon: DollarSign },
  { label: "To-Dos", path: "/todos", icon: ListChecks },
  { label: "Packliste", path: "/packliste", icon: Archive },
  { label: "Materialplaner", path: "/materialplaner", icon: Paintbrush },
  { label: "Bedarfsrechner", path: "/bedarfsrechner", icon: Calculator },
  { label: "Zeitstrahl", path: "/zeitstrahl", icon: CalendarClock },
  { label: "Dokumente", path: "/dokumente", icon: FolderOpen },
  { label: "Kalender", path: "/kalender", icon: CalendarDays },
  { label: "Profil", path: "/profil", icon: UserCircle2 },
];

const MobileMoreSheet = ({
  open,
  appMode,
  activeRoute,
  onClose,
  onNavigate,
  onToggleMode,
  onLogout,
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

  const links = appMode === "home" ? HOME_LINKS : UMZUG_LINKS;
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
          {links.map((item) => {
            const Icon = item.icon;
            const active = item.path === "/home" ? activeRoute === "/home" : activeRoute.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-card-sm border text-left transition-colors ${
                  active
                    ? "border-primary-500/40 bg-primary-500/10 text-primary-500"
                    : "border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                }`}
              >
                <Icon size={16} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="px-4 pt-1 grid grid-cols-1 gap-2">
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

          <button
            onClick={() => {
              onLogout?.();
              onClose();
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-pill bg-accent-danger/15 text-accent-danger border border-accent-danger/30"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Ausloggen</span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default MobileMoreSheet;
