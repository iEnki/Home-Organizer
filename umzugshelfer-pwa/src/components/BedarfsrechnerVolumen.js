import React, { useState, useEffect } from "react";
import { Box, Info, ChevronDown, ChevronUp } from "lucide-react"; // HelpCircle entfernt, da Info verwendet wird
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const itemCategories = [
  {
    id: "kartonStandard",
    name: "Umzugskarton (Standard, ca. 60L)",
    volume: 0.06,
  },
  { id: "kartonBuch", name: "Bücherkarton (ca. 40L)", volume: 0.04 },
  { id: "moebelGross", name: "Großes Möbelstück (Schrank, Sofa)", volume: 1.3 },
  {
    id: "moebelMittel",
    name: "Mittleres Möbelstück (Kommode, Sessel)",
    volume: 0.7,
  },
  {
    id: "moebelKlein",
    name: "Kleines Möbelstück (Stuhl, Beistelltisch)",
    volume: 0.15,
  },
  {
    id: "geraetGross",
    name: "Großgerät (Waschmaschine, Kühlschrank)",
    volume: 0.5,
  },
  { id: "fahrrad", name: "Fahrrad", volume: 0.5 },
  { id: "pflanzeGross", name: "Große Pflanze", volume: 0.2 },
];

const BedarfsrechnerVolumen = ({ onVolumeCalculated }) => {
  // onVolumeCalculated Prop hinzugefügt
  const { theme } = useTheme(); // Theme aus Context holen
  const [quantities, setQuantities] = useState(
    itemCategories.reduce((acc, item) => {
      acc[item.id] = "";
      return acc;
    }, {})
  );
  const [totalVolume, setTotalVolume] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let currentTotalVolume = 0;
    itemCategories.forEach((item) => {
      const quantity = parseInt(quantities[item.id], 10) || 0;
      if (quantity > 0) {
        currentTotalVolume += quantity * item.volume;
      }
    });
    setTotalVolume(currentTotalVolume);
    if (onVolumeCalculated) {
      // Callback aufrufen, wenn vorhanden
      onVolumeCalculated(currentTotalVolume);
    }
  }, [quantities, onVolumeCalculated]); // onVolumeCalculated zur Dependency Array

  const handleQuantityChange = (itemId, value) => {
    setQuantities((prev) => ({ ...prev, [itemId]: value }));
  };

  const baseInputClass =
    "w-full px-3 py-2 border rounded-md text-sm focus:ring-1";
  const lightInputClass =
    "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500";
  const darkInputClass =
    "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-orange-400 focus:border-orange-400";
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
          <Box
            size={24}
            className="mr-2 text-orange-500 dark:text-orange-400"
          />
          Umzugsvolumen-Rechner
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-orange-500 dark:hover:text-orange-400 p-1 flex items-center"
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
            Geben Sie für jede Kategorie die ungefähre Anzahl Ihrer Gegenstände
            ein.
          </p>
          <p>
            Die Volumenangaben sind Schätzwerte. Für eine genauere Planung
            messen Sie große Möbelstücke ggf. selbst aus (Länge x Breite x
            Höhe).
          </p>
          <p>
            Das Gesamtvolumen hilft Ihnen bei der Auswahl der richtigen
            Transportergröße:
          </p>
          <ul className="list-disc list-inside pl-2">
            <li>Kleiner Transporter (z.B. Sprinter kurz): ca. 5-7 m³</li>
            <li>Mittlerer Transporter (z.B. Sprinter lang): ca. 10-14 m³</li>
            <li>Großer LKW (7.5t): ca. 30-40 m³</li>
          </ul>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {itemCategories.map((item) => (
          <div key={item.id} className="grid grid-cols-3 gap-3 items-center">
            <label htmlFor={item.id} className={`${labelClass} col-span-2`}>
              {item.name}
            </label>
            <input
              type="number"
              id={item.id}
              value={quantities[item.id]}
              onChange={(e) => handleQuantityChange(item.id, e.target.value)}
              className={inputClass}
              placeholder="0"
              min="0"
            />
          </div>
        ))}
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          Geschätztes Gesamtvolumen:
        </h3>
        <p className="flex justify-between text-2xl">
          <span className="font-bold text-orange-500 dark:text-orange-400">
            {totalVolume.toFixed(2)} m³
          </span>
        </p>
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
          (Dies ist eine Schätzung. Der tatsächliche Platzbedarf kann
          variieren.)
        </p>
      </div>
    </div>
  );
};

export default BedarfsrechnerVolumen;
