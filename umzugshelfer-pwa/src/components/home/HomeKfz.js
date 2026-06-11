import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Car,
  ChevronDown,
  Download,
  FileText,
  Fuel,
  Gauge,
  Image,
  ListTodo,
  Loader2,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  Wrench,
} from "lucide-react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { buildKfzCsv, buildKfzStats, normalizeTankStatus } from "../../utils/kfzStats";
import { formatKfzDisplayText } from "../../utils/kfzPresentation";
import {
  createKfzDocumentUrl,
  removeKfzDocument,
  saveKfzExpenseWithBudget,
  uploadKfzDocument,
} from "../../utils/kfzData";
import {
  ignoreFuelImport,
  reactivateFuelImport,
  resolveFuelImport,
  syncFuelImports,
} from "../../utils/kfzFuelImports";
import ModalShell from "../ui/ModalShell";
import BottomSheet from "../ui/BottomSheet";
import useViewport from "../../hooks/useViewport";
import useKfzData from "../../hooks/useKfzData";
import LocalizedDateField from "./kfz/LocalizedDateField";
import KfzReportPDF from "./kfz/KfzReportPDF";
import KfzServiceAnalysisModal from "./kfz/KfzServiceAnalysisModal";
import { KfzServiceCard } from "./kfz/KfzServiceChecklist";
import {
  deleteVehiclePhoto,
  getVehicleCoverPhoto,
  getVehiclePhotos,
  setVehicleCoverPhoto,
  uploadVehiclePhoto,
} from "../../utils/kfzPhotos";
import {
  glassPanelClass,
  KfzAlert,
  KfzAnalytics,
  KfzOverview,
  pageVariants,
  VehiclePhotoGallery,
  VehicleSwitcher,
} from "./kfz/KfzVisuals";

const today = () => new Date().toISOString().slice(0, 10);
const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const intOrNull = (value) => {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
};
const money = (value) => new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const formatDate = (value) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("de-AT")
  : "-";
const vehicleLabel = (vehicle) => [vehicle?.name, vehicle?.kennzeichen].filter(Boolean).join(" - ") || "Fahrzeug";
const expenseCategoryLabel = formatKfzDisplayText;
const serviceTypeLabel = formatKfzDisplayText;
const fuelStatusLabel = (row, t) => {
  const normalized = normalizeTankStatus(row);
  if (normalized.status === "voll") {
    return normalized.source === "legacy" ? t("fuelStatus.legacyFull") : t("fuelStatus.full");
  }
  if (normalized.status === "teilweise") return t("fuelStatus.partial");
  return t("fuelStatus.unknown");
};
const daysUntil = (value) => {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
};

const TABS = [
  ["overview", "overview", Car],
  ["costs", "costs", WalletCards],
  ["fuel", "fuel", Fuel],
  ["service", "service", Wrench],
  ["tires", "tires", Gauge],
  ["documents", "documents", FileText],
  ["tasks", "tasks", ListTodo],
  ["analytics", "analytics", BarChart3],
];

const TABLE_BY_TYPE = {
  vehicle: "home_fahrzeuge",
  expense: "home_fahrzeug_ausgaben",
  fuel: "home_fahrzeug_tankvorgaenge",
  service: "home_fahrzeug_services",
  tire: "home_fahrzeug_reifen",
  task: "home_fahrzeug_aufgaben",
  part: "home_fahrzeug_teile",
};

const EMPTY = {
  vehicle: {
    name: "", marke: "", modell: "", baujahr: "", kennzeichen: "", vin: "",
    kilometerstand: "", kraftstoffart: "Benzin", versicherung: "", polizzennummer: "",
    pickerl_termin: "", status: "aktiv", notizen: "",
  },
  expense: {
    fahrzeug_id: "", datum: today(), kategorie: "Versicherung", beschreibung: "",
    betrag: "", dokument_id: "", notizen: "", mirrorToBudget: false,
  },
  fuel: {
    fahrzeug_id: "", datum: today(), betrag: "", tankstelle: "", liter: "",
    kilometerstand: "", preis_pro_liter: "", kraftstoffart: "", tankstatus: "",
    tankstatus_quelle: "manuell", vollgetankt: false,
    quelle: "manuell", dokument_id: "", budget_posten_id: null, rechnung_id: null, notizen: "",
  },
  service: {
    fahrzeug_id: "", typ: "Service", datum: today(), kilometerstand: "", kosten: "",
    werkstatt: "", beschreibung: "", naechste_faelligkeit_datum: "",
    naechste_faelligkeit_km: "", dokument_id: "", notizen: "",
  },
  tire: {
    fahrzeug_id: "", saison: "Sommerreifen", marke: "", groesse: "", profiltiefe: "",
    kaufdatum: "", kaufpreis: "", herstellungsjahr: "", dot_nummer: "", laufleistung_km: "",
    lagerort: "", zustand: "gut", montiert_ab: "", montiert_bis: "",
    naechster_wechsel: "", austausch_faellig_ab_mm: "4", dokument_id: "", notizen: "", photo: null,
  },
  task: {
    fahrzeug_id: "", titel: "", beschreibung: "", status: "offen", prioritaet: "mittel",
    faellig_am: "", kilometerstand_faellig: "", notizen: "",
  },
  part: {
    fahrzeug_id: "", aufgabe_id: "", name: "", teilenummer: "", menge: "1",
    einzelpreis: "", status: "benoetigt", bezugsquelle: "", dokument_id: "", notizen: "",
  },
  mileage: { fahrzeug_id: "", datum: today(), kilometerstand: "" },
};

const inputClass = "w-full min-h-11 rounded-card-sm border border-light-border bg-light-card px-3 text-sm text-light-text-main outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main";
const buttonSecondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-card-sm border border-light-border bg-light-card px-4 text-sm font-semibold text-light-text-main transition hover:bg-light-hover dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main dark:hover:bg-canvas-3";
const buttonPrimary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-4 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50";

