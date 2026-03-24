import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Upload, Download, Trash2, BookOpen,
  Search, X, Plus, CheckCircle, File, Loader2, AlertTriangle,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";
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

const BUDGET_KATEGORIEN = [
  "Lebensmittel", "Haushalt", "Reparaturen", "Abonnements",
  "Versicherungen", "Einrichtung", "Tanken", "Rücklagen", "Sonstiges",
];

const BUDGET_INSERT_VARIANTEN = [
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "typ", "app_modus"],
  ["user_id", "beschreibung", "betrag", "datum", "kategorie", "typ", "app_modus"],
  ["user_id", "beschreibung", "betrag", "datum", "kategorie"],
];

// Legacy: Extrahiert den [kategorie_hinweis] aus der alten Beschreibung
const extrahiereKategorieHinweis = (beschreibung) => {
  const match = beschreibung?.match(/\[([^\]]+)\]$/);
  return match ? match[1] : null;
};

// Gibt effektive Kategorie zurück: DB-Spalte hat Vorrang, dann Legacy-Parsing
const istRechnungTyp = (dok) =>
  (dok?.dokument_typ || "").trim().toLowerCase() === "rechnung";

const istRechnungKategorie = (dok) =>
  istRechnungTyp(dok) || (dok?.kategorie || "").trim() === "Rechnung";

const istBildDatei = (dok) => (dok?.datei_typ || "").startsWith("image/");

const hatRechnungsBildVorschau = (dok) =>
  istRechnungKategorie(dok) && istBildDatei(dok) && !!dok?.storage_pfad;

const effektiveKategorie = (dok) => {
  if (dok?.kategorie) return dok.kategorie;
  if (istRechnungTyp(dok)) return "Rechnung";
  return extrahiereKategorieHinweis(dok.beschreibung);
};

