import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, ImageOff, CheckCircle, RefreshCw, ExternalLink, Link } from "lucide-react";
import {
  getBookSearchContext,
  getBookSearchQuery,
  resolveBookMatches,
  sanitizeExternalUrl,
} from "../../../utils/bookSearch";

function sammelleCovers(results) {
  const seen = new Set();
  const covers = [];

  const sorted = [...results].sort((a, b) => {
    if (a.source === "google_books" && b.source !== "google_books") return -1;
    if (a.source !== "google_books" && b.source === "google_books") return 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  for (const result of sorted) {
    for (const candidate of result.coverCandidates ?? []) {
      const url = sanitizeExternalUrl(candidate.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      covers.push({ ...candidate, url });
    }
  }
  return covers;
}

function buildGoogleImagesUrl(buchData) {
  const parts = [buchData?.titel, buchData?.autor].filter(Boolean);
  const q = encodeURIComponent(["Buchcover", ...parts].join(" "));
  return `https://www.google.com/search?tbm=isch&q=${q}`;
}

export default function BuchCoverSucheModal({ buchData, onBestaetigen, onAbbrechen }) {
  const { t } = useTranslation(["books"]);
  const [laden, setLaden] = useState(false);
  const [covers, setCovers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [manuelleUrl, setManuelleUrl] = useState("");
  const [urlFehler, setUrlFehler] = useState(null);

  const suchen = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    setCovers([]);
    setSelected(null);
    try {
      const context = getBookSearchContext(buchData);
      const { mode, query } = getBookSearchQuery(context);
      if (!query) {
        setFehler(t("books:coverSearchModal.errNoTitle"));
        return;
      }
      const resolved = await resolveBookMatches({
        query,
        mode,
        limit: 10,
        language: "",
        context,
        enableAi: false,
      });
      const collected = sammelleCovers(resolved.results);
      if (collected.length === 0) {
        setFehler(t("books:coverSearchModal.errNoneFound"));
      } else {
        setCovers(collected);
        setSelected(collected[0].url);
      }
    } catch (e) {
      console.error("[BuchCoverSuche]", e);
      setFehler(t("books:coverSearchModal.errSearchFailed"));
    } finally {
      setLaden(false);
    }
  }, [buchData, t]);

  useEffect(() => {
    suchen();
  }, [suchen]);

  const handleManuelleUrlHinzufuegen = (onSuccess) => {
    const url = manuelleUrl.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      setUrlFehler(t("books:coverSearchModal.errHttpsOnly"));
      return;
    }
    setUrlFehler(null);
    onSuccess(url);
    setManuelleUrl("");
  };

  return (
    <div className="fixed app-centered-modal-overlay z-[130] flex items-center justify-center bg-black/60">
      <div className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-2xl flex flex-col border border-light-border dark:border-dark-border overflow-hidden">

        <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("books:coverSearchModal.title")}</p>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Google Books · Open Library
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={buildGoogleImagesUrl(buchData)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-pill border border-light-border dark:border-dark-border
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:border-primary-500/40 transition-colors"
              title={t("books:coverSearchModal.openGoogle")}
            >
              <ExternalLink size={12} />
              {t("books:coverSearchModal.googleBtn")}
            </a>
            <button
              onClick={suchen}
              disabled={laden}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-pill border border-light-border dark:border-dark-border
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:border-primary-500/40 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={12} className={laden ? "animate-spin" : ""} />
              {t("books:coverSearchModal.searchAgain")}
            </button>
            <button
              onClick={onAbbrechen}
              className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mobile-modal-body flex-1 p-4">
          {laden ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-primary-500" />
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {t("books:coverSearchModal.loading")}
              </p>
            </div>
          ) : fehler ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <ImageOff size={24} className="text-light-text-secondary dark:text-dark-text-secondary" />
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{fehler}</p>
                <button
                  onClick={suchen}
                  className="text-xs text-primary-500 hover:underline"
                >
                  {t("books:coverSearchModal.retry")}
                </button>
              </div>
              <div className="border-t border-light-border dark:border-dark-border pt-3">
                <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mb-2">
                  {t("books:coverSearchModal.manualUrl")}
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
                    <input
                      type="url"
                      value={manuelleUrl}
                      onChange={(e) => setManuelleUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-pill border border-light-border dark:border-dark-border
                                 bg-light-bg dark:bg-canvas-3 text-light-text-main dark:text-dark-text-main
                                 focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                  <button
                    onClick={() => handleManuelleUrlHinzufuegen((url) => {
                      setCovers([{ id: "manual", url, label: "Manuell", source: "manuell", kind: "cover" }]);
                      setSelected(url);
                      setFehler(null);
                    })}
                    disabled={!manuelleUrl.trim()}
                    className="px-3 py-2 text-xs rounded-pill border border-light-border dark:border-dark-border
                               text-light-text-secondary dark:text-dark-text-secondary
                               hover:border-primary-500/40 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {t("books:coverSearchModal.addBtn")}
                  </button>
                </div>
                {urlFehler && <p className="mt-1.5 text-[11px] text-accent-danger">{urlFehler}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {covers.map((cover) => (
                  <button
                    key={cover.id ?? cover.url}
                    onClick={() => setSelected(cover.url)}
                    className={`rounded-card-sm border p-2 text-left transition-colors ${
                      selected === cover.url
                        ? "border-primary-500/60 bg-primary-500/5 ring-1 ring-primary-500/30"
                        : "border-light-border dark:border-dark-border hover:border-primary-500/30"
                    }`}
                  >
                    <img
                      src={cover.url}
                      alt={cover.label}
                      className="w-full h-36 object-cover rounded"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <p className="mt-1.5 text-[11px] font-medium text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {cover.label}
                    </p>
                    <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {cover.source}
                    </p>
                  </button>
                ))}
              </div>

              <div className="border-t border-light-border dark:border-dark-border pt-3">
                <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mb-2">
                  {t("books:coverSearchModal.manualUrl")}
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
                    <input
                      type="url"
                      value={manuelleUrl}
                      onChange={(e) => setManuelleUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-pill border border-light-border dark:border-dark-border
                                 bg-light-bg dark:bg-canvas-3 text-light-text-main dark:text-dark-text-main
                                 focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                  <button
                    onClick={() => handleManuelleUrlHinzufuegen((url) => {
                      const existing = covers.find((c) => c.url === url);
                      if (!existing) {
                        setCovers((prev) => [{ id: "manual", url, label: "Manuell", source: "manuell", kind: "cover" }, ...prev]);
                      }
                      setSelected(url);
                    })}
                    disabled={!manuelleUrl.trim()}
                    className="px-3 py-2 text-xs rounded-pill border border-light-border dark:border-dark-border
                               text-light-text-secondary dark:text-dark-text-secondary
                               hover:border-primary-500/40 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {t("books:coverSearchModal.addBtn")}
                  </button>
                </div>
                {urlFehler && <p className="mt-1.5 text-[11px] text-accent-danger">{urlFehler}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-end">
          <button
            onClick={onAbbrechen}
            className="px-4 py-2 text-sm rounded-pill border border-light-border dark:border-dark-border
                       text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3"
          >
            {t("books:coverSearchModal.cancel")}
          </button>
          <button
            onClick={() => selected && onBestaetigen(selected)}
            disabled={!selected}
            className="px-4 py-2 text-sm rounded-pill bg-primary-500 hover:bg-primary-600 text-white font-medium
                       inline-flex items-center gap-2 disabled:opacity-40 transition-colors"
          >
            <CheckCircle size={14} />
            {t("books:coverSearchModal.selectBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
