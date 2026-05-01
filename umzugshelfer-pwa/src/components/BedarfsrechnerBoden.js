import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Info, Layers, SendToBack } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const BedarfsrechnerBoden = () => {
  const { t } = useTranslation(["move", "common"]);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [roomLength, setRoomLength] = useState("");
  const [roomWidth, setRoomWidth] = useState("");
  const [packageContent, setPackageContent] = useState("");
  const [wastePercentage, setWastePercentage] = useState("10");
  const [packagePrice, setPackagePrice] = useState("");
  const [roomArea, setRoomArea] = useState(0);
  const [totalMaterialNeeded, setTotalMaterialNeeded] = useState(0);
  const [requiredPackages, setRequiredPackages] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const length = parseFloat(roomLength) || 0;
    const width = parseFloat(roomWidth) || 0;
    const pkgContent = parseFloat(packageContent) || 0;
    const waste = parseFloat(wastePercentage) || 0;
    const pkgPrice = parseFloat(packagePrice) || 0;
    if (length > 0 && width > 0 && pkgContent > 0) {
      const area = length * width;
      const materialWithWaste = area * (1 + waste / 100);
      const packages = Math.ceil(materialWithWaste / pkgContent);
      setRoomArea(area);
      setTotalMaterialNeeded(materialWithWaste);
      setRequiredPackages(packages);
      setTotalCost(pkgPrice > 0 ? packages * pkgPrice : 0);
    } else {
      setRoomArea(0);
      setTotalMaterialNeeded(0);
      setRequiredPackages(0);
      setTotalCost(0);
    }
  }, [roomLength, roomWidth, packageContent, wastePercentage, packagePrice]);

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-purple focus:border-dark-accent-purple"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-light-accent-purple focus:border-light-accent-purple"
  }`;
  const labelClass = `block text-sm font-medium mb-1 ${theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"}`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <Layers size={24} className="mr-2 text-light-accent-purple dark:text-dark-accent-purple" />
          {t("move:calculator.floor.title")}
        </div>
        <button onClick={() => setShowHelp(!showHelp)} className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-purple dark:hover:text-dark-accent-purple p-1 flex items-center" title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}>
          <Info size={16} className="mr-1" /> {t("move:shared.help")} {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.floor.help.dimensions")}</p>
          <p>{t("move:calculator.floor.help.package")}</p>
          <p>{t("move:calculator.floor.help.waste")}</p>
          <p>{t("move:calculator.floor.help.price")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field id="floorRoomLength" label={t("move:calculator.common.roomLength")} value={roomLength} setValue={setRoomLength} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 5" />
        <Field id="floorRoomWidth" label={t("move:calculator.common.roomWidth")} value={roomWidth} setValue={setRoomWidth} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 4" />
        <Field id="floorPackageContent" label={t("move:calculator.common.packageContent")} value={packageContent} setValue={setPackageContent} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 2.5" />
        <Field id="floorWaste" label={t("move:calculator.common.waste")} value={wastePercentage} setValue={setWastePercentage} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 10" />
        <Field id="floorPackagePrice" label={t("move:calculator.floor.packagePrice")} value={packagePrice} setValue={setPackagePrice} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 25.99" />
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">{t("move:shared.result")}</h3>
        <div className="space-y-2 text-sm">
          <ResultRow label={t("move:calculator.common.roomArea")} value={`${roomArea.toFixed(2)} m²`} />
          <ResultRow label={t("move:calculator.common.materialWithWaste")} value={`${totalMaterialNeeded.toFixed(2)} m²`} />
          <ResultRow label={t("move:calculator.common.requiredPackages")} value={`${requiredPackages} ${t("move:shared.pieceShort")}`} strongClass="font-bold text-light-accent-purple dark:text-dark-accent-purple" />
          {parseFloat(packagePrice) > 0 && (
            <>
              <hr className="border-gray-200 dark:border-dark-border my-2" />
              <ResultRow label={t("move:calculator.common.estimatedCosts")} value={`${totalCost.toFixed(2)} €`} strongClass="font-bold text-light-accent-purple dark:text-dark-accent-purple" />
            </>
          )}
          {requiredPackages > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => navigate("/materialplaner", { state: { neuerPosten: { beschreibung: t("move:calculator.common.itemDescriptions.flooring"), menge_einheit: `${requiredPackages} ${t("move:shared.packageUnit")}`, geschaetzter_preis: parseFloat(packagePrice) > 0 ? totalCost : null, status: "Geplant" } } })}
                className="bg-light-accent-purple dark:bg-dark-accent-purple text-white px-3 py-1.5 rounded-md shadow hover:opacity-90 flex items-center text-sm ml-auto"
              >
                <SendToBack size={16} className="mr-2" />
                {t("move:shared.toMaterials")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Field({ id, label, value, setValue, inputClass, labelClass, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input type="number" id={id} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} placeholder={placeholder} />
    </div>
  );
}

function ResultRow({ label, value, strongClass = "font-semibold text-light-text-main dark:text-dark-text-main" }) {
  return (
    <p className="flex justify-between">
      <span className="text-light-text-secondary dark:text-dark-text-secondary">{label}</span>
      <span className={strongClass}>{value}</span>
    </p>
  );
}

export default BedarfsrechnerBoden;
