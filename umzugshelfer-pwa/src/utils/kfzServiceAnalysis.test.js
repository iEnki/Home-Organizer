import {
  calculatePositionDifference,
  findUniqueVehicleMatch,
  normalizeVehicleIdentifier,
} from "./kfzServiceAnalysisCore";

test("normalizes plates and VINs", () => {
  expect(normalizeVehicleIdentifier("W-123 ab")).toBe("W123AB");
});

test("matches only a unique vehicle", () => {
  const vehicles = [
    { id: "1", kennzeichen: "W-123 AB", vin: "ABC" },
    { id: "2", kennzeichen: "G-9 XY", vin: "DEF" },
  ];
  expect(findUniqueVehicleMatch(vehicles, { plate: "w 123ab" })?.id).toBe("1");
  expect(findUniqueVehicleMatch([...vehicles, { id: "3", kennzeichen: "W123AB" }], { plate: "W-123 AB" })).toBeNull();
});

test("calculates invoice position difference including free lines", () => {
  expect(calculatePositionDifference([
    { gesamtpreis: 100 },
    { gesamtpreis: 20 },
    { gesamtpreis: 0, kostenlos: true },
  ], 120)).toBe(0);
  expect(calculatePositionDifference([{ gesamtpreis: 99.9 }], 100)).toBe(-0.1);
});
