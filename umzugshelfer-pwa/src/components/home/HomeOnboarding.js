import React from "react";
import { Truck, Home } from "lucide-react";

const HomeOnboarding = ({ onWaehleUmzug, onWaehleHome }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-light-card dark:bg-dark-card rounded-2xl shadow-2xl max-w-lg w-full p-8 border border-light-border dark:border-dark-border">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main mb-2">
            Willkommen beim Umzughelfer!
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Womit möchtest du starten?
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Umzug planen */}
          <button
            onClick={onWaehleUmzug}
            className="group flex flex-col items-center p-6 rounded-xl border-2 border-light-border dark:border-dark-border hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-500/5 transition-all duration-200 text-left"
          >
            <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <Truck size={28} className="text-blue-500" />
            </div>
            <h3 className="font-semibold text-light-text-main dark:text-dark-text-main mb-1 text-center">
              Umzug planen
            </h3>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center">
              Packlisten, Budget, Kontakte und alles rund um deinen Umzug
            </p>
          </button>

          {/* Haushalt organisieren */}
          <button
            onClick={onWaehleHome}
            className="group flex flex-col items-center p-6 rounded-xl border-2 border-light-border dark:border-dark-border hover:border-green-500 dark:hover:border-green-400 hover:bg-green-500/5 transition-all duration-200 text-left"
          >
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4 group-hover:bg-green-500/20 transition-colors">
              <Home size={28} className="text-green-500" />
            </div>
            <h3 className="font-semibold text-light-text-main dark:text-dark-text-main mb-1 text-center">
              Haushalt organisieren
            </h3>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center">
              Inventar verwalten, Vorräte tracken, Geräte pflegen
            </p>
          </button>
        </div>

        <p className="text-center text-xs text-light-text-secondary dark:text-dark-text-secondary mt-6">
          Du kannst den Modus jederzeit über die Navigation wechseln.
        </p>
      </div>
    </div>
  );
};

export default HomeOnboarding;
