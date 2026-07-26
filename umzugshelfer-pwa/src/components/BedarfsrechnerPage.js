import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import BedarfsrechnerFarbe from "./BedarfsrechnerFarbe";
import BedarfsrechnerBoden from "./BedarfsrechnerBoden";
import BedarfsrechnerTapete from "./BedarfsrechnerTapete";
import BedarfsrechnerDaemmstoff from "./BedarfsrechnerDaemmstoff";
import RechnerSzenarienManager from "./RechnerSzenarienManager";
import {
  Calculator,
  PaintBucket,
  Layers,
  Wallpaper,
  ThermometerSnowflake,
  BookmarkCheck,
} from "lucide-react";
import { glassModuleClass, glassSurfaceClass } from "./ui/GlassSurface";

const BedarfsrechnerPage = ({ session }) => {
  const { t } = useTranslation(["move"]);
  const [activeCalculator, setActiveCalculator] = useState("farbe");

  const calculatorTypes = [
    { id: "farbe", nameKey: "calculator.types.wallPaint", Icon: PaintBucket },
    { id: "boden", nameKey: "calculator.types.flooring", Icon: Layers },
    { id: "tapete", nameKey: "calculator.types.wallpaper", Icon: Wallpaper },
    { id: "daemmstoff", nameKey: "calculator.types.insulation", Icon: ThermometerSnowflake },
    { id: "szenarien", nameKey: "calculator.types.scenarios", Icon: BookmarkCheck },
  ];

  const renderActiveCalculator = () => {
    switch (activeCalculator) {
      case "farbe":
        return <BedarfsrechnerFarbe />;
      case "boden":
        return <BedarfsrechnerBoden />;
      case "tapete":
        return <BedarfsrechnerTapete />;
      case "daemmstoff":
        return <BedarfsrechnerDaemmstoff />;
      case "szenarien":
        return <RechnerSzenarienManager session={session} />;
      default:
        return <BedarfsrechnerFarbe />;
    }
  };

  return (
    <div className={glassModuleClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Calculator size={22} className="text-primary-500 shrink-0" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">
            {t("move:calculator.title")}
          </h1>
        </div>
        <div className={`${glassSurfaceClass} flex flex-wrap gap-1.5 p-1.5 justify-center`}>
          {calculatorTypes.map((calc) => {
            const isActive = activeCalculator === calc.id;
            return (
              <button
                key={calc.id}
                onClick={() => setActiveCalculator(calc.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-sm font-medium transition-all
                  ${isActive
                    ? "bg-primary-500/10 text-primary-500 border border-primary-500/30"
                    : "border border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                  }`}
              >
                <calc.Icon size={16} />
                {t(`move:${calc.nameKey}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div>{renderActiveCalculator()}</div>
    </div>
  );
};

export default BedarfsrechnerPage;
