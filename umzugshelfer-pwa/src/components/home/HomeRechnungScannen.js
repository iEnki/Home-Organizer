import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Upload, FileText, ChevronLeft, Zap } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getKiClient } from "../../utils/kiClient";
import { starteAnalyse } from "../../utils/rechnungAnalyse";
import { useToast } from "../../hooks/useToast";
import { useLocale } from "../../contexts/LocaleContext";
import RechnungReviewModal from "./RechnungReviewModal";

const MODUS_LABEL = {
  chatgpt_vision: "ChatGPT Vision",
  ocr_regeln: "OCR + Regeln",
  ocr_ollama: "OCR + Ollama",
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

  const handleAnalysieren = useCallback(async () => {
    if (!datei) return;
    setSchritt("analyse");
    setAnalyseStatus(t("documents:invoiceScan.statusStart"));

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
      toastError(err.message || t("documents:invoiceScan.errAnalyse"));
      setSchritt("upload");
    }
  }, [datei, bildanalyseModus, locale, session, t, toastError]);

  const handleReviewAbbrechen = useCallback(() => {
    setErgebnis(null);
    setSchritt("upload");
  }, []);

  const handleReviewGespeichert = useCallback(() => {
    setDatei(null);
    setVorschau(null);
    setVorschauSichtbar(true);
    setErgebnis(null);
    setSchritt("upload");
  }, []);

  return (
    <div className="min-h-dvh bg-light-bg dark:bg-canvas-0 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-light-card dark:bg-canvas-1 border-b border-light-border dark:border-canvas-3 px-4 py-3 flex items-center gap-3">
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
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Schritt: Upload */}
        {schritt === "upload" && (
          <div className="space-y-5">
            {/* Hinweistext */}
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("documents:invoiceScan.intro")}
            </p>

            {/* Drag-&-Drop / Vorschau-Zone */}
            <div
              className={`rounded-card border-2 border-dashed transition-colors ${
                datei
                  ? "border-primary-500 bg-primary-500/5"
                  : "border-light-border dark:border-canvas-3 bg-light-card dark:bg-canvas-1 hover:border-primary-400 dark:hover:border-canvas-4"
              } flex flex-col items-center justify-center p-6 min-h-[180px] cursor-pointer`}
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
            </div>

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
          onAbbrechen={handleReviewAbbrechen}
          onGespeichert={handleReviewGespeichert}
        />
      )}
    </div>
  );
}
