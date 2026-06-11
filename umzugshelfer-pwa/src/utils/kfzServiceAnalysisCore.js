export const SERVICE_POSITION_CATEGORIES = [
  "arbeit",
  "ersatzteil",
  "fluessigkeit",
  "reifen",
  "pruefung",
  "entsorgung",
  "sonstiges",
];

export const normalizeVehicleIdentifier = (value) => String(value || "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

export function findUniqueVehicleMatch(vehicles, extractedVehicle = {}) {
  const plate = normalizeVehicleIdentifier(extractedVehicle.plate);
  const vin = normalizeVehicleIdentifier(extractedVehicle.vin);
  const matches = (vehicles || []).filter((vehicle) => (
    (vin && normalizeVehicleIdentifier(vehicle.vin) === vin) ||
    (plate && normalizeVehicleIdentifier(vehicle.kennzeichen) === plate)
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function calculatePositionDifference(positions, gross) {
  if (gross === "" || gross == null) return null;
  const total = (positions || []).reduce((sum, position) => {
    const value = Number(position.gesamtpreis);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return Math.round((total - Number(gross)) * 100) / 100;
}
