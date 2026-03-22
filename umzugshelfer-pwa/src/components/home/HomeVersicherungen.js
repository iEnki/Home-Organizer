import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, AlertTriangle, CheckCircle, Edit2, ExternalLink,
  Loader2, X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const formatDatum = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE");
};

const tageBis = (datum) => {
  if (!datum) return null;
  return Math.ceil((new Date(datum) - new Date()) / (1000 * 60 * 60 * 24));
};

const formatPraemie = (praemie, intervall, waehrung = "EUR") => {
  if (praemie == null) return "—";
  const formatiert = Number(praemie).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intervalLabels = {
    monatlich:       "/ Monat",
    vierteljaehrlich: "/ Quartal",
    halbjaehrlich:   "/ Halbjahr",
    jaehrlich:       "/ Jahr",
  };
  return `${formatiert} ${waehrung} ${intervalLabels[intervall] || ""}`.trim();
};

const VERSICHERUNGSART_LABELS = {
  haftpflicht:        "Haftpflicht",
  hausrat:            "Hausrat",
  kfz:                "KFZ",
  krankenversicherung: "Krankenversicherung",
  lebensversicherung: "Lebensversicherung",
  berufsunfaehigkeit: "Berufsunfähigkeit",
  rechtsschutz:       "Rechtsschutz",
  reisekranken:       "Reisekranken",
  gebaeude:           "Gebäude",
  unfallversicherung: "Unfall",
  sonstiges:          "Sonstige",
};

// ── Edit-Modal ────────────────────────────────────────────────────────────────

