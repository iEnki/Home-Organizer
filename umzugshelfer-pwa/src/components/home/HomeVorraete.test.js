import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomeVorraete from "./HomeVorraete";
import { supabase } from "../../supabaseClient";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
const mockTranslate = (key, options = {}) => ({
  "home:stockForm.createFirst": "Ersten Vorrat anlegen",
  "home:stockForm.empty": "Noch keine Vorräte",
  "common:actions.save": "Speichern",
  "common:actions.cancel": "Abbrechen",
  "common:actions.edit": "Bearbeiten",
  "common:actions.delete": "Löschen",
}[key] || options.defaultValue || key);

let rows;
let deleteError;
let nextId;
let consoleErrorSpy;

const buildVorratBuilder = () => {
  let operation = "select";
  let mutationPayload = null;
  let selectedId = null;
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn((field, value) => {
      if (field === "id") selectedId = value;
      return builder;
    }),
    order: jest.fn(() => Promise.resolve({ data: rows, error: null })),
    insert: jest.fn((payload) => {
      operation = "insert";
      mutationPayload = payload;
      return builder;
    }),
    update: jest.fn((payload) => {
      operation = "update";
      mutationPayload = payload;
      return builder;
    }),
    delete: jest.fn(() => {
      operation = "delete";
      return builder;
    }),
    single: jest.fn(async () => {
      if (operation === "insert") {
        return {
          data: {
            id: nextId,
            ...mutationPayload,
          },
          error: null,
        };
      }
      if (operation === "update") {
        return {
          data: {
            ...(rows.find((entry) => entry.id === selectedId) || {}),
            ...mutationPayload,
            id: selectedId,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    }),
    then: (resolve, reject) => {
      const result = operation === "delete"
        ? { data: null, error: deleteError }
        : { data: rows, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
};

jest.mock("../../hooks/useToast", () => ({
  useToast: () => mockToast,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockTranslate,
  }),
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../../utils/pushNotifications", () => ({
  notifyHouseholdEvent: jest.fn(() => Promise.resolve({ scheduled: true })),
}));

jest.mock("../../utils/assistantDomainAdapters", () => ({
  applySupplyAiItems: jest.fn(),
}));

jest.mock("../../utils/einkaufslisteUtils", () => ({
  applyShoppingBatch: jest.fn(),
  prepareShoppingBatch: jest.fn(),
}));

jest.mock("./KiHomeAssistent", () => () => null);
jest.mock("./tour/TourOverlay", () => () => null);
jest.mock("./tour/useTour", () => ({
  useTour: () => ({
    active: false,
    schritt: 0,
    setSchritt: jest.fn(),
    beenden: jest.fn(),
  }),
}));
jest.mock("../ui/GlassSurface", () => ({
  __esModule: true,
  default: ({ children, ...props }) => <div {...props}>{children}</div>,
  glassPageVariants: {},
  glassSurfaceClass: "",
}));

describe("HomeVorraete", () => {
  beforeEach(() => {
    rows = [];
    deleteError = null;
    nextId = "stock-new";
    jest.clearAllMocks();
    supabase.from.mockImplementation(() => buildVorratBuilder());
    notifyHouseholdEvent.mockResolvedValue({ scheduled: true });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("erstellt und loescht einen Vorrat ohne vollstaendiges Neuladen", async () => {
    render(<HomeVorraete session={{ user: { id: "user-1" } }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Ersten Vorrat anlegen" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Codex Latenztest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Codex Latenztest")).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(notifyHouseholdEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "erstellt",
      recordId: "stock-new",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() => {
      expect(screen.queryByText("Codex Latenztest")).not.toBeInTheDocument();
    });
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(notifyHouseholdEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "geloescht",
      recordId: "stock-new",
    }));
  });

  test("behaelt den Eintrag bei einem Datenbankfehler", async () => {
    rows = [{
      id: "stock-ice",
      user_id: "user-1",
      name: "Eis",
      kategorie: "Lebensmittel",
      einheit: "Packung",
      bestand: 1,
      mindestmenge: 1,
    }];
    deleteError = { message: "Delete failed" };

    render(<HomeVorraete session={{ user: { id: "user-1" } }} />);
    expect(await screen.findByText("Eis")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Delete failed");
    });
    expect(screen.getByText("Eis")).toBeInTheDocument();
    expect(notifyHouseholdEvent).not.toHaveBeenCalled();
  });
});
