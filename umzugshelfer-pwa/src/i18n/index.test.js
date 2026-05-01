import i18n, { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES } from "./index";

test("normalizes supported locales", () => {
  expect(normalizeLocale("en")).toBe("en-GB");
  expect(normalizeLocale("de-AT")).toBe("de");
  expect(normalizeLocale("unknown")).toBe(DEFAULT_LOCALE);
});

test("loads default i18n resources", () => {
  expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  expect(i18n.exists("common:actions.save", { lng: "de" })).toBe(true);
  expect(i18n.exists("common:actions.save", { lng: "en-GB" })).toBe(true);
});
