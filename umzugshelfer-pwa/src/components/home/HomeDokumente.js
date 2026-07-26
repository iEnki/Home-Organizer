import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  FileText, FolderOpen, Upload, Download, Trash2, BookOpen,
  X, Plus, CheckCircle, File, Loader2, AlertTriangle, Pencil, ZoomIn, ZoomOut, Wallet,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import { getDokDatum, getMonatsKey, compareDokDatum, sortMonthKeys } from "../../utils/dokumentArchiv";
import { syncInvoiceDate } from "../../utils/invoiceDateSync";
import DokumentFilterBar from "./documents/DokumentFilterBar";
import DokumentArchivListe from "./documents/DokumentArchivListe";
import DokumentWissenAnalyseModal from "./documents/DokumentWissenAnalyseModal";
import GlassSurface, { GlassModule } from "../ui/GlassSurface";

// ── Konstanten ────────────────────────────────────────────────────────────────
const KATEGORIEN = [
  "Rechnung", "Vertrag", "Handbuch", "Garantie",
  "Versicherung", "Behörde", "Gesundheit", "Medikamente", "Sonstiges",
];

const KATEGORIE_FARBEN = {
  Rechnung:     { icon: "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/20",     badge: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20",         accent: "bg-blue-500",     dot: "bg-blue-400"     },
  Vertrag:      { icon: "bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/20", badge: "bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20", accent: "bg-purple-500", dot: "bg-purple-400"   },
  Handbuch:     { icon: "bg-green-500/20 text-green-400 ring-1 ring-green-500/20",   badge: "bg-green-500/10 text-green-500 dark:text-green-400 border border-green-500/20",     accent: "bg-green-500",  dot: "bg-green-400"    },
  Garantie:     { icon: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/20",   badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20",     accent: "bg-amber-500",  dot: "bg-amber-400"    },
  Versicherung: { icon: "bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/20",     badge: "bg-teal-500/10 text-teal-500 dark:text-teal-400 border border-teal-500/20",         accent: "bg-teal-500",   dot: "bg-teal-400"     },
  Behörde:      { icon: "bg-red-500/20 text-red-400 ring-1 ring-red-500/20",         badge: "bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20",             accent: "bg-red-500",    dot: "bg-red-400"      },
  Gesundheit:   { icon: "bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/20",     badge: "bg-pink-500/10 text-pink-500 dark:text-pink-400 border border-pink-500/20",         accent: "bg-pink-500",   dot: "bg-pink-400"     },
  Medikamente:  { icon: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/20", badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20", accent: "bg-emerald-500", dot: "bg-emerald-400" },
  Sonstiges:    { icon: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",   badge: "bg-slate-500/10 text-slate-400 border border-slate-500/20",                         accent: "bg-slate-500",  dot: "bg-slate-400"    },
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

const chunkArray = (items, size = 75) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const guessMimeFromName = (name) => {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png"))  return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif"))  return "image/gif";
  if (n.endsWith(".bmp"))  return "image/bmp";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  if (n.endsWith(".pdf"))  return "application/pdf";
  return "";
};

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

const hatBildDateiExtension = (dok) =>
  /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(
    dok?.dateiname || dok?.storage_pfad || ""
  );

const hatBildVorschauCheck = (dok) =>
  !!dok?.storage_pfad && (istBildDatei(dok) || hatBildDateiExtension(dok));

const istPdfDatei = (dok) =>
  (dok?.datei_typ || "").includes("pdf") ||
  /\.pdf$/i.test(dok?.dateiname || dok?.storage_pfad || "");

const hatVorschauCheck = (dok) =>
  !!dok?.storage_pfad && (hatBildVorschauCheck(dok) || istPdfDatei(dok));

const effektiveKategorie = (dok) => {
  if ((dok?.dokument_typ || "").trim().toLowerCase() === "beipackzettel") return "Medikamente";
  if ((dok?.kategorie || "").trim().toLowerCase() === "medikament") return "Medikamente";
  if (dok?.kategorie) return dok.kategorie;
  if (istRechnungTyp(dok)) return "Rechnung";
  return extrahiereKategorieHinweis(dok.beschreibung);
};

// ── Motion-Varianten ─────────────────────────────────────────────────────────
const sectionVariants   = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const cardVariants      = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 30 } } };
const warnVariants      = { hidden: { opacity: 0, y: -10, scaleY: 0.92 }, show: { opacity: 1, y: 0, scaleY: 1, transition: { type: "spring", stiffness: 400, damping: 30 } }, exit: { opacity: 0, y: -8, scaleY: 0.95, transition: { duration: 0.18 } } };
const modalOverlayVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.18 } }, exit: { opacity: 0, transition: { duration: 0.15 } } };
const modalDialogVariants  = { hidden: { opacity: 0, scale: 0.95, y: 16 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32 } }, exit: { opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.16 } } };

