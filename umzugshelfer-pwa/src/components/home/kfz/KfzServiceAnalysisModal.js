import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, FileSearch, Loader2, Plus, Save, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../../contexts/LocaleContext";
import { createKfzDocumentUrl } from "../../../utils/kfzData";
import { formatKfzDisplayText } from "../../../utils/kfzPresentation";
import { notifyHouseholdEvent } from "../../../utils/pushNotifications";
import {
  analyzeKfzServiceDocument,
  calculatePositionDifference,
  discardKfzServiceDocument,
  saveKfzServiceAnalysis,
  uploadKfzServiceDocument,
} from "../../../utils/kfzServiceAnalysis";
import ModalShell from "../../ui/ModalShell";
import LocalizedDateField from "./LocalizedDateField";
import { ServicePositionChecklist } from "./KfzServiceChecklist";

const inputClass = "w-full min-h-11 rounded-card-sm border border-light-border bg-white/60 px-3 text-sm text-light-text-main outline-none backdrop-blur-md transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-white/10 dark:bg-white/[0.045] dark:text-dark-text-main";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-4 text-sm font-semibold text-white shadow-glow-primary transition hover:bg-primary-600 disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-card-sm border border-light-border bg-white/45 px-4 text-sm font-semibold backdrop-blur-md transition hover:bg-white/70 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]";
const money = (value) => new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(value || 0));

const Field = ({ label, required, warning, children }) => (
  <label className="block">
    <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
      {label}{required ? <span className="text-red-500">*</span> : null}
      {warning ? <AlertTriangle size={13} className="text-amber-500" /> : null}
    </span>
    {children}
  </label>
);

const emptyPosition = (index) => ({
  sortierung: index + 1,
  originaltext: null,
  beschreibung: "",
  kategorie: "sonstiges",
  menge: null,
  einheit: null,
  einzelpreis: null,
  gesamtpreis: null,
  ust_satz: null,
  rabatt_betrag: null,
  kostenlos: false,
  teilenummer: null,
  confidence: 1,
  notizen: null,
});

