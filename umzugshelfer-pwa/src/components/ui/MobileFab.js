// ── MobileFab ─────────────────────────────────────────────────────────────────
// Mobiler Fixed-Action-Button (nur sichtbar < md).
// Sitzt über der BottomNav (z-50 > z-40) und berücksichtigt --mobile-bottom-offset,
// das bereits die Safe-Area enthält.
//
// Props:
//   onClick  — click handler
//   title    — tooltip / aria-label
//   pill     — wenn true: breiter Pill-Button mit Text; sonst: runder Icon-Button
//   children — Button-Inhalt (Icon oder Label)
export default function MobileFab({ onClick, children, title, pill = false, ...rest }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`md:hidden fixed right-4 bg-primary-500 hover:bg-primary-600 text-white shadow-elevation-2 z-50 ${
        pill
          ? "rounded-pill px-4 py-2.5 text-sm font-medium"
          : "rounded-full p-3"
      }`}
      style={{ bottom: "calc(var(--mobile-bottom-offset, 0px) + 12px)" }}
      {...rest}
    >
      {children}
    </button>
  );
}
