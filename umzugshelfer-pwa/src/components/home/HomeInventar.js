import React, { useState, useEffect, useCallback } from "react";
import {
  Package, Plus, ChevronRight, ChevronDown, Trash2, Edit2, MoreVertical,
  QrCode, Tag, X, Loader2, Search, MapPin, Box, SlidersHorizontal,
  AlertCircle, Sparkles,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { QRCodeSVG } from "qrcode.react";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import useViewport from "../../hooks/useViewport";
import MobileLocationSheet from "./inventar/MobileLocationSheet";
import MobileFilterSheet from "./inventar/MobileFilterSheet";

// --- BewohnerBadge ---
const BewohnerBadge = ({ bewohner }) => {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bewohner.farbe + "22", color: bewohner.farbe }}
    >
      <span>{bewohner.emoji}</span>
      <span>{bewohner.name}</span>
    </span>
  );
};

// --- Hilfsfunktionen ---
const STATUS_FARBEN = {
  in_verwendung: "bg-primary-500/10 text-green-600 dark:text-green-400",
  eingelagert: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  verliehen: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  defekt: "bg-red-500/10 text-red-600 dark:text-red-400",
  entsorgt: "bg-gray-500/10 text-gray-500",
};

const STATUS_LABEL = {
  in_verwendung: "In Verwendung",
  eingelagert: "Eingelagert",
  verliehen: "Verliehen",
  defekt: "Defekt",
  entsorgt: "Entsorgt",
};

