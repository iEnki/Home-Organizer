import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, BookOpen, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";

function ScoreBadge({ score, needsReview }) {
  if (needsReview) {
    return <span className="px-2 py-0.5 text-xs rounded-pill bg-amber-500/10 text-amber-700 dark:text-amber-300">Prüfen</span>;
  }
  if ((score ?? 0) >= 2.2) {
    return <span className="px-2 py-0.5 text-xs rounded-pill bg-green-500/10 text-green-700 dark:text-green-300">Sicher</span>;
  }
  return <span className="px-2 py-0.5 text-xs rounded-pill bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">Treffer</span>;
}

export default function BuchTrefferReviewModal({
  offen,
  buch,
  results = [],
  conflicts = [],
  onBestaetigen,
  onAbbrechen,
}) {
  const { t } = useTranslation(["books"]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState(null);

  const diffLabel = (field) => ({
    titel: t("books:form.titleLabel").replace(/\s*\*\s*$/, ""),
    untertitel: t("books:form.subtitle"),
    autoren: t("books:form.authors").replace(/\s*\(.*$/, ""),
    isbn_13: "ISBN-13",
    isbn_10: "ISBN-10",
  })[field] ?? field;

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const selectedResult = results[selectedIndex] ?? null;
  const coverOptions = useMemo(() => {
    if (!selectedResult) return [];
    const fromResult = Array.isArray(selectedResult.coverCandidates) ? selectedResult.coverCandidates : [];
    if (fromResult.length) return fromResult;
    const fallbackUrl = getBuchCoverUrl(selectedResult);
    return fallbackUrl
      ? [{ id: "fallback", url: fallbackUrl, label: "Standardcover", source: selectedResult.source, kind: "cover" }]
      : [];
  }, [selectedResult]);

  useEffect(() => {
    setSelectedCoverUrl(coverOptions[0]?.url ?? null);
  }, [coverOptions]);

  if (!offen || !selectedResult) return null;

  return (
    <div className="fixed app-centered-modal-overlay z-[120] flex items-center justify-center bg-black/60">
      <div
        className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-4xl flex flex-col border border-light-border dark:border-dark-border overflow-hidden"
      >
        <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{t("books:matchReview.title")}</p>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {t("books:matchReview.info")}
            </p>
          </div>
          <button onClick={onAbbrechen} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        <div className="mobile-modal-body flex-1 p-4 grid gap-4 lg:grid-cols-[1.2fr_1.8fr]">
          <div className="space-y-3">
            <div className="rounded-card-sm border border-light-border dark:border-dark-border p-3">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">{t("books:matchReview.currentBook")}</p>
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{buch?.titel}</p>
              {buch?.autor_anzeige && (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">{buch.autor_anzeige}</p>
              )}
              <div className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary space-y-1">
                {buch?.isbn_13 && <p>ISBN-13: {buch.isbn_13}</p>}
                {buch?.verlag && <p>{t("books:row.publisher")}: {buch.verlag}</p>}
                {buch?.erscheinungsjahr && <p>{t("books:row.year")}: {buch.erscheinungsjahr}</p>}
              </div>
            </div>

            {conflicts.length > 0 && (
              <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t("books:matchReview.coreFieldsDiffer")}</p>
                    <p className="mt-1">{conflicts.map(diffLabel).join(", ")}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-card-sm border border-light-border dark:border-dark-border p-3">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">{t("books:matchReview.selectMatch")}</p>
              <div className="space-y-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.source}-${result.sourceRef}-${index}`}
                    onClick={() => setSelectedIndex(index)}
                    className={`w-full text-left p-3 rounded-card-sm border transition-colors ${
                      selectedIndex === index
                        ? "border-teal-500/40 bg-teal-500/5"
                        : "border-light-border dark:border-dark-border hover:border-teal-500/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {getBuchCoverUrl(result) ? (
                        <img src={getBuchCoverUrl(result)} alt="" className="w-10 h-14 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-teal-500/10 flex items-center justify-center shrink-0">
                          <BookOpen size={14} className="text-teal-500" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">{result.title}</p>
                          <ScoreBadge score={result.score} needsReview={!!result.needsReview} />
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                          {result.authorDisplay || t("books:matchReview.unknownAuthor")}{result.publishedYear ? ` · ${result.publishedYear}` : ""}
                        </p>
                        {(result.matchReasons ?? []).length > 0 && (
                          <p className="mt-1 text-xs text-teal-700 dark:text-teal-300 truncate">
                            {(result.matchReasons ?? []).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-card-sm border border-light-border dark:border-dark-border p-3">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">{t("books:matchReview.selectedMatch")}</p>
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">{selectedResult.title}</p>
              {selectedResult.subtitle && (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">{selectedResult.subtitle}</p>
              )}
              <div className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary space-y-1">
                {selectedResult.authorDisplay && <p>{t("books:matchReview.authorLabel")}: {selectedResult.authorDisplay}</p>}
                {selectedResult.publisher && <p>{t("books:row.publisher")}: {selectedResult.publisher}</p>}
                {selectedResult.publishedYear && <p>{t("books:row.year")}: {selectedResult.publishedYear}</p>}
                {selectedResult.isbn13 && <p>ISBN-13: {selectedResult.isbn13}</p>}
                {selectedResult.isbn10 && <p>ISBN-10: {selectedResult.isbn10}</p>}
              </div>
            </div>

            <div className="rounded-card-sm border border-light-border dark:border-dark-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{t("books:matchReview.selectCover")}</p>
              </div>
              {coverOptions.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {coverOptions.map((cover) => (
                    <button
                      key={cover.id}
                      onClick={() => setSelectedCoverUrl(cover.url)}
                      className={`rounded-card-sm border p-2 text-left transition-colors ${
                        selectedCoverUrl === cover.url
                          ? "border-teal-500/40 bg-teal-500/5"
                          : "border-light-border dark:border-dark-border hover:border-teal-500/30"
                      }`}
                    >
                      <img src={cover.url} alt={cover.label} className="w-full h-36 object-cover rounded" />
                      <p className="mt-2 text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">{cover.label}</p>
                      <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">{cover.source}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("books:matchReview.noCover")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-end">
          <button
            onClick={onAbbrechen}
            className="px-4 py-2 text-sm rounded-pill border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
          >
            {t("books:matchReview.cancel")}
          </button>
          <button
            onClick={() => onBestaetigen(selectedResult, selectedCoverUrl)}
            className="px-4 py-2 text-sm rounded-pill bg-primary-500 text-white font-medium inline-flex items-center gap-2"
          >
            <CheckCircle size={14} />
            {t("books:matchReview.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
