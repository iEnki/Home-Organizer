import React, { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function BottomSheet({ open, onClose, title, children }) {
  const { t } = useTranslation(["common"]);

  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-[120] flex items-end pt-4"
      style={{ paddingBottom: "max(0.75rem, var(--mobile-bottom-offset, 0px))" }}
    >
      <button
        className="absolute inset-0 bg-canvas-0/65 backdrop-blur-sm"
        aria-label={t("common:actions.close")}
        onClick={onClose}
      />
      <section
        className="relative w-full rounded-t-2xl border-t border-light-border dark:border-dark-border
                   bg-light-card-bg dark:bg-canvas-2 flex flex-col shadow-elevation-3 overflow-hidden"
        style={{
          maxHeight: "calc(100dvh - var(--safe-area-top, 0px) - var(--mobile-bottom-offset, 0px) - 1rem)",
          paddingBottom: "0.75rem",
        }}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-card-sm flex items-center justify-center
                       text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
            aria-label={t("common:actions.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {children}
        </div>
      </section>
    </div>
  );
}
