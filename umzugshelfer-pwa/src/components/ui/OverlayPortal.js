import { createPortal } from "react-dom";

// Keep fixed overlays above navigation and outside transformed page containers.
export default function OverlayPortal({ children }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
