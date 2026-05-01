import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Info, SendToBack, Truck } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const BedarfsrechnerTransportkosten = ({ initialVolume }) => {
  const { t } = useTranslation(["move", "common"]);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [totalVolume, setTotalVolume] = useState("");
  const [transporterCapacity, setTransporterCapacity] = useState("");
  const [costPerTrip, setCostPerTrip] = useState("");
  const [numberOfTrips, setNumberOfTrips] = useState(0);
  const [totalTransportCost, setTotalTransportCost] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (initialVolume !== undefined) {
      setTotalVolume(initialVolume > 0 ? initialVolume.toFixed(2) : "");
    }
  }, [initialVolume]);

  useEffect(() => {
    const vol = parseFloat(totalVolume) || 0;
    const cap = parseFloat(transporterCapacity) || 0;
    const cost = parseFloat(costPerTrip) || 0;

    if (vol > 0 && cap > 0) {
      const trips = Math.ceil(vol / cap);
      setNumberOfTrips(trips);
      setTotalTransportCost(cost > 0 ? trips * cost : 0);
    } else {
      setNumberOfTrips(0);
      setTotalTransportCost(0);
    }
  }, [totalVolume, transporterCapacity, costPerTrip]);

  const inputClass = `w-full px-3 py-2 border rounded-md text-sm focus:ring-1 ${
    theme === "dark"
      ? "border-dark-border bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-cyan-400 focus:border-cyan-400"
      : "border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-cyan-500 focus:border-cyan-500"
  }`;
  const readOnlyInputClass =
    initialVolume > 0
      ? theme === "dark"
        ? "border-dark-border bg-gray-700 text-dark-text-main placeholder-dark-text-secondary cursor-not-allowed"
        : "border-gray-300 bg-gray-200 text-gray-700 placeholder-gray-500 cursor-not-allowed"
      : "";
  const labelClass = `block text-sm font-medium mb-1 ${
    theme === "dark" ? "text-dark-text-secondary" : "text-gray-700"
  }`;

  return (
    <div className="p-4 md:p-6 bg-light-card-bg dark:bg-dark-card-bg rounded-lg shadow border border-light-border dark:border-dark-border mt-6">
      <h2 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center justify-between">
        <div className="flex items-center">
          <Truck size={24} className="mr-2 text-cyan-500 dark:text-cyan-400" />
          {t("move:calculator.transport.title")}
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-cyan-500 dark:hover:text-cyan-400 p-1 flex items-center"
          title={showHelp ? t("move:shared.hideHelp") : t("move:shared.showHelp")}
        >
          <Info size={16} className="mr-1" /> {t("move:shared.help")}{" "}
          {showHelp ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
        </button>
      </h2>

      {showHelp && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-md text-xs text-gray-600 dark:text-dark-text-secondary space-y-1">
          <p>{t("move:calculator.transport.help.volume")}</p>
          <p>{t("move:calculator.transport.help.capacity")}</p>
          <p>{t("move:calculator.transport.help.cost")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label htmlFor="transTotalVolume" className={labelClass}>
            {t("move:calculator.transport.totalVolume")}
          </label>
          <input
            type="number"
            id="transTotalVolume"
            value={totalVolume}
            onChange={(e) => setTotalVolume(e.target.value)}
            className={`${inputClass} ${readOnlyInputClass}`}
            placeholder={initialVolume > 0 ? "" : "z. B. 15"}
            readOnly={initialVolume > 0}
            title={
              initialVolume > 0
                ? t("move:calculator.transport.fromVolumeCalculator")
                : t("move:calculator.transport.manualInput")
            }
          />
        </div>
        <div>
          <label htmlFor="transCapacity" className={labelClass}>
            {t("move:calculator.transport.capacity")}
          </label>
          <input
            type="number"
            id="transCapacity"
            value={transporterCapacity}
            onChange={(e) => setTransporterCapacity(e.target.value)}
            className={inputClass}
            placeholder="z. B. 10"
          />
        </div>
        <div>
          <label htmlFor="transCostPerTrip" className={labelClass}>
            {t("move:calculator.transport.costPerTrip")}
          </label>
          <input
            type="number"
            id="transCostPerTrip"
            value={costPerTrip}
            onChange={(e) => setCostPerTrip(e.target.value)}
            className={inputClass}
            placeholder="z. B. 50"
          />
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-dark-bg p-4 rounded-md border border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-light-text-main dark:text-dark-text-main mb-3">
          {t("move:shared.result")}
        </h3>
        <div className="space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              {t("move:calculator.transport.neededTrips")}
            </span>
            <span className="font-semibold text-light-text-main dark:text-dark-text-main">
              {numberOfTrips} {t("move:shared.pieceShort")}
            </span>
          </p>
          <hr className="border-gray-200 dark:border-dark-border my-2" />
          <p className="flex justify-between text-base">
            <span className="text-light-text-secondary dark:text-dark-text-secondary">
              {t("move:calculator.transport.estimatedCost")}
            </span>
            <span className="font-bold text-cyan-500 dark:text-cyan-400">
              {totalTransportCost.toFixed(2)} €
            </span>
          </p>
          {totalTransportCost > 0 && (
            <div className="mt-4 text-right">
              <button
                onClick={() => {
                  navigate("/budget", {
                    state: {
                      neuesBudgetItem: {
                        beschreibung: t("move:calculator.common.itemDescriptions.transport"),
                        betrag: totalTransportCost,
                        kategorie: "Transport",
                        typ: "Ausgabe",
                        datum: getLocalDateInputValue(),
                      },
                    },
                  });
                }}
                className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg px-3 py-1.5 rounded-md shadow hover:opacity-90 flex items-center text-sm ml-auto"
              >
                <SendToBack size={16} className="mr-2" />
                {t("move:calculator.transport.addToBudget")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedarfsrechnerTransportkosten;
