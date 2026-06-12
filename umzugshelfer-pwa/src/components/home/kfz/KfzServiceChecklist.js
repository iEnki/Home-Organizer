import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  Beaker,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  FlaskConical,
  Package,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { createKfzDocumentUrl } from "../../../utils/kfzData";
import { formatKfzDisplayText } from "../../../utils/kfzPresentation";
import GlassSurface from "../../ui/GlassSurface";

export const SERVICE_CATEGORY_ORDER = [
  "arbeit",
  "ersatzteil",
  "fluessigkeit",
  "reifen",
  "pruefung",
  "entsorgung",
  "sonstiges",
];

const CATEGORY_META = {
  arbeit: { icon: Wrench, tone: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  ersatzteil: { icon: Package, tone: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
  fluessigkeit: { icon: FlaskConical, tone: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  reifen: { icon: CircleDollarSign, tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  pruefung: { icon: BadgeCheck, tone: "text-primary-500 bg-primary-500/10 border-primary-500/20" },
  entsorgung: { icon: Beaker, tone: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  sonstiges: { icon: Sparkles, tone: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
};

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function groupServicePositions(positions = []) {
  const grouped = new Map(SERVICE_CATEGORY_ORDER.map((category) => [category, []]));
  positions.forEach((position) => {
    const category = grouped.has(position.kategorie) ? position.kategorie : "sonstiges";
    grouped.get(category).push(position);
  });
  return SERVICE_CATEGORY_ORDER
    .map((category) => ({
      category,
      positions: grouped.get(category),
      total: grouped.get(category).reduce((sum, position) => sum + numeric(position.gesamtpreis), 0),
    }))
    .filter((group) => group.positions.length);
}

export function summarizeServicePositions(positions = []) {
  const groups = groupServicePositions(positions);
  return {
    groups,
    count: positions.length,
    categoryCount: groups.length,
    total: positions.reduce((sum, position) => sum + numeric(position.gesamtpreis), 0),
    discount: positions.reduce((sum, position) => sum + numeric(position.rabatt_betrag), 0),
    freeCount: positions.filter((position) => position.kostenlos || (position.gesamtpreis != null && numeric(position.gesamtpreis) === 0)).length,
    uncertainCount: positions.filter((position) => position.confidence != null && Number(position.confidence) < 0.7).length,
  };
}

const formatQuantity = (position) => {
  if (position.menge == null && !position.einheit) return "";
  const amount = position.menge == null ? "" : new Intl.NumberFormat("de-AT", { maximumFractionDigits: 3 }).format(Number(position.menge));
  return [amount, position.einheit].filter(Boolean).join(" ");
};

function PositionRow({ position, index, money, editable, onChange, onRemove, inputClass }) {
  const { t } = useTranslation("kfz");
  const reducedMotion = useReducedMotion();
  const uncertain = position.confidence != null && Number(position.confidence) < 0.7;
  const isFree = Boolean(position.kostenlos) || (position.gesamtpreis != null && numeric(position.gesamtpreis) === 0);

  if (editable) {
    return (
      <motion.div
        layout
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`grid min-w-0 gap-2 rounded-card-sm border p-3 md:grid-cols-6 ${uncertain ? "border-amber-400/70 bg-amber-500/[0.04]" : "border-light-border/80 bg-white/35 dark:border-white/10 dark:bg-white/[0.025]"}`}
      >
        <input aria-label={t("analysis.fields.description")} className={`${inputClass} md:col-span-2`} value={position.beschreibung} onChange={(event) => onChange(index, "beschreibung", event.target.value)} />
        <select aria-label={t("analysis.fields.category")} className={inputClass} value={position.kategorie} onChange={(event) => onChange(index, "kategorie", event.target.value)}>
          {SERVICE_CATEGORY_ORDER.map((value) => <option key={value} value={value}>{t(`analysis.categories.${value}`)}</option>)}
        </select>
        <input aria-label={t("analysis.fields.quantity")} className={inputClass} type="number" step="0.001" value={position.menge ?? ""} onChange={(event) => onChange(index, "menge", event.target.value === "" ? null : Number(event.target.value))} />
        <input aria-label={t("analysis.fields.total")} className={inputClass} type="number" step="0.01" value={position.gesamtpreis ?? ""} onChange={(event) => onChange(index, "gesamtpreis", event.target.value === "" ? null : Number(event.target.value))} />
        <button type="button" className="flex min-h-11 items-center justify-center rounded-card-sm text-red-500 hover:bg-red-500/10" onClick={() => onRemove(index)} aria-label={t("analysis.removePosition")}><Trash2 size={16} /></button>
        <label className="flex min-h-11 items-center gap-2 text-xs md:col-span-2"><input type="checkbox" checked={Boolean(position.kostenlos)} onChange={(event) => onChange(index, "kostenlos", event.target.checked)} /> {t("analysis.free")}</label>
        <input aria-label={t("analysis.fields.partNumber")} className={`${inputClass} md:col-span-2`} placeholder={t("analysis.fields.partNumber")} value={position.teilenummer || ""} onChange={(event) => onChange(index, "teilenummer", event.target.value)} />
        <input aria-label={t("analysis.fields.discount")} className={`${inputClass} md:col-span-2`} type="number" step="0.01" placeholder={t("analysis.fields.discount")} value={position.rabatt_betrag ?? ""} onChange={(event) => onChange(index, "rabatt_betrag", event.target.value === "" ? null : Number(event.target.value))} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reducedMotion ? 0 : Math.min(index * 0.035, 0.3) }}
      className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-light-border/60 px-3 py-3 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)_auto] dark:border-white/[0.07] ${uncertain ? "bg-amber-500/[0.035]" : ""}`}
    >
      <motion.span
        initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${uncertain ? "bg-amber-500/15 text-amber-500" : "bg-primary-500/12 text-primary-500"}`}
      >
        {uncertain ? <AlertTriangle size={13} /> : <Check size={14} strokeWidth={2.5} />}
      </motion.span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="break-words text-sm font-medium">{formatKfzDisplayText(position.beschreibung)}</strong>
          {isFree ? <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold text-primary-600 dark:text-primary-300">{t("serviceChecklist.free")}</span> : null}
          {numeric(position.rabatt_betrag) > 0 ? <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-500">-{money(position.rabatt_betrag)}</span> : null}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
          {formatQuantity(position) ? <span>{formatQuantity(position)}</span> : null}
          {position.teilenummer ? <span className="break-all">{t("serviceChecklist.partNumber")}: {position.teilenummer}</span> : null}
          {position.ust_satz != null ? <span>{t("serviceChecklist.tax", { value: position.ust_satz })}</span> : null}
          {uncertain ? <span className="text-amber-600 dark:text-amber-300">{t("serviceChecklist.checkValue")}</span> : null}
        </div>
      </div>
      <div className="col-start-2 flex min-w-0 items-baseline justify-between gap-3 md:col-start-3 md:block md:text-right">
        {position.einzelpreis != null && position.menge != null ? <span className="text-[10px] text-light-text-secondary md:block dark:text-dark-text-secondary">{money(position.einzelpreis)} / {position.einheit || t("serviceChecklist.unit")}</span> : <span />}
        <strong className={isFree ? "text-primary-500" : "text-sm"}>{isFree ? money(0) : money(position.gesamtpreis)}</strong>
      </div>
    </motion.div>
  );
}

export function ServicePositionChecklist({
  positions,
  money,
  editable = false,
  onChange,
  onRemove,
  inputClass = "",
  defaultExpanded = true,
}) {
  const { t } = useTranslation("kfz");
  const reducedMotion = useReducedMotion();
  const groups = useMemo(() => groupServicePositions(positions), [positions]);
  const [openGroups, setOpenGroups] = useState(() => new Set(defaultExpanded ? groups.map((group) => group.category) : []));
  useEffect(() => {
    const available = new Set(groups.map((group) => group.category));
    setOpenGroups((current) => {
      const next = new Set([...current].filter((category) => available.has(category)));
      if (defaultExpanded) available.forEach((category) => next.add(category));
      return next;
    });
  }, [defaultExpanded, groups]);

  if (editable) {
    return <div className="space-y-3">{positions.map((position, index) => <PositionRow key={`${position.sortierung}-${index}`} position={position} index={index} money={money} editable onChange={onChange} onRemove={onRemove} inputClass={inputClass} />)}</div>;
  }

  return (
    <div className="overflow-hidden rounded-card-sm border border-light-border/80 bg-white/30 dark:border-white/10 dark:bg-black/10">
      {groups.map((group) => {
        const meta = CATEGORY_META[group.category] || CATEGORY_META.sonstiges;
        const Icon = meta.icon;
        const open = openGroups.has(group.category);
        return (
          <section key={group.category} className="border-b border-light-border/70 last:border-b-0 dark:border-white/[0.08]">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenGroups((current) => {
                const next = new Set(current);
                if (next.has(group.category)) next.delete(group.category);
                else next.add(group.category);
                return next;
              })}
              className="flex min-h-12 w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition hover:bg-primary-500/[0.04]"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${meta.tone}`}><Icon size={15} /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">{t(`analysis.categories.${group.category}`)}</strong>
                <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">{t("serviceChecklist.positionCount", { count: group.positions.length })}</span>
              </span>
              <strong className="shrink-0 text-sm">{money(group.total)}</strong>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.24 }}
                  className="overflow-hidden"
                >
                  {group.positions.map((position, index) => <PositionRow key={position.id || `${group.category}-${index}`} position={position} index={index} money={money} />)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

export function KfzServiceCard({
  service,
  positions,
  vehicleLabel,
  formatDate,
  money,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  document,
}) {
  const { t } = useTranslation("kfz");
  const reducedMotion = useReducedMotion();
  const summary = useMemo(() => summarizeServicePositions(positions), [positions]);
  const meta = service.analyse_meta || {};
  const openDocument = async () => {
    if (!document) return;
    const url = await createKfzDocumentUrl(document);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <GlassSurface
      as="article"
      layout
      className="min-w-0 overflow-hidden"
    >
      <div className="relative p-4 md:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
          <button type="button" onClick={onToggle} className="min-w-0 text-left">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="break-words text-base font-semibold md:text-lg">{formatKfzDisplayText(service.typ)}</h3>
              {meta.source === "ki_serviceanalyse" ? <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold text-primary-600 dark:text-primary-300"><Sparkles size={11} /> {t("analysis.aiBadge")}</span> : null}
            </div>
            <p className="mt-1 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {[service.werkstatt, vehicleLabel, formatDate(service.datum)].filter(Boolean).join(" · ")}
            </p>
          </button>
          <div className="flex items-start gap-1">
            <button type="button" onClick={onEdit} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-primary-500/10" aria-label={t("serviceChecklist.edit")}><Wrench size={15} /></button>
            <button type="button" onClick={onDelete} className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10" aria-label={t("serviceChecklist.delete")}><Trash2 size={15} /></button>
          </div>
        </div>

        {service.beschreibung ? <p className="mt-3 break-words text-sm leading-6">{formatKfzDisplayText(service.beschreibung)}</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            [t("serviceChecklist.positions"), summary.count],
            [t("serviceChecklist.categories"), summary.categoryCount],
            [t("serviceChecklist.discounts"), summary.discount ? `-${money(summary.discount)}` : "–"],
            [t("serviceChecklist.total"), money(service.kosten ?? summary.total)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-card-sm border border-light-border/70 bg-light-surface-2/65 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.035]">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-light-text-secondary dark:text-dark-text-secondary">{label}</span>
              <strong className="mt-1 block break-words text-sm">{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.28 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-light-border/70 px-4 py-4 md:px-5 dark:border-white/[0.08]">
              {positions.length ? <ServicePositionChecklist positions={positions} money={money} /> : <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("serviceChecklist.noPositions")}</p>}
              {meta.warranty_notes?.length ? <div className="flex items-start gap-3 rounded-card-sm border border-primary-500/20 bg-primary-500/[0.05] p-3 text-sm"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary-500" /><div><strong>{t("analysis.warranty")}</strong>{meta.warranty_notes.map((note) => <p key={note} className="mt-1 break-words">{note}</p>)}</div></div> : null}
              {meta.safety_notes?.length ? <div className="flex items-start gap-3 rounded-card-sm border border-amber-500/25 bg-amber-500/[0.07] p-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><div><strong>{t("analysis.safety")}</strong>{meta.safety_notes.map((note) => <p key={note} className="mt-1 break-words">{note}</p>)}</div></div> : null}
              <div className="grid min-w-0 gap-2 text-xs text-light-text-secondary sm:grid-cols-2 lg:grid-cols-4 dark:text-dark-text-secondary">
                {service.kilometerstand ? <span>{Number(service.kilometerstand).toLocaleString("de-AT")} km</span> : null}
                {service.rechnungsnummer ? <span className="break-all">{t("serviceChecklist.invoice")}: {service.rechnungsnummer}</span> : null}
                {service.naechste_faelligkeit_datum ? <span>{t("serviceChecklist.nextService")}: {formatDate(service.naechste_faelligkeit_datum)}</span> : null}
                {service.naechste_faelligkeit_km ? <span>{Number(service.naechste_faelligkeit_km).toLocaleString("de-AT")} km</span> : null}
              </div>
              {document ? <button type="button" onClick={openDocument} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-card-sm border border-light-border px-3 text-sm font-semibold transition hover:bg-primary-500/10 sm:w-auto dark:border-white/10"><FileText size={15} /> {t("serviceChecklist.openDocument")}</button> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button type="button" onClick={onToggle} className="flex min-h-10 w-full items-center justify-center gap-2 border-t border-light-border/70 text-xs font-semibold text-light-text-secondary transition hover:bg-primary-500/[0.04] dark:border-white/[0.08] dark:text-dark-text-secondary">
        {expanded ? t("serviceChecklist.collapse") : t("serviceChecklist.expand")} <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
      </button>
    </GlassSurface>
  );
}
