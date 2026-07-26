import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import OpenAiModelSelect from "./OpenAiModelSelect";

jest.mock("../../supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, values) => values?.latencyMs != null
      ? `${key}:${values.latencyMs}`
      : key,
  }),
}));

test("the model selection remains usable while the catalogue is refreshing", () => {
  render(
    <OpenAiModelSelect
      value="gpt-4o"
      onValueChange={jest.fn()}
      models={[]}
      target="vision"
      loading
      onRefresh={jest.fn()}
      onTest={jest.fn()}
    />,
  );

  const selectTrigger = screen.getByRole("button", { name: "gpt-4o" });
  expect(selectTrigger).toBeEnabled();

  fireEvent.click(selectTrigger);
  expect(screen.getByPlaceholderText("modelSelect.searchPlaceholder")).toBeInTheDocument();
  expect(screen.getByTitle("modelSelect.refresh")).toBeDisabled();
});