// ── Upload-Modal ──────────────────────────────────────────────────────────────
const UploadModal = ({ userId, onSchliessen, onErfolgreich }) => {
  const [datei, setDatei] = useState(null);
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState("Sonstiges");
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

      const { error: dbErr } = await supabase.from("dokumente").insert({
        user_id: userId,
        dateiname: datei.name,
        datei_typ: datei.type,
        storage_pfad: filePath,
        beschreibung: beschreibung || null,
        groesse_kb: Math.round(datei.size / 1024),
        kategorie,
        dokument_typ: kategorie === "Rechnung" ? "rechnung" : null,
      });
      if (dbErr) throw dbErr;

      await logVerlauf(supabase, userId, "dokumente", datei.name, "erstellt");
      onErfolgreich();
    } catch (err) {
      setFehler(`Upload fehlgeschlagen: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
      const { error } = await supabase.from("home_wissen").insert({
        user_id: userId,
        titel: titel.trim(),
        inhalt: inhalt || null,
        kategorie,
        tags: [dok.dateiname],
      });
      if (error) throw error;
      await logVerlauf(supabase, userId, "home_wissen", titel.trim(), "erstellt");
      onErfolgreich();
    } catch (err) {
      setFehler(`Fehler: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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

const BudgetZuordnungModal = ({ dok, initial, onSchliessen, onSpeichern, speichern }) => {
  const [beschreibung, setBeschreibung] = useState(initial?.beschreibung || "");
  const [betrag, setBetrag] = useState(initial?.betrag || "");
  const [datum, setDatum] = useState(initial?.datum || new Date().toISOString().split("T")[0]);
  const [kategorie, setKategorie] = useState(initial?.kategorie || "Haushalt");

  const handleSpeichern = () => {
    const nummer = Number.parseFloat(String(betrag).replace(",", "."));
    if (!beschreibung.trim() || !Number.isFinite(nummer) || nummer <= 0) return;
    onSpeichern({
      beschreibung: beschreibung.trim(),
      betrag: nummer,
      datum: datum || null,
      kategorie,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Plus size={16} className="text-primary-500" /> Zum Budget hinzufügen
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
          Dokument: {dok?.dateiname}
        </p>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Beschreibung*</label>
          <input
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="z. B. Rechnung Supermarkt"
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Betrag (€)*</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              placeholder="0,00"
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Datum</label>
            <input
              type="date"
              value={datum || ""}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            {BUDGET_KATEGORIEN.map((kat) => <option key={kat}>{kat}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSchliessen}
            disabled={speichern}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            disabled={speichern || !beschreibung.trim() || !betrag}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Dokument-Karte ─────────────────────────────────────────────────────────────
const DokumentKarte = ({
  dok,
  onDownload,
  onLoeschen,
  onWissen,
  onZumBudget,
  laedtDownload,
  highlighted,
}) => {
  const kat = effektiveKategorie(dok);
  const katFarbe = KATEGORIE_FARBEN[kat] || KATEGORIE_FARBEN.Sonstiges;
  const beschreibungOhneHinweis = dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || "";
  const [vorschauOffen, setVorschauOffen] = useState(false);
  const hatBildVorschau = hatRechnungsBildVorschau(dok) && !!dok.vorschau_url;

  const dateiIcon = () => {
    if (dok.datei_typ?.startsWith("image/")) return <File size={20} className="text-blue-500" />;
    if (dok.datei_typ === "application/pdf") return <FileText size={20} className="text-red-500" />;
    return <FileText size={20} className="text-light-text-secondary dark:text-dark-text-secondary" />;
  };

  return (
    <div
      data-dokument-id={dok.id}
      className={`p-4 rounded-card bg-light-card dark:bg-canvas-2 border transition-colors ${
        highlighted
          ? "border-primary-500 ring-2 ring-primary-500/30"
          : "border-light-border dark:border-dark-border hover:border-primary-500/30"
      }`}
    >
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
        </div>
      </div>

      {hatBildVorschau && (
        <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border space-y-2">
          <button
            type="button"
            onClick={() => setVorschauOffen((prev) => !prev)}
            className="w-full flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border p-2 text-left hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
          >
            <img
              src={dok.vorschau_url}
              alt={`Vorschau von ${dok.dateiname}`}
              className="w-14 h-14 rounded-card-sm object-cover border border-light-border dark:border-dark-border flex-shrink-0"
              loading="lazy"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main">
                Rechnungsvorschau
              </p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {vorschauOffen ? "Zum Schliessen erneut klicken" : "Zum Oeffnen klicken"}
              </p>
            </div>
          </button>

          {vorschauOffen && (
            <button
              type="button"
              onClick={() => setVorschauOffen(false)}
              className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-2 hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
            >
              <img
                src={dok.vorschau_url}
                alt={`Rechnung ${dok.dateiname}`}
                className="w-full max-h-72 object-contain rounded-card-sm"
                loading="lazy"
              />
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-light-border dark:border-dark-border">
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
        {istRechnungKategorie(dok) && (
          dok.im_budget ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-green-500/10 text-green-600 dark:text-green-400">
              <CheckCircle size={12} /> Im Budget
            </span>
          ) : (
            <button
              onClick={() => onZumBudget(dok)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
            >
              <Plus size={12} /> Zum Budget hinzufügen
            </button>
          )
        )}
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
  const location = useLocation();
  const navigate = useNavigate();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("dokumente");

  const [dokumente, setDokumente] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState(null);
  const [laedtDownload, setLaedtDownload] = useState(false);
  const [uploadModalOffen, setUploadModalOffen] = useState(false);
  const [wissenModalDok, setWissenModalDok] = useState(null);
  const [wissenErfolgreich, setWissenErfolgreich] = useState(false);
  const [budgetModalDok, setBudgetModalDok] = useState(null);
  const [budgetModalInitial, setBudgetModalInitial] = useState(null);
  const [budgetSpeichern, setBudgetSpeichern] = useState(false);
  const [kategorieFilter, setKategorieFilter] = useState("Alle");
  const [suchbegriff, setSuchbegriff] = useState("");
  const [highlightedDokumentId, setHighlightedDokumentId] = useState(null);
  const handledFocusRef = useRef(null);
  const focusDokumentId = location.state?.focusDokumentId || null;

  const baueVorschauUrls = useCallback(async (doks) => {
    const zielDoks = doks.filter((dok) => hatRechnungsBildVorschau(dok));
    if (zielDoks.length === 0) return {};

    const vorschauEintraege = await Promise.all(
      zielDoks.map(async (dok) => {
        const { data, error } = await supabase.storage
          .from("user-dokumente")
          .createSignedUrl(dok.storage_pfad, 60 * 60);
        if (error || !data?.signedUrl) return [dok.id, null];
        return [dok.id, data.signedUrl];
      })
    );

    return Object.fromEntries(vorschauEintraege);
  }, []);

  const resolveHouseholdId = useCallback(async () => {
    const aktiveHouseholdId = getActiveHouseholdId();
    if (aktiveHouseholdId) return aktiveHouseholdId;
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
  }, [userId]);

  const insertBudgetPostenRobust = useCallback(async (payloadBase) => {
    let lastError = null;

    for (const variante of BUDGET_INSERT_VARIANTEN) {
      const payload = {};
      for (const feld of variante) {
        if (payloadBase[feld] !== undefined) payload[feld] = payloadBase[feld];
      }

      const { data, error } = await supabase
        .from("budget_posten")
        .insert(payload)
        .select("id, household_id")
        .single();

      if (!error) return { data, error: null };
      lastError = error;

      const msg = String(error.message || "").toLowerCase();
      const details = String(error.details || "").toLowerCase();
      const hint = String(error.hint || "").toLowerCase();
      const combined = `${msg} ${details} ${hint}`;
      const istSpaltenfehler =
        error.code === "PGRST204" ||
        combined.includes("column") ||
        combined.includes("could not find") ||
        combined.includes("does not exist");

      if (!istSpaltenfehler) break;
    }

    return { data: null, error: lastError };
  }, []);

  // ── Laden ──────────────────────────────────────────────────────────────────
  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("dokumente")
        .select("id, dateiname, datei_typ, storage_pfad, beschreibung, groesse_kb, kategorie, dokument_typ, erstellt_am")
        .eq("user_id", userId)
        .order("erstellt_am", { ascending: false });
      if (error) throw error;
      const doks = data || [];
      const vorschauUrls = await baueVorschauUrls(doks);
      const dokIds = doks.map((dok) => dok.id).filter(Boolean);
      const householdId = await resolveHouseholdId().catch(() => null);

      let budgetLinkedSet = new Set();
      let rechnungByDokId = new Map();

      if (dokIds.length > 0) {
        let linksQuery = supabase
          .from("dokument_links")
          .select("dokument_id")
          .eq("entity_type", "budget_posten")
          .in("dokument_id", dokIds);
        if (householdId) linksQuery = linksQuery.eq("household_id", householdId);
        const { data: linkRows } = await linksQuery;
        budgetLinkedSet = new Set((linkRows || []).map((row) => row.dokument_id));

        let rechnungQuery = supabase
          .from("rechnungen")
          .select("dokument_id, lieferant_name, brutto, rechnungsdatum")
          .in("dokument_id", dokIds);
        if (householdId) rechnungQuery = rechnungQuery.eq("household_id", householdId);
        const { data: rechnungRows } = await rechnungQuery;
        rechnungByDokId = new Map((rechnungRows || []).map((row) => [row.dokument_id, row]));
      }

      setDokumente(doks.map((dok) => ({
        ...dok,
        vorschau_url: vorschauUrls[dok.id] || null,
        im_budget: budgetLinkedSet.has(dok.id),
        rechnung_info: rechnungByDokId.get(dok.id) || null,
      })));
    } catch (err) {
      setFehler("Dokumente konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [baueVorschauUrls, resolveHouseholdId, userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  useEffect(() => {
    if (!focusDokumentId || loading) return;
    if (handledFocusRef.current === focusDokumentId) return;

    if (kategorieFilter !== "Alle") setKategorieFilter("Alle");
    if (suchbegriff) setSuchbegriff("");

    const zielEl = document.querySelector(`[data-dokument-id="${focusDokumentId}"]`);
    if (!zielEl) return;

    handledFocusRef.current = focusDokumentId;
    setHighlightedDokumentId(focusDokumentId);

    zielEl.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedDokumentId(null), 2500);
    navigate(location.pathname, { replace: true, state: {} });

    return () => window.clearTimeout(timer);
  }, [focusDokumentId, kategorieFilter, loading, location.pathname, navigate, suchbegriff]);

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
      await deleteInvoiceCascade({
        supabase,
        dokumentId: id,
        fallbackStoragePfad: storagePfad,
      });
      await logVerlauf(supabase, userId, "dokumente", dateiname, "geloescht");
      setDokumente((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setFehler(`Löschen fehlgeschlagen: ${err.message}`);
    }
  };

  // ── Wissen-Erfolg ──────────────────────────────────────────────────────────
  const handleWissensErfolg = () => {
    setWissenModalDok(null);
    setWissenErfolgreich(true);
    setTimeout(() => setWissenErfolgreich(false), 3000);
  };

  const oeffneBudgetModal = (dok) => {
    if (!dok || dok.im_budget || !istRechnungKategorie(dok)) return;
    const brutto = Number(dok?.rechnung_info?.brutto);
    const rechnungsDatum = dok?.rechnung_info?.rechnungsdatum || null;
    const erstelltAm = dok?.erstellt_am ? String(dok.erstellt_am).slice(0, 10) : null;
    const beschreibung = dok?.rechnung_info?.lieferant_name
      ? `Rechnung ${dok.rechnung_info.lieferant_name}`
      : `Rechnung ${dok.dateiname?.replace(/\.[^.]+$/, "") || ""}`.trim();

    setBudgetModalDok(dok);
    setBudgetModalInitial({
      beschreibung: beschreibung || "Rechnung",
      betrag: Number.isFinite(brutto) && brutto > 0 ? brutto.toFixed(2) : "",
      datum: rechnungsDatum || erstelltAm || new Date().toISOString().split("T")[0],
      kategorie: "Haushalt",
    });
  };

  const handleZumBudgetSpeichern = async (payload) => {
    if (!budgetModalDok?.id) return;
    setBudgetSpeichern(true);
    setFehler(null);

    try {
      const householdId = await resolveHouseholdId();
      const budgetPayload = {
        user_id: userId,
        household_id: householdId || undefined,
        beschreibung: payload.beschreibung,
        betrag: Math.abs(Number(payload.betrag)),
        datum: payload.datum,
        kategorie: payload.kategorie || "Haushalt",
        typ: "ausgabe",
        app_modus: "home",
      };

      const { data: budgetData, error: budgetErr } = await insertBudgetPostenRobust(budgetPayload);
      if (budgetErr || !budgetData?.id) {
        throw new Error(budgetErr?.message || "Budgeteintrag konnte nicht erstellt werden.");
      }

      const linkHouseholdId = budgetData.household_id || householdId;
      if (!linkHouseholdId) {
        throw new Error("Haushalt für Dokument-Link konnte nicht ermittelt werden.");
      }

      const { error: linkErr } = await supabase
        .from("dokument_links")
        .insert({
          household_id: linkHouseholdId,
          dokument_id: budgetModalDok.id,
          entity_type: "budget_posten",
          entity_id: budgetData.id,
          role: "expense",
        });
      if (linkErr) throw new Error(`Dokument-Link fehlgeschlagen: ${linkErr.message}`);

      setDokumente((prev) => prev.map((dok) => (
        dok.id === budgetModalDok.id ? { ...dok, im_budget: true } : dok
      )));
      setBudgetModalDok(null);
      setBudgetModalInitial(null);
    } catch (err) {
      setFehler(`Budget-Zuordnung fehlgeschlagen: ${err.message}`);
    } finally {
      setBudgetSpeichern(false);
    }
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
              onZumBudget={oeffneBudgetModal}
              laedtDownload={laedtDownload}
              highlighted={highlightedDokumentId === dok.id}
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
      {budgetModalDok && (
        <BudgetZuordnungModal
          dok={budgetModalDok}
          initial={budgetModalInitial}
          speichern={budgetSpeichern}
          onSchliessen={() => {
            if (budgetSpeichern) return;
            setBudgetModalDok(null);
            setBudgetModalInitial(null);
          }}
          onSpeichern={handleZumBudgetSpeichern}
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
