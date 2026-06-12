import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, File, Eye, Pencil, MoreVertical, BookOpen, Plus, Trash2, Loader2, Wallet } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getDokDatum } from "../../../utils/dokumentArchiv";
import GlassSurface from "../../ui/GlassSurface";

const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const KATEGORIE_FARBEN = {
  Rechnung:     { icon: "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/20",     badge: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20",         dot: "bg-blue-400"     },
  Vertrag:      { icon: "bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/20", badge: "bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20", dot: "bg-purple-400"   },
  Handbuch:     { icon: "bg-green-500/20 text-green-400 ring-1 ring-green-500/20",   badge: "bg-green-500/10 text-green-500 dark:text-green-400 border border-green-500/20",     dot: "bg-green-400"    },
  Garantie:     { icon: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/20",   badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20",     dot: "bg-amber-400"    },
  Versicherung: { icon: "bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/20",     badge: "bg-teal-500/10 text-teal-500 dark:text-teal-400 border border-teal-500/20",         dot: "bg-teal-400"     },
  Behörde:      { icon: "bg-red-500/20 text-red-400 ring-1 ring-red-500/20",         badge: "bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20",             dot: "bg-red-400"      },
  Gesundheit:   { icon: "bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/20",     badge: "bg-pink-500/10 text-pink-500 dark:text-pink-400 border border-pink-500/20",         dot: "bg-pink-400"     },
  Medikamente:  { icon: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/20", badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-400" },
  Sonstiges:    { icon: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",   badge: "bg-slate-500/10 text-slate-400 border border-slate-500/20",                         dot: "bg-slate-400"    },
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
  void t;

  const reduced = useReducedMotion();
  const [menuOffen, setMenuOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [menuOeffnetNachOben, setMenuOeffnetNachOben] = useState(false);
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

  const kat = effektiveKategorie(dok);
  const katObj = KATEGORIE_FARBEN[kat] || KATEGORIE_FARBEN.Sonstiges;
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
    untertext = parts.join(" · ") || null;
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

      setMenuOeffnetNachOben(
        platzUnten < menuHeight + gap && platzOben > platzUnten
      );
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOffen]);

  return (
    <GlassSurface
      as="article"
      data-dokument-id={dok.id}
      onClick={() => onVorschau?.(dok)}
      variants={reduced ? {} : listItemVariants}
      className={`relative flex min-w-0 max-w-full items-center gap-3 rounded-card-sm border-l-2 pl-2.5 pr-3 py-2.5 cursor-pointer
        ${isHighlighted
          ? "bg-primary-500/5 ring-1 ring-inset ring-primary-500/30 border-l-primary-500"
          : "border-l-transparent"
        }
        ${menuOffen ? "z-[202]" : ""}`}
    >
      {/* Datei-Icon */}
      <div className={`w-9 h-9 rounded-card-sm flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${katObj.icon}`}>
        <DateiIcon dok={dok} />
      </div>

      {/* Hauptinhalt */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate leading-snug">
          {haupttext}
        </p>
        {untertext && (
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
            {untertext}
          </p>
        )}
      </div>

      {/* Datum */}
      {datum && (
        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap flex-shrink-0 hidden sm:block">
          {formatDatum(datum)}
        </span>
      )}

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {kat && (
          <span className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${katObj.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${katObj.dot}`} aria-hidden="true" />
            {kat}
          </span>
        )}
        {rechnungIstImBudget && (
          <Wallet size={13} className="text-green-500 flex-shrink-0" title="Im Budget" />
        )}
        {rechnungIstWissen && (
          <BookOpen size={13} className="text-amber-500 flex-shrink-0" title="In Wissen" />
        )}
      </div>

      {/* Aktionen — immer sichtbar auf Mobile, bei hover auf Desktop */}
      <div
        className="flex items-center gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Vorschau */}
        <motion.button
          onClick={handleVorschauKlick}
          whileTap={reduced ? {} : { scale: 0.88 }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 hover:text-primary-500 transition-colors"
          title="Vorschau"
        >
          {laedt ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
        </motion.button>

        {/* Bearbeiten */}
        <motion.button
          onClick={() => onBearbeiten?.(dok)}
          whileTap={reduced ? {} : { scale: 0.88 }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
          title="Bearbeiten"
        >
          <Pencil size={13} />
        </motion.button>

        {/* Mehr-Menü */}
        <div className="relative">
          <motion.button
            ref={menuButtonRef}
            onClick={() => setMenuOffen((p) => !p)}
            whileTap={reduced ? {} : { scale: 0.88 }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
            title="Weitere Aktionen"
          >
            <MoreVertical size={13} />
          </motion.button>

          <AnimatePresence>
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
                  className={`absolute right-0 z-[201] w-44 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 py-1 text-sm ${
                    menuOeffnetNachOben ? "bottom-8" : "top-8"
                  }`}
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
          </AnimatePresence>
        </div>
      </div>
    </GlassSurface>
  );
}