// --- Ort-Formular ---
const OrtForm = ({ initial, onSpeichern, onAbbrechen }) => {
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
          {typen.map((t) => <option key={t}>{t}</option>)}
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
          {typen.map((t) => <option key={t}>{t}</option>)}
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
            {statusOptionen.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
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
              <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
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
  const userId = session?.user?.id;
  const { isMobile } = useViewport();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("inventar");
  const [loading, setLoading] = useState(true);
  const [orte, setOrte] = useState([]);
  const [lagerorte, setLagerorte] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [ausgewaehlterOrt, setAusgewaehlterOrt] = useState(null);
  const [ausgewaehlterLagerort, setAusgewaehlterLagerort] = useState(null);
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bewohnerFilter, setBewohnerFilter] = useState("");
  const [bewohner, setBewohner] = useState([]);
  const [modal, setModal] = useState(null); // { typ: "ort"|"lagerort"|"objekt"|"qr", daten }
  const [aufgeklappt, setAufgeklappt] = useState({});
  const [fehler, setFehler] = useState(null);
  const [kiOffen, setKiOffen] = useState(false);
  const [mobileLocationSheetOpen, setMobileLocationSheetOpen] = useState(false);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
  const [offenesObjektMenue, setOffenesObjektMenue] = useState(null);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [orteRes, lagerorteRes, objekteRes] = await Promise.all([
        supabase.from("home_orte").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_lagerorte").select("*").eq("user_id", userId).order("position").order("name"),
        supabase.from("home_objekte").select("*").eq("user_id", userId).order("name"),
      ]);
      setOrte(orteRes.data || []);
      setLagerorte(lagerorteRes.data || []);
      setObjekte(objekteRes.data || []);
    } catch (e) {
      setFehler("Fehler beim Laden der Inventardaten.");
    } finally {
      setLoading(false);
    }
    // Bewohner separat laden — schlägt still fehl wenn Tabelle noch nicht existiert
    supabase.from("home_bewohner").select("id, name, farbe, emoji").eq("user_id", userId).order("created_at")
      .then(({ data }) => { if (data) setBewohner(data); });
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // --- CRUD Ort ---
  const speichereOrt = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_orte").update(daten).eq("id", modal.daten.id);
    } else {
      await supabase.from("home_orte").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loescheOrt = async (id) => {
    if (!window.confirm("Ort und alle Lagerorte/Objekte darin löschen?")) return;
    await supabase.from("home_orte").delete().eq("id", id);
    if (ausgewaehlterOrt === id) setAusgewaehlterOrt(null);
    ladeDaten();
  };

  // --- CRUD Lagerort ---
  const speichereLagerort = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_lagerorte").update(daten).eq("id", modal.daten.id);
    } else {
      await supabase.from("home_lagerorte").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loescheLagerort = async (id) => {
    if (!window.confirm("Lagerort und alle Objekte darin löschen?")) return;
    await supabase.from("home_lagerorte").delete().eq("id", id);
    if (ausgewaehlterLagerort === id) setAusgewaehlterLagerort(null);
    ladeDaten();
  };

  // --- CRUD Objekt ---
  const speichereObjekt = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.daten?.id) {
      await supabase.from("home_objekte").update(daten).eq("id", modal.daten.id);
    } else {
      await supabase.from("home_objekte").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loescheObjekt = async (id) => {
    if (!window.confirm("Objekt löschen?")) return;
    await supabase.from("home_objekte").delete().eq("id", id);
    ladeDaten();
  };

  // --- QR generieren ---
  const generiereQr = async (lagerortId) => {
    const qrWert = `home-lagerort-${lagerortId}-${Date.now()}`;
    await supabase.from("home_lagerorte").update({ qr_code_wert: qrWert }).eq("id", lagerortId);
    ladeDaten();
    setModal({ typ: "qr", daten: { qrWert } });
  };

  // --- Gefilterte Objekte ---
  const gefilterteObjekte = objekte.filter((o) => {
    const passOrt = !ausgewaehlterOrt || o.ort_id === ausgewaehlterOrt;
    const passLagerort = !ausgewaehlterLagerort || o.lagerort_id === ausgewaehlterLagerort;
    const passStatus = !statusFilter || o.status === statusFilter;
    const passBewohner = !bewohnerFilter || o.bewohner_id === bewohnerFilter;
    const passSuche = !suche || o.name.toLowerCase().includes(suche.toLowerCase()) || (o.tags || []).some((t) => t.toLowerCase().includes(suche.toLowerCase()));
    return passOrt && passLagerort && passStatus && passBewohner && passSuche;
  });

  // --- Lagerorte eines Ortes (nur Root-Level) ---
  const lagerorteVonOrt = (ortId, parentId = null) =>
    lagerorte.filter((l) => l.ort_id === ortId && l.parent_id === parentId);

  const aktiveObjekteAnzahl = objekte.filter((o) => o.status !== "entsorgt").length;
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
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4 relative">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Package size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Inventar</h1>
        </div>
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
            className="sticky top-[72px] z-20 -mx-4 px-4 py-3 bg-light-bg/95 dark:bg-canvas-1/95 backdrop-blur border-y border-light-border dark:border-dark-border space-y-2"
          >
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suche nach Name oder Tag..."
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
            <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Objekte gefunden</p>
              {ausgewaehlterOrt && (
                <button
                  onClick={handleObjektHinzufuegen}
                  className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
                >
                  <Plus size={14} />
                  Erstes Objekt hinzufügen
                </button>
              )}
            </div>
          ) : (
            <div data-tour="tour-inventar-liste" className="space-y-3 pb-24">
              {gefilterteObjekte.map((obj) => {
                const ort = orte.find((o) => o.id === obj.ort_id);
                const lagerort = lagerorte.find((l) => l.id === obj.lagerort_id);
                return (
                  <div key={obj.id} className="relative bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main truncate">{obj.name}</h3>
                        {lagerort && (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                            {ort?.name} -> {lagerort.name}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setOffenesObjektMenue((prev) => (prev === obj.id ? null : obj.id))}
                        className="w-8 h-8 rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary flex items-center justify-center"
                        aria-label="Objekt-Aktionen"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>

                    {offenesObjektMenue === obj.id && (
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setOffenesObjektMenue(null);
                            setModal({ typ: "objekt", daten: obj });
                          }}
                          className="px-2 py-1.5 text-xs border border-light-border dark:border-dark-border rounded-card-sm text-light-text-main dark:text-dark-text-main"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Edit2 size={11} /> Bearbeiten
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setOffenesObjektMenue(null);
                            loescheObjekt(obj.id);
                          }}
                          className="px-2 py-1.5 text-xs border border-red-500/30 rounded-card-sm text-red-500 hover:bg-red-500/10"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 size={11} /> Löschen
                          </span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_FARBEN[obj.status]}`}>
                        {STATUS_LABEL[obj.status]}
                      </span>
                      {obj.menge > 1 && (
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">x{obj.menge}</span>
                      )}
                      <BewohnerBadge bewohner={bewohner.find((b) => b.id === obj.bewohner_id)} />
                    </div>

                    {obj.tags && obj.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {obj.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-light-border dark:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary">
                            <Tag size={9} />
                            {tag}
                          </span>
                        ))}
                        {obj.tags.length > 2 && <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">+{obj.tags.length - 2}</span>}
                      </div>
                    )}
                  </div>
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

          <MobileLocationSheet
            open={mobileLocationSheetOpen}
            onClose={() => setMobileLocationSheetOpen(false)}
            orte={orte}
            lagerorte={lagerorte}
            objekte={objekte}
            expandedByOrt={aufgeklappt}
            onToggleOrt={(ortId) => setAufgeklappt((prev) => ({ ...prev, [ortId]: !prev[ortId] }))}
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
            statusLabel={STATUS_LABEL}
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
          <div className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden">
            <div className="p-3 border-b border-light-border dark:border-dark-border">
              <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">Standorte</h2>
            </div>
            {/* Alle anzeigen */}
            <button
              onClick={() => { setAusgewaehlterOrt(null); setAusgewaehlterLagerort(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${!ausgewaehlterOrt ? "bg-primary-500/10 text-primary-500 font-medium" : "text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"}`}
            >
              <MapPin size={14} />
              Alle ({objekte.filter((o) => o.status !== "entsorgt").length})
            </button>

            {orte.map((ort) => {
              const ортLagerorte = lagerorteVonOrt(ort.id);
              const isOffen = aufgeklappt[ort.id];
              return (
                <div key={ort.id}>
                  <div className={`flex items-center group px-3 py-2 transition-colors ${ausgewaehlterOrt === ort.id && !ausgewaehlterLagerort ? "bg-primary-500/10" : "hover:bg-light-hover dark:hover:bg-canvas-3"}`}>
                    <button
                      onClick={() => setAufgeklappt((p) => ({ ...p, [ort.id]: !isOffen }))}
                      className="mr-1 text-light-text-secondary dark:text-dark-text-secondary"
                    >
                      {isOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button
                      onClick={() => { setAusgewaehlterOrt(ort.id); setAusgewaehlterLagerort(null); }}
                      className="flex-1 text-left text-sm text-light-text-main dark:text-dark-text-main font-medium truncate"
                    >
                      {ort.name}
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button onClick={() => setModal({ typ: "lagerort", daten: { ort_id: ort.id } })} className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500"><Plus size={12} /></button>
                      <button onClick={() => setModal({ typ: "ort", daten: ort })} className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={12} /></button>
                      <button onClick={() => loescheOrt(ort.id)} className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  {isOffen && ортLagerorte.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { setAusgewaehlterOrt(ort.id); setAusgewaehlterLagerort(l.id); }}
                      className={`w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm transition-colors ${ausgewaehlterLagerort === l.id ? "bg-primary-500/10 text-primary-500" : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"}`}
                    >
                      <Box size={12} />
                      <span className="truncate">{l.name}</span>
                      <span className="ml-auto text-xs opacity-60">
                        {objekte.filter((o) => o.lagerort_id === l.id).length}
                      </span>
                    </button>
                  ))}
                  {isOffen && (
                    <button
                      onClick={() => setModal({ typ: "lagerort", daten: { ort_id: ort.id } })}
                      className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-xs text-primary-500 hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                    >
                      <Plus size={11} />
                      Lagerort hinzufügen
                    </button>
                  )}
                </div>
              );
            })}

            {orte.length === 0 && (
              <div className="px-3 py-4 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary">
                Noch keine Standorte
              </div>
            )}
          </div>
        </div>

        {/* Hauptbereich: Objekte */}
        <div className="flex-1 min-w-0">
          {/* Filter */}
          <div data-tour="tour-inventar-filter" className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suche nach Name oder Tag..."
                className="w-full pl-8 pr-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none"
            >
              <option value="">Alle Status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {bewohner.length > 0 && (
              <select
                value={bewohnerFilter}
                onChange={(e) => setBewohnerFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none"
              >
                <option value="">Alle Bewohner</option>
                {bewohner.map((b) => (
                  <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
                ))}
              </select>
            )}
            {(ausgewaehlterOrt || ausgewaehlterLagerort) && (
              <button
                data-tour="tour-inventar-hinzufuegen"
                onClick={() => setModal({ typ: "objekt", daten: { ort_id: ausgewaehlterOrt, lagerort_id: ausgewaehlterLagerort } })}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium transition-colors whitespace-nowrap"
              >
                <Plus size={14} />
                Objekt
              </button>
            )}
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
            <div data-tour="tour-inventar-liste" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gefilterteObjekte.map((obj) => {
                const ort = orte.find((o) => o.id === obj.ort_id);
                const lagerort = lagerorte.find((l) => l.id === obj.lagerort_id);
                return (
                  <div key={obj.id} className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border p-3 group">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main truncate">{obj.name}</h3>
                        {lagerort && (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                            {ort?.name} → {lagerort.name}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button onClick={() => setModal({ typ: "objekt", daten: obj })} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={12} /></button>
                        <button onClick={() => loescheObjekt(obj.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_FARBEN[obj.status]}`}>
                        {STATUS_LABEL[obj.status]}
                      </span>
                      {obj.menge > 1 && (
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">×{obj.menge}</span>
                      )}
                      <BewohnerBadge bewohner={bewohner.find((b) => b.id === obj.bewohner_id)} />
                    </div>
                    {obj.tags && obj.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {obj.tags.slice(0, 3).map((t) => (
                          <span key={t} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-light-border dark:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary">
                            <Tag size={9} />{t}
                          </span>
                        ))}
                        {obj.tags.length > 3 && <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">+{obj.tags.length - 3}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      }

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center py-4 px-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {modal.typ === "ort" && (modal.daten?.id ? "Standort bearbeiten" : "Neuer Standort")}
                {modal.typ === "lagerort" && (modal.daten?.id ? "Lagerort bearbeiten" : "Neuer Lagerort")}
                {modal.typ === "objekt" && (modal.daten?.id ? "Objekt bearbeiten" : "Neues Objekt")}
                {modal.typ === "qr" && "QR-Code"}
              </h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"><X size={18} /></button>
            </div>
            <div className="p-4">
              {modal.typ === "ort" && (
                <OrtForm initial={modal.daten} onSpeichern={speichereOrt} onAbbrechen={() => setModal(null)} />
              )}
              {modal.typ === "lagerort" && (
                <LagerortForm ortId={modal.daten?.ort_id || ausgewaehlterOrt} parentId={null} initial={modal.daten?.id ? modal.daten : null} onSpeichern={speichereLagerort} onAbbrechen={() => setModal(null)} />
              )}
              {modal.typ === "objekt" && (
                <ObjektForm ortId={modal.daten?.ort_id || ausgewaehlterOrt} lagerortId={modal.daten?.lagerort_id || ausgewaehlterLagerort} initial={modal.daten?.name ? modal.daten : null} bewohner={bewohner} onSpeichern={speichereObjekt} onAbbrechen={() => setModal(null)} />
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
            for (const item of items) {
              await supabase.from("home_objekte").insert({
                user_id: session.user.id,
                name: item.name || "Unbenannt",
                kategorie: item.kategorie || null,
                status: "Vorhanden",
                menge: item.menge || 1,
              });
            }
            ladeDaten();
          }}
        />
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
