import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText, FolderOpen, Upload, Download, Trash2, BookOpen,
  Search, X, Plus, CheckCircle, File, Loader2, AlertTriangle, Eye,
  ScanLine, Edit2,
} from "lucide-react";
import DokumentVorschauModal from "./DokumentVorschauModal";
import { supabase } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import { useToast } from "../../hooks/useToast";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

// ── Konstanten ────────────────────────────────────────────────────────────────
const KATEGORIEN = [
  "Rechnung", "Vertrag", "Handbuch", "Garantie",
  "Versicherung", "Behörde", "Gesundheit", "Sonstiges",
];

const KATEGORIE_FARBEN = {
  Rechnung:     "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Vertrag:      "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  Handbuch:     "bg-green-500/10 text-green-600 dark:text-green-400",
  Garantie:     "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Versicherung: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  Behörde:      "bg-red-500/10 text-red-600 dark:text-red-400",
  Gesundheit:   "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  Sonstiges:    "bg-gray-500/10 text-gray-500 dark:text-gray-400",
};

const WISSEN_KATEGORIEN = [
  "Farben & Oberflächen", "Maße & Abmessungen", "Geräte-Info",
  "Kontakte & Dienste", "Anleitungen", "Rezepte", "Notizen", "Sonstiges",
];

// Legacy: Extrahiert den [kategorie_hinweis] aus der alten Beschreibung
const extrahiereKategorieHinweis = (beschreibung) => {
  const match = beschreibung?.match(/\[([^\]]+)\]$/);
  return match ? match[1] : null;
};

// Gibt effektive Kategorie zurück: DB-Spalte hat Vorrang, dann Legacy-Parsing
const effektiveKategorie = (dok) =>
  dok.kategorie || extrahiereKategorieHinweis(dok.beschreibung);

// SHA-256 Hash (client-seitig, Foundation für spätere Deduplizierung)
const berechneHash = async (file) => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
};

