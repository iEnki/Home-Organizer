import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Upload, FileText, AlertTriangle, ChevronLeft, Zap } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getKiClient } from "../../utils/kiClient";
import { starteAnalyse } from "../../utils/rechnungAnalyse";
import { useToast } from "../../hooks/useToast";
import RechnungReviewModal from "./RechnungReviewModal";

const MODUS_LABEL = {
  chatgpt_vision: "ChatGPT Vision",
  ocr_regeln: "OCR + Regeln",
  ocr_ollama: "OCR + Ollama",
};

export default function HomeRechnungScannen({ session }) {
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
      toastError("Nur JPG, PNG, WEBP, HEIC oder PDF erlaubt.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toastError("Datei zu gross (max. 20 MB).");
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
  }, [toastError]);

  const handleAnalysieren = useCallback(async () => {
    if (!datei) return;
    setSchritt("analyse");
    setAnalyseStatus("Rechnung wird analysiert...");

    try {
      const kiClient = await getKiClient(session?.user?.id);
      setAnalyseStatus(`Analyse laeuft (${MODUS_LABEL[bildanalyseModus] || bildanalyseModus})...`);

      const result = await starteAnalyse(datei, bildanalyseModus, {
        kiClient,
        session,
      });

      setErgebnis(result);
      setSchritt("review");
    } catch (err) {
      console.error("Analyse-Fehler:", err);
      toastError(err.message || "Analyse fehlgeschlagen. Bitte erneut versuchen.");
      setSchritt("upload");
    }
  }, [datei, bildanalyseModus, session, toastError]);

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
    <div className="min-h-screen bg-canvas-0 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-canvas-1 border-b border-canvas-3 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg hover:bg-canvas-2 text-dark-text-main transition-colors"
          aria-label="Zurueck"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-dark-text-main">Rechnung scannen</h1>
        {schritt === "upload" && (
          <span className="ml-auto text-xs text-dark-text-secondary bg-canvas-2 px-2 py-1 rounded-pill">
            {MODUS_LABEL[bildanalyseModus] || bildanalyseModus}
          </span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Schritt: Upload */}
        {schritt === "upload" && (
          <div className="space-y-5">
            {/* Hinweistext */}
            <p className="text-sm text-dark-text-secondary">
              Lade ein Foto oder eine PDF-Rechnung hoch. Die KI analysiert den Inhalt
              und schlaegt vor, welche Daten in welche Module uebertragen werden sollen.
              Du pruefst und bestaedigst alles im naechsten Schritt.
            </p>

            {/* Drag-&-Drop / Vorschau-Zone */}
            <div
              className={`rounded-card border-2 border-dashed transition-colors ${
                datei
                  ? "border-primary-500 bg-primary-500/5"
                  : "border-canvas-3 bg-canvas-1 hover:border-canvas-4"
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
                      alt="Vorschau"
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
                      className="mb-3 px-3 py-2 rounded-card-sm border border-canvas-3 bg-canvas-2 hover:bg-canvas-3 text-xs text-dark-text-secondary"
                    >
                      Vorschau anzeigen
                    </button>
                  ) : (
                    <FileText size={48} className="text-primary-500 mb-3" />
                  )}
                  <p className="text-sm font-medium text-dark-text-main text-center">
                    {datei.name}
                  </p>
                  <p className="text-xs text-dark-text-secondary mt-1">
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
                    Entfernen
                  </button>
                </>
              ) : (
                <>
                  <Upload size={40} className="text-canvas-4 mb-3" />
                  <p className="text-sm text-dark-text-secondary text-center">
                    Hier klicken oder Datei hierher ziehen
                  </p>
                  <p className="text-xs text-dark-text-secondary mt-1">
                    JPG, PNG, WEBP, HEIC oder PDF (max. 20 MB)
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
                           bg-canvas-2 hover:bg-canvas-3 text-dark-text-main text-sm font-medium
                           transition-colors border border-canvas-3"
              >
                <Camera size={18} />
                Foto aufnehmen
              </button>
              <button
                onClick={() => dateiInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm
                           bg-canvas-2 hover:bg-canvas-3 text-dark-text-main text-sm font-medium
                           transition-colors border border-canvas-3"
              >
                <Upload size={18} />
                Datei hochladen
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
                Rechnung analysieren
              </button>
            )}
          </div>
        )}

        {/* Schritt: Analyse (Ladeindikator) */}
        {schritt === "analyse" && (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-canvas-3 border-t-primary-500 rounded-full animate-spin" />
              <Zap size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-dark-text-main">{analyseStatus}</p>
              <p className="text-sm text-dark-text-secondary">
                Dies kann je nach Modus einige Sekunden dauern.
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
