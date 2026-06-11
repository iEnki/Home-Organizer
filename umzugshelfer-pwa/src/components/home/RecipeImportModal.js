import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { continueRecipeImportWithOpenAi, fetchRecipeImportJob, startRecipeImport } from "../../utils/recipeImportService";
import { useLocale } from "../../contexts/LocaleContext";

export default function RecipeImportModal({ open, onClose, onReviewReady }) {
  const { t } = useTranslation("recipes");
  const { locale } = useLocale();
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState(() => t("importModal.defaultLocation"));
  const [mode, setMode] = useState("combined");
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      setJob(null);
      setError("");
      setLoading(false);
    }
    return () => clearInterval(timerRef.current);
  }, [open]);

  const pollJob = (jobId) => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      try {
        const next = await fetchRecipeImportJob(jobId);
        setJob(next);
        if (!next) return;
        if (next.status === "review" && next.result_rezept_id) {
          clearInterval(timerRef.current);
          onReviewReady(next.result_rezept_id);
        }
        if (next.status === "failed") {
          clearInterval(timerRef.current);
          setError(localizeImportError(next.error_message, t) || t("importModal.failed"));
          setLoading(false);
        }
        if (next.status === "needs_openai_fallback_confirmation") {
          clearInterval(timerRef.current);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        setError(localizeImportError(err.message, t) || t("importModal.jobLoadFailed"));
      }
    }, 1800);
  };

  const start = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await startRecipeImport({ url, location, mode });
      const firstJob = await fetchRecipeImportJob(result.job_id);
      setJob(firstJob);
      pollJob(result.job_id);
    } catch (err) {
      if (err.jobId) {
        try {
          const failedJob = await fetchRecipeImportJob(err.jobId);
          setJob(failedJob);
          setError(localizeImportError(failedJob?.error_message || err.message, t) || t("importModal.startFailed"));
        } catch {
          setError(localizeImportError(err.message, t) || t("importModal.startFailed"));
        }
      } else {
        setError(localizeImportError(err.message, t) || t("importModal.startFailed"));
      }
      setLoading(false);
    }
  };

  const continueWithOpenAi = async () => {
    if (!job?.id) return;
    setError("");
    setLoading(true);
    try {
      await continueRecipeImportWithOpenAi(job.id);
      const next = await fetchRecipeImportJob(job.id);
      setJob(next);
      pollJob(job.id);
    } catch (err) {
      setError(localizeImportError(err.message, t) || t("importModal.openAiFallbackFailed"));
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main";
  const progress = job?.progress || (loading ? 5 : 0);
  const status = localizeProgressMessage(job?.progress_message, t) || (loading ? t("importModal.starting") : "");
  const needsOpenAiFallback = job?.status === "needs_openai_fallback_confirmation";

  return (
    <ModalShell
      open={open}
      title={t("importModal.title")}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      footer={(
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main disabled:opacity-50 dark:border-dark-border dark:text-dark-text-main">{t("importModal.close")}</button>
          {needsOpenAiFallback && (
            <button onClick={continueWithOpenAi} disabled={loading} className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("importModal.continueOpenAi")}</button>
          )}
          {!needsOpenAiFallback && (
            <button onClick={start} disabled={!url.trim() || loading} className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("importModal.start")}</button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-card-sm border border-primary-500/20 bg-primary-500/10 p-3 text-xs text-primary-700 dark:text-primary-300">
          {t("importModal.languageNote", { language: t(`importModal.languages.${locale === "en-GB" ? "en-GB" : "de"}`) })}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{t("importModal.urlLabel")}</label>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{t("importModal.locationLabel")}</label>
          <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{t("importModal.modeLabel")}</label>
          <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="web">{t("importModal.modes.web")}</option>
            <option value="metadata">{t("importModal.modes.metadata")}</option>
            <option value="transcript">{t("importModal.modes.transcript")}</option>
            <option value="combined">{t("importModal.modes.combined")}</option>
          </select>
        </div>
        {loading && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-pill bg-light-border dark:bg-dark-border">
              <div className="h-full bg-primary-500 transition-all" style={{ width: `${Math.max(5, Math.min(100, progress))}%` }} />
            </div>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {status}
              {job?.transcription_device ? ` (${job.transcription_engine || t("importModal.defaultEngine")} ${job.transcription_device}/${job.transcription_compute_type || ""})` : ""}
            </p>
          </div>
        )}
        {needsOpenAiFallback && (
          <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium">{t("importModal.openAiFallbackTitle")}</p>
            <p className="mt-1 text-xs">{t("importModal.openAiFallbackHint")}</p>
          </div>
        )}
        {error && (
          <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function localizeImportError(message, t) {
  if (!message) return "";
  const raw = String(message);
  const normalized = raw.toLowerCase();
  const mappings = [
    ["request has been cancelled by supervisor", "finalizeTimeout"],
    ["cancelled by supervisor", "finalizeTimeout"],
    ["recipe-import-finalize", "finalizeTimeout"],
    ["Your IP address is blocked", "sourceUnavailable"],
    ["blocked from accessing this post", "sourceUnavailable"],
    ["Video unavailable", "sourceUnavailable"],
    ["This video is unavailable", "sourceUnavailable"],
    ["This post is unavailable", "sourceUnavailable"],
    ["content isn't available", "sourceUnavailable"],
    ["not available", "sourceUnavailable"],
    ["unable to extract", "sourceUnavailable"],
    ["private video", "sourceUnavailable"],
    ["private post", "sourceUnavailable"],
    ["login required", "sourceUnavailable"],
    ["HTTP Error 403", "sourceUnavailable"],
    ["Forbidden", "sourceUnavailable"],
    ["Supabase-Konfiguration oder Sitzung fehlt", "configMissing"],
    ["Tageslimit fuer Kochbuch-Importe erreicht", "dailyLimit"],
    ["Kochbuch ist deaktiviert", "cookbookDisabled"],
    ["OpenAI API-Key ist im Haushalt nicht konfiguriert", "openAiMissing"],
    ["OpenAI ist f", "openAiMissing"],
    ["Videoimport ist deaktiviert", "videoDisabled"],
    ["Parser-Service ist nicht konfiguriert", "parserMissing"],
    ["Parser-Service konnte nicht erreicht werden", "parserUnreachable"],
    ["An invalid response was received from the upstream server", "analysisFailed"],
    ["Invalid upstream response", "analysisFailed"],
    ["Rezeptanalyse fehlgeschlagen", "analysisFailed"],
    ["Ollama hat", "ollamaTimeout"],
    ["OpenAI-Fallback fehlgeschlagen", "openAiFallbackFailed"],
    ["Dieser Import wartet nicht", "openAiFallbackUnavailable"],
    ["Kein aktiver Haushalt vorhanden", "noHousehold"],
    ["Ungueltige URL", "invalidUrl"],
    ["Nur HTTPS-URLs sind erlaubt", "httpsOnly"],
    ["Import fehlgeschlagen", "importFailed"],
  ];
  const match = mappings.find(([needle]) => normalized.includes(String(needle).toLowerCase()));
  if (!match) return raw.length > 280 ? `${raw.slice(0, 280).trim()}...` : raw;
  const translated = t(`importModal.serverErrors.${match[1]}`);
  return translated;
}

function localizeProgressMessage(message, t) {
  if (!message) return "";
  const raw = String(message);
  const mappings = [
    ["Import wurde gestartet.", "started"],
    ["Parser-Service Healthcheck fehlgeschlagen.", "parserHealthFailed"],
    ["Parser-Service konnte nicht erreicht werden.", "parserUnreachable"],
    ["Rezeptseite wird gelesen.", "readWeb"],
    ["Metadaten werden gelesen.", "readMetadata"],
    ["Audio wird heruntergeladen.", "downloadAudio"],
    ["Lokale Transkription wird ausgefuehrt.", "localTranscribe"],
    ["Cloud-Transkriptionsfallback wird ausgefuehrt.", "cloudFallback"],
    ["Rezeptanalyse wird vorbereitet.", "prepareAnalysis"],
    ["Rezept wird analysiert.", "analyzing"],
    ["Ollama-Analyse wartet auf OpenAI-Bestätigung.", "openAiFallbackWaiting"],
    ["Rezept wird mit OpenAI analysiert.", "openAiAnalyzing"],
    ["Review ist bereit.", "reviewReady"],
    ["Import fehlgeschlagen.", "failed"],
  ];
  const match = mappings.find(([needle]) => raw.includes(needle));
  return match ? t(`importModal.progress.${match[1]}`) : raw;
}
