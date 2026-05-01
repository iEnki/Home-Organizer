import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Info, PlusCircle, SendToBack, Wallpaper } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const BedarfsrechnerTapete = () => {
  const { t } = useTranslation(["move", "common"]);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [roomLength, setRoomLength] = useState("");
  const [roomWidth, setRoomWidth] = useState("");
  const [roomHeight, setRoomHeight] = useState("");
  const [rollWidth, setRollWidth] = useState("0.53");
  const [rollLength, setRollLength] = useState("10.05");
  const [rapport, setRapport] = useState("0");
  const [deductionItems, setDeductionItems] = useState([{ id: 1, width: "", height: "", count: "1" }]);
  const [nextDeductionId, setNextDeductionId] = useState(2);
  const [wallPerimeter, setWallPerimeter] = useState(0);
  const [effectiveStripHeight, setEffectiveStripHeight] = useState(0);
  const [stripsPerRoll, setStripsPerRoll] = useState(0);
  const [totalStripsNeeded, setTotalStripsNeeded] = useState(0);
  const [requiredRolls, setRequiredRolls] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [netAreaDisplay, setNetAreaDisplay] = useState(0);

  useEffect(() => {
    const rL = parseFloat(roomLength) || 0;
    const rW = parseFloat(roomWidth) || 0;
    const rH = parseFloat(roomHeight) || 0;
    const rollW = parseFloat(rollWidth) || 0;
    const rollL = parseFloat(rollLength) || 0;
    const rapCm = parseFloat(rapport) || 0;
    const totalDeductedArea = deductionItems.reduce((sum, item) => {
      const itemWidth = parseFloat(item.width) || 0;
      const itemHeight = parseFloat(item.height) || 0;
      const itemCount = parseInt(item.count, 10) || 0;
      return itemWidth > 0 && itemHeight > 0 && itemCount > 0 ? sum + itemWidth * itemHeight * itemCount : sum;
    }, 0);

    if (rL > 0 && rW > 0 && rH > 0 && rollW > 0 && rollL > 0) {
      const perimeter = 2 * (rL + rW);
      const netArea = Math.max(0, perimeter * rH - totalDeductedArea);
      const stripHeight = rH + rapCm / 100;
      const stripsRoll = stripHeight > 0 ? Math.floor(rollL / stripHeight) : 0;
      const stripsTotal = rH > 0 && rollW > 0 ? Math.ceil(netArea / (rollW * rH)) : 0;
      setWallPerimeter(perimeter);
      setNetAreaDisplay(netArea);
      setEffectiveStripHeight(stripHeight);
      setStripsPerRoll(stripsRoll);
      setTotalStripsNeeded(stripsTotal);
      setRequiredRolls(stripsRoll > 0 ? Math.ceil(stripsTotal / stripsRoll) : 0);
    } else {
      setWallPerimeter(0);
      setEffectiveStripHeight(0);
      setStripsPerRoll(0);
      setTotalStripsNeeded(0);
      setRequiredRolls(0);
      setNetAreaDisplay(0);
    }
  }, [roomLength, roomWidth, roomHeight, rollWidth, rollLength, rapport, deductionItems]);

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-blue-400 focus:border-blue-400"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
  }`;
  const labelClass = `block text-sm font-medium mb-1 ${theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"}`;
  const handleDeductionChange = (id, field, value) => setDeductionItems((items) => items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  const addDeductionItem = () => {
    setDeductionItems((items) => [...items, { id: nextDeductionId, width: "", height: "", count: "1" }]);
    setNextDeductionId((prev) => prev + 1);
  };
  const removeDeductionItem = (idToRemove) => setDeductionItems((items) => items.filter((item) => item.id !== idToRemove));

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <Wallpaper size={24} className="mr-2 text-blue-500 dark:text-blue-400" />
          {t("move:calculator.wallpaper.title")}
        </div>
        <button onClick={() => setShowHelp(!showHelp)} className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 dark:hover:text-blue-400 p-1 flex items-center" title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}>
          <Info size={16} className="mr-1" /> {t("move:shared.help")} {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.wallpaper.help.dimensions")}</p>
          <p>{t("move:calculator.wallpaper.help.roll")}</p>
          <p>{t("move:calculator.wallpaper.help.rapport")}</p>
          <p>{t("move:calculator.wallpaper.help.deductions")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field id="tapRoomLength" label={t("move:calculator.common.roomLength")} value={roomLength} setValue={setRoomLength} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 5" />
        <Field id="tapRoomWidth" label={t("move:calculator.common.roomWidth")} value={roomWidth} setValue={setRoomWidth} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 4" />
        <Field id="tapRoomHeight" label={t("move:calculator.common.roomHeight")} value={roomHeight} setValue={setRoomHeight} inputClass={inputClass} labelClass={labelClass} placeholder="z. B. 2.5" />
        <Field id="tapRollWidth" label={t("move:calculator.wallpaper.rollWidth")} value={rollWidth} setValue={setRollWidth} inputClass={inputClass} labelClass={labelClass} />
        <Field id="tapRollLength" label={t("move:calculator.wallpaper.rollLength")} value={rollLength} setValue={setRollLength} inputClass={inputClass} labelClass={labelClass} />
        <Field id="tapRapport" label={t("move:calculator.wallpaper.rapport")} value={rapport} setValue={setRapport} inputClass={inputClass} labelClass={labelClass} placeholder="0" />
      </div>

      <DeductionEditor t={t} items={deductionItems} inputClass={inputClass} onChange={handleDeductionChange} onAdd={addDeductionItem} onRemove={removeDeductionItem} />

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">{t("move:shared.result")}</h3>
        <div className="space-y-2 text-sm">
          <ResultRow label={t("move:calculator.wallpaper.perimeter")} value={`${wallPerimeter.toFixed(2)} m`} />
          <ResultRow label={t("move:calculator.wallpaper.netArea")} value={`${netAreaDisplay.toFixed(2)} m²`} />
          <ResultRow label={t("move:calculator.wallpaper.stripHeight")} value={`${effectiveStripHeight.toFixed(2)} m`} />
          <ResultRow label={t("move:calculator.wallpaper.stripsPerRoll")} value={`${stripsPerRoll} ${t("move:shared.pieceShort")}`} />
          <ResultRow label={t("move:calculator.wallpaper.totalStrips")} value={`${totalStripsNeeded} ${t("move:shared.pieceShort")}`} />
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <ResultRow label={t("move:calculator.wallpaper.requiredRolls")} value={`${requiredRolls} ${t("move:shared.pieceShort")}`} strongClass="font-bold text-blue-500 dark:text-blue-400" />
          {requiredRolls > 0 && (
            <div className="mt-4 text-right">
              <button onClick={() => navigate("/materialplaner", { state: { neuerPosten: { beschreibung: t("move:calculator.common.itemDescriptions.wallpaper"), menge_einheit: `${requiredRolls} ${t("move:shared.rollUnit")}`, status: "Geplant" } } })} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-3 py-1.5 rounded-md shadow flex items-center text-sm ml-auto">
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

function DeductionEditor({ t, items, inputClass, onChange, onAdd, onRemove }) {
  return (
    <div className="mb-6">
      <h3 className="text-md font-medium text-light-text-main dark:text-dark-text-main mb-2">{t("move:calculator.common.deductions")}</h3>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 items-center p-2 border border-gray-200 dark:border-dark-border/50 rounded-md">
          <SmallField id={`tapDeductWidth-${item.id}`} label={t("move:calculator.common.width")} value={item.width} onChange={(value) => onChange(item.id, "width", value)} inputClass={inputClass} placeholder="z. B. 1.2" />
          <SmallField id={`tapDeductHeight-${item.id}`} label={t("move:calculator.common.height")} value={item.height} onChange={(value) => onChange(item.id, "height", value)} inputClass={inputClass} placeholder="z. B. 1.5" />
          <SmallField id={`tapDeductCount-${item.id}`} label={t("move:calculator.common.count")} value={item.count} onChange={(value) => onChange(item.id, "count", value)} inputClass={inputClass} placeholder="1" />
          <div className="sm:col-span-1 flex justify-end self-end pt-3 sm:pt-0">
            {items.length > 1 && <button type="button" onClick={() => onRemove(item.id)} className="text-red-500 hover:text-red-700 text-xs p-1" title={t("move:shared.removeDeduction")}>{t("move:shared.remove")}</button>}
          </div>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="mt-1 text-sm text-light-accent-green dark:text-dark-accent-green hover:opacity-80 dark:hover:opacity-80 flex items-center">
        <PlusCircle size={16} className="mr-1" /> {t("move:shared.addDeduction")}
      </button>
    </div>
  );
}

function SmallField({ id, label, value, onChange, inputClass, placeholder }) {
  return (
    <div className="sm:col-span-1">
      <label htmlFor={id} className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{label}</label>
      <input type="number" id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} py-1`} placeholder={placeholder} />
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

export default BedarfsrechnerTapete;
