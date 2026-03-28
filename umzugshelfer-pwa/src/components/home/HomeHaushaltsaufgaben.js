import React, { useState, useEffect, useCallback } from "react";
import { CheckSquare, Plus, Trash2, X, Check, Loader2, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

const KATEGORIEN = ["Reinigung", "Pflege", "Garten", "Einkauf", "Reparatur", "Wartung", "Organisation", "Sonstiges"];
const PRIORITAETEN = ["Hoch", "Mittel", "Niedrig"];
const WIEDERHOLUNG = ["Keine", "Täglich", "Wöchentlich", "Monatlich", "Jährlich"];

const BewohnerBadge = ({ bewohner }) => {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bewohner.farbe + "22", color: bewohner.farbe }}
    >
      {bewohner.emoji} {bewohner.name}
    </span>
  );
};

const AufgabeForm = ({ initial, onSpeichern, onAbbrechen, bewohner }) => {
  const [form, setForm] = useState({
    beschreibung: initial?.beschreibung || "",
    kategorie: initial?.kategorie || "Reinigung",
    prioritaet: initial?.prioritaet || "Mittel",
    faelligkeitsdatum: initial?.faelligkeitsdatum ? initial.faelligkeitsdatum.split("T")[0] : "",
    wiederholung_typ: initial?.wiederholung_typ || "Keine",
    bewohner_id: initial?.bewohner_id || "",
    app_modus: "home",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Aufgabe*</label>
        <input
          value={form.beschreibung}
          onChange={(e) => setForm((p) => ({ ...p, beschreibung: e.target.value }))}
          placeholder="z.B. Kühlschrank reinigen"
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
          <select value={form.kategorie} onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Priorität</label>
          <select value={form.prioritaet} onChange={(e) => setForm((p) => ({ ...p, prioritaet: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {PRIORITAETEN.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Fällig am</label>
          <input type="date" value={form.faelligkeitsdatum} onChange={(e) => setForm((p) => ({ ...p, faelligkeitsdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Wiederholung</label>
          <select value={form.wiederholung_typ} onChange={(e) => setForm((p) => ({ ...p, wiederholung_typ: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {WIEDERHOLUNG.map((w) => <option key={w}>{w}</option>)}
          </select>
        </div>
      </div>
      {bewohner.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Zuständig</label>
          <select
            value={form.bewohner_id}
            onChange={(e) => setForm((p) => ({ ...p, bewohner_id: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            <option value="">— Niemand zugewiesen —</option>
            {bewohner.map((b) => (
              <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button
          onClick={() => form.beschreibung.trim() && onSpeichern({
            ...form,
            faelligkeitsdatum: form.faelligkeitsdatum ? `${form.faelligkeitsdatum}T12:00:00` : null,
            bewohner_id: form.bewohner_id || null,
          })}
          disabled={!form.beschreibung.trim()}
          className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

const HomeHaushaltsaufgaben = ({ session }) => {
  const userId = session?.user?.id;
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("aufgaben");
  const [loading, setLoading]       = useState(true);
  const [aufgaben, setAufgaben]     = useState([]);
  const [bewohner, setBewohner]     = useState([]);
  const [modal, setModal]           = useState(null);
  const [fehler, setFehler]         = useState(null);
  const [kategFilter, setKategFilter] = useState("");
  const [bewohnerFilter, setBewohnerFilter] = useState("");
  const [kiOffen, setKiOffen]       = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("todo_aufgaben")
        .select("*")
        .eq("user_id", userId)
        .in("app_modus", ["home", "beides"])
        .order("erledigt")
        .order("faelligkeitsdatum", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAufgaben(data || []);
    } catch (e) {
      setFehler("Fehler beim Laden der Aufgaben.");
    } finally {
      setLoading(false);
    }
    // Bewohner laden (Haushaltsmitglieder + Zusatzbewohner)
    supabase.rpc("get_bewohner_overview").then(({ data, error }) => {
      if (!error && Array.isArray(data)) {
        setBewohner(data.map((b) => ({
          id: b.id,
          name: b.display_name || b.name || "Bewohner",
          emoji: b.emoji || "👤",
          farbe: b.farbe || "#10B981",
          is_current_user: b.is_current_user === true,
        })));
      }
    });
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.id) {
      await supabase.from("todo_aufgaben").update(daten).eq("id", modal.id);
    } else {
      await supabase.from("todo_aufgaben").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const toggleErledigt = async (a) => {
    const neuerWert = !a.erledigt;
    setAufgaben((prev) =>
      prev.map((item) => item.id === a.id ? { ...item, erledigt: neuerWert } : item)
    );
    await supabase.from("todo_aufgaben").update({ erledigt: neuerWert }).eq("id", a.id);
  };

  const loesche = async (id) => {
    if (!window.confirm("Aufgabe löschen?")) return;
    await supabase.from("todo_aufgaben").delete().eq("id", id);
    ladeDaten();
  };

  const prioritaetFarbe = (p) => {
    if (p === "Hoch") return "text-red-500";
    if (p === "Mittel") return "text-amber-500";
    return "text-primary-500";
  };

  const heute = new Date().toISOString().split("T")[0];

  const gefilterteAufgaben = aufgaben.filter((a) => {
    if (kategFilter && a.kategorie !== kategFilter) return false;
    if (bewohnerFilter && a.bewohner_id !== bewohnerFilter) return false;
    return true;
  });

  const offen    = gefilterteAufgaben.filter((a) => !a.erledigt);
  const erledigt = gefilterteAufgaben.filter((a) => a.erledigt);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">Haushaltsaufgaben</h1>
          {offen.length > 0 && <span className="px-2 py-0.5 rounded-pill bg-red-500 text-white text-xs font-bold">{offen.length}</span>}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium
                       bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                       border border-primary-500/30 transition-colors">
            <Sparkles size={15} /><span className="hidden sm:inline">KI</span>
          </button>
          <button data-tour="tour-aufgaben-hinzufuegen" onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium whitespace-nowrap shrink-0">
            <Plus size={14} />
            <span className="hidden sm:inline">Neue Aufgabe</span>
            <span className="sm:hidden">Neu</span>
          </button>
        </div>
      </div>

      {fehler && <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} />{fehler}</div>}

      {/* Kategorie-Filter */}
      <div data-tour="tour-aufgaben-filter" className="flex gap-2 flex-wrap">
        <button onClick={() => setKategFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!kategFilter ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>Alle</button>
        {KATEGORIEN.map((k) => (
          <button key={k} onClick={() => setKategFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${kategFilter === k ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{k}</button>
        ))}
      </div>

      {/* Bewohner-Filter */}
      {bewohner.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setBewohnerFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!bewohnerFilter ? "bg-teal-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
          >
            Alle Personen
          </button>
          {bewohner.map((b) => (
            <button
              key={b.id}
              onClick={() => setBewohnerFilter(b.id)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${bewohnerFilter === b.id ? "text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
              style={bewohnerFilter === b.id ? { backgroundColor: b.farbe } : {}}
            >
              {b.emoji} {b.name}
            </button>
          ))}
        </div>
      )}

      {gefilterteAufgaben.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Keine Aufgaben</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"><Plus size={14} />Erste Aufgabe erstellen</button>
        </div>
      ) : (
        <div data-tour="tour-aufgaben-liste" className="space-y-4">
          {offen.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-2">Offen ({offen.length})</h2>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                {offen.map((a) => {
                  const ueberfaellig = a.faelligkeitsdatum && a.faelligkeitsdatum.split("T")[0] < heute;
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className={`flex items-start gap-3 bg-light-card dark:bg-canvas-2 rounded-card-sm border p-3 group ${ueberfaellig ? "border-red-500/40" : "border-light-border dark:border-dark-border"}`}
                    >
                      <motion.button whileTap={{ scale: 1.35 }} onClick={() => toggleErledigt(a)} className="mt-0.5 w-5 h-5 rounded border-2 border-light-border dark:border-dark-border hover:border-primary-500 flex items-center justify-center flex-shrink-0 transition-colors">
                        <div className="w-2 h-2 rounded-sm" />
                      </motion.button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-light-text-main dark:text-dark-text-main">{a.beschreibung}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-medium ${prioritaetFarbe(a.prioritaet)}`}>{a.prioritaet}</span>
                          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{a.kategorie}</span>
                          {a.faelligkeitsdatum && <span className={`text-xs ${ueberfaellig ? "text-red-500 font-medium" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>{ueberfaellig ? "Überfällig: " : "Fällig: "}{a.faelligkeitsdatum.split("T")[0]}</span>}
                          {a.wiederholung_typ && a.wiederholung_typ !== "Keine" && <span className="flex items-center gap-0.5 text-xs text-blue-500"><RefreshCw size={10} />{a.wiederholung_typ}</span>}
                          <BewohnerBadge bewohner={bewohner.find((b) => b.id === a.bewohner_id)} />
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal(a)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><AlertCircle size={12} /></button>
                        <button onClick={() => loesche(a.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {erledigt.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-2">Erledigt ({erledigt.length})</h2>
              <div className="space-y-2">
                {erledigt.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border p-3 opacity-60 group">
                    <button onClick={() => toggleErledigt(a)} className="w-5 h-5 rounded bg-primary-500 flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-white" />
                    </button>
                    <p className="flex-1 text-sm text-light-text-main dark:text-dark-text-main line-through">{a.beschreibung}</p>
                    {a.bewohner_id && <BewohnerBadge bewohner={bewohner.find((b) => b.id === a.bewohner_id)} />}
                    <button onClick={() => loesche(a.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-4 pb-[calc(var(--safe-area-bottom)+1rem)] px-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="p-4">
              <AufgabeForm
                initial={modal.id ? modal : null}
                onSpeichern={speichere}
                onAbbrechen={() => setModal(null)}
                bewohner={bewohner}
              />
            </div>
          </div>
        </div>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.aufgaben}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {/* KI-Assistent-Modal */}
      {kiOffen && (
        <KiHomeAssistent session={session} modul="aufgaben" onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              await supabase.from("todo_aufgaben").insert({
                user_id: session.user.id,
                beschreibung: item.beschreibung || "Aufgabe",
                kategorie: item.kategorie || "Sonstiges",
                prioritaet: item.prioritaet || "Mittel",
                faelligkeitsdatum: item.faelligkeitsdatum || null,
                wiederholung_typ: item.wiederholung_typ || "Keine",
                app_modus: "home",
                erledigt: false,
              });
            }
            ladeDaten();
          }}
        />
      )}
    </div>
  );
};

export default HomeHaushaltsaufgaben;
