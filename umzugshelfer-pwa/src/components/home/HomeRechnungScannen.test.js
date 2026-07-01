import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomeRechnungScannen from "./HomeRechnungScannen";
import { supabase } from "../../supabaseClient";
import { getKiClient } from "../../utils/kiClient";
import { starteAnalyse } from "../../utils/rechnungAnalyse";

const mockToast = {
  error: jest.fn(),
  info: jest.fn(),
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options = {}) => {
      if (key === "documents:invoiceScan.analyse") return "Analysieren";
      if (key === "documents:invoiceScan.statusRunning") return `Analysiere mit ${options.mode}`;
      if (key === "documents:invoiceScan.title") return "Rechnung scannen";
      if (key === "documents:preview") return "Vorschau";
      if (key === "common:actions.delete") return "Löschen";
      return key;
    },
  }),
}));

jest.mock("../../hooks/useToast", () => ({
  useToast: () => mockToast,
}));

jest.mock("../../contexts/LocaleContext", () => ({
  useLocale: () => ({ locale: "de" }),
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../../utils/kiClient", () => ({
  getKiClient: jest.fn(),
}));

jest.mock("../../utils/rechnungAnalyse", () => ({
  starteAnalyse: jest.fn(),
}));

jest.mock("./RechnungReviewModal", () => () => null);

jest.mock("../ui/GlassSurface", () => {
  const React = require("react");
  const GlassSurface = ({ children, interactive, ...props }) => <div {...props}>{children}</div>;
  return {
    __esModule: true,
    default: GlassSurface,
    GlassModule: ({ children, ...props }) => <div {...props}>{children}</div>,
  };
});

describe("HomeRechnungScannen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { bildanalyse_modus: "ocr_ollama" },
        error: null,
      }),
    });
    getKiClient.mockResolvedValue({ client: {} });
  });

  test("zeigt bei Vision-Fehler keinen OCR-Fallback-Confirm", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Die konfigurierte Ollama-Adresse konnte nicht aufgelöst werden.");
    error.canFallbackToOcrRules = true;
    starteAnalyse.mockRejectedValue(error);

    const { container } = render(
      <HomeRechnungScannen session={{ user: { id: "user-1" }, access_token: "token" }} />,
    );

    await screen.findByText("OCR + Ollama");

    const input = container.querySelector('input[accept="image/*,.pdf"]');
    const file = new File(["image"], "rechnung.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole("button", { name: /analysieren/i }));

    await waitFor(() => {
      expect(starteAnalyse).toHaveBeenCalledWith(
        expect.any(File),
        "ocr_ollama",
        expect.objectContaining({ session: expect.any(Object), locale: "de" }),
      );
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(error.message);
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("analysiert PDFs ohne doc-process-Vorabpipeline", async () => {
    const result = {
      haendler: "Dyson",
      datum: "2026-06-18",
      gesamt: 31,
      positionen: [],
      erkannte_module: ["budget", "dokumente"],
    };
    starteAnalyse.mockResolvedValue(result);

    const { container } = render(
      <HomeRechnungScannen session={{ user: { id: "user-1" }, access_token: "token" }} />,
    );

    await screen.findByText("OCR + Ollama");

    const input = container.querySelector('input[accept="image/*,.pdf"]');
    const file = new File(["%PDF-1.4"], "rechnung.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole("button", { name: /analysieren/i }));

    await waitFor(() => {
      expect(starteAnalyse).toHaveBeenCalledWith(
        expect.any(File),
        "ocr_ollama",
        expect.objectContaining({ session: expect.any(Object), locale: "de" }),
      );
    });

    expect(supabase.functions?.invoke).toBeUndefined();
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
