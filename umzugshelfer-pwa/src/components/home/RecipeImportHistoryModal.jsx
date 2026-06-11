import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, SearchCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { fetchRecipeImportJobs, startRecipeImport } from "../../utils/recipeImportService";

const ACTIVE_STATUSES = new Set([
  "queued",
  "web_extract",
  "metadata",
  "download",
  "audio_extract",
  "transcribe",
  "fallback_transcribe",
  "ai_extract",
  "needs_openai_fallback_confirmation",
]);

const TABS = [
  { key: "active", icon: Clock3 },
  { key: "review", icon: SearchCheck },
  { key: "failed", icon: AlertTriangle },
  { key: "done", icon: CheckCircle2 },
];

function tabForJob(job) {
  if (ACTIVE_STATUSES.has(job.status)) return "active";
  if (job.status === "review") return "review";
  if (job.status === "failed") return "failed";
  return "done";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function RecipeImportHistoryModal({ open, householdId, onClose, onOpenReview }) {
  const { t } = useTranslation("recipes");
  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    if (!open || !householdId) return;
    try {
      setError("");
      const rows = await fetchRecipeImportJobs({ householdId, limit: 50 });
      setJobs(rows || []);
    } catch (err) {
      setError(err.message || t("imports.loadFailed"));
    }
  }, [householdId, open, t]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const groups = useMemo(() => jobs.reduce((acc, job) => {
    const key = tabForJob(job);
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {}), [jobs]);

  const retry = async (job) => {
    setBusyId(job.id);
    try {
      await startRecipeImport({
        url: job.quelle_url,
        location: job.standort,
        mode: job.analyse_modus || "combined",
      });
      await loadJobs();
    } catch (err) {
      setError(err.message || t("imports.retryFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const visibleJobs = groups[activeTab] || [];

  return (
    <ModalShell open={open} title={t("imports.title")} onClose={onClose} maxWidthClass="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm transition-colors ${
                activeTab === key
                  ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                  : "border-light-border text-light-text-secondary hover:text-light-text-main dark:border-dark-border dark:text-dark-text-secondary"
              }`}
            >
              <Icon size={14} />
              {t(`imports.tabs.${key}`)}
              <span className="text-xs opacity-75">{(groups[key] || []).length}</span>
            </button>
          ))}
        </div>
        {error && <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        {visibleJobs.length === 0 ? (
          <p className="rounded-card-sm border border-light-border p-4 text-sm text-light-text-secondary dark:border-dark-border dark:text-dark-text-secondary">
            {t("imports.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-card-sm border border-light-border bg-light-card p-3 dark:border-dark-border dark:bg-canvas-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">{job.quelle_url}</p>
                    <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      {[job.quelle_plattform, job.status, formatDate(job.created_at)].filter(Boolean).join(" · ")}
                    </p>
                    {job.error_message && (
                      <p className="mt-2 rounded-card-sm bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-400">
                        {job.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {job.status === "review" && job.result_rezept_id && (
                      <button
                        type="button"
                        onClick={() => onOpenReview?.(job.result_rezept_id)}
                        className="rounded-pill bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {t("imports.review")}
                      </button>
                    )}
                    {job.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => retry(job)}
                        disabled={busyId === job.id}
                        className="inline-flex items-center gap-1 rounded-pill border border-light-border px-3 py-1.5 text-xs text-light-text-main disabled:opacity-50 dark:border-dark-border dark:text-dark-text-main"
                      >
                        <RotateCcw size={12} /> {busyId === job.id ? t("imports.retrying") : t("imports.retry")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
