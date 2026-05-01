import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, normalizeLocale } from "../i18n";
import { supabase } from "../supabaseClient";

const MANIFEST_BY_LOCALE = {
  de: "/manifest.de.json",
  "en-GB": "/manifest.en-GB.json",
};

const LocaleContext = createContext(null);

function applyDocumentLocale(locale, t) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
  document.title = t("meta:title", { defaultValue: "Home Organizer" });

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute("content", t("meta:description", { defaultValue: "Home Organizer" }));
  }

  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.setAttribute("href", MANIFEST_BY_LOCALE[locale] || MANIFEST_BY_LOCALE[DEFAULT_LOCALE]);
  }
}

export function LocaleProvider({ children }) {
  const { t } = useTranslation(["meta"]);
  const [locale, setLocaleState] = useState(() => normalizeLocale(i18n.language));
  const [profileLoaded, setProfileLoaded] = useState(false);

  const setLocale = useCallback(async (nextLocale, options = {}) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    await i18n.changeLanguage(normalized);

    if (options.persist !== false && options.userId) {
      const { error } = await supabase.from("user_profile").update({ locale: normalized }).eq("id", options.userId);
      if (error) return { error };
    }
    return { error: null };
  }, []);

  const loadProfileLocale = useCallback(async (userId) => {
    if (!userId) {
      setProfileLoaded(false);
      return;
    }

    const { data, error } = await supabase.from("user_profile").select("locale").eq("id", userId).maybeSingle();
    setProfileLoaded(true);
    if (!error && data?.locale) {
      await setLocale(data.locale, { persist: false });
    }
  }, [setLocale]);

  useEffect(() => {
    applyDocumentLocale(locale, t);
  }, [locale, t]);

  useEffect(() => {
    const onLanguageChanged = (lng) => setLocaleState(normalizeLocale(lng));
    i18n.on("languageChanged", onLanguageChanged);
    return () => i18n.off("languageChanged", onLanguageChanged);
  }, []);

  const value = useMemo(() => ({
    locale,
    supportedLocales: SUPPORTED_LOCALES,
    profileLoaded,
    setLocale,
    loadProfileLocale,
  }), [locale, profileLoaded, setLocale, loadProfileLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
