import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Check, AlertTriangle, ChevronDown, ChevronUp,
  Package, Box, Cpu, Wallet, FileText, Info, Pill,
} from "lucide-react";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import { buildEqualShares, validateSplitConfig } from "../../utils/budgetSplits";
import {
  DEFAULT_HOME_BUDGET_CATEGORY,
  buildSelectableHomeBudgetCategoryRows,
  getActiveHomeBudgetCategoryNames,
  getDefaultHomeBudgetCategories,
  getSelectableHomeBudgetCategoryNames,
} from "../../utils/homeBudgetCategories";
import {
  getBewohnerDisplayName,
  resolveSplitPayerFromBudgetSelection,
} from "../../utils/budgetAccounts";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { useLocale } from "../../contexts/LocaleContext";
import { buildInvoiceKnowledgeContent } from "../../utils/localizedKnowledge";
import KostenAufteilungAuswahl from "./KostenAufteilungAuswahl";
import ModalShell from "../ui/ModalShell";
import { findExistingMedication } from "../../utils/heimapotheke";
import { syncFuelImports } from "../../utils/kfzFuelImports";

// ============================================================
// Konstanten
// ============================================================

const MODUL_CONFIG = {
  budget: {
    label: "Budget",
    icon: <Wallet size={16} />,
    farbe: "text-accent-warm",
    pflicht: false,
    defaultAktiv: true,
  },
  dokumente: {
    label: "Dokumente",
    icon: <FileText size={16} />,
    farbe: "text-secondary-500",
    pflicht: true,
    defaultAktiv: true,
  },
  geraete: {
    label: "Geraete & Wartung",
    icon: <Cpu size={16} />,
    farbe: "text-accent-info",
    pflicht: false,
    defaultAktiv: false,
  },
  vorraete: {
    label: "Vorraete",
    icon: <Package size={16} />,
    farbe: "text-accent-success",
    pflicht: false,
    defaultAktiv: false,
  },
  medikamente: {
    label: "Heimapotheke",
    icon: <Pill size={16} />,
    farbe: "text-rose-400",
    pflicht: false,
    defaultAktiv: false,
  },
  inventar: {
    label: "Inventar",
    icon: <Box size={16} />,
    farbe: "text-accent-yellow",
    pflicht: false,
    defaultAktiv: false,
  },
};

const MODUL_OPTIONEN = ["vorraete", "medikamente", "inventar", "geraete", "keine_zuordnung"];

const BUDGET_INSERT_VARIANTEN = [
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "app_modus", "typ", "budget_scope", "zahlungskonto_id", "bewohner_id"],
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "app_modus", "typ", "budget_scope", "zahlungskonto_id"],
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "app_modus", "typ", "budget_scope"],
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "app_modus", "typ"],
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie", "app_modus"],
  ["user_id", "household_id", "beschreibung", "betrag", "datum", "kategorie"],
];

const SCANNER_BUDGET_KATEGORIE_ALIASE = new Map([
  ["kraftstoff", "Tanken"],
  ["lebensmittel", "Lebensmittel & Getränke"],
  ["getraenke", "Lebensmittel & Getränke"],
  ["getränke", "Lebensmittel & Getränke"],
]);

function normalizeScannerBudgetKategorie(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return SCANNER_BUDGET_KATEGORIE_ALIASE.get(trimmed.toLocaleLowerCase("de-DE")) || trimmed;
}

// ============================================================
// Hilfsfunktionen
// ============================================================

