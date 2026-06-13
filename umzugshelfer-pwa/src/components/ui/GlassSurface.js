import React from "react";
import { motion, useReducedMotion } from "framer-motion";

export const glassSurfaceClass = "glass-surface rounded-card border border-white/50 bg-white/[0.42] shadow-elevation-1 dark:border-white/[0.12] dark:bg-[#07161d]/30 dark:shadow-[0_18px_60px_rgba(0,0,0,.28)]";
export const glassModuleClass = "home-glass-modern glass-module auto-glass-cards relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8";

export const glassPageVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.045,
    },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
};

export const glassItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
  },
};

export const glassCollapseVariants = {
  hidden: { height: 0, opacity: 0 },
  show: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.16, ease: "easeInOut" },
  },
};

const GlassSurface = React.forwardRef(function GlassSurface({
  as = "section",
  children,
  className = "",
  interactive = true,
  variants = glassItemVariants,
  ...props
}, ref) {
  const reducedMotion = useReducedMotion();
  const Component = motion[as] || motion.section;

  const moveSheen = (event) => {
    if (reducedMotion || !interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--glass-pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--glass-pointer-y", `${event.clientY - rect.top}px`);
  };

  return (
    <Component
      ref={ref}
      variants={reducedMotion ? undefined : variants}
      onMouseMove={moveSheen}
      className={`${glassSurfaceClass} ${interactive ? "glass-hover-card group" : ""} ${className}`}
      {...props}
    >
      {interactive ? <span className="glass-card-sheen" aria-hidden="true" /> : null}
      {children}
    </Component>
  );
});

GlassSurface.displayName = "GlassSurface";

export const GlassModule = React.forwardRef(function GlassModule({
  as = "div",
  children,
  className = "",
  variants = glassPageVariants,
  ...props
}, ref) {
  const reducedMotion = useReducedMotion();
  const Component = motion[as] || motion.div;

  const moveSheen = (event) => {
    if (reducedMotion || event.pointerType === "touch") return;
    const card = event.target.closest?.(
      ".glass-hover-card, .auto-glass-cards .bg-light-card.rounded-card, .auto-glass-cards .bg-light-card.rounded-card-sm",
    );
    if (!card || !event.currentTarget.contains(card) || card.closest(".fixed")) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--glass-pointer-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--glass-pointer-y", `${event.clientY - rect.top}px`);
  };

  return (
    <Component
      ref={ref}
      variants={reducedMotion ? undefined : variants}
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      onPointerMove={moveSheen}
      className={`${glassModuleClass} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
});

GlassModule.displayName = "GlassModule";

export default GlassSurface;
