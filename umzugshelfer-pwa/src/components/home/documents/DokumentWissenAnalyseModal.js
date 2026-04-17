import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  FileSearch,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { supabase, getActiveHouseholdId } from "../../../supabaseClient";
import { logVerlauf } from "../../../utils/homeVerlauf";
import {
  WISSEN_KATEGORIEN,
  analyzeDocumentForKnowledge,
  buildKnowledgeSummaryText,
  deriveKnowledgeTitle,
  isManualKnowledgeOverride,
  mergeUniqueTags,
  shouldKeepExistingKnowledgeTitle,
} from "../../../utils/documentKnowledgeAnalysis";

const ARCHIVE_DOCUMENT_TYPES = [
  { value: "versicherung", label: "Versicherung" },
  { value: "vertrag", label: "Vertrag" },
  { value: "rechnung", label: "Rechnung" },
  { value: "behoerde", label: "Behoerde" },
  { value: "anleitung", label: "Anleitung" },
  { value: "garantie", label: "Garantie" },
  { value: "handbuch", label: "Handbuch" },
  { value: "gesundheit", label: "Gesundheit" },
  { value: "sonstiges", label: "Sonstiges" },
];

const CARD_CLASS_LABELS = {
  versicherung: "Versicherung",
  vertrag: "Vertrag",
  rechnung: "Rechnung",
  behoerde: "Behoerde",
  anleitung: "Anleitung",
  geraet: "Geraet",
  kontakt: "Kontakt",
  masse: "Masse",
  notiz: "Notiz",
  sonstiges: "Sonstiges",
};

const mergeMeta = (baseMeta, nextAnalysis) => ({
  ...(baseMeta || {}),
  knowledge_analysis: {
    ...(baseMeta?.knowledge_analysis || {}),
    ...nextAnalysis,
  },
});

const normalizeTagsInput = (value) =>
  String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatConfidence = (confidence) =>
  Number.isFinite(Number(confidence)) ? `${Math.round(Number(confidence) * 100)} %` : "Unbekannt";

