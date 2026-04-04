import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const TOUR_PAGE_KEYS = [
  "dashboard", "budget", "inventar", "vorraete", "geraete",
  "bewohner", "einkaufliste", "aufgaben", "projekte", "suche", "dokumente",
];

const DEFAULT_TOUR_STATE = {
  version: 1,
  intro_prompt_status: "pending",
  intro_opt_in: null,
  auto_tours_enabled: false,
  completed_pages: {},
};

const TourContext = createContext(null);

export function TourProvider({ children, session }) {
  const userId = session?.user?.id;
  const [tourState, setTourState] = useState(null);
  const [geladen,   setGeladen]   = useState(false);

  // Logout-Fall: tourState und geladen zurücksetzen wenn kein User mehr
  useEffect(() => {
    if (!userId) {
      setTourState(null);
      setGeladen(false);
    }
  }, [userId]);

  // Lädt tour_state aus DB; migriert localStorage falls noch kein DB-Eintrag vorhanden
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_profile")
      .select("tour_state")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // DB-Fehler: geladen auf true setzen, tourState null lassen → Tour startet nicht
          console.warn("[TourContext] tour_state konnte nicht geladen werden:", error.message);
          setGeladen(true);
          return;
        }
        if (data?.tour_state) {
          setTourState(data.tour_state);
        } else {
          // Migration: localStorage prüfen
          const completedPages = {};
          let hatAlteDaten = false;
          TOUR_PAGE_KEYS.forEach((k) => {
            if (localStorage.getItem(`tour_done_home_${k}`)) {
              completedPages[k] = true;
              hatAlteDaten = true;
            }
          });
          // Konservativ: Alt-User bekommen auto_tours_enabled: false (Alt-Keys entstanden durch
          // Weggeklicken, nicht durch bewusstes Opt-In → kein erneutes Nerven)
          const initialState = hatAlteDaten
            ? {
                ...DEFAULT_TOUR_STATE,
                intro_prompt_status: "answered",
                intro_opt_in: false,
                auto_tours_enabled: false,
                completed_pages: completedPages,
              }
            : { ...DEFAULT_TOUR_STATE };
          setTourState(initialState);
          // upsert statt update: falls kein user_profile-Datensatz existiert, wird er erstellt
          supabase
            .from("user_profile")
            .upsert({ id: userId, tour_state: initialState }, { onConflict: "id" })
            .then(({ error }) => {
              if (error) console.warn("[TourContext] Initialer upsert fehlgeschlagen:", error.message);
            });
        }
        setGeladen(true);
      });
  }, [userId]);

  // Race-sichere persist-Funktion: arbeitet mit funktionalem Update
  const persist = useCallback(
    (updaterFn) => {
      setTourState((prev) => {
        if (!prev) return prev;
        const next = typeof updaterFn === "function" ? updaterFn(prev) : updaterFn;
        if (userId) {
          supabase
            .from("user_profile")
            .update({ tour_state: next })
            .eq("id", userId)
            .then(({ error }) => {
              if (error) console.warn("[TourContext] persist fehlgeschlagen:", error.message);
            });
        }
        return next;
      });
    },
    [userId]
  );

  const setIntroAnswer = useCallback(
    (jaOderNein) => {
      persist((prev) => ({
        ...prev,
        intro_prompt_status: "answered",
        intro_opt_in: jaOderNein,
        auto_tours_enabled: jaOderNein,
      }));
    },
    [persist]
  );

  const markPageDone = useCallback(
    (pageKey) => {
      persist((prev) => ({
        ...prev,
        completed_pages: { ...prev.completed_pages, [pageKey]: true },
      }));
      localStorage.setItem(`tour_done_home_${pageKey}`, "1"); // lokaler Cache
    },
    [persist]
  );

  // Einzelne Seiten-Tour zurücksetzen (z.B. für "Dashboard-Tour neu starten")
  const resetPageTour = useCallback(
    (pageKey) => {
      persist((prev) => ({
        ...prev,
        completed_pages: { ...prev.completed_pages, [pageKey]: false },
      }));
      localStorage.removeItem(`tour_done_home_${pageKey}`);
    },
    [persist]
  );

  // Alle Modul-Touren zurücksetzen — nur completed_pages, auto_tours_enabled UNVERÄNDERT
  const resetAllTours = useCallback(() => {
    persist((prev) => ({ ...prev, completed_pages: {} }));
    TOUR_PAGE_KEYS.forEach((k) => localStorage.removeItem(`tour_done_home_${k}`));
  }, [persist]);

  const setAutoTours = useCallback(
    (aktiv) => {
      persist((prev) => ({ ...prev, auto_tours_enabled: aktiv }));
    },
    [persist]
  );

  return (
    <TourContext.Provider
      value={{
        tourState,
        geladen,
        setIntroAnswer,
        markPageDone,
        resetPageTour,
        resetAllTours,
        setAutoTours,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTourContext() {
  return useContext(TourContext);
}
