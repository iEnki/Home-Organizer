import React from "react";
import { render, screen } from "@testing-library/react";
import { groupServicePositions, summarizeServicePositions } from "./KfzServiceChecklist";
import { KfzServiceCard } from "./KfzServiceChecklist";

jest.mock("../../../utils/kfzData", () => ({
  createKfzDocumentUrl: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, values) => values?.count != null ? `${key}:${values.count}` : values?.value != null ? `${key}:${values.value}` : key,
  }),
}));

describe("KfzServiceChecklist", () => {
  const positions = [
    { kategorie: "arbeit", beschreibung: "Oelwechsel", gesamtpreis: 80, confidence: 0.95 },
    { kategorie: "ersatzteil", beschreibung: "Oelfilter", gesamtpreis: 20, rabatt_betrag: 5, confidence: 0.6 },
    { kategorie: "entsorgung", beschreibung: "Altoel", gesamtpreis: 0, kostenlos: true, confidence: 0.9 },
  ];

  test("groups positions in the configured category order", () => {
    expect(groupServicePositions(positions).map((group) => group.category)).toEqual([
      "arbeit",
      "ersatzteil",
      "entsorgung",
    ]);
  });

  test("calculates totals, discounts, free and uncertain positions", () => {
    expect(summarizeServicePositions(positions)).toMatchObject({
      count: 3,
      categoryCount: 3,
      total: 100,
      discount: 5,
      freeCount: 1,
      uncertainCount: 1,
    });
  });

  test("does not treat a missing price as a free position", () => {
    expect(summarizeServicePositions([
      { kategorie: "arbeit", beschreibung: "Preis offen", gesamtpreis: null, kostenlos: false },
    ]).freeCount).toBe(0);
  });

  test("renders an expanded checklist with prices, free status and safety notes", () => {
    render(
      <KfzServiceCard
        service={{
          id: "service-1",
          typ: "Service",
          datum: "2026-06-02",
          kosten: 100,
          analyse_meta: {
            source: "ki_serviceanalyse",
            safety_notes: ["Radmuttern nachziehen"],
          },
        }}
        positions={positions}
        vehicleLabel="Rio - W91211D"
        formatDate={(value) => value}
        money={(value) => `${Number(value || 0).toFixed(2)} EUR`}
        expanded
        onToggle={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByText("Ölwechsel")).toBeInTheDocument();
    expect(screen.getByText("Ölfilter")).toBeInTheDocument();
    expect(screen.getByText("serviceChecklist.free")).toBeInTheDocument();
    expect(screen.getByText("Radmuttern nachziehen")).toBeInTheDocument();
    expect(screen.getByText("100.00 EUR")).toBeInTheDocument();
  });
});
