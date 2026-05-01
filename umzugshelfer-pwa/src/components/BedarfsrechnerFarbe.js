import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Info, PaintBucket, PlusCircle, SendToBack } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const BedarfsrechnerFarbe = () => {
  const { t } = useTranslation(["move", "common"]);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [modus, setModus] = useState("zimmer");
  const [wandBreite, setWandBreite] = useState("");
  const [wandHoehe, setWandHoehe] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [coats, setCoats] = useState("2");
  const [coverage, setCoverage] = useState("7");
  const [deductionItems, setDeductionItems] = useState([{ id: 1, width: "", height: "", count: "1" }]);
  const [nextDeductionId, setNextDeductionId] = useState(2);
  const [wallArea, setWallArea] = useState(0);
  const [paintableArea, setPaintableArea] = useState(0);
  const [requiredPaint, setRequiredPaint] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const numCoats = parseInt(coats, 10) || 0;
    const covPerLiter = parseFloat(coverage) || 0;
    const totalDeductedArea = deductionItems.reduce((sum, item) => {
      const itemWidth = parseFloat(item.width) || 0;
      const itemHeight = parseFloat(item.height) || 0;
      const itemCount = parseInt(item.count, 10) || 0;
      return itemWidth > 0 && itemHeight > 0 && itemCount > 0 ? sum + itemWidth * itemHeight * itemCount : sum;
    }, 0);
    const grossArea =
      modus === "wand"
        ? (parseFloat(wandBreite) || 0) * (parseFloat(wandHoehe) || 0)
        : 2 * ((parseFloat(length) || 0) + (parseFloat(width) || 0)) * (parseFloat(height) || 0);
    const paintable = grossArea > 0 ? Math.max(0, grossArea - totalDeductedArea) : 0;
    setWallArea(grossArea);
    setPaintableArea(paintable);
    setRequiredPaint(paintable > 0 && numCoats > 0 && covPerLiter > 0 ? (paintable * numCoats) / covPerLiter : 0);
  }, [modus, length, width, height, coats, coverage, deductionItems, wandBreite, wandHoehe]);

  const handleDeductionChange = (id, field, value) => {
    setDeductionItems((prevItems) => prevItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };
  const addDeductionItem = () => {
    setDeductionItems((prevItems) => [...prevItems, { id: nextDeductionId, width: "", height: "", count: "1" }]);
    setNextDeductionId((prevId) => prevId + 1);
  };
  const removeDeductionItem = (idToRemove) => {
    setDeductionItems((prevItems) => prevItems.filter((item) => item.id !== idToRemove));
  };

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-light-accent-green focus:border-light-accent-green"
  }`;
  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <PaintBucket size={24} className="mr-2 text-light-accent-green dark:text-dark-accent-green" />
          {t("move:calculator.paint.title")}
        </div>
        <button onClick={() => setShowHelp(!showHelp)} className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-green dark:hover:text-dark-accent-green p-1 flex items-center" title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}>
          <Info size={16} className="mr-1" /> {t("move:shared.help")} {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.paint.help.dimensions")}</p>
          <p>{t("move:calculator.paint.help.coats")}</p>
          <p>{t("move:calculator.paint.help.coverage")}</p>
          <p>{t("move:calculator.paint.help.deductions")}</p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <span className="font-medium text-light-text-main dark:text-dark-text-main">{t("move:calculator.paint.modeLabel")}</span>
        <div className="flex gap-2">
          {[
            ["zimmer", t("move:calculator.paint.wholeRoom")],
            ["wand", t("move:calculator.paint.singleWall")],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setModus(mode)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                modus === mode
                  ? "bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg border-light-accent-green dark:border-dark-accent-green shadow"
                  : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              aria-pressed={modus === mode}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {modus === "zimmer" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Field id="length" label={t("move:calculator.common.roomLength")} value={length} setValue={setLength} inputClass={inputClass} placeholder="z. B. 5" />
          <Field id="width" label={t("move:calculator.common.roomWidth")} value={width} setValue={setWidth} inputClass={inputClass} placeholder="z. B. 4" />
          <Field id="height" label={t("move:calculator.common.roomHeight")} value={height} setValue={setHeight} inputClass={inputClass} placeholder="z. B. 2.5" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Field id="wandBreite" label={t("move:calculator.common.wallWidth")} value={wandBreite} setValue={setWandBreite} inputClass={inputClass} placeholder="z. B. 3.5" />
          <Field id="wandHoehe" label={t("move:calculator.common.wallHeight")} value={wandHoehe} setValue={setWandHoehe} inputClass={inputClass} placeholder="z. B. 2.5" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field id="coats" label={t("move:calculator.paint.coats")} value={coats} setValue={setCoats} inputClass={inputClass} />
        <Field id="coverage" label={t("move:calculator.paint.coverage")} value={coverage} setValue={setCoverage} inputClass={inputClass} placeholder="z. B. 7" />
      </div>

      <DeductionEditor
        t={t}
        items={deductionItems}
        inputClass={inputClass}
        onChange={handleDeductionChange}
        onAdd={addDeductionItem}
        onRemove={removeDeductionItem}
      />

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">{t("move:shared.result")}</h3>
        <div className="space-y-2 text-sm">
          <ResultRow label={t("move:calculator.paint.wallAreaGross")} value={`${wallArea.toFixed(2)} m²`} />
          <ResultRow label={t("move:calculator.paint.paintableArea")} value={`${paintableArea.toFixed(2)} m²`} />
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <ResultRow label={t("move:calculator.paint.requiredPaint")} value={`${requiredPaint.toFixed(2)} Liter`} strongClass="font-bold text-light-accent-green dark:text-dark-accent-green" />
          {requiredPaint > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => navigate("/materialplaner", { state: { neuerPosten: { beschreibung: t("move:calculator.common.itemDescriptions.wallPaint"), menge_einheit: `${requiredPaint.toFixed(2)} Liter`, status: "Geplant" } } })}
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

function Field({ id, label, value, setValue, inputClass, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1 text-gray-700 dark:text-dark-text-secondary">{label}</label>
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
          <SmallField id={`deductWidth-${item.id}`} label={t("move:calculator.common.width")} value={item.width} onChange={(value) => onChange(item.id, "width", value)} inputClass={inputClass} placeholder="z. B. 1.2" />
          <SmallField id={`deductHeight-${item.id}`} label={t("move:calculator.common.height")} value={item.height} onChange={(value) => onChange(item.id, "height", value)} inputClass={inputClass} placeholder="z. B. 1.5" />
          <SmallField id={`deductCount-${item.id}`} label={t("move:calculator.common.count")} value={item.count} onChange={(value) => onChange(item.id, "count", value)} inputClass={inputClass} placeholder="1" />
          <div className="sm:col-span-1 flex justify-end self-end pt-3 sm:pt-0">
            {items.length > 1 && (
              <button type="button" onClick={() => onRemove(item.id)} className="text-red-500 hover:text-red-700 text-xs p-1" title={t("move:shared.removeDeduction")}>
                {t("move:shared.remove")}
              </button>
            )}
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

export default BedarfsrechnerFarbe;
