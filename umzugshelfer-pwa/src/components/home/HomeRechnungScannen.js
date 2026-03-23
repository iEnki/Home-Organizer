import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Upload, FileText, ChevronLeft, Zap,
  CheckCircle, BookOpen, ScanLine, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";

const ERLAUBTE_TYPEN = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export default function HomeRechnungScannen({ session }) {
  const navigate = useNavigate();
  const { error: toastError } = useToast();
  const userId = session?.user?.id;

  const [schritt, setSchritt] = useState("upload"); // "upload" | "verarbeitung" | "ergebnis"
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [wissenEintrag, setWissenEintrag] = useState(null);
  const [fehler, setFehler] = useState(null);

  const bildInputRef = useRef(null);
  const dateiInputRef = useRef(null);

  const handleDateiAuswaehlen = useCallback((file) => {
    if (!file) return;
    if (!ERLAUBTE_TYPEN.includes(file.type)) {
      toastError("Nur JPG, PNG, WEBP, HEIC oder PDF erlaubt.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toastError("Datei zu groß (max. 20 MB).");
      return;
    }
    setDatei(file);
    setFehler(null);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setVorschau(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setVorschau(null);
    }
  }, [toastError]);

  const handleVerarbeiten = useCallback(async () => {
    if (!datei || !userId) return;
    setSchritt("verarbeitung");
    setFehler(null);

    try {
      // Schritt 1: Storage-Upload
      setStatusText("Datei wird hochgeladen…");
      const fileName = `${Date.now()}_${datei.name.replace(/\s/g, "_")}`;
      const filePath = `${userId}/${fileName}`;
      const { error: storageErr } = await supabase.storage
        .from("user-dokumente")
        .upload(filePath, datei);
      if (storageErr) throw new Error(`Upload fehlgeschlagen: ${storageErr.message}`);

      // Schritt 2: Dokument-Eintrag anlegen
      setStatusText("Dokument wird registriert…");
      const { data: dok, error: dbErr } = await supabase.from("dokumente").insert({
        user_id:    userId,
        dateiname:  datei.name,
        datei_typ:  datei.type,
        storage_pfad: filePath,
        groesse_kb: Math.round(datei.size / 1024),
        kategorie:  "Sonstiges",
      }).select("id").single();
      if (dbErr) throw new Error(`Dokument-Eintrag fehlgeschlagen: ${dbErr.message}`);

      // Schritt 3: doc-process aufrufen
      setStatusText("Dokument wird analysiert…");
      const { data: result, error: fnErr } = await supabase.functions.invoke("doc-process", {
        body: { dokument_id: dok.id, level: "full" },
      });
      if (fnErr) {
        // Versuche den tatsächlichen Fehlertext aus dem Response-Body zu lesen
        let detail = fnErr.message;
        try {
          const body = await fnErr.context?.json?.();
          if (body?.error) detail = body.error;
          else if (body?.warnings?.[0]) detail = body.warnings[0];
        } catch { /* ignore */ }
        throw new Error(`Analyse fehlgeschlagen: ${detail}`);
      }
      if (result?.status === "failed") {
        throw new Error(result.error || result.warnings?.[0] || "Analyse fehlgeschlagen.");
      }

      // Schritt 4: Wissenseintrag nachladen
      const wissenId = result?.wissen_id;
      if (wissenId) {
        const { data: wissen } = await supabase
          .from("home_wissen")
          .select("id, titel, kategorie, inhalt")
          .eq("id", wissenId)
          .single();
        setWissenEintrag(wissen || null);
      } else {
        setWissenEintrag(null);
      }

      setSchritt("ergebnis");
    } catch (err) {
      console.error("Scanner-Fehler:", err);
      setFehler(err.message || "Unbekannter Fehler. Bitte erneut versuchen.");
      setSchritt("upload");
    }
  }, [datei, userId]);

  const handleNocheinmal = useCallback(() => {
    setDatei(null);
    setVorschau(null);
    setWissenEintrag(null);
    setFehler(null);
    setSchritt("upload");
  }, []);

  // ── Kategorie-Badge-Farbe ─────────────────────────────────────────────────
  const kategoriefarbe = (kat) => {
    if (!kat) return "bg-light-card dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary";
    if (kat.includes("Rechnung")) return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    if (kat.includes("Vertrag"))  return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
    if (kat.includes("Versicher")) return "bg-green-500/15 text-green-600 dark:text-green-400";
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-canvas-0 pb-24">
      {/* Header */}
      <div
        className="sticky z-10 bg-light-card dark:bg-canvas-1 border-b border-light-border dark:border-canvas-3 px-4 py-3 flex items-center gap-3"
        style={{ top: "var(--app-topbar-offset)" }}
      >
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-2 text-light-text-main dark:text-dark-text-main transition-colors"
          aria-label="Zurück"
        >
          <ChevronLeft size={20} />
        </button>
        <ScanLine size={18} className="text-amber-500" />
        <h1 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">Dokument scannen</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* ── Schritt: Upload ── */}
        {schritt === "upload" && (
          <div className="space-y-5">
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Lade ein Foto oder PDF-Dokument hoch. Die KI erkennt den Typ (Rechnung, Vertrag, Versicherung…)
              und legt automatisch einen Eintrag in deiner Wissensdatenbank an.
            </p>

            {fehler && (
              <div className="flex items-start gap-2 p-3 rounded-card-sm bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                {fehler}
              </div>
            )}

            {/* Drag-&-Drop / Vorschau-Zone */}
            <div
              className={`rounded-card border-2 border-dashed transition-colors ${
                datei
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-light-border dark:border-canvas-3 bg-light-card dark:bg-canvas-1 hover:border-amber-500/50"
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
                  {vorschau ? (
                    <img
                      src={vorschau}
                      alt="Vorschau"
                      className="max-h-48 max-w-full rounded-card-sm object-contain mb-3"
                    />
                  ) : (
                    <FileText size={48} className="text-amber-500 mb-3" />
                  )}
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main text-center">
                    {datei.name}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    {(datei.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    className="mt-3 text-xs text-red-500 underline"
                    onClick={(e) => { e.stopPropagation(); setDatei(null); setVorschau(null); }}
                  >
                    Entfernen
                  </button>
                </>
              ) : (
                <>
                  <Upload size={40} className="text-light-text-secondary dark:text-canvas-4 mb-3" />
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center">
                    Hier klicken oder Datei hierher ziehen
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
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

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => bildInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm bg-light-card dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main text-sm font-medium transition-colors border border-light-border dark:border-canvas-3"
              >
                <Camera size={18} />
                Foto aufnehmen
              </button>
              <button
                onClick={() => dateiInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm bg-light-card dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main text-sm font-medium transition-colors border border-light-border dark:border-canvas-3"
              >
                <Upload size={18} />
                Datei hochladen
              </button>
            </div>

            {datei && (
              <button
                onClick={handleVerarbeiten}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-card-sm bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <Zap size={18} />
                Dokument analysieren
              </button>
            )}
          </div>
        )}

        {/* ── Schritt: Verarbeitung ── */}
        {schritt === "verarbeitung" && (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-light-border dark:border-canvas-3 border-t-amber-500 rounded-full animate-spin" />
              <ScanLine size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-light-text-main dark:text-dark-text-main">{statusText}</p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Dies kann je nach Dokumenttyp einige Sekunden dauern.
              </p>
            </div>
          </div>
        )}

        {/* ── Schritt: Ergebnis ── */}
        {schritt === "ergebnis" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle size={20} />
              <span className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                Dokument analysiert
              </span>
            </div>

            {wissenEintrag ? (
              <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-light-text-main dark:text-dark-text-main">
                    {wissenEintrag.titel}
                  </h2>
                  {wissenEintrag.kategorie && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-pill font-medium ${kategoriefarbe(wissenEintrag.kategorie)}`}>
                      {wissenEintrag.kategorie}
                    </span>
                  )}
                </div>
                {wissenEintrag.inhalt && (
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
                    {wissenEintrag.inhalt}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4">
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Das Dokument wurde gespeichert. Die Wissensdatenbank wird im Hintergrund aktualisiert.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate("/home/wissen")}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
              >
                <BookOpen size={18} />
                In Wissensdatenbank anzeigen
              </button>
              <button
                onClick={handleNocheinmal}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-card-sm bg-light-card dark:bg-canvas-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main text-sm font-medium transition-colors border border-light-border dark:border-dark-border"
              >
                <ScanLine size={18} />
                Weiteres Dokument scannen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
