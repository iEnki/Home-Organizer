import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SearchableSelect from "./SearchableSelect";

test("renders the menu in a fixed portal and selects an enabled item", () => {
  const onValueChange = jest.fn();
  render(
    <SearchableSelect
      value="gpt-4o"
      onValueChange={onValueChange}
      showSearch
      items={[
        { value: "gpt-4o", label: "gpt-4o" },
        { value: "gpt-5", label: "gpt-5" },
      ]}
    />,
  );

  const trigger = screen.getByRole("button", { name: /gpt-4o/i });
  trigger.getBoundingClientRect = () => ({
    left: 40,
    right: 440,
    top: 100,
    bottom: 142,
    width: 400,
    height: 42,
    x: 40,
    y: 100,
    toJSON: () => ({}),
  });

  fireEvent.click(trigger);

  const menu = screen.getByTestId("searchable-select-menu");
  expect(menu.parentElement).toBe(document.body);
  expect(menu).toHaveStyle({
    position: "fixed",
    left: "40px",
    width: "400px",
  });

  fireEvent.click(screen.getByRole("option", { name: /gpt-5/i }));
  expect(onValueChange).toHaveBeenCalledWith("gpt-5");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("keeps disabled model types visible but not selectable", () => {
  const onValueChange = jest.fn();
  render(
    <SearchableSelect
      value=""
      onValueChange={onValueChange}
      items={[
        {
          value: "text-embedding-3-small",
          label: "text-embedding-3-small",
          disabled: true,
        },
      ]}
    />,
  );

  const trigger = screen.getByRole("button");
  trigger.getBoundingClientRect = () => ({
    left: 20,
    right: 260,
    top: 100,
    bottom: 142,
    width: 240,
    height: 42,
    x: 20,
    y: 100,
    toJSON: () => ({}),
  });
  fireEvent.click(trigger);

  const option = screen.getByRole("option", { name: /text-embedding-3-small/i });
  expect(option).toBeDisabled();
  fireEvent.click(option);
  expect(onValueChange).not.toHaveBeenCalled();
});
