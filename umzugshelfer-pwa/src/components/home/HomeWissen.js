import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Plus, Edit2, Trash2, X, Loader2, AlertCircle, Search, Tag, Eye, Receipt } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import DokumentVorschauModal from "./DokumentVorschauModal";

const KATEGORIEN = ["Rechnungen & Belege", "Farben & Oberflächen", "Maße & Abmessungen", "Geräte-Info", "Kontakte & Dienste", "Anleitungen", "Rezepte", "Notizen", "Sonstiges"];

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

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Titel*</label>
        <input value={form.titel} onChange={(e) => setForm((p) => ({ ...p, titel: e.target.value }))} placeholder="z.B. Wandfarbe Wohnzimmer" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
        <select value={form.kategorie} onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
          {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Inhalt</label>
        <textarea value={form.inhalt} onChange={(e) => setForm((p) => ({ ...p, inhalt: e.target.value }))} rows={5} placeholder="Alle relevanten Informationen, Maße, Codes, Notizen..." className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Tags (kommagetrennt)</label>
        <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="z.B. wohnzimmer, farbe, RAL" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
      </div>
      <div className="sticky bottom-0 bg-light-card dark:bg-canvas-2 border-t border-light-border dark:border-dark-border -mx-4 px-4 py-3 mt-1 flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={handleSpeichern} disabled={!form.titel.trim()} className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50">Speichern</button>
      </div>
    </div>
  );
};

const HomeWissen = ({ session }) => {
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [kategFilter, setKategFilter] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [vorschauDok, setVorschauDok] = useState(null);
  const [vorschauLaden, setVorschauLaden] = useState(null); // dokument_id currently loading

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

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.id) {
      await supabase.from("home_wissen").update(daten).eq("id", modal.id);
      await logVerlauf(supabase, userId, "home_wissen", daten.titel, "geaendert");
    } else {
      await supabase.from("home_wissen").insert(payload);
      await logVerlauf(supabase, userId, "home_wissen", daten.titel, "erstellt");
    }
    setModal(null);
    ladeDaten();
  };

  const loesche = async (id, titel) => {
    if (!window.confirm(`„${titel}" löschen?`)) return;
    await supabase.from("home_wissen").delete().eq("id", id);
    await logVerlauf(supabase, userId, "home_wissen", titel, "geloescht");
    if (detailId === id) setDetailId(null);
    ladeDaten();
  };

  const ladeVorschau = async (dokument_id) => {
    if (!dokument_id) return;
    setVorschauLaden(dokument_id);
    try {
      const { data } = await supabase
        .from("dokumente")
        .select("storage_pfad, datei_typ, dateiname")
        .eq("id", dokument_id)
        .single();
      if (data?.storage_pfad) {
        setVorschauDok({ storagePfad: data.storage_pfad, dateiname: data.dateiname, datei_typ: data.datei_typ });
      }
    } finally {
      setVorschauLaden(null);
    }
  };

  const gefiltertEintraege = eintraege.filter((e) => {
    const matchKateg = !kategFilter || e.kategorie === kategFilter;
    const q = suchbegriff.toLowerCase();
    const matchSuche = !q || e.titel.toLowerCase().includes(q) || e.inhalt?.toLowerCase().includes(q) || (e.tags || []).some((t) => t.toLowerCase().includes(q));
    return matchKateg && matchSuche;
  });

  const detailEintrag = eintraege.find((e) => e.id === detailId);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-amber-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Wissensdatenbank</h1>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm font-medium">
          <Plus size={14} />Eintrag
        </button>
      </div>

      {fehler && <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} />{fehler}</div>}

      {/* Suche */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
        <input value={suchbegriff} onChange={(e) => setSuchbegriff(e.target.value)} placeholder="Titel, Inhalt oder Tags durchsuchen..." className="w-full pl-9 pr-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500" />
      </div>

      {/* Kategorie-Filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setKategFilter("")} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${!kategFilter ? "bg-amber-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>Alle</button>
        {KATEGORIEN.map((k) => (
          <button
            key={k}
            onClick={() => setKategFilter(k)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${kategFilter === k ? "bg-amber-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
          >
            {k === "Rechnungen & Belege" && <Receipt size={10} />}
            {k}
          </button>
        ))}
      </div>

      {gefiltertEintraege.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{suchbegriff || kategFilter ? "Keine Einträge gefunden" : "Noch keine Einträge"}</p>
          {!suchbegriff && !kategFilter && (
            <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm">
              <Plus size={14} />Ersten Eintrag anlegen
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gefiltertEintraege.map((e) => (
            <div
              key={e.id}
              className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-2 border border-light-border dark:border-dark-border p-4 cursor-pointer hover:border-amber-500/40 transition-colors group"
              onClick={() => setDetailId(e.id === detailId ? null : e.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main line-clamp-1">{e.titel}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {e.dokument_id && (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); ladeVorschau(e.dokument_id); }}
                      disabled={vorschauLaden === e.dokument_id}
                      className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 disabled:opacity-50"
                      title="Dokument anzeigen"
                    >
                      {vorschauLaden === e.dokument_id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                    </button>
                  )}
                  <button onClick={(ev) => { ev.stopPropagation(); setModal(e); }} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={12} /></button>
                  <button onClick={(ev) => { ev.stopPropagation(); loesche(e.id, e.titel); }} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
              <p className="text-xs text-amber-500 mb-2">{e.kategorie}</p>
              {e.inhalt && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">{e.inhalt}</p>}
              {(e.tags || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {e.tags.map((t) => (
                    <span key={t} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Tag size={9} />{t}
                    </span>
                  ))}
                </div>
              )}
              {/* Detail-Ansicht ausgeklappt */}
              {detailId === e.id && e.inhalt && (
                <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border">
                  <pre className="text-xs text-light-text-main dark:text-dark-text-main whitespace-pre-wrap font-sans">{e.inhalt}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail-Panel für ausgewählten Eintrag (Desktop-Sidebar) */}
      {detailEintrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe sm:hidden">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl w-full border border-light-border dark:border-dark-border max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{detailEintrag.titel}</h3>
              <button onClick={() => setDetailId(null)}><X size={18} className="text-light-text-secondary dark:text-dark-text-secondary" /></button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              <p className="text-xs text-amber-500 mb-3">{detailEintrag.kategorie}</p>
              <pre className="text-sm text-light-text-main dark:text-dark-text-main whitespace-pre-wrap font-sans">{detailEintrag.inhalt || "Kein Inhalt"}</pre>
              {(detailEintrag.tags || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-4">
                  {detailEintrag.tags.map((t) => <span key={t} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400"><Tag size={10} />{t}</span>)}
                </div>
              )}
              {detailEintrag.dokument_id && (
                <button
                  onClick={() => ladeVorschau(detailEintrag.dokument_id)}
                  disabled={vorschauLaden === detailEintrag.dokument_id}
                  className="mt-4 flex items-center gap-1.5 px-3 py-2 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors disabled:opacity-50"
                >
                  {vorschauLaden === detailEintrag.dokument_id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                  Originaldokument anzeigen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dokument-Vorschau */}
      {vorschauDok && (
        <DokumentVorschauModal
          storagePfad={vorschauDok.storagePfad}
          dateiname={vorschauDok.dateiname}
          datei_typ={vorschauDok.datei_typ}
          onSchliessen={() => setVorschauDok(null)}
        />
      )}

      {/* Formular-Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl max-w-lg w-full border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border shrink-0">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 pb-2">
              <WissenForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeWissen;
