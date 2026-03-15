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

  useEffect(() => {
    localStorage.setItem("appMode", appMode);
  }, [appMode]);

  useEffect(() => {
    localStorage.setItem("umzugAbgeschlossen", umzugAbgeschlossen);
  }, [umzugAbgeschlossen]);

  useEffect(() => {
    localStorage.setItem("onboardingGezeigt", onboardingGezeigt);
  }, [onboardingGezeigt]);

  const switchToHome = () => setAppMode("home");
  const switchToUmzug = () => setAppMode("umzug");
  const toggleMode = () =>
    setAppMode((prev) => (prev === "umzug" ? "home" : "umzug"));

  const markUmzugAbgeschlossen = () => setUmzugAbgeschlossen(true);
  const markOnboardingGezeigt = () => setOnboardingGezeigt(true);

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
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
};
