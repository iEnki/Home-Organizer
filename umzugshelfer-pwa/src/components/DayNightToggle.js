import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import "./DayNightToggle.css";

/**
 * Animierter Day/Night Toggle Switch.
 * Vollständig per CSS/SVG umgesetzte Mini-Szene (Himmel, Sonne/Mond, Wolken,
 * Berge, Wald, Sterne, City). Ersetzt den klassischen Sun/Moon-Icon-Button.
 *
 * Bindet an den globalen ThemeContext: theme === "dark" → Nachtszene.
 * Größe steuerbar über `width` (px); abhängige Maße rechnen via CSS-Vars mit.
 */
const STARS = [
  { left: "15%", top: "19%", d: ".2s", big: true },
  { left: "29%", top: "34%", d: ".8s" },
  { left: "44%", top: "18%", d: "1.4s" },
  { left: "58%", top: "30%", d: ".4s", big: true },
  { left: "74%", top: "17%", d: "1.1s" },
  { left: "84%", top: "46%", d: ".6s" },
  { left: "36%", top: "54%", d: "1.8s" },
  { left: "66%", top: "58%", d: "2.1s" },
];

const DayNightToggle = ({ className = "", width = 84 }) => {
  const { t } = useTranslation(["common"]);
  const { theme, toggleTheme } = useTheme();
  const isNight = theme === "dark";
  const uid = useId().replace(/:/g, "");
  const cityBackId = `dnt-${uid}-city-back`;
  const cityFrontId = `dnt-${uid}-city-front`;
  const cityMaskId = `dnt-${uid}-city-mask`;
  const windowGlowId = `dnt-${uid}-window-glow`;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`day-night-toggle ${className}`}
      data-state={isNight ? "night" : "day"}
      aria-pressed={isNight}
      aria-label={isNight ? t("theme.light") : t("theme.dark")}
      title={isNight ? t("theme.light") : t("theme.dark")}
      style={{ "--toggle-w": `${width}px` }}
    >
      <span className="scene" aria-hidden="true">
        <span className="sky day" />
        <span className="sky night" />
        <span className="horizon-light" />
        <span className="dashboard-glow" />
        <span className="neon-lines" />
        <span className="sun-rays" />

        <span className="stars layer">
          {STARS.map((s, i) => (
            <i
              key={i}
              className={s.big ? "star big" : "star"}
              style={{ left: s.left, top: s.top, "--d": s.d }}
            />
          ))}
        </span>

        <span className="clouds layer">
          <span className="cloud c1" />
          <span className="cloud c2" />
          <span className="cloud c3" />
        </span>

        <span className="mountains layer">
          <svg viewBox="0 0 500 120" preserveAspectRatio="none" role="img" aria-label={t("theme.mountains")}>
            <path d="M0 92 L55 43 L92 82 L145 28 L207 96 L258 48 L324 96 L382 35 L500 96 L500 120 L0 120 Z" fill="#b6d8ca" opacity=".70" />
            <path d="M0 104 L48 72 L97 102 L152 60 L217 108 L290 70 L356 107 L421 59 L500 108 L500 120 L0 120 Z" fill="#77c6aa" opacity=".58" />
            <path d="M54 44 L73 63 L40 72 Z M146 29 L166 51 L130 59 Z M383 36 L407 59 L363 65 Z" fill="rgba(255,255,255,.44)" />
          </svg>
        </span>

        <span className="forest layer">
          <svg viewBox="0 0 520 90" preserveAspectRatio="none" role="img" aria-label={t("theme.forest")}>
            <path d="M0 62 C45 50 82 58 123 49 C170 39 218 58 260 48 C312 35 350 60 400 49 C453 38 486 52 520 43 L520 90 L0 90 Z" fill="#79cdb4" opacity=".50" />
            <g fill="#45ad8f" opacity=".42">
              <path d="M22 80 l18 -46 l18 46z" />
              <path d="M54 83 l20 -56 l20 56z" />
              <path d="M98 82 l17 -45 l17 45z" />
              <path d="M136 84 l23 -63 l23 63z" />
              <path d="M198 83 l19 -53 l19 53z" />
              <path d="M240 83 l23 -61 l23 61z" />
              <path d="M304 84 l21 -56 l21 56z" />
              <path d="M354 83 l24 -65 l24 65z" />
              <path d="M424 83 l19 -52 l19 52z" />
              <path d="M468 82 l22 -59 l22 59z" />
            </g>
          </svg>
        </span>

        <span className="city layer">
          <svg viewBox="0 0 520 105" preserveAspectRatio="none" role="img" aria-label={t("theme.smartHomeCity")}>
            <defs>
              <linearGradient id={cityBackId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#123247" />
                <stop offset="1" stopColor="#071522" />
              </linearGradient>
              <linearGradient id={cityFrontId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#09212c" />
                <stop offset="1" stopColor="#020a12" />
              </linearGradient>
              <clipPath id={cityMaskId}>
                <path d="M0 78 H22 V54 H50 V68 H72 V38 H104 V59 H126 V48 H154 V75 H180 V55 H212 V30 H246 V70 H272 V44 H307 V76 H328 V58 H356 V34 H389 V72 H412 V50 H442 V63 H464 V32 H496 V74 H520 V105 H0 Z" />
                <path d="M0 89 H35 V67 H59 V84 H88 V55 H121 V88 H151 V72 H190 V48 H222 V90 H258 V61 H287 V83 H326 V64 H362 V89 H396 V70 H431 V82 H461 V58 H501 V89 H520 V105 H0 Z" />
              </clipPath>
              <filter id={windowGlowId} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path d="M0 78 H22 V54 H50 V68 H72 V38 H104 V59 H126 V48 H154 V75 H180 V55 H212 V30 H246 V70 H272 V44 H307 V76 H328 V58 H356 V34 H389 V72 H412 V50 H442 V63 H464 V32 H496 V74 H520 V105 H0 Z" fill={`url(#${cityBackId})`} opacity=".96" />
            <path d="M0 89 H35 V67 H59 V84 H88 V55 H121 V88 H151 V72 H190 V48 H222 V90 H258 V61 H287 V83 H326 V64 H362 V89 H396 V70 H431 V82 H461 V58 H501 V89 H520 V105 H0 Z" fill={`url(#${cityFrontId})`} opacity=".98" />
            <g opacity=".52" strokeLinecap="square">
              <path d="M72 38 V105 M180 55 V105 M272 44 V105 M356 34 V105 M464 32 V105" stroke="#23d9ff" strokeWidth="1" opacity=".55" />
              <path d="M50 68 H72 M154 75 H180 M246 70 H272 M389 72 H412 M442 63 H464" stroke="#20e0b0" strokeWidth="1" opacity=".48" />
            </g>
            <g clipPath={`url(#${cityMaskId})`} filter={`url(#${windowGlowId})`}>
              <g fill="#23d9ff" opacity=".9">
                <rect x="80" y="60" width="6" height="7" />
                <rect x="94" y="60" width="6" height="7" />
                <rect x="80" y="75" width="6" height="7" />
                <rect x="196" y="56" width="6" height="7" />
                <rect x="210" y="56" width="6" height="7" />
                <rect x="196" y="72" width="6" height="7" />
                <rect x="334" y="70" width="6" height="7" />
                <rect x="348" y="70" width="6" height="7" />
                <rect x="470" y="62" width="6" height="7" />
                <rect x="484" y="62" width="6" height="7" />
                <rect x="470" y="78" width="6" height="7" />
              </g>
              <g fill="#20e0b0" opacity=".82">
                <rect x="265" y="68" width="6" height="7" />
                <rect x="279" y="68" width="6" height="7" />
                <rect x="265" y="81" width="6" height="7" />
                <rect x="404" y="74" width="6" height="7" />
                <rect x="418" y="74" width="6" height="7" />
              </g>
              <g fill="#ffb347" opacity=".88">
                <rect x="94" y="76" width="6" height="7" />
                <rect x="210" y="72" width="6" height="7" />
                <rect x="484" y="78" width="6" height="7" />
              </g>
            </g>
            <path d="M0 94 H520 V105 H0 Z" fill="#02070d" opacity=".84" />
          </svg>
        </span>

        <span className="knob">
          <span className="crater one" />
          <span className="crater two" />
          <span className="crater three" />
          <span className="crater four" />
          <span className="knob-shine" />
        </span>
      </span>
    </button>
  );
};

export default DayNightToggle;
