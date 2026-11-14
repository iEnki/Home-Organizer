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
  lmstudio_vision: "LM Studio Vision",
  claude_vision: "Claude Vision",
};

export default function HomeRechnungScannen({ session }) {
  const { t } = useTranslation(["home", "documents", "common"]);
  const { locale } = useLocale();
  const { error: toastError } = useToast();

  const [schritt, setSchritt] = useState("upload"); // "upload" | "analyse" | "review"
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState(null); // data-URL fuer Bildvorschau
  const [vorschauSichtbar, setVorschauSichtbar] = useState(true);
  const [analyseStatus, setAnalyseStatus] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const [serverReviewContext, setServerReviewContext] = useState(null);
  const [bildanalyseModus, setBildanalyseModus] = useState("chatgpt_vision");

  const analyseLaeuft = useRef(false);
  const [analyseFehler, setAnalyseFehler] = useState("");
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
    setAnalyseFehler("");
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

  const handleAnalysieren = useCallback(async () => {
    if (!datei || analyseLaeuft.current) return;
    analyseLaeuft.current = true;
    setAnalyseFehler("");
    setSchritt("analyse");
    setAnalyseStatus(t("documents:invoiceScan.statusStart"));
    setServerReviewContext(null);

    try {
      const kiClient = await getKiClient(session?.user?.id);
      setAnalyseStatus(t("documents:invoiceScan.statusRunning", { mode: MODUS_LABEL[bildanalyseModus] || bildanalyseModus }));

      const result = await starteAnalyse(datei, bildanalyseModus, {
        kiClient,
        session,
        locale,
      });

      setErgebnis(result);
      setSchritt("review");
    } catch (err) {
      console.error("Analyse-Fehler:", err);
      setAnalyseFehler(t("documents:invoiceScan.errAnalyse"));
      toastError(err.message || t("documents:invoiceScan.errAnalyse"));
      setSchritt("upload");
    } finally {
      analyseLaeuft.current = false;
    }
  }, [datei, bildanalyseModus, locale, session, t, toastError]);

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
    <GlassModule className="invoice-scanner min-h-dvh space-y-0 p-0 md:p-0">
      {/* Header */}
      <GlassSurface interactive={false} className="relative z-10 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => bildInputRef.current?.click()} className="min-h-[48px] flex items-center justify-center gap-2 rounded-card-sm bg-primary-700 text-white px-4 py-3 font-semibold"><Camera size={20} />{t("documents:invoiceScan.mobilePhoto")}</button>
              <button type="button" onClick={() => dateiInputRef.current?.click()} className="min-h-[48px] flex items-center justify-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card text-light-text-main dark:text-dark-text-main px-4 py-3"><Upload size={20} />{t(datei ? "documents:invoiceScan.replaceFile" : "documents:invoiceScan.mobileFile")}</button>
            </div>
            {analyseFehler && <p role="alert" className="rounded-card-sm border border-red-500/40 bg-red-500/10 p-3 text-sm">{analyseFehler}</p>}
            {/* Drag-&-Drop / Vorschau-Zone */}
            <GlassSurface
              className={`invoice-scan-upload min-h-[72px] md:min-h-[180px] flex flex-col items-center justify-center border-2 border-dashed p-3 md:p-6 ${
                datei
                  ? "border-primary-500 bg-primary-500/5"
                  : "border-light-border dark:border-white/10"
              }`}
              role={datei ? undefined : "button"} tabIndex={datei ? undefined : 0}
              onClick={() => { if (!datei) dateiInputRef.current?.click(); }}
              onKeyDown={e => { if (!datei && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); dateiInputRef.current?.click(); } }}
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

                    />
                  ) : vorschau ? null : (
                    <FileText size={48} className="text-primary-500 mb-3" />
                  )}
                  {vorschau && <button type="button" aria-expanded={vorschauSichtbar} className="underline underline-offset-4 text-sm" onClick={() => setVorschauSichtbar(v => !v)}>{t(vorschauSichtbar ? "documents:invoiceScan.hidePreview" : "documents:invoiceScan.showPreview")}</button>}
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main text-center">
                    {datei.name}
                  </p>
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
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
                  <Upload size={40} className="hidden md:block text-light-text-secondary dark:text-canvas-4 mb-3" />
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center">
                    {t("documents:invoiceScan.drop")}
                  </p>
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
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
              onChange={(e) => { handleDateiAuswaehlen(e.target.files[0]); e.target.value = ""; }}
            />
            <input
              ref={bildInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { handleDateiAuswaehlen(e.target.files[0]); e.target.value = ""; }}
            />


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
              <p role="status" aria-live="polite" className="text-base font-medium text-light-text-main dark:text-dark-text-main">{analyseStatus}</p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {t("home:scanner.modusHint")}
              </p>
            </div>
          </div>
        )}
      </div>

      {schritt === "upload" && datei && <div className="invoice-scan-actions">
        <div className="mx-auto max-w-3xl"><button type="button" onClick={handleAnalysieren} className="w-full flex items-center justify-center gap-2 rounded-card-sm bg-primary-700 text-white py-3 px-4 font-semibold"><Zap size={18} />{t("documents:invoiceScan.analyse")}</button></div>
      </div>}
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