const resolveHouseholdId = async (userId) => {
  const activeHouseholdId = getActiveHouseholdId();
  if (activeHouseholdId) return activeHouseholdId;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Haushalt konnte nicht ermittelt werden: ${error.message}`);
  }

  return data?.household_id || null;
};

export default function DokumentWissenAnalyseModal({
  dok,
  userId,
  session,
  onSchliessen,
  onErfolgreich,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [existingEntry, setExistingEntry] = useState(null);
  const [lockState, setLockState] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Sonstiges");
  const [documentType, setDocumentType] = useState("sonstiges");
  const [tagsInput, setTagsInput] = useState("");
  const [manualContent, setManualContent] = useState("");

  const previewTags = useMemo(() => normalizeTagsInput(tagsInput), [tagsInput]);

  const hydratePreview = (analysis, entry, documentRow) => {
    const keepManualContent = isManualKnowledgeOverride(entry);
    const mergedTags = mergeUniqueTags(documentRow?.tags, entry?.tags, analysis?.tags);
    const suggestedTitle = shouldKeepExistingKnowledgeTitle(entry)
      ? entry.titel
      : deriveKnowledgeTitle(documentRow, analysis);

    setTitle(suggestedTitle || "");
    setCategory(documentRow?.kategorie || entry?.kategorie || analysis?.category || "Sonstiges");
    setDocumentType(documentRow?.dokument_typ || analysis?.documentType || "sonstiges");
    setTagsInput(mergedTags.join(", "));
    setManualContent(
      keepManualContent
        ? entry?.inhalt || ""
        : buildKnowledgeSummaryText(analysis)
    );
  };

  const runAnalysis = async (force = false) => {
    if (!dok?.id || !userId || !session) return;

    setLoading(true);
    setError("");

    try {
      const householdId = await resolveHouseholdId(userId);
      if (!householdId) {
        throw new Error("Kein aktiver Haushalt gefunden.");
      }

      let claimedStatus = null;
      try {
        const { data, error: claimError } = await supabase.rpc("claim_doc_processing", {
          p_dokument_id: dok.id,
          p_level: "knowledge_analysis",
          p_household_id: householdId,
          p_force: force,
        });
        if (!claimError) claimedStatus = data;
      } catch {
        claimedStatus = null;
      }
      setLockState(claimedStatus);

      if (claimedStatus === "busy") {
        throw new Error("Dieses Dokument wird bereits analysiert. Bitte spaeter erneut versuchen.");
      }

      const [{ data: entryData }, { data: fileBlob, error: downloadError }] = await Promise.all([
        supabase
          .from("home_wissen")
          .select("*")
          .eq("dokument_id", dok.id)
          .maybeSingle(),
        supabase.storage.from("user-dokumente").download(dok.storage_pfad),
      ]);

      if (downloadError || !fileBlob) {
        throw new Error(downloadError?.message || "Datei konnte nicht geladen werden.");
      }

      const fileType = dok.datei_typ || fileBlob.type || "";
      const file = new File([fileBlob], dok.dateiname || "dokument", { type: fileType });
      const result = await analyzeDocumentForKnowledge({
        file,
        dok,
        session,
        userId,
      });

      setExistingEntry(entryData || null);

      if (!result.ok) {
        setAnalysisResult(null);
        setError(result.message || "Analyse fehlgeschlagen.");
        return;
      }

      setAnalysisResult(result);
      hydratePreview(result.analysis, entryData || null, dok);

      await supabase
        .from("dokumente")
        .update({
          extrahierter_text: result.extractedText || dok.extrahierter_text || null,
          meta: mergeMeta(dok.meta, {
            status: "preview_ready",
            source: result.source,
            confidence: result.analysis.confidence,
            requiresReview: result.analysis.requiresReview,
            lastAnalyzedAt: new Date().toISOString(),
            errorCode: null,
          }),
        })
        .eq("id", dok.id);
    } catch (err) {
      const nextMessage = err?.message || "Analyse fehlgeschlagen.";
      setAnalysisResult(null);
      setError(nextMessage);
      try {
        await supabase
          .from("dokumente")
          .update({
            meta: mergeMeta(dok.meta, {
              status: "failed",
              errorCode: "analysis_failed",
              lastAnalyzedAt: new Date().toISOString(),
            }),
          })
          .eq("id", dok.id);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dok?.id, userId]);

  const handleSpeichern = async () => {
    if (!analysisResult?.analysis || !title.trim()) return;

    setSaving(true);
    setError("");

    try {
      const householdId = await resolveHouseholdId(userId);
      if (!householdId) {
        throw new Error("Kein aktiver Haushalt gefunden.");
      }

      const reviewedTags = mergeUniqueTags(dok.tags, existingEntry?.tags, previewTags);
      const existingSummary = existingEntry?.summary || {};
      const keepManualContent = isManualKnowledgeOverride(existingEntry);
      const nextSummary = {
        ...analysisResult.analysis,
        source: analysisResult.source,
        manual_override: existingSummary.manual_override === true,
      };

      const knowledgePayload = {
        user_id: userId,
        household_id: householdId,
        titel: title.trim(),
        inhalt: keepManualContent ? (existingEntry?.inhalt || manualContent.trim() || null) : (manualContent.trim() || null),
        kategorie: category,
        tags: reviewedTags,
        dokument_id: dok.id,
        herkunft: analysisResult.analysis.requiresReview ? "auto_low_confidence" : "auto_full",
        summary: nextSummary,
        analysis_confidence: analysisResult.analysis.confidence,
      };

      const docMeta = mergeMeta(dok.meta, {
        status: "done",
        source: analysisResult.source,
        confidence: analysisResult.analysis.confidence,
        requiresReview: analysisResult.analysis.requiresReview,
        lastAnalyzedAt: new Date().toISOString(),
        errorCode: null,
      });

      if (existingEntry?.id) {
        const knowledgeUpdate = {
          ...knowledgePayload,
          titel: shouldKeepExistingKnowledgeTitle(existingEntry) ? existingEntry.titel : knowledgePayload.titel,
          inhalt: keepManualContent ? existingEntry?.inhalt || knowledgePayload.inhalt : knowledgePayload.inhalt,
        };

        const { error: wissenError } = await supabase
          .from("home_wissen")
          .update(knowledgeUpdate)
          .eq("id", existingEntry.id);
        if (wissenError) throw wissenError;

        await logVerlauf(supabase, userId, "home_wissen", knowledgeUpdate.titel, "geaendert");
      } else {
        const { error: wissenError } = await supabase
          .from("home_wissen")
          .insert(knowledgePayload);
        if (wissenError) throw wissenError;

        await logVerlauf(supabase, userId, "home_wissen", knowledgePayload.titel, "erstellt");
      }

      const { error: docError } = await supabase
        .from("dokumente")
        .update({
          kategorie: category,
          dokument_typ: documentType,
          tags: reviewedTags,
          extrahierter_text: analysisResult.extractedText || dok.extrahierter_text || null,
          meta: docMeta,
        })
        .eq("id", dok.id);
      if (docError) throw docError;

      onErfolgreich?.();
    } catch (err) {
      setError(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const cardHighlights = analysisResult?.analysis?.highlights || [];
  const cardWarnings = analysisResult?.analysis?.warnings || [];
  const detailPairs = analysisResult?.analysis?.details || [];

  return (
    <div className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm">
      <div className="mobile-modal-dialog w-full max-w-3xl bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 flex min-h-0 flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-light-border dark:border-dark-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" /> Dokument als Wissen analysieren
            </h2>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 truncate">
              {dok?.dateiname}
            </p>
          </div>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mobile-modal-body flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-6 flex items-center gap-3 text-sm text-light-text-main dark:text-dark-text-main">
              <Loader2 size={18} className="animate-spin text-amber-500" />
              Dokument wird analysiert...
            </div>
          )}

          {!loading && error && (
            <div className="space-y-3">
              <div className="p-4 rounded-card-sm bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>{error}</p>
                  {lockState === "busy" ? null : (
                    <p className="text-xs opacity-80">
                      Du kannst das Dokument spaeter erneut analysieren oder manuell als Wissen erfassen.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => runAnalysis(true)}
                  className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main inline-flex items-center gap-2"
                >
                  <RefreshCw size={14} /> Erneut analysieren
                </button>
              </div>
            </div>
          )}

          {!loading && analysisResult?.analysis && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                      Titel
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                        Wissenskategorie
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
                      >
                        {WISSEN_KATEGORIEN.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                        Dokumenttyp
                      </label>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
                      >
                        {ARCHIVE_DOCUMENT_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                      Tags
                    </label>
                    <input
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="versicherung, hausrat, kuendigung"
                      className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                      Detailtext
                    </label>
                    <textarea
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-amber-500 font-semibold">
                          {CARD_CLASS_LABELS[analysisResult.analysis.documentClass] || "Dokument"}
                          {analysisResult.analysis.documentSubtype ? ` · ${analysisResult.analysis.documentSubtype}` : ""}
                        </p>
                        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mt-1">
                          {analysisResult.analysis.headline}
                        </h3>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                          Confidence
                        </p>
                        <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                          {formatConfidence(analysisResult.analysis.confidence)}
                        </p>
                      </div>
                    </div>

                    {cardHighlights.length > 0 && (
                      <div className="space-y-2">
                        {cardHighlights.map((item) => (
                          <div
                            key={item}
                            className="rounded-card-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    )}

                    {cardWarnings.length > 0 && (
                      <div className="space-y-1">
                        {cardWarnings.map((item) => (
                          <div
                            key={item}
                            className="rounded-card-sm bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 px-3 py-2 text-xs"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    )}

                    {previewTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {previewTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-primary-500/10 text-primary-500 text-[11px]"
                          >
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-card border border-light-border dark:border-dark-border p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-light-text-main dark:text-dark-text-main">
                      <FileSearch size={14} className="text-primary-500" /> Details
                    </div>
                    {detailPairs.length > 0 ? (
                      <div className="space-y-2">
                        {detailPairs.map((detail) => (
                          <div key={`${detail.label}-${detail.value}`} className="flex items-start justify-between gap-3 text-sm">
                            <span className="text-light-text-secondary dark:text-dark-text-secondary">{detail.label}</span>
                            <span className="text-right text-light-text-main dark:text-dark-text-main">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        Keine strukturierten Details erkannt.
                      </p>
                    )}

                    {analysisResult.analysis.requiresReview && (
                      <div className="rounded-card-sm bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        KI ist sich bei diesem Dokument nicht voll sicher. Bitte Vorschau und Felder vor dem Speichern pruefen.
                      </div>
                    )}

                    {existingEntry?.dokument_id && (
                      <div className="rounded-card-sm bg-primary-500/5 border border-primary-500/20 px-3 py-2 text-xs text-primary-500 flex items-start gap-2">
                        <BookOpen size={12} className="mt-0.5 shrink-0" />
                        Zu diesem Dokument existiert bereits ein Wissenseintrag. Die neue Analyse aktualisiert nur die KI-Struktur und erhaelt manuelle Inhalte.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => runAnalysis(true)}
            disabled={loading || saving}
            className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Neu analysieren
          </button>
          <button
            onClick={handleSpeichern}
            disabled={loading || saving || !analysisResult?.analysis || !title.trim()}
            className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Wird gespeichert..." : "Als Wissen speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
