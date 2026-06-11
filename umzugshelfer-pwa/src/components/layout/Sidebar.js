import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Users, DollarSign, ListChecks, Archive,
  Paintbrush, Calculator, CalendarClock, FolderOpen,
  Package, ShoppingCart, Wrench, CheckSquare, ShoppingBag,
  Search, BookOpen, History, FileText, ChefHat, Pill,
  Menu, X, CalendarDays, ScanLine, Car,
} from "lucide-react";

const COLLAPSED_W = 52;
const EXPANDED_W  = 220;

// ── Nav-Gruppen Umzugsmodus ──────────────────────────────────────────────────
const umzugGruppen = [
  {
    label: null,
    items: [{ name: "Dashboard", path: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Planung",
    items: [
      { name: "Kontakte",  path: "/kontakte",  icon: Users },
      { name: "Budget",    path: "/budget",    icon: DollarSign },
      { name: "To-Dos",    path: "/todos",     icon: ListChecks },
      { name: "Packliste", path: "/packliste", icon: Archive },
    ],
  },
  {
    label: "Werkzeuge",
    items: [
      { name: "Materialplaner", path: "/materialplaner", icon: Paintbrush },
      { name: "Rechner",        path: "/bedarfsrechner", icon: Calculator },
      { name: "Zeitstrahl",     path: "/zeitstrahl",     icon: CalendarClock },
      { name: "Dokumente",      path: "/dokumente",      icon: FolderOpen },
      { name: "Kalender",       path: "/kalender",       icon: CalendarDays },
    ],
  },
];

// ── Nav-Gruppen Home Organizer ───────────────────────────────────────────────
const homeGruppen = [
  {
    label: null,
    items: [{ name: "Home", path: "/home", icon: LayoutDashboard }],
  },
  {
    label: "Haushalt",
    items: [
      { name: "Inventar", path: "/home/inventar",    icon: Package },
      { name: "Heimapotheke", path: "/home/heimapotheke", icon: Pill },
      { name: "Vorräte",  path: "/home/vorraete",    icon: ShoppingCart },
      { name: "Geräte",   path: "/home/geraete",     icon: Wrench },
      { name: "Kfz",      path: "/home/kfz",         icon: Car },
      { name: "Einkauf",  path: "/home/einkaufliste", icon: ShoppingBag },
    ],
  },
  {
    label: "Organisation",
    items: [
      { name: "Aufgaben", path: "/home/aufgaben",  icon: CheckSquare },
      { name: "Projekte", path: "/home/projekte",  icon: FolderOpen },
      { name: "Kalender", path: "/kalender",       icon: CalendarDays },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { name: "Budget",    path: "/home/budget",           icon: DollarSign },
      { name: "Rechnung",  path: "/home/rechnung-scannen", icon: ScanLine },
      { name: "Dokumente", path: "/home/dokumente",        icon: FileText },
    ],
  },
  {
    label: "Wissen",
    items: [
      { name: "Kochbuch", path: "/home/kochbuch", icon: ChefHat },
      { name: "Wissen",   path: "/home/wissen",   icon: BookOpen },
      { name: "Suche",    path: "/home/suche",    icon: Search },
      { name: "Verlauf",  path: "/home/verlauf",  icon: History },
    ],
  },
];

const NAV_LABEL_KEYS_BY_PATH = {
  "/dashboard":             "nav:items.dashboard",
  "/kontakte":              "nav:items.contacts",
  "/budget":                "nav:items.budget",
  "/todos":                 "nav:items.todos",
  "/packliste":             "nav:items.packingList",
  "/materialplaner":        "nav:items.materials",
  "/bedarfsrechner":        "nav:items.calculator",
  "/zeitstrahl":            "nav:items.timeline",
  "/dokumente":             "nav:items.documents",
  "/kalender":              "nav:items.calendar",
  "/home":                  "nav:items.home",
  "/home/inventar":         "nav:items.inventory",
  "/home/vorraete":         "nav:items.stock",
  "/home/heimapotheke":     "nav:items.medicineCabinet",
  "/home/geraete":          "nav:items.devices",
  "/home/kfz":              "nav:items.vehicles",
  "/home/einkaufliste":     "nav:items.shopping",
  "/home/aufgaben":         "nav:items.tasks",
  "/home/projekte":         "nav:items.projects",
  "/home/budget":           "nav:items.budget",
  "/home/rechnung-scannen": "nav:items.scanInvoice",
  "/home/dokumente":        "nav:items.documents",
  "/home/kochbuch":         "nav:items.cookbook",
  "/home/wissen":           "nav:items.knowledge",
  "/home/suche":            "nav:items.search",
  "/home/verlauf":          "nav:items.history",
};

// ── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = ({ activeRoute, onNavigate, appMode, mobileNavigationEnabled = false }) => {
  const { t } = useTranslation(["nav", "common"]);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const gruppen = appMode === "home" ? homeGruppen : umzugGruppen;

  const isActive = (path) => {
    if (path === "/home")      return activeRoute === "/home";
    if (path === "/dashboard") return activeRoute === "/dashboard";
    return activeRoute.startsWith(path);
  };

  const handleNavigate = (path) => {
    onNavigate(path);
    setMobileOpen(false);
  };

  // ── Desktop NavList ────────────────────────────────────────────────────────
  const DesktopNavList = () => (
    <div className="flex flex-col h-full py-3 overflow-y-auto overflow-x-hidden scrollbar-thin">
      {gruppen.map((gruppe, gi) => (
        <React.Fragment key={gi}>
          {gruppe.label && (
            <div className="px-2 mt-3 mb-1">
              <div className="h-px bg-light-border dark:bg-dark-border/60" />
              {!isCollapsed && (
                <p className="mt-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest
                              text-light-text-secondary/50 dark:text-dark-text-secondary/50 whitespace-nowrap">
                  {gruppe.label}
                </p>
              )}
            </div>
          )}

          <div className="px-2 space-y-0.5 mt-0.5">
            {gruppe.items.map((item) => {
              const Icon     = item.icon;
              const active   = isActive(item.path);
              const labelKey = NAV_LABEL_KEYS_BY_PATH[item.path];
              const label    = labelKey ? t(labelKey, { defaultValue: item.name }) : item.name;
              return (
                <button
                  key={item.path}
                  title={label}
                  onClick={() => handleNavigate(item.path)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-sidebar-tile
                              transition-colors duration-150 overflow-hidden
                              ${active
                                ? "bg-primary-500/10 border border-primary-500/30 text-primary-600 dark:text-primary-400 shadow-sidebar-active"
                                : "border border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 hover:text-light-text-main dark:hover:text-dark-text-main"
                              }`}
                >
                  <Icon size={17} className="shrink-0" />
                  <span
                    className={`text-sm font-medium whitespace-nowrap leading-none
                                transition-opacity duration-150
                                ${isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      <div className="flex-1 min-h-4" />
    </div>
  );

  // ── Mobile NavList (immer expanded) ───────────────────────────────────────
  const MobileNavList = () => (
    <div className="flex flex-col h-full py-4 overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="h-14 shrink-0" />
      {gruppen.map((gruppe, gi) => (
        <React.Fragment key={gi}>
          {gruppe.label && (
            <div className="px-3 mt-4 mb-1">
              <div className="h-px bg-light-border dark:bg-dark-border/60 mb-2" />
              <p className="px-1 text-[10px] font-semibold uppercase tracking-widest
                            text-light-text-secondary/50 dark:text-dark-text-secondary/50">
                {gruppe.label}
              </p>
            </div>
          )}

          <div className="px-2 space-y-0.5 mt-0.5">
            {gruppe.items.map((item) => {
              const Icon     = item.icon;
              const active   = isActive(item.path);
              const labelKey = NAV_LABEL_KEYS_BY_PATH[item.path];
              const label    = labelKey ? t(labelKey, { defaultValue: item.name }) : item.name;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-sidebar-tile
                              transition-colors duration-150
                              ${active
                                ? "bg-primary-500/10 border border-primary-500/30 text-primary-600 dark:text-primary-400"
                                : "border border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                              }`}
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="text-sm font-medium whitespace-nowrap leading-none">{label}</span>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      <div className="flex-1 min-h-4" />
    </div>
  );

  return (
    <>
      {/* ── Desktop Hover-Expand Sidebar ─────────────────────────────────── */}
      <aside
        data-tour="tour-sidebar"
        style={{ width: isCollapsed ? COLLAPSED_W : EXPANDED_W }}
        className="hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col
                   bg-light-card dark:bg-canvas-1
                   border-r border-light-border dark:border-dark-border
                   overflow-hidden transition-[width] duration-200 ease-out"
        onMouseEnter={() => setIsCollapsed(false)}
        onMouseLeave={() => setIsCollapsed(true)}
      >
        <DesktopNavList />
      </aside>

      {!mobileNavigationEnabled && (
        <>
          {/* ── Mobile Hamburger ──────────────────────────────────────────── */}
          <button
            className="fixed top-4 left-4 z-[60] lg:hidden w-10 h-10 rounded-sidebar-tile
                       bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border
                       text-light-text-secondary dark:text-dark-text-secondary
                       flex items-center justify-center shadow-elevation-1
                       hover:bg-light-hover dark:hover:bg-canvas-3 transition-all duration-150"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t("common:actions.toggleMenu")}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* ── Mobile Overlay ────────────────────────────────────────────── */}
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/20 dark:bg-canvas-0/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* ── Mobile Drawer (220px, immer expanded) ─────────────────────── */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex-col
                        bg-light-card dark:bg-canvas-1
                        border-r border-light-border dark:border-dark-border
                        transition-transform duration-[250ms] ease-in-out
                        lg:hidden w-[220px]
                        ${mobileOpen ? "flex translate-x-0" : "flex -translate-x-full"}`}
          >
            <MobileNavList />
          </aside>
        </>
      )}
    </>
  );
};

export default Sidebar;
