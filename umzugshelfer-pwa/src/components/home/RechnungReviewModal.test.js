import React from "react";
import { render, screen } from "@testing-library/react";
import RechnungReviewModal from "./RechnungReviewModal";

jest.mock("../../contexts/LocaleContext", () => ({
  useLocale: () => ({ locale: "de-DE" }),
}));

jest.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock("../../supabaseClient", () => ({
  getActiveHouseholdId: () => null,
  supabase: {
    from: jest.fn(),
  },
}));

const ergebnis = {
  haendler: "MediaMarkt",
  datum: "2023-02-01",
  gesamt: 196.99,
  positionen: [],
  erkannte_module: ["budget"],
  summary_text: "Testrechnung",
  confidence: 0.9,
};

describe("RechnungReviewModal mobile layout", () => {
  it("rendert als viewport-festes Portal mit eigenem Scrollbereich und Footer", () => {
    const { unmount } = render(
      <RechnungReviewModal
        ergebnis={ergebnis}
        datei={new File(["test"], "rechnung.pdf", { type: "application/pdf" })}
        session={null}
        onAbbrechen={jest.fn()}
        onGespeichert={jest.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Rechnung pruefen" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("invoice-review-overlay", "fixed", "flex", "overflow-hidden");
    expect(dialog.querySelector(".invoice-review-body")).toHaveClass("flex-1", "overflow-y-auto");
    expect(dialog.querySelector(".invoice-review-footer")).toHaveClass("shrink-0");
    expect(screen.getAllByRole("button", { name: "Speichern" })).toHaveLength(2);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
