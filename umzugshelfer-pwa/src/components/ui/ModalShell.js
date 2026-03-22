import React, { useEffect } from "react";
import { XCircle } from "lucide-react";

// ── ModalShell ────────────────────────────────────────────────────────────────
// Wiederverwendbare Modal-Hülle mit:
//   - Body-Scroll-Lock (overflow: hidden auf body)
//   - Escape-Taste zum Schließen (opt-out: closeOnEscape={false})
//   - Klick auf Overlay zum Schließen (opt-out: closeOnBackdrop={false})
//   - Sticky Header (mit Titel + Close-Button) und Footer
//   - Scrollbarer Body (flex-1 overflow-y-auto)
//
// iOS Safari: overflow: hidden auf body kann den Bounce-Effekt nicht vollständig
// unterdrücken. Bei Bedarf: position: fixed + top: -scrollY als Nachschärfung.
export default function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-md",
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  // Scroll-Lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape-Taste
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-4 pb-safe flex items-center justify-center"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`bg-light-card-bg dark:bg-canvas-2 w-full ${maxWidthClass} rounded-card shadow-elevation-3 border border-light-border dark:border-dark-border max-h-[90dvh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
