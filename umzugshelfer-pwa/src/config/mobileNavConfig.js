import {
  Home, CheckSquare, Package, DollarSign, ShoppingCart, Wrench,
  Users, FolderOpen, Search, BookOpen, History, ScanLine, FileText,
  LayoutDashboard, ListChecks, Archive, Paintbrush, Calculator,
  CalendarClock, CalendarDays, UserCircle2, Menu,
} from "lucide-react";

export { Menu };

export const MOBILE_NAV_FAVORITE_COUNT = 3;

export const MOBILE_NAV_REGISTRY = {
  home: [
    { key: "home-root",      slot: "fixed-root", label: "Home",       path: "/home",                  icon: Home,          favoriteEligible: false },
    { key: "aufgaben",                            label: "Aufgaben",   path: "/home/aufgaben",         icon: CheckSquare,   favoriteEligible: true  },
    { key: "inventar",                            label: "Inventar",   path: "/home/inventar",         icon: Package,       favoriteEligible: true  },
    { key: "budget",                              label: "Budget",     path: "/home/budget",           icon: DollarSign,    favoriteEligible: true  },
    { key: "vorraete",                            label: "Vorräte",    path: "/home/vorraete",         icon: ShoppingCart,  favoriteEligible: true  },
    { key: "einkauf",                             label: "Einkauf",    path: "/home/einkaufliste",     icon: ShoppingCart,  favoriteEligible: true  },
    { key: "geraete",                             label: "Geräte",     path: "/home/geraete",          icon: Wrench,        favoriteEligible: true  },
    { key: "dokumente",                           label: "Dokumente",  path: "/home/dokumente",        icon: FileText,      favoriteEligible: true  },
    { key: "projekte",                            label: "Projekte",   path: "/home/projekte",         icon: FolderOpen,    favoriteEligible: true  },
    { key: "rechnung",                            label: "Rechnung",   path: "/home/rechnung-scannen", icon: ScanLine,      favoriteEligible: true  },
    { key: "bewohner",                            label: "Bewohner",   path: "/home/bewohner",         icon: Users,         favoriteEligible: true  },
    { key: "suche",                               label: "Suche",      path: "/home/suche",            icon: Search,        favoriteEligible: true  },
    { key: "wissen",                              label: "Wissen",     path: "/home/wissen",           icon: BookOpen,      favoriteEligible: true  },
    { key: "verlauf",                             label: "Verlauf",    path: "/home/verlauf",          icon: History,       favoriteEligible: true  },
    { key: "kalender",                            label: "Kalender",   path: "/kalender",              icon: CalendarDays,  favoriteEligible: true  },
    { key: "profil",                              label: "Profil",     path: "/profil",                icon: UserCircle2,   favoriteEligible: true  },
  ],
  umzug: [
    { key: "dashboard-root", slot: "fixed-root", label: "Dashboard",  path: "/dashboard",             icon: LayoutDashboard, favoriteEligible: false },
    { key: "todos",                               label: "To-Dos",     path: "/todos",                 icon: ListChecks,    favoriteEligible: true  },
    { key: "packliste",                           label: "Packliste",  path: "/packliste",             icon: Archive,       favoriteEligible: true  },
    { key: "budget",                              label: "Budget",     path: "/budget",                icon: DollarSign,    favoriteEligible: true  },
    { key: "kontakte",                            label: "Kontakte",   path: "/kontakte",              icon: Users,         favoriteEligible: true  },
    { key: "materialplaner",                      label: "Materialplaner", path: "/materialplaner",    icon: Paintbrush,    favoriteEligible: true  },
    { key: "bedarfsrechner",                      label: "Bedarfsrechner", path: "/bedarfsrechner",    icon: Calculator,    favoriteEligible: true  },
    { key: "zeitstrahl",                          label: "Zeitstrahl", path: "/zeitstrahl",            icon: CalendarClock, favoriteEligible: true  },
    { key: "dokumente",                           label: "Dokumente",  path: "/dokumente",             icon: FolderOpen,    favoriteEligible: true  },
    { key: "kalender",                            label: "Kalender",   path: "/kalender",              icon: CalendarDays,  favoriteEligible: true  },
    { key: "profil",                              label: "Profil",     path: "/profil",                icon: UserCircle2,   favoriteEligible: true  },
  ],
};

// DB-Default (Keys, nicht Pfade)
export const DEFAULT_MOBILE_FAVORITES = {
  home:  ["aufgaben", "inventar", "budget"],
  umzug: ["todos", "packliste", "budget"],
};

// Validiert + bereinigt gespeicherte Keys; füllt fehlende Slots mit Defaults auf.
// Design-Entscheidung: Slots 2–4 sind IMMER belegt (immer genau 3 Favoriten).
// "Ersetzen" schafft nur Platz für ein anderes Modul — kein dauerhaftes Leerlassen.
export function sanitizeMobileNavFavorites(raw) {
  const out = {};
  for (const mode of ["home", "umzug"]) {
    const eligible = new Set(
      MOBILE_NAV_REGISTRY[mode].filter((i) => i.favoriteEligible).map((i) => i.key)
    );
    const cleaned = [...new Set(Array.isArray(raw?.[mode]) ? raw[mode] : [])]
      .filter((k) => eligible.has(k))
      .slice(0, MOBILE_NAV_FAVORITE_COUNT);
    const fallback = DEFAULT_MOBILE_FAVORITES[mode].filter((k) => !cleaned.includes(k));
    out[mode] = [...cleaned, ...fallback].slice(0, MOBILE_NAV_FAVORITE_COUNT);
  }
  return out;
}
