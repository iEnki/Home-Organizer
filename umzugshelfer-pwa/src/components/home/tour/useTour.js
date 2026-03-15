import { useState } from "react";

const TOUR_PAGE_KEYS = [
  "dashboard", "budget", "inventar", "vorraete",
  "geraete", "bewohner", "einkaufliste", "aufgaben",
  "projekte", "suche",
];

/**
 * Hook zum Verwalten der interaktiven Tour für eine bestimmte Seite.
 * Speichert den "gesehen"-Status im localStorage.
 *
 * @param {string} pageKey - Eindeutiger Schlüssel der Seite (z.B. "budget")
 */
export function useTour(pageKey) {
  const storageKey = `tour_done_home_${pageKey}`;
  const [active, setActive] = useState(() => !localStorage.getItem(storageKey));
  const [schritt, setSchritt] = useState(0);

  const beenden = () => {
    localStorage.setItem(storageKey, "1");
    setActive(false);
  };

  const neustarten = () => {
    localStorage.removeItem(storageKey);
    setSchritt(0);
    setActive(true);
  };

  return { active, schritt, setSchritt, beenden, neustarten };
}

/**
 * Setzt alle Tour-Flags im localStorage zurück.
 * Beim nächsten Besuch jedes Bereichs erscheint die Tour wieder.
 */
export function alleToursZuruecksetzen() {
  TOUR_PAGE_KEYS.forEach((k) => localStorage.removeItem(`tour_done_home_${k}`));
}
