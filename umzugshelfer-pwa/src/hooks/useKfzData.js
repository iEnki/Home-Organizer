import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { syncFuelImports } from "../utils/kfzFuelImports";

const TABLES = [
  ["vehicles", "home_fahrzeuge", "name", true, true],
  ["fuel", "home_fahrzeug_tankvorgaenge", "datum", false, true],
  ["fuelImports", "home_fahrzeug_tank_importe", "created_at", false, false],
  ["services", "home_fahrzeug_services", "datum", false, true],
  ["servicePositions", "home_fahrzeug_service_positionen", "sortierung", true, false],
  ["tires", "home_fahrzeug_reifen", "created_at", false, true],
  ["expenses", "home_fahrzeug_ausgaben", "datum", false, true],
  ["tasks", "home_fahrzeug_aufgaben", "created_at", false, true],
  ["parts", "home_fahrzeug_teile", "created_at", false, true],
  ["mileage", "home_fahrzeug_kilometerstaende", "datum", false, false],
  ["documents", "dokumente", "dateiname", true, false],
  ["links", "dokument_links", "created_at", false, false],
  ["contracts", "vertraege", "created_at", false, false],
  ["policies", "versicherungs_polizzen", "created_at", false, false],
];

const emptyData = () => Object.fromEntries(TABLES.map(([key]) => [key, []]));

export default function useKfzData({ householdId, userId }) {
  const requestId = useRef(0);
  const mounted = useRef(true);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [warnings, setWarnings] = useState([]);

  useEffect(() => () => {
    mounted.current = false;
    requestId.current += 1;
  }, []);

  const refresh = useCallback(async ({ synchronizeFuel = false } = {}) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    if (!userId || !householdId) {
      if (mounted.current) {
        setData(emptyData());
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setLoadError("");
    const responses = await Promise.allSettled(TABLES.map(([, table, order, ascending]) => (
      supabase.from(table).select("*").eq("household_id", householdId).order(order, { ascending })
    )));
    if (!mounted.current || requestId.current !== currentRequest) return;

    const next = emptyData();
    const nextWarnings = [];
    const coreErrors = [];
    responses.forEach((result, index) => {
      const [key, table, , , required] = TABLES[index];
      const response = result.status === "fulfilled" ? result.value : null;
      const error = result.status === "rejected" ? result.reason : response?.error;
      if (error) {
        const message = `${table}: ${error.message || String(error)}`;
        if (required) coreErrors.push(message);
        else nextWarnings.push(message);
        return;
      }
      next[key] = response?.data || [];
    });
    setData(next);
    setWarnings(nextWarnings);
    setLoadError(coreErrors.join("\n"));

    if (synchronizeFuel) {
      try {
        await syncFuelImports({ householdId, userId, includeInvoicePositions: false });
        const [importsResponse, fuelResponse] = await Promise.all([
          supabase.from("home_fahrzeug_tank_importe").select("*").eq("household_id", householdId).order("created_at", { ascending: false }),
          supabase.from("home_fahrzeug_tankvorgaenge").select("*").eq("household_id", householdId).order("datum", { ascending: false }),
        ]);
        if (!mounted.current || requestId.current !== currentRequest) return;
        setData((current) => ({
          ...current,
          fuelImports: importsResponse.error ? current.fuelImports : importsResponse.data || [],
          fuel: fuelResponse.error ? current.fuel : fuelResponse.data || [],
        }));
        const syncWarnings = [importsResponse.error, fuelResponse.error].filter(Boolean).map((error) => error.message);
        if (syncWarnings.length) setWarnings((current) => [...current, ...syncWarnings]);
      } catch (error) {
        if (mounted.current && requestId.current === currentRequest) {
          setWarnings((current) => [...current, `Tankbeleg-Synchronisierung: ${error.message || String(error)}`]);
        }
      }
    }

    if (mounted.current && requestId.current === currentRequest) setLoading(false);
  }, [householdId, userId]);

  useEffect(() => {
    refresh({ synchronizeFuel: true });
  }, [refresh]);

  return { data, loading, loadError, warnings, refresh };
}
