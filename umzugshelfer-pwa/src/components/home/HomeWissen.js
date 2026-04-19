import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Search,
  Tag,
  ExternalLink,
  LayoutGrid,
  List,
  ChevronRight,
  ChevronDown,
  Brain,
  PenLine,
  FolderOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";

const KATEGORIEN = [
  "Versicherung",
  "Vertraege",
  "Behoerden",
  "Rechnungen & Belege",
  "Masse & Abmessungen",
  "Geraete-Info",
  "Kontakte & Dienste",
  "Anleitungen",
  "Notizen",
  "Sonstiges",
];

const KATEGORIE_FARBEN = {
  "Versicherung": "bg-blue-500",
  "Vertraege": "bg-violet-500",
  "Behoerden": "bg-orange-500",
  "Rechnungen & Belege": "bg-emerald-500",
  "Masse & Abmessungen": "bg-cyan-500",
  "Geraete-Info": "bg-pink-500",
  "Kontakte & Dienste": "bg-indigo-500",
  "Anleitungen": "bg-teal-500",
  "Notizen": "bg-yellow-400",
  "Sonstiges": "bg-gray-400",
};

const getKategorieFarbe = (k) => KATEGORIE_FARBEN[k] ?? "bg-amber-400";

// Date helpers
const getWissenDatum = (e) => e.created_at?.split("T")[0] || "";
const getWissenMonatsKey = (e) => {
  const d = getWissenDatum(e);
  return d.length >= 7 ? d.substring(0, 7) : "unbekannt";
};
const formatMonatLabel = (key) => {
  if (key === "unbekannt") return "Ohne Datum";
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
};

const mergeUniqueTags = (...groups) => {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const entry of group || []) {
      const tag = String(entry || "").trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(tag);
    }
  }
  return merged;
};

const isManualOverride = (entry) =>
  Boolean(entry?.summary?.manual_override) || entry?.herkunft === "manuell";

const getSummaryHeadline = (entry) => entry?.summary?.headline || "";

const getSummaryHighlights = (entry) =>
  Array.isArray(entry?.summary?.highlights) ? entry.summary.highlights.filter(Boolean) : [];

const getSummaryWarnings = (entry) =>
  Array.isArray(entry?.summary?.warnings) ? entry.summary.warnings.filter(Boolean) : [];

const getSummaryDetails = (entry) =>
  Array.isArray(entry?.summary?.details)
    ? entry.summary.details.filter((item) => item?.label && item?.value)
    : [];

const isInvoiceEntry = (entry) => {
  const kategorie = (entry?.kategorie || "").trim().toLowerCase();
  const tags = (entry?.tags || []).map((tag) => String(tag).trim().toLowerCase());
  return kategorie === "rechnungen & belege" || Boolean(entry?.rechnung_id) || tags.includes("rechnung");
};

