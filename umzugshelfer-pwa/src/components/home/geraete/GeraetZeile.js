import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Wrench, ChevronDown, FileText, MoreVertical,
  Link2, Unlink, CheckCircle, Pencil, Trash2, Eye, ExternalLink,
  Zap, Thermometer, Droplets, Hammer, Tv, UtensilsCrossed, Box, Clock, MapPin, Package,
} from "lucide-react";
import {
  STATUS_CONFIG,
  primaereFrist,
  tageDifferenz,
  formatDatum,
} from "../../../utils/geraetStatus";
import { getBewohnerDisplayName } from "../../../utils/budgetAccounts";
import { getDeviceCategoryLabel } from "./GeraetForm";
import GlassSurface, { glassCollapseVariants } from "../../ui/GlassSurface";

const STATUS_FARBE_KLASSEN = {
  red:   "bg-red-500/10 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  gray:  "bg-gray-500/10 text-gray-500 dark:text-gray-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
};

const GERAET_KAT_ICON = {
  "Haushaltsgeraete": Wrench,
  "Elektronik":       Zap,
  "Heizung & Klima":  Thermometer,
  "Sanitaer":         Droplets,
  "Werkzeug":         Hammer,
  "Unterhaltung":     Tv,
  "Kueche":           UtensilsCrossed,
  "Sonstiges":        Box,
};

const STATUS_ACCENT_GRAD = {
  wartung_faellig:      "from-red-500 to-red-400",
  gewaehrleistung_bald: "from-amber-500 to-yellow-400",
  garantie_bald:        "from-amber-400 to-yellow-300",
  kein_beleg:           "from-slate-400 to-gray-400",
  ok:                   "from-green-500 to-teal-400",
};

const STATUS_RING = {
  wartung_faellig:      "ring-1 ring-red-500/40",
  gewaehrleistung_bald: "ring-1 ring-amber-500/30",
  garantie_bald:        "ring-1 ring-amber-400/30",
  kein_beleg:           "",
  ok:                   "",
};

const INVENTAR_STATUS_CONFIG = {
  in_verwendung: { label: "In Verwendung", klasse: "border-primary-500/30 bg-primary-500/15 text-primary-500" },
  eingelagert: { label: "Eingelagert", klasse: "border-blue-500/30 bg-blue-500/15 text-blue-500" },
  verliehen: { label: "Verliehen", klasse: "border-amber-500/30 bg-amber-500/15 text-amber-500" },
  defekt: { label: "Defekt", klasse: "border-red-500/30 bg-red-500/15 text-red-500" },
  entsorgt: { label: "Entsorgt", klasse: "border-gray-500/30 bg-gray-500/15 text-gray-500" },
};

const MENU_WIDTH = 176;
const MENU_GAP = 6;

function InventarStatusBadge({ status }) {
  const { t } = useTranslation(["home"]);
  const cfg = INVENTAR_STATUS_CONFIG[status || "in_verwendung"];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium flex-shrink-0 ${cfg.klasse}`}>
      {t(`home:inventoryForm.status.${status || "in_verwendung"}`, { defaultValue: cfg.label })}
    </span>
  );
}

function BewohnerBadge({ bewohner }) {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
      style={{ backgroundColor: `${bewohner.farbe || "#10B981"}22`, color: bewohner.farbe || "#10B981" }}
    >
      <span>{bewohner.emoji}</span>
      <span>{getBewohnerDisplayName(bewohner)}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation(["home"]);
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${STATUS_FARBE_KLASSEN[cfg.farbe]}`}>
      {t(`home:devicesStatus.${status}`, { defaultValue: cfg.label })}
    </span>
  );
}

