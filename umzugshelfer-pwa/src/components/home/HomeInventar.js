import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Package, Plus, ChevronRight, ChevronDown, Trash2, Edit2, MoreVertical,
  QrCode, Tag, X, Loader2, Search, MapPin, Box, SlidersHorizontal,
  AlertCircle, Sparkles, BookOpen, Wrench, FileText, Link2,
  Zap, UtensilsCrossed, Palette,
} from "lucide-react";
import { supabase, getActiveHouseholdId } from "../../supabaseClient";
import { QRCodeSVG } from "qrcode.react";
import { getBewohnerDisplayName } from "../../utils/budgetAccounts";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import useViewport from "../../hooks/useViewport";
import MobileLocationSheet from "./inventar/MobileLocationSheet";
import MobileFilterSheet from "./inventar/MobileFilterSheet";
import BuecherRegalTab from "./buecher/BuecherRegalTab";
import GeraetForm, { normalizeDeviceCategory } from "./geraete/GeraetForm";
import GeraetZeile from "./geraete/GeraetZeile";
import DokumentVorschauModal from "./DokumentVorschauModal";
import { applyInventoryAiItems } from "../../utils/assistantDomainAdapters";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { DEFAULT_GERAET_FORM, buildGeraetPayload, mapGeraetToForm } from "../../utils/geraeteForm";
import {
  heuteIso,
  berechneGeraetStatus,
} from "../../utils/geraetStatus";
import GlassSurface, {
  glassCollapseVariants,
  glassItemVariants,
  glassPageVariants,
  glassSurfaceClass,
} from "../ui/GlassSurface";

// --- BewohnerBadge ---
const BewohnerBadge = ({ bewohner }) => {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bewohner.farbe + "22", color: bewohner.farbe }}
    >
      <span>{bewohner.emoji}</span>
      <span>{getBewohnerDisplayName(bewohner)}</span>
    </span>
  );
};

// --- Hilfsfunktionen ---

const STATUS_LABEL = {
  in_verwendung: "In Verwendung",
  eingelagert: "Eingelagert",
  verliehen: "Verliehen",
  defekt: "Defekt",
  entsorgt: "Entsorgt",
};

const KATEGORIE_FARBE = {
  "Elektronik": { grad: "from-blue-500 to-cyan-500",    icon: "bg-blue-500/15 text-blue-400"     },
  "Kleidung":   { grad: "from-rose-500 to-pink-500",    icon: "bg-rose-500/15 text-rose-400"     },
  "Küche":      { grad: "from-orange-500 to-amber-500", icon: "bg-orange-500/15 text-orange-400" },
  "Bücher":     { grad: "from-amber-400 to-yellow-400", icon: "bg-amber-500/15 text-amber-400"   },
  "Werkzeug":   { grad: "from-red-500 to-orange-500",   icon: "bg-red-500/15 text-red-400"       },
  "Deko":       { grad: "from-purple-500 to-violet-500",icon: "bg-purple-500/15 text-purple-400" },
  "Dokumente":  { grad: "from-indigo-500 to-blue-500",  icon: "bg-indigo-500/15 text-indigo-400" },
  "Sport":      { grad: "from-green-500 to-teal-500",   icon: "bg-green-500/15 text-green-400"   },
  "Sonstiges":  { grad: "from-slate-400 to-gray-500",   icon: "bg-slate-500/15 text-slate-400"   },
};
const KAT_FARBE_DEFAULT = { grad: "from-slate-400 to-gray-500", icon: "bg-slate-500/15 text-slate-400" };
const KATEGORIE_ICON_MAP = {
  "Elektronik": Zap, "Küche": UtensilsCrossed, "Bücher": BookOpen,
  "Werkzeug": Wrench, "Deko": Palette, "Dokumente": FileText,
};
const ZUGRIFF_LABEL = {
  taeglich: "Täglich", woechentlich: "Wöchentlich",
  monatlich: "Monatlich", selten: "Selten", nie: "Nie",
};

const STATUS_CARD_CONFIG = {
  in_verwendung: { accent: "bg-primary-500",   dot: "bg-primary-500",   badge: "border-primary-500/30 bg-primary-500/15 text-primary-500" },
  eingelagert:   { accent: "bg-blue-500",       dot: "bg-blue-500",      badge: "border-blue-500/30 bg-blue-500/15 text-blue-400" },
  verliehen:     { accent: "bg-accent-yellow",  dot: "bg-accent-yellow", badge: "border-accent-yellow/30 bg-accent-yellow/15 text-accent-yellow" },
  defekt:        { accent: "bg-accent-danger",  dot: "bg-accent-danger", badge: "border-accent-danger/30 bg-accent-danger/15 text-accent-danger" },
  entsorgt:      { accent: "bg-canvas-3",       dot: "bg-dark-text-secondary", badge: "border-dark-border bg-canvas-3 text-dark-text-secondary" },
};

// --- Ort-Formular ---
const OrtForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const { t } = useTranslation(["home"]);
  const [name, setName] = useState(initial?.name || "");
  const [typ, setTyp] = useState(initial?.typ || "Wohnung");
  const typen = ["Wohnung", "Keller", "Garage", "Dachboden", "Gartenhaus", "Sonstiges"];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name*</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Meine Wohnung"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Typ</label>
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
        >
          {typen.map((typ_) => <option key={typ_} value={typ_}>{t(`home:inventoryForm.locations.${typ_}`, { defaultValue: typ_ })}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={() => name.trim() && onSpeichern({ name: name.trim(), typ })} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50" disabled={!name.trim()}>Speichern</button>
      </div>
    </div>
  );
};

