import {
  getVehicleCoverPhoto,
  getVehiclePhotos,
  validateVehiclePhoto,
  VEHICLE_COVER_ROLE,
  VEHICLE_PHOTO_ROLE,
} from "./kfzPhotos";

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

describe("kfzPhotos", () => {
  test("akzeptiert nur unterstuetzte Bildtypen innerhalb des Limits", () => {
    expect(validateVehiclePhoto({ type: "image/jpeg", size: 1000 })).toBe("");
    expect(validateVehiclePhoto({ type: "image/heic", size: 1000 })).toMatch(/JPEG/);
    expect(validateVehiclePhoto({ type: "image/png", size: 13 * 1024 * 1024 })).toMatch(/12 MB/);
  });

  test("liefert Titelbild zuerst und trennt fremde Fahrzeuglinks", () => {
    const documents = [
      { id: "a", datei_typ: "image/jpeg", created_at: "2026-01-01" },
      { id: "b", datei_typ: "image/png", created_at: "2026-01-02" },
      { id: "c", datei_typ: "image/png", created_at: "2026-01-03" },
    ];
    const links = [
      { id: "la", dokument_id: "a", entity_type: "home_fahrzeuge", entity_id: "v1", role: VEHICLE_PHOTO_ROLE },
      { id: "lb", dokument_id: "b", entity_type: "home_fahrzeuge", entity_id: "v1", role: VEHICLE_COVER_ROLE },
      { id: "lc", dokument_id: "c", entity_type: "home_fahrzeuge", entity_id: "v2", role: VEHICLE_COVER_ROLE },
    ];
    expect(getVehiclePhotos({ documents, links, vehicleId: "v1" }).map((photo) => photo.id)).toEqual(["b", "a"]);
    expect(getVehicleCoverPhoto({ documents, links, vehicleId: "v1" }).id).toBe("b");
  });
});
