import { createPortal } from "react-dom";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, File, Eye, Pencil, MoreVertical, BookOpen, Plus, Trash2, Loader2, Wallet } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getDokDatum } from "../../../utils/dokumentArchiv";
import GlassSurface from "../../ui/GlassSurface";

const listItemVariants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
};

const istRechnungKategorie = (dok) => {
  const typ = (dok?.dokument_typ || "").trim().toLowerCase();
  return typ === "rechnung" || (dok?.kategorie || "").trim() === "Rechnung";
};

const effektiveKategorie = (dok) => {
  if (dok?.kategorie) return dok.kategorie;
  if ((dok?.dokument_typ || "").trim().toLowerCase() === "rechnung") return "Rechnung";
  const match = dok?.beschreibung?.match(/\[([^\]]+)\]$/);
  return match ? match[1] : null;
};

const istBildDatei = (dok) =>
  (dok?.datei_typ || "").startsWith("image/") ||
  /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(dok?.dateiname || "");

const istPdfDatei = (dok) =>
  (dok?.datei_typ || "").includes("pdf") || /\.pdf$/i.test(dok?.dateiname || "");

function DateiIcon({ dok }) {
  if (istBildDatei(dok)) return <File size={18} className="text-blue-500" />;
  if (istPdfDatei(dok)) return <FileText size={18} className="text-red-500" />;
  return <FileText size={18} className="text-light-text-secondary dark:text-dark-text-secondary" />;
}