// --- Lagerort-Formular ---
const LagerortForm = ({ ortId, parentId, initial, onSpeichern, onAbbrechen }) => {
  const [name, setName] = useState(initial?.name || "");
  const [typ, setTyp] = useState(initial?.typ || "Regal");
  const typen = ["Regal", "Schrank", "Lade", "Schublade", "Fach", "Kiste", "Box", "Karton", "Sonstiges"];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name*</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Regal 2"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Typ</label>
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
        >
          {typen.map((typ_) => <option key={typ_} value={typ_}>{typ_}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={() => name.trim() && onSpeichern({ name: name.trim(), typ, ort_id: ortId, parent_id: parentId || null })} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50" disabled={!name.trim()}>Speichern</button>
      </div>
    </div>
  );
};

// --- Objekt-Formular ---
const ObjektForm = ({ ortId, lagerortId, initial, bewohner, onSpeichern, onAbbrechen }) => {
  const { t } = useTranslation(["home"]);
  const [form, setForm] = useState({
    name: initial?.name || "",
    beschreibung: initial?.beschreibung || "",
    kategorie: initial?.kategorie || "",
    status: initial?.status || "in_verwendung",
    menge: initial?.menge || 1,
    zugriffshaeufigkeit: initial?.zugriffshaeufigkeit || "selten",
    tags: initial?.tags?.join(", ") || "",
    bewohner_id: initial?.bewohner_id || "",
  });

  const statusOptionen = Object.keys(STATUS_LABEL);
  const kategorien = ["Elektronik", "Kleidung", "Küche", "Bücher", "Werkzeug", "Deko", "Dokumente", "Sport", "Sonstiges"];
  const haeufigkeit = ["taeglich", "woechentlich", "monatlich", "selten", "nie"];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name*</label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="z.B. HDMI-Kabel"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {statusOptionen.map((s) => <option key={s} value={s}>{t(`home:inventoryForm.status.${s}`, { defaultValue: STATUS_LABEL[s] })}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Menge</label>
          <input
            type="number"
            min="1"
            value={form.menge}
            onChange={(e) => setForm((p) => ({ ...p, menge: Number(e.target.value) }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
          <select value={form.kategorie} onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            <option value="">— wählen —</option>
            {kategorien.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Zugriffshäufigkeit</label>
          <select value={form.zugriffshaeufigkeit} onChange={(e) => setForm((p) => ({ ...p, zugriffshaeufigkeit: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {haeufigkeit.map((h) => <option key={h} value={h}>{h.charAt(0).toUpperCase() + h.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Tags (kommagetrennt)</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
          placeholder="z.B. saisonal, Technik, zerbrechlich"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      {bewohner && bewohner.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Gehört wem?</label>
          <select
            value={form.bewohner_id}
            onChange={(e) => setForm((p) => ({ ...p, bewohner_id: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            <option value="">— Niemanden zuordnen —</option>
            {bewohner.map((b) => (
              <option key={b.id} value={b.id}>{b.emoji} {getBewohnerDisplayName(b)}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button
          onClick={() => form.name.trim() && onSpeichern({
            ...form,
            name: form.name.trim(),
            tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
            ort_id: ortId,
            lagerort_id: lagerortId || null,
            bewohner_id: form.bewohner_id || null,
          })}
          className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
          disabled={!form.name.trim()}
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

// --- Hauptkomponente ---
const HomeInventar = ({ session }) => {
  const { t } = useTranslation(["home"]);
  const userId = session?.user?.id;
  const { isMobile } = useViewport();
  const reducedMotion = useReducedMotion();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("inventar");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Bereichs-Umschalter: "objekte" | "buecher"
  const [bereich, setBereich] = useState("objekte");
  const [householdId, setHouseholdId] = useState(null);
  const [kontakte, setKontakte] = useState([]);

  const [loading, setLoading] = useState(true);
  const [orte, setOrte] = useState([]);
  const [lagerorte, setLagerorte] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [geraete, setGeraete] = useState([]);
  const [wartungen, setWartungen] = useState([]);
  const [dokumente, setDokumente] = useState([]);
  const [geraetFormData, setGeraetFormData] = useState(DEFAULT_GERAET_FORM);
  const [geraetQuelleObjekt, setGeraetQuelleObjekt] = useState(null);
  const [vorschauDok, setVorschauDok] = useState(null);
  const [dokuModal, setDokuModal] = useState(null);
  const [ausgewaehlterOrt, setAusgewaehlterOrt] = useState(null);
  const [ausgewaehlterLagerort, setAusgewaehlterLagerort] = useState(null);
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bewohnerFilter, setBewohnerFilter] = useState("");
  const [bewohner, setBewohner] = useState([]);
  const [modal, setModal] = useState(null); // { typ: "ort"|"lagerort"|"objekt"|"qr", daten }
  const [aufgeklapptGeraete, setAufgeklapptGeraete] = useState({});
  const [aufgeklapptOrte, setAufgeklapptOrte] = useState({});
  const [aufgeklapptKarten, setAufgeklapptKarten] = useState({});
  const toggleGeraet = useCallback(
    (id) => setAufgeklapptGeraete((prev) => (!!prev[id] ? {} : { [id]: true })), []
  );
  const toggleKarte = useCallback(
    (id) => setAufgeklapptKarten((prev) => (!!prev[id] ? {} : { [id]: true })), []
  );
  const [fehler, setFehler] = useState(null);
  const [kiOffen, setKiOffen] = useState(false);
  const [mobileLocationSheetOpen, setMobileLocationSheetOpen] = useState(false);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
  const [offenesObjektMenue, setOffenesObjektMenue] = useState(null);

  // Query-Param ?tab=buecher
  useEffect(() => {
    if (searchParams.get("tab") === "buecher") setBereich("buecher");
  }, [searchParams]);

  useEffect(() => {
    const assistantFlow = location.state?.assistantFlow;
    if (!assistantFlow) return;
    if (assistantFlow.ui_state?.tab === "buecher") {
      setBereich("buecher");
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  // householdId auflösen (wie HomeBudget.js)
  const resolveHouseholdId = useCallback(async () => {
    const active = getActiveHouseholdId();
    if (active) { setHouseholdId(active); return active; }
    const { data } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const id = data?.household_id ?? null;
    setHouseholdId(id);
    return id;
  }, [userId]);

  // Kontakte für Verleih laden (nur wenn Bücherbereich aktiv)
  const ladeKontakte = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("kontakte")
      .select("id, name")
      .eq("user_id", userId)
      .order("name");
    setKontakte(data ?? []);
  }, [userId]);

  useEffect(() => {
    if (bereich === "buecher") {
      resolveHouseholdId();
      ladeKontakte();
    }
  }, [bereich, resolveHouseholdId, ladeKontakte]);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [orteRes, lagerorteRes, objekteRes, geraeteRes, wartungenRes, dokRes] = await Promise.all([
        supabase.from("home_orte").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_lagerorte").select("*").eq("user_id", userId).order("position").order("name"),
        supabase.from("home_objekte").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_geraete").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_wartungen").select("*").eq("user_id", userId).order("datum", { ascending: false }),
        supabase.from("dokumente").select("id, dateiname, datei_typ, storage_pfad").eq("user_id", userId).in("app_modus", ["home", "beides"]).order("dateiname"),
      ]);
      setOrte(orteRes.data || []);
      setLagerorte(lagerorteRes.data || []);
      setObjekte(objekteRes.data || []);
      setGeraete(geraeteRes.data || []);
      setWartungen(wartungenRes.data || []);
      setDokumente(dokRes.data || []);
    } catch (e) {
      setFehler("Fehler beim Laden der Inventardaten.");
    } finally {
      setLoading(false);
    }
    // Bewohner separat laden — schlägt still fehl wenn Tabelle noch nicht existiert
    supabase.rpc("get_bewohner_overview")
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setBewohner(
            data.map((b) => ({
              id: b.id,
              name: b.name || "Bewohner",
              display_name: b.display_name || b.name || "Bewohner",
              farbe: b.farbe || "#10B981",
              emoji: b.emoji || "👤",
            })),
          );
        }
      });
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // --- CRUD Ort ---
  const speichereOrt = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_orte").update(daten).eq("id", modal.daten.id);
      await notifyHouseholdEvent({
        userId,
        table: "home_orte",
        action: "geaendert",
        recordName: daten.name,
        recordId: modal.daten.id,
        url: "/home/inventar",
        push: false,
      });
    } else {
      const { data: neuerOrt } = await supabase
        .from("home_orte")
        .insert(payload)
        .select("id, name")
        .single();
      await notifyHouseholdEvent({
        userId,
        table: "home_orte",
        action: "erstellt",
        recordName: neuerOrt?.name || daten.name,
        recordId: neuerOrt?.id,
        url: "/home/inventar",
      });
    }
    setModal(null);
    ladeDaten();
  };

  const loescheOrt = async (id) => {
    if (!window.confirm("Ort und alle Lagerorte/Objekte darin löschen?")) return;
    const ort = orte.find((eintrag) => eintrag.id === id);
    await supabase.from("home_orte").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_orte",
      action: "geloescht",
      recordName: ort?.name,
      recordId: id,
      url: "/home/inventar",
    });
    if (ausgewaehlterOrt === id) setAusgewaehlterOrt(null);
    ladeDaten();
  };

  // --- CRUD Lagerort ---
  const speichereLagerort = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_lagerorte").update(daten).eq("id", modal.daten.id);
      await notifyHouseholdEvent({
        userId,
        table: "home_lagerorte",
        action: "geaendert",
        recordName: daten.name,
        recordId: modal.daten.id,
        url: "/home/inventar",
        push: false,
      });
    } else {
      const { data: neuerLagerort } = await supabase
        .from("home_lagerorte")
        .insert(payload)
        .select("id, name")
        .single();
      await notifyHouseholdEvent({
        userId,
        table: "home_lagerorte",
        action: "erstellt",
        recordName: neuerLagerort?.name || daten.name,
        recordId: neuerLagerort?.id,
        url: "/home/inventar",
      });
    }
    setModal(null);
    ladeDaten();
  };

  const loescheLagerort = async (id) => {
    if (!window.confirm("Lagerort und alle Objekte darin löschen?")) return;
    const lagerort = lagerorte.find((eintrag) => eintrag.id === id);
    await supabase.from("home_lagerorte").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_lagerorte",
      action: "geloescht",
      recordName: lagerort?.name,
      recordId: id,
      url: "/home/inventar",
    });
    if (ausgewaehlterLagerort === id) setAusgewaehlterLagerort(null);
    ladeDaten();
  };

  // --- CRUD Objekt ---
  const speichereObjekt = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_objekte").update(daten).eq("id", modal.daten.id);
      await notifyHouseholdEvent({
        userId,
        table: "home_objekte",
        action: "geaendert",
        recordName: daten.name,
        recordId: modal.daten.id,
        url: "/home/inventar",
        push: false,
      });
    } else {
      const { data: neuesObjekt } = await supabase
        .from("home_objekte")
        .insert(payload)
        .select("id, name")
        .single();
      await notifyHouseholdEvent({
        userId,
        table: "home_objekte",
        action: "erstellt",
        recordName: neuesObjekt?.name || daten.name,
        recordId: neuesObjekt?.id,
        url: "/home/inventar",
      });
    }
    setModal(null);
    ladeDaten();
  };

  const speichereGeraet = async (daten) => {
    const cleanDaten = buildGeraetPayload(daten);
    if (daten.id) {
      await supabase.from("home_geraete").update(cleanDaten).eq("id", daten.id);
      await notifyHouseholdEvent({
        userId,
        table: "home_geraete",
        action: "geaendert",
        recordName: daten.name,
        recordId: daten.id,
        url: "/home/geraete",
        push: false,
      });
    } else {
      const { data: neuesGeraet } = await supabase
        .from("home_geraete")
        .insert({ ...cleanDaten, user_id: userId })
        .select("id, name")
        .single();
      if (geraetQuelleObjekt?.id) {
        await supabase
          .from("home_objekte")
          .update({ status: "entsorgt" })
          .eq("id", geraetQuelleObjekt.id);
      }
      await notifyHouseholdEvent({
        userId,
        table: "home_geraete",
        action: "erstellt",
        recordName: neuesGeraet?.name || daten.name,
        recordId: neuesGeraet?.id,
        url: "/home/geraete",
      });
    }
    setModal(null);
    setGeraetFormData(DEFAULT_GERAET_FORM);
    setGeraetQuelleObjekt(null);
    ladeDaten();
  };

  const loescheGeraet = async (id) => {
    if (!window.confirm(t("home:devicesDeleteConfirm", { defaultValue: "Gerät und alle Wartungseinträge löschen?" }))) return;
    const geraet = geraete.find((eintrag) => eintrag.id === id);
    await supabase.from("home_geraete").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_geraete",
      action: "geloescht",
      recordName: geraet?.name,
      recordId: id,
      url: "/home/inventar",
    });
    ladeDaten();
  };

  const wartungErledigt = async (geraetId) => {
    const g = geraete.find((x) => x.id === geraetId);
    if (!g) return;
    const neuesDatum = g.wartungsintervall_monate
      ? new Date(Date.now() + g.wartungsintervall_monate * 30 * 86400000).toISOString().split("T")[0]
      : null;
    await supabase.from("home_wartungen").insert({
      user_id: userId,
      geraet_id: geraetId,
      datum: new Date().toISOString().split("T")[0],
      typ: "Wartung",
      beschreibung: t("home:devicesForm.maintenanceDoneNote"),
    });
    if (neuesDatum) {
      await supabase.from("home_geraete").update({ naechste_wartung: neuesDatum }).eq("id", geraetId);
    }
    await notifyHouseholdEvent({
      userId,
      table: "home_wartungen",
      action: "geaendert",
      recordName: g.name,
      recordId: geraetId,
      url: "/home/inventar",
      tag: `wartung-erledigt-${geraetId}`,
      pushPolicy: "always",
      title: t("home:devicesMaintenanceDone", { defaultValue: "Wartung erledigt" }),
      body: g.name
        ? t("home:devicesMaintenanceDoneBody", { device: g.name, defaultValue: `Wartung für "${g.name}" wurde erledigt.` })
        : t("home:devicesMaintenanceDoneBodyGeneric", { defaultValue: "Wartung wurde erledigt." }),
    });
    ladeDaten();
  };

  const toggleDokumentLink = async (geraetId, dokId) => {
    const g = geraete.find((x) => x.id === geraetId);
    if (!g) return;
    const current = g.verknuepfte_dokument_ids || [];
    const updated = current.includes(dokId)
      ? current.filter((id) => id !== dokId)
      : [...current, dokId];
    await supabase.from("home_geraete").update({ verknuepfte_dokument_ids: updated }).eq("id", geraetId);
    setGeraete((prev) =>
      prev.map((x) => x.id === geraetId ? { ...x, verknuepfte_dokument_ids: updated } : x)
    );
  };

  const loescheObjekt = async (id) => {
    if (!window.confirm("Objekt löschen?")) return;
    const objekt = objekte.find((eintrag) => eintrag.id === id);
    await supabase.from("home_objekte").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_objekte",
      action: "geloescht",
      recordName: objekt?.name,
      recordId: id,
      url: "/home/inventar",
    });
    ladeDaten();
  };

  // --- QR generieren ---
  const generiereQr = async (lagerortId) => {
    const qrWert = `home-lagerort-${lagerortId}-${Date.now()}`;
    await supabase.from("home_lagerorte").update({ qr_code_wert: qrWert }).eq("id", lagerortId);
    ladeDaten();
    setModal({ typ: "qr", daten: { qrWert } });
  };

  const heute = useMemo(() => heuteIso(), []);

  const statusByGeraetId = useMemo(() =>
    Object.fromEntries(geraete.map((g) => [g.id, berechneGeraetStatus(g, heute)])),
    [geraete, heute]);

  const wartungenByGeraetId = useMemo(() => {
    const map = {};
    wartungen.forEach((w) => { (map[w.geraet_id] ??= []).push(w); });
    return map;
  }, [wartungen]);

  const dokumenteById = useMemo(() =>
    Object.fromEntries(dokumente.map((d) => [d.id, d])),
    [dokumente]);

  const verknuepfteDokuByGeraetId = useMemo(() =>
    Object.fromEntries(geraete.map((g) => [
      g.id,
      (g.verknuepfte_dokument_ids || []).map((id) => dokumenteById[id]).filter(Boolean),
    ])),
    [geraete, dokumenteById]);

  const inventarEintraege = [
    ...objekte.map((objekt) => ({ ...objekt, eintrag_typ: "objekt", sort_name: objekt.name || "" })),
    ...geraete.map((geraet) => ({
      ...geraet,
      eintrag_typ: "geraet",
      sort_name: geraet.name || "",
      status: geraet.status || "in_verwendung",
      menge: geraet.menge || 1,
      tags: Array.isArray(geraet.tags) ? geraet.tags : [],
      bewohner_id: geraet.bewohner_id || null,
      zugriffshaeufigkeit: geraet.zugriffshaeufigkeit || "selten",
    })),
  ].sort((a, b) => a.sort_name.localeCompare(b.sort_name));

  // --- Gefilterte Objekte und Geraete ---
  const gefilterteObjekte = inventarEintraege.filter((o) => {
    const passOrt = !ausgewaehlterOrt || o.ort_id === ausgewaehlterOrt;
    const passLagerort = !ausgewaehlterLagerort || o.lagerort_id === ausgewaehlterLagerort;
    const passStatus = !statusFilter || o.status === statusFilter;
    const passAktiv = Boolean(statusFilter) || o.status !== "entsorgt";
    const passBewohner = !bewohnerFilter || o.bewohner_id === bewohnerFilter;
    const suchfelder = o.eintrag_typ === "geraet"
      ? [o.name, o.hersteller, o.modell, o.seriennummer, ...(o.tags || [])]
      : [o.name, ...(o.tags || [])];
    const passSuche = !suche || suchfelder.some((feld) => String(feld || "").toLowerCase().includes(suche.toLowerCase()));
    return passOrt && passLagerort && passStatus && passAktiv && passBewohner && passSuche;
  });

  // --- Lagerorte eines Ortes (nur Root-Level) ---
  const lagerorteVonOrt = (ortId, parentId = null) =>
    lagerorte.filter((l) => l.ort_id === ortId && l.parent_id === parentId);

  const aktiveObjekteAnzahl = inventarEintraege.filter((o) => o.status !== "entsorgt").length;
  const ausgewaehlterOrtObj = orte.find((o) => o.id === ausgewaehlterOrt) || null;
  const ausgewaehlterLagerortObj = lagerorte.find((l) => l.id === ausgewaehlterLagerort) || null;
  const aktiveFilterAnzahl = [statusFilter, bewohnerFilter].filter(Boolean).length;
  const standortLabel = ausgewaehlterLagerortObj
    ? `${ausgewaehlterOrtObj?.name || "Ort"} - ${ausgewaehlterLagerortObj.name}`
    : ausgewaehlterOrtObj?.name || `Alle (${aktiveObjekteAnzahl})`;

  const objektModalPayload = {
    ort_id: ausgewaehlterOrt,
    lagerort_id: ausgewaehlterLagerort,
  };

  const handleObjektHinzufuegen = () => {
    if (!ausgewaehlterOrt) {
      setMobileLocationSheetOpen(true);
      return;
    }
    setModal({ typ: "objekt", daten: objektModalPayload });
  };

  const handleGeraetHinzufuegen = () => {
    setGeraetQuelleObjekt(null);
    const initial = {
      ...DEFAULT_GERAET_FORM,
      ort_id: ausgewaehlterOrt || "",
      lagerort_id: ausgewaehlterLagerort || "",
    };
    setGeraetFormData(initial);
    setModal({ typ: "geraet", daten: initial });
  };

  const openEditGeraet = (geraet) => {
    setGeraetQuelleObjekt(null);
    setGeraetFormData(mapGeraetToForm(geraet));
    setModal({ typ: "geraet", daten: geraet });
  };

  const mapObjektZuGeraetForm = (objekt) => ({
    ...DEFAULT_GERAET_FORM,
    name: objekt.name || "",
    notizen: objekt.beschreibung || "",
    kategorie: normalizeDeviceCategory(objekt.kategorie || ""),
    status: objekt.status || "in_verwendung",
    menge: objekt.menge || 1,
    tags: Array.isArray(objekt.tags) ? objekt.tags.join(", ") : "",
    bewohner_id: objekt.bewohner_id || "",
    zugriffshaeufigkeit: objekt.zugriffshaeufigkeit || "selten",
    ort_id: objekt.ort_id || "",
    lagerort_id: objekt.lagerort_id || "",
    kaufdatum: objekt.kaufdatum || "",
    kaufpreis: objekt.kaufpreis ?? "",
    garantie_bis: objekt.garantie_bis || "",
  });

  const verwalteObjektAlsGeraet = (objekt) => {
    setOffenesObjektMenue(null);
    setGeraetQuelleObjekt(objekt);
    setGeraetFormData(mapObjektZuGeraetForm(objekt));
    setModal({ typ: "geraet", daten: { quelle_objekt_id: objekt.id } });
  };

  const closeModal = () => {
    setModal(null);
    setGeraetQuelleObjekt(null);
  };

  useEffect(() => {
    setOffenesObjektMenue(null);
  }, [suche, statusFilter, bewohnerFilter, ausgewaehlterOrt, ausgewaehlterLagerort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div
      data-testid="inventory-full-width"
      className="inventory-modern glass-module relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8"
    >
      {/* Titel + Tab-Navigation */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Inventar</h1>
        </div>
      </div>

      {/* Tab-Switcher */}
      <div className={`${glassSurfaceClass} flex overflow-hidden p-1.5 mb-4`}>
        <button
          onClick={() => setBereich("objekte")}
          className={`relative flex min-h-10 items-center gap-1.5 rounded-card-sm px-4 py-2 text-sm font-medium transition-colors ${
            bereich === "objekte"
              ? "text-primary-500"
              : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-white/50 hover:text-light-text-main dark:hover:bg-white/[0.05] dark:hover:text-dark-text-main"
          }`}
        >
          {bereich === "objekte" && !reducedMotion ? <motion.span layoutId="inventory-active-tab" className="absolute inset-0 -z-10 rounded-card-sm border border-primary-500/20 bg-primary-500/10 shadow-glow-primary" /> : null}
          <Package size={14} />
          Objekte
        </button>
        <button
          onClick={() => setBereich("buecher")}
          className={`relative flex min-h-10 items-center gap-1.5 rounded-card-sm px-4 py-2 text-sm font-medium transition-colors ${
            bereich === "buecher"
              ? "text-teal-500"
              : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-white/50 hover:text-light-text-main dark:hover:bg-white/[0.05] dark:hover:text-dark-text-main"
          }`}
        >
          {bereich === "buecher" && !reducedMotion ? <motion.span layoutId="inventory-active-tab" className="absolute inset-0 -z-10 rounded-card-sm border border-teal-500/20 bg-teal-500/10 shadow-glow-primary" /> : null}
          <BookOpen size={14} />
          Bücherregal
        </button>
      </div>

      {/* Bücherregal-Bereich */}
      <AnimatePresence mode="wait">
        {bereich === "buecher" && (
          <motion.div key="buecher" variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" exit="exit">
            <BuecherRegalTab
              householdId={householdId}
              session={session}
              orte={orte}
              lagerorte={lagerorte}
              kontakte={kontakte}
              assistantFlow={location.state?.assistantFlow || null}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Objekte-Bereich — nur rendern wenn aktiv */}
      <AnimatePresence mode="wait">
      {bereich === "objekte" && (<motion.div key="objekte" variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" exit="exit" className="space-y-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium
                       bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                       border border-primary-500/30 transition-colors"
            title="Per KI erfassen"
          >
            <Sparkles size={15} />
            <span className="hidden sm:inline">KI</span>
          </button>
          <button
            onClick={() => setModal({ typ: "ort", daten: null })}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Neuer Standort</span>
            <span className="sm:hidden">Standort</span>
          </button>
        </div>
      </div>
      </div>

      {fehler && (
        <div className="mb-4 p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          {fehler}
        </div>
      )}

      {isMobile && (
        <>
          <div
            data-tour="tour-inventar-filter"
            className="sticky top-[72px] z-20 -mx-4 px-4 py-3 bg-light-bg/55 dark:bg-canvas-1/45 glass-chrome border-y border-light-border/70 dark:border-white/[0.08] space-y-2"
          >
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suche nach Objekt, Gerät oder Tag..."
                className="w-full pl-8 pr-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMobileFilterSheetOpen(false);
                  setMobileLocationSheetOpen(true);
                }}
                className="px-3 py-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-left text-sm text-light-text-main dark:text-dark-text-main"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={14} className="text-light-text-secondary dark:text-dark-text-secondary shrink-0" />
                  <span className="truncate">{standortLabel}</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setMobileLocationSheetOpen(false);
                  setMobileFilterSheetOpen(true);
                }}
                className="px-3 py-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-sm text-light-text-main dark:text-dark-text-main"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
                  Filter
                  {aktiveFilterAnzahl > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary-500/15 text-primary-500">
                      {aktiveFilterAnzahl}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {aktiveFilterAnzahl > 0 && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setBewohnerFilter("");
                }}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary underline underline-offset-2"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>

          {ausgewaehlterLagerortObj && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setModal({ typ: "lagerort", daten: ausgewaehlterLagerortObj })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap border border-light-border dark:border-dark-border rounded-card-sm bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main"
              >
                <Edit2 size={11} /> Lagerort bearbeiten
              </button>
              {ausgewaehlterLagerortObj.qr_code_wert ? (
                <button
                  onClick={() => setModal({ typ: "qr", daten: { qrWert: ausgewaehlterLagerortObj.qr_code_wert } })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap border border-light-border dark:border-dark-border rounded-card-sm bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main"
                >
                  <QrCode size={11} /> QR anzeigen
                </button>
              ) : (
                <button
                  onClick={() => generiereQr(ausgewaehlterLagerortObj.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap border border-light-border dark:border-dark-border rounded-card-sm bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main"
                >
                  <QrCode size={11} /> QR generieren
                </button>
              )}
            </div>
          )}

          {gefilterteObjekte.length === 0 ? (
            <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
              <Package size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Keine Objekte gefunden</p>
              {ausgewaehlterOrt && (
                <button
                  onClick={handleObjektHinzufuegen}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  Erstes Objekt hinzufügen
                </button>
              )}
            </div>
          ) : (
            <div data-tour="tour-inventar-liste" className="space-y-2.5 pb-24">
              {gefilterteObjekte.map((obj, idx) => {
                const ort = orte.find((o) => o.id === obj.ort_id);
                const lagerort = lagerorte.find((l) => l.id === obj.lagerort_id);
                const statusCfg = STATUS_CARD_CONFIG[obj.status] ?? STATUS_CARD_CONFIG.in_verwendung;
                const istGeraet = obj.eintrag_typ === "geraet";
                if (istGeraet) {
                  return (
                    <div
                      key={`geraet-${obj.id}`}
                      className="relative overflow-visible animate-slide-in-up"
                      style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
                    >
                      <GeraetZeile
                        g={obj}
                        status={statusByGeraetId[obj.id]}
                        heute={heute}
                        geraetWartungen={wartungenByGeraetId[obj.id] || []}
                        verknuepfteDokumente={verknuepfteDokuByGeraetId[obj.id] || []}
                        isOffen={!!aufgeklapptGeraete[obj.id]}
                        onToggle={() => toggleGeraet(obj.id)}
                        onBearbeiten={() => openEditGeraet(obj)}
                        onLoeschen={() => loescheGeraet(obj.id)}
                        onWartungErledigt={() => wartungErledigt(obj.id)}
                        onDokuModalOpen={() => setDokuModal(obj.id)}
                        onDokumentUnlink={(dokId) => toggleDokumentLink(obj.id, dokId)}
                        onVorschau={(dok) => setVorschauDok(dok)}
                        onNavigate={(dokId) => navigate("/home/dokumente", { state: { focusDokumentId: dokId } })}
                        orte={orte}
                        lagerorte={lagerorte}
                        bewohner={bewohner}
                      />
                    </div>
                  );
                }
                return (
                  <GlassSurface
                    key={`${obj.eintrag_typ}-${obj.id}`}
                    className="overflow-hidden rounded-card-sm"
                  >
                    <div className={`absolute inset-x-0 top-0 h-0.5 ${statusCfg.accent}`} />
                    <div className="p-3 pt-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main truncate">{obj.name}</h3>
                          {istGeraet && (
                            <p className="inline-flex items-center gap-1 text-[10px] text-primary-500 mt-0.5">
                              <Wrench size={9} /> Gerät
                            </p>
                          )}
                          {lagerort && (
                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                              {ort?.name} → {lagerort.name}
                            </p>
                          )}
                        </div>
                        {!istGeraet && <button
                          onClick={() => setOffenesObjektMenue((prev) => (prev === obj.id ? null : obj.id))}
                          className="w-7 h-7 rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary flex items-center justify-center hover:bg-light-border dark:hover:bg-canvas-3 transition-colors shrink-0"
                          aria-label="Objekt-Aktionen"
                        >
                          <MoreVertical size={13} />
                        </button>}
                      </div>

                      {!istGeraet && offenesObjektMenue === obj.id && (
                        <div className="mb-2.5 grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => { setOffenesObjektMenue(null); setModal({ typ: "objekt", daten: obj }); }}
                            className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs border border-light-border dark:border-dark-border rounded-card-sm text-light-text-main dark:text-dark-text-main hover:bg-primary-500/10 hover:text-primary-500 hover:border-primary-500/30 transition-colors"
                          >
                            <Edit2 size={11} /> Bearbeiten
                          </button>
                          <button
                            onClick={() => verwalteObjektAlsGeraet(obj)}
                            className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs border border-primary-500/30 rounded-card-sm text-primary-500 hover:bg-primary-500/10 transition-colors"
                          >
                            <Wrench size={11} /> Als Geraet
                          </button>
                          <button
                            onClick={() => { setOffenesObjektMenue(null); loescheObjekt(obj.id); }}
                            className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs border border-accent-danger/30 rounded-card-sm text-accent-danger hover:bg-accent-danger/10 transition-colors"
                          >
                            <Trash2 size={11} /> Löschen
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusCfg.badge}`}>
                          <span className={`h-1 w-1 rounded-full shrink-0 ${statusCfg.dot}`} />
                          {t(`home:inventoryForm.status.${obj.status}`, { defaultValue: STATUS_LABEL[obj.status] })}
                        </span>
                        {istGeraet && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-500">
                            <Wrench size={9} /> Gerät
                          </span>
                        )}
                        {!istGeraet && obj.menge > 1 && (
                          <span className="px-1.5 py-0.5 rounded-pill bg-light-border dark:bg-canvas-3 text-[10px] font-medium text-light-text-secondary dark:text-dark-text-secondary">×{obj.menge}</span>
                        )}
                        {!istGeraet && <BewohnerBadge bewohner={bewohner.find((b) => b.id === obj.bewohner_id)} />}
                      </div>

                      {!istGeraet && obj.tags && obj.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {obj.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-secondary-500/10 text-secondary-500">
                              <Tag size={8} />{tag}
                            </span>
                          ))}
                          {obj.tags.length > 2 && <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">+{obj.tags.length - 2}</span>}
                        </div>
                      )}
                    </div>
                  </GlassSurface>
                );
              })}
            </div>
          )}

          <button
            data-tour="tour-inventar-hinzufuegen"
            onClick={handleObjektHinzufuegen}
            className="md:hidden fixed right-4 px-4 py-2.5 rounded-pill bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium shadow-elevation-2 z-40"
            style={{ bottom: "calc(var(--mobile-bottom-offset, 0px) + 12px)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              Objekt
            </span>
          </button>
          <button
            onClick={handleGeraetHinzufuegen}
            className="md:hidden fixed right-4 px-4 py-2.5 rounded-pill bg-light-card dark:bg-canvas-2 border border-primary-500/30 text-primary-500 text-sm font-medium shadow-elevation-2 z-40"
            style={{ bottom: "calc(var(--mobile-bottom-offset, 0px) + 58px)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Wrench size={14} />
              Gerät
            </span>
          </button>

          <MobileLocationSheet
            open={mobileLocationSheetOpen}
            onClose={() => setMobileLocationSheetOpen(false)}
            orte={orte}
            lagerorte={lagerorte}
            objekte={inventarEintraege}
            expandedByOrt={aufgeklapptOrte}
            onToggleOrt={(ortId) => setAufgeklapptOrte((prev) => ({ ...prev, [ortId]: !prev[ortId] }))}
            ausgewaehlterOrt={ausgewaehlterOrt}
            ausgewaehlterLagerort={ausgewaehlterLagerort}
            onSelectAll={() => {
              setAusgewaehlterOrt(null);
              setAusgewaehlterLagerort(null);
            }}
            onSelectOrt={(ortId) => {
              setAusgewaehlterOrt(ortId);
              setAusgewaehlterLagerort(null);
            }}
            onSelectLagerort={(ortId, lagerortId) => {
              setAusgewaehlterOrt(ortId);
              setAusgewaehlterLagerort(lagerortId);
            }}
            onCreateOrt={() => {
              setMobileLocationSheetOpen(false);
              setModal({ typ: "ort", daten: null });
            }}
            onAddLagerort={(ortId) => {
              setMobileLocationSheetOpen(false);
              setModal({ typ: "lagerort", daten: { ort_id: ortId } });
            }}
            onEditOrt={(ort) => {
              setMobileLocationSheetOpen(false);
              setModal({ typ: "ort", daten: ort });
            }}
            onDeleteOrt={loescheOrt}
            onEditLagerort={(lagerort) => {
              setMobileLocationSheetOpen(false);
              setModal({ typ: "lagerort", daten: lagerort });
            }}
            onDeleteLagerort={loescheLagerort}
          />

          <MobileFilterSheet
            open={mobileFilterSheetOpen}
            onClose={() => setMobileFilterSheetOpen(false)}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            statusLabel={Object.fromEntries(Object.keys(STATUS_LABEL).map(k => [k, t(`home:inventoryForm.status.${k}`, { defaultValue: STATUS_LABEL[k] })]))}
            bewohnerFilter={bewohnerFilter}
            onBewohnerChange={setBewohnerFilter}
            bewohner={bewohner}
            onReset={() => {
              setStatusFilter("");
              setBewohnerFilter("");
            }}
          />
        </>
      )}

      {!isMobile && <div className="flex gap-5">
        {/* Sidebar: Standorte */}
        <div className="w-64 flex-shrink-0">
          <div className={`${glassSurfaceClass} overflow-hidden`}>
            <div className="px-3 py-2.5 border-b border-light-border dark:border-dark-border flex items-center gap-2">
              <div className="w-1 h-3.5 rounded-pill bg-primary-500 shrink-0" />
              <h2 className="text-[10px] font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Standorte</h2>
            </div>

            {/* Alle anzeigen */}
            <button
              onClick={() => { setAusgewaehlterOrt(null); setAusgewaehlterLagerort(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-l-2 ${
                !ausgewaehlterOrt
                  ? "border-primary-500 bg-primary-500/10 text-primary-500 font-medium"
                  : "border-transparent text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
              }`}
            >
              <MapPin size={13} className="shrink-0" />
              <span className="flex-1 text-left truncate">Alle</span>
              <span className="ml-auto px-1.5 py-0.5 rounded-pill text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                {aktiveObjekteAnzahl}
              </span>
            </button>

            {orte.map((ort) => {
              const ортLagerorte = lagerorteVonOrt(ort.id);
              const ortCount = inventarEintraege.filter((o) => o.ort_id === ort.id && o.status !== "entsorgt").length;
              const isOffen = aufgeklapptOrte[ort.id];
              return (
                <div key={ort.id}>
                  <div className={`flex items-center group border-l-2 transition-colors ${
                    ausgewaehlterOrt === ort.id && !ausgewaehlterLagerort
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-transparent hover:bg-light-hover dark:hover:bg-canvas-3"
                  }`}>
                    <button
                      onClick={() => setAufgeklapptOrte((p) => ({ ...p, [ort.id]: !isOffen }))}
                      className="pl-3 pr-1 py-2.5 text-light-text-secondary dark:text-dark-text-secondary shrink-0"
                    >
                      {isOffen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <button
                      onClick={() => { setAusgewaehlterOrt(ort.id); setAusgewaehlterLagerort(null); }}
                      className={`flex-1 text-left text-sm font-medium truncate py-2.5 ${
                        ausgewaehlterOrt === ort.id && !ausgewaehlterLagerort
                          ? "text-primary-500"
                          : "text-light-text-main dark:text-dark-text-main"
                      }`}
                    >
                      {ort.name}
                    </button>
                    <span className="px-1.5 py-0.5 rounded-pill text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary mr-1 shrink-0">
                      {ortCount}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2 shrink-0">
                      <button onClick={() => setModal({ typ: "lagerort", daten: { ort_id: ort.id } })} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:bg-primary-500/10 transition-colors"><Plus size={11} /></button>
                      <button onClick={() => setModal({ typ: "ort", daten: ort })} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-secondary-500 hover:bg-secondary-500/10 transition-colors"><Edit2 size={11} /></button>
                      <button onClick={() => loescheOrt(ort.id)} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors"><Trash2 size={11} /></button>
                    </div>
                  </div>
                  {isOffen && ортLagerorte.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { setAusgewaehlterOrt(ort.id); setAusgewaehlterLagerort(l.id); }}
                      className={`w-full flex items-center gap-2 pl-9 pr-3 py-2 text-xs border-l-2 transition-colors ${
                        ausgewaehlterLagerort === l.id
                          ? "border-primary-500 bg-primary-500/10 text-primary-500"
                          : "border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                      }`}
                    >
                      <Box size={11} className="shrink-0" />
                      <span className="truncate flex-1">{l.name}</span>
                      <span className="px-1.5 py-0.5 rounded-pill text-[10px] bg-light-border dark:bg-canvas-3">
                        {inventarEintraege.filter((o) => o.lagerort_id === l.id && o.status !== "entsorgt").length}
                      </span>
                    </button>
                  ))}
                  {isOffen && (
                    <button
                      onClick={() => setModal({ typ: "lagerort", daten: { ort_id: ort.id } })}
                      className="w-full flex items-center gap-2 pl-9 pr-3 py-2 text-xs text-primary-500 hover:bg-primary-500/10 border-l-2 border-transparent transition-colors"
                    >
                      <Plus size={11} />
                      Lagerort hinzufügen
                    </button>
                  )}
                </div>
              );
            })}

            {orte.length === 0 && (
              <div className="px-3 py-6 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary">
                <MapPin size={24} className="mx-auto mb-2 opacity-20" />
                Noch keine Standorte
              </div>
            )}
          </div>
        </div>

        {/* Hauptbereich: Objekte */}
        <div className="flex-1 min-w-0">
          {/* Filter */}
          <div data-tour="tour-inventar-filter" className={`${glassSurfaceClass} space-y-2.5 mb-4 p-3`}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
                <input
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder="Suche nach Objekt, Gerät oder Tag..."
                  className="w-full pl-8 pr-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card/80 dark:bg-canvas-2/80 backdrop-blur-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-secondary-500 transition-colors"
                />
              </div>
              {bewohner.length > 0 && (
                <select
                  value={bewohnerFilter}
                  onChange={(e) => setBewohnerFilter(e.target.value)}
                  className="px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-secondary-500 transition-colors"
                >
                  <option value="">Alle Bewohner</option>
                  {bewohner.map((b) => (
                    <option key={b.id} value={b.id}>{b.emoji} {getBewohnerDisplayName(b)}</option>
                  ))}
                </select>
              )}
              {(ausgewaehlterOrt || ausgewaehlterLagerort) && (
                <>
                  <button
                    data-tour="tour-inventar-hinzufuegen"
                    onClick={() => setModal({ typ: "objekt", daten: { ort_id: ausgewaehlterOrt, lagerort_id: ausgewaehlterLagerort } })}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Plus size={14} />
                    Objekt
                  </button>
                  <button
                    onClick={handleGeraetHinzufuegen}
                    className="flex items-center gap-1.5 px-3 py-2.5 border border-primary-500/30 bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 rounded-pill text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Wrench size={14} />
                    Gerät
                  </button>
                </>
              )}
              {!ausgewaehlterOrt && !ausgewaehlterLagerort && (
                <button
                  onClick={handleGeraetHinzufuegen}
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-primary-500/30 bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 rounded-pill text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <Wrench size={14} />
                  Gerät
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setStatusFilter("")}
                className={`px-3 py-1 text-xs rounded-pill border transition-colors ${
                  statusFilter === ""
                    ? "bg-primary-500 text-white border-primary-500"
                    : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
                }`}
              >
                Alle
              </button>
              {Object.entries(STATUS_LABEL).filter(([k]) => k !== "entsorgt").map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(statusFilter === k ? "" : k)}
                  className={`px-3 py-1 text-xs rounded-pill border transition-colors ${
                    statusFilter === k
                      ? "bg-primary-500 text-white border-primary-500"
                      : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3"
                  }`}
                >
                  {t(`home:inventoryForm.status.${k}`, { defaultValue: v })}
                </button>
              ))}
            </div>
          </div>

          {/* Lagerort-Aktionen wenn ausgewählt */}
          {ausgewaehlterLagerort && (
            <div className="mb-3 flex flex-wrap gap-2">
              {(() => {
                const l = lagerorte.find((x) => x.id === ausgewaehlterLagerort);
                return l ? (
                  <>
                    <button onClick={() => setModal({ typ: "lagerort", daten: l })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
                      <Edit2 size={11} /> Bearbeiten
                    </button>
                    {l.qr_code_wert ? (
                      <button onClick={() => setModal({ typ: "qr", daten: { qrWert: l.qr_code_wert } })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
                        <QrCode size={11} /> QR anzeigen
                      </button>
                    ) : (
                      <button onClick={() => generiereQr(l.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
                        <QrCode size={11} /> QR generieren
                      </button>
                    )}
                    <button onClick={() => loescheLagerort(l.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-500/30 rounded-card-sm hover:bg-red-500/10 text-red-500">
                      <Trash2 size={11} /> Leerraum löschen
                    </button>
                  </>
                ) : null;
              })()}
            </div>
          )}

          {/* Objektliste */}
          {gefilterteObjekte.length === 0 ? (
            <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Objekte gefunden</p>
              {ausgewaehlterOrt && (
                <button
                  onClick={() => setModal({ typ: "objekt", daten: { ort_id: ausgewaehlterOrt, lagerort_id: ausgewaehlterLagerort } })}
                  className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
                >
                  <Plus size={14} />
                  Erstes Objekt hinzufügen
                </button>
              )}
            </div>
          ) : (
            <div data-tour="tour-inventar-liste">
              {/* Stats-Leiste */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {[
                  { key: "in_verwendung", label: "Aktiv",       cfg: STATUS_CARD_CONFIG.in_verwendung },
                  { key: "eingelagert",   label: "Eingelagert", cfg: STATUS_CARD_CONFIG.eingelagert   },
                  { key: "verliehen",     label: "Verliehen",   cfg: STATUS_CARD_CONFIG.verliehen     },
                  { key: "defekt",        label: "Defekt",      cfg: STATUS_CARD_CONFIG.defekt        },
                ].map(({ key, label, cfg }) => {
                  const count = gefilterteObjekte.filter((o) => o.status === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold border transition-colors cursor-pointer ${
                        statusFilter === key
                          ? cfg.badge + " ring-1 ring-inset ring-current"
                          : "border-light-border dark:border-dark-border text-dark-text-secondary hover:border-primary-500/40"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {label} <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>

              <motion.div
                data-testid="inventory-object-grid"
                variants={reducedMotion ? {} : glassPageVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              >
              {gefilterteObjekte.map((obj, idx) => {
                const ort = orte.find((o) => o.id === obj.ort_id);
                const lagerort = lagerorte.find((l) => l.id === obj.lagerort_id);
                const statusCfg = STATUS_CARD_CONFIG[obj.status] ?? STATUS_CARD_CONFIG.in_verwendung;
                const istGeraet = obj.eintrag_typ === "geraet";
                if (istGeraet) {
                  return (
                    <motion.div
                      key={`geraet-${obj.id}`}
                      variants={reducedMotion ? {} : glassItemVariants}
                    >
                      <GeraetZeile
                        g={obj}
                        status={statusByGeraetId[obj.id]}
                        heute={heute}
                        geraetWartungen={wartungenByGeraetId[obj.id] || []}
                        verknuepfteDokumente={verknuepfteDokuByGeraetId[obj.id] || []}
                        isOffen={!!aufgeklapptGeraete[obj.id]}
                        onToggle={() => toggleGeraet(obj.id)}
                        onBearbeiten={() => openEditGeraet(obj)}
                        onLoeschen={() => loescheGeraet(obj.id)}
                        onWartungErledigt={() => wartungErledigt(obj.id)}
                        onDokuModalOpen={() => setDokuModal(obj.id)}
                        onDokumentUnlink={(dokId) => toggleDokumentLink(obj.id, dokId)}
                        onVorschau={(dok) => setVorschauDok(dok)}
                        onNavigate={(dokId) => navigate("/home/dokumente", { state: { focusDokumentId: dokId } })}
                        orte={orte}
                        lagerorte={lagerorte}
                        bewohner={bewohner}
                      />
                    </motion.div>
                  );
                }
                const katCfg = KATEGORIE_FARBE[obj.kategorie] ?? KAT_FARBE_DEFAULT;
                const KatIcon = KATEGORIE_ICON_MAP[obj.kategorie] || null;
                return (
                  <GlassSurface
                    key={`${obj.eintrag_typ}-${obj.id}`}
                    className="min-w-0 overflow-hidden rounded-card-sm"
                  >
                    {/* Kategorie-Farbstreifen links */}
                    <div className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${katCfg.grad}`} />

                    {/* Karten-Header — klickbar für Toggle */}
                    <button
                      onClick={() => toggleKarte(obj.id)}
                      className="w-full text-left p-3 pl-4 flex items-start gap-3"
                    >
                      <div className={`w-9 h-9 rounded-card-sm flex items-center justify-center shrink-0 mt-0.5 ${katCfg.icon}`}>
                        {KatIcon ? <KatIcon size={16} /> : <Package size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate leading-snug">
                            {obj.name}
                            {obj.menge > 1 && <span className="ml-1.5 font-normal text-dark-text-secondary">×{obj.menge}</span>}
                          </span>
                          <ChevronDown
                            size={14}
                            className={`shrink-0 text-dark-text-secondary transition-transform duration-200 ${aufgeklapptKarten[obj.id] ? "rotate-180" : ""}`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {obj.kategorie && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${katCfg.icon}`}>{obj.kategorie}</span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-pill border ${statusCfg.badge}`}>
                            <span className={`inline-block w-1 h-1 rounded-full mr-0.5 ${statusCfg.dot}`} />
                            {t(`home:inventoryForm.status.${obj.status}`, { defaultValue: STATUS_LABEL[obj.status] })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-dark-text-secondary flex-wrap">
                          {(lagerort || ort) && (
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin size={9} />
                              {lagerort ? `${ort?.name} › ${lagerort.name}` : ort?.name}
                            </span>
                          )}
                          {(obj.tags || []).slice(0, 2).map((tag) => (
                            <span key={tag} className="bg-secondary-500/10 text-secondary-500 px-1 rounded">{tag}</span>
                          ))}
                          <BewohnerBadge bewohner={bewohner.find((b) => b.id === obj.bewohner_id)} />
                        </div>
                      </div>
                    </button>

                    {/* Expanded Panel */}
                    <AnimatePresence initial={false}>
                    {aufgeklapptKarten[obj.id] && (
                      <motion.div
                        key="details"
                        variants={reducedMotion ? {} : glassCollapseVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="overflow-hidden border-t border-light-border dark:border-dark-border"
                      >
                      <div className="pl-4 pr-3 pb-3 pt-2.5">
                        {obj.beschreibung && (
                          <p className="text-xs text-dark-text-secondary mb-2.5 leading-relaxed">{obj.beschreibung}</p>
                        )}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5 text-xs">
                          {[
                            { label: "Menge",   val: obj.menge > 1 ? obj.menge : null },
                            { label: "Zugriff", val: ZUGRIFF_LABEL[obj.zugriffshaeufigkeit] },
                          ].filter((r) => r.val).map(({ label, val }) => (
                            <div key={label}>
                              <div className="text-[10px] uppercase tracking-wide text-dark-text-secondary">{label}</div>
                              <div className="font-medium text-dark-text-main">{val}</div>
                            </div>
                          ))}
                        </div>
                        {(obj.tags || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2.5">
                            {obj.tags.map((tag) => (
                              <span key={tag} className="text-[10px] bg-secondary-500/10 text-secondary-500 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Tag size={8} />{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setModal({ typ: "objekt", daten: obj }); }}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors cursor-pointer"
                          >
                            <Edit2 size={12} /> Bearbeiten
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); verwalteObjektAlsGeraet(obj); }}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-card-sm bg-canvas-3 text-dark-text-secondary hover:bg-canvas-4 transition-colors cursor-pointer"
                          >
                            <Wrench size={12} /> Als Gerät
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); loescheObjekt(obj.id); }}
                            className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-card-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </GlassSurface>
                );
              })}
              </motion.div>
            </div>
          )}
        </div>
      </div>}
      </motion.div>)}
      </AnimatePresence>

      {/* Modals */}
      {modal && (
        <div className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm">
          <div className="mobile-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border flex min-h-0 flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {modal.typ === "ort" && (modal.daten?.id ? "Standort bearbeiten" : "Neuer Standort")}
                {modal.typ === "lagerort" && (modal.daten?.id ? "Lagerort bearbeiten" : "Neuer Lagerort")}
                {modal.typ === "objekt" && (modal.daten?.id ? "Objekt bearbeiten" : "Neues Objekt")}
                {modal.typ === "geraet" && (geraetFormData.id ? "Gerät bearbeiten" : "Neues Gerät")}
                {modal.typ === "qr" && "QR-Code"}
              </h3>
              <button onClick={closeModal} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"><X size={18} /></button>
            </div>
            <div className="mobile-modal-body p-4">
              {modal.typ === "ort" && (
                <OrtForm initial={modal.daten} onSpeichern={speichereOrt} onAbbrechen={() => setModal(null)} />
              )}
              {modal.typ === "lagerort" && (
                <LagerortForm ortId={modal.daten?.ort_id || ausgewaehlterOrt} parentId={null} initial={modal.daten?.id ? modal.daten : null} onSpeichern={speichereLagerort} onAbbrechen={() => setModal(null)} />
              )}
              {modal.typ === "objekt" && (
                <ObjektForm ortId={modal.daten?.ort_id || ausgewaehlterOrt} lagerortId={modal.daten?.lagerort_id || ausgewaehlterLagerort} initial={modal.daten?.name ? modal.daten : null} bewohner={bewohner} onSpeichern={speichereObjekt} onAbbrechen={() => setModal(null)} />
              )}
              {modal.typ === "geraet" && (
                <div className="space-y-4">
                  {geraetQuelleObjekt && (
                    <div className="rounded-card-sm border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-xs text-primary-500">
                      Das Objekt wird als Geraet uebernommen. Nach dem Speichern wird das urspruengliche Objekt auf "Entsorgt" gesetzt.
                    </div>
                  )}
                  <GeraetForm value={geraetFormData} onChange={setGeraetFormData} orte={orte} lagerorte={lagerorte} bewohner={bewohner} />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={closeModal} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
                    <button
                      onClick={() => speichereGeraet(geraetFormData)}
                      className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
                      disabled={!geraetFormData.name?.trim()}
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              )}
              {modal.typ === "qr" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-card-sm">
                    <QRCodeSVG value={modal.daten.qrWert} size={160} />
                  </div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center break-all">{modal.daten.qrWert}</p>
                  <button onClick={() => setModal(null)} className="px-4 py-2 border border-light-border dark:border-dark-border rounded-card-sm text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3">Schließen</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="inventar"
          onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            await applyInventoryAiItems({ session, items });
            ladeDaten();
          }}
        />
      )}

      {vorschauDok && (
        <DokumentVorschauModal
          storagePfad={vorschauDok.storage_pfad}
          dateiname={vorschauDok.dateiname}
          datei_typ={vorschauDok.datei_typ}
          onSchliessen={() => setVorschauDok(null)}
        />
      )}

      {dokuModal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-sm w-full border border-light-border dark:border-dark-border max-h-[80vh] flex flex-col">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">
                {t("home:devicesForm.linkDocument", { defaultValue: "Dokument verknüpfen" })}
              </h3>
              <button onClick={() => setDokuModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {dokumente.length === 0 ? (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-8">
                  {t("home:devicesForm.noDocuments", { defaultValue: "Noch keine Dokumente. Lade Dokumente im Dokumentenarchiv hoch." })}
                </p>
              ) : (
                <div className="space-y-1">
                  {dokumente.map((d) => {
                    const geraet = geraete.find((g) => g.id === dokuModal);
                    const isLinked = (geraet?.verknuepfte_dokument_ids || []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDokumentLink(dokuModal, d.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-card-sm text-sm transition-colors ${
                          isLinked
                            ? "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400"
                            : "hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
                        }`}
                      >
                        <FileText size={14} className={isLinked ? "text-blue-500" : "text-light-text-secondary dark:text-dark-text-secondary"} />
                        <span className="flex-1 text-left truncate">{d.dateiname}</span>
                        {isLinked && <Link2 size={12} className="text-blue-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="shrink-0 p-3 border-t border-light-border dark:border-dark-border">
              <button
                onClick={() => setDokuModal(null)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                {t("common:actions.close", { defaultValue: "Schließen" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.inventar}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeInventar;
