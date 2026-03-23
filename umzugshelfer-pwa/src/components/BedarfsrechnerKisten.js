import React, { useState, useEffect } from "react";
import {
  Archive,
  Users,
  Home,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const boxTypes = [
  {
    id: "standard",
    name: "Standard Umzugskartons",
    avgItems: "Geschirr, Kleidung, Diverses",
  },
  {
    id: "buecher",
    name: "Bücherkartons",
    avgItems: "Bücher, schwere Gegenstände",
  },
  { id: "kleider", name: "Kleiderboxen", avgItems: "Hängende Kleidung" },
  // Weitere Typen können hier hinzugefügt werden
];

const BedarfsrechnerKisten = () => {
  const { theme } = useTheme(); // Theme aus Context holen
  const [manualQuantities, setManualQuantities] = useState(
    boxTypes.reduce((acc, item) => {
      acc[item.id] = "";
      return acc;
    }, {})
  );
  const [numAdults, setNumAdults] = useState("1");
  const [numChildren, setNumChildren] = useState("0");
  const [numRooms, setNumRooms] = useState("2"); // Hauptwohnräume

  const [totalManualBoxes, setTotalManualBoxes] = useState(0);
  const [estimatedMinBoxes, setEstimatedMinBoxes] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let currentManualTotal = 0;
    boxTypes.forEach((item) => {
      currentManualTotal += parseInt(manualQuantities[item.id], 10) || 0;
    });
    setTotalManualBoxes(currentManualTotal);
  }, [manualQuantities]);

  useEffect(() => {
    const adults = parseInt(numAdults, 10) || 0;
    const children = parseInt(numChildren, 10) || 0;
    const rooms = parseInt(numRooms, 10) || 0;

    let estimated = 0;
    if (adults > 0 || children > 0 || rooms > 0) {
      estimated = adults * 20 + children * 10 + rooms * 10 + 5; // +5 für Küche/Bad Pauschale
    }
    setEstimatedMinBoxes(estimated);
  }, [numAdults, numChildren, numRooms]);

  const handleManualQuantityChange = (itemId, value) => {
    const sanitizedValue = value.replace(/[^\d]/g, "");
    setManualQuantities((prev) => ({ ...prev, [itemId]: sanitizedValue }));
  };

  const baseInputClass =
    "w-full px-3 py-2 border rounded-md text-sm focus:ring-1";
  const lightInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-amber-500 focus:border-amber-500";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-amber-500 focus:border-amber-500";
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
          <Archive
            size={24}
            className="mr-2 text-amber-600 dark:text-amber-500"
          />
          Kisten- & Kartonrechner
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-amber-600 dark:hover:text-amber-500 p-1 flex items-center"
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
            <strong>Manuelle Erfassung:</strong> Geben Sie die Anzahl Ihrer
            bereits vorhandenen oder geplanten Kartons pro Typ ein.
          </p>
          <p>
            <strong>Schätzung Mindestbedarf:</strong> Geben Sie die Anzahl der
            Erwachsenen, Kinder und Hauptwohnräume (z.B. Wohnzimmer,
            Schlafzimmer, Arbeitszimmer) an. Daraus wird ein grober
            Mindestbedarf geschätzt.
          </p>
          <p>
            Die Schätzung ist ein Richtwert und kann je nach Hausstand stark
            variieren.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {/* Manuelle Erfassung */}
        <section>
          <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
            Manuelle Erfassung
          </h3>
          <div className="space-y-3">
            {boxTypes.map((box) => (
              <div key={box.id}>
                <label htmlFor={box.id} className={labelClass}>
                  {box.name}
                </label>
                <input
                  type="text"
                  id={box.id}
                  value={manualQuantities[box.id]}
                  onChange={(e) =>
                    handleManualQuantityChange(box.id, e.target.value)
                  }
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

        {/* Schätzung Mindestbedarf */}
        <section>
          <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
            Schätzung Mindestbedarf
          </h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="numAdults" className={labelClass}>
                <Users size={14} className="inline mr-1" />
                Anzahl Erwachsene
              </label>
              <input
                type="number"
                id="numAdults"
                value={numAdults}
                onChange={(e) => setNumAdults(e.target.value)}
                className={inputClass}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="numChildren" className={labelClass}>
                <Users size={14} className="inline mr-1" />
                Anzahl Kinder
              </label>
              <input
                type="number"
                id="numChildren"
                value={numChildren}
                onChange={(e) => setNumChildren(e.target.value)}
                className={inputClass}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="numRooms" className={labelClass}>
                <Home size={14} className="inline mr-1" />
                Anzahl Hauptwohnräume
              </label>
              <input
                type="number"
                id="numRooms"
                value={numRooms}
                onChange={(e) => setNumRooms(e.target.value)}
                className={inputClass}
                min="0"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Ergebnisse */}
      <div className="mt-6 bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          Zusammenfassung Kartonbedarf:
        </h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Manuell erfasste Kartons:
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {totalManualBoxes} Stk.
            </span>
          </p>
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              Geschätzter Mindestbedarf:
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-500">
              {estimatedMinBoxes} Stk.
            </span>
          </p>
          {totalManualBoxes > 0 && estimatedMinBoxes > 0 && (
            <p className="flex justify-between text-xs mt-1">
              <span className="text-light-text-secondary dark:text-dark-text-secondary">
                Differenz (Manuell - Schätzung):
              </span>
              <span
                className={`font-semibold ${
                  totalManualBoxes >= estimatedMinBoxes
                    ? "text-green-500 dark:text-green-400"
                    : "text-red-500 dark:text-red-400"
                }`}
              >
                {totalManualBoxes - estimatedMinBoxes} Stk.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedarfsrechnerKisten;