// ── Upload-Modal ──────────────────────────────────────────────────────────────
const UploadModal = ({ userId, onSchliessen, onErfolgreich }) => {
  const { t } = useTranslation(["documents", "common"]);
  const reduced = useReducedMotion();
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
        app_modus: "home",
        dateiname: datei.name,
        datei_typ: datei.type || guessMimeFromName(datei.name) || null,
        storage_pfad: filePath,
        beschreibung: beschreibung || null,
        groesse_kb: Math.round(datei.size / 1024),
        kategorie,
        dokument_typ: kategorie === "Rechnung" ? "rechnung" : null,
      });
      if (dbErr) throw dbErr;

      await notifyHouseholdEvent({
        supabaseClient: supabase,
        userId,
        table: "dokumente",
        action: "erstellt",
        recordName: datei.name,
        url: "/home/dokumente",
      });
      onErfolgreich();
    } catch (err) {
      setFehler(t("documents:uploadModal.error", { msg: err.message }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      variants={reduced ? {} : modalOverlayVariants}
      initial="hidden" animate="show" exit="exit"
      className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm"
      onClick={onSchliessen}
    >
      <motion.div
        variants={reduced ? {} : modalDialogVariants}
        className="mobile-modal-dialog w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 flex min-h-0 flex-col"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header — immer sichtbar */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Upload size={16} className="text-primary-500" /> {t("documents:uploadModal.title")}
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollbar */}
        <div className="mobile-modal-body flex-1 px-5 pt-4 pb-2 space-y-4">
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
                {t("documents:uploadModal.drop")}
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
              {t("documents:uploadModal.category")}
            </label>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            >
              {KATEGORIEN.map((k) => <option key={k} value={k}>{t(`documents:categories.${k}`, { defaultValue: k })}</option>)}
            </select>
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              {t("documents:uploadModal.description")}
            </label>
            <input
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder={t("documents:uploadModal.descriptionPlaceholder")}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>

          {fehler && (
            <div className="p-3 rounded-card-sm bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={14} /> {fehler}
            </div>
          )}
        </div>

        {/* Footer — immer sichtbar */}
        <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            onClick={handleHochladen}
            disabled={!datei || uploading}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? t("documents:uploadModal.uploading") : t("documents:uploadModal.upload")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Wissenseintrag-Modal ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
const WissensEintragModal = ({ dok, userId, onSchliessen, onErfolgreich }) => {
  const { t } = useTranslation(["home", "common"]);
  const reduced = useReducedMotion();
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
        dokument_id: dok.id,
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
    <motion.div
      variants={reduced ? {} : modalOverlayVariants}
      initial="hidden" animate="show" exit="exit"
      className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm"
      onClick={onSchliessen}
    >
      <motion.div
        variants={reduced ? {} : modalDialogVariants}
        className="mobile-modal-dialog w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <BookOpen size={16} className="text-amber-500" /> {t("home:dokumente.wissensModal.title")}
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.wissensModal.titleLabel")}</label>
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.wissensModal.category")}</label>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            {WISSEN_KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.wissensModal.content")}</label>
          <textarea
            value={inhalt}
            onChange={(e) => setInhalt(e.target.value)}
            rows={3}
            placeholder={t("home:dokumente.wissensModal.contentPlaceholder")}
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
            {t("common:actions.cancel")}
          </button>
          <button
            onClick={handleSpeichern}
            disabled={!titel.trim() || speichern}
            className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {t("common:actions.save")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const BudgetZuordnungModal = ({ dok, initial, onSchliessen, onSpeichern, speichern }) => {
  const { t } = useTranslation(["home", "common"]);
  const reduced = useReducedMotion();
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
    <motion.div
      variants={reduced ? {} : modalOverlayVariants}
      initial="hidden" animate="show" exit="exit"
      className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm"
      onClick={onSchliessen}
    >
      <motion.div
        variants={reduced ? {} : modalDialogVariants}
        className="mobile-modal-dialog w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Plus size={16} className="text-primary-500" /> {t("home:dokumente.budgetModal.title")}
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
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.budgetModal.description")}</label>
          <input
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder={t("home:dokumente.budgetModal.descriptionPlaceholder")}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.budgetModal.amount")}</label>
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
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.budgetModal.date")}</label>
            <input
              type="date"
              value={datum || ""}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("home:dokumente.budgetModal.category")}</label>
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
            {t("common:actions.cancel")}
          </button>
          <button
            onClick={handleSpeichern}
            disabled={speichern || !beschreibung.trim() || !betrag}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {t("common:actions.save")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Bearbeiten-Modal ──────────────────────────────────────────────────────────
const BearbeitenModal = ({ dok, userId, onSchliessen, onGespeichert }) => {
  const { t } = useTranslation(["home", "common"]);
  const reduced = useReducedMotion();
  const [dateiname, setDateiname] = useState(dok.dateiname || "");
  const [beschreibung, setBeschreibung] = useState(
    dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || ""
  );
  const [kategorie, setKategorie] = useState(effektiveKategorie(dok) || "Sonstiges");
  const [rechnungsDatum, setRechnungsDatum] = useState(dok?.rechnung_info?.rechnungsdatum || "");
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");
  const hatRechnung = Boolean(dok?.rechnung_info?.id);

  const handleSpeichern = async () => {
    if (!dateiname.trim()) return;
    setSpeichern(true);
    setFehler("");
    try {
      if (hatRechnung) {
        await syncInvoiceDate({
          supabase,
          rechnungId: dok.rechnung_info.id,
          neuesDatum: rechnungsDatum || null,
          userId,
        });
      }

      const neuerDokumentTyp =
        kategorie === "Rechnung" ? "rechnung" : dok.dokument_typ;
      const updated = {
        dateiname: dateiname.trim(),
        beschreibung: beschreibung.trim() || null,
        kategorie,
        dokument_typ: neuerDokumentTyp,
      };
      const { error } = await supabase
        .from("dokumente")
        .update(updated)
        .eq("id", dok.id);
      if (error) throw error;
      await logVerlauf(supabase, userId, "dokumente", dateiname.trim(), "geaendert");
      onGespeichert();
    } catch (err) {
      setFehler(`Fehler: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <motion.div
      variants={reduced ? {} : modalOverlayVariants}
      initial="hidden" animate="show" exit="exit"
      className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm"
      onClick={onSchliessen}
    >
      <motion.div
        variants={reduced ? {} : modalDialogVariants}
        className="mobile-modal-dialog w-full max-w-md bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 flex min-h-0 flex-col"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Pencil size={16} className="text-primary-500" /> {t("home:dokumente.editModal.title")}
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              {t("home:dokumente.editModal.filename")}
            </label>
            <input
              value={dateiname}
              onChange={(e) => setDateiname(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              {t("home:dokumente.editModal.description")}
            </label>
            <input
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder={t("home:dokumente.editModal.descriptionPlaceholder")}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              {t("home:dokumente.editModal.category")}
            </label>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            >
              {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>

          {hatRechnung && (
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                {t("home:dokumente.editModal.invoiceDate")}
              </label>
              <input
                type="date"
                value={rechnungsDatum || ""}
                onChange={(e) => setRechnungsDatum(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
            </div>
          )}

          {fehler && (
            <div className="p-3 rounded-card-sm bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={14} /> {fehler}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            onClick={handleSpeichern}
            disabled={!dateiname.trim() || speichern}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {t("common:actions.save")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Dokument-Karte ─────────────────────────────────────────────────────────────
const DokumentKarte = ({
  dok,
  vorschauUrl,
  onLoadVorschau,
  onDownload,
  onLoeschen,
  onWissen,
  onZumBudget,
  onBearbeiten,
  laedtDownload,
  highlighted,
}) => {
  const kat = effektiveKategorie(dok);
  const katObj = KATEGORIE_FARBEN[kat] || KATEGORIE_FARBEN.Sonstiges;
  const beschreibungOhneHinweis = dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || "";
  const [vorschauOffen, setVorschauOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [zoom, setZoom] = useState(1);
  const istPdf = istPdfDatei(dok);
  const hatBildVorschau = hatBildVorschauCheck(dok) && !!vorschauUrl;
  const hatPdfVorschau = istPdf && !!vorschauUrl && !hatBildVorschau;
  const hatVorschau = hatBildVorschau || hatPdfVorschau || hatVorschauCheck(dok);
  const istRechnung = istRechnungKategorie(dok);
  const rechnungIstImBudget = istRechnung && dok.im_budget;
  const rechnungIstWissen = istRechnung && dok.hat_wissen;

  const dateiIcon = () => {
    if (dok.datei_typ?.startsWith("image/")) return <File size={20} className="text-blue-500" />;
    if (dok.datei_typ === "application/pdf") return <FileText size={20} className="text-red-500" />;
    return <FileText size={20} className="text-light-text-secondary dark:text-dark-text-secondary" />;
  };

  return (
    <GlassSurface
      as="article"
      data-dokument-id={dok.id}
      variants={cardVariants}
      className={`relative p-4 overflow-hidden ${
        highlighted
          ? "border-primary-500 ring-2 ring-primary-500/30 shadow-glow-primary"
          : ""
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${katObj.accent} opacity-60`} aria-hidden="true" />
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-card-sm flex items-center justify-center flex-shrink-0 ${katObj.icon}`}>
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
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${katObj.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${katObj.dot}`} aria-hidden="true" />
                {kat}
              </span>
            )}
            {rechnungIstImBudget && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                <Wallet size={11} /> Im Budget
              </span>
            )}
            {rechnungIstWissen && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BookOpen size={11} /> In Wissen
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

      {hatVorschau && (
        <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border space-y-2">
          <button
            type="button"
            onClick={async () => {
              if (!vorschauUrl) {
                setLaedt(true);
                try {
                  await onLoadVorschau?.();
                } finally {
                  setLaedt(false);
                }
              }
              setVorschauOffen((prev) => !prev);
              setZoom(1);
            }}
            className="w-full flex items-center gap-2 rounded-card-sm border border-white/40 bg-white/25 p-2 text-left backdrop-blur-sm transition-colors hover:bg-white/40 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:bg-white/[0.05]"
          >
            {laedt ? (
              <div className="w-14 h-14 rounded-card-sm border border-light-border dark:border-dark-border flex-shrink-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
              </div>
            ) : hatBildVorschau ? (
              <img
                src={vorschauUrl}
                alt={`Vorschau von ${dok.dateiname}`}
                className="w-14 h-14 rounded-card-sm object-cover border border-light-border dark:border-dark-border flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-14 h-14 rounded-card-sm border border-light-border dark:border-dark-border flex-shrink-0 flex items-center justify-center bg-red-500/10">
                <FileText size={24} className="text-red-500" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main">
                {hatPdfVorschau ? "PDF Vorschau" : istRechnungKategorie(dok) ? "Rechnungsvorschau" : "Bildvorschau"}
              </p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {vorschauOffen ? "Zum Schliessen erneut klicken" : "Zum Oeffnen klicken"}
              </p>
            </div>
          </button>

          {vorschauOffen && vorschauUrl && (
            hatBildVorschau ? (
              <div className="rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1 bg-light-bg dark:bg-canvas-1 border-b border-light-border dark:border-dark-border">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.5).toFixed(1)))}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                    >
                      <ZoomOut size={12} />
                    </button>
                    <button
                      onClick={() => setZoom(1)}
                      className="px-1.5 text-[10px] text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 min-w-[36px] text-center"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                    >
                      <ZoomIn size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => { setVorschauOffen(false); setZoom(1); }}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="overflow-auto max-h-72 bg-light-bg dark:bg-canvas-1 cursor-grab active:cursor-grabbing">
                  <img
                    src={vorschauUrl}
                    alt={`Rechnung ${dok.dateiname}`}
                    style={{ width: `${zoom * 100}%`, display: 'block' }}
                    loading="lazy"
                  />
                </div>
              </div>
            ) : (
              <iframe
                src={vorschauUrl}
                title={`PDF: ${dok.dateiname}`}
                className="w-full h-72 rounded-card-sm border border-light-border dark:border-dark-border"
              />
            )
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <motion.button
            onClick={() => onDownload(dok.storage_pfad, dok.dateiname)}
            disabled={laedtDownload}
            whileTap={{ scale: 0.92 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors disabled:opacity-50"
          >
            <Download size={12} /> Herunterladen
          </motion.button>
          {(!istRechnung || !dok.hat_wissen) && (
            <motion.button
              onClick={() => onWissen(dok)}
              whileTap={{ scale: 0.92 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <BookOpen size={12} /> Als Wissen
            </motion.button>
          )}
          {rechnungIstWissen && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <BookOpen size={12} /> In Wissen
            </span>
          )}
          {istRechnung && (
            rechnungIstImBudget ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-green-500/10 text-green-600 dark:text-green-400">
                <Wallet size={12} /> Im Budget
              </span>
            ) : (
              <motion.button
                onClick={() => onZumBudget(dok)}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
              >
                <Plus size={12} /> Zum Budget hinzufügen
              </motion.button>
            )
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <motion.button
            onClick={() => onBearbeiten(dok)}
            whileTap={{ scale: 0.88 }}
            className="flex items-center px-2.5 py-1.5 text-xs rounded-card-sm bg-light-hover dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main transition-colors"
          >
            <Pencil size={12} />
          </motion.button>
          <motion.button
            onClick={() => onLoeschen(dok.id, dok.storage_pfad, dok.dateiname)}
            whileTap={{ scale: 0.88 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
          </motion.button>
        </div>
      </div>
    </GlassSurface>
  );
};

// ── Vorschau-Modal ─────────────────────────────────────────────────────────────
const VorschauModal = ({ dok, vorschauUrl, loadPreviewUrl, onSchliessen }) => {
  const reduced = useReducedMotion();
  const [url, setUrl] = useState(vorschauUrl || null);
  const [laedt, setLaedt] = useState(!vorschauUrl);

  useEffect(() => {
    if (url) return;
    let cancelled = false;
    setLaedt(true);
    loadPreviewUrl(dok).then((u) => {
      if (!cancelled) { setUrl(u); setLaedt(false); }
    }).catch(() => { if (!cancelled) setLaedt(false); });
    return () => { cancelled = true; };
  }, [dok, loadPreviewUrl, url]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onSchliessen(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onSchliessen]);

  const istBild = hatBildVorschauCheck(dok);
  const istPdf  = istPdfDatei(dok);

  return (
    <motion.div
      variants={reduced ? {} : modalOverlayVariants}
      initial="hidden" animate="show" exit="exit"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onSchliessen}
    >
      <motion.div
        variants={reduced ? {} : modalDialogVariants}
        className="relative w-full max-w-3xl bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate pr-4">
            {dok.dateiname}
          </p>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
          {laedt ? (
            <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
          ) : !url ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Vorschau nicht verfügbar.
            </p>
          ) : istBild ? (
            <img
              src={url}
              alt={dok.dateiname}
              className="max-w-full max-h-full object-contain rounded-card-sm"
            />
          ) : istPdf ? (
            <iframe
              src={url}
              title={dok.dateiname}
              className="w-full h-[60vh] rounded-card-sm border border-light-border dark:border-dark-border"
            />
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-500 hover:text-primary-600 underline"
            >
              Datei öffnen
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Hauptkomponente ────────────────────────────────────────────────────────────
const HomeDokumente = ({ session }) => {
  const userId = session?.user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
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
  const [bearbeitenModalDok, setBearbeitenModalDok] = useState(null);
  const [kategorieFilter, setKategorieFilter] = useState("Alle");
  const [suchbegriff, setSuchbegriff] = useState("");
  const [highlightedDokumentId, setHighlightedDokumentId] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("dok_archiv_viewmode") || "archiv");
  const [monatFilter, setMonatFilter] = useState("alle");
  const [jahrFilter, setJahrFilter] = useState("alle");
  const [sortierung, setSortierung] = useState("neueste");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [vorschauUrls, setVorschauUrls] = useState({});
  const [vorschauUrlsTs, setVorschauUrlsTs] = useState({});
  const [vorschauModal, setVorschauModal] = useState(null);
  const handledFocusRef = useRef(null);
  const focusDokumentId = location.state?.focusDokumentId || null;

  useEffect(() => {
    const assistantFlow = location.state?.assistantFlow;
    if (!assistantFlow) return;
    const startModal = assistantFlow.ui_state?.startModal;
    if (startModal === "upload") {
      setUploadModalOffen(true);
    }
    if (assistantFlow.ui_state?.prefillQuery || assistantFlow.params?.query) {
      setSuchbegriff(assistantFlow.ui_state?.prefillQuery || assistantFlow.params?.query || "");
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const loadPreviewUrl = useCallback(async (dok) => {
    const existing = vorschauUrls[dok.id];
    const ts = vorschauUrlsTs[dok.id] || 0;
    const FRESH_MS = 55 * 60 * 1000; // 55 Minuten
    if (existing && Date.now() - ts < FRESH_MS) return existing;

    if (!hatVorschauCheck(dok)) return null;
    const { data } = await supabase.storage
      .from("user-dokumente")
      .createSignedUrl(dok.storage_pfad, 60 * 60);
    const url = data?.signedUrl || null;
    if (url) {
      const now = Date.now();
      setVorschauUrls((prev) => ({ ...prev, [dok.id]: url }));
      setVorschauUrlsTs((prev) => ({ ...prev, [dok.id]: now }));
    }
    return url;
  }, [vorschauUrls, vorschauUrlsTs]);

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
        .select("id, dateiname, datei_typ, storage_pfad, beschreibung, groesse_kb, kategorie, dokument_typ, tags, meta, extrahierter_text, erstellt_am")
        .eq("user_id", userId)
        .in("app_modus", ["home", "beides"])
        .order("erstellt_am", { ascending: false });
      if (error) throw error;
      const doks = data || [];
      const dokIds = doks.map((dok) => dok.id).filter(Boolean);
      const householdId = await resolveHouseholdId().catch(() => null);

      let budgetLinkedSet = new Set();
      let rechnungByDokId = new Map();
      let wissenDokIdSet = new Set();

      if (dokIds.length > 0) {
        const linkRows = [];
        const rechnungRows = [];
        const wissenRows = [];

        for (const idChunk of chunkArray(dokIds)) {
          let linksQuery = supabase
            .from("dokument_links")
            .select("dokument_id")
            .eq("entity_type", "budget_posten")
            .in("dokument_id", idChunk);
          if (householdId) linksQuery = linksQuery.eq("household_id", householdId);
          const { data: chunkLinkRows, error: linkError } = await linksQuery;
          if (!linkError) linkRows.push(...(chunkLinkRows || []));

          let rechnungQuery = supabase
            .from("rechnungen")
            .select("id, dokument_id, lieferant_name, brutto, rechnungsdatum")
            .in("dokument_id", idChunk);
          if (householdId) rechnungQuery = rechnungQuery.eq("household_id", householdId);
          const { data: chunkRechnungRows, error: rechnungError } = await rechnungQuery;
          if (!rechnungError) rechnungRows.push(...(chunkRechnungRows || []));

          const { data: chunkWissenRows, error: wissenError } = await supabase
            .from("home_wissen")
            .select("dokument_id")
            .in("dokument_id", idChunk)
            .not("dokument_id", "is", null);
          if (!wissenError) wissenRows.push(...(chunkWissenRows || []));
        }

        budgetLinkedSet = new Set((linkRows || []).map((row) => row.dokument_id));
        rechnungByDokId = new Map((rechnungRows || []).map((row) => [row.dokument_id, row]));
        wissenDokIdSet = new Set((wissenRows || []).map((r) => r.dokument_id));
      }

      setDokumente(doks.map((dok) => ({
        ...dok,
        vorschau_url: null,
        im_budget: budgetLinkedSet.has(dok.id),
        hat_wissen: wissenDokIdSet.has(dok.id),
        rechnung_info: rechnungByDokId.get(dok.id) || null,
      })));
      setVorschauUrls({});
      setVorschauUrlsTs({});
    } catch (err) {
      setFehler("Dokumente konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [resolveHouseholdId, userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  useEffect(() => {
    if (!focusDokumentId || loading) return;
    if (handledFocusRef.current === focusDokumentId) return;

    if (kategorieFilter !== "Alle") setKategorieFilter("Alle");
    if (suchbegriff) setSuchbegriff("");
    if (monatFilter  !== "alle")  setMonatFilter("alle");
    if (jahrFilter   !== "alle")  setJahrFilter("alle");
    if (statusFilter !== "alle")  setStatusFilter("alle");
    if (viewMode !== "archiv")    handleViewMode("archiv");

    const zielEl = document.querySelector(`[data-dokument-id="${focusDokumentId}"]`);
    if (!zielEl) return;

    handledFocusRef.current = focusDokumentId;
    setHighlightedDokumentId(focusDokumentId);

    zielEl.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedDokumentId(null), 2500);
    navigate(location.pathname, { replace: true, state: {} });

    return () => window.clearTimeout(timer);
  }, [focusDokumentId, kategorieFilter, suchbegriff, monatFilter, jahrFilter, statusFilter, viewMode, loading, location.pathname, navigate]);

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
        archivedByUserId: userId,
      });
      await notifyHouseholdEvent({
        supabaseClient: supabase,
        userId,
        table: "dokumente",
        action: "geloescht",
        recordName: dateiname,
        recordId: id,
        url: "/home/dokumente",
      });
      setDokumente((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setFehler(`Löschen fehlgeschlagen: ${err.message}`);
    }
  };

  // ── Wissen-Erfolg ──────────────────────────────────────────────────────────
  const handleWissensErfolg = () => {
    setWissenModalDok(null);
    setWissenErfolgreich(true);
    ladeDaten();
    setTimeout(() => setWissenErfolgreich(false), 3000);
  };

  // ── Bearbeiten-Erfolg ──────────────────────────────────────────────────────
  const handleBearbeitenGespeichert = () => {
    setBearbeitenModalDok(null);
    ladeDaten();
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

  // ── Filterlogik ────────────────────────────────────────────────────────────
  const handleJahrFilter = (jahr) => {
    setJahrFilter(jahr);
    setMonatFilter("alle");
  };

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("dok_archiv_viewmode", mode);
  };

  const sichtbareDokumente = useMemo(() => {
    let r = dokumente.filter((dok) => {
      if (kategorieFilter !== "Alle" && effektiveKategorie(dok) !== kategorieFilter) return false;
      if (monatFilter !== "alle" && getMonatsKey(dok) !== monatFilter) return false;
      if (jahrFilter  !== "alle" && !getDokDatum(dok).startsWith(jahrFilter)) return false;
      if (statusFilter === "budget" && !dok.im_budget) return false;
      if (statusFilter === "wissen" && !dok.hat_wissen) return false;
      if (statusFilter === "offen"  && (!istRechnungKategorie(dok) || dok.im_budget)) return false;
      if (suchbegriff) {
        const q = suchbegriff.toLowerCase();
        const suchText = [
          dok.dateiname,
          dok.beschreibung,
          effektiveKategorie(dok),
          dok.dokument_typ,
          ...(Array.isArray(dok.tags) ? dok.tags : []),
          dok.meta?.source,
          dok.meta?.source_url,
          dok.meta?.basg?.product_name,
          dok.meta?.basg?.wirkstoff,
          dok.meta?.basg?.substances,
          dok.rechnung_info?.lieferant_name,
        ].flat().filter(Boolean).join(" ").toLowerCase();
        const treffer =
          suchText.includes(q);
        if (!treffer) return false;
      }
      return true;
    });

    // Bei name_az: Dokumente innerhalb der Monatsgruppen alphabetisch,
    // Monatsgruppen selbst bleiben chronologisch.
    r.sort((a, b) => {
      if (sortierung === "name_az") {
        const na = (a.rechnung_info?.lieferant_name || a.dateiname).toLowerCase();
        const nb = (b.rechnung_info?.lieferant_name || b.dateiname).toLowerCase();
        return na.localeCompare(nb, "de");
      }
      return compareDokDatum(a, b, sortierung);
    });

    return r;
  }, [dokumente, kategorieFilter, monatFilter, jahrFilter, statusFilter, suchbegriff, sortierung]);

  const gruppiertNachMonat = useMemo(() => {
    const map = {};
    sichtbareDokumente.forEach((dok) => {
      const key = getMonatsKey(dok);
      (map[key] ??= []).push(dok);
    });
    const reihenfolge = Object.keys(map).sort((a, b) => sortMonthKeys(a, b, sortierung));
    return { map, reihenfolge };
  }, [sichtbareDokumente, sortierung]);

  const verfuegbareJahre = useMemo(() =>
    [...new Set(dokumente.map((d) => getDokDatum(d).substring(0, 4)).filter(Boolean))].sort().reverse(),
  [dokumente]);

  const verfuegbareMonate = useMemo(() => {
    const basis = jahrFilter === "alle"
      ? dokumente
      : dokumente.filter((d) => getDokDatum(d).startsWith(jahrFilter));
    return [...new Set(basis.map(getMonatsKey).filter((k) => k !== "unbekannt"))].sort().reverse();
  }, [dokumente, jahrFilter]);

  const kategorieZaehlung = useMemo(() => dokumente.reduce((acc, dok) => {
    const kat = effektiveKategorie(dok) || "Sonstiges";
    acc[kat] = (acc[kat] || 0) + 1;
    return acc;
  }, {}), [dokumente]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GlassModule>

      {/* Header */}
      <motion.div
        data-tour="tour-dokumente-header"
        className="flex items-center gap-2"
        initial={reduced ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 26, delay: 0.05 }}
      >
        <FolderOpen size={22} className="text-primary-500" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
          Dokumentenarchiv
        </h1>
      </motion.div>

      {/* Wissen-Erfolg */}
      <AnimatePresence>
        {wissenErfolgreich && (
          <motion.div
            key="wissen-erfolg"
            variants={reduced ? {} : warnVariants}
            initial="hidden" animate="show" exit="exit"
            className="p-3 rounded-card bg-green-500/10 border border-green-500/30 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 origin-top"
          >
            <CheckCircle size={14} /> Wissenseintrag gespeichert.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fehler */}
      <AnimatePresence>
        {fehler && (
          <motion.div
            key="fehler-banner"
            variants={reduced ? {} : warnVariants}
            initial="hidden" animate="show" exit="exit"
            className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 origin-top"
          >
            <AlertTriangle size={14} /> {fehler}
            <button onClick={() => setFehler(null)} className="ml-auto"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FilterBar */}
      <DokumentFilterBar
        suchbegriff={suchbegriff}
        onSuche={setSuchbegriff}
        kategorieFilter={kategorieFilter}
        onKategorie={setKategorieFilter}
        monatFilter={monatFilter}
        onMonat={setMonatFilter}
        jahrFilter={jahrFilter}
        onJahr={handleJahrFilter}
        sortierung={sortierung}
        onSortierung={setSortierung}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
        viewMode={viewMode}
        onViewMode={handleViewMode}
        verfuegbareJahre={verfuegbareJahre}
        verfuegbareMonate={verfuegbareMonate}
        kategorieZaehlung={kategorieZaehlung}
        anzahlGefiltert={sichtbareDokumente.length}
        onUpload={() => setUploadModalOffen(true)}
      />

      {/* Hauptinhalt */}
      {loading ? (
        viewMode === "karten" ? (
          /* Karten-Skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassSurface key={i} interactive={false} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-card-sm bg-light-surface-2 dark:bg-canvas-3 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded w-3/4" />
                    <div className="h-2.5 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded w-1/2" />
                    <div className="flex gap-2">
                      <div className="h-4 w-16 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded-pill" />
                      <div className="h-4 w-10 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border flex gap-2">
                  <div className="h-6 w-24 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded-card-sm" />
                  <div className="h-6 w-20 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded-card-sm" />
                </div>
              </GlassSurface>
            ))}
          </div>
        ) : (
          /* Listen-Skeleton */
          <div className="space-y-3 animate-fade-in">
            {Array.from({ length: 3 }).map((_, g) => (
              <div key={g}>
                <div className="h-3 w-24 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded mb-2" />
                <div className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border">
                  {Array.from({ length: 3 }).map((_, r) => (
                    <div key={r} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-8 h-8 rounded-card-sm bg-light-surface-2 dark:bg-canvas-3 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded w-2/3" />
                        <div className="h-2.5 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded w-1/2" />
                      </div>
                      <div className="h-4 w-12 bg-light-surface-2 dark:bg-canvas-3 animate-pulse rounded hidden sm:block" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : sichtbareDokumente.length === 0 ? (
        <div data-tour="tour-dokumente-liste" className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">
            {suchbegriff || kategorieFilter !== "Alle" || monatFilter !== "alle" || jahrFilter !== "alle"
              ? "Keine Dokumente gefunden."
              : "Noch keine Dokumente hochgeladen."}
          </p>
          {!suchbegriff && kategorieFilter === "Alle" && monatFilter === "alle" && jahrFilter === "alle" && (
            <p className="text-xs mt-1 opacity-70">
              Klicke auf „Hochladen", um dein erstes Dokument hinzuzufügen.
            </p>
          )}
        </div>
      ) : viewMode === "archiv" ? (
        <div data-tour="tour-dokumente-liste">
          <DokumentArchivListe
            gruppiertNachMonat={gruppiertNachMonat}
            vorschauUrls={vorschauUrls}
            loadPreviewUrl={loadPreviewUrl}
            highlightedDokumentId={highlightedDokumentId}
            onVorschau={setVorschauModal}
            onBearbeiten={setBearbeitenModalDok}
            onLoeschen={handleLoeschen}
            onWissen={setWissenModalDok}
            onBudget={oeffneBudgetModal}
          />
        </div>
      ) : (
        <motion.div
          data-tour="tour-dokumente-liste"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          variants={reduced ? {} : sectionVariants}
          initial="hidden"
          animate="show"
        >
          {sichtbareDokumente.map((dok) => (
            <DokumentKarte
              key={dok.id}
              dok={dok}
              vorschauUrl={vorschauUrls[dok.id]}
              onLoadVorschau={() => loadPreviewUrl(dok)}
              onDownload={handleDownload}
              onLoeschen={handleLoeschen}
              onWissen={setWissenModalDok}
              onZumBudget={oeffneBudgetModal}
              onBearbeiten={setBearbeitenModalDok}
              laedtDownload={laedtDownload}
              highlighted={highlightedDokumentId === dok.id}
            />
          ))}
        </motion.div>
      )}

      {/* Vorschau-Modal */}
      <AnimatePresence>
        {vorschauModal && (
          <VorschauModal
            key="vorschau-modal"
            dok={vorschauModal}
            vorschauUrl={vorschauUrls[vorschauModal.id]}
            loadPreviewUrl={loadPreviewUrl}
            onSchliessen={() => setVorschauModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {uploadModalOffen && (
          <UploadModal
            key="upload-modal"
            userId={userId}
            onSchliessen={() => setUploadModalOffen(false)}
            onErfolgreich={() => { setUploadModalOffen(false); ladeDaten(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {wissenModalDok && (
          <DokumentWissenAnalyseModal
            key="wissen-modal"
            dok={wissenModalDok}
            userId={userId}
            session={session}
            onSchliessen={() => setWissenModalDok(null)}
            onErfolgreich={handleWissensErfolg}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {budgetModalDok && (
          <BudgetZuordnungModal
            key="budget-modal"
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
      </AnimatePresence>
      <AnimatePresence>
        {bearbeitenModalDok && (
          <BearbeitenModal
            key="bearbeiten-modal"
            dok={bearbeitenModalDok}
            userId={userId}
            onSchliessen={() => setBearbeitenModalDok(null)}
            onGespeichert={handleBearbeitenGespeichert}
          />
        )}
      </AnimatePresence>
      {/* Tour */}
      {tourAktiv && TOUR_STEPS.dokumente && (
        <TourOverlay
          steps={TOUR_STEPS.dokumente}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </GlassModule>
  );
};

export default HomeDokumente;
