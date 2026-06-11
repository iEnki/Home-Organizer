import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import ModalShell from "../ui/ModalShell";
import {
  formatRecipeImportError,
  getRecipeImportDisplayStatus,
  isOpenReviewImport,
  isSavedReviewImport,
} from "../../utils/recipeImportService";

const RUNNING_STATUSES = new Set(["web_extract", "metadata", "download", "audio_extract", "transcribe", "fallback_transcribe", "ai_extract", "needs_openai_fallback_confirmation"]);

function statusLabel(status) {
  const labels = {
    queued: "Wartet",
    web_extract: "Liest Webseite",
    metadata: "Liest Metadaten",
    download: "Laedt Audio",
    audio_extract: "Extrahiert Audio",
    transcribe: "Transkribiert",
    fallback_transcribe: "Transkribiert per Fallback",
    ai_extract: "Analysiert Rezept",
    needs_openai_fallback_confirmation: "Wartet auf OpenAI-Fortsetzung",
    review: "Bereit zur Pruefung",
    done: "Abgeschlossen",
    failed: "Fehlgeschlagen",
  };
  return labels[status] || status || "Unbekannt";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "";
  }
}

function JobIcon({ status }) {
  if (status === "failed") return <AlertTriangle size={16} className="text-red-500" />;
  if (status === "review") return <Eye size={16} className="text-primary-500" />;
  if (status === "done") return <CheckCircle2 size={16} className="text-emerald-500" />;
  if (RUNNING_STATUSES.has(status)) return <Loader2 size={16} className="animate-spin text-secondary-500" />;
  return <Clock3 size={16} className="text-light-text-secondary dark:text-dark-text-secondary" />;
}

function JobRow({ job, queuePosition, onReview, onRetry, onContinueOpenAi, busy }) {
  const displayStatus = getRecipeImportDisplayStatus(job);
  const canReview = isOpenReviewImport(job);
  const canRetry = job.status === "failed" || (job.status === "queued" && !job.started_at);
  const canContinue = job.status === "needs_openai_fallback_confirmation";
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  const errorMessage = formatRecipeImportError(job.error_message);
  const title = job.result_recipe?.titel || job.quelle_url || "Import";

  return (
    <div className="rounded-card-sm border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-canvas-1">
      <div className="flex items-start gap-3">
        <div className="mt-0.5"><JobIcon status={displayStatus} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              {title}
            </p>
            {queuePosition ? (
              <span className="rounded-pill bg-light-card px-2 py-0.5 text-[11px] text-light-text-secondary dark:bg-canvas-2 dark:text-dark-text-secondary">
                Platz {queuePosition}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {statusLabel(displayStatus)} / {job.quelle_plattform || "web"} / {formatDate(job.created_at)}
          </p>
          {job.progress_message ? (
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{job.progress_message}</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 rounded-card-sm border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">{errorMessage}</p>
          ) : null}
          {displayStatus !== "done" && displayStatus !== "failed" ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-light-border dark:bg-dark-border">
              <div className="h-full bg-primary-500 transition-all" style={{ width: `${Math.max(5, progress)}%` }} />
            </div>
          ) : null}
        </div>
      </div>
      {(canReview || canRetry || canContinue) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {canContinue && (
            <button
              type="button"
              onClick={() => onContinueOpenAi(job)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-pill border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-700 disabled:opacity-50 dark:text-amber-300"
            >
              <RefreshCw size={13} /> Mit OpenAI fortsetzen
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry(job)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-1.5 text-xs font-medium text-light-text-main disabled:opacity-50 dark:border-dark-border dark:text-dark-text-main"
            >
              <RotateCcw size={13} /> Neu starten
            </button>
          )}
          {canReview && (
            <button
              type="button"
              onClick={() => onReview(job)}
              className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Eye size={13} /> Pruefen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecipeImportQueuePanel({ open, onClose, jobs = [], onReview, onRetry, onContinueOpenAi, busyJobId }) {
  const [tab, setTab] = useState("active");
  const queuedIds = useMemo(
    () => jobs.filter((job) => job.status === "queued").sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((job) => job.id),
    [jobs],
  );
  const groups = useMemo(() => ({
    active: jobs.filter((job) => job.status === "queued" || RUNNING_STATUSES.has(job.status)),
    review: jobs.filter((job) => isOpenReviewImport(job)),
    failed: jobs.filter((job) => job.status === "failed"),
    done: jobs.filter((job) => job.status === "done" || isSavedReviewImport(job)),
  }), [jobs]);
  const tabs = [
    ["active", "Aktiv", groups.active.length],
    ["review", "Pruefen", groups.review.length],
    ["failed", "Fehler", groups.failed.length],
    ["done", "Fertig", groups.done.length],
  ];
  const visible = groups[tab] || [];

  return (
    <ModalShell open={open} onClose={onClose} title="Rezeptimporte" maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-card-sm px-3 py-1.5 text-sm font-medium transition ${
                tab === key
                  ? "bg-primary-500 text-white"
                  : "border border-light-border text-light-text-secondary hover:text-light-text-main dark:border-dark-border dark:text-dark-text-secondary dark:hover:text-dark-text-main"
              }`}
            >
              {label} <span className="ml-1 opacity-80">{count}</span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="rounded-card-sm border border-light-border bg-light-bg p-6 text-center text-sm text-light-text-secondary dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-secondary">
            Keine Importe in diesem Bereich.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                queuePosition={job.status === "queued" ? queuedIds.indexOf(job.id) + 1 : null}
                onReview={onReview}
                onRetry={onRetry}
                onContinueOpenAi={onContinueOpenAi}
                busy={busyJobId === job.id}
              />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
