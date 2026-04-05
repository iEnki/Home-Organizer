import { createClient } from "@supabase/supabase-js";

// Lese die Supabase URL und den Anon Key aus den Umgebungsvariablen
// Diese werden während des Build-Prozesses von Docker (via .env und docker-compose.yml) bereitgestellt
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Überprüfung, ob die Variablen gesetzt sind
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL (REACT_APP_SUPABASE_URL) and Anon Key (REACT_APP_SUPABASE_ANON_KEY) must be defined in environment variables."
  );
}

const SHARED_TABLES = new Set([
  "kontakte",
  "budget_posten",
  "budget_teilzahlungen",
  "todo_aufgaben",
  "pack_kisten",
  "pack_gegenstaende",
  "dokumente",
  "renovierungs_posten",
  "home_projekte",
  "home_orte",
  "home_lagerorte",
  "home_objekte",
  "home_vorraete",
  "home_einkaufliste",
  "home_einkauf_korrekturen",
  "home_geraete",
  "home_wartungen",
  "home_bewohner",
  "home_budget_limits",
  "home_sparziele",
  "home_finanzkonten",
  "budget_split_groups",
  "budget_split_shares",
  "budget_settlements",
  "home_verlauf",
  "home_wissen",
  "haushaltsaufgaben",
  "vorraete",
  "projekte",
  "geraete",
]);

let activeHouseholdId =
  typeof window !== "undefined"
    ? window.localStorage.getItem("__active_household_id")
    : null;

export const setActiveHouseholdId = (householdId) => {
  activeHouseholdId = householdId || null;
  if (typeof window !== "undefined") {
    if (activeHouseholdId) {
      window.localStorage.setItem("__active_household_id", activeHouseholdId);
    } else {
      window.localStorage.removeItem("__active_household_id");
    }
  }
};

export const getActiveHouseholdId = () => activeHouseholdId;

const rewriteFilterArgs = (table, method, args) => {
  if (!SHARED_TABLES.has(table) || !activeHouseholdId) return args;
  if (!Array.isArray(args) || args.length === 0) return args;
  const [column] = args;
  if (column !== "user_id") return args;

  if (method === "eq" || method === "neq") {
    return ["household_id", activeHouseholdId];
  }
  if (method === "in") {
    return ["household_id", [activeHouseholdId]];
  }
  if (method === "not") {
    return ["household_id", args[1], args[2]];
  }
  return args;
};

const normalizeWritePayload = (table, payload) => {
  if (!SHARED_TABLES.has(table) || !activeHouseholdId) return payload;
  if (payload == null) return payload;

  const normalizeRow = (row) => {
    if (row == null || typeof row !== "object") return row;
    if (Array.isArray(row)) return row.map(normalizeRow);
    const next = { ...row };
    if (!next.household_id) next.household_id = activeHouseholdId;
    return next;
  };

  return normalizeRow(payload);
};

const wrapBuilder = (table, builder) =>
  new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "then") return value.bind(target);

      return (...args) => {
        let nextArgs = args;
        if (prop === "eq" || prop === "neq" || prop === "in" || prop === "not") {
          nextArgs = rewriteFilterArgs(table, prop, args);
        } else if (prop === "insert" || prop === "upsert" || prop === "update") {
          nextArgs = [normalizeWritePayload(table, args[0]), ...args.slice(1)];
        }

        const result = value.apply(target, nextArgs);
        if (result && typeof result === "object") {
          return wrapBuilder(table, result);
        }
        return result;
      };
    },
  });

const rawClient = createClient(supabaseUrl, supabaseAnonKey);
const originalFrom = rawClient.from.bind(rawClient);
rawClient.from = (table) => wrapBuilder(table, originalFrom(table));

export const supabase = rawClient;
