import React from "react";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import i18n, { getStoredLocale } from "./index";
import { LocaleProvider, useLocale } from "../contexts/LocaleContext";

jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn() } }));

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await act(async () => { await i18n.changeLanguage("de"); });
});

test("keeps translations, interpolation and plurals across every resource", () => {
  const contract = [];
  const walk = (obj, prefix, lng, ns) => {
    for (const [key, value] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) walk(value, full, lng, ns);
      else if (typeof value === "string") {
        const vars = Object.fromEntries([...value.matchAll(/{{-?\s*([^}, ]+)/g)].map(m => [m[1], "Test & / Wert"]));
        for (const count of [0, 1, 2, 5]) {
          const result = i18n.t(`${ns}:${full}`, { ...vars, lng, count });
          expect(typeof result).toBe("string");
          contract.push([lng, ns, full, count, result]);
        }
      }
    }
  };
  for (const [lng, resources] of Object.entries(i18n.options.resources)) {
    for (const [ns, values] of Object.entries(resources)) walk(values, "", lng, ns);
  }
  expect(contract.length).toBeGreaterThan(10000);
  if (process.env.I18N_CONTRACT_OUTPUT) {
    require("fs").writeFileSync(process.env.I18N_CONTRACT_OUTPUT, JSON.stringify(contract));
  }
});

test("keeps explicit empty translations and fallback defaults", () => {
  i18n.addResource("de", "migration", "empty", "");
  expect(i18n.t("migration:empty")).toBe("");
  expect(i18n.t("migration:missing", { defaultValue: "Fallback" })).toBe("Fallback");
  expect(i18n.t("common:actions.save", { lng: "fr" })).toBe("Speichern");
});

test.each(["de-AT", "en-US", "en", "en-GB", "unknown"])("keeps stored locale normalization for %s", locale => {
  localStorage.setItem("ui_locale", locale);
  expect(getStoredLocale()).toBe(locale.startsWith("en") ? "en-GB" : "de");
});

test("updates translated UI, metadata, manifest and saved language together", async () => {
  document.head.innerHTML = '<meta name="description"><link rel="manifest" href="/manifest.de.json">';
  function Probe() {
    const { setLocale } = useLocale();
    const { t } = useTranslation("common");
    return <button onClick={() => setLocale("en-GB")}>{t("actions.save")}</button>;
  }
  render(<LocaleProvider><Probe /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
  expect(localStorage.getItem("ui_locale")).toBe("en-GB");
  expect(document.documentElement.lang).toBe("en-GB");
  expect(document.querySelector('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.en-GB.json");
});


test("loads the actual i18n entry point when an older browser lacks PluralRules", () => {
  const original = Intl.PluralRules;
  try {
    delete Intl.PluralRules;
    jest.isolateModules(() => {
      const instance = require("./index").default;
      expect(new Intl.PluralRules("de").select(1)).toBe("one");
      expect(new Intl.PluralRules("en-GB").select(2)).toBe("other");
      expect(instance.t("common:actions.save")).toBe("Speichern");
    });
  } finally { Intl.PluralRules = original; }
});


test.each(["de", "en-GB"])("selects actual plural forms at zero, one and multiple items in %s", lng => {
  for (const count of [0, 1, 2, 5]) {
    const form = count === 1 ? "one" : "other";
    for (const key of ["documents:archiveLayout.count", "kfz:serviceChecklist.positionCount", "profile:members.count"]) {
      const expected = i18n.t(`${key}_${form}`, { lng, count });
      expect(i18n.t(key, { lng, count })).toBe(expected);
    }
  }
});
