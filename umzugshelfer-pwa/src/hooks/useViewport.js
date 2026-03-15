import { useEffect, useMemo, useState } from "react";

const getWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);

const readCssPx = (variableName) => {
  if (typeof window === "undefined") return 0;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName);
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getViewportState = () => {
  const width = getWidth();
  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    safeAreaBottomPx: readCssPx("--safe-area-bottom"),
    mobileBottomOffsetPx: readCssPx("--mobile-bottom-offset"),
  };
};

export default function useViewport() {
  const [viewport, setViewport] = useState(() => getViewportState());

  useEffect(() => {
    const update = () => setViewport(getViewportState());

    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update, { passive: true });

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return useMemo(() => viewport, [viewport]);
}