const formatEuro = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} EUR`;
};

// ---------- WissenForm ----------

const WissenForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    titel: initial?.titel || "",
    inhalt: initial?.inhalt || "",
    kategorie: initial?.kategorie || "Notizen",
    tags: initial?.tags?.join(", ") || "",
  });

  const handleSpeichern = () => {
    if (!form.titel.trim()) return;
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    onSpeichern({ ...form, tags });
  };

  const inputCls = "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500";
  const labelCls = "block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1";

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Titel *</label>
        <input value={form.titel} onChange={(e) => setForm((p) => ({ ...p, titel: e.target.value }))} placeholder="z.B. Wandfarbe Wohnzimmer" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Kategorie</label>
        <select value={form.kategorie} onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))} className={inputCls}>
          {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Inhalt</label>
        <textarea value={form.inhalt} onChange={(e) => setForm((p) => ({ ...p, inhalt: e.target.value }))} rows={5} placeholder="Alle relevanten Informationen, Masse, Codes, Notizen..." className={`${inputCls} resize-none`} />
      </div>
      <div>
        <label className={labelCls}>Tags (kommagetrennt)</label>
        <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="z.B. wohnzimmer, farbe, RAL" className={inputCls} />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-pill hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
          Abbrechen
        </button>
        <button onClick={handleSpeichern} disabled={!form.titel.trim()} className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50">
          Speichern
        </button>
      </div>
    </div>
  );
};

// ---------- HomeWissen ----------

const HomeWissen = ({ session }) => {
  const navigate = useNavigate();
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [kategFilter, setKategFilter] = useState("");
  const [sortierung, setSortierung] = useState("neueste");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("wissen_view") || "liste");
  const [jahrFilter, setJahrFilter] = useState(() => String(new Date().getFullYear()));
  const [monatFilter, setMonatFilter] = useState("alle");
  const [collapsedMonate, setCollapsedMonate] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [positionenByEintrag, setPositionenByEintrag] = useState({});
  const [positionenLoading, setPositionenLoading] = useState({});

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("wissen_view", mode);
  };

  const handleJahrFilter = (jahr) => {
    setJahrFilter(jahr);
    setMonatFilter("alle");
    setCollapsedMonate(new Set());
  };

  const toggleMonatCollapse = (key) => {
    setCollapsedMonate((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("home_wissen")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setEintraege(data || []);
    } catch {
      setFehler("Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const holeRechnungId = useCallback(async (eintrag) => {
    if (eintrag?.rechnung_id) return eintrag.rechnung_id;
    if (!eintrag?.dokument_id) return null;
    const { data, error } = await supabase
      .from("rechnungen").select("id").eq("dokument_id", eintrag.dokument_id).limit(1).maybeSingle();
    if (error) return null;
    return data?.id || null;
  }, []);

  const ladeRechnungsPositionen = useCallback(async (eintrag) => {
    if (!eintrag || !isInvoiceEntry(eintrag)) return;
    if (positionenByEintrag[eintrag.id]) return;
    setPositionenLoading((prev) => ({ ...prev, [eintrag.id]: true }));
    try {
      const rechnungId = await holeRechnungId(eintrag);
      if (!rechnungId) { setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: [] })); return; }
      const { data, error } = await supabase
        .from("rechnungs_positionen")
        .select("id, pos_nr, beschreibung, menge, einheit, einzelpreis, gesamtpreis")
        .eq("rechnung_id", rechnungId)
        .order("pos_nr", { ascending: true });
      if (error) throw error;
      setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: data || [] }));
    } catch {
      setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: [] }));
    } finally {
      setPositionenLoading((prev) => ({ ...prev, [eintrag.id]: false }));
    }
  }, [holeRechnungId, positionenByEintrag]);

  const speichere = async (daten) => {
    const nextTags = mergeUniqueTags(modal?.tags, daten.tags);
    if (modal?.id) {
      await supabase.from("home_wissen").update({
        ...daten, tags: nextTags,
        summary: { ...(modal?.summary || {}), manual_override: true },
        herkunft: modal?.herkunft || "manuell",
      }).eq("id", modal.id);
      await logVerlauf(supabase, userId, "home_wissen", daten.titel, "geaendert");
    } else {
      await supabase.from("home_wissen").insert({
        ...daten, user_id: userId, tags: nextTags,
        herkunft: "manuell", summary: { manual_override: true },
      });
      await logVerlauf(supabase, userId, "home_wissen", daten.titel, "erstellt");
    }
    setModal(null);
    ladeDaten();
  };

  const loesche = async (eintrag) => {
    if (!eintrag) return;
    if (!window.confirm(`"${eintrag.titel}" löschen?`)) return;
    try {
      if (eintrag.dokument_id && isInvoiceEntry(eintrag)) {
        await deleteInvoiceCascade({ supabase, dokumentId: eintrag.dokument_id });
      } else {
        const { error } = await supabase.from("home_wissen").delete().eq("id", eintrag.id);
        if (error) throw error;
      }
      await logVerlauf(supabase, userId, "home_wissen", eintrag.titel, "geloescht");
      if (detailId === eintrag.id) setDetailId(null);
      ladeDaten();
    } catch (err) {
      setFehler(`Löschen fehlgeschlagen: ${err.message}`);
    }
  };

  const toggleDetails = async (eintrag) => {
    const nextId = detailId === eintrag.id ? null : eintrag.id;
    setDetailId(nextId);
    if (nextId && isInvoiceEntry(eintrag)) await ladeRechnungsPositionen(eintrag);
  };

  const oeffneDokumentarchiv = (dokumentId) => {
    if (!dokumentId) return;
    navigate("/home/dokumente", { state: { focusDokumentId: dokumentId } });
  };

  // Filtering + sorting
  const gefiltertEintraege = useMemo(() => {
    const q = suchbegriff.toLowerCase();
    const filtered = eintraege.filter((e) => {
      const matchKateg = !kategFilter || e.kategorie === kategFilter;
      const matchJahr = jahrFilter === "alle" || getWissenDatum(e).startsWith(jahrFilter);
      const matchMonat = monatFilter === "alle" || getWissenMonatsKey(e) === monatFilter;
      const matchSuche =
        !q ||
        e.titel.toLowerCase().includes(q) ||
        e.inhalt?.toLowerCase().includes(q) ||
        getSummaryHeadline(e).toLowerCase().includes(q) ||
        getSummaryHighlights(e).join(" ").toLowerCase().includes(q) ||
        getSummaryDetails(e).map((d) => `${d.label} ${d.value}`).join(" ").toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchKateg && matchJahr && matchMonat && matchSuche;
    });

    return [...filtered].sort((a, b) => {
      if (sortierung === "neueste") return new Date(b.updated_at) - new Date(a.updated_at);
      if (sortierung === "aelteste") return new Date(a.updated_at) - new Date(b.updated_at);
      if (sortierung === "name_az") return (a.titel || "").localeCompare(b.titel || "", "de");
      return 0;
    });
  }, [eintraege, suchbegriff, kategFilter, jahrFilter, monatFilter, sortierung]);

  const filterKategorien = useMemo(
    () => Array.from(new Set(eintraege.map((e) => e.kategorie).filter(Boolean))),
    [eintraege],
  );

  const kategorieZaehler = useMemo(() => eintraege.reduce((acc, e) => {
    const k = e.kategorie || "Sonstiges";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {}), [eintraege]);

  const verfuegbareJahre = useMemo(() =>
    [...new Set(eintraege.map((e) => getWissenDatum(e).substring(0, 4)).filter(Boolean))].sort().reverse(),
  [eintraege]);

  const verfuegbareMonate = useMemo(() => {
    const basis = jahrFilter === "alle"
      ? eintraege
      : eintraege.filter((e) => getWissenDatum(e).startsWith(jahrFilter));
    return [...new Set(basis.map(getWissenMonatsKey).filter((k) => k !== "unbekannt"))].sort().reverse();
  }, [eintraege, jahrFilter]);

  const gruppiertNachMonat = useMemo(() => {
    const map = {};
    gefiltertEintraege.forEach((e) => {
      const key = getWissenMonatsKey(e);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    const reihenfolge = Object.keys(map).sort((a, b) =>
      sortierung === "aelteste" ? a.localeCompare(b) : b.localeCompare(a),
    );
    return { map, reihenfolge };
  }, [gefiltertEintraege, sortierung]);

  const detailEintrag = eintraege.find((e) => e.id === detailId);

  // KPI
  const anzahlManuell = eintraege.filter(isManualOverride).length;
  const anzahlKi = eintraege.filter((e) => !isManualOverride(e)).length;

  const renderDetailInhalt = (eintrag, compact = false) => {
    if (!eintrag) return null;
    const summaryDetails = getSummaryDetails(eintrag);
    const summaryWarnings = getSummaryWarnings(eintrag);
    const summaryHighlights = getSummaryHighlights(eintrag);
    const textCls = compact ? "text-xs" : "text-sm";

    if (isInvoiceEntry(eintrag)) {
      const loadingPos = positionenLoading[eintrag.id];
      const positionen = positionenByEintrag[eintrag.id] || [];
      if (loadingPos) {
        return (
          <div className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            <Loader2 size={12} className="animate-spin" /> Positionen werden geladen...
          </div>
        );
      }
      if (positionen.length > 0) {
        return (
          <div className="space-y-2">
            {positionen.map((pos) => (
              <div key={pos.id} className="p-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`${textCls} font-medium text-light-text-main dark:text-dark-text-main break-words`}>
                      {pos.pos_nr ? `${pos.pos_nr}. ` : ""}{pos.beschreibung || "Position"}
                    </p>
                    <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Menge: {pos.menge ?? "-"} {pos.einheit || ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`${textCls} text-light-text-main dark:text-dark-text-main`}>{formatEuro(pos.gesamtpreis)}</p>
                    <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">Einzel: {formatEuro(pos.einzelpreis)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      }
    }

    if (summaryDetails.length > 0 || summaryHighlights.length > 0 || summaryWarnings.length > 0) {
      return (
        <div className="space-y-3">
          {summaryHighlights.length > 0 && (
            <div className="space-y-1.5">
              {summaryHighlights.map((item) => (
                <div key={item} className={`${textCls} rounded-card-sm bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300`}>{item}</div>
              ))}
            </div>
          )}
          {summaryWarnings.length > 0 && (
            <div className="space-y-1.5">
              {summaryWarnings.map((item) => (
                <div key={item} className={`${textCls} rounded-card-sm border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-600 dark:text-red-400`}>{item}</div>
              ))}
            </div>
          )}
          {summaryDetails.length > 0 && (
            <div className="space-y-2">
              {summaryDetails.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} className="flex items-start justify-between gap-3">
                  <span className={`${textCls} text-light-text-secondary dark:text-dark-text-secondary`}>{detail.label}</span>
                  <span className={`${textCls} text-right text-light-text-main dark:text-dark-text-main`}>{detail.value}</span>
                </div>
              ))}
            </div>
          )}
          {eintrag.inhalt && (
            <pre className={`${textCls} text-light-text-main dark:text-dark-text-main whitespace-pre-wrap font-sans`}>{eintrag.inhalt}</pre>
          )}
        </div>
      );
    }

    if (eintrag.inhalt) {
      return <pre className={`${textCls} text-light-text-main dark:text-dark-text-main whitespace-pre-wrap font-sans`}>{eintrag.inhalt}</pre>;
    }

    return <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Keine Details verfügbar.</p>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-amber-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Wissensdatenbank</h1>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm font-medium"
        >
          <Plus size={14} /> Eintrag
        </button>
      </div>

      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      {/* KPI Strip */}
      {eintraege.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <BookOpen size={16} className="text-amber-500" />, label: "Einträge gesamt", value: eintraege.length },
            { icon: <FolderOpen size={16} className="text-violet-500" />, label: "Kategorien", value: filterKategorien.length },
            { icon: <PenLine size={16} className="text-emerald-500" />, label: "Manuell", value: anzahlManuell },
            { icon: <Brain size={16} className="text-primary-500" />, label: "KI-analysiert", value: anzahlKi },
          ].map(({ icon, label, value }) => (
            <div key={label} className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border px-4 py-3 flex items-center gap-3">
              <div className="shrink-0">{icon}</div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-light-text-main dark:text-dark-text-main leading-none">{value}</p>
                <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter & Sort Bar */}
      <div className="space-y-2">
        {/* Row 1: Search + Sort + View toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
            <input
              value={suchbegriff}
              onChange={(e) => setSuchbegriff(e.target.value)}
              placeholder="Titel, Inhalt oder Tags durchsuchen…"
              className="w-full pl-9 pr-8 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
            />
            {suchbegriff && (
              <button onClick={() => setSuchbegriff("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={sortierung}
            onChange={(e) => setSortierung(e.target.value)}
            className="px-3 py-2 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500 shrink-0"
          >
            <option value="neueste">Neueste</option>
            <option value="aelteste">Älteste</option>
            <option value="name_az">A – Z</option>
          </select>

          <div className="flex rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden shrink-0">
            <button
              onClick={() => handleViewMode("kacheln")}
              className={`p-2 transition-colors ${viewMode === "kacheln" ? "bg-amber-500 text-white" : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"}`}
              title="Kachelansicht"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => handleViewMode("liste")}
              className={`p-2 transition-colors border-l border-light-border dark:border-dark-border ${viewMode === "liste" ? "bg-amber-500 text-white" : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"}`}
              title="Listenansicht"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Row 2: Jahr-Tabs */}
        {verfuegbareJahre.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => handleJahrFilter("alle")}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                jahrFilter === "alle"
                  ? "bg-amber-500 text-white"
                  : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
              }`}
            >
              Alle Jahre
            </button>
            {verfuegbareJahre.map((jahr) => (
              <button
                key={jahr}
                onClick={() => handleJahrFilter(jahr)}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  jahrFilter === jahr
                    ? "bg-amber-500 text-white"
                    : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
                }`}
              >
                {jahr}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: Monat-Tabs (nur wenn ein konkretes Jahr gewählt) */}
        {jahrFilter !== "alle" && verfuegbareMonate.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setMonatFilter("alle")}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                monatFilter === "alle"
                  ? "bg-amber-500/80 text-white"
                  : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
              }`}
            >
              Alle Monate
            </button>
            {verfuegbareMonate.map((key) => (
              <button
                key={key}
                onClick={() => setMonatFilter(key === monatFilter ? "alle" : key)}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  monatFilter === key
                    ? "bg-amber-500/80 text-white"
                    : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
                }`}
              >
                {formatMonatLabel(key)}
              </button>
            ))}
          </div>
        )}

        {/* Row 4: Kategorie-Pills */}
        {filterKategorien.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setKategFilter("")}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${
                !kategFilter
                  ? "bg-amber-500 text-white"
                  : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
              }`}
            >
              Alle <span className="opacity-70 ml-0.5">({eintraege.length})</span>
            </button>
            {filterKategorien.map((k) => (
              <button
                key={k}
                onClick={() => setKategFilter(k === kategFilter ? "" : k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${
                  kategFilter === k
                    ? "bg-amber-500 text-white"
                    : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:border-amber-500/40"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${getKategorieFarbe(k)} ${kategFilter === k ? "opacity-70" : ""}`} />
                {k}
                <span className="opacity-70">({kategorieZaehler[k] || 0})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {gefiltertEintraege.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {suchbegriff || kategFilter || jahrFilter !== "alle" || monatFilter !== "alle"
              ? "Keine Einträge gefunden"
              : "Noch keine Einträge"}
          </p>
          {!suchbegriff && !kategFilter && jahrFilter === "alle" && monatFilter === "alle" && (
            <button
              onClick={() => setModal({})}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm"
            >
              <Plus size={14} /> Ersten Eintrag anlegen
            </button>
          )}
        </div>
      ) : viewMode === "kacheln" ? (

        // ── Kachelansicht ──
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gefiltertEintraege.map((e) => (
            <div
              key={e.id}
              className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4 cursor-pointer hover:border-amber-500/40 transition-colors group"
              onClick={() => toggleDetails(e)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getKategorieFarbe(e.kategorie)}`} />
                  <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main line-clamp-1">{e.titel}</h3>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setModal(e); }}
                    className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); loesche(e); }}
                    className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2 flex-wrap pl-4">
                <span className="text-xs text-amber-500 font-medium">{e.kategorie}</span>
                {Number.isFinite(Number(e.analysis_confidence)) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-pill bg-primary-500/10 text-primary-500">
                    {Math.round(Number(e.analysis_confidence) * 100)} %
                  </span>
                )}
                {isManualOverride(e) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-pill bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Manuell</span>
                )}
              </div>

              <div className="pl-4">
                {getSummaryHeadline(e) ? (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">{getSummaryHeadline(e)}</p>
                ) : e.inhalt ? (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">{e.inhalt}</p>
                ) : null}

                {getSummaryHighlights(e).slice(0, 2).map((item) => (
                  <div key={item} className="text-[11px] rounded-card-sm bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300 line-clamp-1 mt-1.5">{item}</div>
                ))}
                {getSummaryWarnings(e).slice(0, 1).map((item) => (
                  <div key={item} className="text-[11px] rounded-card-sm border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-600 dark:text-red-400 line-clamp-1 mt-1.5">{item}</div>
                ))}

                {(e.tags || []).length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {e.tags.map((t) => (
                      <span key={t} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Tag size={9} />{t}
                      </span>
                    ))}
                  </div>
                )}

                {detailId === e.id && (
                  <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border space-y-3">
                    {renderDetailInhalt(e, true)}
                    {e.dokument_id && (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); oeffneDokumentarchiv(e.dokument_id); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                      >
                        <ExternalLink size={12} /> Zum Dokumentarchiv
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      ) : (

        // ── Listenansicht — nach Monaten gruppiert ──
        <div className="space-y-3 pt-1">
          {gruppiertNachMonat.reihenfolge.map((monatKey) => {
            const eintraegeFuerMonat = gruppiertNachMonat.map[monatKey];
            const istEingeklappt = collapsedMonate.has(monatKey);
            return (
              <div key={monatKey}>
                {/* Monats-Header */}
                <button
                  onClick={() => toggleMonatCollapse(monatKey)}
                  className="w-full flex items-center gap-2 px-1 pb-1.5 text-left group"
                >
                  <ChevronDown
                    size={13}
                    className={`transition-transform duration-150 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0 ${
                      istEingeklappt ? "-rotate-90" : ""
                    }`}
                  />
                  <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide group-hover:text-amber-500 transition-colors">
                    {formatMonatLabel(monatKey)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    {eintraegeFuerMonat.length}
                  </span>
                </button>

                {/* Einträge — nur wenn nicht eingeklappt */}
                {!istEingeklappt && (
                  <div className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden divide-y divide-light-border dark:divide-dark-border">
                    {eintraegeFuerMonat.map((e) => (
                      <div key={e.id}>
                        <div
                          className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors group"
                          onClick={() => toggleDetails(e)}
                        >
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getKategorieFarbe(e.kategorie)}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main leading-snug">{e.titel}</h3>
                              <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                {e.dokument_id && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); oeffneDokumentarchiv(e.dokument_id); }}
                                    className="p-1.5 rounded text-primary-500 hover:bg-primary-500/10"
                                    title="Zum Dokumentarchiv"
                                  >
                                    <ExternalLink size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); setModal(e); }}
                                  className="p-1.5 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); loesche(e); }}
                                  className="p-1.5 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-amber-500 font-medium">{e.kategorie}</span>
                              {isManualOverride(e) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Manuell</span>
                              )}
                              {Number.isFinite(Number(e.analysis_confidence)) && !isManualOverride(e) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-primary-500/10 text-primary-500">
                                  {Math.round(Number(e.analysis_confidence) * 100)} %
                                </span>
                              )}
                              {(e.tags || []).map((t) => (
                                <span key={t} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                  <Tag size={8} />{t}
                                </span>
                              ))}
                            </div>

                            {(getSummaryHeadline(e) || e.inhalt) && (
                              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 line-clamp-1">
                                {getSummaryHeadline(e) || e.inhalt}
                              </p>
                            )}
                          </div>

                          <ChevronRight
                            size={14}
                            className={`shrink-0 mt-1 text-light-text-secondary dark:text-dark-text-secondary transition-transform duration-150 ${detailId === e.id ? "rotate-90" : ""}`}
                          />
                        </div>

                        {detailId === e.id && (
                          <div className="px-4 pb-4 pt-3 border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 space-y-3">
                            {renderDetailInhalt(e, true)}
                            {e.dokument_id && (
                              <button
                                type="button"
                                onClick={() => oeffneDokumentarchiv(e.dokument_id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                              >
                                <ExternalLink size={12} /> Zum Dokumentarchiv
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile detail modal (card view only, on small screens) */}
      {detailEintrag && viewMode === "kacheln" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)] sm:hidden">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getKategorieFarbe(detailEintrag.kategorie)}`} />
                <h3 className="font-semibold text-light-text-main dark:text-dark-text-main truncate">{detailEintrag.titel}</h3>
              </div>
              <button onClick={() => setDetailId(null)} className="ml-2 shrink-0">
                <X size={18} className="text-light-text-secondary dark:text-dark-text-secondary" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 space-y-3">
              <p className="text-xs text-amber-500 font-medium">{detailEintrag.kategorie}</p>
              {renderDetailInhalt(detailEintrag, false)}
              {(detailEintrag.tags || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-4">
                  {detailEintrag.tags.map((t) => (
                    <span key={t} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Tag size={10} />{t}
                    </span>
                  ))}
                </div>
              )}
              {detailEintrag.dokument_id && (
                <button
                  type="button"
                  onClick={() => oeffneDokumentarchiv(detailEintrag.dokument_id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                >
                  <ExternalLink size={12} /> Zum Dokumentarchiv
                </button>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setDetailId(null); setModal(detailEintrag); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-pill text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
                >
                  <Edit2 size={13} /> Bearbeiten
                </button>
                <button
                  onClick={() => loesche(detailEintrag)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-red-500/30 rounded-pill text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)]">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl max-w-lg w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2 z-10">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {modal.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}
              </h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <WissenForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeWissen;
