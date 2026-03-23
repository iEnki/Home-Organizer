import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // useNavigate importieren
import {
  PaintBucket,
  Info,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  SendToBack, // Icon für den Button
} from "lucide-react"; // PlusCircle hinzugefügt
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const BedarfsrechnerFarbe = () => {
  const navigate = useNavigate(); // useNavigate hook
  const { theme } = useTheme(); // Theme aus Context holen

  // NEU: Modus für Flächenberechnung (zimmer/wand)
  const [modus, setModus] = useState("zimmer");
  const [wandBreite, setWandBreite] = useState("");
  const [wandHoehe, setWandHoehe] = useState("");

  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [coats, setCoats] = useState("2"); // Standard 2 Anstriche
  const [coverage, setCoverage] = useState("7"); // Standard 7 m²/L Ergiebigkeit
  // const [deductArea, setDeductArea] = useState("0"); // Entfernt, wird durch deductionItems ersetzt

  const [deductionItems, setDeductionItems] = useState([
    { id: 1, width: "", height: "", count: "1" },
  ]);
  const [nextDeductionId, setNextDeductionId] = useState(2);

  const [wallArea, setWallArea] = useState(0);
  const [paintableArea, setPaintableArea] = useState(0);
  const [requiredPaint, setRequiredPaint] = useState(0);
  const [showHelp, setShowHelp] = useState(false); // State für Hilfe-Sektion

  useEffect(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const numCoats = parseInt(coats, 10) || 0;
    const covPerLiter = parseFloat(coverage) || 0;

    let totalDeductedArea = 0;
    deductionItems.forEach((item) => {
      const itemWidth = parseFloat(item.width) || 0;
      const itemHeight = parseFloat(item.height) || 0;
      const itemCount = parseInt(item.count, 10) || 0;
      if (itemWidth > 0 && itemHeight > 0 && itemCount > 0) {
        totalDeductedArea += itemWidth * itemHeight * itemCount;
      }
    });

    if (modus === "wand") {
      const b = parseFloat(wandBreite) || 0;
      const hWand = parseFloat(wandHoehe) || 0;
      if (b > 0 && hWand > 0 && numCoats > 0 && covPerLiter > 0) {
        const wandFlaeche = b * hWand;
        setWallArea(wandFlaeche);
        const paintable = Math.max(0, wandFlaeche - totalDeductedArea);
        setPaintableArea(paintable);
        setRequiredPaint((paintable * numCoats) / covPerLiter);
      } else {
        setWallArea(0);
        setPaintableArea(0);
        setRequiredPaint(0);
      }
    } else {
      if (l > 0 && w > 0 && h > 0 && numCoats > 0 && covPerLiter > 0) {
        const calculatedWallArea = 2 * (l + w) * h;
        setWallArea(calculatedWallArea);

        const calculatedPaintableArea = Math.max(
          0,
          calculatedWallArea - totalDeductedArea
        );
        setPaintableArea(calculatedPaintableArea);

        const calculatedRequiredPaint =
          (calculatedPaintableArea * numCoats) / covPerLiter;
        setRequiredPaint(calculatedRequiredPaint);
      } else {
        setWallArea(0);
        setPaintableArea(0);
        setRequiredPaint(0);
      }
    }
  }, [
    modus,
    length,
    width,
    height,
    coats,
    coverage,
    deductionItems,
    wandBreite,
    wandHoehe,
  ]);

  const handleDeductionChange = (id, field, value) => {
    setDeductionItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addDeductionItem = () => {
    setDeductionItems((prevItems) => [
      ...prevItems,
      { id: nextDeductionId, width: "", height: "", count: "1" },
    ]);
    setNextDeductionId((prevId) => prevId + 1);
  };

  const removeDeductionItem = (idToRemove) => {
    setDeductionItems((prevItems) =>
      prevItems.filter((item) => item.id !== idToRemove)
    );
  };

  const baseInputClass =
    "w-full px-3 py-2 border rounded-md text-sm focus:ring-1";
  const lightInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-light-accent-green focus:border-light-accent-green";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green";
  const inputClass = `${baseInputClass} ${
    theme === "dark" ? darkInputClass : lightInputClass
  }`;

  const baseLabelClass = "block text-sm font-medium mb-1";
  const lightLabelClass = "text-gray-700";
  const darkLabelClass = "text-dark-text-secondary";
  const labelClass = `${baseLabelClass} ${
    theme === "dark" ? darkLabelClass : lightLabelClass
  }`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <PaintBucket
            size={24}
            className="mr-2 text-light-accent-green dark:text-dark-accent-green"
          />
          Bedarfsrechner für Wandfarbe
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-green dark:hover:text-dark-accent-green p-1 flex items-center"
          title={showHelp ? "Hilfe ausblenden" : "Hilfe anzeigen"}
        >
          <Info size={16} className="mr-1" /> Hilfe{" "}
          {showHelp ? (
            <ChevronUp size={16} className="ml-1" />
          ) : (
            <ChevronDown size={16} className="ml-1" />
          )}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>
            <strong>Raummaße:</strong> Geben Sie die Länge, Breite und Höhe des
            Raumes in Metern an.
          </p>
          <p>
            <strong>Anstriche:</strong> Üblicherweise sind 2 Anstriche für eine
            gute Deckkraft nötig.
          </p>
          <p>
            <strong>Ergiebigkeit:</strong> Finden Sie diesen Wert (m² pro Liter)
            auf dem Farbeimer. Ein typischer Wert ist 7 m²/L.
          </p>
          <p>
            <strong>Abzugsflächen:</strong> Fügen Sie Flächen hinzu, die nicht
            gestrichen werden (Fenster, Türen etc.). Geben Sie Breite, Höhe und
            Anzahl an.
          </p>
        </div>
      )}

      {/* Modus-Umschalter: Zimmer oder Wand */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <span className="font-medium text-light-text-main dark:text-dark-text-main">
          Fläche berechnen für:
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModus("zimmer")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border
              ${
                modus === "zimmer"
                  ? "bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg border-light-accent-green dark:border-dark-accent-green shadow"
                  : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:bg-gray-200 dark:hover:bg-gray-700"
              }
            `}
            aria-pressed={modus === "zimmer"}
          >
            Zimmer (alle Wände)
          </button>
          <button
            type="button"
            onClick={() => setModus("wand")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border
              ${
                modus === "wand"
                  ? "bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg border-light-accent-green dark:border-dark-accent-green shadow"
                  : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:bg-gray-200 dark:hover:bg-gray-700"
              }
            `}
            aria-pressed={modus === "wand"}
          >
            Einzelne Wand
          </button>
        </div>
      </div>

      {/* Eingabefelder für Zimmer oder Wand */}
      {modus === "zimmer" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="length" className={labelClass}>
              Raumlänge (m)
            </label>
            <input
              type="number"
              id="length"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className={inputClass}
              placeholder="z.B. 5"
            />
          </div>
          <div>
            <label htmlFor="width" className={labelClass}>
              Raumbreite (m)
            </label>
            <input
              type="number"
              id="width"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={inputClass}
              placeholder="z.B. 4"
            />
          </div>
          <div>
            <label htmlFor="height" className={labelClass}>
              Raumhöhe (m)
            </label>
            <input
              type="number"
              id="height"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={inputClass}
              placeholder="z.B. 2.5"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="wandBreite" className={labelClass}>
              Wandbreite (m)
            </label>
            <input
              type="number"
              id="wandBreite"
              value={wandBreite}
              onChange={(e) => setWandBreite(e.target.value)}
              className={inputClass}
              placeholder="z.B. 3.5"
            />
          </div>
          <div>
            <label htmlFor="wandHoehe" className={labelClass}>
              Wandhöhe (m)
            </label>
            <input
              type="number"
              id="wandHoehe"
              value={wandHoehe}
              onChange={(e) => setWandHoehe(e.target.value)}
              className={inputClass}
              placeholder="z.B. 2.5"
            />
          </div>
        </div>
      )}

      {/* Restliche Felder (Anstriche, Ergiebigkeit) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="coats" className={labelClass}>
            Anzahl Anstriche
          </label>
          <input
            type="number"
            id="coats"
            value={coats}
            onChange={(e) => setCoats(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="coverage" className={labelClass}>
            Ergiebigkeit (m²/Liter)
          </label>
          <input
            type="number"
            id="coverage"
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
            className={inputClass}
            placeholder="z.B. 7"
          />
        </div>
      </div>

      {/* Abzugsflächen Sektion */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-light-text-main dark:text-dark-text-main mb-2">
          Abzugsflächen (Fenster, Türen etc.)
        </h3>
        {deductionItems.map((item, index) => (
          <div
            key={item.id}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 items-center p-2 border border-gray-200 dark:border-dark-border/50 rounded-md"
          >
            <div className="sm:col-span-1">
              <label
                htmlFor={`deductWidth-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Breite (m)
              </label>
              <input
                type="number"
                id={`deductWidth-${item.id}`}
                value={item.width}
                onChange={(e) =>
                  handleDeductionChange(item.id, "width", e.target.value)
                }
                className={inputClass + " py-1"}
                placeholder="z.B. 1.2"
              />
            </div>
            <div className="sm:col-span-1">
              <label
                htmlFor={`deductHeight-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Höhe (m)
              </label>
              <input
                type="number"
                id={`deductHeight-${item.id}`}
                value={item.height}
                onChange={(e) =>
                  handleDeductionChange(item.id, "height", e.target.value)
                }
                className={inputClass + " py-1"}
                placeholder="z.B. 1.5"
              />
            </div>
            <div className="sm:col-span-1">
              <label
                htmlFor={`deductCount-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Anzahl
              </label>
              <input
                type="number"
                id={`deductCount-${item.id}`}
                value={item.count}
                onChange={(e) =>
                  handleDeductionChange(item.id, "count", e.target.value)
                }
                className={inputClass + " py-1"}
                placeholder="1"
              />
            </div>
            <div className="sm:col-span-1 flex justify-end self-end pt-3 sm:pt-0">
              {deductionItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDeductionItem(item.id)}
                  className="text-red-500 hover:text-red-700 text-xs p-1"
                  title="Abzug entfernen"
                >
                  Entfernen
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addDeductionItem}
          className="mt-1 text-sm text-light-accent-green dark:text-dark-accent-green hover:opacity-80 dark:hover:opacity-80 flex items-center"
        >
          <PlusCircle size={16} className="mr-1" /> Weitere Abzugsfläche
          hinzufügen
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          Ergebnis:
        </h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Gesamte Wandfläche (ohne Abzüge):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {wallArea.toFixed(2)} m²
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Zu streichende Fläche (nach Abzügen):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {paintableArea.toFixed(2)} m²
            </span>
          </p>
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Benötigte Farbmenge:
            </span>
            <span className="font-bold text-light-accent-green dark:text-dark-accent-green">
              {requiredPaint.toFixed(2)} Liter
            </span>
          </p>
          {requiredPaint > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => {
                  navigate("/materialplaner", {
                    state: {
                      neuerPosten: {
                        beschreibung: "Wandfarbe",
                        menge_einheit: `${requiredPaint.toFixed(2)} Liter`,
                        status: "Geplant",
                      },
                    },
                  });
                }}
                className="bg-light-accent-purple dark:bg-dark-accent-purple text-white px-3 py-1.5 rounded-md shadow hover:opacity-90 flex items-center text-sm ml-auto"
              >
                <SendToBack size={16} className="mr-2" />
                Zum Materialplaner
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedarfsrechnerFarbe;
