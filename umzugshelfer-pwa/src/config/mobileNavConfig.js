import {
  Home, CheckSquare, Package, DollarSign, ShoppingCart, Wrench,
  Users, FolderOpen, Search, BookOpen, History, ScanLine, FileText,
  LayoutDashboard, ListChecks, Archive, Paintbrush, Calculator,
  CalendarClock, CalendarDays, UserCircle2, Menu, ChefHat,
} from "lucide-react";

export { Menu };

export const MOBILE_NAV_FAVORITE_COUNT = 3;

export const MOBILE_NAV_REGISTRY = {
  home: [
    { key: "home-root", slot: "fixed-root", labelKey: "nav:items.home", label: "Home", path: "/home", icon: Home, favoriteEligible: false },
    { key: "aufgaben", labelKey: "nav:items.tasks", label: "Aufgaben", path: "/home/aufgaben", icon: CheckSquare, favoriteEligible: true },
    { key: "inventar", labelKey: "nav:items.inventory", label: "Inventar", path: "/home/inventar", icon: Package, favoriteEligible: true },
    { key: "budget", labelKey: "nav:items.budget", label: "Budget", path: "/home/budget", icon: DollarSign, favoriteEligible: true },
    { key: "vorraete", labelKey: "nav:items.stock", label: "Vorraete", path: "/home/vorraete", icon: ShoppingCart, favoriteEligible: true },
    { key: "einkauf", labelKey: "nav:items.shopping", label: "Einkauf", path: "/home/einkaufliste", icon: ShoppingCart, favoriteEligible: true },
    { key: "geraete", labelKey: "nav:items.devices", label: "Geraete", path: "/home/geraete", icon: Wrench, favoriteEligible: true },
    { key: "dokumente", labelKey: "nav:items.documents", label: "Dokumente", path: "/home/dokumente", icon: FileText, favoriteEligible: true },
    { key: "projekte", labelKey: "nav:items.projects", label: "Projekte", path: "/home/projekte", icon: FolderOpen, favoriteEligible: true },
    { key: "rechnung", labelKey: "nav:items.scanInvoice", label: "Rechnung", path: "/home/rechnung-scannen", icon: ScanLine, favoriteEligible: true },
    { key: "bewohner", labelKey: "nav:items.residents", label: "Bewohner", path: "/home/bewohner", icon: Users, favoriteEligible: true },
    { key: "suche", labelKey: "nav:items.search", label: "Suche", path: "/home/suche", icon: Search, favoriteEligible: true },
    { key: "wissen", labelKey: "nav:items.knowledge", label: "Wissen", path: "/home/wissen", icon: BookOpen, favoriteEligible: true },
    { key: "kochbuch", labelKey: "nav:items.cookbook", label: "Kochbuch", path: "/home/kochbuch", icon: ChefHat, favoriteEligible: true },
    { key: "verlauf", labelKey: "nav:items.history", label: "Verlauf", path: "/home/verlauf", icon: History, favoriteEligible: true },
    { key: "kalender", labelKey: "nav:items.calendar", label: "Kalender", path: "/kalender", icon: CalendarDays, favoriteEligible: true },
    { key: "profil", labelKey: "nav:items.profile", label: "Profil", path: "/profil", icon: UserCircle2, favoriteEligible: true },
  ],
  umzug: [
    { key: "dashboard-root", slot: "fixed-root", labelKey: "nav:items.dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, favoriteEligible: false },
    { key: "todos", labelKey: "nav:items.todos", label: "To-Dos", path: "/todos", icon: ListChecks, favoriteEligible: true },
    { key: "packliste", labelKey: "nav:items.packingList", label: "Packliste", path: "/packliste", icon: Archive, favoriteEligible: true },
    { key: "budget", labelKey: "nav:items.budget", label: "Budget", path: "/budget", icon: DollarSign, favoriteEligible: true },
    { key: "kontakte", labelKey: "nav:items.contacts", label: "Kontakte", path: "/kontakte", icon: Users, favoriteEligible: true },
    { key: "materialplaner", labelKey: "nav:items.materials", label: "Materialplaner", path: "/materialplaner", icon: Paintbrush, favoriteEligible: true },
    { key: "bedarfsrechner", labelKey: "nav:items.calculator", label: "Bedarfsrechner", path: "/bedarfsrechner", icon: Calculator, favoriteEligible: true },
    { key: "zeitstrahl", labelKey: "nav:items.timeline", label: "Zeitstrahl", path: "/zeitstrahl", icon: CalendarClock, favoriteEligible: true },
    { key: "dokumente", labelKey: "nav:items.documents", label: "Dokumente", path: "/dokumente", icon: FolderOpen, favoriteEligible: true },
    { key: "kalender", labelKey: "nav:items.calendar", label: "Kalender", path: "/kalender", icon: CalendarDays, favoriteEligible: true },
    { key: "profil", labelKey: "nav:items.profile", label: "Profil", path: "/profil", icon: UserCircle2, favoriteEligible: true },
  ],
};

export const DEFAULT_MOBILE_FAVORITES = {
  home: ["aufgaben", "inventar", "budget"],
  umzug: ["todos", "packliste", "budget"],
};

export function sanitizeMobileNavFavorites(raw) {
  const out = {};
  for (const mode of ["home", "umzug"]) {
    const eligible = new Set(
      MOBILE_NAV_REGISTRY[mode].filter((i) => i.favoriteEligible).map((i) => i.key),
    );
    const cleaned = [...new Set(Array.isArray(raw?.[mode]) ? raw[mode] : [])]
      .filter((k) => eligible.has(k))
      .slice(0, MOBILE_NAV_FAVORITE_COUNT);
    const fallback = DEFAULT_MOBILE_FAVORITES[mode].filter((k) => !cleaned.includes(k));
    out[mode] = [...cleaned, ...fallback].slice(0, MOBILE_NAV_FAVORITE_COUNT);
  }
  return out;
}
