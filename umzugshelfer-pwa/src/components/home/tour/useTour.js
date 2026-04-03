import { useState } from "react";
import { useTourContext } from "../../../contexts/TourContext";

const TOUR_PAGE_KEYS = [
  "dashboard", "budget", "inventar", "vorraete",
  "geraete", "bewohner", "einkaufliste", "aufgaben",
  "projekte", "suche", "dokumente",
];

/**
 * Hook zum Verwalten der interaktiven Tour für eine bestimmte Seite.
 * Liest den Status aus TourContext (persistent in user_profile.tour_state).
 *
 * API identisch zu v1: useTour(pageKey) → { active, schritt, setSchritt, beenden, neustarten }
 *
 * @param {string} pageKey - Eindeutiger Schlüssel der Seite (z.B. "budget")
 */
export function useTour(pageKey) {
  const ctx = useTourContext();
  const [schritt, setSchritt] = useState(0);

  const tourState = ctx?.tourState;
  const geladen   = ctx?.geladen ?? false;

  // Aktiv nur wenn: Context geladen + User zugestimmt + Auto-Touren an + Seite noch nicht fertig
  const active = !!(
    geladen &&
    tourState &&
    tourState.intro_opt_in === true &&
    tourState.auto_tours_enabled === true &&
    tourState.completed_pages?.[pageKey] !== true
  );

  const beenden = () => {
    if (ctx) ctx.markPageDone(pageKey);
  };

  const neustarten = () => {
    if (ctx) {
      ctx.resetPageTour(pageKey);
      setSchritt(0);
    }
  };

  return { active, schritt, setSchritt, beenden, neustarten };
}

/**
 * Setzt alle Tour-Flags im localStorage zurück (Legacy-Kompatibilität).
 * Neue UI nutzt TourContext.resetAllTours() direkt.
 */
export function alleToursZuruecksetzen() {
  TOUR_PAGE_KEYS.forEach((k) => localStorage.removeItem(`tour_done_home_${k}`));
}
