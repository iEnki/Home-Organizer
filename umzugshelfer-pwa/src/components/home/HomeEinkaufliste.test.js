import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomeEinkaufliste from "./HomeEinkaufliste";

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockRows = [
  {
    id: "1",
    user_id: "user-1",
    name: "Milch",
    normalized_name: "Milch",
    menge: 2,
    einheit: "Liter",
    kategorie: "Lebensmittel",
    hauptkategorie: "Lebensmittel",
    unterkategorie: "Milchprodukte",
    review_noetig: false,
    erledigt: false,
    created_at: "2026-04-04T10:00:00.000Z",
  },
  {
    id: "2",
    user_id: "user-1",
    name: "Pflaster",
    normalized_name: "Pflaster",
    menge: 1,
    einheit: "Packung",
    kategorie: "Apotheke / Gesundheit",
    hauptkategorie: "Apotheke / Gesundheit",
    unterkategorie: "Erste Hilfe",
    review_noetig: true,
    erledigt: false,
    created_at: "2026-04-04T11:00:00.000Z",
  },
  {
    id: "3",
    user_id: "user-1",
    name: "Batterien",
    normalized_name: "Batterien",
    menge: 4,
    einheit: "Stück",
    kategorie: "Elektronik",
    hauptkategorie: "Elektronik",
    unterkategorie: "Batterien",
    review_noetig: false,
    erledigt: true,
    erledigt_am: "2026-04-04T12:00:00.000Z",
    created_at: "2026-04-04T09:00:00.000Z",
  },
];

jest.mock("../../hooks/useToast", () => ({
  useToast: () => mockToast,
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

jest.mock("../../supabaseClient", () => {
  const buildSelectBuilder = () => {
    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      order: jest.fn(() => builder),
      update: jest.fn(() => builder),
      delete: jest.fn(() => builder),
      insert: jest.fn(() => builder),
      upsert: jest.fn(() => builder),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve, reject) =>
        Promise.resolve({ data: mockRows, error: null }).then(resolve, reject),
    };
    return builder;
  };

  return {
    getActiveHouseholdId: jest.fn(() => null),
    supabase: {
      from: jest.fn(() => buildSelectBuilder()),
      rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

describe("HomeEinkaufliste", () => {
  test("rendert gruppierte Einträge und filtert Prüfen-Einträge", async () => {
    render(<HomeEinkaufliste session={{ user: { id: "user-1" } }} />);

    expect(await screen.findByText("Milch")).toBeInTheDocument();
    expect(screen.getByText("Pflaster")).toBeInTheDocument();
    expect(screen.getAllByText("Prüfen").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));

    await waitFor(() => {
      expect(screen.queryByText("Milch")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Pflaster")).toBeInTheDocument();
  });

  test("zeigt erledigte Einträge im einklappbaren Bereich", async () => {
    render(<HomeEinkaufliste session={{ user: { id: "user-1" } }} />);

    expect(await screen.findByText("Milch")).toBeInTheDocument();
    expect(screen.queryByText("Batterien")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1 zuletzt abgehakte artikel/i }));

    expect(await screen.findByText("Batterien")).toBeInTheDocument();
  });
});
