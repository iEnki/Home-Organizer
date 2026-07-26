import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenAiModels } from "../utils/openAiModels";

export default function useOpenAiModelCatalog(keyScope, enabled) {
  const [state, setState] = useState({
    models: [],
    loading: false,
    error: null,
    errorCode: null,
    keySource: null,
    fetchedAt: null,
  });
  const activeRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++activeRequestRef.current;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      errorCode: null,
    }));
    try {
      const data = await loadOpenAiModels(keyScope);
      if (requestId !== activeRequestRef.current) return;
      setState({
        models: Array.isArray(data?.models) ? data.models : [],
        loading: false,
        error: null,
        errorCode: null,
        keySource: data?.keySource || null,
        fetchedAt: data?.fetchedAt || null,
      });
    } catch (error) {
      if (requestId !== activeRequestRef.current) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Modelle konnten nicht geladen werden.",
        errorCode: error?.code || "FUNCTION_ERROR",
      }));
    }
  }, [enabled, keyScope]);

  useEffect(() => {
    if (!enabled) {
      activeRequestRef.current += 1;
      setState((current) => current.loading ? { ...current, loading: false } : current);
      return undefined;
    }
    refresh();
    return () => {
      activeRequestRef.current += 1;
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
