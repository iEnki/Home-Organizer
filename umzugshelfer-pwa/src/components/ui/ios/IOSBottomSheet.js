import OverlayPortal from "../OverlayPortal";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
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
  const dragControls = useDragControls();
  const reduced = useReducedMotion();
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



  return (
    <AnimatePresence>{open && <OverlayPortal><div data-app-dialog="" className={`fixed inset-0 ${zIndexClassName} lg:hidden`}>
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${overlayClassName}`}
        onClick={onClose}
        aria-label={title ? `${title} schließen` : "Sheet schließen"}
      />
      <motion.section drag="y" dragListener={false} dragControls={dragControls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .18 }} onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 600) onClose?.(); }} initial={reduced ? { opacity: 0 } : { y: "100%" }} animate={{ y: 0, opacity: 1 }} exit={reduced ? { opacity: 0 } : { y: "100%" }} transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[24px] ios-sheet-surface shadow-ios-sheet ${className}`}
        style={{ maxHeight }}
      >
        {showGrabber && <div onPointerDown={event => dragControls.start(event)} style={{ touchAction: "none" }} className="flex min-h-[44px] items-center justify-center cursor-grab"><div className="ios-grabber" /></div>}
        {header || title ? (
          <div className="sticky top-0 z-10 ios-glass-nav ios-list-separator">
            {header || (
              <div className="px-4 pt-2 pb-3">
                <h2 className="text-base font-semibold text-ios-label dark:text-white text-center">{title}</h2>
              </div>
            )}
          </div>
        ) : null}
        <div className={`min-h-0 flex-1 overflow-y-auto pb-safe ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="sticky bottom-0 ios-glass-nav ios-list-separator px-4 py-3">{footer}</div>
        )}
      </motion.section>
    </div></OverlayPortal>}</AnimatePresence>
  );
};
