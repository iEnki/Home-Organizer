import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import deCommon from "./locales/de/common.json";
import deNav from "./locales/de/nav.json";
import deMeta from "./locales/de/meta.json";
import dePush from "./locales/de/push.json";
import deAuth from "./locales/de/auth.json";
import deHousehold from "./locales/de/household.json";
import deMove from "./locales/de/move.json";
import deHome from "./locales/de/home.json";
import deBudget from "./locales/de/budget.json";
import deDocuments from "./locales/de/documents.json";
import deBooks from "./locales/de/books.json";
import deAssistant from "./locales/de/assistant.json";
import deTour from "./locales/de/tour.json";
import deFeaturePages from "./locales/de/featurePages.json";
import deProfile from "./locales/de/profile.json";
import enCommon from "./locales/en-GB/common.json";
import enNav from "./locales/en-GB/nav.json";
import enMeta from "./locales/en-GB/meta.json";
import enPush from "./locales/en-GB/push.json";
import enAuth from "./locales/en-GB/auth.json";
import enHousehold from "./locales/en-GB/household.json";
import enMove from "./locales/en-GB/move.json";
import enHome from "./locales/en-GB/home.json";
import enBudget from "./locales/en-GB/budget.json";
import enDocuments from "./locales/en-GB/documents.json";
import enBooks from "./locales/en-GB/books.json";
import enAssistant from "./locales/en-GB/assistant.json";
import enTour from "./locales/en-GB/tour.json";
import enFeaturePages from "./locales/en-GB/featurePages.json";
import enProfile from "./locales/en-GB/profile.json";

export const SUPPORTED_LOCALES = ["de", "en-GB"];
export const DEFAULT_LOCALE = "de";
export const LOCALE_STORAGE_KEY = "ui_locale";

export function normalizeLocale(locale) {
  const raw = String(locale || "").trim();
  if (raw === "en" || raw.toLowerCase() === "en-gb") return "en-GB";
  if (raw.toLowerCase().startsWith("en")) return "en-GB";
  if (raw === "de" || raw.toLowerCase().startsWith("de")) return "de";
  return DEFAULT_LOCALE;
}

export function getStoredLocale() {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

const resources = {
  de: {
    common: deCommon,
    nav: deNav,
    meta: deMeta,
    push: dePush,
    auth: deAuth,
    household: deHousehold,
    move: deMove,
    home: deHome,
    budget: deBudget,
    documents: deDocuments,
    books: deBooks,
    assistant: deAssistant,
    tour: deTour,
    featurePages: deFeaturePages,
    profile: deProfile,
  },
  "en-GB": {
    common: enCommon,
    nav: enNav,
    meta: enMeta,
    push: enPush,
    auth: enAuth,
    household: enHousehold,
    move: enMove,
    home: enHome,
    budget: enBudget,
    documents: enDocuments,
    books: enBooks,
    assistant: enAssistant,
    tour: enTour,
    featurePages: enFeaturePages,
    profile: enProfile,
  },
};

export const I18N_NAMESPACES = [
  "common",
  "nav",
  "meta",
  "push",
  "auth",
  "household",
  "move",
  "home",
  "budget",
  "documents",
  "books",
  "assistant",
  "tour",
  "featurePages",
  "profile",
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: DEFAULT_LOCALE,
    lng: getStoredLocale(),
    defaultNS: "common",
    ns: I18N_NAMESPACES,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: [],
      convertDetectedLanguage: normalizeLocale,
    },
    returnNull: false,
  });

export default i18n;