function addJahre(datumIso, jahre) {
  if (!datumIso) return "";
  try {
    const d = new Date(datumIso);
    d.setFullYear(d.getFullYear() + jahre);
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function initModulAktiv(erkannteModule) {
  const aktiv = {};
  for (const [key, cfg] of Object.entries(MODUL_CONFIG)) {
    aktiv[key] = cfg.pflicht || cfg.defaultAktiv || erkannteModule.includes(key);
  }
  return aktiv;
}

function normalizeFilePart(input) {
  const base = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "rechnung";
}

function extFromFilename(name) {
  const match = String(name || "").match(/\.([a-zA-Z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : "";
}

function extFromMime(mime) {
  if (!mime) return "";
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "";
}

function buildInvoiceFilename({ haendler, datum, originalName, mimeType }) {
  const ext = extFromFilename(originalName) || extFromMime(mimeType) || "pdf";
  const vendor = normalizeFilePart(haendler || "rechnung");
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(datum || "") ? datum : "ohne-datum";
  return `rechnung_${vendor}_${datePart}.${ext}`;
}

function sanitizeStorageFilename(name) {
  const safe = String(name || "rechnung.pdf")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");
  return safe || "rechnung.pdf";
}

// ============================================================
// Sub-Komponenten
// ============================================================

function AkkordeonSektion({ title, icon, kinder, defaultOffen = false }) {
  const [offen, setOffen] = useState(defaultOffen);
  return (
    <div className="border border-canvas-3 rounded-card-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-canvas-2 hover:bg-canvas-3 transition-colors text-left"
        onClick={() => setOffen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-dark-text-main">
          {icon}{title}
        </span>
        {offen ? <ChevronUp size={16} className="text-dark-text-secondary" /> : <ChevronDown size={16} className="text-dark-text-secondary" />}
      </button>
      {offen && <div className="p-4 space-y-3 bg-canvas-1">{kinder}</div>}
    </div>
  );
}

function InputFeld({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div>
      <label className="block text-xs text-dark-text-secondary mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                   text-sm text-dark-text-main placeholder-dark-text-secondary
                   focus:outline-none focus:border-primary-500 transition-colors"
      />
    </div>
  );
}

function SelectFeld({ label, value, onChange, optionen }) {
  return (
    <div>
      <label className="block text-xs text-dark-text-secondary mb-1">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                   text-sm text-dark-text-main focus:outline-none focus:border-primary-500 transition-colors"
      >
        {optionen.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// Haupt-Komponente
// ============================================================

export default function RechnungReviewModal({
  ergebnis,
  datei,
  session,
  existingDokumentId = null,
  existingRechnungId = null,
  existingStoragePfad = null,
  serverProcessed = false,
  onAbbrechen,
  onGespeichert,
}) {
  const { t } = useTranslation(["home","common"]);
  void t;

  const { locale } = useLocale();
  const { success, error: toastError } = useToast();

  const [haendler, setHaendler] = useState(ergebnis.haendler || "");
  const [datum, setDatum] = useState(ergebnis.datum || "");
  const [gesamt, setGesamt] = useState(ergebnis.gesamt != null ? String(ergebnis.gesamt) : "");
  const [positionen, setPositionen] = useState(ergebnis.positionen || []);
  const [modulAktiv, setModulAktiv] = useState(() => initModulAktiv(ergebnis.erkannte_module || []));
  const [speichern, setSpeichern] = useState(false);
  const [zusammenfassung, setZusammenfassung] = useState(ergebnis.summary_text || "");

  // Budget-Scope + Zahlungskonto + Bewohner
  const [budgetScope, setBudgetScope]           = useState("haushalt");
  const [zahlungskontoId, setZahlungskontoId]   = useState("");
  const [budgetBewohnerId, setBudgetBewohnerId] = useState("");
  const [finanzkonten, setFinanzkonten]         = useState([]);
  const [bewohner, setBewohner]                 = useState([]);
  const [budgetCategories, setBudgetCategories] = useState(getDefaultHomeBudgetCategories());
  const [bewohnerGeladen, setBewohnerGeladen]   = useState(false);
  const [splitSchritt, setSplitSchritt]         = useState(false);
  const [gespeicherterPostenId, setGespeicherterPostenId] = useState(null);
  const [splitAktiv, setSplitAktiv]             = useState(true);
  const [splitVorgestrecktVon, setSplitVorgestrecktVon] = useState(null);
  const [splitTeilnehmer, setSplitTeilnehmer]   = useState([]);
  const [splitSpeichern, setSplitSpeichern]     = useState(false);
  const [splitValidierungsFehler, setSplitValidierungsFehler] = useState(null);
  const autoBewohnerErstellenRef = React.useRef(false);
  const bewohnerById = useMemo(
    () => Object.fromEntries((bewohner || []).map((eintrag) => [eintrag.id, eintrag])),
    [bewohner],
  );
  const finanzkontenById = useMemo(
    () => Object.fromEntries((finanzkonten || []).map((konto) => [konto.id, konto])),
    [finanzkonten],
  );

  const mapBewohnerOverview = useCallback((data) => (
    (data || []).map((eintrag) => ({
      id: eintrag.id,
      name: eintrag.name || "Bewohner",
      display_name: eintrag.display_name || eintrag.name || "Bewohner",
      linked_user_id: eintrag.linked_user_id || null,
      farbe: eintrag.farbe || "#10B981",
      emoji: eintrag.emoji || "👤",
    }))
  ), []);

  const loadBewohnerOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_bewohner_overview");
    if (error) throw error;
    const mapped = mapBewohnerOverview(data);
    setBewohner(mapped);
    setBewohnerGeladen(true);
    return mapped;
  }, [mapBewohnerOverview]);

  const loadFinanzkonten = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setFinanzkonten([]);
      return [];
    }

    let householdId = getActiveHouseholdId();
    if (!householdId) {
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      householdId = data?.household_id || null;
    }

    if (!householdId) {
      setFinanzkonten([]);
      return [];
    }

    const { data, error } = await supabase
      .from("home_finanzkonten")
      .select("id, name, konto_typ, inhaber_typ, inhaber_bewohner_id, aktiv, sortierung, farbe")
      .eq("household_id", householdId)
      .eq("aktiv", true)
      .order("sortierung");
    if (error) throw error;

    const nextKonten = data || [];
    setFinanzkonten(nextKonten);
    return nextKonten;
  }, [session?.user?.id]);

  const loadBudgetCategories = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setBudgetCategories(getDefaultHomeBudgetCategories());
      return getDefaultHomeBudgetCategories();
    }

    let householdId = getActiveHouseholdId();
    if (!householdId) {
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      householdId = data?.household_id || null;
    }

    if (!householdId) {
      setBudgetCategories(getDefaultHomeBudgetCategories());
      return getDefaultHomeBudgetCategories();
    }

    const { data, error } = await supabase
      .from("home_budget_categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;

    const nextCategories = buildSelectableHomeBudgetCategoryRows(data || []);
    setBudgetCategories(nextCategories);
    return nextCategories;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const [konten, residents] = await Promise.all([
          loadFinanzkonten(),
          loadBewohnerOverview(),
          loadBudgetCategories(),
        ]);
        if (cancelled) return;
        setFinanzkonten(konten);
        setBewohner(residents);
      } catch {
        if (!cancelled) {
          setFinanzkonten([]);
          setBewohner([]);
          setBudgetCategories(getDefaultHomeBudgetCategories());
          setBewohnerGeladen(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBewohnerOverview, loadBudgetCategories, loadFinanzkonten, session?.user?.id]);

  useEffect(() => {
    if (!splitSchritt) return;
    if (bewohner.length < 2) return;
    const defaultPayerId = resolveSplitPayerFromBudgetSelection({
      bewohnerId: budgetBewohnerId || null,
      zahlungskontoId: zahlungskontoId || null,
      kontenById: finanzkontenById,
      bewohnerById,
    });
    if (!defaultPayerId) return;

    setSplitAktiv(true);
    setSplitVorgestrecktVon(defaultPayerId);
    setSplitTeilnehmer((prev) => {
      if (prev.length > 0) return Array.from(new Set([defaultPayerId, ...prev]));
      return Array.from(new Set([defaultPayerId, ...bewohner.map((b) => b.id).filter(Boolean)]));
    });
  }, [
    bewohner,
    bewohnerById,
    budgetBewohnerId,
    finanzkontenById,
    splitSchritt,
    zahlungskontoId,
  ]);

  // Auto-Bewohner: wenn "Privat" gewählt und noch kein Bewohner gesetzt,
  // wird der eigene verlinkte Bewohnereintrag automatisch vorausgewählt.
  // Existiert noch kein verlinkter Eintrag, wird einer angelegt.
  useEffect(() => {
    if (budgetScope !== "privat") return;
    if (budgetBewohnerId) return;
    if (!bewohnerGeladen) return;
    const userId = session?.user?.id;
    if (!userId) return;

    // Fall 1: Verlinkter Bewohnereintrag vorhanden → setzen
    const eigener = bewohner.find((b) => b.linked_user_id === userId);
    if (eigener) {
      autoBewohnerErstellenRef.current = false;
      setBudgetBewohnerId(eigener.id);
      return;
    }

    // Fall 2: Kein verlinkter Eintrag → automatisch anlegen
    const activeHouseholdId = getActiveHouseholdId();
    if (!activeHouseholdId || autoBewohnerErstellenRef.current) return;
    autoBewohnerErstellenRef.current = true;
    const displayName =
      session.user.user_metadata?.username ||
      session.user.user_metadata?.full_name ||
      session.user.email?.split("@")[0] ||
      "Ich";

    (async () => {
      const { error } = await supabase.from("home_bewohner").insert({
        household_id: activeHouseholdId,
        user_id: userId,
        linked_user_id: userId,
        name: displayName,
      });
      if (error) {
        autoBewohnerErstellenRef.current = false;
        return;
      }

      try {
        const overview = await loadBewohnerOverview();
        const aktuellerBewohner = overview.find((eintrag) => eintrag.linked_user_id === userId);
        if (aktuellerBewohner?.id) {
          setBudgetBewohnerId(aktuellerBewohner.id);
          return;
        }
        autoBewohnerErstellenRef.current = false;
      } catch {
        autoBewohnerErstellenRef.current = false;
        // Bei Reload-Fehler bleibt nur die Bewohner-Vorauswahl leer.
      }
    })();
  }, [
    budgetScope,
    budgetBewohnerId,
    bewohner,
    bewohnerGeladen,
    loadBewohnerOverview,
    session?.user?.email,
    session?.user?.id,
    session?.user?.user_metadata?.display_name,
    session?.user?.user_metadata?.full_name,
    session?.user?.user_metadata?.username,
  ]);

  // Budget-Felder
  const initialBudgetKategorie = useMemo(() => {
    const vorgeschlagen = normalizeScannerBudgetKategorie(ergebnis.budget_kategorie_vorschlag);
    const activeCategories = getActiveHomeBudgetCategoryNames(budgetCategories);
    if (activeCategories.includes(vorgeschlagen)) return vorgeschlagen;
    return activeCategories[0] || DEFAULT_HOME_BUDGET_CATEGORY;
  }, [budgetCategories, ergebnis.budget_kategorie_vorschlag]);
  const [budgetKategorie, setBudgetKategorie] = useState(initialBudgetKategorie);
  const selectableBudgetCategories = useMemo(
    () => getSelectableHomeBudgetCategoryNames({
      categories: budgetCategories,
      currentValue: budgetKategorie || initialBudgetKategorie,
    }),
    [budgetCategories, budgetKategorie, initialBudgetKategorie],
  );

  useEffect(() => {
    setBudgetKategorie((current) => {
      if (current && selectableBudgetCategories.includes(current)) return current;
      return initialBudgetKategorie;
    });
  }, [initialBudgetKategorie, selectableBudgetCategories]);
  const [budgetBeschreibung, setBudgetBeschreibung] = useState(
    ergebnis.haendler ? `Einkauf bei ${ergebnis.haendler}` : "Einkauf"
  );

  // Geraete-Felder (erstes erkanntes Geraet)
  const erstesGeraet = useMemo(
    () => positionen.find((p) => p.modul_vorschlag === "geraete") || null,
    [positionen]
  );
  const [geraetName, setGeraetName] = useState(erstesGeraet?.name || "");
  const [geraetHersteller, setGeraetHersteller] = useState("");
  const [gewaehrleistungBis, setGewaehrleistungBis] = useState(() => addJahre(ergebnis.datum, 2));
  const [garantieBis, setGarantieBis] = useState("");
  const [naechsteWartung, setNaechsteWartung] = useState("");

  // Dokument-Felder
  const [dokDateiname, setDokDateiname] = useState(() =>
    buildInvoiceFilename({
      haendler: ergebnis.haendler || "",
      datum: ergebnis.datum || "",
      originalName: datei?.name || "",
      mimeType: datei?.type || "",
    })
  );
  const [dokDateinameManuell, setDokDateinameManuell] = useState(false);
  const [dokBeschreibung, setDokBeschreibung] = useState(
    `Rechnung ${ergebnis.haendler ? "von " + ergebnis.haendler : ""} ${ergebnis.datum || ""}`.trim()
  );

  useEffect(() => {
    if (dokDateinameManuell) return;
    setDokDateiname(
      buildInvoiceFilename({
        haendler,
        datum,
        originalName: datei?.name || "",
        mimeType: datei?.type || "",
      })
    );
  }, [datei?.name, datei?.type, datum, dokDateinameManuell, haendler]);

  const normalizeNumber = useCallback((val) => {
    if (val == null || val === "") return null;
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    const normalized = String(val).replace(",", ".").trim();
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : null;
  }, []);

  const resolveHouseholdId = useCallback(async (userId) => {
    const activeHouseholdId = getActiveHouseholdId();
    if (activeHouseholdId) return activeHouseholdId;

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
  }, []);

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

  const handleSplitSpeichern = useCallback(async () => {
    if (!gespeicherterPostenId) {
      onGespeichert();
      return;
    }

    if (!splitAktiv) {
      setSplitValidierungsFehler(null);
      onGespeichert();
      return;
    }

    const splitFehler = validateSplitConfig({
      aktiv: true,
      payerMemberId: splitVorgestrecktVon,
      teilnehmer: splitTeilnehmer,
      splitMode: "equal",
      betrag: normalizeNumber(gesamt) || 0,
    });
    if (splitFehler) {
      setSplitValidierungsFehler(splitFehler);
      return;
    }

    const shares = buildEqualShares(
      normalizeNumber(gesamt) || 0,
      splitTeilnehmer,
      splitVorgestrecktVon
    );

    if (shares.length === 0) {
      setSplitValidierungsFehler("Bitte mindestens eine weitere beteiligte Person wählen.");
      return;
    }

    setSplitValidierungsFehler(null);
    setSplitSpeichern(true);
    try {
      const householdId = await resolveHouseholdId(session?.user?.id);
      if (!householdId) {
        throw new Error("Haushalt konnte nicht bestimmt werden.");
      }

      const { data: groupData, error: groupError } = await supabase
        .from("budget_split_groups")
        .insert({
          budget_posten_id: gespeicherterPostenId,
          household_id: householdId,
          payer_member_id: splitVorgestrecktVon,
          split_mode: "equal",
        })
        .select("id")
        .single();
      if (groupError) throw groupError;

      const { error: shareError } = await supabase
        .from("budget_split_shares")
        .insert(
          shares.map((share) => ({
            ...share,
            split_group_id: groupData.id,
            household_id: householdId,
          }))
        );

      if (shareError) {
        await supabase.from("budget_split_groups").delete().eq("id", groupData.id);
        throw shareError;
      }

      onGespeichert();
    } catch (err) {
      toastError(err.message || "Kostenaufteilung konnte nicht gespeichert werden.");
    } finally {
      setSplitSpeichern(false);
    }
  }, [
    gespeicherterPostenId,
    gesamt,
    normalizeNumber,
    onGespeichert,
    resolveHouseholdId,
    session?.user?.id,
    splitAktiv,
    splitTeilnehmer,
    splitVorgestrecktVon,
    toastError,
  ]);

  const hatPflichffehler = useMemo(() => {
    const gesamtNum = parseFloat(gesamt.replace(",", "."));
    return !datum || isNaN(gesamtNum) || gesamtNum <= 0;
  }, [datum, gesamt]);

  const handleSplitAktivChange = useCallback((value) => {
    setSplitAktiv(value);
    setSplitValidierungsFehler(null);
  }, []);

  const handleSplitVorgestrecktVonChange = useCallback((value) => {
    setSplitVorgestrecktVon(value);
    setSplitValidierungsFehler(null);
  }, []);

  const handleSplitTeilnehmerChange = useCallback((value) => {
    setSplitTeilnehmer(value);
    setSplitValidierungsFehler(null);
  }, []);

  const insertCriticalDocumentLinks = useCallback(async ({
    householdId,
    dokumentId,
    rechnungId,
    budgetId,
    wissenId,
  }) => {
    const criticalRows = [
      {
        household_id: householdId,
        dokument_id: dokumentId,
        entity_type: "rechnung",
        entity_id: rechnungId,
        role: "original",
      },
      ...(budgetId ? [{
        household_id: householdId,
        dokument_id: dokumentId,
        entity_type: "budget_posten",
        entity_id: budgetId,
        role: "expense",
      }] : []),
    ].filter((row) => row.household_id && row.dokument_id && row.entity_id && row.entity_type);

    if (criticalRows.length > 0) {
      const { error } = await supabase
        .from("dokument_links")
        .upsert(criticalRows, {
          onConflict: "household_id,dokument_id,entity_type,entity_id,role",
        });
      if (error) {
        throw new Error(`Kritische Dokument-Links konnten nicht gespeichert werden: ${error.message}`);
      }
    }

    if (budgetId) {
      const { data: budgetLink, error: verifyError } = await supabase
        .from("dokument_links")
        .select("id")
        .eq("household_id", householdId)
        .eq("dokument_id", dokumentId)
        .eq("entity_type", "budget_posten")
        .eq("entity_id", budgetId)
        .eq("role", "expense")
        .maybeSingle();

      if (verifyError || !budgetLink?.id) {
        throw new Error(
          verifyError?.message
            ? `Budget-Rechnungslink konnte nicht verifiziert werden: ${verifyError.message}`
            : "Budget-Rechnungslink fehlt nach dem Speichern.",
        );
      }
    }

    if (wissenId) {
      const { error } = await supabase
        .from("dokument_links")
        .upsert([{
          household_id: householdId,
          dokument_id: dokumentId,
          entity_type: "home_wissen",
          entity_id: wissenId,
          role: "knowledge",
        }], {
          onConflict: "household_id,dokument_id,entity_type,entity_id,role",
        });
      if (error) {
        return "Wissens-Dokument-Link konnte nicht gespeichert werden.";
      }
    }

    return null;
  }, []);

  // Positionen-Aenderung
  const updatePosition = useCallback((idx, feld, wert) => {
    setPositionen((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [feld]: wert } : p))
    );
  }, []);

  // Modul-Toggle (pflicht-Module koennen nicht deaktiviert werden)
  const toggleModul = useCallback((key) => {
    if (MODUL_CONFIG[key]?.pflicht) return;
    setModulAktiv((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ============================================================
  // Speicher-Logik
  // ============================================================

  const handleSpeichern = useCallback(async () => {
    if (hatPflichffehler) return;
    if (!session?.user?.id) { toastError("Keine gueltige Sitzung vorhanden."); return; }
    setSpeichern(true);

    const userId = session.user.id;
    let dokumentPfad = serverProcessed ? existingStoragePfad : null;
    let dokDatenbankId = serverProcessed ? existingDokumentId : null;
    let rechnungId = serverProcessed ? existingRechnungId : null;
    let wissenId = null;
    let budgetId = null;
    let budgetLinkHouseholdId = null;
    const finalDateiname = sanitizeStorageFilename(dokDateiname || datei?.name || "rechnung.pdf");

    try {
      const householdId = await resolveHouseholdId(userId);
      if (!householdId) {
        throw new Error("Haushalt konnte nicht bestimmt werden.");
      }
      const gesamtNum = normalizeNumber(gesamt);
      if (gesamtNum == null || gesamtNum <= 0) {
        throw new Error("Gesamtbetrag ist ungueltig.");
      }

      // 1. Datei hochladen (nur beim klassischen Bildscan)
      if (!serverProcessed && datei) {
        const ts = Date.now();
        const pfad = `${userId}/${ts}_${finalDateiname}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("user-dokumente")
          .upload(pfad, datei, { upsert: false, contentType: datei.type });
        if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`);
        dokumentPfad = uploadData?.path;
      }

      // 2. Dokument-Eintrag anlegen oder vorhandenen Server-Record aktualisieren
      if (serverProcessed) {
        if (!dokDatenbankId) throw new Error("Dokument-ID fehlt fuer serververarbeitete Rechnung.");
        const { error: dokUpdateErr } = await supabase
          .from("dokumente")
          .update({
            dateiname: finalDateiname,
            beschreibung: dokBeschreibung,
            kategorie: "Rechnung",
            dokument_typ: "rechnung",
          })
          .eq("id", dokDatenbankId);
        if (dokUpdateErr) {
          throw new Error(`Dokument-Aktualisierung fehlgeschlagen: ${dokUpdateErr.message}`);
        }
      } else {
        const { data: dokData, error: dokErr } = await supabase
          .from("dokumente")
          .insert({
            user_id:       userId,
            household_id:  householdId,
            app_modus:     "home",
            dateiname:     finalDateiname,
            beschreibung:  dokBeschreibung,
            storage_pfad:  dokumentPfad,
            datei_typ:     datei?.type || null,
            kategorie:     "Rechnung",
            dokument_typ:  "rechnung",
          })
          .select("id")
          .single();

        if (dokErr) {
          if (dokumentPfad) {
            try {
              await supabase.storage.from("user-dokumente").remove([dokumentPfad]);
            } catch (e) { console.warn("Storage-Rollback fehlgeschlagen:", e); }
          }
          throw new Error(`Dokument-Speicherung fehlgeschlagen: ${dokErr.message}`);
        }
        dokDatenbankId = dokData?.id ?? null;
      }
      if (!dokDatenbankId) {
        throw new Error("Dokument-ID fehlt nach dem Speichern.");
      }

      // 3. Rechnungskopf speichern oder vorhandenen Server-Record aktualisieren
      const rechnungPayload = {
        household_id:    householdId,
        dokument_id:     dokDatenbankId,
        lieferant_name:  haendler || null,
        rechnungsdatum:  datum || null,
        brutto:          gesamtNum,
        raw_text:        ergebnis.roher_text || null,
        confidence:      ergebnis.confidence ?? null,
      };
      const { data: rechnungData, error: rechnungErr } = serverProcessed && rechnungId
        ? await supabase
          .from("rechnungen")
          .update(rechnungPayload)
          .eq("id", rechnungId)
          .select("id")
          .single()
        : await supabase
          .from("rechnungen")
          .insert(rechnungPayload)
          .select("id")
          .single();
      if (rechnungErr) {
        throw new Error(`Rechnung konnte nicht gespeichert werden: ${rechnungErr.message}`);
      }
      rechnungId = rechnungData?.id ?? null;
      if (!rechnungId) {
        throw new Error("Rechnungs-ID fehlt nach dem Speichern.");
      }

      // 4. Rechnungspositionen speichern
      const positionsRows = (positionen || [])
        .filter((pos) => pos?.name)
        .map((pos, index) => ({
          household_id: householdId,
          rechnung_id: rechnungId,
          pos_nr: index + 1,
          beschreibung: pos.name || null,
          menge: normalizeNumber(pos.menge),
          einheit: pos.einheit || null,
          einzelpreis: normalizeNumber(pos.einzelpreis),
          gesamtpreis: normalizeNumber(pos.gesamtpreis),
          klassifikation: {
            obergruppe: pos.obergruppe || null,
            modul_vorschlag: pos.modul_vorschlag || null,
            confidence: pos.confidence ?? null,
          },
      }));
      if (serverProcessed) {
        const { error: deletePosErr } = await supabase
          .from("rechnungs_positionen")
          .delete()
          .eq("rechnung_id", rechnungId);
        if (deletePosErr) {
          throw new Error(`Bestehende Rechnungspositionen konnten nicht aktualisiert werden: ${deletePosErr.message}`);
        }
      }
      if (positionsRows.length > 0) {
        const { error: posErr } = await supabase.from("rechnungs_positionen").insert(positionsRows);
        if (posErr) {
          throw new Error(`Rechnungspositionen konnten nicht gespeichert werden: ${posErr.message}`);
        }
      }

      const warnings = [];

      // 5. home_wissen INSERT
      try {
        const titelTeile = [
          "Rechnung",
          haendler || null,
          datum
            ? new Date(datum).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })
            : null,
        ].filter(Boolean);
        const fallbackInhalt = `Rechnung ${haendler ? `bei ${haendler} ` : ""}${datum || ""}`.trim();
        const invoiceSummary = {
          kind: "invoice",
          documentClass: "rechnung",
          documentType: "rechnung",
          merchant: haendler || null,
          date: datum || null,
          amount: gesamtNum,
          currency: "EUR",
          items: (positionen || []).filter((pos) => pos?.name).map((pos) => ({
            name: pos.name,
            amount: normalizeNumber(pos.gesamtpreis),
            quantity: normalizeNumber(pos.menge),
            unit: pos.einheit || null,
          })),
          headline: zusammenfassung.trim() || fallbackInhalt,
        };
        const title = titelTeile.join(" - ");
        const localizedContent = {
          de: {
            title,
            content: buildInvoiceKnowledgeContent(invoiceSummary, "de"),
            headline: buildInvoiceKnowledgeContent(invoiceSummary, "de"),
          },
          "en-GB": {
            title,
            content: buildInvoiceKnowledgeContent(invoiceSummary, "en-GB"),
            headline: buildInvoiceKnowledgeContent(invoiceSummary, "en-GB"),
          },
        };
        const wissenPayload = {
          user_id:      userId,
          household_id: householdId,
          titel:        title,
          inhalt:       zusammenfassung.trim() || fallbackInhalt,
          kategorie:    "Rechnungen & Belege",
          tags:         ["rechnung", ...(haendler ? [haendler.toLowerCase().split(" ")[0]] : [])],
          dokument_id:  dokDatenbankId,
          rechnung_id:  rechnungId,
          herkunft:     "auto_full",
          summary:      invoiceSummary,
          localized_content: localizedContent,
          source_locale: locale === "en-GB" ? "en-GB" : "de",
        };
        const { data: wissenData, error: wissenErr } = serverProcessed
          ? await supabase
            .from("home_wissen")
            .upsert(wissenPayload, { onConflict: "dokument_id" })
            .select("id")
            .single()
          : await supabase
            .from("home_wissen")
            .insert(wissenPayload)
            .select("id")
            .single();
        if (wissenErr) {
          warnings.push("Wissens-Eintrag konnte nicht gespeichert werden.");
        } else {
          wissenId = wissenData?.id ?? null;
        }
      } catch { warnings.push("Wissens-Eintrag fehlgeschlagen."); }

      // 6. Budget (wenn aktiv)
      if (modulAktiv.budget) {
        try {
          const budgetPayload = {
            user_id:          userId,
            household_id:     householdId,
            beschreibung:     budgetBeschreibung || `Einkauf ${haendler}`,
            betrag:           Math.abs(gesamtNum),
            datum:            datum || null,
            kategorie:        budgetKategorie,
            app_modus:        "home",
            typ:              "ausgabe",
            budget_scope:     budgetScope,
            zahlungskonto_id: zahlungskontoId || null,
            bewohner_id:      budgetBewohnerId || null,
          };
          const { data: budgetData, error: budgetErr } = await insertBudgetPostenRobust(budgetPayload);
          if (budgetErr) {
            warnings.push(`Budget konnte nicht gespeichert werden (${budgetErr.message || "unbekannter Fehler"}).`);
          } else {
            budgetId = budgetData?.id ?? null;
            budgetLinkHouseholdId = budgetData?.household_id || householdId;
          }
        } catch (budgetCatchErr) {
          warnings.push(`Budget fehlgeschlagen (${budgetCatchErr?.message || "unbekannter Fehler"}).`);
        }
      }

      // 7. Dokumentverknuepfungen speichern
      const wissenLinkWarning = await insertCriticalDocumentLinks({
        householdId: budgetLinkHouseholdId || householdId,
        dokumentId: dokDatenbankId,
        rechnungId,
        budgetId,
        wissenId,
      });
      if (wissenLinkWarning) {
        warnings.push(wissenLinkWarning);
      }

      // 8. Geraete (wenn aktiv)
      if (modulAktiv.geraete && geraetName) {
        try {
          const { data: geraetData, error: geraetErr } = await supabase
            .from("home_geraete")
            .insert({
              user_id:      userId,
              household_id: householdId,
              name:        geraetName,
              hersteller:  geraetHersteller || null,
              kaufdatum:   datum || null,
              kaufpreis:           gesamtNum,
              gewaehrleistung_bis: gewaehrleistungBis || null,
              garantie_bis:        garantieBis        || null,
            })
            .select("id")
            .single();

          if (geraetErr) {
            warnings.push("Geraet konnte nicht gespeichert werden.");
          } else if (geraetData?.id) {
            try {
              await supabase.from("dokument_links").insert({
                household_id: householdId,
                dokument_id:  dokDatenbankId,
                entity_type:  "home_geraet",
                entity_id:    geraetData.id,
                role:         "source",
              });
            } catch { warnings.push("Dokument-Verknüpfung konnte nicht gespeichert werden."); }

            if (naechsteWartung) {
              try {
                await supabase.from("home_wartungen").insert({
                  geraet_id:           geraetData.id,
                  naechste_faelligkeit: naechsteWartung,
                  beschreibung:        "Wartung",
                });
              } catch { warnings.push("Wartung konnte nicht gespeichert werden."); }
            }
          }
        } catch { warnings.push("Geraet fehlgeschlagen."); }
      }

      // 9. Vorraete (wenn aktiv)
      if (modulAktiv.vorraete) {
        try {
          const vorraetePositionen = positionen.filter((p) => p.modul_vorschlag === "vorraete");
          for (const pos of vorraetePositionen) {
            const { error: vErr } = await supabase.from("home_vorraete").insert({
              user_id:      userId,
              household_id: householdId,
              name:         pos.name,
              bestand:      normalizeNumber(pos.menge) || 1,
              einheit:      "Stueck",
              kategorie:    pos.obergruppe || "keine_zuordnung",
              mindestmenge: 1,
            });
            if (vErr) { warnings.push("Vorrat konnte nicht gespeichert werden."); break; }
          }
        } catch { warnings.push("Vorraete fehlgeschlagen."); }
      }

      // 10. Medikamente (wenn aktiv)
      if (modulAktiv.medikamente) {
        try {
          const medPositionen = positionen.filter((p) => p.modul_vorschlag === "medikamente");
          const { data: vorhandeneMedikamente } = await supabase
            .from("home_medikamente")
            .select("*")
            .eq("household_id", householdId);
          for (const pos of medPositionen) {
            const kandidat = {
              name: pos.name,
              wirkstoff: pos.wirkstoff || null,
              darreichungsform: pos.darreichungsform || null,
              packungsgroesse: pos.packungsgroesse || null,
            };
            const vorhandenes = findExistingMedication(vorhandeneMedikamente || [], kandidat);
            const menge = normalizeNumber(pos.menge) || 1;
            if (vorhandenes) {
              const { error: updateErr } = await supabase
                .from("home_medikamente")
                .update({
                  bestand: Number(vorhandenes.bestand || 0) + Number(menge),
                  kaufdatum: datum || vorhandenes.kaufdatum || null,
                  preis: normalizeNumber(pos.gesamtpreis) || vorhandenes.preis || null,
                  haendler: haendler || vorhandenes.haendler || null,
                  rechnung_id: rechnungId,
                  rechnung_dokument_id: dokDatenbankId,
                })
                .eq("id", vorhandenes.id);
              if (updateErr) { warnings.push("Medikament-Bestand konnte nicht aktualisiert werden."); break; }
              await supabase.from("dokument_links").insert({
                household_id: householdId,
                dokument_id: dokDatenbankId,
                entity_type: "medikament",
                entity_id: vorhandenes.id,
                role: "rechnung",
              });
            } else {
              const { data: medData, error: medErr } = await supabase
                .from("home_medikamente")
                .insert({
                  user_id: userId,
                  household_id: householdId,
                  name: pos.name,
                  wirkstoff: pos.wirkstoff || null,
                  darreichungsform: pos.darreichungsform || null,
                  packungsgroesse: pos.packungsgroesse || null,
                  bestand: menge,
                  mindestbestand: 1,
                  kategorie: pos.obergruppe || "Sonstiges",
                  kaufdatum: datum || null,
                  preis: normalizeNumber(pos.gesamtpreis) || null,
                  haendler: haendler || null,
                  rechnung_id: rechnungId,
                  rechnung_dokument_id: dokDatenbankId,
                  source_payload: { source: "rechnung_scan", position: pos },
                })
                .select("id")
                .single();
              if (medErr) { warnings.push("Medikament konnte nicht gespeichert werden."); break; }
              if (medData?.id) {
                await supabase.from("dokument_links").insert({
                  household_id: householdId,
                  dokument_id: dokDatenbankId,
                  entity_type: "medikament",
                  entity_id: medData.id,
                  role: "rechnung",
                });
              }
            }
          }
        } catch { warnings.push("Medikamente fehlgeschlagen."); }
      }

      // 11. Inventar (wenn aktiv)
      if (modulAktiv.inventar) {
        try {
          const inventarPositionen = positionen.filter((p) => p.modul_vorschlag === "inventar");
          for (const pos of inventarPositionen) {
            const { error: iErr } = await supabase.from("home_objekte").insert({
              user_id:    userId,
              household_id: householdId,
              name:      pos.name,
              kategorie: pos.obergruppe || "keine_zuordnung",
              status:    "vorhanden",
              kaufpreis: normalizeNumber(pos.gesamtpreis),
              kaufdatum: datum || null,
            });
            if (iErr) { warnings.push("Inventar konnte nicht gespeichert werden."); break; }
          }
        } catch { warnings.push("Inventar fehlgeschlagen."); }
      }

      if (warnings.length > 0) {
        toastError("Rechnung gespeichert, aber: " + warnings.join("; "));
      } else {
        success("Rechnung gespeichert.");
      }

      await notifyHouseholdEvent({
        supabaseClient: supabase,
        userId,
        table: "rechnungen",
        action: "erstellt",
        recordName: haendler || finalDateiname || "Rechnung",
        recordId: rechnungId,
        url: "/home/budget",
        title: "Neue Rechnung gespeichert",
        body: `${haendler || "Eine Rechnung"} wurde gespeichert${budgetId ? " und im Budget erfasst" : ""}.`,
      });

      if (budgetId) {
        await notifyHouseholdEvent({
          supabaseClient: supabase,
          userId,
          table: "budget_posten",
          action: "erstellt",
          recordName: budgetBeschreibung || haendler || finalDateiname || "Rechnung",
          recordId: budgetId,
          url: "/home/budget",
          tag: `invoice-budget-history-${budgetId}`,
          history: true,
          push: false,
          historyOptions: { householdId: budgetLinkHouseholdId || householdId },
        });
      }

      if (budgetId) {
        try {
          await syncFuelImports({
            householdId: budgetLinkHouseholdId || householdId,
            userId,
            includeInvoicePositions: true,
          });
        } catch (fuelSyncError) {
          console.warn("Tankbeleg-Synchronisation fehlgeschlagen:", fuelSyncError);
        }
      }

      if (budgetId && bewohner.length >= 2) {
        setGespeicherterPostenId(budgetId);
        setSplitSchritt(true);
        return;
      }

      onGespeichert();
    } catch (err) {
      if (budgetId) {
        try { await supabase.from("budget_posten").delete().eq("id", budgetId); } catch {}
      }
      if (wissenId && !serverProcessed) {
        try { await supabase.from("home_wissen").delete().eq("id", wissenId); } catch {}
      }
      if (rechnungId && !serverProcessed) {
        try { await supabase.from("rechnungen").delete().eq("id", rechnungId); } catch {}
      }
      if (dokDatenbankId && !serverProcessed) {
        try { await supabase.from("dokumente").delete().eq("id", dokDatenbankId); } catch {}
      }
      if (dokumentPfad && !serverProcessed) {
        try { await supabase.storage.from("user-dokumente").remove([dokumentPfad]); } catch {}
      }
      console.error("Speicher-Fehler:", err);
      toastError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSpeichern(false);
    }
  }, [
    hatPflichffehler, gesamt, datei, session, dokDateiname, dokBeschreibung,
    datum, modulAktiv, budgetBeschreibung, haendler, budgetKategorie,
    budgetScope, zahlungskontoId, budgetBewohnerId, locale,
    geraetName, geraetHersteller, gewaehrleistungBis, garantieBis, naechsteWartung, ergebnis,
    positionen, zusammenfassung, success, toastError, onGespeichert,
    normalizeNumber, resolveHouseholdId, insertBudgetPostenRobust, insertCriticalDocumentLinks,
    bewohner.length, existingDokumentId, existingRechnungId, existingStoragePfad, serverProcessed,
  ]);

  // ============================================================
  // Render
  // ============================================================

  const niedrigeConfidence = ergebnis.confidence < 0.4;
  const reviewNoetigCount = positionen.filter((p) => p.review_noetig).length;

  if (splitSchritt) {
    return (
      <ModalShell
        open
        title="Kostenaufteilung"
        onClose={() => {
          setSplitSchritt(false);
          onGespeichert();
        }}
        closeOnBackdrop={false}
        closeOnEscape={false}
        maxWidthClass="max-w-3xl"
        footer={
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setSplitSchritt(false);
                onGespeichert();
              }}
              className="px-4 py-3 rounded-card-sm border border-canvas-3 text-sm text-dark-text-main hover:bg-canvas-2 transition-colors"
            >
              Ueberspringen
            </button>
            <button
              type="button"
              onClick={handleSplitSpeichern}
              disabled={splitSpeichern || !gespeicherterPostenId}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-card-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              {splitSpeichern ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Aufteilen
            </button>
          </div>
        }
      >
        {false && <div className="sticky top-0 z-10 bg-canvas-1 border-b border-canvas-3 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              setSplitSchritt(false);
              onGespeichert();
            }}
            className="p-1.5 rounded-lg hover:bg-canvas-2 text-dark-text-main transition-colors"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-dark-text-main flex-1">Kostenaufteilung</h2>
        </div>}

        <div className="max-w-3xl mx-auto w-full space-y-4">
          <div className="rounded-card border border-canvas-3 bg-canvas-1 p-4">
            <h3 className="text-base font-semibold text-dark-text-main mb-1">
              Rechnung gespeichert
            </h3>
            <p className="text-sm text-dark-text-secondary">
              Wenn du möchtest, kannst du die Budgetbuchung jetzt direkt auf Bewohner aufteilen.
            </p>
          </div>

          <div className="rounded-card border border-canvas-3 bg-canvas-1 p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-dark-text-secondary mb-1">
                Budgetbuchung
              </p>
              <p className="text-sm font-medium text-dark-text-main">
                {budgetBeschreibung || `Einkauf ${haendler || ""}`.trim()}
              </p>
              <p className="text-sm text-dark-text-secondary">
                {(normalizeNumber(gesamt) || 0).toFixed(2)} €
              </p>
            </div>

            <KostenAufteilungAuswahl
              bewohner={bewohner}
              betrag={normalizeNumber(gesamt) || 0}
              splitAktiv={splitAktiv}
              onSplitAktivChange={handleSplitAktivChange}
              vorgestrecktVon={splitVorgestrecktVon}
              teilnehmer={splitTeilnehmer}
              onVorgestrecktVonChange={handleSplitVorgestrecktVonChange}
              onTeilnehmerChange={handleSplitTeilnehmerChange}
              showSettlementHinweis={false}
              modeVariant="equalOnly"
            />
            {splitValidierungsFehler && (
              <p className="text-sm text-accent-danger">{splitValidierungsFehler}</p>
            )}
          </div>

          <div className="hidden">
            <button
              type="button"
              onClick={() => {
                setSplitSchritt(false);
                onGespeichert();
              }}
              className="px-4 py-2 rounded-card-sm border border-canvas-3 text-sm text-dark-text-main hover:bg-canvas-2 transition-colors"
            >
              Überspringen
            </button>
          </div>
        </div>
        {false && <div className="sticky bottom-0 z-10 border-t border-canvas-3 bg-canvas-1/95 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setSplitSchritt(false);
                onGespeichert();
              }}
              className="px-4 py-3 rounded-card-sm border border-canvas-3 text-sm text-dark-text-main hover:bg-canvas-2 transition-colors"
            >
              ?berspringen
            </button>
            <button
              type="button"
              onClick={handleSplitSpeichern}
              disabled={splitSpeichern || !gespeicherterPostenId}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-card-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              {splitSpeichern ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Aufteilen
            </button>
          </div>
        </div>}
      </ModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-canvas-0 overflow-y-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-canvas-1 border-b border-canvas-3 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onAbbrechen}
          className="p-1.5 rounded-lg hover:bg-canvas-2 text-dark-text-main transition-colors"
          aria-label="Abbrechen"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold text-dark-text-main flex-1">Rechnung pruefen</h2>
        <button
          onClick={handleSpeichern}
          disabled={hatPflichffehler || speichern}
          className="flex items-center gap-1.5 px-4 py-2 rounded-card-sm bg-primary-500
                     hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold
                     transition-colors shadow-sm"
        >
          {speichern ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Speichern
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 pb-[calc(var(--mobile-bottom-offset)+1.25rem)] space-y-5">
        {/* Warnungen */}
        {niedrigeConfidence && (
          <div className="flex items-start gap-3 p-3 rounded-card-sm bg-accent-danger/10 border border-accent-danger/30">
            <AlertTriangle size={18} className="text-accent-danger mt-0.5 shrink-0" />
            <p className="text-sm text-dark-text-main">
              Die Bildqualitaet oder Erkennungsgenauigkeit ist niedrig. Bitte alle Felder sorgfaeltig pruefen.
            </p>
          </div>
        )}
        {reviewNoetigCount > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-card-sm bg-accent-warm/10 border border-accent-warm/30">
            <Info size={18} className="text-accent-warm mt-0.5 shrink-0" />
            <p className="text-sm text-dark-text-main">
              {reviewNoetigCount} Position{reviewNoetigCount > 1 ? "en" : ""} mit unsicherer Klassifizierung. Bitte unten pruefen.
            </p>
          </div>
        )}

        {/* Stammdaten */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">Rechnungsdaten</h3>
          <InputFeld label="Haendler / Lieferant" value={haendler} onChange={setHaendler} placeholder="z.B. REWE, MediaMarkt" />
          <div className="grid grid-cols-2 gap-3">
            <InputFeld label="Datum *" value={datum} onChange={setDatum} type="date" />
            <InputFeld label="Gesamtbetrag (EUR) *" value={gesamt} onChange={setGesamt} type="number" placeholder="0.00" />
          </div>
          {hatPflichffehler && (
            <p className="text-xs text-accent-danger">Datum und Betrag sind Pflichtfelder.</p>
          )}
        </div>

        {/* Zusammenfassung */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">Zusammenfassung</h3>
          <p className="text-xs text-dark-text-secondary">
            Wird in deiner Wissensdatenbank gespeichert. Du kannst den Text anpassen.
          </p>
          <textarea
            value={zusammenfassung}
            onChange={(e) => setZusammenfassung(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                       text-sm text-dark-text-main focus:outline-none focus:border-primary-500
                       transition-colors resize-none"
            placeholder="Automatisch generierte Zusammenfassung..."
          />
        </div>

        {/* Modul-Auswahl */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">In welche Module speichern?</h3>
          <div className="space-y-2">
            {Object.entries(MODUL_CONFIG).map(([key, cfg]) => (
              <label
                key={key}
                className={`flex items-center gap-3 p-2.5 rounded-card-sm cursor-pointer transition-colors
                  ${modulAktiv[key] ? "bg-canvas-2" : "bg-canvas-1 opacity-60"}
                  ${cfg.pflicht ? "cursor-not-allowed" : "hover:bg-canvas-2"}`}
              >
                <input
                  type="checkbox"
                  checked={modulAktiv[key]}
                  onChange={() => toggleModul(key)}
                  disabled={cfg.pflicht}
                  className="w-4 h-4 accent-primary-500"
                />
                <span className={`${cfg.farbe} flex items-center gap-1.5 text-sm font-medium`}>
                  {cfg.icon}{cfg.label}
                </span>
                {cfg.pflicht && (
                  <span className="ml-auto text-xs text-dark-text-secondary">immer</span>
                )}
                {key === "budget" && !modulAktiv.budget && (
                  <span className="ml-auto text-xs text-dark-text-secondary">kein Budgeteintrag</span>
                )}
                {key === "budget" && modulAktiv.budget && (
                  <div className="ml-auto flex gap-1" onClick={(e) => e.preventDefault()}>
                    {["haushalt", "privat"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => { e.preventDefault(); setBudgetScope(s); }}
                        className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors
                          ${budgetScope === s
                            ? "bg-primary-500 text-white border-primary-500"
                            : "border-canvas-3 text-dark-text-secondary hover:border-primary-500/50"}`}
                      >
                        {s === "haushalt" ? "Haushalt" : "Privat"}
                      </button>
                    ))}
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Positionen */}
        {positionen.length > 0 && (
          <AkkordeonSektion
            title={`Positionen (${positionen.length})`}
            icon={<Package size={16} />}
            defaultOffen={reviewNoetigCount > 0}
            kinder={positionen.map((pos, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-card-sm border ${
                  pos.review_noetig
                    ? "border-accent-warm/50 bg-accent-warm/5"
                    : "border-canvas-3 bg-canvas-2"
                } space-y-2`}
              >
                {pos.review_noetig && (
                  <span className="inline-flex items-center gap-1 text-xs text-accent-warm font-medium">
                    <AlertTriangle size={12} /> Bitte pruefen
                  </span>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs text-dark-text-secondary">Name</label>
                    <input
                      type="text"
                      value={pos.name || ""}
                      onChange={(e) => updatePosition(idx, "name", e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-text-secondary">Menge</label>
                    <input
                      type="number"
                      value={pos.menge || 1}
                      onChange={(e) => updatePosition(idx, "menge", Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-text-secondary">Preis (EUR)</label>
                    <input
                      type="number"
                      value={pos.gesamtpreis || 0}
                      onChange={(e) => updatePosition(idx, "gesamtpreis", Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-dark-text-secondary">Modul</label>
                  <select
                    value={pos.modul_vorschlag || "keine_zuordnung"}
                    onChange={(e) => updatePosition(idx, "modul_vorschlag", e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                               text-xs text-dark-text-main focus:outline-none focus:border-primary-500"
                  >
                    {MODUL_OPTIONEN.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          />
        )}

        {/* Budget-Details */}
        {modulAktiv.budget && (
          <AkkordeonSektion
            title="Budget-Details"
            icon={<Wallet size={16} />}
            defaultOffen={true}
            kinder={
              <>
                <InputFeld label="Beschreibung" value={budgetBeschreibung} onChange={setBudgetBeschreibung} />
                <SelectFeld
                  label="Kategorie"
                  value={budgetKategorie}
                  onChange={setBudgetKategorie}
                  optionen={selectableBudgetCategories}
                />
                <div>
                  <label className="block text-xs text-dark-text-secondary mb-1">Anrechnung</label>
                  <div className="flex gap-2">
                    {["haushalt", "privat"].map(s => (
                      <button key={s} type="button" onClick={() => setBudgetScope(s)}
                        className={`flex-1 py-1.5 rounded-card-sm text-sm font-medium border transition-colors
                          ${budgetScope === s
                            ? "bg-primary-500 text-white border-primary-500"
                            : "border-canvas-3 text-dark-text-secondary"}`}>
                        {s === "haushalt" ? "Haushalt" : "Privat"}
                      </button>
                    ))}
                  </div>
                </div>
                {finanzkonten.length > 0 && (
                  <SelectFeld
                    label="Bezahlt von"
                    value={zahlungskontoId}
                    onChange={setZahlungskontoId}
                    optionen={[{ value: "", label: "Kein Konto" }, ...finanzkonten.map(k => ({ value: k.id, label: k.name }))]}
                  />
                )}
                {bewohner.length > 0 && (
                  <SelectFeld
                    label="Bewohner"
                    value={budgetBewohnerId}
                    onChange={setBudgetBewohnerId}
                    optionen={[
                      { value: "", label: "Kein Bewohner" },
                      ...bewohner.map((b) => ({ value: b.id, label: getBewohnerDisplayName(b) })),
                    ]}
                  />
                )}
              </>
            }
          />
        )}

        {/* Geraete-Details */}
        {modulAktiv.geraete && (
          <AkkordeonSektion
            title="Geraet & Wartung"
            icon={<Cpu size={16} />}
            defaultOffen={true}
            kinder={
              <>
                <InputFeld label="Geraetename *" value={geraetName} onChange={setGeraetName} placeholder="z.B. Waschmaschine XY" />
                <InputFeld label="Hersteller" value={geraetHersteller} onChange={setGeraetHersteller} placeholder="z.B. Bosch" />
                <div className="grid grid-cols-2 gap-3">
                  <InputFeld
                    label="Gewaehrleistung bis"
                    value={gewaehrleistungBis}
                    onChange={setGewaehrleistungBis}
                    type="date"
                  />
                  <InputFeld
                    label="Herstellergarantie bis (optional)"
                    value={garantieBis}
                    onChange={setGarantieBis}
                    type="date"
                  />
                </div>
                <InputFeld
                  label="Naechste Wartung (optional)"
                  value={naechsteWartung}
                  onChange={setNaechsteWartung}
                  type="date"
                />
              </>
            }
          />
        )}

        {/* Dokument-Details */}
        <AkkordeonSektion
          title="Dokument"
          icon={<FileText size={16} />}
          defaultOffen={false}
          kinder={
            <>
              <InputFeld
                label="Dateiname"
                value={dokDateiname}
                onChange={(value) => {
                  setDokDateinameManuell(true);
                  setDokDateiname(value);
                }}
              />
              <InputFeld label="Beschreibung" value={dokBeschreibung} onChange={setDokBeschreibung} />
            </>
          }
        />

        {/* Spacer fuer Sticky Footer */}
        <div className="h-4" />
      </div>

      {/* Sticky Footer (mobil) */}
      <div className="sticky bottom-0 bg-canvas-1 border-t border-canvas-3 px-4 py-3 flex gap-3">
        <button
          onClick={onAbbrechen}
          className="flex-1 py-3 rounded-card-sm bg-canvas-2 hover:bg-canvas-3
                     text-sm font-medium text-dark-text-main transition-colors border border-canvas-3"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSpeichern}
          disabled={hatPflichffehler || speichern}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-card-sm
                     bg-primary-500 hover:bg-primary-600 disabled:opacity-50
                     text-white text-sm font-semibold transition-colors shadow-sm"
        >
          {speichern ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Speichern
        </button>
      </div>
    </div>
  );
}
