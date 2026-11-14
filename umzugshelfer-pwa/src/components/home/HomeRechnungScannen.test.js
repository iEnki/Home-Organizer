import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  test("rejects unsupported and oversized files without starting analysis", async () => {
    const { container } = render(<HomeRechnungScannen session={{ user: { id: "user-1" } }} />);
    const input = container.querySelector('input[accept="image/*,.pdf"]');
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.txt", { type: "text/plain" })] } });
    expect(mockToast.error).toHaveBeenCalledWith("documents:invoiceScan.errType");
    const large = new File(["x"], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(large, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [large] } });
    expect(mockToast.error).toHaveBeenCalledWith("documents:invoiceScan.errSize");
    expect(starteAnalyse).not.toHaveBeenCalled();
    await screen.findByText("OCR + Ollama");
  });

  test("retains the selected PDF after failure and retries with the same file", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    starteAnalyse.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ positionen: [], erkannte_module: [] });
    const { container } = render(<HomeRechnungScannen session={{ user: { id: "user-1" } }} />);
    const file = new File(["pdf"], "receipt.pdf", { type: "application/pdf" });
    fireEvent.change(container.querySelector('input[accept="image/*,.pdf"]'), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /analysieren/i }));
    await screen.findByRole("alert");
    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /analysieren/i }));
    await waitFor(() => expect(starteAnalyse).toHaveBeenCalledTimes(2));
    expect(starteAnalyse.mock.calls[0][0]).toBe(starteAnalyse.mock.calls[1][0]);
    consoleError.mockRestore();
  });

  test("rapid repeated presses start only one analysis", async () => {
    let finish;
    starteAnalyse.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { container } = render(<HomeRechnungScannen session={{ user: { id: "user-1" } }} />);
    fireEvent.change(container.querySelector('input[capture="environment"]'), { target: { files: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })] } });
    const button = await screen.findByRole("button", { name: /analysieren/i });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(starteAnalyse).toHaveBeenCalledTimes(1));
    await act(async () => { finish({ positionen: [], erkannte_module: [] }); });
  });

});