// ── Upload-Modal ──────────────────────────────────────────────────────────────
const UploadModal = ({ userId, onSchliessen, onErfolgreich }) => {
  const toast = useToast();
  const [datei, setDatei] = useState(null);
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState("Sonstiges");
  const [processingLevel, setProcessingLevel] = useState("classify_only");
  const [uploading, setUploading] = useState(false);
  const [fehler, setFehler] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const verarbeiteAuswahl = (files) => {
    if (files && files[0]) { setDatei(files[0]); setFehler(""); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    verarbeiteAuswahl(e.dataTransfer.files);
  };

  const handleHochladen = async () => {
    if (!datei || !userId) return;
    setUploading(true);
    setFehler("");
    const fileName = `${Date.now()}_${datei.name.replace(/\s/g, "_")}`;
    const filePath = `${userId}/${fileName}`;
    try {
      const { error: storageErr } = await supabase.storage
        .from("user-dokumente")
        .upload(filePath, datei);
      if (storageErr) throw storageErr;

      const hash = await berechneHash(datei);

      const { data: insertData, error: dbErr } = await supabase.from("dokumente").insert({
        user_id: userId,
        dateiname: datei.name,
        datei_typ: datei.type,
        storage_pfad: filePath,
        beschreibung: beschreibung || null,
        groesse_kb: Math.round(datei.size / 1024),
        kategorie,
        datei_hash: hash,
        meta: {
          processing: {
            status: "pending",
            level: processingLevel,
            queued_at: new Date().toISOString(),
          },
        },
      }).select("id").single();
      if (dbErr) throw dbErr;

      await logVerlauf(supabase, userId, "dokumente", datei.name, "erstellt");

      // Fire-and-forget: Modal sofort schließen, Analyse läuft im Hintergrund
      onErfolgreich();

      if (processingLevel !== "store_only" && insertData?.id) {
        supabase.functions
          .invoke("doc-process", { body: { dokument_id: insertData.id, level: processingLevel } })
          .catch(() => {
            toast.info("KI-Analyse konnte nicht automatisch gestartet werden. Über die Dokumentkarte erneut versuchen.");
          });
      }
    } catch (err) {
      setFehler(`Upload fehlgeschlagen: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Upload size={16} className="text-primary-500" /> Dokument hochladen
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-card-sm p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-primary-500 bg-primary-500/5"
              : "border-light-border dark:border-dark-border hover:border-primary-500/60"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => verarbeiteAuswahl(e.target.files)}
          />
          <Upload size={28} className="mx-auto mb-2 text-light-text-secondary dark:text-dark-text-secondary" />
          {datei ? (
            <p className="text-sm font-medium text-primary-500 truncate">{datei.name}</p>
          ) : (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Datei hierher ziehen oder klicken
            </p>
          )}
          {datei && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
              {Math.round(datei.size / 1024)} KB
            </p>
          )}
        </div>

        {/* Kategorie */}
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            Kategorie
          </label>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>

        {/* KI-Analyse-Level */}
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            KI-Analyse
          </label>
          <select
            value={processingLevel}
            onChange={(e) => setProcessingLevel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            <option value="store_only">Nur speichern</option>
            <option value="classify_only">Erkennen &amp; kategorisieren</option>
            <option value="full">Vollständig extrahieren &amp; zuordnen</option>
          </select>
        </div>

        {/* Beschreibung */}
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            Beschreibung (optional)
          </label>
          <input
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="z.B. Mietvertrag Neue Str. 5"
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
        </div>

        {fehler && (
          <div className="p-3 rounded-card-sm bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} /> {fehler}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>
          <button
            onClick={handleHochladen}
            disabled={!datei || uploading}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Wird hochgeladen…" : "Hochladen"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Wissenseintrag-Modal ───────────────────────────────────────────────────────
const WissensEintragModal = ({ dok, userId, onSchliessen, onErfolgreich }) => {
  const katHinweis = effektiveKategorie(dok);
  const [titel, setTitel] = useState(dok.dateiname.replace(/\.[^.]+$/, ""));
  const [inhalt, setInhalt] = useState(
    dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || ""
  );
  const [kategorie, setKategorie] = useState(katHinweis || "Notizen");
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");

  const handleSpeichern = async () => {
    if (!titel.trim()) return;
    setSpeichern(true);
    setFehler("");
    try {
      // Vorhandenen Auto-Stub prüfen (doc-process könnte bereits einen angelegt haben)
      const { data: vorhandener } = await supabase
        .from("home_wissen")
        .select("id, herkunft")
        .eq("dokument_id", dok.id)
        .maybeSingle();

      if (vorhandener?.id) {
        // Stub übernehmen: manuell markieren, user_id setzen
        const { error } = await supabase
          .from("home_wissen")
          .update({
            titel: titel.trim(),
            inhalt: inhalt || null,
            kategorie,
            herkunft: "manuell",
            user_id: userId,
          })
          .eq("id", vorhandener.id);
        if (error) throw error;
        await logVerlauf(supabase, userId, "home_wissen", titel.trim(), "aktualisiert");
      } else {
        // Neu anlegen mit dokument_id-Verknüpfung
        const { error } = await supabase.from("home_wissen").insert({
          user_id: userId,
          titel: titel.trim(),
          inhalt: inhalt || null,
          kategorie,
          tags: [dok.dateiname],
          dokument_id: dok.id,
          herkunft: "manuell",
        });
        if (error) throw error;
        await logVerlauf(supabase, userId, "home_wissen", titel.trim(), "erstellt");
      }
      onErfolgreich();
    } catch (err) {
      setFehler(`Fehler: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <BookOpen size={16} className="text-amber-500" /> Als Wissenseintrag speichern
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Titel</label>
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            {WISSEN_KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Inhalt (optional)</label>
          <textarea
            value={inhalt}
            onChange={(e) => setInhalt(e.target.value)}
            rows={3}
            placeholder="Notizen zum Dokument…"
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none"
          />
        </div>

        {fehler && (
          <div className="p-2 text-xs text-red-600 dark:text-red-400">{fehler}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            disabled={!titel.trim() || speichern}
            className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Rechnungs-Edit-Modal ───────────────────────────────────────────────────────
const RechnungsEditModal = ({ dokId, onSchliessen, onErfolgreich }) => {
  const [form, setForm] = useState({ lieferant_name: "", rechnungsnummer: "", rechnungsdatum: "", brutto: "" });
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    supabase.from("rechnungen").select("lieferant_name, rechnungsnummer, rechnungsdatum, brutto").eq("dokument_id", dokId).maybeSingle().then(({ data }) => {
      if (data) setForm({
        lieferant_name: data.lieferant_name || "",
        rechnungsnummer: data.rechnungsnummer || "",
        rechnungsdatum: data.rechnungsdatum || "",
        brutto: data.brutto != null ? String(data.brutto) : "",
      });
      setLaden(false);
    });
  }, [dokId]);

  const handleSpeichern = async () => {
    setSpeichern(true);
    setFehler("");
    try {
      const { error } = await supabase.from("rechnungen").update({
        lieferant_name: form.lieferant_name || null,
        rechnungsnummer: form.rechnungsnummer || null,
        rechnungsdatum: form.rechnungsdatum || null,
        brutto: form.brutto !== "" ? parseFloat(form.brutto) : null,
      }).eq("dokument_id", dokId);
      if (error) throw error;
      onErfolgreich();
    } catch (err) {
      setFehler(`Fehler: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="bg-light-card-bg dark:bg-canvas-2 w-full max-w-md rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 max-h-[90dvh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Edit2 size={16} className="text-blue-500" /> Rechnung bearbeiten
          </h3>
          <button onClick={onSchliessen} className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {laden ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Lieferant</label>
                <input value={form.lieferant_name} onChange={(e) => setForm((p) => ({ ...p, lieferant_name: e.target.value }))} placeholder="z.B. Supermarkt GmbH" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Rechnungsnummer</label>
                <input value={form.rechnungsnummer} onChange={(e) => setForm((p) => ({ ...p, rechnungsnummer: e.target.value }))} placeholder="z.B. RE-2024-001" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Rechnungsdatum</label>
                <input type="date" value={form.rechnungsdatum} onChange={(e) => setForm((p) => ({ ...p, rechnungsdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Brutto (€)</label>
                <input type="number" step="0.01" value={form.brutto} onChange={(e) => setForm((p) => ({ ...p, brutto: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-blue-500" />
              </div>
              {fehler && <p className="text-xs text-red-500">{fehler}</p>}
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2">
          <button onClick={onSchliessen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
          <button onClick={handleSpeichern} disabled={laden || speichern} className="flex-1 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2">
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Dokument-Karte ─────────────────────────────────────────────────────────────
const DokumentKarte = ({ dok, onDownload, onLoeschen, onWissen, onVorschau, onAnalyseStarten, onRechnungBearbeiten, laedtDownload }) => {
  const kat = effektiveKategorie(dok);
  const katFarbe = KATEGORIE_FARBEN[kat] || KATEGORIE_FARBEN.Sonstiges;
  const beschreibungOhneHinweis = dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || "";

  const processingStatus = dok.meta?.processing?.status;
  const klassiKonfidenz = dok.meta?.classification?.confidence;
  const niedrigeKonfidenz = klassiKonfidenz != null && klassiKonfidenz < 0.75;

  const dateiIcon = () => {
    if (dok.datei_typ?.startsWith("image/")) return <File size={20} className="text-blue-500" />;
    if (dok.datei_typ === "application/pdf") return <FileText size={20} className="text-red-500" />;
    return <FileText size={20} className="text-light-text-secondary dark:text-dark-text-secondary" />;
  };

  return (
    <div className="p-4 rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-light-border dark:bg-canvas-3 flex items-center justify-center flex-shrink-0">
          {dateiIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">
            {dok.dateiname}
          </p>
          {beschreibungOhneHinweis && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
              {beschreibungOhneHinweis}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {kat && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${katFarbe}`}>
                {kat}
              </span>
            )}
            {niedrigeKonfidenz && processingStatus === "done" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                Niedrige Konfidenz
              </span>
            )}
            {dok.groesse_kb != null && (
              <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {dok.groesse_kb < 1024
                  ? `${dok.groesse_kb} KB`
                  : `${(dok.groesse_kb / 1024).toFixed(1)} MB`}
              </span>
            )}
            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {new Date(dok.erstellt_am).toLocaleDateString("de-DE")}
            </span>
          </div>

          {/* Processing-Status-Badge */}
          {processingStatus === "pending" && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/10 text-gray-500 dark:text-gray-400">
                <Loader2 size={10} /> Warte auf Analyse…
              </span>
              <button
                onClick={() => onAnalyseStarten(dok, false)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
              >
                <ScanLine size={10} /> Analyse starten
              </button>
            </div>
          )}
          {processingStatus === "processing" && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-500 dark:text-blue-400">
                <Loader2 size={10} className="animate-spin" /> KI analysiert…
              </span>
            </div>
          )}
          {processingStatus === "failed" && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-500 dark:text-red-400">
                <AlertTriangle size={10} /> Analyse fehlgeschlagen
              </span>
              <button
                onClick={() => onAnalyseStarten(dok, true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <ScanLine size={10} /> Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-light-border dark:border-dark-border flex-wrap">
        <button
          onClick={() => onVorschau(dok)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-canvas-3 dark:bg-canvas-3 text-dark-text-main hover:bg-canvas-4 transition-colors"
        >
          <Eye size={12} /> Anzeigen
        </button>
        {kat === "Rechnung" && onRechnungBearbeiten && (
          <button
            onClick={() => onRechnungBearbeiten(dok)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <Edit2 size={12} /> Rechnung
          </button>
        )}
        <button
          onClick={() => onDownload(dok.storage_pfad, dok.dateiname)}
          disabled={laedtDownload}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors disabled:opacity-50"
        >
          <Download size={12} /> Herunterladen
        </button>
        <button
          onClick={() => onWissen(dok)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          <BookOpen size={12} /> Als Wissen
        </button>
        <button
          onClick={() => onLoeschen(dok.id, dok.storage_pfad, dok.dateiname)}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

// ── Hauptkomponente ────────────────────────────────────────────────────────────
const HomeDokumente = ({ session }) => {
  const userId = session?.user?.id;
  const toast = useToast();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("dokumente");
  const [searchParams] = useSearchParams();

  const [dokumente, setDokumente] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState(null);
  const [laedtDownload, setLaedtDownload] = useState(false);
  const [uploadModalOffen, setUploadModalOffen] = useState(false);
  const [wissenModalDok, setWissenModalDok] = useState(null);
  const [wissenErfolgreich, setWissenErfolgreich] = useState(false);
  const [kategorieFilter, setKategorieFilter] = useState("Alle");
  const [suchbegriff, setSuchbegriff] = useState("");
  const [rechnungsEditDok, setRechnungsEditDok] = useState(null);

  // URL-Filter (z.B. von /home/vertraege oder /home/versicherungen Redirect)
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "Vertrag" || f === "Versicherung") setKategorieFilter(f);
  }, [searchParams]);
  const [vorschauDok, setVorschauDok] = useState(null);

  // ── Laden ──────────────────────────────────────────────────────────────────
  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("dokumente")
        .select("id, dateiname, datei_typ, storage_pfad, beschreibung, groesse_kb, kategorie, erstellt_am, meta")
        .eq("user_id", userId)
        .order("erstellt_am", { ascending: false });
      if (error) throw error;
      setDokumente(data || []);
    } catch (err) {
      setFehler("Dokumente konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = async (storagePfad, dateiname) => {
    setLaedtDownload(true);
    try {
      const { data, error } = await supabase.storage
        .from("user-dokumente")
        .download(storagePfad);
      if (error) throw error;
      const url = URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = dateiname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setFehler(`Download fehlgeschlagen: ${err.message}`);
    } finally {
      setLaedtDownload(false);
    }
  };

  // ── Löschen ─────────────────────────────────────────────────────────────────
  const handleLoeschen = async (id, storagePfad, dateiname) => {
    if (!window.confirm(`"${dateiname}" wirklich löschen?`)) return;
    try {
      await supabase.storage.from("user-dokumente").remove([storagePfad]);
      const { error } = await supabase
        .from("dokumente")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      await logVerlauf(supabase, userId, "dokumente", dateiname, "geloescht");
      setDokumente((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setFehler(`Löschen fehlgeschlagen: ${err.message}`);
    }
  };

  // ── Analyse starten (aus pending/failed Badge) ─────────────────────────────
  const handleAnalyseStarten = async (dok, force) => {
    const level = dok.meta?.processing?.level ?? "classify_only";
    try {
      // Optimistisch UI-Update: status → "processing"
      setDokumente((prev) =>
        prev.map((d) =>
          d.id === dok.id
            ? { ...d, meta: { ...d.meta, processing: { ...d.meta?.processing, status: "processing" } } }
            : d,
        ),
      );
      await supabase.functions.invoke("doc-process", {
        body: { dokument_id: dok.id, level, force },
      });
    } catch {
      toast.info("Analyse konnte nicht gestartet werden.");
      // Status zurücksetzen auf "pending" damit Button wieder erscheint
      setDokumente((prev) =>
        prev.map((d) =>
          d.id === dok.id
            ? { ...d, meta: { ...d.meta, processing: { ...d.meta?.processing, status: "pending" } } }
            : d,
        ),
      );
    }
  };

  // ── Wissen-Erfolg ──────────────────────────────────────────────────────────
  const handleWissensErfolg = () => {
    setWissenModalDok(null);
    setWissenErfolgreich(true);
    setTimeout(() => setWissenErfolgreich(false), 3000);
  };

  // ── Gefilterte Dokumente ───────────────────────────────────────────────────
  const gefilterteDokumente = dokumente.filter((dok) => {
    const kat = effektiveKategorie(dok);
    const katPasst = kategorieFilter === "Alle" || kat === kategorieFilter;
    const q = suchbegriff.toLowerCase();
    const suchPasst =
      !q ||
      dok.dateiname.toLowerCase().includes(q) ||
      (dok.beschreibung || "").toLowerCase().includes(q);
    return katPasst && suchPasst;
  });

  const kategorieZaehlung = dokumente.reduce((acc, dok) => {
    const kat = effektiveKategorie(dok) || "Sonstiges";
    acc[kat] = (acc[kat] || 0) + 1;
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div data-tour="tour-dokumente-header" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
            Dokumentenarchiv
          </h1>
        </div>
        <button
          data-tour="tour-dokumente-upload"
          onClick={() => setUploadModalOffen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill transition-colors"
        >
          <Plus size={14} /> Hochladen
        </button>
      </div>

      {/* Wissen-Erfolg */}
      {wissenErfolgreich && (
        <div className="p-3 rounded-card bg-green-500/10 border border-green-500/30 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle size={14} /> Wissenseintrag gespeichert.
        </div>
      )}

      {/* Fehler */}
      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} /> {fehler}
          <button onClick={() => setFehler(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Suchfeld */}
      <div data-tour="tour-dokumente-suche" className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
        <input
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          placeholder="Dokument suchen…"
          className="w-full pl-9 pr-9 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
        {suchbegriff && (
          <button
            onClick={() => setSuchbegriff("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Kategorie-Filter-Chips */}
      <div data-tour="tour-dokumente-filter" className="flex gap-2 flex-wrap">
        {["Alle", ...KATEGORIEN].map((kat) => {
          const aktiv = kategorieFilter === kat;
          const anzahl = kat === "Alle" ? dokumente.length : (kategorieZaehlung[kat] || 0);
          return (
            <button
              key={kat}
              onClick={() => setKategorieFilter(kat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors border ${
                aktiv
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
              }`}
            >
              {kat}
              {(kat === "Alle" || anzahl > 0) && (
                <span className={`px-1 py-0.5 rounded-full text-[10px] ${aktiv ? "bg-white/20 text-white" : "bg-light-border dark:bg-canvas-3"}`}>
                  {anzahl}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hauptinhalt */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : gefilterteDokumente.length === 0 ? (
        <div data-tour="tour-dokumente-liste" className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">
            {suchbegriff || kategorieFilter !== "Alle"
              ? "Keine Dokumente gefunden."
              : "Noch keine Dokumente hochgeladen."}
          </p>
          {!suchbegriff && kategorieFilter === "Alle" && (
            <p className="text-xs mt-1 opacity-70">
              Klicke auf „Hochladen", um dein erstes Dokument hinzuzufügen.
            </p>
          )}
        </div>
      ) : (
        <div data-tour="tour-dokumente-liste" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gefilterteDokumente.map((dok) => (
            <DokumentKarte
              key={dok.id}
              dok={dok}
              onDownload={handleDownload}
              onLoeschen={handleLoeschen}
              onWissen={setWissenModalDok}
              onVorschau={(d) => setVorschauDok({ storagePfad: d.storage_pfad, dateiname: d.dateiname, datei_typ: d.datei_typ })}
              onAnalyseStarten={handleAnalyseStarten}
              onRechnungBearbeiten={setRechnungsEditDok}
              laedtDownload={laedtDownload}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {uploadModalOffen && (
        <UploadModal
          userId={userId}
          onSchliessen={() => setUploadModalOffen(false)}
          onErfolgreich={() => { setUploadModalOffen(false); ladeDaten(); }}
        />
      )}
      {wissenModalDok && (
        <WissensEintragModal
          dok={wissenModalDok}
          userId={userId}
          onSchliessen={() => setWissenModalDok(null)}
          onErfolgreich={handleWissensErfolg}
        />
      )}
      {rechnungsEditDok && (
        <RechnungsEditModal
          dokId={rechnungsEditDok.id}
          onSchliessen={() => setRechnungsEditDok(null)}
          onErfolgreich={() => { setRechnungsEditDok(null); toast.success("Rechnung aktualisiert."); }}
        />
      )}
      {vorschauDok && (
        <DokumentVorschauModal
          storagePfad={vorschauDok.storagePfad}
          dateiname={vorschauDok.dateiname}
          datei_typ={vorschauDok.datei_typ}
          onSchliessen={() => setVorschauDok(null)}
        />
      )}

      {/* Tour */}
      {tourAktiv && TOUR_STEPS.dokumente && (
        <TourOverlay
          steps={TOUR_STEPS.dokumente}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeDokumente;
