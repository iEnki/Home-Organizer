import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Info, PlusCircle, SendToBack, ThermometerSnowflake, Trash2 } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const BedarfsrechnerDaemmstoff = () => {
  const { t } = useTranslation(["move", "common"]);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [areaItems, setAreaItems] = useState([{ id: 1, length: "", width: "" }]);
  const [nextAreaId, setNextAreaId] = useState(2);
  const [packageContent, setPackageContent] = useState("");
  const [wastePercentage, setWastePercentage] = useState("10");
  const [totalArea, setTotalArea] = useState(0);
  const [totalMaterialNeeded, setTotalMaterialNeeded] = useState(0);
  const [requiredPackages, setRequiredPackages] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const currentTotalArea = areaItems.reduce((sum, item) => {
      const itemLength = parseFloat(item.length) || 0;
      const itemWidth = parseFloat(item.width) || 0;
      return itemLength > 0 && itemWidth > 0 ? sum + itemLength * itemWidth : sum;
    }, 0);
    const pkgContent = parseFloat(packageContent) || 0;
    const waste = parseFloat(wastePercentage) || 0;
    setTotalArea(currentTotalArea);
    if (currentTotalArea > 0 && pkgContent > 0) {
      const materialWithWaste = currentTotalArea * (1 + waste / 100);
      setTotalMaterialNeeded(materialWithWaste);
      setRequiredPackages(Math.ceil(materialWithWaste / pkgContent));
    } else {
      setTotalMaterialNeeded(0);
      setRequiredPackages(0);
    }
  }, [areaItems, packageContent, wastePercentage]);

  const handleAreaItemChange = (id, field, value) => {
    setAreaItems((prevItems) => prevItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };
  const addAreaItem = () => {
    setAreaItems((prevItems) => [...prevItems, { id: nextAreaId, length: "", width: "" }]);
    setNextAreaId((prevId) => prevId + 1);
  };
  const removeAreaItem = (idToRemove) => setAreaItems((prevItems) => prevItems.filter((item) => item.id !== idToRemove));

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-sky-400 focus:border-sky-400"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-sky-500 focus:border-sky-500"
  }`;
  const smallInputClass = inputClass.replace("py-2", "py-1").replace("text-sm", "text-xs");
  const labelClass = `block text-sm font-medium mb-1 ${theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"}`;
  const smallLabelClass = `block text-xs font-medium mb-0.5 ${theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"}`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <ThermometerSnowflake size={24} className="mr-2 text-sky-500 dark:text-sky-400" />
          {t("move:calculator.insulation.title")}
        </div>
        <button onClick={() => setShowHelp(!showHelp)} className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-500 dark:hover:text-sky-400 p-1 flex items-center" title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}>
          <Info size={16} className="mr-1" /> {t("move:shared.help")} {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.insulation.help.areas")}</p>
          <p>{t("move:calculator.insulation.help.package")}</p>
          <p>{t("move:calculator.insulation.help.waste")}</p>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <h3 className="text-md font-medium text-light-text-main dark:text-dark-text-main mt-4 mb-2">{t("move:calculator.insulation.areas")}</h3>
        {areaItems.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-2 border border-gray-200 dark:border-dark-border/50 rounded-md">
            <div>
              <label htmlFor={`areaLength-${item.id}`} className={smallLabelClass}>{t("move:calculator.insulation.areaLength", { index: index + 1 })}</label>
              <input type="number" id={`areaLength-${item.id}`} value={item.length} onChange={(e) => handleAreaItemChange(item.id, "length", e.target.value)} className={smallInputClass} placeholder="z. B. 5" />
            </div>
            <div>
              <label htmlFor={`areaWidth-${item.id}`} className={smallLabelClass}>{t("move:calculator.insulation.areaWidth", { index: index + 1 })}</label>
              <input type="number" id={`areaWidth-${item.id}`} value={item.width} onChange={(e) => handleAreaItemChange(item.id, "width", e.target.value)} className={smallInputClass} placeholder="z. B. 4" />
            </div>
            <div className="flex justify-end">
              {areaItems.length > 1 && (
                <button type="button" onClick={() => removeAreaItem(item.id)} className="text-red-500 hover:text-red-700 p-1" title={t("move:calculator.insulation.removeArea")}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={addAreaItem} className="mt-1 text-sm text-light-accent-green dark:text-dark-accent-green hover:opacity-80 dark:hover:opacity-80 flex items-center">
          <PlusCircle size={16} className="mr-1" /> {t("move:calculator.insulation.addArea")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field id="daemmPackageContent" label={t("move:calculator.insulation.packageContent")} value={packageContent} setValue={setPackageContent} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 5.76" />
        <Field id="daemmWaste" label={t("move:calculator.common.waste")} value={wastePercentage} setValue={setWastePercentage} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 10" />
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">{t("move:shared.result")}</h3>
        <div className="space-y-2 text-sm">
          <ResultRow label={t("move:calculator.insulation.totalArea")} value={`${totalArea.toFixed(2)} m²`} />
          <ResultRow label={t("move:calculator.common.materialWithWaste")} value={`${totalMaterialNeeded.toFixed(2)} m²`} />
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <ResultRow label={t("move:calculator.insulation.requiredPackages")} value={`${requiredPackages} ${t("move:shared.pieceShort")}`} strongClass="font-bold text-sky-500 dark:text-sky-400" />
          {requiredPackages > 0 && (
            <div className="mt-4 text-right">
              <button onClick={() => navigate("/materialplaner", { state: { neuerPosten: { beschreibung: t("move:calculator.common.itemDescriptions.insulation"), menge_einheit: `${requiredPackages} ${t("move:shared.packageUnit")}`, status: "Geplant" } } })} className="bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white px-3 py-1.5 rounded-md shadow flex items-center text-sm ml-auto">
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

export default BedarfsrechnerDaemmstoff;
