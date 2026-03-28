import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollText, AlertTriangle, CheckCircle, Edit2, ExternalLink,
  Loader2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "../../supabaseClient";

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const formatDatum = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE");
};

const tageBis = (datum) => {
  if (!datum) return null;
  const diff = Math.ceil((new Date(datum) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

// ── Edit-Modal ────────────────────────────────────────────────────────────────

const EditModal = ({ vertrag, onSchliessen, onGespeichert }) => {
  const [form, setForm] = useState({
    partner:              vertrag.partner              || "",
    vertragstitel:        vertrag.vertragstitel        || "",
    start_date:           vertrag.start_date           || "",
    end_date:             vertrag.end_date             || "",
    kuendigungsfrist_raw: vertrag.kuendigungsfrist_raw || "",
    kuendigungsfrist_tage: vertrag.kuendigungsfrist_tage ?? "",
    kuendigbar_ab:        vertrag.kuendigbar_ab        || "",
  });
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSpeichern = async () => {
    setSpeichern(true);
    setFehler("");
    try {
      const { error } = await supabase
        .from("vertraege")
        .update({
          partner:               form.partner || null,
          vertragstitel:         form.vertragstitel || null,
          start_date:            form.start_date || null,
          end_date:              form.end_date || null,
          kuendigungsfrist_raw:  form.kuendigungsfrist_raw || null,
          kuendigungsfrist_tage: form.kuendigungsfrist_tage !== "" ? Number(form.kuendigungsfrist_tage) : null,
          kuendigbar_ab:         form.kuendigbar_ab || null,
          review_required:       false,
          reviewed_at:           new Date().toISOString(),
        })
        .eq("id", vertrag.id);
      if (error) throw error;

      // Wissen-Sync: Auto-Stubs mit neuem Titel aktualisieren (manuell nicht anfassen)
      if (vertrag.dokument_id) {
        await supabase
          .from("home_wissen")
          .update({ titel: `Vertrag: ${form.partner || form.vertragstitel || "Unbekannt"}`, kategorie: "Verträge" })
          .eq("dokument_id", vertrag.dokument_id)
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
            <Edit2 size={16} className="text-primary-500" /> Vertrag bearbeiten
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {[
          { name: "partner",              label: "Vertragspartner",       type: "text" },
          { name: "vertragstitel",        label: "Vertragstitel",         type: "text" },
          { name: "start_date",           label: "Beginn",                type: "date" },
          { name: "end_date",             label: "Ende",                  type: "date" },
          { name: "kuendigungsfrist_raw", label: "Kündigungsfrist (Text)", type: "text" },
          { name: "kuendigungsfrist_tage",label: "Kündigungsfrist (Tage)", type: "number" },
          { name: "kuendigbar_ab",        label: "Kündbar ab",            type: "date" },
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

const DetailModal = ({ vertrag, onSchliessen, onBearbeiten }) => {
  const [dokumentUrl, setDokumentUrl] = useState(null);

  useEffect(() => {
    if (vertrag.dokumente?.storage_pfad) {
      supabase.storage
        .from("user-dokumente")
        .createSignedUrl(vertrag.dokumente.storage_pfad, 3600)
        .then(({ data }) => setDokumentUrl(data?.signedUrl ?? null));
    }
  }, [vertrag]);

  const felder = [
    { label: "Vertragspartner",       wert: vertrag.partner },
    { label: "Vertragstitel",         wert: vertrag.vertragstitel },
    { label: "Beginn",                wert: formatDatum(vertrag.start_date) },
    { label: "Ende",                  wert: formatDatum(vertrag.end_date) },
    { label: "Kündigungsfrist",       wert: vertrag.kuendigungsfrist_raw || (vertrag.kuendigungsfrist_tage != null ? `${vertrag.kuendigungsfrist_tage} Tage` : null) },
    { label: "Kündbar ab",            wert: formatDatum(vertrag.kuendigbar_ab) },
    { label: "Klassifikation",        wert: vertrag.classification_confidence != null ? `${Math.round(vertrag.classification_confidence * 100)} %` : null },
    { label: "Extraktion",            wert: vertrag.extraction_confidence != null ? `${Math.round(vertrag.extraction_confidence * 100)} %` : null },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-safe bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-elevation-3 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main flex items-center gap-2">
            <ScrollText size={16} className="text-primary-500" />
            {vertrag.partner || vertrag.vertragstitel || "Vertrag"}
          </h2>
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {vertrag.review_required && !vertrag.reviewed_at && (
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

// ── Vertrags-Karte ────────────────────────────────────────────────────────────

const VertragKarte = ({ vertrag, onClick }) => {
  const tageEndDate    = tageBis(vertrag.end_date);
  const tageKuendigung = tageBis(vertrag.kuendigbar_ab);

  const laeuftBaldAb = tageEndDate != null && tageEndDate >= 0 && tageEndDate <= 60;
  const kuendbarJetzt = tageKuendigung != null && tageKuendigung <= 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate">
            {vertrag.partner || "Unbekannter Partner"}
          </p>
          {vertrag.vertragstitel && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
              {vertrag.vertragstitel}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {vertrag.review_required && !vertrag.reviewed_at && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle size={9} /> Prüfen
            </span>
          )}
          {laeuftBaldAb && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-500">
              {tageEndDate === 0 ? "Heute" : `in ${tageEndDate} Tagen`}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
        {vertrag.start_date && <span>Beginn: {formatDatum(vertrag.start_date)}</span>}
        {vertrag.end_date   && <span>Ende: {formatDatum(vertrag.end_date)}</span>}
        {kuendbarJetzt && vertrag.kuendigbar_ab && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Kündbar seit {formatDatum(vertrag.kuendigbar_ab)}
          </span>
        )}
      </div>
    </button>
  );
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

const TABS = [
  { id: "alle",       label: "Alle" },
  { id: "laufend",    label: "Laufend" },
  { id: "kuendbar",   label: "Bald kündbar" },
  { id: "abgelaufen", label: "Abgelaufen" },
  { id: "pruefen",    label: "Zur Prüfung" },
];

const HomeVertraege = ({ session }) => {
  const [vertraege, setVertraege]     = useState([]);
  const [laden, setLaden]             = useState(true);
  const [fehler, setFehler]           = useState(null);
  const [aktTab, setAktTab]           = useState("alle");
  const [selected, setSelected]       = useState(null);
  const [editModal, setEditModal]     = useState(null);

  const ladeVertraege = useCallback(async () => {
    setLaden(true);
    try {
      const { data, error } = await supabase
        .from("vertraege")
        .select("*, dokumente(dateiname, storage_pfad, meta)")
        .order("end_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setVertraege(data || []);
    } catch (err) {
      setFehler("Verträge konnten nicht geladen werden.");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { ladeVertraege(); }, [ladeVertraege]);

  // Alert: bald kündbare Verträge (kuendigbar_ab ≤ heute+60)
  const bald = vertraege.filter((v) => {
    const tage = tageBis(v.kuendigbar_ab);
    return tage != null && tage >= 0 && tage <= 60;
  });

  const heute = new Date();
  const filteredVertraege = vertraege.filter((v) => {
    switch (aktTab) {
      case "laufend":    return v.end_date && new Date(v.end_date) > heute;
      case "kuendbar":   { const t = tageBis(v.kuendigbar_ab); return t != null && t >= 0 && t <= 60; }
      case "abgelaufen": return v.end_date && new Date(v.end_date) <= heute;
      case "pruefen":    return v.review_required && !v.reviewed_at;
      default:           return true;
    }
  });

  const handleGespeichert = () => {
    setEditModal(null);
    setSelected(null);
    ladeVertraege();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <ScrollText size={22} className="text-primary-500" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Verträge</h1>
      </div>

      {/* Alert-Banner */}
      {bald.length > 0 && (
        <div className="p-3 rounded-card bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} />
          <span>
            {bald.length === 1
              ? "1 Vertrag"
              : `${bald.length} Verträge`}{" "}
            mit Kündigungsoption in den nächsten 60 Tagen.
          </span>
          <button onClick={() => setAktTab("kuendbar")} className="ml-auto text-xs underline underline-offset-2">
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

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((tab) => {
          const anzahl = tab.id === "alle"
            ? vertraege.length
            : vertraege.filter((v) => {
                if (tab.id === "laufend")    return v.end_date && new Date(v.end_date) > heute;
                if (tab.id === "kuendbar")   { const t = tageBis(v.kuendigbar_ab); return t != null && t >= 0 && t <= 60; }
                if (tab.id === "abgelaufen") return v.end_date && new Date(v.end_date) <= heute;
                if (tab.id === "pruefen")    return v.review_required && !v.reviewed_at;
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

      {/* Inhalt */}
      {laden ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : filteredVertraege.length === 0 ? (
        <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <ScrollText size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Keine Verträge in dieser Kategorie.</p>
          {aktTab === "alle" && (
            <p className="text-xs mt-1 opacity-70">
              Lade Verträge als Dokument hoch und wähle &quot;Vollständig extrahieren&quot;.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredVertraege.map((v) => (
            <VertragKarte key={v.id} vertrag={v} onClick={() => setSelected(v)} />
          ))}
        </div>
      )}

      {/* Detail-Modal */}
      {selected && !editModal && (
        <DetailModal
          vertrag={selected}
          onSchliessen={() => setSelected(null)}
          onBearbeiten={() => setEditModal(selected)}
        />
      )}

      {/* Edit-Modal */}
      {editModal && (
        <EditModal
          vertrag={editModal}
          onSchliessen={() => setEditModal(null)}
          onGespeichert={handleGespeichert}
        />
      )}
    </div>
  );
};

export default HomeVertraege;
