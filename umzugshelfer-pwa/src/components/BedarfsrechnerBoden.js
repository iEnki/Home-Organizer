import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // useNavigate importieren
import { Layers, SendToBack, Info, ChevronDown, ChevronUp } from "lucide-react"; // Weitere Icons für Hilfe
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const BedarfsrechnerBoden = () => {
  const navigate = useNavigate(); // useNavigate hook
  const { theme } = useTheme(); // Theme aus Context holen
  const [roomLength, setRoomLength] = useState("");
  const [roomWidth, setRoomWidth] = useState("");
  const [packageContent, setPackageContent] = useState(""); // m² pro Paket
  const [wastePercentage, setWastePercentage] = useState("10"); // Standard 10% Verschnitt
  const [packagePrice, setPackagePrice] = useState(""); // Optional

  const [roomArea, setRoomArea] = useState(0);
  const [totalMaterialNeeded, setTotalMaterialNeeded] = useState(0);
  const [requiredPackages, setRequiredPackages] = useState(0);
  const [totalCost, setTotalCost] = useState(0); // Optional
  const [showHelp, setShowHelp] = useState(false); // State für Hilfe

  useEffect(() => {
    const length = parseFloat(roomLength) || 0;
    const width = parseFloat(roomWidth) || 0;
    const pkgContent = parseFloat(packageContent) || 0;
    const waste = parseFloat(wastePercentage) || 0;
    const pkgPrice = parseFloat(packagePrice) || 0;

    if (length > 0 && width > 0 && pkgContent > 0) {
      const area = length * width;
      setRoomArea(area);

      const materialWithWaste = area * (1 + waste / 100);
      setTotalMaterialNeeded(materialWithWaste);

      const packages = Math.ceil(materialWithWaste / pkgContent);
      setRequiredPackages(packages);

      if (pkgPrice > 0) {
        setTotalCost(packages * pkgPrice);
      } else {
        setTotalCost(0);
      }
    } else {
      setRoomArea(0);
      setTotalMaterialNeeded(0);
      setRequiredPackages(0);
      setTotalCost(0);
    }
  }, [roomLength, roomWidth, packageContent, wastePercentage, packagePrice]);

  const baseInputClass =
    "w-full px-3 py-2 border rounded-md text-sm focus:ring-1";
  const lightInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-light-accent-purple focus:border-light-accent-purple";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-purple focus:border-dark-accent-purple";
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
          <Layers
            size={24}
            className="mr-2 text-light-accent-purple dark:text-dark-accent-purple"
          />
          Bedarfsrechner für Bodenbelag
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-purple dark:hover:text-dark-accent-purple p-1 flex items-center"
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
            <strong>Raummaße:</strong> Geben Sie Länge und Breite des Raumes in
            Metern an.
          </p>
          <p>
            <strong>Paketinhalt:</strong> Wie viel m² Bodenbelag sind in einem
            Paket enthalten?
          </p>
          <p>
            <strong>Verschnitt:</strong> Planen Sie einen Zuschlag für
            Verschnitt ein (üblich sind 5-15%, je nach Raum und Material).
          </p>
          <p>
            <strong>Preis pro Paket (optional):</strong> Für eine
            Kostenschätzung.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="floorRoomLength" className={labelClass}>
            Raumlänge (m)
          </label>
          <input
            type="number"
            id="floorRoomLength"
            value={roomLength}
            onChange={(e) => setRoomLength(e.target.value)}
            className={inputClass}
            placeholder="z.B. 5"
          />
        </div>
        <div>
          <label htmlFor="floorRoomWidth" className={labelClass}>
            Raumbreite (m)
          </label>
          <input
            type="number"
            id="floorRoomWidth"
            value={roomWidth}
            onChange={(e) => setRoomWidth(e.target.value)}
            className={inputClass}
            placeholder="z.B. 4"
          />
        </div>
        <div>
          <label htmlFor="floorPackageContent" className={labelClass}>
            Paketinhalt (m²)
          </label>
          <input
            type="number"
            id="floorPackageContent"
            value={packageContent}
            onChange={(e) => setPackageContent(e.target.value)}
            className={inputClass}
            placeholder="z.B. 2.5"
          />
        </div>
        <div>
          <label htmlFor="floorWaste" className={labelClass}>
            Verschnitt (%)
          </label>
          <input
            type="number"
            id="floorWaste"
            value={wastePercentage}
            onChange={(e) => setWastePercentage(e.target.value)}
            className={inputClass}
            placeholder="z.B. 10"
          />
        </div>
        <div>
          <label htmlFor="floorPackagePrice" className={labelClass}>
            Preis pro Paket (€, opt.)
          </label>
          <input
            type="number"
            id="floorPackagePrice"
            value={packagePrice}
            onChange={(e) => setPackagePrice(e.target.value)}
            className={inputClass}
            placeholder="z.B. 25.99"
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
              Raumfläche:
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {roomArea.toFixed(2)} m²
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
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Benötigte Pakete:
            </span>
            <span className="font-bold text-light-accent-purple dark:text-dark-accent-purple">
              {requiredPackages} Stk.
            </span>
          </p>
          {parseFloat(packagePrice) > 0 && (
            <>
              <hr className="border-gray-200 dark:border-dark-border my-2" />
              <p className="flex justify-between text-base">
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Geschätzte Gesamtkosten:
                </span>
                <span className="font-bold text-light-accent-purple dark:text-dark-accent-purple">
                  {totalCost.toFixed(2)} €
                </span>
              </p>
            </>
          )}
          {requiredPackages > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => {
                  navigate("/materialplaner", {
                    state: {
                      neuerPosten: {
                        beschreibung: "Bodenbelag", // Evtl. später um Typ ergänzen
                        menge_einheit: `${requiredPackages} Paket(e)`,
                        geschaetzter_preis:
                          parseFloat(packagePrice) > 0 ? totalCost : null,
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

export default BedarfsrechnerBoden;
