const fs = require("fs");
const path = require("path");

process.env.REACT_APP_SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "https://example.supabase.co";
process.env.REACT_APP_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "test-anon-key";

const { isUmzugRoutePath, UMZUG_ROUTE_PREFIXES } = require("./App");

test("defines and exports the root app component", () => {
  const source = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");

  expect(source).toContain("function App()");
  expect(source).toContain("export default App");
});

test("recognizes all protected moving-planner routes", () => {
  expect(UMZUG_ROUTE_PREFIXES).toEqual([
    "/dashboard",
    "/budget",
    "/kontakte",
    "/todos",
    "/packliste",
    "/materialplaner",
    "/bedarfsrechner",
    "/umzugsplaner",
    "/zeitstrahl",
    "/dokumente",
    "/kostenvergleich",
  ]);

  expect(isUmzugRoutePath("/todos")).toBe(true);
  expect(isUmzugRoutePath("/bedarfsrechner")).toBe(true);
  expect(isUmzugRoutePath("/umzugsplaner/details")).toBe(true);
});

test("does not redirect shared or home routes as moving-planner routes", () => {
  expect(isUmzugRoutePath("/home")).toBe(false);
  expect(isUmzugRoutePath("/home/budget")).toBe(false);
  expect(isUmzugRoutePath("/kalender")).toBe(false);
  expect(isUmzugRoutePath("/profil")).toBe(false);
  expect(isUmzugRoutePath("/features/todo-listen")).toBe(false);
  expect(isUmzugRoutePath("/budget-extra")).toBe(false);
});
