import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ThermometerSnowflake,
  SendToBack,
  Info,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Trash2,
} from "lucide-react"; // Passendes Icon für Dämmung
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const BedarfsrechnerDaemmstoff = () => {
  const navigate = useNavigate();
  const { theme } = useTheme(); // Theme aus Context holen
  const [areaItems, setAreaItems] = useState([
    { id: 1, length: "", width: "" },
  ]);
  const [nextAreaId, setNextAreaId] = useState(2);

  const [packageContent, setPackageContent] = useState(""); // m² pro Paket
  const [wastePercentage, setWastePercentage] = useState("10"); // Standard 10% Verschnitt

  const [totalArea, setTotalArea] = useState(0);
  const [totalMaterialNeeded, setTotalMaterialNeeded] = useState(0);
  const [requiredPackages, setRequiredPackages] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let currentTotalArea = 0;
    areaItems.forEach((item) => {
      const itemLength = parseFloat(item.length) || 0;
      const itemWidth = parseFloat(item.width) || 0;
      if (itemLength > 0 && itemWidth > 0) {
        currentTotalArea += itemLength * itemWidth;
      }
    });
    setTotalArea(currentTotalArea);

    const pkgContent = parseFloat(packageContent) || 0;
    const waste = parseFloat(wastePercentage) || 0;

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
    setAreaItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addAreaItem = () => {
    setAreaItems((prevItems) => [
      ...prevItems,
      { id: nextAreaId, length: "", width: "" },
    ]);
    setNextAreaId((prevId) => prevId + 1);
  };

  const removeAreaItem = (idToRemove) => {
    setAreaItems((prevItems) =>
      prevItems.filter((item) => item.id !== idToRemove)
    );
  };

  const baseInputClass =
    "w-full px-3 py-2 border rounded-md text-sm focus:ring-1";
  const lightInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-sky-500 focus:border-sky-500";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-sky-400 focus:border-sky-400";
  const inputClass = `${baseInputClass} ${
    theme === "dark" ? darkInputClass : lightInputClass
  }`;

  const baseSmallInputClass =
    "w-full px-3 py-1 border rounded-md text-xs focus:ring-1";
  const lightSmallInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-sky-500 focus:border-sky-500";
  const darkSmallInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-sky-400 focus:border-sky-400";
  const smallInputClass = `${baseSmallInputClass} ${
    theme === "dark" ? darkSmallInputClass : lightSmallInputClass
  }`;

  const baseLabelClass = "block text-sm font-medium mb-1";
  const lightLabelClass = "text-gray-700";
  const darkLabelClass = "text-dark-text-secondary";
  const labelClass = `${baseLabelClass} ${
    theme === "dark" ? darkLabelClass : lightLabelClass
  }`;

  const baseSmallLabelClass = "block text-xs font-medium mb-0.5";
  const lightSmallLabelClass = "text-gray-700";
  const darkSmallLabelClass = "text-dark-text-secondary";
  const smallLabelClass = `${baseSmallLabelClass} ${
    theme === "dark" ? darkSmallLabelClass : lightSmallLabelClass
  }`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <ThermometerSnowflake
            size={24}
            className="mr-2 text-sky-500 dark:text-sky-400"
          />
          Bedarfsrechner für Dämmstoffe
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-sky-500 dark:hover:text-sky-400 p-1 flex items-center"
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
            <strong>Zu dämmende Flächen:</strong> Fügen Sie jede zu dämmende
            Fläche (Wand, Decke, Bodenabschnitt) mit Länge und Breite hinzu.
          </p>
          <p>
            <strong>Paketinhalt (m²):</strong> Geben Sie an, wie viel
            Quadratmeter Dämmmaterial in einem Paket enthalten sind.
          </p>
          <p>
            <strong>Verschnitt (%):</strong> Ein üblicher Wert für Verschnitt
            bei Dämmplatten ist 5-10%.
          </p>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <h3 className="text-md font-medium text-light-text-main dark:text-dark-text-main mt-4 mb-2">
          Zu dämmende Flächen
        </h3>
        {areaItems.map((item, index) => (
          <div
            key={item.id}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-2 border border-gray-200 dark:border-dark-border/50 rounded-md"
          >
            <div>
              <label
                htmlFor={`areaLength-${item.id}`}
                className={smallLabelClass}
              >
                Länge Fläche {index + 1} (m)
              </label>
              <input
                type="number"
                id={`areaLength-${item.id}`}
                value={item.length}
                onChange={(e) =>
                  handleAreaItemChange(item.id, "length", e.target.value)
                }
                className={smallInputClass}
                placeholder="z.B. 5"
              />
            </div>
            <div>
              <label
                htmlFor={`areaWidth-${item.id}`}
                className={smallLabelClass}
              >
                Breite Fläche {index + 1} (m)
              </label>
              <input
                type="number"
                id={`areaWidth-${item.id}`}
                value={item.width}
                onChange={(e) =>
                  handleAreaItemChange(item.id, "width", e.target.value)
                }
                className={smallInputClass}
                placeholder="z.B. 4"
              />
            </div>
            <div className="flex justify-end">
              {areaItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAreaItem(item.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Fläche entfernen"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addAreaItem}
          className="mt-1 text-sm text-light-accent-green dark:text-dark-accent-green hover:opacity-80 dark:hover:opacity-80 flex items-center"
        >
          <PlusCircle size={16} className="mr-1" /> Weitere Fläche hinzufügen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="daemmPackageContent" className={labelClass}>
            Paketinhalt Dämmstoff (m²)
          </label>
          <input
            type="number"
            id="daemmPackageContent"
            value={packageContent}
            onChange={(e) => setPackageContent(e.target.value)}
            className={inputClass}
            placeholder="z.B. 5.76"
          />
        </div>
        <div>
          <label htmlFor="daemmWaste" className={labelClass}>
            Verschnitt (%)
          </label>
          <input
            type="number"
            id="daemmWaste"
            value={wastePercentage}
            onChange={(e) => setWastePercentage(e.target.value)}
            className={inputClass}
            placeholder="z.B. 10"
          />
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          Ergebnis:
        </h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Gesamtfläche zu dämmen:
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {totalArea.toFixed(2)} m²
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Materialbedarf (inkl. Verschnitt):
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {totalMaterialNeeded.toFixed(2)} m²
            </span>
          </p>
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Benötigte Pakete Dämmstoff:
            </span>
            <span className="font-bold text-sky-500 dark:text-sky-400">
              {requiredPackages} Stk.
            </span>
          </p>

          {requiredPackages > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => {
                  navigate("/materialplaner", {
                    state: {
                      neuerPosten: {
                        beschreibung: "Dämmstoff",
                        menge_einheit: `${requiredPackages} Paket(e)`,
                        status: "Geplant",
                      },
                    },
                  });
                }}
                className="bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white px-3 py-1.5 rounded-md shadow flex items-center text-sm ml-auto"
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

export default BedarfsrechnerDaemmstoff;