export default function KfzServiceAnalysisModal({
  open,
  onClose,
  onSaved,
  vehicles,
  selectedVehicleId,
  userId,
  householdId,
}) {
  const { t } = useTranslation("kfz");
  const { locale } = useLocale();
  const reducedMotion = useReducedMotion();
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const busyRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [stage, setStage] = useState("upload");
  const [document, setDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [form, setForm] = useState(null);
  const [positions, setPositions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [createInvoice, setCreateInvoice] = useState(false);
  const [createBudget, setCreateBudget] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dateValidity, setDateValidity] = useState({ datum: true, leistungsdatum: true });
  const operationId = useRef(0);

  useEffect(() => () => {
    operationId.current += 1;
  }, []);

  useEffect(() => {
    if (!open) return;
    setStage("upload");
    setSelectedFile(null);
    setAttempted(false);
    setDocument(null);
    setPreviewUrl("");
    setAnalysis(null);
    setForm(null);
    setPositions([]);
    setReminders([]);
    setCreateInvoice(false);
    setCreateBudget(false);
    setError("");
    setDateValidity({ datum: true, leistungsdatum: true });
  }, [open]);

  const fieldWarning = (key) => analysis && Number(analysis.field_confidence?.[key] ?? 1) < 0.7;
  const difference = useMemo(() => calculatePositionDifference(positions, form?.kosten), [form?.kosten, positions]);

  const handleFile = async (file) => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setSelectedFile(file);
    setBusy(true);
    setError("");
    setStage("analysis");
    const currentOperation = operationId.current + 1;
    operationId.current = currentOperation;
    let uploaded;
    try {
      uploaded = await uploadKfzServiceDocument({ file, userId, householdId });
      if (operationId.current !== currentOperation) {
        await discardKfzServiceDocument(uploaded);
        return;
      }
      setDocument(uploaded);
      const url = await createKfzDocumentUrl(uploaded);
      if (operationId.current !== currentOperation) {
        await discardKfzServiceDocument(uploaded);
        return;
      }
      setPreviewUrl(url || "");
      const result = await analyzeKfzServiceDocument({ documentId: uploaded.id, locale });
      if (operationId.current !== currentOperation) {
        await discardKfzServiceDocument(uploaded);
        return;
      }
      const service = result.service || {};
      setAnalysis(result);
      setForm({
        ...service,
        beschreibung: formatKfzDisplayText(service.beschreibung),
        fahrzeug_id: service.fahrzeug_id || selectedVehicleId || "",
        datum: service.datum || new Date().toISOString().slice(0, 10),
        leistungsdatum: service.leistungsdatum || "",
        kilometerstand: service.kilometerstand ?? "",
        kosten: service.kosten ?? "",
        netto: service.netto ?? "",
        steuer: service.steuer ?? "",
        naechste_faelligkeit_datum: service.naechste_faelligkeit_datum || "",
        naechste_faelligkeit_km: service.naechste_faelligkeit_km ?? "",
        notizen: "",
      });
      setPositions((result.positions || []).map((position) => ({
        ...position,
        beschreibung: formatKfzDisplayText(position.beschreibung),
      })));
      setReminders(result.reminders || []);
      setStage("review");
    } catch (uploadError) {
      if (uploaded) await discardKfzServiceDocument(uploaded);
      if (operationId.current !== currentOperation) return;
      setDocument(null);
      setError(uploadError?.message || t("analysis.errors.analyse"));
      setStage("upload");
    } finally {
      if (operationId.current === currentOperation) { busyRef.current = false; setBusy(false); }
    }
  };

  const cancel = async () => {
    if (busyRef.current) return;
    if (document) {
      busyRef.current = true;
      setBusy(true);
      try {
        await discardKfzServiceDocument(document);
      } catch (cleanupError) {
        setError(cleanupError?.message || t("analysis.errors.cleanup"));
        busyRef.current = false;
        setBusy(false);
        return;
      }
      busyRef.current = false;
      setBusy(false);
    }
    onClose();
  };

  const save = async () => {
    if (busyRef.current) return;
    setAttempted(true);
    if (!form?.fahrzeug_id || !form?.datum || Object.values(dateValidity).some((valid) => !valid)) {
      setError(t("analysis.errors.required"));
      requestAnimationFrame(() => {
        const invalid = window.document.querySelector('.kfz-service-dialog [aria-invalid="true"]');
        if (invalid) { for (let parent=invalid.parentElement;parent;parent=parent.parentElement) if(parent.tagName==="DETAILS") parent.open=true; invalid.focus(); invalid.scrollIntoView?.({block:"nearest"}); }
      });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const serviceId = await saveKfzServiceAnalysis({
        household_id: householdId,
        dokument_id: document.id,
        fahrzeug_id: form.fahrzeug_id,
        typ: form.typ || "Service",
        datum: form.datum,
        leistungsdatum: form.leistungsdatum || null,
        kilometerstand: form.kilometerstand === "" ? null : Number(form.kilometerstand),
        kosten: form.kosten === "" ? null : Number(form.kosten),
        netto: form.netto === "" ? null : Number(form.netto),
        steuer: form.steuer === "" ? null : Number(form.steuer),
        waehrung: form.waehrung || "EUR",
        werkstatt: form.werkstatt || null,
        beschreibung: form.beschreibung || null,
        rechnungsnummer: form.rechnungsnummer || null,
        zahlungsart: form.zahlungsart || null,
        naechste_faelligkeit_datum: form.naechste_faelligkeit_datum || null,
        naechste_faelligkeit_km: form.naechste_faelligkeit_km === "" ? null : Number(form.naechste_faelligkeit_km),
        notizen: form.notizen || null,
        positionen: positions,
        reminders,
        create_invoice: createInvoice,
        create_budget: createBudget,
        confidence: analysis.overall_confidence,
        raw_text: analysis.raw_text,
        analyse_meta: {
          source: "ki_serviceanalyse",
          extractor: analysis.extractor,
          overall_confidence: analysis.overall_confidence,
          field_confidence: analysis.field_confidence,
          warranty_notes: analysis.warranty_notes,
          safety_notes: analysis.safety_notes,
          warnings: analysis.warnings,
        },
      });
      await notifyHouseholdEvent({
        userId,
        table: "home_fahrzeug_services",
        action: "erstellt",
        recordName: form.beschreibung || form.typ || "Kfz-Service",
        recordId: serviceId,
        url: "/home/kfz",
      });
      setDocument(null);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError?.message || t("analysis.errors.save"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const updatePosition = (index, key, value) => setPositions((current) => current.map((position, positionIndex) => (
    positionIndex === index ? { ...position, [key]: value } : position
  )));
  const removePosition = (index) => setPositions((current) => current
    .filter((_, positionIndex) => positionIndex !== index)
    .map((position, positionIndex) => ({ ...position, sortierung: positionIndex + 1 })));

  const content = (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-w-0 max-w-full space-y-5 overflow-x-clip"
    >
      {error ? <div role="alert" className="rounded-card-sm border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
      <div className="grid grid-cols-3 gap-2">
        {["upload", "analysis", "review"].map((step, index) => {
          const activeIndex = ["upload", "analysis", "review"].indexOf(stage);
          return <span key={step} className={`h-1.5 overflow-hidden rounded-full ${index <= activeIndex ? "bg-primary-500/25" : "bg-light-border/60 dark:bg-white/10"}`}><motion.span initial={false} animate={{ scaleX: index <= activeIndex ? 1 : 0 }} style={{transformOrigin:"left"}} transition={{ duration: reducedMotion ? 0 : .35 }} className="block h-full rounded-full bg-gradient-to-r from-primary-500 to-secondary-400" /></span>;
        })}
      </div>
      <React.Fragment>
      {stage === "upload" ? (
        <div className="space-y-3">
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("analysis.uploadHint")}</p>
          <button type="button" onClick={() => cameraInput.current?.click()} className={`${primary} min-h-12 w-full`}>{t("analysis.photo")}</button>
          <button type="button" onClick={() => fileInput.current?.click()} className={`${secondary} min-h-12 w-full`}><Upload size={18}/>{t("analysis.chooseFile")}</button>
          <input ref={fileInput} aria-label={t("analysis.chooseFile")} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={event=>{handleFile(event.target.files?.[0]);event.target.value="";}}/>
          <input ref={cameraInput} aria-label={t("analysis.photo")} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={event=>{handleFile(event.target.files?.[0]);event.target.value="";}}/>
          {selectedFile && error ? <div className="rounded-card-sm border border-light-border p-3"><p className="break-all text-sm">{selectedFile.name}</p><button type="button" className={`${secondary} mt-2 w-full`} onClick={()=>handleFile(selectedFile)}>{t("analysis.retry")}</button></div> : null}
        </div>
      ) : null}
      {stage === "analysis" ? (
        <motion.div key="analysis" initial={reducedMotion ? false : { opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-card border border-primary-500/15 bg-primary-500/[0.035] text-center">
          <div className="hidden" />
          <Loader2 size={32} className="relative animate-spin text-primary-500" />
          <strong role="status" aria-live="polite" className="mt-4">{t("analysis.running")}</strong>
          <span className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("analysis.runningHint")}</span>
        </motion.div>
      ) : null}
      {stage === "review" && form ? (
        <motion.div key="review" initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <details className="order-2 min-w-0 rounded-card-sm border border-light-border bg-light-card p-3 lg:order-none dark:border-dark-border dark:bg-canvas-2">
              <summary className="cursor-pointer min-h-11 text-sm font-semibold">{t("analysis.preview")}</summary>
              <div className="mb-2 flex min-w-0 items-start gap-2 break-all text-sm font-semibold"><FileSearch size={16} className="mt-0.5 shrink-0" /> {document?.dateiname}</div>
              {document?.datei_typ?.startsWith("image/") && previewUrl
                ? <img src={previewUrl} alt="" className="max-h-72 w-full rounded-card-sm object-contain" />
                : previewUrl ? <iframe src={previewUrl} title={document?.dateiname} sandbox="" className="h-72 w-full rounded-card-sm border-0" /> : null}
              <div className="mt-3 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {t("analysis.confidence", { value: Math.round(Number(analysis.overall_confidence || 0) * 100) })}
              </div>
            </details>
            <div className="order-1 grid min-w-0 content-start gap-3 md:grid-cols-2 lg:order-none">
              <Field label={t("analysis.fields.vehicle")} required warning={!form.fahrzeug_id}>
                <select aria-invalid={attempted && !form.fahrzeug_id} className={inputClass} value={form.fahrzeug_id} onChange={(event) => setForm({ ...form, fahrzeug_id: event.target.value })}>
                  <option value="">{t("analysis.fields.selectVehicle")}</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{[vehicle.name, vehicle.kennzeichen].filter(Boolean).join(" - ")}</option>)}
                </select>
              </Field>
              <Field label={t("analysis.fields.type")}><select className={inputClass} value={form.typ} onChange={(event) => setForm({ ...form, typ: event.target.value })}>{["Service","Oelwechsel","Reparatur","Pickerl","Reifenwechsel"].map((value) => <option key={value} value={value}>{formatKfzDisplayText(value)}</option>)}</select></Field>
              <LocalizedDateField label={t("analysis.fields.invoiceDate")} required error={attempted && !form.datum ? t("analysis.errors.required") : ""} value={form.datum} onChange={(value) => setForm({ ...form, datum: value })} onValidityChange={(valid) => setDateValidity((current) => ({ ...current, datum: valid }))} />
              <Field label={t("analysis.fields.workshop")} warning={fieldWarning("workshop")}><input className={inputClass} value={form.werkstatt || ""} onChange={(event) => setForm({ ...form, werkstatt: event.target.value })} /></Field>
              <Field label={t("analysis.fields.mileage")} warning={fieldWarning("mileage")}><input className={inputClass} type="number" inputMode="numeric" min="0" value={form.kilometerstand} onChange={(event) => setForm({ ...form, kilometerstand: event.target.value })} /></Field>
              <Field label={t("analysis.fields.gross")} warning={fieldWarning("gross")}><input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" value={form.kosten} onChange={(event) => setForm({ ...form, kosten: event.target.value })} /></Field>
              <Field label={t("analysis.fields.summary")}><textarea className={`${inputClass} py-3`} rows={3} value={form.beschreibung || ""} onChange={(event) => setForm({ ...form, beschreibung: event.target.value })} /></Field>
            </div>
          </div>

          <details open={fieldWarning("invoice_number")} className="rounded-card-sm border border-light-border p-3 dark:border-dark-border"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t("analysis.moreDetails")}</summary><div className="grid gap-3 md:grid-cols-2">
              <LocalizedDateField label={t("analysis.fields.serviceDate")} value={form.leistungsdatum} onChange={(value) => setForm({ ...form, leistungsdatum: value })} onValidityChange={(valid) => setDateValidity((current) => ({ ...current, leistungsdatum: valid }))} />
              <Field label={t("analysis.fields.invoiceNumber")} warning={fieldWarning("invoice_number")}><input className={inputClass} value={form.rechnungsnummer || ""} onChange={(event) => setForm({ ...form, rechnungsnummer: event.target.value })} /></Field>
              <Field label={t("analysis.fields.net")}><input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" value={form.netto} onChange={(event) => setForm({ ...form, netto: event.target.value })} /></Field>
              <Field label={t("analysis.fields.tax")}><input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" value={form.steuer} onChange={(event) => setForm({ ...form, steuer: event.target.value })} /></Field>
              <Field label={t("analysis.fields.payment")}><input className={inputClass} value={form.zahlungsart || ""} onChange={(event) => setForm({ ...form, zahlungsart: event.target.value })} /></Field>
</div></details>

          {analysis.warnings?.length || (difference != null && Math.abs(difference) > 0.05) ? (
            <div className="rounded-card-sm border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {(analysis.warnings || []).map((warning) => <div key={warning}>{warning}</div>)}
              {difference != null && Math.abs(difference) > 0.05 ? <div>{t("analysis.sumDifference", { value: difference.toFixed(2) })}</div> : null}
            </div>
          ) : null}

          <section>
            <div className="mb-3 flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="break-words font-semibold">{t("analysis.positions")}</h3>
              <button type="button" className={`${secondary} w-full md:w-auto`} onClick={() => setPositions((current) => [...current, emptyPosition(current.length)])}><Plus size={15} /> {t("analysis.addPosition")}</button>
            </div>
            <ServicePositionChecklist
              positions={positions}
              money={money}
              editable
              onChange={updatePosition}
              onRemove={removePosition}
              inputClass={inputClass}
            />
          </section>

          {(analysis.warranty_notes?.length || analysis.safety_notes?.length) ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <div className="rounded-card-sm border border-light-border bg-white/45 p-3 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.035]"><h3 className="font-semibold">{t("analysis.warranty")}</h3>{analysis.warranty_notes?.map((note) => <p key={note} className="mt-2 text-sm">{note}</p>)}</div>
              <div className="rounded-card-sm border border-amber-300 bg-amber-500/[0.06] p-3 dark:border-amber-500/20"><h3 className="font-semibold">{t("analysis.safety")}</h3>{analysis.safety_notes?.map((note) => <p key={note} className="mt-2 text-sm">{note}</p>)}</div>
            </div>
          ) : null}

          <section>
            <h3 className="mb-3 font-semibold">{t("analysis.reminders")}</h3>
            <div className="space-y-2">{reminders.length ? reminders.map((reminder, index) => (
              <label key={`${reminder.titel}-${index}`} className="flex gap-3 rounded-card-sm border border-light-border p-3 dark:border-dark-border">
                <input type="checkbox" checked={Boolean(reminder.selected)} onChange={(event) => setReminders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} />
                <span><strong className="text-sm">{reminder.titel}</strong><span className="mt-1 block text-xs text-light-text-secondary dark:text-dark-text-secondary">{[reminder.faellig_am, reminder.kilometerstand_faellig ? `${reminder.kilometerstand_faellig} km` : null].filter(Boolean).join(" - ")}</span></span>
              </label>
            )) : <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("analysis.noReminders")}</p>}</div>
          </section>

          <div className="grid min-w-0 gap-2 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-card-sm border border-light-border px-3 text-sm dark:border-dark-border"><input type="checkbox" checked={createInvoice} onChange={(event) => setCreateInvoice(event.target.checked)} /> {t("analysis.createInvoice")}</label>
            <label className="flex min-h-11 items-center gap-3 rounded-card-sm border border-light-border px-3 text-sm dark:border-dark-border"><input type="checkbox" checked={createBudget} onChange={(event) => setCreateBudget(event.target.checked)} /> {t("analysis.createBudget")}</label>
          </div>
        </motion.div>
      ) : null}
      </React.Fragment>
    </motion.div>
  );

  const footer = (
    <div className={`grid w-full gap-2 kfz-service-actions ${stage === "review" ? "grid-cols-2" : "grid-cols-1"}`}>
      <button type="button" className={`${secondary} flex-1`} onClick={cancel} disabled={busy}><X size={16} /> {t("cancel")}</button>
      {stage === "review" ? <button type="button" className={`${primary} flex-1`} onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("analysis.confirm")}</button> : null}
    </div>
  );

  return <ModalShell open={open} onClose={cancel} title={t("analysis.title")} closeOnEscape={!busy} closeOnBackdrop={!busy} maxWidthClass="max-w-6xl" overlayClassName="kfz-service-overlay" dialogClassName="kfz-service-dialog" footer={footer}>{content}</ModalShell>;
}
