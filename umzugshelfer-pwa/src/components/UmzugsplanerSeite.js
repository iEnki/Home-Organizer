import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import BedarfsrechnerVolumen from "./BedarfsrechnerVolumen";
import BedarfsrechnerTransportkosten from "./BedarfsrechnerTransportkosten";
import BedarfsrechnerKisten from "./BedarfsrechnerKisten";
import { PackageOpen } from "lucide-react";
import { glassModuleClass } from "./ui/GlassSurface";

const UmzugsplanerSeite = () => {
  const { t } = useTranslation(["move"]);
  const [calculatedVolume, setCalculatedVolume] = useState(0);

  const handleVolumeCalculated = (volume) => {
    setCalculatedVolume(volume);
  };

  return (
    <div className={glassModuleClass}>
      <div className="flex items-center gap-2 min-w-0">
        <PackageOpen size={22} className="text-primary-500 shrink-0" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">
          {t("move:planner.title")}
        </h1>
      </div>

      <BedarfsrechnerVolumen onVolumeCalculated={handleVolumeCalculated} />

      {calculatedVolume > 0 && (
        <div className="pt-4 border-t border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">
            {t("move:planner.basedOnVolume", { volume: calculatedVolume.toFixed(2) })}
          </h2>
        </div>
      )}
      <BedarfsrechnerTransportkosten initialVolume={calculatedVolume} />

      <div className="pt-4 border-t border-light-border dark:border-dark-border">
        <BedarfsrechnerKisten />
      </div>
    </div>
  );
};

export default UmzugsplanerSeite;
