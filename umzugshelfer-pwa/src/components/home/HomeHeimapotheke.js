import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Bot,
  Calendar,
  Camera,
  ChevronDown,
  CheckCircle,
  Edit2,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  MapPin,
  Package,
  PackagePlus,
  Pill,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import useViewport from "../../hooks/useViewport";
import MobileFab from "../ui/MobileFab";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { cleanKiJsonResponse, getKiClient } from "../../utils/kiClient";
import { extractTextFromFile } from "../../utils/rechnungAnalyse";
import { compressImage, fileToBase64 } from "../../utils/imageTools";
import {
  MEDICATION_CATEGORIES,
  MEDICATION_FORMS,
  buildLeafletAnalysisPrompt,
  buildMedicationPayload,
  findExistingMedication,
  getMedicationStatus,
  sanitizeLeafletSummary,
  searchAustrianMedicines,
} from "../../utils/heimapotheke";
import GlassSurface, {
  glassCollapseVariants,
  glassPageVariants,
} from "../ui/GlassSurface";

// Constants

const emptyForm = {
  name: "",
  wirkstoff: "",
  darreichungsform: "",
  packungsgroesse: "",
  bestand: 1,
  mindestbestand: 1,
  ablaufdatum: "",
  lagerort: "",
  kategorie: "Sonstiges",
  notizen: "",
  kaufdatum: "",
  preis: "",
  haendler: "",
  beipackzettel_url: "",
  offizielle_quelle: "",
};

const MEDICATION_PHOTO_PROMPT = `Analysiere das Foto einer Medikamentenpackung, Tube, Flasche oder Blisterpackung. Gib ausschliesslich ein JSON-Objekt zurueck, kein Markdown und keine Erklaerung:

{
  "medikamente": [
    {
      "name": "Handelsname exakt wie sichtbar oder null",
      "wirkstoff": "Wirkstoff(e) falls sichtbar oder null",
      "darreichungsform": "Tabletten | Kapseln | Tropfen | Saft | Salbe | Creme | Gel | Spray | Pflaster | Injektion | Zäpfchen | Pulver | Lösung | Sonstiges | null",
      "packungsgroesse": "Packungsgröße/Stärke falls sichtbar, z.B. 50 %, 20 Tabletten, 500 mg oder null",
      "ablaufdatum": "YYYY-MM-DD falls eindeutig sichtbar, sonst null",
      "pzn": "PZN oder Pharmazentralnummer falls sichtbar, sonst null",
      "hersteller": "Hersteller/Zulassungsinhaber falls sichtbar, sonst null",
      "sichtbarer_text": "kurzer relevanter OCR-Text",
      "confidence": 0.0
    }
  ]
}

Regeln:
- Nur Medikamente/Arzneimittel erfassen, keine Dosierungsempfehlungen geben.
- Falls mehrere Packungen sichtbar sind, bis zu 5 Eintraege liefern.
- Unsichere oder abgeschnittene Namen nicht erfinden; confidence entsprechend niedriger setzen.
- Umlaute korrekt schreiben.`;

const STATUS_CFG = {
  expired:  { label: "Abgelaufen",     badge: "border-red-500/30 bg-red-500/10 text-red-400",     dot: "bg-red-500",     glow: "bg-red-500/20",     icon: "text-red-400",     border: "border-red-500/20",     bg: "bg-red-500/5"     },
  expiring: { label: "Läuft bald ab",  badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",dot: "bg-amber-500",   glow: "bg-amber-500/20",   icon: "text-amber-400",   border: "border-amber-500/20", bg: "bg-amber-500/5"   },
  low:      { label: "Niedrig",        badge: "border-orange-500/30 bg-orange-500/10 text-orange-400",dot:"bg-orange-500",glow: "bg-orange-500/20",   icon: "text-orange-400",  border: "border-orange-500/20",bg: "bg-orange-500/5"  },
  ok:       { label: "OK",             badge: "border-primary-500/30 bg-primary-500/10 text-primary-500", dot: "bg-primary-500", glow: "bg-primary-500/20", icon: "text-primary-500", border: "border-primary-500/20", bg: "bg-primary-500/5" },
};

const INPUT_CLS =
  "w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:border-primary-500 transition-colors";

const normalizeFilename = (name) =>
  String(name || "beipackzettel.pdf").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");

const buildLeafletSummaryPayload = ({ medication, sourceUrl, documentName }) => ({
  zweck_laut_beipackzettel: null,
  aufbewahrung: null,
  haltbarkeit_nach_oeffnung: null,
  wichtige_warnhinweise: [],
  wann_aerztlichen_rat_einholen: [],
  nebenwirkungen_hinweis: null,
  quelle: sourceUrl || documentName || medication?.offizielle_quelle || null,
  stand_hinweis: "Automatisch angelegter Analyse-Datensatz. Bitte offiziellen Beipackzettel prüfen.",
  disclaimer: "KI-Zusammenfassung - keine medizinische Beratung. Offizielle Quelle immer prüfen.",
});

const displayValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return <span className="text-light-text-secondary dark:text-dark-text-secondary font-normal">—</span>;
  }
  return value;
};

const formatDate = (d) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return d; }
};

const applyBasgMetadata = (medication, metadata = {}) => {
  const basg = metadata.basg || metadata;
  if (!basg || typeof basg !== "object") return medication;
  return {
    ...medication,
    name: basg.product_name || medication.name,
    wirkstoff: basg.wirkstoff || medication.wirkstoff,
    darreichungsform: basg.darreichungsform || medication.darreichungsform,
    packungsgroesse: basg.packungsgroesse || medication.packungsgroesse,
    source_payload: {
      ...(medication.source_payload || {}),
      basg,
    },
  };
};

const analysisMedicationPatch = (medication, summaryPayload) => {
  if (!summaryPayload) return null;
  const patch = {};
  if (!medication.wirkstoff && summaryPayload.wirkstoff) patch.wirkstoff = summaryPayload.wirkstoff;
  if (!medication.darreichungsform && summaryPayload.darreichungsform) patch.darreichungsform = summaryPayload.darreichungsform;
  if (!medication.packungsgroesse && summaryPayload.packungsgroesse) patch.packungsgroesse = summaryPayload.packungsgroesse;
  return Object.keys(patch).length ? patch : null;
};

// Sub-components