function formatDatum(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatBetrag(brutto) {
  const n = Number(brutto);
  if (!isFinite(n)) return null;
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export default function DokumentZeile({
  dok,
  vorschauUrl,
  onLoadVorschau,
  onVorschau,
  onBearbeiten,
  onLoeschen,
  onWissen,
  onBudget,
  isHighlighted,
}) {
  const { t } = useTranslation(["documents","common"]);
  const label = key => t(`documents:archiveLayout.${key}`);

  const reduced = useReducedMotion();
  const [menuOffen, setMenuOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [menuPosition, setMenuPosition] = useState({});
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

  const kat = effektiveKategorie(dok);
  const istRechnung = istRechnungKategorie(dok);
  const rechnungIstImBudget = istRechnung && dok.im_budget;
  const rechnungIstWissen = istRechnung && dok.hat_wissen;
  const datum = getDokDatum(dok);

  // Haupttext: Lieferant bei Rechnungen, sonst Dateiname
  const haupttext = (istRechnung && dok.rechnung_info?.lieferant_name)
    ? dok.rechnung_info.lieferant_name
    : dok.dateiname;

  // Untertext: bei Rechnungen Datum + Betrag, sonst Beschreibung
  const beschreibungOhneHinweis = dok.beschreibung?.replace(/\s*\[[^\]]+\]$/, "") || "";
  let untertext = null;
  if (istRechnung && dok.rechnung_info) {
    const parts = [];
    if (dok.rechnung_info.rechnungsdatum) parts.push(formatDatum(dok.rechnung_info.rechnungsdatum));
    const betrag = formatBetrag(dok.rechnung_info.brutto);
    if (betrag) parts.push(betrag);
    untertext = parts.length ? parts : null;
  } else if (beschreibungOhneHinweis) {
    untertext = beschreibungOhneHinweis;
  }

  const handleVorschauKlick = async (e) => {
    e.stopPropagation();
    if (!vorschauUrl) {
      setLaedt(true);
      try {
        await onLoadVorschau?.();
      } finally {
        setLaedt(false);
      }
    }
    onVorschau?.(dok);
  };

  useLayoutEffect(() => {
    if (!menuOffen) return undefined;

    const updateMenuPosition = () => {
      const triggerRect = menuButtonRef.current?.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 148;
      if (!triggerRect) return;

      const topInset = 16;
      const bottomInset = window.innerWidth < 640 ? 88 : 16;
      const gap = 8;
      const platzOben = triggerRect.top - topInset;
      const platzUnten = window.innerHeight - triggerRect.bottom - bottomInset;

      const above = platzUnten < menuHeight + gap && platzOben > platzUnten;
      setMenuPosition({ top: above ? Math.max(topInset, triggerRect.top - menuHeight - gap) : triggerRect.bottom + gap, left: Math.max(8, Math.min(triggerRect.right - 176, window.innerWidth - 184)) });
    };

    const closeOnEscape = event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenuOffen(false); menuButtonRef.current?.focus(); } };
    updateMenuPosition();
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOffen]);

  return (
    <GlassSurface
      as="article"
      data-dokument-id={dok.id}
      onClick={() => onVorschau?.(dok)}
      interactive={false}
      variants={reduced ? {} : listItemVariants}
      className={`document-row relative min-w-0 max-w-full cursor-pointer
        ${isHighlighted
          ? "bg-primary-500/5 ring-1 ring-inset ring-primary-500/30 border-l-primary-500"
          : "border-l-transparent"
        }
        ${menuOffen ? "z-[202]" : ""}`}
    >
      <div className="document-file-icon"><DateiIcon dok={dok} /></div>
      <div className="document-row-title">
        <button type="button" className="document-title-button" title={haupttext} onClick={e => { e.stopPropagation(); onVorschau?.(dok); }}>{haupttext}</button>
        {haupttext !== dok.dateiname && <p className="document-row-filename" title={dok.dateiname}>{dok.dateiname}</p>}
        {untertext && <p className="document-row-description">{Array.isArray(untertext) ? untertext.map((part, index) => <span key={index}>{part}</span>) : untertext}</p>}
      </div>
      <div className="document-row-meta">
      <span className="document-row-date">{datum ? formatDatum(datum) : ""}</span>
      <div className="document-row-category">{kat && <span>{t(`documents:categories.${kat}`, { defaultValue: kat })}</span>}</div>
      <div className="document-row-status">
        {rechnungIstImBudget && <span><Wallet size={14} aria-hidden="true" />{label("inBudget")}</span>}
        {rechnungIstWissen && <span><BookOpen size={14} aria-hidden="true" />{label("asKnowledge")}</span>}
      </div>

      </div>

      {/* Aktionen — immer sichtbar auf Mobile, bei hover auf Desktop */}
      <div
        className="document-row-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Vorschau */}
        <motion.button
          onClick={handleVorschauKlick}
          whileTap={reduced ? {} : { scale: .97 }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 hover:text-primary-500 transition-colors"
          title={t("documents:preview")} aria-label={t("documents:preview")}
        >
          {laedt ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
        </motion.button>

        {/* Bearbeiten */}
        <motion.button
          onClick={() => onBearbeiten?.(dok)}
          whileTap={reduced ? {} : { scale: .97 }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
          title={label("edit")} aria-label={label("edit")}
        >
          <Pencil size={13} />
        </motion.button>

        {/* Mehr-Menü */}
        <div className="relative">
          <motion.button
            ref={menuButtonRef}
            onClick={() => setMenuOffen((p) => !p)}
            whileTap={reduced ? {} : { scale: .97 }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
            title={label("moreActions")} aria-label={label("moreActions")} aria-expanded={menuOffen}
          >
            <MoreVertical size={13} />
          </motion.button>

          {createPortal(<AnimatePresence>
            {menuOffen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-[200]" onClick={() => setMenuOffen(false)} />
                <motion.div
                  ref={menuRef}
                  key="context-menu"
                  initial={reduced ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? {} : { opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="fixed z-[201] w-44 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 py-1 text-sm"
                  style={menuPosition}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(!istRechnung || !dok.hat_wissen) && (
                    <button
                      onClick={() => { setMenuOffen(false); onWissen?.(dok); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-amber-600 dark:text-amber-400"
                    >
                      <BookOpen size={13} /> Als Wissen
                    </button>
                  )}
                  {rechnungIstWissen && (
                    <div className="flex items-center gap-2 px-3 py-2 text-amber-600 dark:text-amber-400 opacity-60 cursor-default text-xs">
                      <BookOpen size={13} /> In Wissen
                    </div>
                  )}
                  {istRechnung && !dok.im_budget && (
                    <button
                      onClick={() => { setMenuOffen(false); onBudget?.(dok); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-primary-500"
                    >
                      <Plus size={13} /> Zum Budget
                    </button>
                  )}
                  {rechnungIstImBudget && (
                    <div className="flex items-center gap-2 px-3 py-2 text-green-600 dark:text-green-400 opacity-60 cursor-default text-xs">
                      <Wallet size={13} /> Im Budget
                    </div>
                  )}
                  <div className="border-t border-light-border dark:border-dark-border my-1" />
                  <button
                    onClick={() => { setMenuOffen(false); onLoeschen?.(dok.id, dok.storage_pfad, dok.dateiname); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-500"
                  >
                    <Trash2 size={13} /> Löschen
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>, document.body)}
        </div>
      </div>
    </GlassSurface>
  );
}
