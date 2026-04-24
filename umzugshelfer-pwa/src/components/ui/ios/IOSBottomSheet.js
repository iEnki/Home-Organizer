import React, { useEffect } from "react";

export const IOSBottomSheet = ({
  open,
  onClose,
  title,
  header,
  children,
  footer,
  maxHeight = "85dvh",
  className = "",
  bodyClassName = "",
  overlayClassName = "",
  showGrabber = true,
  zIndexClassName = "z-[120]",
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zIndexClassName} lg:hidden`}>
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${overlayClassName}`}
        onClick={onClose}
        aria-label={title ? `${title} schließen` : "Sheet schließen"}
      />
      <section
        className={`absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[24px] ios-sheet-surface shadow-ios-sheet ${className}`}
        style={{ maxHeight }}
      >
        {showGrabber && <div className="ios-grabber" />}
        {header || title ? (
          <div className="sticky top-0 z-10 ios-glass-nav ios-list-separator">
            {header || (
              <div className="px-4 pt-2 pb-3">
                <p className="text-sm font-semibold text-ios-label dark:text-white text-center">{title}</p>
              </div>
            )}
          </div>
        ) : null}
        <div className={`pb-safe ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="sticky bottom-0 ios-glass-nav ios-list-separator px-4 py-3">{footer}</div>
        )}
      </section>
    </div>
  );
};
