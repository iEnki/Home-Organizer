import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Edit2,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";
import {
  buildBookMetadataUpdate,
  getBookSearchContext,
  getBookSearchQuery,
  persistSelectedBookCover,
  resolveBookMatches,
} from "../../../utils/bookSearch";
import BuchTrefferReviewModal from "./BuchTrefferReviewModal";
import GlassSurface, { glassCollapseVariants } from "../../ui/GlassSurface";

const STATUS_CONFIG = {
  im_regal:   { dot: "bg-primary-500",        badge: "border-primary-500/30 bg-primary-500/15 text-primary-500" },
  verliehen:  { dot: "bg-accent-yellow",       badge: "border-accent-yellow/30 bg-accent-yellow/15 text-accent-yellow" },
  vermisst:   { dot: "bg-accent-danger",       badge: "border-accent-danger/30 bg-accent-danger/15 text-accent-danger" },
  verschenkt: { dot: "bg-secondary-500",       badge: "border-secondary-500/30 bg-secondary-500/15 text-secondary-500" },
  entsorgt:   { dot: "bg-light-text-secondary dark:bg-dark-text-secondary", badge: "border-dark-border bg-canvas-3 text-dark-text-secondary" },
};

export default function BuchZeile({ buch, onBearbeiten, onVerleihen, onLoeschen, onAktualisiert, index = 0 }) {
  const { t } = useTranslation(["books"]);
  const reducedMotion = useReducedMotion();
  const [offen, setOffen] = useState(false);
  const [beschreibungOffen, setBeschreibungOffen] = useState(false);
  const [refreshLaden, setRefreshLaden] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [refreshVorschau, setRefreshVorschau] = useState(null);
  const [refreshTreffer, setRefreshTreffer] = useState([]);
  const [refreshConflicts, setRefreshConflicts] = useState([]);

  const statusLabel = t(`books:status.${buch.status}`, { defaultValue: buch.status });
  const statusCfg = STATUS_CONFIG[buch.status] ?? STATUS_CONFIG.im_regal;
  const coverUrl = getBuchCoverUrl(buch);

  const resetRefreshState = () => {
    setRefreshStatus(null);
    setRefreshVorschau(null);
    setRefreshTreffer([]);
    setRefreshConflicts([]);
  };

  const handleMetadatenRefresh = async () => {
    setRefreshLaden(true);
    resetRefreshState();
    try {
      const context = getBookSearchContext(buch);
      const { mode, query } = getBookSearchQuery(context);
      const resolved = await resolveBookMatches({
        query,
        mode,
        limit: 5,
        language: mode === "isbn" ? (context.language || "de") : "",
        context,
        enableAi: true,
      });

      if (!resolved.results.length || !resolved.selected) {
        setRefreshStatus("kein_treffer");
        return;
      }

      if (resolved.needsReview) {
        setRefreshTreffer(resolved.results);
        setRefreshConflicts(resolved.coreConflicts);
        setRefreshStatus("review");
        return;
      }

      setRefreshVorschau(resolved.selected);
      setRefreshStatus("vorschau");
    } catch {
      setRefreshStatus("fehler");
    } finally {
      setRefreshLaden(false);
    }
  };

  const handleRefreshBestaetigen = async (selected = refreshVorschau, coverUrl = null) => {
    if (!selected) return;

    const effectiveCoverUrl = coverUrl ?? getBuchCoverUrl(selected);
    const update = buildBookMetadataUpdate(buch, selected, effectiveCoverUrl);
    const persistedCover = await persistSelectedBookCover({
      householdId: buch.household_id,
      bookId: buch.id,
      selectedCoverUrl: effectiveCoverUrl,
    });

    if (persistedCover?.publicUrl) {
      update.cover_url = persistedCover.publicUrl;
      update.thumbnail_url = persistedCover.publicUrl;
      update.api_payload = {
        ...(update.api_payload ?? {}),
        selectedCover: {
          ...((update.api_payload ?? {}).selectedCover ?? {}),
          storedUrl: persistedCover.publicUrl,
          storagePath: persistedCover.storagePath ?? null,
        },
      };
    }

    if (Object.keys(update).length) {
      await supabase.from("home_buecher").update(update).eq("id", buch.id);
    }

    setRefreshStatus("ok");
    setRefreshVorschau(null);
    setRefreshTreffer([]);
    setRefreshConflicts([]);
    if (onAktualisiert) await onAktualisiert();
  };

  return (
    <>
      <GlassSurface as="article" className="overflow-hidden rounded-card-sm">
        <button
          onClick={() => setOffen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Cover thumbnail */}
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                loading="lazy"
                className="w-8 h-12 object-cover rounded shrink-0 shadow-elevation-1"
              />
            ) : (
              <div className="w-8 h-12 rounded shrink-0 bg-gradient-to-br from-secondary-500/20 via-canvas-3 to-primary-500/20 flex items-center justify-center">
                <BookOpen size={13} className="text-secondary-500 opacity-60" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate">{buch.titel}</p>
              {buch.autor_anzeige && (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{buch.autor_anzeige}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusCfg.badge}`}>
              <span className={`h-1 w-1 rounded-full shrink-0 ${statusCfg.dot}`} />
              {statusLabel}
            </span>
            {offen ? (
              <ChevronUp size={15} className="text-light-text-secondary dark:text-dark-text-secondary" />
            ) : (
              <ChevronDown size={15} className="text-light-text-secondary dark:text-dark-text-secondary" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
        {offen && (
          <motion.div
            key="details"
            variants={reducedMotion ? {} : glassCollapseVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="overflow-hidden border-t border-light-border dark:border-dark-border"
          >
          <div className="px-4 pb-4 pt-1 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {buch.verlag && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.publisher")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5">{buch.verlag}</p>
                </div>
              )}
              {buch.erscheinungsjahr && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.year")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5">{buch.erscheinungsjahr}</p>
                </div>
              )}
              {buch.isbn_13 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.isbn13")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5 font-mono">{buch.isbn_13}</p>
                </div>
              )}
              {buch.seitenzahl && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.pages")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5">{buch.seitenzahl}</p>
                </div>
              )}
              {buch.zustand && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.conditionLabel")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5">
                    {t(`books:condition.${buch.zustand}`, { defaultValue: buch.zustand })}
                  </p>
                </div>
              )}
              {buch.anzahl > 1 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.quantity")}</span>
                  <p className="font-medium text-light-text-main dark:text-dark-text-main mt-0.5">{buch.anzahl}</p>
                </div>
              )}
            </div>

            {buch.status === "verliehen" && (
              <div className="rounded-card-sm border border-accent-yellow/30 bg-accent-yellow/5 px-3 py-2.5 text-xs space-y-1">
                {buch.verliehen_an_name && (
                  <p className="text-light-text-main dark:text-dark-text-main">{t("books:row.loanedTo")}: <strong className="text-accent-yellow">{buch.verliehen_an_name}</strong></p>
                )}
                {buch.verliehen_seit && (
                  <p className="text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.loanedSince")}: {buch.verliehen_seit}</p>
                )}
                {buch.rueckgabe_erwartet_am && (
                  <p className="text-light-text-secondary dark:text-dark-text-secondary">{t("books:row.returnBy")}: {buch.rueckgabe_erwartet_am}</p>
                )}
              </div>
            )}

            {buch.notizen && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary italic">{buch.notizen}</p>
            )}

            {buch.beschreibung && (
              <div className="space-y-2">
                <button
                  onClick={() => setBeschreibungOffen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-pill border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 transition-colors"
                >
                  {beschreibungOffen ? t("books:row.hideDesc") : t("books:row.showDesc")}
                </button>
                {beschreibungOffen && (
                  <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-xs leading-5 text-light-text-main dark:text-dark-text-main whitespace-pre-wrap">
                    {buch.beschreibung}
                  </div>
                )}
              </div>
            )}

            {buch.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {buch.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 text-xs rounded-pill bg-secondary-500/10 text-secondary-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {refreshStatus === "vorschau" && refreshVorschau && (
              <div className="rounded-card-sm border border-primary-500/30 bg-primary-500/5 px-3 py-2.5 text-xs space-y-1.5">
                <p className="font-semibold text-light-text-main dark:text-dark-text-main">{t("books:row.newMetadata")}</p>
                {refreshVorschau.description && (
                  <p className="text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                    {refreshVorschau.description}
                  </p>
                )}
                {refreshVorschau.publisher && <p className="text-light-text-main dark:text-dark-text-main">{t("books:row.publisher")}: <span className="font-medium">{refreshVorschau.publisher}</span></p>}
                {refreshVorschau.pageCount && <p className="text-light-text-main dark:text-dark-text-main">{t("books:row.pages")}: <span className="font-medium">{refreshVorschau.pageCount}</span></p>}
                {refreshVorschau.publishedYear && <p className="text-light-text-main dark:text-dark-text-main">{t("books:row.year")}: <span className="font-medium">{refreshVorschau.publishedYear}</span></p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleRefreshBestaetigen(refreshVorschau, getBuchCoverUrl(refreshVorschau))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors"
                  >
                    <CheckCircle size={11} /> {t("books:row.apply")}
                  </button>
                  <button
                    onClick={resetRefreshState}
                    className="px-3 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main text-xs hover:bg-light-border dark:hover:bg-canvas-3 transition-colors"
                  >
                    {t("books:row.reject")}
                  </button>
                </div>
              </div>
            )}

            {refreshStatus === "ok" && (
              <p className="text-xs text-primary-500 flex items-center gap-1.5">
                <CheckCircle size={12} /> {t("books:row.metaUpdated")}
              </p>
            )}
            {refreshStatus === "kein_treffer" && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
                <AlertCircle size={12} /> {t("books:row.noMatch")}
              </p>
            )}
            {refreshStatus === "fehler" && (
              <p className="text-xs text-accent-danger flex items-center gap-1.5">
                <AlertCircle size={12} /> {t("books:row.searchUnavailable")}
              </p>
            )}

            <div className="flex gap-2 pt-1 flex-wrap border-t border-light-border dark:border-dark-border">
              <button
                onClick={() => onBearbeiten(buch)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-primary-500/10 hover:text-primary-500 hover:border-primary-500/30 transition-colors"
              >
                <Edit2 size={11} /> {t("books:row.edit")}
              </button>
              <button
                onClick={() => onVerleihen(buch)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-secondary-500/10 hover:text-secondary-500 hover:border-secondary-500/30 transition-colors"
              >
                <ArrowRightLeft size={11} />
                {buch.status === "verliehen" ? t("books:row.loan") : t("books:row.lend")}
              </button>
              <button
                onClick={handleMetadatenRefresh}
                disabled={refreshLaden}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 transition-colors disabled:opacity-50"
              >
                {refreshLaden ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {t("books:row.refresh")}
              </button>
              <button
                onClick={() => onLoeschen(buch)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10 transition-colors"
              >
                <Trash2 size={11} /> {t("books:row.delete")}
              </button>
            </div>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </GlassSurface>

      <BuchTrefferReviewModal
        offen={refreshStatus === "review" && refreshTreffer.length > 0}
        buch={buch}
        results={refreshTreffer}
        conflicts={refreshConflicts}
        onBestaetigen={handleRefreshBestaetigen}
        onAbbrechen={resetRefreshState}
      />
    </>
  );
}
