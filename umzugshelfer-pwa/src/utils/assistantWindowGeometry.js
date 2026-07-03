/**
 * assistantWindowGeometry.js
 * Pure Geometrie-Helfer fuer das verschiebbare Assistenten-Fenster
 * (Desktop-Panel, Mobile-Bottom-Sheet, minimierte Blase).
 */

/**
 * Klemmt eine Fensterposition in den sichtbaren Viewport.
 */
export const clampToViewport = ({ x, y, width, height, vw, vh, padding = 8 }) => {
  const maxX = Math.max(padding, vw - width - padding);
  const maxY = Math.max(padding, vh - height - padding);
  return {
    x: Math.min(Math.max(Number(x) || 0, padding), maxX),
    y: Math.min(Math.max(Number(y) || 0, padding), maxY),
  };
};

/**
 * Waehlt den naechstliegenden Snap-Punkt (Hoehen-Ratio 0..1).
 * velocity > 0 = nach unten ziehen (kleiner werden), < 0 = nach oben.
 * Ein Fling (|velocity| ueber Schwellwert) springt einen Snap weiter in
 * Bewegungsrichtung statt zum rein naechstliegenden Punkt.
 */
export const nearestSnapPoint = (ratio, snapPoints = [0.45, 0.82, 1], velocity = 0) => {
  const sorted = [...snapPoints].sort((a, b) => a - b);
  if (sorted.length === 0) return ratio;

  const FLING_THRESHOLD = 0.9; // vh-Anteile pro Sekunde
  if (Math.abs(velocity) >= FLING_THRESHOLD) {
    if (velocity > 0) {
      // Nach unten: naechstkleinerer Snap
      const lower = [...sorted].reverse().find((point) => point < ratio - 0.02);
      return lower ?? sorted[0];
    }
    const higher = sorted.find((point) => point > ratio + 0.02);
    return higher ?? sorted[sorted.length - 1];
  }

  let best = sorted[0];
  let bestDistance = Math.abs(ratio - best);
  sorted.forEach((point) => {
    const distance = Math.abs(ratio - point);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  });
  return best;
};

/**
 * Liefert true, wenn die Zieh-Geste unter den kleinsten Snap faellt
 * (=> Sheet minimieren).
 */
export const isBelowDismissThreshold = (ratio, snapPoints = [0.45, 0.82, 1]) => {
  const min = Math.min(...snapPoints);
  return ratio < min * 0.72;
};

/**
 * Initiale Desktop-Position: gespeicherte Koordinaten (geklemmt) oder
 * Fallback auf den bisherigen Anchor (links/rechts unten).
 */
export const resolveInitialDesktopPosition = ({
  desktop_x,
  desktop_y,
  desktop_anchor = "right",
  vw,
  vh,
  width,
  height,
  padding = 24,
}) => {
  const hasStored =
    desktop_x !== null && desktop_x !== undefined && desktop_y !== null && desktop_y !== undefined;
  if (hasStored) {
    return clampToViewport({ x: Number(desktop_x), y: Number(desktop_y), width, height, vw, vh, padding: 8 });
  }
  const y = Math.max(8, vh - height - padding);
  const x = desktop_anchor === "left" ? padding : Math.max(8, vw - width - padding);
  return { x, y };
};

/**
 * Initiale Position der minimierten Blase (Mobile): gespeicherte Werte oder
 * rechts unten oberhalb der Bottom-Navigation.
 */
export const resolveInitialBubblePosition = ({
  mobile_x,
  mobile_y,
  vw,
  vh,
  size = 56,
  bottomOffset = 96,
}) => {
  const hasStored =
    mobile_x !== null && mobile_x !== undefined && mobile_y !== null && mobile_y !== undefined;
  if (hasStored) {
    return clampToViewport({ x: Number(mobile_x), y: Number(mobile_y), width: size, height: size, vw, vh, padding: 8 });
  }
  return {
    x: Math.max(8, vw - size - 16),
    y: Math.max(8, vh - size - bottomOffset),
  };
};