function Field({ label, required = false, error = "", children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
        {label}{required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-500">{error}</span> : null}
    </label>
  );
}

function EmptyState({ icon: Icon = Car, title, text, action }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-card border border-dashed border-light-border px-6 py-8 text-center dark:border-dark-border">
      <Icon size={28} className="text-light-text-secondary dark:text-dark-text-secondary" />
      <h3 className="mt-3 font-semibold text-light-text-main dark:text-dark-text-main">{title}</h3>
      {text ? <p className="mt-1 max-w-md text-sm text-light-text-secondary dark:text-dark-text-secondary">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function TankStatusField({ value, onChange, error = "" }) {
  const { t } = useTranslation(["kfz"]);
  const options = [
    ["voll", t("fuelStatus.full"), t("fuelStatus.fullHint")],
    ["teilweise", t("fuelStatus.partial"), t("fuelStatus.partialHint")],
    ["unbekannt", t("fuelStatus.unknown"), t("fuelStatus.unknownHint")],
  ];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        {t("fuelStatus.question")} <span className="text-red-500">*</span>
      </legend>
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        {options.map(([status, label, hint]) => (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={value === status}
            onClick={() => onChange(status)}
            className={`min-w-0 rounded-card-sm border px-3 py-3 text-left transition ${
              value === status
                ? "border-primary-500 bg-primary-500/10 text-primary-700 shadow-[0_0_20px_rgba(16,185,129,.08)] dark:text-primary-300"
                : "border-light-border hover:border-primary-500/50 dark:border-dark-border"
            }`}
          >
            <span className="block break-words text-sm font-semibold">{label}</span>
            <span className="mt-1 block break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{hint}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("fuelStatus.explanation")}</p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </fieldset>
  );
}

function FormActions({ saving, onCancel }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <button type="button" onClick={onCancel} className={`${buttonSecondary} flex-1`}>Abbrechen</button>
      <button type="submit" form="kfz-editor-form" disabled={saving} className={`${buttonPrimary} flex-1`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Speichern
      </button>
    </div>
  );
}

function EditorShell({ modal, title, saving, onClose, children }) {
  const { isMobile } = useViewport();
  const content = <div className="min-w-0 max-w-full overflow-x-clip">{children}<div className="sticky bottom-[var(--mobile-bottom-offset,0px)] z-10 -mx-4 mt-5 border-t border-light-border bg-light-card-bg px-4 pb-[max(0.25rem,var(--safe-area-bottom))] pt-3 md:hidden dark:border-dark-border dark:bg-canvas-2"><FormActions saving={saving} onCancel={onClose} /></div></div>;
  if (isMobile) return <BottomSheet open={Boolean(modal)} onClose={onClose} title={title} responsive>{content}</BottomSheet>;
  return (
    <ModalShell
      open={Boolean(modal)}
      onClose={onClose}
      title={title}
      maxWidthClass="max-w-3xl"
      footer={<FormActions saving={saving} onCancel={onClose} />}
    >
      {children}
    </ModalShell>
  );
}

function QuickEntrySheet({ open, onClose, vehicles, onSubmit, saving }) {
  const [kind, setKind] = useState("expense");
  const [details, setDetails] = useState(false);
  const [form, setForm] = useState({ ...EMPTY.expense, fahrzeug_id: vehicles[0]?.id || "" });
  const [errors, setErrors] = useState({});
  const [dateValid, setDateValid] = useState(true);
  const defaultVehicleId = vehicles[0]?.id || "";

  useEffect(() => {
    if (!open) return;
    setKind("expense");
    setDetails(false);
    setForm({ ...EMPTY.expense, fahrzeug_id: defaultVehicleId });
    setErrors({});
    setDateValid(true);
  }, [defaultVehicleId, open]);

  const switchKind = (nextKind) => {
    setKind(nextKind);
    setForm({ ...EMPTY[nextKind], fahrzeug_id: form.fahrzeug_id || vehicles[0]?.id || "" });
    setErrors({});
  };
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.fahrzeug_id) nextErrors.fahrzeug_id = "Bitte ein Fahrzeug wählen.";
    if (!form.datum || !dateValid) nextErrors.datum = "Bitte ein gültiges Datum angeben.";
    if (kind === "expense" && (form.betrag === "" || !(Number(form.betrag) >= 0))) nextErrors.betrag = "Bitte einen Betrag angeben.";
    if (kind === "expense" && !form.beschreibung.trim()) nextErrors.beschreibung = "Bitte eine Beschreibung angeben.";
    if (kind === "fuel" && (form.betrag === "" || !(Number(form.betrag) >= 0))) nextErrors.betrag = "Bitte einen gültigen Betrag angeben.";
    if (kind === "fuel" && (form.kilometerstand === "" || !(Number(form.kilometerstand) >= 0))) nextErrors.kilometerstand = "Bitte einen Kilometerstand angeben.";
    if (kind === "fuel" && !["voll", "teilweise", "unbekannt"].includes(form.tankstatus)) nextErrors.tankstatus = "Bitte den Tankstatus nach dem Tanken angeben.";
    if (kind === "service" && !form.typ) nextErrors.typ = "Bitte einen Servicetyp angeben.";
    if (kind === "mileage" && (form.kilometerstand === "" || !(Number(form.kilometerstand) >= 0))) nextErrors.kilometerstand = "Bitte einen Kilometerstand angeben.";
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) onSubmit(kind, form);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Schneller Eintrag" responsive>
      <form id="kfz-quick-form" className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["expense", "Ausgabe", Receipt],
            ["fuel", "Tankung", Fuel],
            ["service", "Service", Wrench],
            ["mileage", "Kilometerstand", Gauge],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => switchKind(id)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-card-sm border text-sm font-semibold ${
                kind === id ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300" : "border-light-border dark:border-dark-border"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        <Field label="Fahrzeug" required error={errors.fahrzeug_id}>
          <select className={inputClass} value={form.fahrzeug_id || ""} onChange={(e) => update("fahrzeug_id", e.target.value)}>
            <option value="">Fahrzeug auswählen</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}
          </select>
        </Field>
        <LocalizedDateField label="Datum" required value={form.datum} onChange={(value) => update("datum", value)} onValidityChange={setDateValid} error={errors.datum} />
        {kind === "expense" ? (
          <>
            <Field label="Beschreibung" required error={errors.beschreibung}><input className={inputClass} value={form.beschreibung} onChange={(e) => update("beschreibung", e.target.value)} /></Field>
            <Field label="Betrag (EUR)" required error={errors.betrag}><input className={inputClass} type="number" min="0" step="0.01" value={form.betrag} onChange={(e) => update("betrag", e.target.value)} /></Field>
            <Field label="Kategorie"><select className={inputClass} value={form.kategorie} onChange={(e) => update("kategorie", e.target.value)}>{["Versicherung","Steuer","Parken","Maut","Reifen","Zubehoer","Sonstiges"].map((value) => <option key={value} value={value}>{expenseCategoryLabel(value)}</option>)}</select></Field>
          </>
        ) : null}
        {kind === "fuel" ? (
          <>
            <Field label="Betrag (EUR)" required error={errors.betrag}><input className={inputClass} type="number" min="0" step="0.01" value={form.betrag} onChange={(e) => update("betrag", e.target.value)} /></Field>
            <Field label="Kilometerstand" required error={errors.kilometerstand}><input className={inputClass} type="number" min="0" max="9999999" value={form.kilometerstand} onChange={(e) => update("kilometerstand", e.target.value)} /></Field>
            <TankStatusField value={form.tankstatus} onChange={(value) => update("tankstatus", value)} error={errors.tankstatus} />
          </>
        ) : null}
        {kind === "service" ? (
          <Field label="Servicetyp" required error={errors.typ}><select className={inputClass} value={form.typ} onChange={(e) => update("typ", e.target.value)}>{["Service","Oelwechsel","Reparatur","Pickerl","Reifenwechsel"].map((value) => <option key={value} value={value}>{serviceTypeLabel(value)}</option>)}</select></Field>
        ) : null}
        {kind === "mileage" ? (
          <Field label="Kilometerstand" required error={errors.kilometerstand}><input className={inputClass} type="number" min="0" value={form.kilometerstand} onChange={(e) => update("kilometerstand", e.target.value)} /></Field>
        ) : null}
        {kind !== "mileage" ? (
          <button type="button" onClick={() => setDetails((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-card-sm border border-light-border px-3 text-sm font-semibold dark:border-dark-border">
            Weitere Angaben <ChevronDown size={16} className={details ? "rotate-180" : ""} />
          </button>
        ) : null}
        {details && kind === "fuel" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Liter"><input className={inputClass} type="number" min="0" step="0.001" value={form.liter} onChange={(e) => update("liter", e.target.value)} /></Field>
            <Field label="Tankstelle"><input className={inputClass} value={form.tankstelle} onChange={(e) => update("tankstelle", e.target.value)} /></Field>
            <Field label="Preis / Liter"><input className={inputClass} type="number" min="0" step="0.001" value={form.preis_pro_liter} onChange={(e) => update("preis_pro_liter", e.target.value)} /></Field>
          </div>
        ) : null}
        {details && kind === "expense" ? (
          <label className="flex min-h-11 items-center gap-3 rounded-card-sm border border-light-border px-3 text-sm dark:border-dark-border"><input type="checkbox" checked={Boolean(form.mirrorToBudget)} onChange={(e) => update("mirrorToBudget", e.target.checked)} /> Ins Budget übernehmen</label>
        ) : null}
        {details && kind === "service" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Kosten"><input className={inputClass} type="number" min="0" step="0.01" value={form.kosten} onChange={(e) => update("kosten", e.target.value)} /></Field>
            <Field label="Kilometerstand"><input className={inputClass} type="number" min="0" value={form.kilometerstand} onChange={(e) => update("kilometerstand", e.target.value)} /></Field>
            <Field label="Werkstatt"><input className={inputClass} value={form.werkstatt} onChange={(e) => update("werkstatt", e.target.value)} /></Field>
          </div>
        ) : null}
        <div className="sticky bottom-0 -mx-4 border-t border-light-border bg-light-card-bg px-4 pb-1 pt-3 dark:border-dark-border dark:bg-canvas-2">
          <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Speichern
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

export default function HomeKfz({ session }) {
  const { t } = useTranslation(["kfz"]);
  const userId = session?.user?.id;
  const householdId = getActiveHouseholdId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [period, setPeriod] = useState("12");
  const [costCategory, setCostCategory] = useState("");
  const [modal, setModal] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [serviceAnalysisOpen, setServiceAnalysisOpen] = useState(false);
  const [expandedServiceIds, setExpandedServiceIds] = useState(() => new Set());
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [fuelImportVehicleById, setFuelImportVehicleById] = useState({});
  const [fuelSyncReport, setFuelSyncReport] = useState(null);
  const [fuelSyncing, setFuelSyncing] = useState(false);
  const [ignoredFuelOpen, setIgnoredFuelOpen] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [dateValidity, setDateValidity] = useState({});
  const reducedMotion = useReducedMotion();
  const { data, loading, loadError, warnings: loadWarnings, refresh: loadData } = useKfzData({ householdId, userId });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  useEffect(() => {
    if (loadWarnings.length) console.warn("Kfz-Daten teilweise nicht verfügbar:", loadWarnings);
  }, [loadWarnings]);

  useEffect(() => {
    setSelectedVehicleId((current) => (
      current && data.vehicles.some((vehicle) => vehicle.id === current)
        ? current
        : data.vehicles[0]?.id || ""
    ));
  }, [data.vehicles]);

  const vehicleById = useMemo(() => Object.fromEntries(data.vehicles.map((vehicle) => [vehicle.id, vehicle])), [data.vehicles]);
  const selectedVehicle = selectedVehicleId ? vehicleById[selectedVehicleId] : null;
  const periodFrom = useMemo(() => {
    if (period === "all") return "";
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - Number(period) + 1);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      "01",
    ].join("-");
  }, [period]);
  const stats = useMemo(() => buildKfzStats({
    vehicles: data.vehicles,
    fuelEntries: data.fuel,
    services: data.services,
    expenses: data.expenses,
    mileageEntries: data.mileage,
    vehicleId: selectedVehicleId || null,
    from: periodFrom,
    category: costCategory,
  }), [costCategory, data.expenses, data.fuel, data.mileage, data.services, data.vehicles, periodFrom, selectedVehicleId]);

  const filtered = useMemo(() => {
    const match = (row) => !selectedVehicleId || row.fahrzeug_id === selectedVehicleId;
    const matchesPeriod = (row, field = "datum") => !periodFrom || !row[field] || String(row[field]).slice(0, 10) >= periodFrom;
    return {
      fuel: data.fuel.filter(match).filter((row) => matchesPeriod(row)).filter(() => !costCategory || costCategory === "Tanken"),
      services: data.services.filter(match).filter((row) => matchesPeriod(row)).filter(() => !costCategory || costCategory === "Service"),
      tires: data.tires.filter(match).filter((row) => matchesPeriod(row, "kaufdatum")),
      expenses: data.expenses.filter(match).filter((row) => matchesPeriod(row)).filter((row) => !costCategory || row.kategorie === costCategory),
      tasks: data.tasks.filter(match),
      parts: data.parts.filter(match),
      contracts: data.contracts.filter(match),
      policies: data.policies.filter(match),
    };
  }, [costCategory, data, periodFrom, selectedVehicleId]);

  useEffect(() => {
    if (!filtered.services.length) return;
    setExpandedServiceIds((current) => (
      filtered.services.some((service) => current.has(service.id))
        ? current
        : new Set([filtered.services[0].id])
    ));
  }, [filtered.services]);

  const linkedDocuments = useMemo(() => {
    if (!selectedVehicleId) return data.documents;
    const entityIds = new Set([
      selectedVehicleId,
      ...filtered.fuel.map((row) => row.id),
      ...filtered.services.map((row) => row.id),
      ...filtered.tires.map((row) => row.id),
      ...filtered.expenses.map((row) => row.id),
      ...filtered.parts.map((row) => row.id),
    ]);
    const documentIds = new Set(data.links
      .filter((link) => entityIds.has(link.entity_id) && !["vehicle_photo", "vehicle_cover"].includes(link.role))
      .map((link) => link.dokument_id));
    [
      ...filtered.fuel, ...filtered.services, ...filtered.tires, ...filtered.expenses, ...filtered.parts,
      ...filtered.contracts, ...filtered.policies,
    ].forEach((row) => {
      if (row.dokument_id) documentIds.add(row.dokument_id);
    });
    return data.documents.filter((document) => documentIds.has(document.id));
  }, [data.documents, data.links, filtered, selectedVehicleId]);
  const selectedVehiclePhotos = useMemo(() => getVehiclePhotos({
    documents: data.documents,
    links: data.links,
    vehicleId: selectedVehicleId,
  }), [data.documents, data.links, selectedVehicleId]);
  const selectedVehicleCover = useMemo(() => getVehicleCoverPhoto({
    documents: data.documents,
    links: data.links,
    vehicleId: selectedVehicleId,
  }), [data.documents, data.links, selectedVehicleId]);
  const vehicleCoverById = useMemo(() => Object.fromEntries(data.vehicles.map((vehicle) => [
    vehicle.id,
    getVehicleCoverPhoto({ documents: data.documents, links: data.links, vehicleId: vehicle.id }),
  ])), [data.documents, data.links, data.vehicles]);

  const dueItems = useMemo(() => {
    const items = [];
    data.vehicles.filter((row) => !selectedVehicleId || row.id === selectedVehicleId).forEach((vehicle) => {
      const days = daysUntil(vehicle.pickerl_termin);
      if (days != null && days <= 45) items.push({ id: `pickerl-${vehicle.id}`, label: `${vehicleLabel(vehicle)}: Pickerl`, days });
    });
    filtered.services.forEach((row) => {
      const days = daysUntil(row.naechste_faelligkeit_datum);
      const kmDue = row.naechste_faelligkeit_km && numberOrNull(vehicleById[row.fahrzeug_id]?.kilometerstand) >= numberOrNull(row.naechste_faelligkeit_km);
      if ((days != null && days <= 45) || kmDue) items.push({ id: `service-${row.id}`, label: `${formatKfzDisplayText(row.typ)}: ${vehicleLabel(vehicleById[row.fahrzeug_id])}`, days: kmDue ? 0 : days });
    });
    filtered.tires.forEach((row) => {
      const days = daysUntil(row.naechster_wechsel);
      const worn = row.profiltiefe != null && Number(row.profiltiefe) <= Number(row.austausch_faellig_ab_mm || 4);
      if ((days != null && days <= 45) || worn) items.push({ id: `tire-${row.id}`, label: `${row.saison}: ${worn ? "Profil prüfen" : "Wechsel"}`, days: worn ? 0 : days });
    });
    filtered.tasks.filter((row) => row.status !== "erledigt").forEach((row) => {
      const days = daysUntil(row.faellig_am);
      const kmDue = row.kilometerstand_faellig && numberOrNull(vehicleById[row.fahrzeug_id]?.kilometerstand) >= numberOrNull(row.kilometerstand_faellig);
      if ((days != null && days <= 45) || kmDue) items.push({
        id: `task-${row.id}`,
        label: `${row.titel}: ${vehicleLabel(vehicleById[row.fahrzeug_id])}`,
        days: kmDue ? 0 : days,
      });
    });
    [...filtered.contracts.map((row) => ({ ...row, due: row.end_date, label: row.vertragstitel || "Vertrag" })),
      ...filtered.policies.map((row) => ({ ...row, due: row.naechste_faelligkeit || row.end_date, label: row.versicherer || "Versicherung" }))].forEach((row) => {
      const days = daysUntil(row.due);
      if (days != null && days <= 45) items.push({ id: `contract-${row.id}`, label: row.label, days });
    });
    return items.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  }, [data.vehicles, filtered.contracts, filtered.policies, filtered.services, filtered.tasks, filtered.tires, selectedVehicleId, vehicleById]);

  const openModal = (type, row = null) => {
    setFormErrors({});
    setDateValidity({});
    const normalizedRow = type === "fuel" && row
      ? { ...row, tankstatus: normalizeTankStatus(row).status }
      : row;
    setModal({ type, form: { ...EMPTY[type], fahrzeug_id: selectedVehicleId || data.vehicles[0]?.id || "", ...(normalizedRow || {}) } });
  };
  const updateModal = (key, value) => setModal((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
  const updateDateValidity = (key, valid) => setDateValidity((current) => (
    current[key] === valid ? current : { ...current, [key]: valid }
  ));
  const closeModal = () => { if (!saving) setModal(null); };

  const saveRow = async (table, payload, id) => {
    const scopedPayload = { ...payload, household_id: householdId };
    const query = id
      ? supabase.from(table).update(scopedPayload).eq("household_id", householdId).eq("id", id)
      : supabase.from(table).insert(scopedPayload);
    const { data: saved, error: saveError } = await query.select("*").single();
    if (saveError) throw saveError;
    return saved;
  };

  const recordVehicleMileage = async (vehicleId, mileage, date = today(), source = "manuell", sourceId = null) => {
    if (mileage === "" || mileage == null) return;
    const { error: updateError } = await supabase.rpc("record_kfz_mileage", {
      p_household_id: householdId,
      p_vehicle_id: vehicleId,
      p_date: date || today(),
      p_mileage: Number(mileage),
      p_source: source,
      p_source_id: sourceId,
    });
    if (updateError) throw updateError;
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!modal) return;
    const { type, form } = modal;
    const errors = {};
    if (type !== "vehicle" && !form.fahrzeug_id) errors.fahrzeug_id = "Bitte ein Fahrzeug wählen.";
    if (type === "vehicle" && !form.name?.trim()) errors.name = "Der Fahrzeugname ist erforderlich.";
    if (type === "vehicle" && form.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(form.vin)) errors.vin = "VIN muss aus 17 gültigen Zeichen bestehen.";
    if (type === "vehicle" && form.baujahr !== "" && (!(Number(form.baujahr) >= 1886) || Number(form.baujahr) > new Date().getFullYear() + 1)) errors.baujahr = "Bitte ein gültiges Baujahr eingeben.";
    if (type === "vehicle" && form.kilometerstand !== "" && (!(Number(form.kilometerstand) >= 0) || Number(form.kilometerstand) > 9999999)) errors.kilometerstand = "Bitte einen gültigen Kilometerstand eingeben.";
    if (["expense", "fuel", "service"].includes(type) && !form.datum) errors.datum = "Bitte ein Datum eingeben.";
    if (type === "expense" && !form.beschreibung?.trim()) errors.beschreibung = "Beschreibung ist erforderlich.";
    if (type === "expense" && (form.betrag === "" || !(Number(form.betrag) >= 0))) errors.betrag = "Bitte einen gültigen Betrag eingeben.";
    if (type === "fuel" && (form.betrag === "" || !(Number(form.betrag) >= 0))) errors.betrag = "Bitte einen gültigen Betrag eingeben.";
    if (type === "fuel" && (form.kilometerstand === "" || !(Number(form.kilometerstand) >= 0) || Number(form.kilometerstand) > 9999999)) errors.kilometerstand = "Bitte einen Kilometerstand eingeben.";
    if (type === "fuel" && !["voll", "teilweise", "unbekannt"].includes(form.tankstatus)) errors.tankstatus = "Bitte den Tankstatus nach dem Tanken angeben.";
    if (type === "fuel" && form.liter !== "" && (!(Number(form.liter) > 0) || Number(form.liter) > 500)) errors.liter = "Bitte eine plausible Literzahl eingeben.";
    if (type === "fuel" && form.preis_pro_liter !== "" && (!(Number(form.preis_pro_liter) > 0) || Number(form.preis_pro_liter) > 20)) errors.preis_pro_liter = "Bitte einen plausiblen Literpreis eingeben.";
    if (type === "service" && form.kosten !== "" && !(Number(form.kosten) >= 0)) errors.kosten = "Bitte gültige Kosten eingeben.";
    if (type === "service" && form.kilometerstand !== "" && (!(Number(form.kilometerstand) >= 0) || Number(form.kilometerstand) > 9999999)) errors.kilometerstand = "Bitte einen gültigen Kilometerstand eingeben.";
    if (type === "tire" && form.profiltiefe !== "" && (!(Number(form.profiltiefe) >= 0) || Number(form.profiltiefe) > 30)) errors.profiltiefe = "Bitte eine plausible Profiltiefe eingeben.";
    if (type === "tire" && form.herstellungsjahr !== "" && (!(Number(form.herstellungsjahr) >= 1980) || Number(form.herstellungsjahr) > new Date().getFullYear() + 1)) errors.herstellungsjahr = "Bitte ein gültiges Herstellungsjahr eingeben.";
    if (type === "task" && !form.titel?.trim()) errors.titel = "Titel ist erforderlich.";
    if (type === "part" && !form.name?.trim()) errors.name = "Teilename ist erforderlich.";
    if (type === "part" && (!(Number(form.menge) > 0) || Number(form.menge) > 9999)) errors.menge = "Bitte eine gültige Menge eingeben.";
    Object.entries(dateValidity).forEach(([field, valid]) => {
      if (!valid) errors[field] = "Bitte ein gültiges Datum eingeben.";
    });
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setError("");
    try {
      let saved;
      if (type === "vehicle") {
        const { data: vehicleResult, error: vehicleSaveError } = await supabase.rpc("save_kfz_vehicle", {
          p_payload: {
            id: form.id || null,
            household_id: householdId,
            name: form.name.trim(),
            marke: form.marke || null,
            modell: form.modell || null,
            baujahr: intOrNull(form.baujahr),
            kennzeichen: form.kennzeichen?.toUpperCase() || null,
            vin: form.vin?.toUpperCase() || null,
            kilometerstand: form.id && form.kilometerstand === ""
              ? Number(vehicleById[form.id]?.kilometerstand || 0)
              : intOrNull(form.kilometerstand) ?? 0,
            kraftstoffart: form.kraftstoffart || null,
            versicherung: form.versicherung || null,
            polizzennummer: form.polizzennummer || null,
            pickerl_termin: form.pickerl_termin || null,
            status: form.status || "aktiv",
            notizen: form.notizen || null,
          },
        });
        if (vehicleSaveError) throw vehicleSaveError;
        saved = vehicleResult;
        if (!selectedVehicleId) setSelectedVehicleId(saved.id);
      } else if (type === "expense") {
        saved = await saveKfzExpenseWithBudget({ expense: form, householdId, userId, mirrorToBudget: Boolean(form.mirrorToBudget) });
      } else if (type === "fuel") {
        const liters = numberOrNull(form.liter);
        const tankstatus = form.tankstatus || "unbekannt";
        saved = await saveRow("home_fahrzeug_tankvorgaenge", {
          fahrzeug_id: form.fahrzeug_id, datum: form.datum || today(), betrag: numberOrNull(form.betrag) || 0,
          tankstelle: form.tankstelle || null, liter: liters, kilometerstand: intOrNull(form.kilometerstand),
          preis_pro_liter: numberOrNull(form.preis_pro_liter) || (liters ? Number(form.betrag || 0) / liters : null),
          kraftstoffart: form.kraftstoffart || null, tankstatus, tankstatus_quelle: "manuell",
          vollgetankt: tankstatus === "voll",
          verbrauch_bestaetigt: true,
          quelle: form.quelle || "manuell", budget_posten_id: form.budget_posten_id || null,
          rechnung_id: form.rechnung_id || null, dokument_id: form.dokument_id || null,
          notizen: form.notizen || null, created_by_user_id: userId,
        }, form.id);
      } else if (type === "service") {
        saved = await saveRow("home_fahrzeug_services", {
          fahrzeug_id: form.fahrzeug_id, typ: form.typ || "Service", datum: form.datum || today(),
          kilometerstand: intOrNull(form.kilometerstand), kosten: numberOrNull(form.kosten),
          werkstatt: form.werkstatt || null, beschreibung: form.beschreibung || null,
          naechste_faelligkeit_datum: form.naechste_faelligkeit_datum || null,
          naechste_faelligkeit_km: intOrNull(form.naechste_faelligkeit_km),
          dokument_id: form.dokument_id || null, notizen: form.notizen || null, created_by_user_id: userId,
        }, form.id);
      } else if (type === "tire") {
        saved = await saveRow("home_fahrzeug_reifen", {
          fahrzeug_id: form.fahrzeug_id, saison: form.saison, marke: form.marke || null,
          groesse: form.groesse || null, profiltiefe: numberOrNull(form.profiltiefe),
          kaufdatum: form.kaufdatum || null, kaufpreis: numberOrNull(form.kaufpreis),
          herstellungsjahr: intOrNull(form.herstellungsjahr), dot_nummer: form.dot_nummer || null,
          laufleistung_km: intOrNull(form.laufleistung_km), lagerort: form.lagerort || null,
          zustand: form.zustand || null, montiert_ab: form.montiert_ab || null,
          montiert_bis: form.montiert_bis || null, naechster_wechsel: form.naechster_wechsel || null,
          austausch_faellig_ab_mm: numberOrNull(form.austausch_faellig_ab_mm) || 4,
          dokument_id: form.dokument_id || null, notizen: form.notizen || null, created_by_user_id: userId,
        }, form.id);
        if (form.photo) await uploadKfzDocument({ file: form.photo, userId, householdId, entityType: "home_fahrzeug_reifen", entityId: saved.id, role: "photo", category: "Kfz-Reifen" });
      } else if (type === "task") {
        saved = await saveRow("home_fahrzeug_aufgaben", {
          fahrzeug_id: form.fahrzeug_id, titel: form.titel.trim(), beschreibung: form.beschreibung || null,
          status: form.status, prioritaet: form.prioritaet, faellig_am: form.faellig_am || null,
          erledigt_am: form.status === "erledigt" ? (form.erledigt_am || new Date().toISOString()) : null,
          kilometerstand_faellig: intOrNull(form.kilometerstand_faellig),
          notizen: form.notizen || null, created_by_user_id: userId,
        }, form.id);
      } else if (type === "part") {
        saved = await saveRow("home_fahrzeug_teile", {
          fahrzeug_id: form.fahrzeug_id, aufgabe_id: form.aufgabe_id || null, name: form.name.trim(),
          teilenummer: form.teilenummer || null, menge: numberOrNull(form.menge) || 1,
          einzelpreis: numberOrNull(form.einzelpreis), status: form.status,
          bezugsquelle: form.bezugsquelle || null, dokument_id: form.dokument_id || null,
          notizen: form.notizen || null, created_by_user_id: userId,
        }, form.id);
      }
      setModal(null);
      try {
        await notifyHouseholdEvent({ userId, table: TABLE_BY_TYPE[type], action: form.id ? "geaendert" : "erstellt", recordName: form.name || form.titel || form.beschreibung || form.typ || "Kfz-Eintrag", recordId: saved?.id, url: "/home/kfz" });
      } catch (notificationError) {
        console.warn("Kfz-Benachrichtigung fehlgeschlagen:", notificationError);
      }
      try {
        await loadData();
      } catch (refreshError) {
        console.warn("Kfz-Daten konnten nach dem Speichern nicht aktualisiert werden:", refreshError);
      }
    } catch (saveError) {
      setError(saveError?.message || "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveQuick = async (kind, form) => {
    setSaving(true);
    setError("");
    try {
      if (kind === "mileage") {
        await recordVehicleMileage(form.fahrzeug_id, form.kilometerstand, form.datum, "manuell");
      } else if (kind === "expense") {
        await saveKfzExpenseWithBudget({ expense: form, householdId, userId, mirrorToBudget: Boolean(form.mirrorToBudget) });
      } else {
        const table = kind === "fuel" ? "home_fahrzeug_tankvorgaenge" : "home_fahrzeug_services";
        const tankstatus = form.tankstatus || "unbekannt";
        const payload = kind === "fuel" ? {
          fahrzeug_id: form.fahrzeug_id, datum: form.datum, betrag: numberOrNull(form.betrag) || 0,
          tankstelle: form.tankstelle || null, liter: numberOrNull(form.liter),
          kilometerstand: intOrNull(form.kilometerstand), preis_pro_liter: numberOrNull(form.preis_pro_liter),
          tankstatus, tankstatus_quelle: "manuell", vollgetankt: tankstatus === "voll", verbrauch_bestaetigt: true,
          quelle: "manuell", created_by_user_id: userId,
        } : {
          fahrzeug_id: form.fahrzeug_id, typ: form.typ, datum: form.datum,
          kilometerstand: intOrNull(form.kilometerstand), kosten: numberOrNull(form.kosten),
          werkstatt: form.werkstatt || null, created_by_user_id: userId,
        };
        await saveRow(table, payload);
      }
      setQuickOpen(false);
      await loadData();
    } catch (quickError) {
      setError(quickError?.message || "Schneller Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (table, id, label) => {
    if (!window.confirm(`${label} wirklich löschen?`)) return;
    if (table === "home_fahrzeuge") {
      setSaving(true);
      setError("");
      try {
        const { data: result, error: vehicleDeleteError } = await supabase.rpc("delete_kfz_vehicle", {
          p_household_id: householdId,
          p_vehicle_id: id,
        });
        if (vehicleDeleteError) throw vehicleDeleteError;
        const paths = result?.storage_paths || [];
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from("user-dokumente").remove(paths);
          if (storageError) console.warn("Fahrzeug wurde gelöscht, Storage-Bereinigung fehlgeschlagen:", storageError);
        }
        setModal(null);
        setPhotoGalleryOpen(false);
        await loadData();
      } catch (vehicleDeleteError) {
        setError(vehicleDeleteError?.message || "Fahrzeug konnte nicht gelöscht werden.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (table === "home_fahrzeug_services") {
      const { error: serviceDeleteError } = await supabase.rpc("delete_kfz_service", {
        p_household_id: householdId,
        p_service_id: id,
      });
      if (serviceDeleteError) setError(serviceDeleteError.message);
      else await loadData();
      return;
    }
    const { error: deleteError } = await supabase.from(table).delete().eq("household_id", householdId).eq("id", id);
    if (deleteError) setError(deleteError.message);
    else {
      await loadData();
    }
  };

  const assignFuelImport = async (importRow) => {
    const vehicleId = fuelImportVehicleById[importRow.id] || selectedVehicleId;
    if (!vehicleId) {
      setError(t("fuelImports.vehicleRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await resolveFuelImport({ importRow, vehicleId, userId });
      setFuelImportVehicleById((current) => {
        const next = { ...current };
        delete next[importRow.id];
        return next;
      });
      await loadData();
    } catch (importError) {
      setError(importError?.message || t("fuelImports.assignError"));
    } finally {
      setSaving(false);
    }
  };

  const dismissFuelImport = async (importRow) => {
    setSaving(true);
    setError("");
    try {
      await ignoreFuelImport(importRow.id);
      await loadData();
    } catch (importError) {
      setError(importError?.message || t("fuelImports.ignoreError"));
    } finally {
      setSaving(false);
    }
  };

  const reactivateIgnoredFuelImport = async (importRow) => {
    setSaving(true);
    setError("");
    try {
      await reactivateFuelImport(importRow);
      await loadData();
    } catch (importError) {
      setError(importError?.message || t("fuelImports.reactivateError"));
    } finally {
      setSaving(false);
    }
  };

  const rescanFuelImports = async () => {
    setFuelSyncing(true);
    setError("");
    try {
      const result = await syncFuelImports({ householdId, userId, includeInvoicePositions: true });
      setFuelSyncReport(result.report);
      await loadData({ synchronizeFuel: false });
    } catch (syncError) {
      setError(syncError?.message || t("fuelImports.rescanError"));
    } finally {
      setFuelSyncing(false);
    }
  };

  const deleteFuelEntry = async (row) => {
    if (!window.confirm(t("fuelImports.deleteConfirm"))) return;
    const importRow = data.fuelImports.find((candidate) => (
      candidate.tankvorgang_id === row.id
      || (row.budget_posten_id && candidate.budget_posten_id === row.budget_posten_id)
      || (row.rechnung_id && candidate.rechnung_id === row.rechnung_id)
    ));
    const ignoreSource = importRow
      ? window.confirm(t("fuelImports.deleteSourceChoice"))
      : false;

    setSaving(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.rpc("delete_kfz_fuel_entry", {
        p_household_id: householdId,
        p_fuel_id: row.id,
        p_ignore_source: ignoreSource,
      });
      if (deleteError) throw deleteError;
      await loadData();
    } catch (deleteError) {
      setError(deleteError?.message || t("fuelImports.deleteError"));
    } finally {
      setSaving(false);
    }
  };

  const uploadVehiclePhotos = async (files) => {
    if (!selectedVehicle || !files?.length) return;
    setSaving(true);
    setError("");
    try {
      for (const [index, file] of files.entries()) {
        await uploadVehiclePhoto({
          file,
          userId,
          householdId,
          vehicleId: selectedVehicle.id,
          makeCover: !selectedVehicleCover && index === 0,
        });
      }
      await loadData();
    } catch (photoError) {
      setError(photoError?.message || "Fahrzeugfoto konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const makeVehicleCover = async (photo) => {
    if (!selectedVehicle) return;
    setSaving(true);
    setError("");
    try {
      await setVehicleCoverPhoto({ householdId, vehicleId: selectedVehicle.id, documentId: photo.id });
      await loadData();
    } catch (photoError) {
      setError(photoError?.message || "Titelbild konnte nicht geaendert werden.");
    } finally {
      setSaving(false);
    }
  };

  const removeVehiclePhoto = async (photo) => {
    if (!window.confirm("Fahrzeugfoto wirklich löschen?")) return;
    setSaving(true);
    setError("");
    try {
      await deleteVehiclePhoto(photo);
      if (photo.role === "vehicle_cover") {
        const successor = selectedVehiclePhotos.find((candidate) => candidate.id !== photo.id);
        if (successor) await setVehicleCoverPhoto({ householdId, vehicleId: selectedVehicle.id, documentId: successor.id });
      }
      await loadData();
    } catch (photoError) {
      setError(photoError?.message || "Fahrzeugfoto konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  };

  const downloadCsv = () => {
    const csv = buildKfzCsv(stats.transactions, vehicleById);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kfz_${selectedVehicle?.name || "alle"}_${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const documentOptions = data.documents.map((document) => <option key={document.id} value={document.id}>{document.dateiname}</option>);
  const vehicleOptions = data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>);
  const rowActions = (edit, remove) => (
    <div className="flex shrink-0 gap-1">
      <button type="button" onClick={edit} className="flex h-9 w-9 items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3" aria-label="Bearbeiten"><Pencil size={15} /></button>
      <button type="button" onClick={remove} className="flex h-9 w-9 items-center justify-center rounded-card-sm text-red-500 hover:bg-red-500/10" aria-label="Löschen"><Trash2 size={15} /></button>
    </div>
  );

  if (loading) return <div className="flex items-center gap-2 p-6 text-light-text-main dark:text-dark-text-main"><Loader2 className="animate-spin" size={18} /> Kfz-Modul wird geladen...</div>;

  return (
    <div className="kfz-modern relative min-h-full min-w-0 max-w-full space-y-5 overflow-x-clip bg-transparent p-4 pb-28 text-light-text-main md:p-6 lg:pb-8 dark:text-dark-text-main">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-light-bg/35 via-light-bg/10 to-light-bg/45 dark:from-canvas-0/25 dark:via-transparent dark:to-canvas-0/55" />
      <motion.header
        initial={reducedMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
      >
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold md:text-3xl">{t("kfz:title")}</h1>
          <p className="mt-1 break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("kfz:subtitle")}</p>
        </div>
        <div className={`${glassPanelClass} grid min-w-0 grid-cols-1 gap-2 p-2 md:flex md:flex-row`}>
          <select className={`${inputClass} min-w-0 md:min-w-56`} value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
            <option value="">{t("kfz:allVehicles")}</option>
            {vehicleOptions}
          </select>
          <select className={`${inputClass} min-w-0 md:min-w-44`} value={costCategory} onChange={(e) => setCostCategory(e.target.value)}>
            <option value="">Alle Kostenarten</option>
            {["Tanken","Service","Versicherung","Steuer","Parken","Maut","Reifen","Zubehoer","Sonstiges"].map((value) => <option key={value} value={value}>{expenseCategoryLabel(value)}</option>)}
          </select>
          <button onClick={() => setQuickOpen(true)} disabled={!data.vehicles.length} className={`${buttonPrimary} w-full md:w-auto`}><Plus size={17} /> {t("kfz:quickEntry")}</button>
          <button onClick={() => openModal("vehicle")} className={`${buttonSecondary} w-full md:w-auto`}><Car size={17} /> {t("kfz:addVehicle")}</button>
        </div>
      </motion.header>
      <VehicleSwitcher vehicles={data.vehicles} selectedVehicleId={selectedVehicleId} coverByVehicleId={vehicleCoverById} onSelect={setSelectedVehicleId} />

      {error ? <KfzAlert>{error}</KfzAlert> : null}

      {!data.vehicles.length ? (
        <EmptyState icon={Car} title="Noch kein Fahrzeug angelegt" text="Lege dein erstes Fahrzeug an, um Kosten, Tankungen und Termine zu verwalten." action={<button onClick={() => openModal("vehicle")} className={buttonPrimary}><Plus size={16} /> Fahrzeug anlegen</button>} />
      ) : (
        <>
          <nav className={`${glassPanelClass} grid min-w-0 grid-cols-4 gap-1 overflow-hidden p-1.5 md:flex`}>
            {TABS.map(([id, key, Icon]) => (
              <button key={id} onClick={() => setActiveTab(id)} className={`relative inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-card-sm px-1 py-2 text-center text-[10px] font-semibold leading-tight transition md:min-h-11 md:shrink-0 md:flex-row md:gap-2 md:px-3 md:py-0 md:text-sm ${activeTab === id ? "text-primary-700 dark:text-primary-200" : "text-light-text-secondary hover:bg-white/50 hover:text-light-text-main dark:text-dark-text-secondary dark:hover:bg-white/[0.05] dark:hover:text-dark-text-main"}`}>
                {activeTab === id ? <motion.span layoutId="kfz-active-tab" className="absolute inset-0 -z-10 rounded-card-sm border border-primary-500/20 bg-primary-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_0_20px_rgba(16,185,129,.08)]" /> : null}
                <Icon size={16} className="shrink-0" /> <span className="min-w-0 break-words">{t(`kfz:tabs.${key}`)}</span>
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            <motion.div key={activeTab} variants={reducedMotion ? {} : pageVariants} initial="hidden" animate="show" exit="exit">
          {activeTab === "overview" ? <div className="space-y-4">
            {data.fuelImports.some((row) => row.status === "pending") ? (
              <button type="button" onClick={() => setActiveTab("fuel")} className="flex w-full min-w-0 items-center gap-3 rounded-card-sm border border-cyan-500/20 bg-cyan-500/[0.07] px-4 py-3 text-left text-sm transition hover:bg-cyan-500/[0.11]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/12 text-cyan-500"><Fuel size={17} /></span>
                <span className="min-w-0 flex-1"><strong className="block">{t("fuelImports.pendingTitle", { count: data.fuelImports.filter((row) => row.status === "pending").length })}</strong><span className="mt-0.5 block break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("fuelImports.pendingHint")}</span></span>
              </button>
            ) : null}
            <KfzOverview stats={stats} selectedVehicle={selectedVehicle} coverPhoto={selectedVehicleCover} photoCount={selectedVehiclePhotos.length} period={period} setPeriod={setPeriod} dueItems={dueItems} onEditVehicle={() => openModal("vehicle", selectedVehicle)} onOpenGallery={() => setPhotoGalleryOpen(true)} onShowCosts={() => setActiveTab("costs")} money={money} formatDate={formatDate} />
          </div> : null}

          {activeTab === "costs" ? (
            <section className="space-y-4">
              <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row md:items-center">
                <div><h2 className="text-lg font-semibold">Fahrzeugkosten</h2><p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Versicherung, Steuer, Parken, Maut, Reifen und Zubehör.</p></div>
                <button onClick={() => openModal("expense")} className={buttonPrimary}><Plus size={16} /> Ausgabe</button>
              </div>
              {filtered.expenses.length ? (
                <div className="overflow-hidden rounded-card border border-light-border bg-light-card dark:border-dark-border dark:bg-canvas-2">
                  {filtered.expenses.map((row) => (
                    <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-light-border px-4 py-3 last:border-0 md:flex md:items-center dark:border-dark-border">
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{formatKfzDisplayText(row.beschreibung)}</strong><span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[11px] text-primary-600 dark:text-primary-300">{formatKfzDisplayText(row.kategorie)}</span>{row.budget_posten_id ? <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">Budget</span> : null}</div><div className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{vehicleLabel(vehicleById[row.fahrzeug_id])} - {formatDate(row.datum)}</div></div>
                      <strong className="text-right md:ml-auto">{money(row.betrag)}</strong>
                      <div className="col-span-2 flex justify-end md:col-span-1">{rowActions(() => openModal("expense", { ...row, mirrorToBudget: Boolean(row.budget_posten_id) }), () => deleteRow("home_fahrzeug_ausgaben", row.id, row.beschreibung))}</div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={WalletCards} title="Keine allgemeinen Fahrzeugkosten" text="Tankungen und Services werden separat erfasst." />}
            </section>
          ) : null}

          {activeTab === "fuel" ? (
            <section className="space-y-4">
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0"><h2 className="text-lg font-semibold">Tankhistorie</h2><p className="break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">Volltankungen bilden die Grundlage der Verbrauchsberechnung.</p></div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:w-auto">
                  <button type="button" onClick={rescanFuelImports} disabled={fuelSyncing || saving} className={`${buttonSecondary} w-full md:w-auto`}>
                    <RefreshCw size={16} className={fuelSyncing ? "animate-spin" : ""} /> {t("fuelImports.rescan")}
                  </button>
                  <button onClick={() => openModal("fuel")} className={`${buttonPrimary} w-full md:w-auto`}><Plus size={16} /> Tankung</button>
                </div>
              </div>
              {fuelSyncReport ? (
                <div className="rounded-card border border-primary-500/20 bg-primary-500/[0.045] p-4">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t("fuelImports.reportTitle")}</h3>
                      <p className="mt-1 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("fuelImports.reportHint")}</p>
                    </div>
                    <button type="button" onClick={() => setFuelSyncReport(null)} className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">{t("fuelImports.dismissReport")}</button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["detected", fuelSyncReport.detected],
                      ["newlyImported", fuelSyncReport.newlyImported],
                      ["pending", fuelSyncReport.pending],
                      ["existing", fuelSyncReport.existing],
                      ["ignored", fuelSyncReport.ignored],
                      ["errors", fuelSyncReport.errors?.length || 0],
                    ].map(([key, value]) => (
                      <div key={key} className="rounded-card-sm border border-primary-500/10 bg-white/40 px-3 py-2 dark:bg-white/[0.035]">
                        <span className="block text-[10px] uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">{t(`fuelImports.report.${key}`)}</span>
                        <strong className="mt-1 block text-lg">{value}</strong>
                      </div>
                    ))}
                  </div>
                  {(fuelSyncReport.repaired > 0 || fuelSyncReport.archived > 0 || fuelSyncReport.foreignHousehold > 0) ? (
                    <p className="mt-3 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      {t("fuelImports.reportDetails", {
                        repaired: fuelSyncReport.repaired,
                        archived: fuelSyncReport.archived,
                        foreign: fuelSyncReport.foreignHousehold,
                      })}
                    </p>
                  ) : null}
                  {fuelSyncReport.errors?.length ? (
                    <div className="mt-3 space-y-1 rounded-card-sm border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-800 dark:text-amber-200">
                      {fuelSyncReport.errors.map((item, index) => (
                        <p key={`${item.budgetPostenId || item.stage}-${index}`} className="break-words">
                          <strong>{item.description || t("fuelImports.detectedFuel")}:</strong> {item.message}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {data.fuelImports.some((row) => row.status === "pending") ? (
                <div className="overflow-hidden rounded-card border border-cyan-500/20 bg-cyan-500/[0.045]">
                  <div className="border-b border-cyan-500/15 px-4 py-3">
                    <h3 className="font-semibold">{t("fuelImports.inboxTitle")}</h3>
                    <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("fuelImports.inboxHint")}</p>
                  </div>
                  <div className="divide-y divide-cyan-500/10">
                    {data.fuelImports.filter((row) => row.status === "pending").map((row) => {
                      const snapshot = row.quell_snapshot || {};
                      return (
                        <motion.div layout key={row.id} className="grid min-w-0 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,.6fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <strong className="break-words">{snapshot.tankstelle || snapshot.beschreibung || t("fuelImports.detectedFuel")}</strong>
                              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-300">{Math.round(Number(row.confidence || 0) * 100)} %</span>
                            </div>
                            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              <span>{formatDate(snapshot.datum)}</span>
                              <strong className="text-light-text-main dark:text-dark-text-main">{money(snapshot.betrag)}</strong>
                              {snapshot.liter ? <span>{Number(snapshot.liter).toFixed(2)} l</span> : null}
                              {snapshot.preis_pro_liter ? <span>{money(snapshot.preis_pro_liter)} / l</span> : null}
                            </div>
                          </div>
                          <select
                            className={inputClass}
                            aria-label={t("fuelImports.selectVehicle")}
                            value={fuelImportVehicleById[row.id] || selectedVehicleId || ""}
                            onChange={(event) => setFuelImportVehicleById((current) => ({ ...current, [row.id]: event.target.value }))}
                          >
                            <option value="">{t("fuelImports.selectVehicle")}</option>
                            {vehicleOptions}
                          </select>
                          <div className="grid grid-cols-2 gap-2 lg:flex">
                            <button type="button" disabled={saving} onClick={() => dismissFuelImport(row)} className={buttonSecondary}>{t("fuelImports.ignore")}</button>
                            <button type="button" disabled={saving} onClick={() => assignFuelImport(row)} className={buttonPrimary}>{t("fuelImports.assign")}</button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {data.fuelImports.some((row) => row.status === "ignored") ? (
                <div className="overflow-hidden rounded-card border border-light-border bg-light-card dark:border-dark-border dark:bg-canvas-2">
                  <button type="button" onClick={() => setIgnoredFuelOpen((current) => !current)} className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 px-4 text-left">
                    <span className="min-w-0"><strong className="block">{t("fuelImports.ignoredTitle")}</strong><span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("fuelImports.ignoredCount", { count: data.fuelImports.filter((row) => row.status === "ignored").length })}</span></span>
                    <ChevronDown size={16} className={`shrink-0 transition-transform ${ignoredFuelOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {ignoredFuelOpen ? (
                      <motion.div initial={reducedMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-light-border dark:border-dark-border">
                        {data.fuelImports.filter((row) => row.status === "ignored").map((row) => {
                          const snapshot = row.quell_snapshot || {};
                          return (
                            <div key={row.id} className="flex min-w-0 flex-col gap-3 border-b border-light-border px-4 py-3 last:border-0 sm:flex-row sm:items-center dark:border-dark-border">
                              <div className="min-w-0 flex-1">
                                <strong className="block break-words">{snapshot.tankstelle || snapshot.beschreibung || t("fuelImports.detectedFuel")}</strong>
                                <span className="mt-1 block break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{formatDate(snapshot.datum)} · {money(snapshot.betrag)}</span>
                              </div>
                              <button type="button" disabled={saving} onClick={() => reactivateIgnoredFuelImport(row)} className={`${buttonSecondary} w-full sm:w-auto`}><RotateCcw size={15} /> {t("fuelImports.reactivate")}</button>
                            </div>
                          );
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
              {filtered.fuel.length ? <div className="overflow-hidden rounded-card border border-light-border bg-light-card dark:border-dark-border dark:bg-canvas-2">{filtered.fuel.map((row) => <div key={row.id} className="grid min-w-0 grid-cols-2 gap-2 border-b border-light-border px-4 py-3 text-sm last:border-0 md:grid-cols-[1fr_.7fr_.7fr_.7fr_auto] md:items-center dark:border-dark-border"><div className="col-span-2 min-w-0 md:col-span-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words">{row.tankstelle || "Tankung"}</strong>{row.verbrauch_bestaetigt === false ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">{t("fuelImports.needsReview")}</span> : null}</div><div className="break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{vehicleLabel(vehicleById[row.fahrzeug_id])}</div></div><div>{formatDate(row.datum)}</div><div>{row.liter ? `${Number(row.liter).toFixed(2)} l` : "-"}</div><div className="col-span-2 md:col-span-1"><strong>{money(row.betrag)}</strong><div className="break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{row.kilometerstand ? `${Number(row.kilometerstand).toLocaleString("de-AT")} km` : "-"} - {row.verbrauch_bestaetigt === false ? t("fuelImports.consumptionOpen") : fuelStatusLabel(row, t)}</div></div><div className="col-span-2 flex justify-end md:col-span-1">{rowActions(() => openModal("fuel", row), () => deleteFuelEntry(row))}</div></div>)}</div> : <EmptyState icon={Fuel} title="Noch keine Tankungen" />}
            </section>
          ) : null}

          {activeTab === "service" ? (
            <section className="space-y-4">
              <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row"><div className="min-w-0"><h2 className="text-lg font-semibold">Service & Reparaturen</h2><p className="break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">Werkstattbesuche, Pickerl und kilometerbasierte Wartung.</p></div><div className="grid grid-cols-1 gap-2 md:flex md:flex-wrap"><button onClick={() => setServiceAnalysisOpen(true)} className={`${buttonSecondary} w-full md:w-auto`}><Upload size={16} /> {t("analysis.action")}</button><button onClick={() => openModal("service")} className={`${buttonPrimary} w-full md:w-auto`}><Plus size={16} /> Service</button></div></div>
              <div className="grid gap-3 xl:grid-cols-2">{filtered.services.length ? filtered.services.map((row) => {
                const positions = data.servicePositions.filter((position) => position.service_id === row.id);
                const document = data.documents.find((item) => item.id === row.dokument_id);
                return <KfzServiceCard
                  key={row.id}
                  service={row}
                  positions={positions}
                  vehicleLabel={vehicleLabel(vehicleById[row.fahrzeug_id])}
                  formatDate={formatDate}
                  money={money}
                  document={document}
                  expanded={expandedServiceIds.has(row.id)}
                  onToggle={() => setExpandedServiceIds((current) => {
                    const next = new Set(current);
                    if (next.has(row.id)) next.delete(row.id);
                    else next.add(row.id);
                    return next;
                  })}
                  onEdit={() => openModal("service", row)}
                  onDelete={() => deleteRow("home_fahrzeug_services", row.id, row.typ)}
                />;
              }) : <div className="lg:col-span-2"><EmptyState icon={Wrench} title="Noch keine Serviceeintraege" /></div>}</div>
            </section>
          ) : null}

          {activeTab === "tires" ? (
            <section className="space-y-4">
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><h2 className="text-lg font-semibold">Reifensätze</h2><p className="break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">Profil, DOT, Laufleistung, Lagerort und Zustandsfotos.</p></div><button onClick={() => openModal("tire")} className={`${buttonPrimary} w-full md:w-auto`}><Plus size={16} /> Reifensatz</button></div>
              <div className="grid gap-3 lg:grid-cols-2">{filtered.tires.length ? filtered.tires.map((row) => {
                const worn = row.profiltiefe != null && Number(row.profiltiefe) <= Number(row.austausch_faellig_ab_mm || 4);
                return <article key={row.id} className="min-w-0 rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{row.saison}</h3><p className="break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{vehicleLabel(vehicleById[row.fahrzeug_id])} - {[row.marke, row.groesse].filter(Boolean).join(" ")}</p></div>{rowActions(() => openModal("tire", row), () => deleteRow("home_fahrzeug_reifen", row.id, row.saison))}</div><dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-sm"><div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">Profil</dt><dd className={worn ? "break-words font-semibold text-red-500" : "break-words font-semibold"}>{row.profiltiefe == null ? "-" : `${row.profiltiefe} mm`}</dd></div><div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">DOT</dt><dd className="break-all font-semibold">{row.dot_nummer || "-"}</dd></div><div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">Laufleistung</dt><dd className="break-words font-semibold">{row.laufleistung_km ? `${Number(row.laufleistung_km).toLocaleString("de-AT")} km` : "-"}</dd></div><div className="min-w-0"><dt className="text-light-text-secondary dark:text-dark-text-secondary">Lagerort</dt><dd className="break-words font-semibold">{row.lagerort || "-"}</dd></div></dl><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-light-border dark:bg-canvas-3"><div className={`h-full rounded-full ${worn ? "bg-red-500" : Number(row.profiltiefe) <= 5 ? "bg-amber-500" : "bg-primary-500"}`} style={{ width: `${Math.min((Number(row.profiltiefe || 0) / 10) * 100, 100)}%` }} /></div></article>;
              }) : <div className="lg:col-span-2"><EmptyState icon={Gauge} title="Noch keine Reifensätze" /></div>}</div>
            </section>
          ) : null}

          {activeTab === "documents" ? (
            <section className="space-y-5">
              <div><h2 className="text-lg font-semibold">Dokumente & Verträge</h2><p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Verknüpfte Belege, Reifenfotos, Policen, Leasing- und Kreditverträge.</p></div>
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="min-w-0 rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"><h3 className="font-semibold">Dokumente</h3>{selectedVehicle ? <label className={`${buttonSecondary} w-full cursor-pointer md:w-auto`}><Upload size={15} /> Hochladen<input type="file" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setSaving(true); try { await uploadKfzDocument({ file, userId, householdId, entityType: "home_fahrzeuge", entityId: selectedVehicle.id, role: "attachment", category: "Kfz" }); await loadData(); } catch (uploadError) { setError(uploadError.message); } finally { setSaving(false); event.target.value = ""; } }} /></label> : null}</div><div className="mt-3 space-y-2">{linkedDocuments.length ? linkedDocuments.map((document) => <div key={document.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card-sm bg-light-surface-2 px-3 py-3 dark:bg-canvas-3"><span className="text-primary-500">{document.datei_typ?.startsWith("image/") ? <Image size={17} /> : <FileText size={17} />}</span><button onClick={async () => { try { const url = await createKfzDocumentUrl(document); if (url) window.open(url, "_blank", "noopener,noreferrer"); } catch (documentError) { setError(documentError.message); } }} className="min-w-0 break-all text-left text-sm font-medium">{document.dateiname}</button><button onClick={async () => { if (!window.confirm("Dokument wirklich löschen?")) return; try { await removeKfzDocument(document); await loadData(); } catch (removeError) { setError(removeError.message); } }} className="flex h-9 w-9 items-center justify-center text-red-500"><Trash2 size={15} /></button></div>) : <EmptyState icon={FileText} title="Keine Dokumente verknüpft" />}</div></div>
                <div className="space-y-5">
                  <div className="rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> Versicherungen</h3><div className="mt-3 space-y-2">{data.policies.length ? data.policies.map((row) => <div key={row.id} className="rounded-card-sm bg-light-surface-2 px-3 py-3 text-sm dark:bg-canvas-3"><div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center"><div className="min-w-0 flex-1"><strong className="break-words">{row.versicherer || "Versicherung"}</strong><div className="mt-1 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{row.polizzen_nummer || "-"} - {money(row.praemie)} / {row.praemien_intervall || "Jahr"}</div></div><select className="w-full min-w-0 rounded-card-sm border border-light-border bg-transparent px-2 py-2 text-xs md:w-auto dark:border-dark-border" value={row.fahrzeug_id || ""} onChange={async (event) => { const { error: assignmentError } = await supabase.from("versicherungs_polizzen").update({ fahrzeug_id: event.target.value || null }).eq("id", row.id); if (assignmentError) setError(assignmentError.message); else loadData(); }}><option value="">Nicht zugeordnet</option>{vehicleOptions}</select></div></div>) : <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Keine Policen vorhanden.</p>}</div></div>
                  <div className="rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><h3 className="flex items-center gap-2 font-semibold"><FileText size={17} /> Verträge</h3><div className="mt-3 space-y-2">{data.contracts.length ? data.contracts.map((row) => <div key={row.id} className="rounded-card-sm bg-light-surface-2 px-3 py-3 text-sm dark:bg-canvas-3"><div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center"><div className="min-w-0 flex-1"><strong className="break-words">{row.vertragstitel || row.partner || "Vertrag"}</strong><div className="mt-1 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{row.partner || "-"} - Ende {formatDate(row.end_date)}</div></div><select className="w-full min-w-0 rounded-card-sm border border-light-border bg-transparent px-2 py-2 text-xs md:w-auto dark:border-dark-border" value={row.fahrzeug_id || ""} onChange={async (event) => { const { error: assignmentError } = await supabase.from("vertraege").update({ fahrzeug_id: event.target.value || null }).eq("id", row.id); if (assignmentError) setError(assignmentError.message); else loadData(); }}><option value="">Nicht zugeordnet</option>{vehicleOptions}</select></div></div>) : <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Keine Verträge vorhanden.</p>}</div></div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "tasks" ? (
            <section className="space-y-5">
              <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row"><div className="min-w-0"><h2 className="text-lg font-semibold">Aufgaben & Ersatzteile</h2><p className="break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">Reparaturen planen und benötigte Teile nachverfolgen.</p></div><div className="grid grid-cols-2 gap-2 md:flex"><button onClick={() => openModal("part")} className={buttonSecondary}><Package size={16} /> Teil</button><button onClick={() => openModal("task")} className={buttonPrimary}><Plus size={16} /> Aufgabe</button></div></div>
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="min-w-0 space-y-3"><h3 className="font-semibold">Aufgaben</h3>{filtered.tasks.length ? filtered.tasks.map((row) => <article key={row.id} className="min-w-0 rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words">{row.titel}</strong><span className={`rounded-full px-2 py-0.5 text-[11px] ${row.status === "erledigt" ? "bg-primary-500/10 text-primary-500" : row.prioritaet === "hoch" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}>{row.status.replace("_", " ")}</span></div><p className="mt-1 break-words text-xs text-light-text-secondary dark:text-dark-text-secondary">{vehicleLabel(vehicleById[row.fahrzeug_id])} - fällig {formatDate(row.faellig_am)}</p></div>{rowActions(() => openModal("task", row), () => deleteRow("home_fahrzeug_aufgaben", row.id, row.titel))}</div>{row.beschreibung ? <p className="mt-3 break-words text-sm">{row.beschreibung}</p> : null}</article>) : <EmptyState icon={ListTodo} title="Keine Aufgaben" />}</div>
                <div className="min-w-0 space-y-3"><h3 className="font-semibold">Ersatzteile</h3>{filtered.parts.length ? filtered.parts.map((row) => <article key={row.id} className="min-w-0 rounded-card border border-light-border bg-light-card p-4 dark:border-dark-border dark:bg-canvas-2"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><strong className="break-words">{row.name}</strong><p className="mt-1 break-all text-xs text-light-text-secondary dark:text-dark-text-secondary">{row.teilenummer || "Keine Teilenummer"} - {row.status}</p></div>{rowActions(() => openModal("part", row), () => deleteRow("home_fahrzeug_teile", row.id, row.name))}</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span>{row.menge} Stk.</span><strong className="break-words text-right">{money(Number(row.menge || 0) * Number(row.einzelpreis || 0))}</strong></div></article>) : <EmptyState icon={Package} title="Keine Ersatzteile" />}</div>
              </div>
            </section>
          ) : null}

          {activeTab === "analytics" ? (
            <section className="space-y-5">
                <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row md:items-center"><div className="min-w-0"><h2 className="text-lg font-semibold">Auswertung & Export</h2><p className="break-words text-sm text-light-text-secondary dark:text-dark-text-secondary">Fahrzeug und Zeitraum gelten für Diagramme und Exporte.</p></div><div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap"><button onClick={downloadCsv} className={buttonSecondary}><Download size={16} /> CSV</button><PDFDownloadLink className={buttonPrimary} fileName={`kfz_bericht_${today()}.pdf`} document={<KfzReportPDF vehicle={selectedVehicle} stats={stats} services={filtered.services} servicePositions={data.servicePositions} tires={filtered.tires} periodLabel={period === "all" ? "Gesamtzeitraum" : `${period} Monate`} />}>{({ loading: pdfLoading }) => <>{pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} PDF</>}</PDFDownloadLink></div></div>
              <KfzAnalytics stats={stats} />
            </section>
          ) : null}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      <QuickEntrySheet open={quickOpen} onClose={() => setQuickOpen(false)} vehicles={data.vehicles} onSubmit={saveQuick} saving={saving} />
      <KfzServiceAnalysisModal
        open={serviceAnalysisOpen}
        onClose={() => setServiceAnalysisOpen(false)}
        onSaved={loadData}
        vehicles={data.vehicles}
        selectedVehicleId={selectedVehicleId}
        userId={userId}
        householdId={householdId}
      />
      <VehiclePhotoGallery
        open={photoGalleryOpen}
        onClose={() => setPhotoGalleryOpen(false)}
        vehicle={selectedVehicle}
        photos={selectedVehiclePhotos}
        busy={saving}
        onUpload={uploadVehiclePhotos}
        onSetCover={makeVehicleCover}
        onDelete={removeVehiclePhoto}
      />

      {modal ? (
        <EditorShell modal={modal} title={{
          vehicle: modal.form.id ? "Fahrzeug bearbeiten" : "Fahrzeug anlegen",
          expense: "Fahrzeugausgabe", fuel: "Tankvorgang", service: "Service",
          tire: "Reifensatz", task: "Kfz-Aufgabe", part: "Ersatzteil",
        }[modal.type]} saving={saving} onClose={closeModal}>
          <form id="kfz-editor-form" className="space-y-5" onSubmit={submitForm}>
            {modal.type !== "vehicle" ? <Field label="Fahrzeug" required error={formErrors.fahrzeug_id}><select className={inputClass} value={modal.form.fahrzeug_id || ""} onChange={(e) => updateModal("fahrzeug_id", e.target.value)}><option value="">Auswählen</option>{vehicleOptions}</select></Field> : null}

            {modal.type === "vehicle" ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <Field label="Name" required error={formErrors.name}><input className={inputClass} value={modal.form.name || ""} onChange={(e) => updateModal("name", e.target.value)} /></Field>
                  <Field label="Marke"><input className={inputClass} value={modal.form.marke || ""} onChange={(e) => updateModal("marke", e.target.value)} /></Field>
                  <Field label="Modell"><input className={inputClass} value={modal.form.modell || ""} onChange={(e) => updateModal("modell", e.target.value)} /></Field>
                  <Field label="Baujahr" error={formErrors.baujahr}><input className={inputClass} type="number" min="1886" max={new Date().getFullYear() + 1} value={modal.form.baujahr || ""} onChange={(e) => updateModal("baujahr", e.target.value)} /></Field>
                  <Field label="Kennzeichen"><input className={inputClass} value={modal.form.kennzeichen || ""} onChange={(e) => updateModal("kennzeichen", e.target.value.toUpperCase())} /></Field>
                  <Field label="Kilometerstand" error={formErrors.kilometerstand}><input className={inputClass} type="number" min="0" max="9999999" value={modal.form.kilometerstand || ""} onChange={(e) => updateModal("kilometerstand", e.target.value)} /></Field>
                  <Field label="Kraftstoff"><select className={inputClass} value={modal.form.kraftstoffart || "Benzin"} onChange={(e) => updateModal("kraftstoffart", e.target.value)}>{["Benzin","Diesel","Hybrid","Elektro","Autogas"].map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <LocalizedDateField label="Pickerl-Datum" value={modal.form.pickerl_termin || ""} onChange={(value) => updateModal("pickerl_termin", value)} onValidityChange={(valid) => updateDateValidity("pickerl_termin", valid)} error={formErrors.pickerl_termin} />
                  <Field label="Status"><select className={inputClass} value={modal.form.status || "aktiv"} onChange={(e) => updateModal("status", e.target.value)}><option value="aktiv">Aktiv</option><option value="verkauft">Verkauft</option><option value="stillgelegt">Stillgelegt</option></select></Field>
                </div>
                <details className="rounded-card-sm border border-light-border p-4 dark:border-dark-border" open={Boolean(modal.form.versicherung || modal.form.vin)}>
                  <summary className="cursor-pointer text-sm font-semibold">Versicherung & Identifikation (optional)</summary>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Versicherer"><input className={inputClass} value={modal.form.versicherung || ""} onChange={(e) => updateModal("versicherung", e.target.value)} /></Field>
                    <Field label="Polizzennummer"><input className={inputClass} value={modal.form.polizzennummer || ""} onChange={(e) => updateModal("polizzennummer", e.target.value)} /></Field>
                    <Field label="VIN" error={formErrors.vin}><input className={inputClass} maxLength={17} value={modal.form.vin || ""} onChange={(e) => updateModal("vin", e.target.value.toUpperCase())} /></Field>
                  </div>
                </details>
                <Field label="Notizen"><textarea className={`${inputClass} py-3`} rows={3} value={modal.form.notizen || ""} onChange={(e) => updateModal("notizen", e.target.value)} /></Field>
                {modal.form.id ? <button type="button" onClick={() => deleteRow("home_fahrzeuge", modal.form.id, modal.form.name || "Fahrzeug")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-card-sm border border-red-500/25 bg-red-500/[0.06] px-4 text-sm font-semibold text-red-500 transition hover:bg-red-500/10"><Trash2 size={16} /> {t("photos.deleteVehicle")}</button> : null}
              </>
            ) : null}

            {modal.type === "expense" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <LocalizedDateField label="Datum" required value={modal.form.datum} onChange={(value) => updateModal("datum", value)} onValidityChange={(valid) => updateDateValidity("datum", valid)} error={formErrors.datum} />
                <Field label="Kategorie"><select className={inputClass} value={modal.form.kategorie} onChange={(e) => updateModal("kategorie", e.target.value)}>{["Versicherung","Steuer","Parken","Maut","Reifen","Zubehoer","Sonstiges"].map((value) => <option key={value} value={value}>{expenseCategoryLabel(value)}</option>)}</select></Field>
                <Field label="Beschreibung" required error={formErrors.beschreibung} className="md:col-span-2"><input className={inputClass} value={modal.form.beschreibung || ""} onChange={(e) => updateModal("beschreibung", e.target.value)} /></Field>
                <Field label="Betrag (EUR)" required error={formErrors.betrag}><input className={inputClass} type="number" min="0" step="0.01" value={modal.form.betrag || ""} onChange={(e) => updateModal("betrag", e.target.value)} /></Field>
                <Field label="Dokument"><select className={inputClass} value={modal.form.dokument_id || ""} onChange={(e) => updateModal("dokument_id", e.target.value)}><option value="">Kein Dokument</option>{documentOptions}</select></Field>
                <label className="flex min-h-11 items-center gap-3 rounded-card-sm border border-light-border px-3 text-sm md:col-span-2 dark:border-dark-border"><input type="checkbox" checked={Boolean(modal.form.mirrorToBudget)} onChange={(e) => updateModal("mirrorToBudget", e.target.checked)} /> Ins allgemeine Budget übernehmen</label>
                <Field label="Notizen" className="md:col-span-2"><textarea className={`${inputClass} py-3`} rows={3} value={modal.form.notizen || ""} onChange={(e) => updateModal("notizen", e.target.value)} /></Field>
              </div>
            ) : null}

            {modal.type === "fuel" ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <LocalizedDateField label="Datum" required value={modal.form.datum} onChange={(value) => updateModal("datum", value)} onValidityChange={(valid) => updateDateValidity("datum", valid)} error={formErrors.datum} />
                <Field label="Betrag (EUR)" required error={formErrors.betrag}><input className={inputClass} type="number" min="0" step="0.01" value={modal.form.betrag || ""} onChange={(e) => updateModal("betrag", e.target.value)} /></Field>
                <Field label="Kilometerstand" required error={formErrors.kilometerstand}><input className={inputClass} type="number" min="0" value={modal.form.kilometerstand || ""} onChange={(e) => updateModal("kilometerstand", e.target.value)} /></Field>
                <Field label="Tankstelle"><input className={inputClass} value={modal.form.tankstelle || ""} onChange={(e) => updateModal("tankstelle", e.target.value)} /></Field>
                <Field label="Liter" error={formErrors.liter}><input className={inputClass} type="number" min="0" max="500" step="0.001" value={modal.form.liter || ""} onChange={(e) => updateModal("liter", e.target.value)} /></Field>
                <Field label="Preis / Liter" error={formErrors.preis_pro_liter}><input className={inputClass} type="number" min="0" max="20" step="0.001" value={modal.form.preis_pro_liter || ""} onChange={(e) => updateModal("preis_pro_liter", e.target.value)} /></Field>
                <Field label="Kraftstoff"><input className={inputClass} value={modal.form.kraftstoffart || ""} onChange={(e) => updateModal("kraftstoffart", e.target.value)} /></Field>
                <Field label="Dokument"><select className={inputClass} value={modal.form.dokument_id || ""} onChange={(e) => updateModal("dokument_id", e.target.value)}><option value="">Kein Dokument</option>{documentOptions}</select></Field>
                <div className="md:col-span-2 lg:col-span-3">
                  <TankStatusField value={modal.form.tankstatus} onChange={(value) => updateModal("tankstatus", value)} error={formErrors.tankstatus} />
                </div>
                <Field label="Notizen" className="md:col-span-2 lg:col-span-3"><textarea className={`${inputClass} py-3`} rows={3} value={modal.form.notizen || ""} onChange={(e) => updateModal("notizen", e.target.value)} /></Field>
              </div>
            ) : null}

            {modal.type === "service" ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Typ"><select className={inputClass} value={modal.form.typ} onChange={(e) => updateModal("typ", e.target.value)}>{["Service","Oelwechsel","Reparatur","Pickerl","Reifenwechsel"].map((value) => <option key={value} value={value}>{serviceTypeLabel(value)}</option>)}</select></Field>
                <LocalizedDateField label="Datum" required value={modal.form.datum} onChange={(value) => updateModal("datum", value)} onValidityChange={(valid) => updateDateValidity("datum", valid)} error={formErrors.datum} />
                <Field label="Kilometerstand" error={formErrors.kilometerstand}><input className={inputClass} type="number" min="0" max="9999999" value={modal.form.kilometerstand || ""} onChange={(e) => updateModal("kilometerstand", e.target.value)} /></Field>
                <Field label="Kosten" error={formErrors.kosten}><input className={inputClass} type="number" min="0" step="0.01" value={modal.form.kosten || ""} onChange={(e) => updateModal("kosten", e.target.value)} /></Field>
                <Field label="Werkstatt"><input className={inputClass} value={modal.form.werkstatt || ""} onChange={(e) => updateModal("werkstatt", e.target.value)} /></Field>
                <Field label="Dokument"><select className={inputClass} value={modal.form.dokument_id || ""} onChange={(e) => updateModal("dokument_id", e.target.value)}><option value="">Kein Dokument</option>{documentOptions}</select></Field>
                <LocalizedDateField label="Nächste Fälligkeit" value={modal.form.naechste_faelligkeit_datum || ""} onChange={(value) => updateModal("naechste_faelligkeit_datum", value)} onValidityChange={(valid) => updateDateValidity("naechste_faelligkeit_datum", valid)} error={formErrors.naechste_faelligkeit_datum} />
                <Field label="Nächste Fälligkeit (km)"><input className={inputClass} type="number" min="0" value={modal.form.naechste_faelligkeit_km || ""} onChange={(e) => updateModal("naechste_faelligkeit_km", e.target.value)} /></Field>
                <Field label="Beschreibung" className="md:col-span-2 lg:col-span-3"><textarea className={`${inputClass} py-3`} rows={3} value={modal.form.beschreibung || ""} onChange={(e) => updateModal("beschreibung", e.target.value)} /></Field>
              </div>
            ) : null}

            {modal.type === "tire" ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Saison"><select className={inputClass} value={modal.form.saison} onChange={(e) => updateModal("saison", e.target.value)}>{["Sommerreifen","Winterreifen","Ganzjahresreifen"].map((value) => <option key={value}>{value}</option>)}</select></Field>
                <Field label="Marke"><input className={inputClass} value={modal.form.marke || ""} onChange={(e) => updateModal("marke", e.target.value)} /></Field>
                <Field label="Größe"><input className={inputClass} placeholder="205/55 R16" value={modal.form.groesse || ""} onChange={(e) => updateModal("groesse", e.target.value)} /></Field>
                <Field label="Profiltiefe (mm)" error={formErrors.profiltiefe}><input className={inputClass} type="number" min="0" max="30" step="0.1" value={modal.form.profiltiefe || ""} onChange={(e) => updateModal("profiltiefe", e.target.value)} /></Field>
                <Field label="Austausch ab (mm)"><input className={inputClass} type="number" min="0" step="0.1" value={modal.form.austausch_faellig_ab_mm || ""} onChange={(e) => updateModal("austausch_faellig_ab_mm", e.target.value)} /></Field>
                <Field label="Laufleistung (km)"><input className={inputClass} type="number" min="0" value={modal.form.laufleistung_km || ""} onChange={(e) => updateModal("laufleistung_km", e.target.value)} /></Field>
                <LocalizedDateField label="Kaufdatum" value={modal.form.kaufdatum || ""} onChange={(value) => updateModal("kaufdatum", value)} onValidityChange={(valid) => updateDateValidity("kaufdatum", valid)} error={formErrors.kaufdatum} />
                <Field label="Kaufpreis"><input className={inputClass} type="number" min="0" step="0.01" value={modal.form.kaufpreis || ""} onChange={(e) => updateModal("kaufpreis", e.target.value)} /></Field>
                <Field label="Herstellungsjahr" error={formErrors.herstellungsjahr}><input className={inputClass} type="number" min="1980" max={new Date().getFullYear() + 1} value={modal.form.herstellungsjahr || ""} onChange={(e) => updateModal("herstellungsjahr", e.target.value)} /></Field>
                <Field label="DOT-Nummer"><input className={inputClass} value={modal.form.dot_nummer || ""} onChange={(e) => updateModal("dot_nummer", e.target.value)} /></Field>
                <Field label="Lagerort"><input className={inputClass} value={modal.form.lagerort || ""} onChange={(e) => updateModal("lagerort", e.target.value)} /></Field>
                <LocalizedDateField label="Nächster Wechsel" value={modal.form.naechster_wechsel || ""} onChange={(value) => updateModal("naechster_wechsel", value)} onValidityChange={(valid) => updateDateValidity("naechster_wechsel", valid)} error={formErrors.naechster_wechsel} />
                <Field label="Zustandsfoto" className="md:col-span-2 lg:col-span-3"><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-card-sm border border-dashed border-light-border px-3 text-center text-sm text-light-text-secondary dark:border-dark-border dark:text-dark-text-secondary"><Upload size={20} /><span className="mt-2 max-w-full break-all">{modal.form.photo?.name || "Foto auswählen"}</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => updateModal("photo", e.target.files?.[0] || null)} /></label></Field>
              </div>
            ) : null}

            {modal.type === "task" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Titel" required error={formErrors.titel} className="md:col-span-2"><input className={inputClass} value={modal.form.titel || ""} onChange={(e) => updateModal("titel", e.target.value)} /></Field>
                <Field label="Status"><select className={inputClass} value={modal.form.status} onChange={(e) => updateModal("status", e.target.value)}><option value="offen">Offen</option><option value="in_bearbeitung">In Bearbeitung</option><option value="erledigt">Erledigt</option></select></Field>
                <Field label="Priorität"><select className={inputClass} value={modal.form.prioritaet} onChange={(e) => updateModal("prioritaet", e.target.value)}><option value="niedrig">Niedrig</option><option value="mittel">Mittel</option><option value="hoch">Hoch</option></select></Field>
                <LocalizedDateField label="Fällig am" value={modal.form.faellig_am || ""} onChange={(value) => updateModal("faellig_am", value)} onValidityChange={(valid) => updateDateValidity("faellig_am", valid)} error={formErrors.faellig_am} />
                <Field label="Fällig bei Kilometerstand"><input className={inputClass} type="number" min="0" value={modal.form.kilometerstand_faellig || ""} onChange={(e) => updateModal("kilometerstand_faellig", e.target.value)} /></Field>
                <Field label="Beschreibung" className="md:col-span-2"><textarea className={`${inputClass} py-3`} rows={3} value={modal.form.beschreibung || ""} onChange={(e) => updateModal("beschreibung", e.target.value)} /></Field>
              </div>
            ) : null}

            {modal.type === "part" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Teil" required error={formErrors.name}><input className={inputClass} value={modal.form.name || ""} onChange={(e) => updateModal("name", e.target.value)} /></Field>
                <Field label="Teilenummer"><input className={inputClass} value={modal.form.teilenummer || ""} onChange={(e) => updateModal("teilenummer", e.target.value)} /></Field>
                <Field label="Aufgabe"><select className={inputClass} value={modal.form.aufgabe_id || ""} onChange={(e) => updateModal("aufgabe_id", e.target.value)}><option value="">Keine Aufgabe</option>{filtered.tasks.map((row) => <option key={row.id} value={row.id}>{row.titel}</option>)}</select></Field>
                <Field label="Status"><select className={inputClass} value={modal.form.status} onChange={(e) => updateModal("status", e.target.value)}><option value="benoetigt">Benötigt</option><option value="bestellt">Bestellt</option><option value="vorhanden">Vorhanden</option><option value="verbaut">Verbaut</option></select></Field>
                <Field label="Menge" error={formErrors.menge}><input className={inputClass} type="number" min="0.01" max="9999" step="0.01" value={modal.form.menge || ""} onChange={(e) => updateModal("menge", e.target.value)} /></Field>
                <Field label="Einzelpreis"><input className={inputClass} type="number" min="0" step="0.01" value={modal.form.einzelpreis || ""} onChange={(e) => updateModal("einzelpreis", e.target.value)} /></Field>
                <Field label="Bezugsquelle"><input className={inputClass} value={modal.form.bezugsquelle || ""} onChange={(e) => updateModal("bezugsquelle", e.target.value)} /></Field>
                <Field label="Dokument"><select className={inputClass} value={modal.form.dokument_id || ""} onChange={(e) => updateModal("dokument_id", e.target.value)}><option value="">Kein Dokument</option>{documentOptions}</select></Field>
              </div>
            ) : null}
          </form>
        </EditorShell>
      ) : null}
    </div>
  );
}