const EditModal = ({ polizze, onSchliessen, onGespeichert }) => {
  const [form, setForm] = useState({
    versicherer:       polizze.versicherer       || "",
    polizzen_nummer:   polizze.polizzen_nummer   || "",
    versicherungsart:  polizze.versicherungsart  || "sonstiges",
    deckung:           polizze.deckung           || "",
    praemie:           polizze.praemie           ?? "",
    praemien_intervall: polizze.praemien_intervall || "jaehrlich",
    naechste_faelligkeit: polizze.naechste_faelligkeit || "",
    start_date:        polizze.start_date        || "",
    end_date:          polizze.end_date          || "",
    waehrung:          polizze.waehrung          || "EUR",
  });
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSpeichern = async () => {
    setSpeichern(true);
    setFehler("");
    try {
      const { error } = await supabase
        .from("versicherungs_polizzen")
        .update({
          versicherer:       form.versicherer || null,
          polizzen_nummer:   form.polizzen_nummer || null,
          versicherungsart:  form.versicherungsart || "sonstiges",
          deckung:           form.deckung || null,
          praemie:           form.praemie !== "" ? Number(form.praemie) : null,
          praemien_intervall: form.praemien_intervall || "jaehrlich",
          naechste_faelligkeit: form.naechste_faelligkeit || null,
          start_date:        form.start_date || null,
          end_date:          form.end_date || null,
          waehrung:          form.waehrung || "EUR",
          review_required:   false,
          reviewed_at:       new Date().toISOString(),
        })
        .eq("id", polizze.id);
      if (error) throw error;

      // Wissen-Sync: Auto-Stubs aktualisieren, manuelle Einträge nicht anfassen
      if (polizze.dokument_id) {
        await supabase
          .from("home_wissen")
          .update({
            titel:    `Versicherung: ${form.versicherer || "Unbekannt"}`,
            kategorie: "Versicherungen",
          })
          .eq("dokument_id", polizze.dokument_id)
          .neq("herkunft", "manuell");
      }

      onGespeichert();
    } catch (err) {
      setFehler(`Fehler: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Edit2 size={16} className="text-primary-500" /> Polizze bearbeiten
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Versicherungsart */}
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            Versicherungsart
          </label>
          <select
            name="versicherungsart"
            value={form.versicherungsart}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            {Object.entries(VERSICHERUNGSART_LABELS).map(([val, lab]) => (
              <option key={val} value={val}>{lab}</option>
            ))}
          </select>
        </div>

        {[
          { name: "versicherer",          label: "Versicherer",         type: "text" },
          { name: "polizzen_nummer",      label: "Polizzennummer",      type: "text" },
          { name: "deckung",              label: "Deckung (Beschreibung)", type: "text" },
          { name: "praemie",              label: "Prämie",              type: "number" },
          { name: "waehrung",             label: "Währung",             type: "text" },
          { name: "naechste_faelligkeit", label: "Nächste Fälligkeit",  type: "date" },
          { name: "start_date",           label: "Beginn",              type: "date" },
          { name: "end_date",             label: "Ende",                type: "date" },
        ].map(({ name, label, type }) => (
          <div key={name}>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              {label}
            </label>
            <input
              type={type}
              name={name}
              value={form[name]}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
        ))}

        {/* Prämienintervall */}
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            Prämienintervall
          </label>
          <select
            name="praemien_intervall"
            value={form.praemien_intervall}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            <option value="monatlich">Monatlich</option>
            <option value="vierteljaehrlich">Vierteljährlich</option>
            <option value="halbjaehrlich">Halbjährlich</option>
            <option value="jaehrlich">Jährlich</option>
          </select>
        </div>

        {fehler && (
          <div className="p-2 text-xs text-red-600 dark:text-red-400">{fehler}</div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onSchliessen}
            className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            disabled={speichern}
            className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {speichern ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Detail-Modal ──────────────────────────────────────────────────────────────

const DetailModal = ({ polizze, onSchliessen, onBearbeiten }) => {
  const [dokumentUrl, setDokumentUrl] = useState(null);

  useEffect(() => {
    if (polizze.dokumente?.storage_pfad) {
      supabase.storage
        .from("user-dokumente")
        .createSignedUrl(polizze.dokumente.storage_pfad, 3600)
        .then(({ data }) => setDokumentUrl(data?.signedUrl ?? null));
    }
  }, [polizze]);

  const felder = [
    { label: "Versicherer",        wert: polizze.versicherer },
    { label: "Polizzennummer",     wert: polizze.polizzen_nummer },
    { label: "Art",                wert: VERSICHERUNGSART_LABELS[polizze.versicherungsart] || polizze.versicherungsart },
    { label: "Deckung",            wert: polizze.deckung },
    { label: "Prämie",             wert: formatPraemie(polizze.praemie, polizze.praemien_intervall, polizze.waehrung) },
    { label: "Nächste Fälligkeit", wert: formatDatum(polizze.naechste_faelligkeit) },
    { label: "Beginn",             wert: formatDatum(polizze.start_date) },
    { label: "Ende",               wert: formatDatum(polizze.end_date) },
    { label: "Klassifikation",     wert: polizze.classification_confidence != null ? `${Math.round(polizze.classification_confidence * 100)} %` : null },
    { label: "Extraktion",         wert: polizze.extraction_confidence != null ? `${Math.round(polizze.extraction_confidence * 100)} %` : null },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <Shield size={16} className="text-primary-500" />
            {polizze.versicherer || "Versicherung"}
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {polizze.review_required && !polizze.reviewed_at && (
          <div className="p-3 rounded-card-sm bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle size={14} /> KI-Extraktion unsicher — bitte prüfen und korrigieren.
          </div>
        )}

        <dl className="space-y-2">
          {felder.map(({ label, wert }) =>
            wert && wert !== "—" ? (
              <div key={label} className="flex gap-3">
                <dt className="text-xs text-light-text-secondary dark:text-dark-text-secondary w-36 shrink-0">{label}</dt>
                <dd className="text-sm text-light-text-main dark:text-dark-text-main">{wert}</dd>
              </div>
            ) : null
          )}
        </dl>

        <div className="flex gap-2 pt-2 flex-wrap">
          {dokumentUrl && (
            <a
              href={dokumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-500/10 text-primary-500 rounded-card-sm hover:bg-primary-500/20 transition-colors"
            >
              <ExternalLink size={13} /> Originaldokument
            </a>
          )}
          <button
            onClick={onBearbeiten}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-canvas-3 dark:bg-canvas-3 text-dark-text-main hover:bg-canvas-4 rounded-card-sm transition-colors"
          >
            <Edit2 size={13} /> Bearbeiten
          </button>
          <button
            onClick={onSchliessen}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Polizze-Karte ─────────────────────────────────────────────────────────────

const PolizzeKarte = ({ polizze, onClick }) => {
  const tageEnd = tageBis(polizze.end_date);
  const laeuftBaldAb = tageEnd != null && tageEnd >= 0 && tageEnd <= 90;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate">
            {polizze.versicherer || "Unbekannter Versicherer"}
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
            {VERSICHERUNGSART_LABELS[polizze.versicherungsart] || polizze.versicherungsart || "Sonstige"}
            {polizze.polizzen_nummer && ` · ${polizze.polizzen_nummer}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {polizze.review_required && !polizze.reviewed_at && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle size={9} /> Prüfen
            </span>
          )}
          {laeuftBaldAb && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-500">
              {tageEnd === 0 ? "Heute" : `in ${tageEnd} Tagen`}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary flex-wrap">
        {polizze.praemie != null && (
          <span>{formatPraemie(polizze.praemie, polizze.praemien_intervall, polizze.waehrung)}</span>
        )}
        {polizze.end_date && <span>Ende: {formatDatum(polizze.end_date)}</span>}
        {polizze.naechste_faelligkeit && <span>Fällig: {formatDatum(polizze.naechste_faelligkeit)}</span>}
      </div>
    </button>
  );
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

const TABS = [
  { id: "alle",       label: "Alle" },
  { id: "laufend",    label: "Laufend" },
  { id: "baldAblauf", label: "Bald ablaufend" },
  { id: "abgelaufen", label: "Abgelaufen" },
  { id: "pruefen",    label: "Zur Prüfung" },
];

const HomeVersicherungen = ({ session }) => {
  const [polizzen, setPolizzen]     = useState([]);
  const [laden, setLaden]           = useState(true);
  const [fehler, setFehler]         = useState(null);
  const [aktTab, setAktTab]         = useState("alle");
  const [artFilter, setArtFilter]   = useState("alle");
  const [selected, setSelected]     = useState(null);
  const [editModal, setEditModal]   = useState(null);

  const ladePolizzen = useCallback(async () => {
    setLaden(true);
    try {
      const { data, error } = await supabase
        .from("versicherungs_polizzen")
        .select("*, dokumente(dateiname, storage_pfad, meta)")
        .order("end_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setPolizzen(data || []);
    } catch (err) {
      setFehler("Polizzen konnten nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { ladePolizzen(); }, [ladePolizzen]);

  const heute = new Date();

  const baldAblaufend = polizzen.filter((p) => {
    const tage = tageBis(p.end_date);
    return tage != null && tage >= 0 && tage <= 90;
  });

  // Verfügbare Versicherungsarten für Filter
  const vorhandeneArten = [...new Set(polizzen.map((p) => p.versicherungsart).filter(Boolean))];

  const filteredPolizzen = polizzen.filter((p) => {
    const artPasst = artFilter === "alle" || p.versicherungsart === artFilter;
    if (!artPasst) return false;
    switch (aktTab) {
      case "laufend":    return p.end_date && new Date(p.end_date) > heute;
      case "baldAblauf": { const t = tageBis(p.end_date); return t != null && t >= 0 && t <= 90; }
      case "abgelaufen": return p.end_date && new Date(p.end_date) <= heute;
      case "pruefen":    return p.review_required && !p.reviewed_at;
      default:           return true;
    }
  });

  const handleGespeichert = () => {
    setEditModal(null);
    setSelected(null);
    ladePolizzen();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield size={22} className="text-primary-500" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Versicherungen</h1>
      </div>

      {/* Alert-Banner */}
      {baldAblaufend.length > 0 && (
        <div className="p-3 rounded-card bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} />
          <span>
            {baldAblaufend.length === 1
              ? "1 Polizze läuft"
              : `${baldAblaufend.length} Polizzen laufen`}{" "}
            in den nächsten 90 Tagen ab.
          </span>
          <button onClick={() => setAktTab("baldAblauf")} className="ml-auto text-xs underline underline-offset-2">
            Anzeigen
          </button>
        </div>
      )}

      {/* Fehler */}
      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} /> {fehler}
          <button onClick={() => setFehler(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Tabs + Art-Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((tab) => {
          const anzahl = tab.id === "alle"
            ? polizzen.length
            : polizzen.filter((p) => {
                if (tab.id === "laufend")    return p.end_date && new Date(p.end_date) > heute;
                if (tab.id === "baldAblauf") { const t = tageBis(p.end_date); return t != null && t >= 0 && t <= 90; }
                if (tab.id === "abgelaufen") return p.end_date && new Date(p.end_date) <= heute;
                if (tab.id === "pruefen")    return p.review_required && !p.reviewed_at;
                return false;
              }).length;

          return (
            <button
              key={tab.id}
              onClick={() => setAktTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors border ${
                aktTab === tab.id
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-light-card dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:border-primary-500/50"
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${aktTab === tab.id ? "bg-white/20" : "bg-light-border dark:bg-canvas-3"}`}>
                {anzahl}
              </span>
            </button>
          );
        })}
      </div>

      {/* Art-Filter Dropdown */}
      {vorhandeneArten.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Art:</label>
          <select
            value={artFilter}
            onChange={(e) => setArtFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          >
            <option value="alle">Alle</option>
            {vorhandeneArten.map((art) => (
              <option key={art} value={art}>{VERSICHERUNGSART_LABELS[art] || art}</option>
            ))}
          </select>
        </div>
      )}

      {/* Inhalt */}
      {laden ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : filteredPolizzen.length === 0 ? (
        <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <Shield size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Keine Versicherungen in dieser Kategorie.</p>
          {aktTab === "alle" && artFilter === "alle" && (
            <p className="text-xs mt-1 opacity-70">
              Lade Versicherungspolizzen als Dokument hoch und wähle &quot;Vollständig extrahieren&quot;.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredPolizzen.map((p) => (
            <PolizzeKarte key={p.id} polizze={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {/* Detail-Modal */}
      {selected && !editModal && (
        <DetailModal
          polizze={selected}
          onSchliessen={() => setSelected(null)}
          onBearbeiten={() => setEditModal(selected)}
        />
      )}

      {/* Edit-Modal */}
      {editModal && (
        <EditModal
          polizze={editModal}
          onSchliessen={() => setEditModal(null)}
          onGespeichert={handleGespeichert}
        />
      )}
    </div>
  );
};

export default HomeVersicherungen;
