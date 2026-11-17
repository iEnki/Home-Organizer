import React from "react";
import { render, screen } from "@testing-library/react";
import DokumentenManager from "./DokumentenManager";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
jest.mock("react-router", () => ({ useLocation: () => ({ search: "" }), Link: ({ children }) => <span>{children}</span> }));
jest.mock("../hooks/useSingleFileDropzone", () => () => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false }));
jest.mock("../utils/kiClient", () => ({ getKiClient: jest.fn(), isKiClientReady: jest.fn() }));
jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn() } }));
const { supabase } = require("../supabaseClient");

test("loaded document sizes preserve rounded zero, positive and missing metadata", async () => {
  const query = { select: jest.fn(), eq: jest.fn(), in: jest.fn(), order: jest.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [
    { id: "tiny", dateiname: "tiny.txt", datei_typ: "text/plain", groesse_kb: 0 },
    { id: "normal", dateiname: "normal.pdf", datei_typ: "application/pdf", groesse_kb: 42 },
    { id: "legacy", dateiname: "legacy.pdf", datei_typ: "application/pdf", groesse_kb: null },
  ] });
  supabase.from.mockReturnValue(query);
  render(<DokumentenManager session={{ user: { id: "generated-user" } }} />);
  await screen.findByText("tiny.txt");
  expect(screen.getByText(/sizeLabel 0 documents:manager.kb/)).toBeInTheDocument();
  expect(screen.getByText(/sizeLabel 42 documents:manager.kb/)).toBeInTheDocument();
  expect(screen.getByText(/sizeLabel \? documents:manager.kb/)).toBeInTheDocument();
  expect(supabase.from).toHaveBeenCalledWith("dokumente");
  expect(query.eq).toHaveBeenCalledWith("user_id", "generated-user");
  expect(query.in).toHaveBeenCalledWith("app_modus", ["umzug", "beides"]);
});