function DetailZeile({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[10px] uppercase tracking-wide text-dark-text-secondary shrink-0">{label}</span>
      <span className="text-xs font-medium text-light-text-main dark:text-dark-text-main text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function FristZeile({ label, datum, heute }) {
  if (!datum) return null;
  const tage = tageDifferenz(datum, heute);
  const abgelaufen = tage < 0;
  const baldFaellig = tage >= 0 && tage <= 60;
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[3px] ${abgelaufen ? "opacity-50" : ""}`}>
      <span className="text-[10px] uppercase tracking-wide text-dark-text-secondary shrink-0 max-w-[55%] truncate">{label}</span>
      <span className={`text-xs font-medium text-right shrink-0 ${baldFaellig ? "text-amber-400" : "text-light-text-main dark:text-dark-text-main"}`}>
        {formatDatum(datum)}
        {!abgelaufen && tage !== Infinity && (
          <span className="text-[10px] opacity-60 ml-1">({tage}d)</span>
        )}
      </span>
    </div>
  );
}

export default function GeraetZeile({
  g,
  status,
  heute,
  geraetWartungen = [],
  verknuepfteDokumente = [],
  isOffen,
  onToggle,
  onBearbeiten,
  onLoeschen,
  onWartungErledigt,
  onDokuModalOpen,
  onDokumentUnlink,
  onVorschau,
  onNavigate,
  isHighlighted,
  orte = [],
  lagerorte = [],
  bewohner = [],
}) {
  const { t, i18n } = useTranslation(["home", "common"]);
  const reducedMotion = useReducedMotion();
  const [menuOffen, setMenuOffen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuButtonRef = useRef(null);

  const frist = primaereFrist(g);
  const dokAnzahl = verknuepfteDokumente.length;
  const ort = orte.find((entry) => entry.id === g.ort_id);
  const lagerort = lagerorte.find((entry) => entry.id === g.lagerort_id);
  const bewohnerEintrag = bewohner.find((entry) => entry.id === g.bewohner_id);
  const tags = Array.isArray(g.tags) ? g.tags.filter(Boolean) : [];
  const standortLabel = lagerort
    ? `${ort?.name || t("home:devicesForm.location", { defaultValue: "Standort" })} · ${lagerort.name}`
    : ort?.name || "";

  useEffect(() => {
    if (!menuOffen) return undefined;

    const updatePosition = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const estimatedHeight = status === "wartung_faellig" ? 144 : 104;
      const left = Math.min(Math.max(rect.right - MENU_WIDTH, 8), viewportWidth - MENU_WIDTH - 8);
      const preferredTop = rect.bottom + MENU_GAP;
      const top = preferredTop + estimatedHeight > viewportHeight - 8
        ? Math.max(rect.top - estimatedHeight - MENU_GAP, 8)
        : preferredTop;
      setMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOffen, status]);

  const KatIcon = GERAET_KAT_ICON[g.kategorie] || Wrench;
  const statusCfg = STATUS_CONFIG[status] || {};

  return (
    <GlassSurface
      as="article"
      data-geraet-id={g.id}
      className={`flex min-w-0 max-w-full flex-col overflow-hidden rounded-card-sm
        ${STATUS_RING[status] || ""}
        ${menuOffen ? "z-[210]" : ""}
        ${isHighlighted ? "ring-1 ring-inset ring-primary-500/30" : ""}`}
    >
      {/* Gradient Top-Border (2px, Status-Farbe) */}
      <div className={`h-[2px] w-full bg-gradient-to-r ${STATUS_ACCENT_GRAD[status] || "from-slate-400 to-gray-400"}`} />

      {/* Kollabierte Card */}
      <div
        onClick={onToggle}
        className="flex min-w-0 items-start gap-3 px-3 py-3 cursor-pointer group"
      >
        {/* Kategorie-Icon mit Status-Farbe */}
        <div className={`w-9 h-9 rounded-card-sm flex items-center justify-center flex-shrink-0 ${STATUS_FARBE_KLASSEN[statusCfg.farbe] || "bg-canvas-3 text-dark-text-secondary"}`}>
          <KatIcon size={16} />
        </div>

        {/* Hauptinhalt */}
        <div className="flex-1 min-w-0">
          {/* Zeile 1: Name + Hersteller */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate leading-snug">
                {g.name}
              </p>
              {(g.hersteller || g.modell) && (
                <p className="text-xs text-dark-text-secondary truncate">
                  {[g.hersteller, g.modell].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={status} />
            </div>
          </div>

          {/* Zeile 2: Primäre Frist */}
          {frist && (
            <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
              status === "wartung_faellig" ? "text-red-400" :
              (status === "gewaehrleistung_bald" || status === "garantie_bald") ? "text-amber-400" :
              "text-dark-text-secondary"
            }`}>
              <Clock size={11} className="shrink-0" />
              <span>{frist.label}: {formatDatum(frist.datum)}</span>
              {(() => {
                const tage = tageDifferenz(frist.datum, heute);
                if (tage === null) return null;
                return (
                  <span className="text-[10px] opacity-75 ml-1">
                    {tage >= 0 ? `(in ${tage}d)` : `(${Math.abs(tage)}d überfällig)`}
                  </span>
                );
              })()}
            </div>
          )}

          {/* Zeile 3: Chips */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <InventarStatusBadge status={g.status} />
            {standortLabel && (
              <span className="flex items-center gap-0.5 text-[11px] text-dark-text-secondary">
                <MapPin size={9} />{standortLabel}
              </span>
            )}
            <BewohnerBadge bewohner={bewohnerEintrag} />
            {dokAnzahl > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-blue-400">
                <FileText size={9} />{dokAnzahl}
              </span>
            )}
            {g.menge > 1 && (
              <span className="text-[11px] text-dark-text-secondary">×{g.menge}</span>
            )}
          </div>

          {/* Quick-Action bei wartung_faellig */}
          {status === "wartung_faellig" && (
            <button
              onClick={(e) => { e.stopPropagation(); onWartungErledigt(); }}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-pill bg-primary-500/15 text-primary-500 hover:bg-primary-500/25 transition-colors duration-150 cursor-pointer font-medium"
            >
              <CheckCircle size={11} /> Wartung erledigen
            </button>
          )}
        </div>

        {/* Rechts: Menü + Chevron */}
        <div
          className="flex flex-col items-center gap-1 shrink-0 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 3-Punkte-Menü */}
          <div className="relative z-[211]">
            <button
              ref={menuButtonRef}
              onClick={() => setMenuOffen((p) => !p)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-2 transition-colors"
              title={t("common:moreActions", { defaultValue: "More actions" })}
            >
              <MoreVertical size={13} />
            </button>
          </div>
          <div onClick={onToggle} className="cursor-pointer">
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 text-light-text-secondary dark:text-dark-text-secondary ${isOffen ? "" : "-rotate-90"}`}
            />
          </div>
        </div>
      </div>

      {menuOffen && menuPosition && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setMenuOffen(false)} />
          <div
            className="fixed z-[1001] w-44 overflow-hidden bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 py-1 text-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setMenuOffen(false); onBearbeiten(); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
            >
              <Pencil size={13} /> {t("common:actions.edit")}
            </button>
            {status === "wartung_faellig" && (
              <button
                onClick={() => { setMenuOffen(false); onWartungErledigt(); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-light-hover dark:hover:bg-canvas-3 text-primary-500"
              >
                <CheckCircle size={13} /> {t("home:devicesForm.markMaintenanceDone", { defaultValue: "Mark maintenance done" })}
              </button>
            )}
            <div className="border-t border-light-border dark:border-dark-border my-1" />
            <button
              onClick={() => { setMenuOffen(false); onLoeschen(); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-500"
            >
              <Trash2 size={13} /> {t("common:actions.delete")}
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Aufgeklapptes Panel */}
      <AnimatePresence initial={false}>
      {isOffen && (
        <motion.div
          key="details"
          variants={reducedMotion ? {} : glassCollapseVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          className="overflow-hidden border-t border-light-border dark:border-dark-border"
        >
        <div className="px-4 pb-4 pt-3">

          {/* Sektion 1: Details */}
          <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dark-text-secondary mb-1">
            <Package size={10} /> {t("home:devicesForm.details", { defaultValue: "Details" })}
          </h4>
          <div className="divide-y divide-light-border/60 dark:divide-dark-border/40 mb-2">
            <DetailZeile
              label="Status"
              value={t(`home:inventoryForm.status.${g.status || "in_verwendung"}`, { defaultValue: INVENTAR_STATUS_CONFIG[g.status || "in_verwendung"]?.label || g.status })}
            />
            <DetailZeile label={t("home:devicesForm.purchaseDate")} value={g.kaufdatum ? formatDatum(g.kaufdatum) : null} />
            <DetailZeile
              label={t("home:devicesForm.purchasePrice")}
              value={g.kaufpreis != null && g.kaufpreis !== "" ? `${Number(g.kaufpreis).toLocaleString(i18n.language || "de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : null}
            />
            <DetailZeile label={t("home:devicesForm.category")} value={g.kategorie ? getDeviceCategoryLabel(g.kategorie, i18n.language) : null} />
            <DetailZeile label={t("home:devicesForm.serialNumber")} value={g.seriennummer || null} />
            <DetailZeile label={t("home:devicesForm.location", { defaultValue: "Standort" })} value={standortLabel || null} />
            <DetailZeile label="Menge" value={g.menge > 1 ? String(g.menge) : null} />
            <DetailZeile label="Bewohner" value={bewohnerEintrag ? getBewohnerDisplayName(bewohnerEintrag) : null} />
          </div>
          {g.notizen && (
            <p className="text-xs text-dark-text-secondary italic mb-2">{g.notizen}</p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-secondary-500/10 text-secondary-500">{tag}</span>
              ))}
            </div>
          )}

          {/* Sektion 2: Fristen */}
          {(g.gewaehrleistung_bis || g.garantie_bis || g.naechste_wartung || g.wartungsintervall_monate) && (
            <div className="border-t border-light-border dark:border-dark-border pt-2 mb-2">
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dark-text-secondary mb-1">
                <Clock size={10} /> {t("home:devicesForm.deadlines", { defaultValue: "Fristen" })}
              </h4>
              <div className="divide-y divide-light-border/60 dark:divide-dark-border/40">
                <FristZeile label={t("home:devicesForm.warrantyUntil")} datum={g.gewaehrleistung_bis} heute={heute} />
                <FristZeile label={t("home:devicesForm.manufacturerWarrantyUntil")} datum={g.garantie_bis} heute={heute} />
                <FristZeile label={t("home:devicesForm.nextMaintenance")} datum={g.naechste_wartung} heute={heute} />
                {g.wartungsintervall_monate && (
                  <div className="flex items-baseline justify-between gap-3 py-[3px]">
                    <span className="text-[10px] uppercase tracking-wide text-dark-text-secondary shrink-0">
                      {t("home:devicesForm.intervalMonths")}
                    </span>
                    <span className="text-xs font-medium text-right text-light-text-main dark:text-dark-text-main">
                      {t("home:devicesForm.everyMonths", { count: g.wartungsintervall_monate, defaultValue: `alle ${g.wartungsintervall_monate} Monate` })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sektion 3: Belege & Wartungslog */}
          <div className="border-t border-light-border dark:border-dark-border pt-2 mb-3">
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dark-text-secondary mb-1">
              <FileText size={10} /> {t("home:devicesForm.documents", { defaultValue: "Belege & Wartung" })}
            </h4>
            {verknuepfteDokumente.length > 0 && (
              <div className="space-y-1 mb-2">
                {verknuepfteDokumente.map((d) => (
                  <div key={d.id} className="flex items-center gap-1 text-xs group">
                    <FileText size={11} className="text-blue-500 flex-shrink-0" />
                    <span className="flex-1 truncate text-light-text-main dark:text-dark-text-main">{d.dateiname}</span>
                    {d.storage_pfad && (
                      <button onClick={() => onVorschau?.(d)} className="p-0.5 text-dark-text-secondary hover:text-primary-500 transition-colors" title={t("common:preview", { defaultValue: "Preview" })}>
                        <Eye size={11} />
                      </button>
                    )}
                    <button onClick={() => onNavigate?.(d.id)} className="p-0.5 text-dark-text-secondary hover:text-blue-500 transition-colors" title={t("home:devicesForm.openInArchive", { defaultValue: "Open in archive" })}>
                      <ExternalLink size={11} />
                    </button>
                    <button onClick={() => onDokumentUnlink(d.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-dark-text-secondary hover:text-red-500 transition-opacity" title={t("home:devicesForm.unlinkDocument", { defaultValue: "Unlink" })}>
                      <Unlink size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onDokuModalOpen} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors mb-2">
              <Link2 size={11} /> {t("home:devicesForm.linkDocument", { defaultValue: "Link document" })}
            </button>
            {geraetWartungen.length > 0 ? (
              <div className="relative pl-4">
                <div className="absolute left-1.5 top-0 bottom-0 w-px bg-light-border dark:bg-dark-border" />
                {geraetWartungen.slice(0, 3).map((w) => (
                  <div key={w.id} className="relative mb-2">
                    <div className="absolute -left-[11px] top-1 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-light-card dark:ring-canvas-2" />
                    <div className="text-[11px] text-dark-text-secondary">{formatDatum(w.datum)}</div>
                    <div className="text-xs text-light-text-main dark:text-dark-text-main">{w.beschreibung || w.typ}</div>
                  </div>
                ))}
                {geraetWartungen.length > 3 && (
                  <div className="text-[11px] text-dark-text-secondary">+{geraetWartungen.length - 3} weitere</div>
                )}
              </div>
            ) : (
              <p className="text-xs text-dark-text-secondary">{t("home:devicesForm.noMaintenance", { defaultValue: "Noch keine Wartungseinträge." })}</p>
            )}
          </div>

          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 pt-3 border-t border-light-border dark:border-dark-border">
            <button
              onClick={onBearbeiten}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main transition-colors"
            >
              <Pencil size={11} /> {t("common:actions.edit")}
            </button>
            {status === "wartung_faellig" && (
              <button
                onClick={onWartungErledigt}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm bg-primary-500 hover:bg-primary-600 text-white transition-colors"
              >
                <CheckCircle size={11} /> {t("home:devicesForm.markMaintenanceDone", { defaultValue: "Wartung erledigt" })}
              </button>
            )}
            <button
              onClick={onLoeschen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-red-500/30 hover:bg-red-500/10 text-red-500 transition-colors ml-auto"
            >
              <Trash2 size={11} /> {t("common:actions.delete")}
            </button>
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </GlassSurface>
  );
}
