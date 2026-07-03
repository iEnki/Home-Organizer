import {
  clampToViewport,
  isBelowDismissThreshold,
  nearestSnapPoint,
  resolveInitialBubblePosition,
  resolveInitialDesktopPosition,
} from "./assistantWindowGeometry";

describe("assistantWindowGeometry", () => {
  const viewport = { vw: 1920, vh: 1080 };
  const panel = { width: 440, height: 680 };

  test("clampToViewport haelt alle vier Kanten ein", () => {
    const base = { ...panel, ...viewport, padding: 8 };
    expect(clampToViewport({ x: -100, y: 200, ...base })).toEqual({ x: 8, y: 200 });
    expect(clampToViewport({ x: 5000, y: 200, ...base })).toEqual({ x: 1920 - 440 - 8, y: 200 });
    expect(clampToViewport({ x: 200, y: -50, ...base })).toEqual({ x: 200, y: 8 });
    expect(clampToViewport({ x: 200, y: 5000, ...base })).toEqual({ x: 200, y: 1080 - 680 - 8 });
  });

  test("clampToViewport bei geschrumpftem Viewport", () => {
    // Panel (440x680) passt nicht mehr in 400x600 -> beide Achsen auf padding
    const clamped = clampToViewport({ x: 900, y: 700, ...panel, vw: 400, vh: 600, padding: 8 });
    expect(clamped.x).toBe(8);
    expect(clamped.y).toBe(8);
    // Passt horizontal (800 breit): clamp auf rechte Kante
    const wide = clampToViewport({ x: 900, y: 100, ...panel, vw: 800, vh: 1080, padding: 8 });
    expect(wide.x).toBe(800 - 440 - 8);
  });

  test("nearestSnapPoint waehlt naechstliegenden Punkt", () => {
    expect(nearestSnapPoint(0.5, [0.45, 0.82, 1])).toBe(0.45);
    expect(nearestSnapPoint(0.7, [0.45, 0.82, 1])).toBe(0.82);
    expect(nearestSnapPoint(0.95, [0.45, 0.82, 1])).toBe(1);
  });

  test("nearestSnapPoint mit Fling springt in Bewegungsrichtung", () => {
    // Schnell nach unten (velocity > 0) von 0.8 -> naechstkleinerer Snap
    expect(nearestSnapPoint(0.8, [0.45, 0.82, 1], 2)).toBe(0.45);
    // Schnell nach oben von 0.5 -> naechstgroesserer Snap
    expect(nearestSnapPoint(0.5, [0.45, 0.82, 1], -2)).toBe(0.82);
    // Fling ueber die Grenzen hinaus bleibt am Rand
    expect(nearestSnapPoint(0.4, [0.45, 0.82, 1], 3)).toBe(0.45);
    expect(nearestSnapPoint(0.99, [0.45, 0.82, 1], -3)).toBe(1);
  });

  test("isBelowDismissThreshold unter dem kleinsten Snap", () => {
    expect(isBelowDismissThreshold(0.2, [0.45, 0.82, 1])).toBe(true);
    expect(isBelowDismissThreshold(0.4, [0.45, 0.82, 1])).toBe(false);
  });

  test("resolveInitialDesktopPosition nutzt gespeicherte Koordinaten (geklemmt)", () => {
    const position = resolveInitialDesktopPosition({
      desktop_x: 5000,
      desktop_y: 100,
      desktop_anchor: "right",
      ...viewport,
      ...panel,
    });
    expect(position).toEqual({ x: 1920 - 440 - 8, y: 100 });
  });

  test("resolveInitialDesktopPosition Fallback auf Anchor bei null", () => {
    const right = resolveInitialDesktopPosition({
      desktop_x: null,
      desktop_y: null,
      desktop_anchor: "right",
      ...viewport,
      ...panel,
      padding: 24,
    });
    expect(right).toEqual({ x: 1920 - 440 - 24, y: 1080 - 680 - 24 });

    const left = resolveInitialDesktopPosition({
      desktop_x: undefined,
      desktop_y: undefined,
      desktop_anchor: "left",
      ...viewport,
      ...panel,
      padding: 24,
    });
    expect(left.x).toBe(24);
  });

  test("resolveInitialBubblePosition: gespeichert vs. Standard rechts unten", () => {
    const stored = resolveInitialBubblePosition({ mobile_x: 20, mobile_y: 30, vw: 400, vh: 800 });
    expect(stored).toEqual({ x: 20, y: 30 });

    const fallback = resolveInitialBubblePosition({ mobile_x: null, mobile_y: null, vw: 400, vh: 800 });
    expect(fallback).toEqual({ x: 400 - 56 - 16, y: 800 - 56 - 96 });
  });
});
