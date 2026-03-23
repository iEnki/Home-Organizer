import React, { useState } from "react";
import BedarfsrechnerVolumen from "./BedarfsrechnerVolumen";
import BedarfsrechnerTransportkosten from "./BedarfsrechnerTransportkosten";
import BedarfsrechnerKisten from "./BedarfsrechnerKisten"; // NEU
import { PackageOpen } from "lucide-react"; // Icon für Umzugsplanung

const UmzugsplanerSeite = () => {
  const [calculatedVolume, setCalculatedVolume] = useState(0);

  // Callback-Funktion, die vom Volumenrechner aufgerufen wird
  const handleVolumeCalculated = (volume) => {
    setCalculatedVolume(volume);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <h1 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-6 flex items-center">
        <PackageOpen size={30} className="mr-3 text-indigo-400" />
        Umzugsplaner (Volumen & Transport)
      </h1>

      {/* Volumenrechner mit Callback, um das berechnete Volumen zu erhalten */}
      <BedarfsrechnerVolumen onVolumeCalculated={handleVolumeCalculated} />

      {/* Transportkostenrechner, dem das berechnete Volumen übergeben wird */}
      {/* Wir fügen eine kleine Überschrift hinzu, um den Kontext klarer zu machen, wenn das Volumen > 0 ist */}
      {calculatedVolume > 0 && (
        <div className="mt-8 pt-8 border-t border-dark-border">
          <h2 className="text-2xl font-semibold text-light-text-main dark:text-dark-text-main mb-4">
            Basierend auf {calculatedVolume.toFixed(2)} m³ Umzugsvolumen:
          </h2>
        </div>
      )}
      <BedarfsrechnerTransportkosten initialVolume={calculatedVolume} />

      <div className="mt-8 pt-8 border-t border-dark-border">
        {" "}
        {/* Trennlinie und Abstand */}
        <BedarfsrechnerKisten />
      </div>
    </div>
  );
};

export default UmzugsplanerSeite;
