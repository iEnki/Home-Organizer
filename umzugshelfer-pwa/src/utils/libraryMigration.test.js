import React from "react";
import i18n from "../i18n";
import { render, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import useDropzone from "../hooks/useSingleFileDropzone";
import * as icons from "lucide-react";
import { generateIcsData } from "./calendarUtils";
import { format, addDays, startOfWeek, getDay, parseISO } from "date-fns";
import { de, enGB } from "date-fns/locale";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

afterEach(cleanup);

function Files({ onDrop }) {
  const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: false });
  return <div {...getRootProps()}><input data-testid="file" {...getInputProps()} /></div>;
}

test.each([["generated.pdf", "application/pdf"], ["generated.jpg", "image/jpeg"], ["generated.txt", "text/plain"]])("single document selection remains unrestricted: %s", async (name, type) => {
  const drop = jest.fn(); const { getByTestId } = render(<Files onDrop={drop} />);
  const file = new File(["generated-data"], name, { type });
  fireEvent.change(getByTestId("file"), { target: { files: [file] } });
  await waitFor(() => expect(drop).toHaveBeenCalledTimes(1));
  expect(drop.mock.calls[0][0]).toEqual([file]);
  expect(drop.mock.calls[0][1]).toEqual([]);
});

test("single-file restriction rejects a multiple-file drop", async () => {
  const drop = jest.fn(); const { getByTestId } = render(<Files onDrop={drop} />);
  const files = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];
  fireEvent.change(getByTestId("file"), { target: { files } });
  await waitFor(() => expect(drop).toHaveBeenCalled());
  expect(drop.mock.calls[0][0]).toHaveLength(0);
  expect(drop.mock.calls[0][1]).toHaveLength(2);
});

test("all named Lucide imports used by the application remain available", () => {
  const fs = require("fs"), path = require("path");
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const names = new Set();
  for (const file of walk(path.resolve(__dirname, ".."))) {
    if (!/\.[jt]sx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const ast = require("@babel/parser").parse(source, { sourceType: "module", plugins: ["jsx"] });
    for (const node of ast.program.body) {
      if (node.type !== "ImportDeclaration" || node.source.value !== "lucide-react") continue;
      for (const specifier of node.specifiers) if (specifier.type === "ImportSpecifier") names.add(specifier.imported.name);
    }
  }
  expect(names.size).toBeGreaterThan(100);
  expect([...names].filter(name => !icons[name])).toEqual([]);
});

test("calendar exports and date/localizer operations keep their semantic values", async () => {
  const events = [
    { title: "Generated move", start: [2026, 3, 29, 1, 30], duration: { hours: 2 }, uid: "fixture-dst" },
    { title: "Generated end", start: [2026, 10, 25, 10, 0], end: [2026, 10, 25, 12, 0], uid: "fixture-end" },
    { title: "Generated default", start: [2026, 11, 15, 9, 0], uid: "fixture-default" },
    { title: "Generated unicode – Test", start: [2026, 11, 15, 10, 0], description: "Line 1; text, test\nLine 2", location: "Generated address", uid: "fixture-text" },
  ];
  const calendars = [];
  for (const event of events) {
    const value = await generateIcsData(event);
    expect(value).toContain("BEGIN:VEVENT"); expect(value).toContain(`UID:${event.uid}`);
    calendars.push(value.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(line => line && !line.startsWith("DTSTAMP:")).sort());
  }
  const date = parseISO("2026-03-29T12:00:00");
  const dates = [format(date, "PPPP", { locale: de }), format(date, "PPPP", { locale: enGB }), format(addDays(date, 1), "yyyy-MM-dd"), format(startOfWeek(date, { locale: de }), "yyyy-MM-dd"), getDay(date)];
  const qr = renderToStaticMarkup(<QRCodeSVG value="generated-box/123?item=test" size={128} />);
  expect(qr).toContain("<svg"); expect(qr).toContain("viewBox");
  if (process.env.UI_EXPORT_CONTRACT_OUTPUT) require("fs").writeFileSync(process.env.UI_EXPORT_CONTRACT_OUTPUT, JSON.stringify({ calendars, dates, qr }));
});


test("optional performance reporting retains every legacy callback metric including FID", async () => {
  const metrics = await import("web-vitals");
  for (const name of ["getCLS", "getFID", "getFCP", "getLCP", "getTTFB"]) expect(typeof metrics[name]).toBe("function");
});


test("does not introduce file-paste selection in existing document inputs", async () => {
  const drop = jest.fn(); const { getByTestId } = render(<Files onDrop={drop} />);
  const file = new File(["generated-data"], "pasted.pdf", { type: "application/pdf" });
  fireEvent.paste(getByTestId("file"), { clipboardData: { files: [file], items: [{ kind: "file", type: file.type, getAsFile: () => file }], types: ["Files"] } });
  await act(async () => {});
  expect(drop).not.toHaveBeenCalled();
});


test("keeps the new library's file-input label translated in both supported languages", async () => {
  await act(async () => { await i18n.changeLanguage("de"); });
  const { getByTestId } = render(<Files onDrop={jest.fn()} />);
  expect(getByTestId("file")).toHaveAttribute("aria-label", "Neues Dokument hochladen");
  await act(async () => { await i18n.changeLanguage("en-GB"); });
  expect(getByTestId("file")).toHaveAttribute("aria-label", "Upload new document");
  await act(async () => { await i18n.changeLanguage("de"); });
});
