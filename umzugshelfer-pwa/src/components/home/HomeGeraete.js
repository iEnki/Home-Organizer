import React, { useState, useEffect, useCallback } from "react";
import { Wrench, Plus, Edit2, Trash2, X, AlertTriangle, Loader2, AlertCircle, ChevronDown, ChevronRight, FileText, Link2, Unlink, Sparkles } from "lucide-react";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

const GeraetForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    name: initial?.name || "",
    hersteller: initial?.hersteller || "",
    modell: initial?.modell || "",
    seriennummer: initial?.seriennummer || "",
    kaufdatum: initial?.kaufdatum || "",
    kaufpreis: initial?.kaufpreis || "",
    garantie_bis: initial?.garantie_bis || "",
    naechste_wartung: initial?.naechste_wartung || "",
    wartungsintervall_monate: initial?.wartungsintervall_monate || "",
    notizen: initial?.notizen || "",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Gerätebezeichnung*</label>
        <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="z.B. Waschmaschine" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Hersteller</label>
          <input value={form.hersteller} onChange={(e) => setForm((p) => ({ ...p, hersteller: e.target.value }))} placeholder="z.B. Bosch" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Modell</label>
          <input value={form.modell} onChange={(e) => setForm((p) => ({ ...p, modell: e.target.value }))} placeholder="z.B. WAX32K42" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kaufdatum</label>
          <input type="date" value={form.kaufdatum} onChange={(e) => setForm((p) => ({ ...p, kaufdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Garantie bis</label>
          <input type="date" value={form.garantie_bis} onChange={(e) => setForm((p) => ({ ...p, garantie_bis: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Nächste Wartung</label>
          <input type="date" value={form.naechste_wartung} onChange={(e) => setForm((p) => ({ ...p, naechste_wartung: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Intervall (Monate)</label>
          <input type="number" min="1" value={form.wartungsintervall_monate} onChange={(e) => setForm((p) => ({ ...p, wartungsintervall_monate: e.target.value }))} placeholder="z.B. 12" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Notizen</label>
        <textarea value={form.notizen} onChange={(e) => setForm((p) => ({ ...p, notizen: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none" />
      </div>
      <div className="sticky bottom-0 bg-light-card dark:bg-canvas-2 border-t border-light-border dark:border-dark-border -mx-4 px-4 py-3 mt-1 flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={() => form.name.trim() && onSpeichern(form)} disabled={!form.name.trim()} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50">Speichern</button>
      </div>
    </div>
  );
};

const HomeGeraete = ({ session }) => {
  const userId = session?.user?.id;
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("geraete");
  const [loading, setLoading] = useState(true);
  const [geraete, setGeraete] = useState([]);
  const [wartungen, setWartungen] = useState([]);
  const [dokumente, setDokumente] = useState([]);
  const [modal, setModal] = useState(null);
  const [ausgeklappt, setAusgeklappt] = useState({});
  const [aktivTab, setAktivTab] = useState({}); // geraetId -> "wartung" | "dokumente"
  const [dokuModal, setDokuModal] = useState(null); // geraetId für Dokumenten-Picker
  const [fehler, setFehler] = useState(null);
  const [kiOffen, setKiOffen] = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [geraeteRes, wartungenRes, dokRes] = await Promise.all([
        supabase.from("home_geraete").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_wartungen").select("*").eq("user_id", userId).order("datum", { ascending: false }),
        supabase.from("dokumente").select("id, dateiname, datei_typ").eq("user_id", userId).order("dateiname"),
      ]);
      setGeraete(geraeteRes.data || []);
      setWartungen(wartungenRes.data || []);
      setDokumente(dokRes.data || []);
    } catch (e) {
      setFehler("Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.id) {
      await supabase.from("home_geraete").update(daten).eq("id", modal.id);
    } else {
      await supabase.from("home_geraete").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loesche = async (id) => {
    if (!window.confirm("Gerät und alle Wartungseinträge löschen?")) return;
    await supabase.from("home_geraete").delete().eq("id", id);
    ladeDaten();
  };

  const wartungErledigt = async (geraetId) => {
    const g = geraete.find((x) => x.id === geraetId);
    if (!g) return;
    const neuesDatum = g.wartungsintervall_monate
      ? new Date(Date.now() + g.wartungsintervall_monate * 30 * 86400000).toISOString().split("T")[0]
      : null;
    await supabase.from("home_wartungen").insert({ user_id: userId, geraet_id: geraetId, datum: new Date().toISOString().split("T")[0], typ: "Wartung", beschreibung: "Reguläre Wartung erledigt" });
    if (neuesDatum) {
      await supabase.from("home_geraete").update({ naechste_wartung: neuesDatum }).eq("id", geraetId);
    }
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
    setGeraete((prev) => prev.map((x) => x.id === geraetId ? { ...x, verknuepfte_dokument_ids: updated } : x));
  };

  const heute = new Date().toISOString().split("T")[0];

  const getTab = (id) => aktivTab[id] || "wartung";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Geräte & Wartung</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium
                       bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                       border border-primary-500/30 transition-colors">
            <Sparkles size={15} /><span className="hidden sm:inline">KI</span>
          </button>
          <button data-tour="tour-geraete-hinzufuegen" onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium">
            <Plus size={14} />Gerät hinzufügen
          </button>
        </div>
      </div>

      {fehler && <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} />{fehler}</div>}

      {geraete.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <Wrench size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Geräte erfasst</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"><Plus size={14} />Erstes Gerät hinzufügen</button>
        </div>
      ) : (
        <div data-tour="tour-geraete-liste" className="space-y-3">
          {geraete.map((g) => {
            const wartungFaellig = g.naechste_wartung && g.naechste_wartung <= heute;
            const garantieAbgelaufen = g.garantie_bis && g.garantie_bis < heute;
            const geraetWartungen = wartungen.filter((w) => w.geraet_id === g.id);
            const isOffen = ausgeklappt[g.id];
            const tab = getTab(g.id);
            const verknuepftIds = g.verknuepfte_dokument_ids || [];
            const verknuepfteDoks = dokumente.filter((d) => verknuepftIds.includes(d.id));

            return (
              <div key={g.id} className={`bg-light-card dark:bg-canvas-2 rounded-card border ${wartungFaellig ? "border-accent-warm/40" : "border-light-border dark:border-dark-border"}`}>
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setAusgeklappt((p) => ({ ...p, [g.id]: !isOffen }))} className="text-light-text-secondary dark:text-dark-text-secondary">
                    {isOffen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main">{g.name}</h3>
                      {g.hersteller && <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{g.hersteller}</span>}
                      {wartungFaellig && <span className="flex items-center gap-0.5 text-xs text-orange-500 rounded-pill"><AlertTriangle size={11} />Wartung fällig</span>}
                      {garantieAbgelaufen && <span className="text-xs text-gray-400 rounded-pill">Garantie abgelaufen</span>}
                      {verknuepftIds.length > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-blue-500"><FileText size={11} />{verknuepftIds.length}</span>
                      )}
                    </div>
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      {g.naechste_wartung && <span>Nächste Wartung: {g.naechste_wartung}</span>}
                      {g.garantie_bis && !garantieAbgelaufen && <span className="ml-3">Garantie bis: {g.garantie_bis}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wartungFaellig && (
                      <button onClick={() => wartungErledigt(g.id)} className="px-2 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-pill">Erledigt</button>
                    )}
                    <button onClick={() => setModal(g)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={13} /></button>
                    <button onClick={() => loesche(g.id)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                </div>

                {isOffen && (
                  <div className="border-t border-light-border dark:border-dark-border">
                    {/* Tab-Leiste */}
                    <div className="flex border-b border-light-border dark:border-dark-border">
                      <button
                        onClick={() => setAktivTab((p) => ({ ...p, [g.id]: "wartung" }))}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${tab === "wartung" ? "border-b-2 border-primary-500 text-primary-500" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}
                      >
                        Wartungsprotokoll ({geraetWartungen.length})
                      </button>
                      <button
                        onClick={() => setAktivTab((p) => ({ ...p, [g.id]: "dokumente" }))}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${tab === "dokumente" ? "border-b-2 border-blue-500 text-blue-500" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}
                      >
                        Dokumente ({verknuepftIds.length})
                      </button>
                    </div>

                    {/* Wartungs-Tab */}
                    {tab === "wartung" && (
                      <div className="p-3">
                        {geraetWartungen.length === 0 ? (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Noch keine Wartungen</p>
                        ) : (
                          <div className="space-y-1">
                            {geraetWartungen.slice(0, 5).map((w) => (
                              <div key={w.id} className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                <span className="w-20 flex-shrink-0">{w.datum}</span>
                                <span>{w.typ}</span>
                                {w.beschreibung && <span>— {w.beschreibung}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dokumente-Tab */}
                    {tab === "dokumente" && (
                      <div className="p-3">
                        {verknuepfteDoks.length === 0 ? (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">Keine Dokumente verknüpft.</p>
                        ) : (
                          <div className="space-y-1 mb-2">
                            {verknuepfteDoks.map((d) => (
                              <div key={d.id} className="flex items-center gap-2 text-xs text-light-text-main dark:text-dark-text-main group">
                                <FileText size={12} className="text-blue-500 flex-shrink-0" />
                                <span className="flex-1 truncate">{d.dateiname}</span>
                                {d.datei_typ && <span className="text-light-text-secondary dark:text-dark-text-secondary">{d.datei_typ}</span>}
                                <button onClick={() => toggleDokumentLink(g.id, d.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 transition-opacity" title="Verknüpfung lösen">
                                  <Unlink size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => setDokuModal(g.id)}
                          className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          <Link2 size={12} />Dokument verknüpfen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Gerät-Formular-Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border shrink-0">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? "Gerät bearbeiten" : "Neues Gerät"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 pb-2">
              <GeraetForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.geraete}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {/* KI-Assistent-Modal */}
      {kiOffen && (
        <KiHomeAssistent session={session} modul="geraete" onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              await supabase.from("home_geraete").insert({
                user_id: session.user.id,
                name: item.name || "Unbenannt",
                hersteller: item.hersteller || null,
                modell: item.modell || null,
                wartungsintervall_monate: item.wartungsintervall_monate || null,
              });
            }
            ladeDaten();
          }}
        />
      )}

      {/* Dokumenten-Picker-Modal */}
      {dokuModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-sm w-full border border-light-border dark:border-dark-border max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">Dokument verknüpfen</h3>
              <button onClick={() => setDokuModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {dokumente.length === 0 ? (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-8">Noch keine Dokumente vorhanden. Lade Dokumente im Dokumenten-Manager hoch.</p>
              ) : (
                <div className="space-y-1">
                  {dokumente.map((d) => {
                    const geraet = geraete.find((g) => g.id === dokuModal);
                    const isLinked = (geraet?.verknuepfte_dokument_ids || []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDokumentLink(dokuModal, d.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-card-sm text-sm transition-colors ${isLinked ? "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400" : "hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"}`}
                      >
                        <FileText size={14} className={isLinked ? "text-blue-500" : "text-light-text-secondary dark:text-dark-text-secondary"} />
                        <span className="flex-1 text-left truncate">{d.dateiname}</span>
                        {d.datei_typ && <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">{d.datei_typ}</span>}
                        {isLinked && <Link2 size={12} className="text-blue-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-3 border-t border-light-border dark:border-dark-border">
              <button onClick={() => setDokuModal(null)} className="w-full px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill">Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeGeraete;
