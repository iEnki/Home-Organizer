import React, { useState, useEffect } from "react"; // useCallback entfernt
import { useNavigate } from "react-router-dom";
import {
  Wallpaper,
  SendToBack,
  Info,
  ChevronDown,
  ChevronUp,
  PlusCircle, // Wird für Abzugsflächen benötigt
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const BedarfsrechnerTapete = () => {
  const navigate = useNavigate();
  const { theme } = useTheme(); // Theme aus Context holen
  const [roomLength, setRoomLength] = useState("");
  const [roomWidth, setRoomWidth] = useState("");
  const [roomHeight, setRoomHeight] = useState("");
  const [rollWidth, setRollWidth] = useState("0.53"); // Eurorolle Standard
  const [rollLength, setRollLength] = useState("10.05"); // Eurorolle Standard
  const [rapport, setRapport] = useState("0"); // cm

  // Detaillierte Abzugsflächen, analog zu BedarfsrechnerFarbe.js
  const [deductionItems, setDeductionItems] = useState([
    { id: 1, width: "", height: "", count: "1" },
  ]);
  const [nextDeductionId, setNextDeductionId] = useState(2);

  const [wallPerimeter, setWallPerimeter] = useState(0);
  const [effectiveStripHeight, setEffectiveStripHeight] = useState(0);
  const [stripsPerRoll, setStripsPerRoll] = useState(0);
  const [totalStripsNeeded, setTotalStripsNeeded] = useState(0);
  const [requiredRolls, setRequiredRolls] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [netAreaDisplay, setNetAreaDisplay] = useState(0); // Für die Anzeige der Nettofläche

  useEffect(() => {
    const rL = parseFloat(roomLength) || 0;
    const rW = parseFloat(roomWidth) || 0;
    const rH = parseFloat(roomHeight) || 0;
    const rollW = parseFloat(rollWidth) || 0;
    const rollL = parseFloat(rollLength) || 0;
    const rapCm = parseFloat(rapport) || 0;

    let totalDeductedArea = 0;
    deductionItems.forEach((item) => {
      const itemWidth = parseFloat(item.width) || 0;
      const itemHeight = parseFloat(item.height) || 0;
      const itemCount = parseInt(item.count, 10) || 0;
      if (itemWidth > 0 && itemHeight > 0 && itemCount > 0) {
        totalDeductedArea += itemWidth * itemHeight * itemCount;
      }
    });

    if (rL > 0 && rW > 0 && rH > 0 && rollW > 0 && rollL > 0) {
      const perimeter = 2 * (rL + rW);
      setWallPerimeter(perimeter);

      const grossWallArea = perimeter * rH;
      const netAreaToWallpaper = Math.max(0, grossWallArea - totalDeductedArea);
      setNetAreaDisplay(netAreaToWallpaper);

      const rapM = rapCm / 100;
      const effStripH = rH + rapM;
      setEffectiveStripHeight(effStripH);

      if (effStripH > 0) {
        const stripsPR = Math.floor(rollL / effStripH);
        setStripsPerRoll(stripsPR);

        let calculatedTotalStrips = 0;
        if (rH > 0 && rollW > 0) {
          // Anzahl Bahnen basierend auf der Nettofläche und einfacher Raumhöhe
          // Dies bleibt eine Annäherung, da die genaue Platzierung der Abzüge die Bahnenaufteilung beeinflusst.
          calculatedTotalStrips = Math.ceil(netAreaToWallpaper / (rollW * rH));
        }
        setTotalStripsNeeded(calculatedTotalStrips);

        if (stripsPR > 0) {
          setRequiredRolls(Math.ceil(calculatedTotalStrips / stripsPR));
        } else {
          setRequiredRolls(0);
        }
      } else {
        setStripsPerRoll(0);
        setTotalStripsNeeded(0);
        setRequiredRolls(0);
      }
    } else {
      setWallPerimeter(0);
      setEffectiveStripHeight(0);
      setStripsPerRoll(0);
      setTotalStripsNeeded(0);
      setRequiredRolls(0);
      setNetAreaDisplay(0);
    }
  }, [
    roomLength,
    roomWidth,
    roomHeight,
    rollWidth,
    rollLength,
    rapport,
    deductionItems,
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
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-blue-400 focus:border-blue-400";
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
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <Wallpaper
            size={24}
            className="mr-2 text-blue-500 dark:text-blue-400"
          />
          Bedarfsrechner für Tapeten
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 dark:hover:text-blue-400 p-1 flex items-center"
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
            <strong>Raummaße:</strong> Länge, Breite und Höhe des Raumes in
            Metern.
          </p>
          <p>
            <strong>Rollenmaße:</strong> Breite und Länge einer einzelnen
            Tapetenrolle (Standard Eurorolle: 0.53m x 10.05m).
          </p>
          <p>
            <strong>Rapport/Versatz (cm):</strong> Angabe auf der Tapete. Bei
            ansatzfreier Tapete 0 eingeben. Der Rapport wird zur Bahnenhöhe
            addiert.
          </p>
          <p>
            <strong>Abzugsflächen:</strong> Fügen Sie Flächen hinzu, die nicht
            tapeziert werden (Fenster, Türen etc.). Die berechnete
            Gesamt-Abzugsfläche wird von der Wandfläche subtrahiert, bevor die
            Bahnenanzahl geschätzt wird.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="tapRoomLength" className={labelClass}>
            Raumlänge (m)
          </label>
          <input
            type="number"
            id="tapRoomLength"
            value={roomLength}
            onChange={(e) => setRoomLength(e.target.value)}
            className={inputClass}
            placeholder="z.B. 5"
          />
        </div>
        <div>
          <label htmlFor="tapRoomWidth" className={labelClass}>
            Raumbreite (m)
          </label>
          <input
            type="number"
            id="tapRoomWidth"
            value={roomWidth}
            onChange={(e) => setRoomWidth(e.target.value)}
            className={inputClass}
            placeholder="z.B. 4"
          />
        </div>
        <div>
          <label htmlFor="tapRoomHeight" className={labelClass}>
            Raumhöhe (m)
          </label>
          <input
            type="number"
            id="tapRoomHeight"
            value={roomHeight}
            onChange={(e) => setRoomHeight(e.target.value)}
            className={inputClass}
            placeholder="z.B. 2.5"
          />
        </div>
        <div>
          <label htmlFor="tapRollWidth" className={labelClass}>
            Rollenbreite (m)
          </label>
          <input
            type="number"
            id="tapRollWidth"
            value={rollWidth}
            onChange={(e) => setRollWidth(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="tapRollLength" className={labelClass}>
            Rollenlänge (m)
          </label>
          <input
            type="number"
            id="tapRollLength"
            value={rollLength}
            onChange={(e) => setRollLength(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="tapRapport" className={labelClass}>
            Rapport/Versatz (cm)
          </label>
          <input
            type="number"
            id="tapRapport"
            value={rapport}
            onChange={(e) => setRapport(e.target.value)}
            className={inputClass}
            placeholder="0"
          />
        </div>
      </div>

      {/* Abzugsflächen Sektion - analog zu BedarfsrechnerFarbe */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-light-text-main dark:text-dark-text-main mb-2">
          Abzugsflächen (Fenster, Türen etc.)
        </h3>
        {deductionItems.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 items-center p-2 border border-gray-200 dark:border-dark-border/50 rounded-md"
          >
            <div className="sm:col-span-1">
              <label
                htmlFor={`tapDeductWidth-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Breite (m)
              </label>
              <input
                type="number"
                id={`tapDeductWidth-${item.id}`}
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
                htmlFor={`tapDeductHeight-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Höhe (m)
              </label>
              <input
                type="number"
                id={`tapDeductHeight-${item.id}`}
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
                htmlFor={`tapDeductCount-${item.id}`}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
              >
                Anzahl
              </label>
              <input
                type="number"
                id={`tapDeductCount-${item.id}`}
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
              Raumumfang:
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {wallPerimeter.toFixed(2)} m
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Zu tapezierende Fläche (ca.):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {netAreaDisplay.toFixed(2)} m²
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Effektive Bahnenhöhe (inkl. Rapport):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {effectiveStripHeight.toFixed(2)} m
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Ganze Bahnen pro Rolle:
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {stripsPerRoll} Stk.
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Benötigte Bahnen insgesamt (ca.):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {totalStripsNeeded} Stk.
            </span>
          </p>
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Benötigte Rollen (ca.):
            </span>
            <span className="font-bold text-blue-500 dark:text-blue-400">
              {requiredRolls} Stk.
            </span>
          </p>
          {requiredRolls > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => {
                  navigate("/materialplaner", {
                    state: {
                      neuerPosten: {
                        beschreibung: "Tapete",
                        menge_einheit: `${requiredRolls} Rolle(n)`,
                        status: "Geplant",
                      },
                    },
                  });
                }}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-3 py-1.5 rounded-md shadow flex items-center text-sm ml-auto"
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

export default BedarfsrechnerTapete;
