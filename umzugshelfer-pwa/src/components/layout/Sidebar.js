import React, { useState } from "react";
import {
  LayoutDashboard, Users, DollarSign, ListChecks, Archive,
  Paintbrush, Calculator, CalendarClock, FolderOpen,
  Package, ShoppingCart, Wrench, CheckSquare, ShoppingBag,
  Search, BookOpen, History, FileText,
  Menu, X, CalendarDays, ScanLine,
} from "lucide-react";

// ── Nav-Gruppen Umzugsmodus ─────────────────────────────────────────────────────
const umzugGruppen = [
  {
    label: null,
    items: [{ name: "Dashboard", path: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Planung",
    items: [
      { name: "Kontakte",    path: "/kontakte",  icon: Users },
      { name: "Budget",      path: "/budget",    icon: DollarSign },
      { name: "To-Dos",      path: "/todos",     icon: ListChecks },
      { name: "Packliste",   path: "/packliste", icon: Archive },
    ],
  },
  {
    label: "Werkzeuge",
    items: [
      { name: "Materialplaner",  path: "/materialplaner",  icon: Paintbrush },
      { name: "Bedarfsrechner",  path: "/bedarfsrechner",  icon: Calculator },
      { name: "Zeitstrahl",      path: "/zeitstrahl",      icon: CalendarClock },
      { name: "Dokumente",       path: "/dokumente",       icon: FolderOpen },
      { name: "Kalender",        path: "/kalender",        icon: CalendarDays },
    ],
  },
];

// ── Nav-Gruppen Home Organizer ──────────────────────────────────────────────────
const homeGruppen = [
  {
    label: null,
    items: [{ name: "Home", path: "/home", icon: LayoutDashboard }],
  },
  {
    label: "Haushalt",
    items: [
      { name: "Inventar",        path: "/home/inventar",       icon: Package },
      { name: "Vorräte",         path: "/home/vorraete",       icon: ShoppingCart },
      { name: "Geräte",          path: "/home/geraete",        icon: Wrench },
      { name: "Dokumente",       path: "/home/dokumente",      icon: FileText },
    ],
  },
  {
    label: "Aktionen",
    items: [
      { name: "Einkauf",          path: "/home/einkaufliste",     icon: ShoppingBag },
      { name: "Aufgaben",         path: "/home/aufgaben",         icon: CheckSquare },
      { name: "Projekte",         path: "/home/projekte",         icon: FolderOpen },
      { name: "Rechnung scannen", path: "/home/rechnung-scannen", icon: ScanLine },
    ],
  },
  {
    label: "Mehr",
    items: [
      { name: "Budget",   path: "/home/budget",   icon: DollarSign },
      { name: "Suche",    path: "/home/suche",    icon: Search },
      { name: "Wissen",   path: "/home/wissen",   icon: BookOpen },
      { name: "Verlauf",  path: "/home/verlauf",  icon: History },
      { name: "Kalender", path: "/kalender",      icon: CalendarDays },
    ],
  },
];

// ── Sidebar ─────────────────────────────────────────────────────────────────────
const Sidebar = ({ activeRoute, onNavigate, appMode, onToggleMode, mobileNavigationEnabled = false }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const gruppen  = appMode === "home" ? homeGruppen : umzugGruppen;
  // Eine Route ist aktiv, wenn sie exakt übereinstimmt (für /home, /dashboard)
  // oder der activeRoute mit dem Pfad beginnt (für alle anderen).
  const isActive = (path) => {
    if (path === "/home")      return activeRoute === "/home";
    if (path === "/dashboard") return activeRoute === "/dashboard";
    return activeRoute.startsWith(path);
  };

  const handleNavigate = (path) => {
    onNavigate(path);
    setMobileOpen(false);
  };

  // ── Gemeinsamer Inhalt für Desktop und Mobile ─────────────────────────────────
  const NavContent = ({ mobile = false }) => (
    <div className="flex flex-col items-center h-full py-4 gap-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
      {/* Auf Mobile: Platz für den Hamburger-Button (top-4 = 16px + h-10 = 40px + gap) */}
      {mobile && <div className="h-14 shrink-0" />}
      {/* Nav-Gruppen */}
      {gruppen.map((gruppe, gi) => (
        <React.Fragment key={gi}>
          {gruppe.label && (
            <div className="w-8 h-px bg-dark-border/60 my-1 shrink-0" />
          )}
          {gruppe.items.map((item) => {
            const Icon   = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                title={item.name}
                onClick={() => handleNavigate(item.path)}
                className={`w-16 h-[52px] rounded-sidebar-tile flex flex-col items-center justify-center gap-0.5
                            transition-all duration-200 shrink-0
                            ${active
                              ? "bg-canvas-4 border border-primary-500/30 shadow-sidebar-active text-primary-400"
                              : "border border-transparent text-dark-text-secondary hover:bg-canvas-3 hover:text-dark-text-main"
                            }`}
              >
                <Icon size={17} />
                <span className="text-[9px] font-medium leading-none text-center truncate w-full px-0.5">
                  {item.name}
                </span>
              </button>
            );
          })}
        </React.Fragment>
      ))}

      {/* Spacer */}
      <div className="flex-1 min-h-4" />
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ────────────────────────────────────────────────────── */}
      <aside data-tour="tour-sidebar" className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-20 flex-col
                        bg-canvas-1 border-r border-dark-border">
        <NavContent />
      </aside>

      {!mobileNavigationEnabled && (
        <>
          {/* ── Mobile Hamburger Trigger ───────────────────────────────────────────── */}
          <button
            className="fixed top-4 left-4 z-[60] lg:hidden w-10 h-10 rounded-sidebar-tile
                       bg-canvas-2 border border-dark-border text-dark-text-secondary
                       flex items-center justify-center shadow-elevation-1
                       hover:bg-canvas-3 transition-all duration-150"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menü öffnen/schließen"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* ── Mobile Overlay ────────────────────────────────────────────────────── */}
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-canvas-0/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* ── Mobile Drawer ─────────────────────────────────────────────────────── */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-20 flex-col
                        bg-canvas-1 border-r border-dark-border
                        transition-transform duration-[250ms] ease-in-out
                        lg:hidden
                        ${mobileOpen ? "flex translate-x-0" : "flex -translate-x-full"}`}
          >
            <NavContent mobile />
          </aside>
        </>
      )}
    </>
  );
};

export default Sidebar;
