import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SUPPLIES_IMAGE = `vorr${String.fromCharCode(228)}te`;

const DARK_MAP = {
  "/home":              "HomeDashboard_dark",
  "/home/budget":       "Budget_dark",
  "/home/aufgaben":     "Aufgaben_dark",
  "/home/einkaufliste": "Einkaufsliste_dark",
  "/home/kfz":          "KFZ_dark",
  "/home/dokumente":    "Dokumentearchiv_dark",
  "/home/geraete":      "GeraeteWartung_dark",
  "/home/heimapotheke": "Heimapotheke_dark",
  "/home/wissen":       "Wissensdatenbank_dark",
  "/home/kochbuch":     "kochbuch_dark",
  "/home/inventar":     "inventar_dark",
  "/home/vorraete":     `${SUPPLIES_IMAGE}_dark`,
  "/home/suche":        "suche_dark",
  "/home/projekte":     "Projekte_dark",
  "/home/verlauf":      "Verlauf_dark",
  "/kalender":          "Kalender_dark",
};

const DAY_MAP = {
  "/home":              "HomeDashboard_day",
  "/home/budget":       "Budget_day",
  "/home/aufgaben":     "Aufgaben_day",
  "/home/einkaufliste": "Einkaufsliste_day",
  "/home/kfz":          "KFZ_day",
  "/home/dokumente":    "Dokumentearchiv_day",
  "/home/geraete":      "GeraeteWartung_day",
  "/home/heimapotheke": "Heimapotheke_day",
  "/home/wissen":       "Wissensdatenbank_day",
  "/home/kochbuch":     "kochbuch_day",
  "/home/inventar":     "inventar_day",
  "/home/vorraete":     `${SUPPLIES_IMAGE}_day`,
  "/home/suche":        "suche_day",
  "/home/verlauf":      "Verlauf_day",
  "/kalender":          "Kalender_day",
  // Projekte hat kein _day-Bild → nicht im Map → CSS-Fallback (Heller_Modus.png)
};

export function usePageBackground(isDark, isDesktop) {
  const location = useLocation();

  useEffect(() => {
    const el = document.documentElement;

    const map = isDark ? DARK_MAP : DAY_MAP;
    // Desktop nutzt die Basisnamen, Mobil die _mobile-Varianten (Tag + Nacht).
    const suffix = isDesktop ? "" : "_mobile";

    const key = Object.keys(map)
      .filter((p) => location.pathname === p || location.pathname.startsWith(p + "/"))
      .sort((a, b) => b.length - a.length)[0];

    let filename = key ? map[key] : null;

    // Kochbuch-Tabs: Mahlzeitenplaner bekommt eigenes Bild
    if (key === "/home/kochbuch") {
      const tab = new URLSearchParams(location.search).get("tab");
      if (tab === "planner") filename = isDark ? "Essenplan_dark" : "Essenplan_day";
    }

    if (filename) {
      el.style.setProperty("--app-background-image", `url('/Background/${filename}${suffix}.png')`);
    } else {
      el.style.removeProperty("--app-background-image");
    }

    return () => { el.style.removeProperty("--app-background-image"); };
  }, [location.pathname, location.search, isDark, isDesktop]);
}
