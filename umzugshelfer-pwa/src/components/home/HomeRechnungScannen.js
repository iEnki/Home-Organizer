import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Upload, FileText, ChevronLeft, Zap } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getKiClient } from "../../utils/kiClient";
import { starteAnalyse } from "../../utils/rechnungAnalyse";
import { useToast } from "../../hooks/useToast";
import { useLocale } from "../../contexts/LocaleContext";
import RechnungReviewModal from "./RechnungReviewModal";
import GlassSurface, { GlassModule } from "../ui/GlassSurface";

const MODUS_LABEL = {
  chatgpt_vision: "ChatGPT Vision",
  ocr_regeln: "OCR + Regeln",
  ocr_ollama: "OCR + Ollama",
};

export default function HomeRechnungScannen({ session }) {
  const { t } = useTranslation(["home", "documents", "common"]);
  const { locale } = useLocale();
  const { error: toastError, info: toastInfo } = useToast();

  const [schritt, setSchritt] = useState("upload"); // "upload" | "analyse" | "review"
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState(null); // data-URL fuer Bildvorschau
  const [vorschauSichtbar, setVorschauSichtbar] = useState(true);
  const [analyseStatus, setAnalyseStatus] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const [serverReviewContext, setServerReviewContext] = useState(null);
  const [bildanalyseModus, setBildanalyseModus] = useState("chatgpt_vision");

  const bildInputRef = useRef(null);
  const dateiInputRef = useRef(null);

  // Analyse-Modus aus Household-Settings laden
  useEffect(() => {
    async function ladeModus() {
      if (!session) return;
      const { data } = await supabase
        .from("household_settings")
        .select("bildanalyse_modus")
        .maybeSingle();
      if (data?.bildanalyse_modus) {
        setBildanalyseModus(data.bildanalyse_modus);
      }
    }
    ladeModus();
  }, [session]);

  const handleDateiAuswaehlen = useCallback((file) => {
    if (!file) return;
    const erlaubt = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!erlaubt.includes(file.type)) {
      toastError(t("documents:invoiceScan.errType"));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toastError(t("documents:invoiceScan.errSize"));
      return;
    }
    setDatei(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setVorschau(e.target.result);
        setVorschauSichtbar(true);
      };
      reader.readAsDataURL(file);
    } else {
      setVorschau(null);
      setVorschauSichtbar(false);
    }
  }, [t, toastError]);

  const sanitizeStorageFilename = useCallback((name) => (
    String(name || "rechnung.pdf")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_") || "rechnung.pdf"
  ), []);

  const resolveHouseholdId = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.household_id || null;
  }, [session?.user?.id]);

  const ladeServerRechnung = useCallback(async (dokumentId) => {
    const { data: dokument, error: dokError } = await supabase
      .from("dokumente")
      .select("id, storage_pfad, dateiname, extrahierter_text, meta")
      .eq("id", dokumentId)
      .single();
    if (dokError) throw dokError;

    const { data: rechnung, error: rechnungError } = await supabase
      .from("rechnungen")
      .select("*")
      .eq("dokument_id", dokumentId)
      .maybeSingle();
    if (rechnungError) throw rechnungError;
    if (!rechnung?.id) {
      throw new Error(t("documents:invoiceScan.pdfOcrFailed"));
    }

    const { data: positionRows, error: positionError } = await supabase
      .from("rechnungs_positionen")
      .select("*")
      .eq("rechnung_id", rechnung.id)
      .order("pos_nr", { ascending: true });
    if (positionError) throw positionError;

    const positionen = (positionRows || []).map((pos) => ({
      name: pos.beschreibung || "",
      menge: pos.menge,
      einheit: pos.einheit,
      einzelpreis: pos.einzelpreis,
      gesamtpreis: pos.gesamtpreis,
      ust_satz: pos.ust_satz,
      obergruppe: pos.klassifikation?.obergruppe || "keine_zuordnung",
      modul_vorschlag: pos.klassifikation?.modul_vorschlag || pos.klassifikation?.modul || "keine_zuordnung",
      confidence: pos.klassifikation?.confidence ?? 0.5,
      review_noetig: true,
    }));

    const processing = dokument?.meta?.processing || {};
    if (processing.ocr_truncated && processing.pdf_page_count) {
      toastInfo(t("documents:invoiceScan.pdfOcrLimited", {
        pages: processing.pdf_page_count,
        limit: processing.ocr_pages_processed || 5,
      }), 6000);
    }

    return {
      result: {
        haendler: rechnung.lieferant_name || "",
        datum: rechnung.rechnungsdatum || "",
        gesamt: rechnung.brutto,
        positionen,
        roher_text: rechnung.raw_text || dokument.extrahierter_text || "",
        confidence: rechnung.confidence ?? 0.65,
        erkannte_module: [],
        summary_text: rechnung.extraktion?.summary || "",
        budget_kategorie_vorschlag: rechnung.extraktion?.purchase_type || null,
      },
      context: {
        existingDokumentId: dokument.id,
        existingRechnungId: rechnung.id,
        existingStoragePfad: dokument.storage_pfad,
        serverProcessed: true,
      },
    };
  }, [t, toastInfo]);

  const analysierePdfServerseitig = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error(t("common:auth.noSession", { defaultValue: "Keine gueltige Sitzung vorhanden." }));

    setAnalyseStatus(t("documents:invoiceScan.pdfOcrRunning"));
    const householdId = await resolveHouseholdId();
    if (!householdId) throw new Error("Haushalt konnte nicht bestimmt werden.");

    const finalName = sanitizeStorageFilename(datei.name || "rechnung.pdf");
    const pfad = `${userId}/${Date.now()}_${finalName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("user-dokumente")
      .upload(pfad, datei, { upsert: false, contentType: datei.type });
    if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);

    const storagePfad = uploadData?.path || pfad;
    const { data: dokData, error: dokError } = await supabase
      .from("dokumente")
      .insert({
        user_id: userId,
        household_id: householdId,
        app_modus: "home",
        dateiname: finalName,
        storage_pfad: storagePfad,
        datei_typ: datei.type,
        groesse_kb: Math.round(datei.size / 1024),
        kategorie: "Rechnung",
        dokument_typ: "rechnung",
        meta: { processing: { status: "queued", source: "invoice_scan_pdf" } },
      })
      .select("id")
      .single();
    if (dokError) {
      try {
        await supabase.storage.from("user-dokumente").remove([storagePfad]);
      } catch (rollbackError) {
        console.warn("Storage-Rollback fehlgeschlagen:", rollbackError);
      }
      throw new Error(`Dokument-Speicherung fehlgeschlagen: ${dokError.message}`);
    }

    const { data: processData, error: processError } = await supabase.functions.invoke("doc-process", {
      body: {
        dokument_id: dokData.id,
        level: "full",
        force: true,
        locale,
      },
    });
    if (processError) throw new Error(processError.message || t("documents:invoiceScan.pdfOcrFailed"));
    if (!["ok", "already_done"].includes(processData?.status)) {
      throw new Error(processData?.error || processData?.warnings?.[0] || t("documents:invoiceScan.pdfOcrFailed"));
    }

    return await ladeServerRechnung(dokData.id);
  }, [datei, ladeServerRechnung, locale, resolveHouseholdId, sanitizeStorageFilename, session?.user?.id, t]);

  const handleAnalysieren = useCallback(async () => {
    if (!datei) return;
    setSchritt("analyse");
    setAnalyseStatus(t("documents:invoiceScan.statusStart"));
    setServerReviewContext(null);

    try {
      let result;
      if (datei.type === "application/pdf") {
        const serverResult = await analysierePdfServerseitig();
        result = serverResult.result;
        setServerReviewContext(serverResult.context);
      } else {
        const kiClient = await getKiClient(session?.user?.id);
        setAnalyseStatus(t("documents:invoiceScan.statusRunning", { mode: MODUS_LABEL[bildanalyseModus] || bildanalyseModus }));

        result = await starteAnalyse(datei, bildanalyseModus, {
          kiClient,
          session,
          locale,
        });
      }

      setErgebnis(result);
      setSchritt("review");
    } catch (err) {
      console.error("Analyse-Fehler:", err);
      toastError(err.message || t("documents:invoiceScan.errAnalyse"));
      setSchritt("upload");
    }
  }, [analysierePdfServerseitig, datei, bildanalyseModus, locale, session, t, toastError]);

  const handleReviewAbbrechen = useCallback(() => {
    setErgebnis(null);
    setServerReviewContext(null);
    setSchritt("upload");
  }, []);

  const handleReviewGespeichert = useCallback(() => {
    setDatei(null);
    setVorschau(null);
    setVorschauSichtbar(true);
    setErgebnis(null);
    setServerReviewContext(null);
    setSchritt("upload");
  }, []);

  return (
    <GlassModule className="min-h-dvh space-y-0 p-0 md:p-0">
      {/* Header */}
      <GlassSurface interactive={false} className="sticky top-0 z-10 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-2 text-light-text-main dark:text-dark-text-main transition-colors"
          aria-label={t("common:actions.back", { defaultValue: "Back" })}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">{t("documents:invoiceScan.title")}</h1>
        {schritt === "upload" && (
          <span className="ml-auto text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-surface-2 dark:bg-canvas-2 px-2 py-1 rounded-pill">
            {MODUS_LABEL[bildanalyseModus] || bildanalyseModus}
          </span>
        )}
      </GlassSurface>

      <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-6">
        {/* Schritt: Upload */}
        {schritt === "upload" && (
          <div className="space-y-5">
            {/* Hinweistext */}
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("documents:invoiceScan.intro")}
            </p>

            {/* Drag-&-Drop / Vorschau-Zone */}
            <GlassSurface
              className={`min-h-[180px] cursor-pointer flex flex-col items-center justify-center border-2 border-dashed p-6 ${
                datei
                  ? "border-primary-500 bg-primary-500/5"
                  : "border-light-border dark:border-white/10"
              }`}
              onClick={() => dateiInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDateiAuswaehlen(e.dataTransfer.files[0]);
              }}
            >
              {datei ? (
                <>
                  {vorschau && vorschauSichtbar ? (
                    <img
                      src={vorschau}
                      alt={t("documents:preview")}
                      className="max-h-48 max-w-full rounded-card-sm object-contain mb-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVorschauSichtbar(false);
                      }}
                    />
                  ) : vorschau ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVorschauSichtbar(true);
                      }}
                      className="mb-3 px-3 py-2 rounded-card-sm border border-light-border dark:border-canvas-3 bg-light-surface-1 dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-xs text-light-text-secondary dark:text-dark-text-secondary"
                    >
                      {t("documents:invoiceScan.showPreview")}
                    </button>
                  ) : (
                    <FileText size={48} className="text-primary-500 mb-3" />
                  )}
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main text-center">
                    {datei.name}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    {(datei.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    className="mt-3 text-xs text-accent-danger underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDatei(null);
                      setVorschau(null);
                      setVorschauSichtbar(true);
                    }}
                  >
                    {t("common:actions.delete")}
                  </button>
                </>
              ) : (
                <>
                  <Upload size={40} className="text-light-text-secondary dark:text-canvas-4 mb-3" />
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center">
                    {t("documents:invoiceScan.drop")}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    {t("documents:invoiceScan.fileHint")}
                  </p>
                </>
              )}
            </GlassSurface>

            {/* Versteckte Inputs */}
            <input
              ref={dateiInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleDateiAuswaehlen(e.target.files[0])}
            />
            <input
              ref={bildInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleDateiAuswaehlen(e.target.files[0])}
            />

            {/* Aktions-Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => bildInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm
                           bg-light-surface-1 dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main text-sm font-medium
                           transition-colors border border-light-border dark:border-canvas-3"
              >
                <Camera size={18} />
                {t("documents:invoiceScan.takePhoto")}
              </button>
              <button
                onClick={() => dateiInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm
                           bg-light-surface-1 dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main text-sm font-medium
                           transition-colors border border-light-border dark:border-canvas-3"
              >
                <Upload size={18} />
                {t("documents:invoiceScan.uploadFile")}
              </button>
            </div>

            {/* Analysieren-Button */}
            {datei && (
              <button
                onClick={handleAnalysieren}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-card-sm
                           bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold
                           transition-colors shadow-sm"
              >
                <Zap size={18} />
                {t("documents:invoiceScan.analyse")}
              </button>
            )}
          </div>
        )}

        {/* Schritt: Analyse (Ladeindikator) */}
        {schritt === "analyse" && (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-light-border dark:border-canvas-3 border-t-primary-500 rounded-full animate-spin" />
              <Zap size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-light-text-main dark:text-dark-text-main">{analyseStatus}</p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {t("home:scanner.modusHint")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Schritt: Review Modal */}
      {schritt === "review" && ergebnis && (
        <RechnungReviewModal
          ergebnis={ergebnis}
          datei={datei}
          session={session}
          existingDokumentId={serverReviewContext?.existingDokumentId}
          existingRechnungId={serverReviewContext?.existingRechnungId}
          existingStoragePfad={serverReviewContext?.existingStoragePfad}
          serverProcessed={serverReviewContext?.serverProcessed}
          onAbbrechen={handleReviewAbbrechen}
          onGespeichert={handleReviewGespeichert}
        />
      )}
    </GlassModule>
  );
}
