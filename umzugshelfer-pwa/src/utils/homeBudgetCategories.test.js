import {
  getDefaultHomeBudgetCategories,
  isProtectedHomeBudgetCategory,
} from "./homeBudgetCategories";

test("deprecated budget categories are no longer seeded as defaults", () => {
  const names = getDefaultHomeBudgetCategories().map((category) => category.name);

  expect(names).not.toContain("Elektronik");
  expect(names).not.toContain("Moebel & Einrichtung");
  expect(names).not.toContain("Möbel & Einrichtung");
});

test("standard budget categories are deletable in the manager", () => {
  expect(isProtectedHomeBudgetCategory("Lebensmittel")).toBe(false);
  expect(isProtectedHomeBudgetCategory("Elektronikartikel")).toBe(false);
  expect(isProtectedHomeBudgetCategory("Haushalt")).toBe(false);
});
