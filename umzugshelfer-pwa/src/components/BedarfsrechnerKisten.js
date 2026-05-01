import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ChevronDown, ChevronUp, Home, Info, Users } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const boxTypes = ["standard", "buecher", "kleider"];

const BedarfsrechnerKisten = () => {
  const { t } = useTranslation(["move", "common"]);
  const { theme } = useTheme();
  const [manualQuantities, setManualQuantities] = useState(
    boxTypes.reduce((acc, id) => {
      acc[id] = "";
      return acc;
    }, {})
  );
  const [numAdults, setNumAdults] = useState("1");
  const [numChildren, setNumChildren] = useState("0");
  const [numRooms, setNumRooms] = useState("2");
  const [totalManualBoxes, setTotalManualBoxes] = useState(0);
  const [estimatedMinBoxes, setEstimatedMinBoxes] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setTotalManualBoxes(
      boxTypes.reduce((sum, id) => sum + (parseInt(manualQuantities[id], 10) || 0), 0)
    );
  }, [manualQuantities]);

  useEffect(() => {
    const adults = parseInt(numAdults, 10) || 0;
    const children = parseInt(numChildren, 10) || 0;
    const rooms = parseInt(numRooms, 10) || 0;
    setEstimatedMinBoxes(adults > 0 || children > 0 || rooms > 0 ? adults * 20 + children * 10 + rooms * 10 + 5 : 0);
  }, [numAdults, numChildren, numRooms]);

  const handleManualQuantityChange = (itemId, value) => {
    setManualQuantities((prev) => ({ ...prev, [itemId]: value.replace(/[^\d]/g, "") }));
  };

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-amber-500 focus:border-amber-500"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-amber-500 focus:border-amber-500"
  }`;
  const labelClass = `block text-sm font-medium mb-1 ${
    theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"
  }`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <Archive size={24} className="mr-2 text-amber-600 dark:text-amber-500" />
          {t("move:calculator.boxes.title")}
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-600 dark:hover:text-amber-500 p-1 flex items-center"
          title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}
        >
          <Info size={16} className="mr-1" /> {t("move:shared.help")}{" "}
          {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.boxes.help.manual")}</p>
          <p>{t("move:calculator.boxes.help.estimate")}</p>
          <p>{t("move:calculator.boxes.help.note")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <section>
          <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
            {t("move:calculator.boxes.manual")}
          </h3>
          <div className="space-y-3">
            {boxTypes.map((boxId) => (
              <div key={boxId}>
                <label htmlFor={boxId} className={labelClass}>
                  {t(`move:calculator.boxes.types.${boxId}.name`)}
                </label>
                <input
                  type="text"
                  id={boxId}
                  value={manualQuantities[boxId]}
                  onChange={(e) => handleManualQuantityChange(boxId, e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  className={inputClass}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
            {t("move:calculator.boxes.estimate")}
          </h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="numAdults" className={labelClass}>
                <Users size={14} className="inline mr-1" />
                {t("move:calculator.boxes.adults")}
              </label>
              <input type="number" id="numAdults" value={numAdults} onChange={(e) => setNumAdults(e.target.value)} className={inputClass} min="0" />
            </div>
            <div>
              <label htmlFor="numChildren" className={labelClass}>
                <Users size={14} className="inline mr-1" />
                {t("move:calculator.boxes.children")}
              </label>
              <input type="number" id="numChildren" value={numChildren} onChange={(e) => setNumChildren(e.target.value)} className={inputClass} min="0" />
            </div>
            <div>
              <label htmlFor="numRooms" className={labelClass}>
                <Home size={14} className="inline mr-1" />
                {t("move:calculator.boxes.rooms")}
              </label>
              <input type="number" id="numRooms" value={numRooms} onChange={(e) => setNumRooms(e.target.value)} className={inputClass} min="0" />
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          {t("move:calculator.boxes.summary")}
        </h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              {t("move:calculator.boxes.manualBoxes")}
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {totalManualBoxes} {t("move:shared.pieceShort")}
            </span>
          </p>
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              {t("move:calculator.boxes.estimatedMin")}
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-500">
              {estimatedMinBoxes} {t("move:shared.pieceShort")}
            </span>
          </p>
          {totalManualBoxes > 0 && estimatedMinBoxes > 0 && (
            <p className="flex justify-between text-xs mt-1">
              <span className="text-light-text-secondary dark:text-dark-text-secondary">
                {t("move:calculator.boxes.difference")}
              </span>
              <span className={`font-semibold ${totalManualBoxes >= estimatedMinBoxes ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                {totalManualBoxes - estimatedMinBoxes} {t("move:shared.pieceShort")}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedarfsrechnerKisten;