function StatusBadge({ medication }) {
  const status = getMedicationStatus(medication);
  const cfg = STATUS_CFG[status.key] || STATUS_CFG.ok;
  return (
    <span className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

function SectionHeader({ label, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-3.5 w-0.5 rounded-full bg-primary-500 shrink-0" />
      <span className="text-[11px] uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary font-medium">
        {label}
      </span>
      {Icon && <Icon size={12} className="text-light-text-secondary dark:text-dark-text-secondary ml-auto" />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wide font-medium text-light-text-secondary dark:text-dark-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function MobileMedicationFilterSheet({
  open,
  onClose,
  category,
  onCategoryChange,
  locationFilter,
  onLocationChange,
  statusFilter,
  onStatusChange,
  locations,
  onReset,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[160] flex items-center justify-center p-4" style={{ paddingBottom: "calc(var(--mobile-bottom-offset, 0px) + 1rem)" }}>
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Filter schließen" />
      <section
        className="relative w-full max-w-md max-h-[calc(100dvh-var(--mobile-bottom-offset,0px)-2rem)] overflow-y-auto rounded-card border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-light-border bg-light-card/95 px-4 py-3 backdrop-blur dark:border-dark-border dark:bg-canvas-2/95">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary-500" />
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">Filter</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-card-sm text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
            aria-label="Filter schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <Field label="Kategorie">
            <select value={category} onChange={(e) => onCategoryChange(e.target.value)} className={`${INPUT_CLS} py-2.5`}>
              <option value="">Alle Kategorien</option>
              {MEDICATION_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </Field>
          <Field label="Lagerort">
            <select value={locationFilter} onChange={(e) => onLocationChange(e.target.value)} className={`${INPUT_CLS} py-2.5`}>
              <option value="">Alle Lagerorte</option>
              {locations.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)} className={`${INPUT_CLS} py-2.5`}>
              <option value="">Alle Status</option>
              <option value="expired">Abgelaufen</option>
              <option value="expiring">Läuft bald ab</option>
              <option value="low">Niedrig</option>
              <option value="ok">OK</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onReset}
              className="rounded-card-sm border border-light-border px-3 py-2.5 text-sm text-light-text-main hover:bg-light-hover dark:border-dark-border dark:text-dark-text-main dark:hover:bg-canvas-3"
            >
              Zurücksetzen
            </button>
            <button type="button" onClick={onClose} className="rounded-pill bg-primary-500 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-600">
              Fertig
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MedicationForm({ initial, onCancel, onSave, saving, onSearchSelect, isMobile = false }) {
  const [form, setForm] = useState({ ...emptyForm, ...(initial || {}) });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const runSearch = async () => {
    const query = searchQuery.trim() || form.name.trim();
    if (!query) return;
    setSearching(true);
    try {
      setSearchResults(await searchAustrianMedicines(query));
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result) => {
    const next = {
      ...form,
      name: result.name || form.name,
      wirkstoff: result.wirkstoff || form.wirkstoff,
      darreichungsform: result.darreichungsform || form.darreichungsform,
      packungsgroesse: result.packungsgroesse || form.packungsgroesse,
      beipackzettel_url: result.beipackzettel_url || form.beipackzettel_url,
      offizielle_quelle: result.offizielle_quelle || form.offizielle_quelle,
      source_payload: result.source_payload || form.source_payload,
    };
    setForm(next);
    onSearchSelect?.(result);
  };

  const overlayClass = isMobile
    ? "fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    : "mobile-modal-overlay fixed inset-0 z-[120] flex justify-center bg-black/60 backdrop-blur-sm p-4";
  const dialogClass = isMobile
    ? "relative flex w-full max-w-md min-h-0 max-h-[calc(100dvh-var(--mobile-bottom-offset,0px)-2rem)] flex-col overflow-hidden rounded-card border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2"
    : "mobile-modal-dialog relative flex w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3";
  const bodyClass = isMobile
    ? "mobile-modal-body flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
    : "mobile-modal-body flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4";

  return (
    <div className={overlayClass} style={isMobile ? { paddingBottom: "calc(var(--mobile-bottom-offset, 0px) + 1rem)" } : undefined}>
      <div className={dialogClass}>
        {/* Gradient top border */}
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-card bg-gradient-to-r from-primary-500 to-secondary-500 z-10" />

        {/* Header — sticky */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-light-border dark:border-dark-border px-4 sm:px-5 pt-5 sm:pt-6 pb-4">
          <div>
            <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
              {initial?.id ? "Medikament bearbeiten" : "Medikament hinzufügen"}
            </h2>
            <p className="mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Nur zur Organisation – keine medizinische Beratung.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded-full p-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
            aria-label="Schließen"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className={bodyClass}>
          {/* Official search */}
          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
            <SectionHeader label="Offizielle Medikamentensuche" icon={Search} />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Wirkstoff oder Handelsname..."
                className={INPUT_CLS}
              />
              <button
                type="button"
                onClick={runSearch}
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Suchen
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => chooseResult(result)}
                    className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-3 text-left hover:border-primary-500/60 hover:shadow-elevation-1 transition-all"
                  >
                    <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
                      {result.name}
                    </span>
                    <span className="block mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {result.offizielle_quelle}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="grid gap-3 rounded-card-sm border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-canvas-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SectionHeader label="Stammdaten & Bestand" />
            </div>
            <Field label="Name *">
              <input value={form.name} onChange={(e) => update("name", e.target.value)} className={INPUT_CLS} placeholder="Handelsname" />
            </Field>
            <Field label="Wirkstoff">
              <input value={form.wirkstoff || ""} onChange={(e) => update("wirkstoff", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Darreichungsform">
              <select value={form.darreichungsform || ""} onChange={(e) => update("darreichungsform", e.target.value)} className={INPUT_CLS}>
                <option value="">Nicht angegeben</option>
                {MEDICATION_FORMS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </Field>
            <Field label="Packungsgröße">
              <input value={form.packungsgroesse || ""} onChange={(e) => update("packungsgroesse", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Bestand">
              <input type="number" min="0" step="0.5" value={form.bestand ?? 0} onChange={(e) => update("bestand", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Mindestbestand">
              <input type="number" min="0" step="0.5" value={form.mindestbestand ?? 1} onChange={(e) => update("mindestbestand", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Ablaufdatum">
              <input type="date" value={form.ablaufdatum || ""} onChange={(e) => update("ablaufdatum", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Lagerort">
              <input value={form.lagerort || ""} onChange={(e) => update("lagerort", e.target.value)} className={INPUT_CLS} placeholder="z.B. Badezimmerschrank" />
            </Field>
            <Field label="Kategorie">
              <select value={form.kategorie || "Sonstiges"} onChange={(e) => update("kategorie", e.target.value)} className={INPUT_CLS}>
                {MEDICATION_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </Field>
            <Field label="Kaufdatum">
              <input type="date" value={form.kaufdatum || ""} onChange={(e) => update("kaufdatum", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Preis (€)">
              <input type="number" min="0" step="0.01" value={form.preis || ""} onChange={(e) => update("preis", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Händler">
              <input value={form.haendler || ""} onChange={(e) => update("haendler", e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label="Beipackzettel-Link">
              <input value={form.beipackzettel_url || ""} onChange={(e) => update("beipackzettel_url", e.target.value)} className={INPUT_CLS} placeholder="https://..." />
            </Field>
            <Field label="Offizielle Quelle">
              <input value={form.offizielle_quelle || ""} onChange={(e) => update("offizielle_quelle", e.target.value)} className={INPUT_CLS} />
            </Field>
          </div>

          <Field label="Notizen">
            <textarea rows={3} value={form.notizen || ""} onChange={(e) => update("notizen", e.target.value)} className={INPUT_CLS} />
          </Field>

          {/* Beipackzettel upload */}
          <div className="rounded-card-sm border border-dashed border-light-border dark:border-dark-border p-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => update("__leafletFile", e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 hover:border-primary-500/50 transition-colors"
            >
              <Upload size={14} className="text-primary-500" />
              Beipackzettel hochladen
            </button>
            {form.__leafletFile && (
              <span className="ml-3 text-xs text-primary-500">{form.__leafletFile.name}</span>
            )}
          </div>
        </div>

        {/* Footer — sticky */}
        <div className="mobile-modal-footer shrink-0 flex justify-end gap-2 border-t border-light-border dark:border-dark-border px-4 sm:px-5 py-3">
          <button
            onClick={onCancel}
            className="min-h-[42px] rounded-card-sm border border-light-border dark:border-dark-border px-4 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || saving}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-card-sm bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function MedicationPhotoScanner({ onCancel, onImport, saving }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setCandidates([]);
    setError("");
  };

  const analyzePhoto = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setCandidates([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Nicht eingeloggt.");

      const compressed = await compressImage(file, 1400);
      const base64 = await fileToBase64(compressed);
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/ki-vision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "chatgpt_vision",
          file_base64: base64,
          mime_type: compressed.type || "image/jpeg",
          prompt: MEDICATION_PHOTO_PROMPT,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) throw new Error(payload?.error || "Bildanalyse ist nicht konfiguriert.");
      if (!response.ok) throw new Error(payload?.error || `Bildanalyse fehlgeschlagen (${response.status}).`);

      const parsed = JSON.parse(cleanKiJsonResponse(payload?.text || "{}", "object"));
      const detected = Array.isArray(parsed?.medikamente) ? parsed.medikamente : [];
      if (!detected.length) {
        setError("Kein Medikament im Foto erkannt. Bitte Packung frontaler und schärfer fotografieren.");
        return;
      }

      const resolved = await Promise.all(detected.slice(0, 5).map(async (entry, index) => {
        const name = String(entry?.name || "").trim();
        const wirkstoff = String(entry?.wirkstoff || "").trim();
        const query = [name, wirkstoff].filter(Boolean).join(" ");
        const results = query ? await searchAustrianMedicines(query).catch(() => []) : [];
        const official = results[0] || null;
        return {
          id: `${index}-${name || wirkstoff || "medikament"}`,
          entry,
          official,
          form: {
            ...emptyForm,
            name: official?.name || name,
            wirkstoff: official?.wirkstoff || wirkstoff,
            darreichungsform: official?.darreichungsform || entry?.darreichungsform || "",
            packungsgroesse: official?.packungsgroesse || entry?.packungsgroesse || "",
            ablaufdatum: entry?.ablaufdatum || "",
            bestand: 1,
            mindestbestand: 1,
            kategorie: "Sonstiges",
            beipackzettel_url: official?.beipackzettel_url || "",
            offizielle_quelle: official?.offizielle_quelle || "",
            source_payload: {
              ...(official?.source_payload || {}),
              foto_scan: {
                pzn: entry?.pzn || null,
                hersteller: entry?.hersteller || null,
                sichtbarer_text: entry?.sichtbarer_text || null,
                confidence: entry?.confidence ?? null,
              },
            },
          },
        };
      }));

      setCandidates(resolved.filter((candidate) => candidate.form.name));
      if (!resolved.some((candidate) => candidate.form.name)) {
        setError("Die KI konnte keinen speicherbaren Medikamentennamen erkennen.");
      }
    } catch (err) {
      setError(err?.message || "Fotoanalyse fehlgeschlagen.");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateCandidate = (id, key, value) => {
    setCandidates((prev) => prev.map((candidate) => (
      candidate.id === id
        ? { ...candidate, form: { ...candidate.form, [key]: value } }
        : candidate
    )));
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" style={{ paddingBottom: "calc(var(--mobile-bottom-offset, 0px) + 1rem)" }}>
      <div className="relative max-h-[calc(100dvh-var(--mobile-bottom-offset,0px)-2rem)] w-full max-w-3xl overflow-y-auto rounded-card border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2 sm:max-h-[92vh]">
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-card bg-gradient-to-r from-primary-500 to-secondary-500" />
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">Medikament per Foto scannen</h2>
              <p className="mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Foto der Packung analysieren, offiziell suchen und speichern.
              </p>
            </div>
            <button onClick={onCancel} className="rounded-full p-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors" aria-label="Schließen">
              <X size={17} />
            </button>
          </div>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />

          <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1">
                {previewUrl ? (
                  <img src={previewUrl} alt="Medikamentenfoto" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center text-light-text-secondary dark:text-dark-text-secondary">
                    <Camera size={28} className="mx-auto mb-2 opacity-70" />
                    <p className="text-xs">Packung fotografieren</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors">
                  <Camera size={14} /> Foto
                </button>
                <button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors">
                  <Upload size={14} /> Upload
                </button>
              </div>
              <button type="button" onClick={analyzePhoto} disabled={!file || analyzing} className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-card-sm border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-600 disabled:opacity-50 dark:text-primary-400">
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Analysieren
              </button>
            </div>

            <div className="space-y-3">
              {error && (
                <p className="rounded-card-sm border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}

              {candidates.length === 0 && !error && (
                <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Noch keine Analyse. Gute Ergebnisse entstehen mit einem scharfen Foto der Vorderseite.
                </div>
              )}

              {candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">{candidate.form.name}</p>
                      <p className="mt-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {candidate.official ? "Offizieller Treffer gefunden" : "Kein offizieller Treffer, bitte prüfen"}
                      </p>
                    </div>
                    {candidate.official && <CheckCircle size={16} className="shrink-0 text-primary-500" />}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={candidate.form.name} onChange={(e) => updateCandidate(candidate.id, "name", e.target.value)} className={INPUT_CLS} placeholder="Name" />
                    <input value={candidate.form.wirkstoff || ""} onChange={(e) => updateCandidate(candidate.id, "wirkstoff", e.target.value)} className={INPUT_CLS} placeholder="Wirkstoff" />
                    <input value={candidate.form.darreichungsform || ""} onChange={(e) => updateCandidate(candidate.id, "darreichungsform", e.target.value)} className={INPUT_CLS} placeholder="Form" />
                    <input value={candidate.form.packungsgroesse || ""} onChange={(e) => updateCandidate(candidate.id, "packungsgroesse", e.target.value)} className={INPUT_CLS} placeholder="Packung/Stärke" />
                    <input type="date" value={candidate.form.ablaufdatum || ""} onChange={(e) => updateCandidate(candidate.id, "ablaufdatum", e.target.value)} className={INPUT_CLS} />
                    <input type="number" min="0" step="0.5" value={candidate.form.bestand ?? 1} onChange={(e) => updateCandidate(candidate.id, "bestand", e.target.value)} className={INPUT_CLS} placeholder="Bestand" />
                  </div>
                  <button type="button" onClick={() => onImport(candidate.form)} disabled={!candidate.form.name.trim() || saving} className="mt-3 inline-flex min-h-[42px] items-center gap-2 rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    In Heimapotheke speichern
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Component

export default function HomeHeimapotheke({ session }) {
  const reducedMotion = useReducedMotion();
  const userId = session?.user?.id;
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useViewport();
  const [householdId, setHouseholdId] = useState(getActiveHouseholdId());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [medications, setMedications] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [leafletDocs, setLeafletDocs] = useState({});
  const [leafletFetchingId, setLeafletFetchingId] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [photoScannerOpen, setPhotoScannerOpen] = useState(false);
  const [assistantFocus, setAssistantFocus] = useState(null);

  const resolveHouseholdId = useCallback(async () => {
    const active = getActiveHouseholdId();
    if (active) { setHouseholdId(active); return active; }
    if (!userId) return null;
    const { data } = await supabase.from("household_members").select("household_id").eq("user_id", userId).limit(1).maybeSingle();
    setHouseholdId(data?.household_id || null);
    return data?.household_id || null;
  }, [userId]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const hid = await resolveHouseholdId();
      const { data, error } = await supabase
        .from("home_medikamente")
        .select("*")
        .or(`user_id.eq.${userId}${hid ? `,household_id.eq.${hid}` : ""}`)
        .order("name", { ascending: true });
      if (error) throw error;
      setMedications(data || []);
      const docIds = [...new Set((data || []).map((e) => e.beipackzettel_dokument_id).filter(Boolean))];
      if (docIds.length) {
        const { data: docData } = await supabase.from("dokumente").select("id, dateiname, datei_typ, storage_pfad, meta").in("id", docIds);
        setLeafletDocs((docData || []).reduce((map, doc) => { map[doc.id] = doc; return map; }, {}));
      } else {
        setLeafletDocs({});
      }
      const ids = (data || []).map((e) => e.id);
      if (ids.length) {
        const { data: analysisData } = await supabase.from("home_medikament_beipackzettel_analysen").select("*").in("medikament_id", ids).order("created_at", { ascending: false });
        setAnalyses(analysisData || []);
      } else {
        setAnalyses([]);
      }
    } catch (error) {
      toast.error(error?.message || "Heimapotheke konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [resolveHouseholdId, toast, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!selected?.id) return;
    const updated = medications.find((e) => e.id === selected.id);
    if (updated && updated !== selected) setSelected(updated);
  }, [medications, selected]);


  useEffect(() => {
    const flow = location.state?.assistantFlow;
    const prefillQuery = flow?.ui_state?.prefillQuery || flow?.params?.query || "";
    if (!flow) return;
    if (prefillQuery) setQuery(prefillQuery);
    if (flow.ui_state?.focusMedicationId || flow.ui_state?.focusMedicationName || flow.ui_state?.openLeaflet) {
      setAssistantFocus({
        id: flow.ui_state?.focusMedicationId || null,
        name: flow.ui_state?.focusMedicationName || prefillQuery || null,
        openLeaflet: Boolean(flow.ui_state?.openLeaflet),
      });
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const analysisByMedication = useMemo(() => {
    const map = {};
    analyses.forEach((e) => { if (!map[e.medikament_id]) map[e.medikament_id] = e; });
    return map;
  }, [analyses]);

  const locations = useMemo(
    () => [...new Set(medications.map((e) => e.lagerort).filter(Boolean))].sort(),
    [medications],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return medications.filter((entry) => {
      const status = getMedicationStatus(entry);
      if (q && ![entry.name, entry.wirkstoff, entry.kategorie, entry.lagerort].filter(Boolean).join(" · ").toLowerCase().includes(q)) return false;
      if (category && entry.kategorie !== category) return false;
      if (locationFilter && entry.lagerort !== locationFilter) return false;
      if (statusFilter === "low" && !status.lowStock) return false;
      if (statusFilter && statusFilter !== "low" && status.key !== statusFilter) return false;
      return true;
    });
  }, [category, locationFilter, medications, query, statusFilter]);

  const stats = useMemo(() => {
    const result = { expired: 0, expiring: 0, low: 0 };
    medications.forEach((entry) => {
      const status = getMedicationStatus(entry);
      if (status.key === "expired") result.expired += 1;
      if (status.key === "expiring") result.expiring += 1;
      if (status.lowStock) result.low += 1;
    });
    return result;
  }, [medications]);

  const uploadLeaflet = async ({ file, medicationName }) => {
    if (!file) return null;
    const storagePath = `${userId}/heimapotheke/${Date.now()}-${normalizeFilename(file.name)}`;
    const contentType = file.type || "application/octet-stream";
    const { error: uploadError } = await supabase.storage.from("user-dokumente").upload(storagePath, file, { upsert: false, contentType });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.from("dokumente").insert({
      user_id: userId, household_id: householdId, dateiname: file.name, datei_typ: contentType,
      groesse_kb: Math.ceil((file.size || 0) / 1024), storage_pfad: storagePath, kategorie: "Medikamente",
      dokument_typ: "beipackzettel", app_modus: "home", beschreibung: `Beipackzettel ${medicationName}`,
      tags: ["heimapotheke", "beipackzettel"],
    }).select("id").single();
    if (error) throw error;
    return data?.id || null;
  };

  const mirrorLeafletFromInternet = async (medication, { force = false } = {}) => {
    if (!medication?.id || (medication.beipackzettel_dokument_id && !force)) return null;
    const { data, error } = await supabase.functions.invoke("medication-leaflet-fetch", {
      body: { medikament_id: medication.id, household_id: medication.household_id || householdId, name: medication.name, wirkstoff: medication.wirkstoff, darreichungsform: medication.darreichungsform, packungsgroesse: medication.packungsgroesse, beipackzettel_url: medication.beipackzettel_url, offizielle_quelle: medication.offizielle_quelle, force },
    });
    if (error) throw error;
    return data || null;
  };

  const openLeafletDocument = useCallback(async (medication) => {
    const doc = leafletDocs[medication?.beipackzettel_dokument_id];
    if (!doc?.storage_pfad) {
      if (medication?.beipackzettel_url) { window.open(medication.beipackzettel_url, "_blank", "noopener,noreferrer"); return; }
      toast.error("Kein gespeicherter Beipackzettel vorhanden.");
      return;
    }
    const { data, error } = await supabase.storage.from("user-dokumente").download(doc.storage_pfad);
    if (error || !data) { toast.error(error?.message || "Beipackzettel kann nicht geoeffnet werden."); return; }
    const blob = data.type ? data : new Blob([data], { type: doc.datei_typ || "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
  }, [leafletDocs, toast]);

  useEffect(() => {
    if (!assistantFocus || medications.length === 0) return;
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const target = medications.find((entry) => entry.id === assistantFocus.id) ||
      medications.find((entry) => normalize(entry.name) === normalize(assistantFocus.name)) ||
      medications.find((entry) => normalize(entry.name).includes(normalize(assistantFocus.name)));
    if (!target) return;
    setSelected(target);
    setAssistantFocus(null);
    if (assistantFocus.openLeaflet) {
      window.setTimeout(() => openLeafletDocument(target), 100);
    }
  }, [assistantFocus, medications, openLeafletDocument]);

  const fetchLeafletForExisting = async (medication) => {
    if (!medication?.id || leafletFetchingId) return;
    setLeafletFetchingId(medication.id);
    try {
      const missingLinkedDocument = medication.beipackzettel_dokument_id && !leafletDocs[medication.beipackzettel_dokument_id];
      const result = await mirrorLeafletFromInternet(medication, { force: Boolean(medication.beipackzettel_dokument_id || missingLinkedDocument) });
      if (result?.ok && result.dokument_id) {
        const basgMetadata = result.metadata || result.source_payload?.basg || null;
        const enrichedMedication = applyBasgMetadata({
          ...medication,
          beipackzettel_dokument_id: result.dokument_id,
          beipackzettel_url: result.source_url || medication.beipackzettel_url,
          offizielle_quelle: result.source || medication.offizielle_quelle,
        }, basgMetadata);
        if (basgMetadata && typeof basgMetadata === "object") {
          await supabase.from("home_medikamente").update({
            wirkstoff: enrichedMedication.wirkstoff || null,
            darreichungsform: enrichedMedication.darreichungsform || null,
            packungsgroesse: enrichedMedication.packungsgroesse || null,
            beipackzettel_dokument_id: result.dokument_id,
            beipackzettel_url: result.source_url || medication.beipackzettel_url || null,
            offizielle_quelle: result.source || medication.offizielle_quelle || null,
            source_payload: {
              ...(medication.source_payload || {}),
              basg: basgMetadata,
            },
          }).eq("id", medication.id);
        }
        await createLeafletAnalysis({ medication: enrichedMedication, documentId: result.dokument_id, sourceUrl: result.source_url || medication.beipackzettel_url, documentName: "Automatisch gespeicherter Beipackzettel" });
        toast.success("Beipackzettel gespeichert.");
        await loadData();
      } else {
        toast.error("Kein passender Beipackzettel gefunden. Bitte Link eintragen oder PDF hochladen.");
      }
    } catch (error) {
      toast.error(error?.message || "Beipackzettel konnte nicht gespeichert werden.");
    } finally {
      setLeafletFetchingId(null);
    }
  };

  const extractTextFromStoredDocument = async (documentId) => {
    if (!documentId) return null;
    const knownDoc = leafletDocs[documentId];
    const doc = knownDoc || (await supabase
      .from("dokumente")
      .select("id, dateiname, datei_typ, storage_pfad")
      .eq("id", documentId)
      .maybeSingle()).data;
    if (!doc?.storage_pfad) return null;

    const { data, error } = await supabase.storage.from("user-dokumente").download(doc.storage_pfad);
    if (error || !data) return null;
    const file = new File([data], doc.dateiname || "beipackzettel.pdf", {
      type: doc.datei_typ || data.type || "application/pdf",
    });
    const extracted = await extractTextFromFile(file);
    return extracted?.text || null;
  };

  const createLeafletAnalysis = async ({ medication, documentId = null, sourceUrl = null, documentName = null, file = null }) => {
    if (!medication?.id || (!documentId && !sourceUrl)) return;
    let summaryPayload = null, status = "completed", model = "structured-source-placeholder", errorText = null;
    try {
      let sourceText = null;
      if (file) { const extracted = await extractTextFromFile(file); sourceText = extracted?.text || null; }
      if (!sourceText && documentId) sourceText = await extractTextFromStoredDocument(documentId);
      if (sourceText && sourceText.length > 120) {
        const ki = await getKiClient(userId);
        const response = await ki.client.chat.completions.create({ model: ki.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Du extrahierst strukturierte, nicht-beratende Organisationshinweise aus offiziellen Beipackzetteln. Keine Diagnose, keine Therapie- oder Dosierungsempfehlung." }, { role: "user", content: buildLeafletAnalysisPrompt({ medication, sourceText }) }] });
        const raw = response?.choices?.[0]?.message?.content || response?.text || response?.content || JSON.stringify(response);
        summaryPayload = sanitizeLeafletSummary(raw);
        model = ki.model || model;
        const medicationPatch = analysisMedicationPatch(medication, summaryPayload);
        if (medicationPatch) {
          await supabase.from("home_medikamente").update(medicationPatch).eq("id", medication.id);
        }
      } else {
        status = "failed";
        errorText = "Aus dem Beipackzettel konnte kein auswertbarer Text extrahiert werden.";
      }
    } catch (error) { status = "failed"; errorText = error?.message || "Beipackzettel-Analyse fehlgeschlagen."; }
    await supabase.from("home_medikament_beipackzettel_analysen").insert({ medikament_id: medication.id, household_id: medication.household_id || householdId, dokument_id: documentId, source_url: sourceUrl, analyse_status: status, summary_payload: summaryPayload || buildLeafletSummaryPayload({ medication, sourceUrl, documentName }), model, analysiert_am: new Date().toISOString(), fehler: errorText });
  };

  const saveMedication = async (form) => {
    if (!userId || !form.name.trim()) return;
    setSaving(true);
    try {
      let documentId = await uploadLeaflet({ file: form.__leafletFile, medicationName: form.name });
      const payload = buildMedicationPayload({ item: { ...form, beipackzettel_dokument_id: documentId || form.beipackzettel_dokument_id || null }, userId, householdId: householdId || (await resolveHouseholdId()) });
      let saved;
      if (form.id) {
        const { data, error } = await supabase.from("home_medikamente").update(payload).eq("id", form.id).select("*").single();
        if (error) throw error;
        saved = data;
      } else {
        const existing = findExistingMedication(medications, payload);
        if (existing) {
          const { data, error } = await supabase.from("home_medikamente").update({
            ...payload,
            beipackzettel_dokument_id: payload.beipackzettel_dokument_id || existing.beipackzettel_dokument_id || null,
            beipackzettel_url: payload.beipackzettel_url || existing.beipackzettel_url || null,
            offizielle_quelle: payload.offizielle_quelle || existing.offizielle_quelle || null,
            source_payload: { ...(existing.source_payload || {}), ...(payload.source_payload || {}) },
            bestand: Number(existing.bestand || 0) + Number(payload.bestand || 0),
          }).eq("id", existing.id).select("*").single();
          if (error) throw error;
          saved = data;
        } else {
          const { data, error } = await supabase.from("home_medikamente").insert(payload).select("*").single();
          if (error) throw error;
          saved = data;
        }
      }
      if (documentId) { await supabase.from("dokument_links").insert({ household_id: saved.household_id || householdId, dokument_id: documentId, entity_type: "medikament", entity_id: saved.id, relation_type: "beipackzettel" }); }
      let mirroredLeaflet = null;
      if (!documentId && !saved.beipackzettel_dokument_id) {
        try {
          mirroredLeaflet = await mirrorLeafletFromInternet(saved);
          if (mirroredLeaflet?.ok && mirroredLeaflet.dokument_id) {
            documentId = mirroredLeaflet.dokument_id;
            saved = applyBasgMetadata({
              ...saved,
              beipackzettel_dokument_id: mirroredLeaflet.dokument_id,
              beipackzettel_url: mirroredLeaflet.source_url || saved.beipackzettel_url,
              offizielle_quelle: mirroredLeaflet.source || saved.offizielle_quelle,
            }, mirroredLeaflet.metadata);
          }
        } catch (error) { mirroredLeaflet = { ok: false, reason: error?.message || "download_failed" }; }
      }
      if (documentId || saved.beipackzettel_url) { await createLeafletAnalysis({ medication: saved, documentId: documentId || saved.beipackzettel_dokument_id || null, sourceUrl: mirroredLeaflet?.source_url || saved.beipackzettel_url, documentName: form.__leafletFile?.name || (mirroredLeaflet?.dokument_id ? "Automatisch gespeicherter Beipackzettel" : null), file: form.__leafletFile || null }); }
      await notifyHouseholdEvent({ userId, table: "home_medikamente", action: form.id ? "geaendert" : "erstellt", recordName: saved.name, recordId: saved.id, url: "/home/heimapotheke", push: false });
      toast.success(documentId ? "Medikament mit Beipackzettel gespeichert." : "Medikament gespeichert.");
      setModal(null);
      await loadData();
      return true;
    } catch (error) {
      toast.error(error?.message || "Medikament konnte nicht gespeichert werden.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteMedication = async (entry) => {
    if (!window.confirm(`${entry.name} wirklich löschen?`)) return;
    const { error } = await supabase.from("home_medikamente").delete().eq("id", entry.id);
    if (error) { toast.error(error.message); return; }
    await notifyHouseholdEvent({ userId, table: "home_medikamente", action: "geloescht", recordName: entry.name, recordId: entry.id, url: "/home/heimapotheke" });
    if (selected?.id === entry.id) setSelected(null);
    await loadData();
  };

  const activeFilterCount = [query, category, locationFilter, statusFilter].filter(Boolean).length;

  const hasAlerts = stats.expired > 0 || stats.expiring > 0 || stats.low > 0;

  // Render

  return (
    <div className="home-glass-modern glass-module relative min-h-[calc(100dvh-4.5rem)] min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8">
      {/* Page header — hidden on mobile (topbar shows title + FAB handles action) */}
      <div className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card-sm bg-primary-500/10">
            <Pill size={18} className="text-primary-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">Heimapotheke</h1>
            <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
              Bestand · Ablaufdaten · Beipackzettel
            </p>
          </div>
        </div>
        <div className="hidden sm:flex shrink-0 items-center gap-2">
          <button
            onClick={() => setPhotoScannerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-light-border dark:border-dark-border px-4 py-2 text-sm font-semibold text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 hover:border-primary-500/50 transition-colors"
          >
            <Camera size={15} />
            Foto scannen
          </button>
          <button
            onClick={() => setModal(emptyForm)}
            className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
          >
            <Plus size={15} />
            Hinzuf?gen
          </button>
        </div>
      </div>

      <div className="space-y-4">
          {hasAlerts && (
            <motion.div variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { key: "expired",  count: stats.expired,  icon: AlertTriangle, label: "Abgelaufen",    hex: "#FB7185" },
                { key: "expiring", count: stats.expiring, icon: Bell,          label: "Läuft bald ab", hex: "#F59E0B" },
                { key: "low",      count: stats.low,      icon: PackagePlus,   label: "Niedrig",       hex: "#F97316" },
              ].map(({ key, count, icon: Icon, label, hex }) => {
                const cfg = STATUS_CFG[key];
                return (
                  <GlassSurface
                    as="button"
                    key={key}
                    onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
                    className={`overflow-hidden rounded-card-sm p-2.5 sm:rounded-card sm:p-3.5 text-left ${cfg.border} ${statusFilter === key ? "ring-1 ring-primary-500/40" : ""}`}
                  >
                    <div className={`pointer-events-none absolute -right-2 -top-2 h-10 w-10 sm:h-14 sm:w-14 rounded-full blur-xl ${cfg.glow}`} />
                    <div className="relative flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1">
                      <div className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-card-sm" style={{ background: `${hex}18` }}>
                        <Icon size={12} className="sm:hidden" style={{ color: hex }} />
                        <Icon size={15} className="hidden sm:block" style={{ color: hex }} />
                      </div>
                      <div>
                        <p className="text-base sm:text-xl font-bold tabular-nums text-light-text-main dark:text-dark-text-main leading-none">{count}</p>
                        <p className="text-[10px] sm:text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5 leading-tight">{label}</p>
                      </div>
                    </div>
                  </GlassSurface>
                );
              })}
            </motion.div>
          )}
          {/* Mobile: sticky filter bar — HomeInventar pattern */}
          <div className="relative z-10 -mx-4 mb-3 px-4 py-3 bg-light-bg/95 dark:bg-canvas-1/95 backdrop-blur-md border-y border-light-border dark:border-dark-border space-y-2 lg:hidden">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Suchen..."
                  className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 pl-9 pr-3 py-2 text-sm text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:border-primary-500"
                />
              </div>
              <button
                onClick={() => setPhotoScannerOpen(true)}
                className="flex shrink-0 items-center justify-center rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/50 hover:text-primary-500 transition-colors"
                title="Medikament per Foto scannen"
              >
                <Camera size={15} />
              </button>
              <button
                onClick={() => setFilterOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-card-sm border px-3 py-2 text-sm transition-colors ${
                  activeFilterCount > 0
                    ? "border-primary-500/50 bg-primary-500/10 text-primary-500"
                    : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
                }`}
              >
                <Filter size={13} />
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown size={11} className={`transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            {false && filterOpen && (
              <div className="grid grid-cols-2 gap-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-2 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500">
                  <option value="">Alle Kategorien</option>
                  {MEDICATION_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-2 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500">
                  <option value="">Alle Lagerorte</option>
                  {locations.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="col-span-2 w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-2 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500">
                  <option value="">Alle Status</option>
                  <option value="expired">Abgelaufen</option>
                  <option value="expiring">Läuft bald ab</option>
                  <option value="low">Niedrig</option>
                  <option value="ok">OK</option>
                </select>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setCategory(""); setLocationFilter(""); setStatusFilter(""); setQuery(""); }}
                    className="col-span-2 text-xs text-light-text-secondary dark:text-dark-text-secondary underline underline-offset-2 text-left"
                  >
                    Filter zurücksetzen
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Desktop: filter card */}
          <GlassSurface interactive={false} className="hidden lg:block p-4">
            <SectionHeader label="Filter" icon={Search} />
            <div className="grid gap-2 grid-cols-[minmax(0,1fr)_160px_160px_140px]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, Wirkstoff, Lagerort..."
                  className={`${INPUT_CLS} pl-9`}
                />
              </div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT_CLS}>
                <option value="">Alle Kategorien</option>
                {MEDICATION_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={INPUT_CLS}>
                <option value="">Alle Lagerorte</option>
                {locations.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT_CLS}>
                <option value="">Alle Status</option>
                <option value="expired">Abgelaufen</option>
                <option value="expiring">Läuft bald ab</option>
                <option value="low">Niedrig</option>
                <option value="ok">OK</option>
              </select>
            </div>
          </GlassSurface>
          {/* Medication list — accordion cards */}
          <div className="space-y-2 pt-1 lg:pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 size={24} className="animate-spin text-primary-500" />
              </div>
            ) : filtered.length === 0 ? (
              <GlassSurface interactive={false} className="flex flex-col items-center py-14 text-center">
                <div className="relative mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-500/30 bg-primary-500/5">
                    <Pill size={28} className="text-primary-500/60" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-primary-500/20 scale-110" />
                </div>
                <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">Keine Medikamente gefunden</p>
                <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {query || category || locationFilter || statusFilter ? "Filter anpassen oder" : ""} neues Medikament hinzufügen
                </p>
              </GlassSurface>
            ) : (
              filtered.map((entry) => {
                const status = getMedicationStatus(entry);
                const cfg = STATUS_CFG[status.key] || STATUS_CFG.ok;
                const isSelected = selected?.id === entry.id;
                const analysis = analysisByMedication[entry.id];
                const leafletDoc = leafletDocs[entry.beipackzettel_dokument_id];
                return (
                  <GlassSurface
                    key={entry.id}
                    className={`overflow-hidden rounded-card-sm ${
                      isSelected ? "border-primary-500/50" : "border-light-border dark:border-dark-border"
                    }`}
                  >
                    {/* Status accent stripe */}
                    <div className={`absolute inset-x-0 top-0 h-0.5 ${cfg.dot}`} />

                    {/* Clickable header */}
                    <button
                      type="button"
                      onClick={() => setSelected(isSelected ? null : entry)}
                      className="w-full p-3 pt-3.5 text-left"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-card-sm bg-primary-500/10">
                          <Pill size={14} className="text-primary-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                              {entry.name}
                            </h3>
                            <StatusBadge medication={entry} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            {[entry.wirkstoff, entry.darreichungsform].filter(Boolean).join(" · ") || entry.kategorie || "Keine Stammdaten"}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-pill border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                              <Package size={8} className="text-light-text-secondary dark:text-dark-text-secondary" />
                              {entry.bestand} Stk.
                            </span>
                            {entry.lagerort && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary">
                                <MapPin size={8} className="shrink-0" />
                                <span className="truncate max-w-[80px]">{entry.lagerort}</span>
                              </span>
                            )}
                            {entry.ablaufdatum && (
                              <span className={`inline-flex items-center gap-1 text-[10px] ${
                                status.key === "expired" ? "text-red-400" : status.key === "expiring" ? "text-amber-400" : "text-light-text-secondary dark:text-dark-text-secondary"
                              }`}>
                                <Calendar size={8} />
                                {formatDate(entry.ablaufdatum)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          size={14}
                          className={`shrink-0 mt-1 text-light-text-secondary dark:text-dark-text-secondary transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>

                    {/* Expanded detail */}
                    <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.div
                        key="details"
                        variants={reducedMotion ? {} : glassCollapseVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="overflow-hidden border-t border-light-border dark:border-dark-border"
                      >
                      <div className="px-3 pb-4 space-y-4">
                        {/* Actions */}
                        <div className="flex gap-2 pt-3">
                          <button
                            type="button"
                            onClick={() => setModal(entry)}
                            className="flex items-center gap-1.5 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-primary-500/10 hover:text-primary-500 hover:border-primary-500/30 transition-colors"
                          >
                            <Edit2 size={11} /> Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMedication(entry)}
                            className="flex items-center gap-1.5 rounded-card-sm border border-accent-danger/30 px-3 py-1.5 text-xs text-accent-danger hover:bg-accent-danger/10 transition-colors"
                          >
                            <Trash2 size={11} /> Löschen
                          </button>
                        </div>

                        {/* Stammdaten */}
                        <div>
                          <SectionHeader label="Stammdaten" />
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {[
                              ["Wirkstoff",      entry.wirkstoff],
                              ["Form",           entry.darreichungsform],
                              ["Packung",        entry.packungsgroesse],
                              ["Bestand",        entry.bestand != null ? `${entry.bestand} Stk.` : null],
                              ["Mindestbestand", entry.mindestbestand != null ? `${entry.mindestbestand} Stk.` : null],
                              ["Ablaufdatum",    formatDate(entry.ablaufdatum)],
                              ["Lagerort",       entry.lagerort],
                              ["Kategorie",      entry.kategorie],
                              ["Kaufdatum",      formatDate(entry.kaufdatum)],
                              ["Preis",          entry.preis ? `${entry.preis} €` : null],
                              ["Händler",        entry.haendler],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt className="text-[10px] uppercase tracking-wide font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                  {label}
                                </dt>
                                <dd className="mt-0.5 text-sm font-medium text-light-text-main dark:text-dark-text-main break-words">
                                  {displayValue(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>

                        {/* Beipackzettel */}
                        <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
                          <SectionHeader label="Offizielle Quelle" icon={FileText} />
                          {entry.beipackzettel_dokument_id && leafletDoc ? (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => openLeafletDocument(entry)}
                                className="inline-flex items-center gap-2 rounded-card-sm bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors">
                                Beipackzettel öffnen <ExternalLink size={13} />
                              </button>
                              <button type="button" onClick={() => fetchLeafletForExisting(entry)} disabled={leafletFetchingId === entry.id}
                                className="inline-flex items-center gap-2 rounded-card-sm border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300">
                                {leafletFetchingId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                                {((leafletDoc?.datei_typ || "").includes("html") || /\.html?$/i.test(leafletDoc?.dateiname || "")) ? "PDF neu speichern" : "Aktualisieren"}
                              </button>
                            </div>
                          ) : entry.beipackzettel_url ? (
                            <div className="flex flex-wrap gap-2">
                              <a href={entry.beipackzettel_url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-600 transition-colors">
                                Externe Quelle <ExternalLink size={13} />
                              </a>
                              <button type="button" onClick={() => fetchLeafletForExisting(entry)} disabled={leafletFetchingId === entry.id}
                                className="inline-flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50 transition-colors">
                                {leafletFetchingId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                                In App speichern
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => fetchLeafletForExisting(entry)} disabled={leafletFetchingId === entry.id}
                              className="inline-flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 hover:border-primary-500/50 disabled:opacity-50 transition-colors">
                              {leafletFetchingId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                              Online suchen & speichern
                            </button>
                          )}
                          {(entry.offizielle_quelle || leafletDoc?.meta?.source) && (
                            <p className="mt-2 text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                              {entry.offizielle_quelle || leafletDoc?.meta?.source}
                            </p>
                          )}
                        </div>

                        {/* KI Analysis */}
                        <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
                          <SectionHeader label="KI-Auswertung" icon={Bot} />
                          {analysis ? (
                            <div className="space-y-2.5">
                              {analysis.analyse_status === "failed" && (
                                <p className="rounded-card-sm border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-400">
                                  {analysis.fehler || "KI-Auswertung fehlgeschlagen."}
                                </p>
                              )}
                              <p className="rounded-card-sm border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                                {analysis.summary_payload?.disclaimer || "KI-Zusammenfassung - keine medizinische Beratung."}
                              </p>
                              {Object.entries(analysis.summary_payload || {})
                                .filter(([key, value]) => !["disclaimer"].includes(key) && (Array.isArray(value) ? value.length : value))
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <p className="text-[10px] uppercase tracking-wide font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                                      {key.replace(/_/g, " ")}
                                    </p>
                                    <p className="break-words text-xs text-light-text-main dark:text-dark-text-main">
                                      {Array.isArray(value) ? value.join(" · ") : String(value)}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Noch keine Auswertung vorhanden.</p>
                          )}
                        </div>

                        {/* Notizen */}
                        {entry.notizen && (
                          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
                            <SectionHeader label="Notizen" />
                            <p className="whitespace-pre-wrap text-xs text-light-text-main dark:text-dark-text-main leading-relaxed">
                              {entry.notizen}
                            </p>
                          </div>
                        )}
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </GlassSurface>
                );
              })
            )}
          </div>
        </div>

      <MobileMedicationFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        category={category}
        onCategoryChange={setCategory}
        locationFilter={locationFilter}
        onLocationChange={setLocationFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        locations={locations}
        onReset={() => {
          setCategory("");
          setLocationFilter("");
          setStatusFilter("");
          setQuery("");
        }}
      />

      {/* Mobile FAB */}
      <MobileFab onClick={() => setModal(emptyForm)} title="Medikament hinzufügen" pill>
        <span className="flex items-center gap-1.5">
          <Plus size={15} /> Hinzufügen
        </span>
      </MobileFab>

      {photoScannerOpen && (
        <MedicationPhotoScanner
          saving={saving}
          onCancel={() => setPhotoScannerOpen(false)}
          onImport={async (candidate) => {
            const ok = await saveMedication(candidate);
            if (ok) setPhotoScannerOpen(false);
          }}
        />
      )}

      {modal && (
        <MedicationForm
          initial={modal}
          saving={saving}
          onCancel={() => setModal(null)}
          onSave={saveMedication}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}


