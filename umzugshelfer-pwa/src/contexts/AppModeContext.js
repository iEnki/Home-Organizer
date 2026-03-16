import React, { createContext, useState, useEffect, useContext } from "react";

const AppModeContext = createContext();

export const useAppMode = () => useContext(AppModeContext);

export const AppModeProvider = ({ children }) => {
  // App-Modus: "umzug" (Standard) oder "home" (Home Organizer)
  const [appMode, setAppMode] = useState(() => {
    const stored = localStorage.getItem("appMode");
    return stored === "home" ? "home" : "umzug";
  });

  // Merkt ob der Umzug bereits abgeschlossen wurde (verhindert erneutes Anzeigen des Banners)
  const [umzugAbgeschlossen, setUmzugAbgeschlossen] = useState(() => {
    return localStorage.getItem("umzugAbgeschlossen") === "true";
  });

  // Merkt ob das Onboarding-Modal bereits gezeigt wurde
  const [onboardingGezeigt, setOnboardingGezeigt] = useState(() => {
    return localStorage.getItem("onboardingGezeigt") === "true";
  });

  // Wird true sobald der App-Modus aus Supabase geladen wurde (verhindert Race Condition mit OnboardingGate)
  const [modusGeladen, setModusGeladen] = useState(false);

  // Umzugsplaner dauerhaft deaktiviert (User hat Umzug abgeschlossen)
  const [umzugDeaktiviert, setUmzugDeaktiviert] = useState(() => {
    return localStorage.getItem("umzugDeaktiviert") === "true";
  });

  useEffect(() => {
    localStorage.setItem("appMode", appMode);
  }, [appMode]);

  useEffect(() => {
    localStorage.setItem("umzugAbgeschlossen", umzugAbgeschlossen);
  }, [umzugAbgeschlossen]);

  useEffect(() => {
    localStorage.setItem("onboardingGezeigt", onboardingGezeigt);
  }, [onboardingGezeigt]);

  useEffect(() => {
    localStorage.setItem("umzugDeaktiviert", umzugDeaktiviert);
  }, [umzugDeaktiviert]);

  const switchToHome = () => setAppMode("home");

  // switchToUmzug ist gesperrt wenn der Umzugsplaner dauerhaft deaktiviert wurde
  const switchToUmzug = () => {
    if (umzugDeaktiviert) return;
    setAppMode("umzug");
  };

  const toggleMode = () => {
    if (umzugDeaktiviert) return;
    setAppMode((prev) => (prev === "umzug" ? "home" : "umzug"));
  };

  const markUmzugAbgeschlossen = () => setUmzugAbgeschlossen(true);
  const markOnboardingGezeigt = () => setOnboardingGezeigt(true);

  // Umzugsplaner dauerhaft deaktivieren (Umzug abgeschlossen)
  const deaktiviereUmzug = () => {
    setUmzugDeaktiviert(true);
    setAppMode("home");
  };

  // Umzugsplaner wieder aktivieren (z.B. erneuter Umzug)
  const aktiviereUmzug = () => {
    setUmzugDeaktiviert(false);
  };

  return (
    <AppModeContext.Provider
      value={{
        appMode,
        isHomeMode: appMode === "home",
        isUmzugMode: appMode === "umzug",
        switchToHome,
        switchToUmzug,
        toggleMode,
        umzugAbgeschlossen,
        markUmzugAbgeschlossen,
        onboardingGezeigt,
        markOnboardingGezeigt,
        modusGeladen,
        setModusGeladen,
        umzugDeaktiviert,
        deaktiviereUmzug,
        aktiviereUmzug,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
};
