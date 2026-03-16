import React, { useState, useEffect, useCallback } from "react";
import { FolderOpen, Plus, Edit2, Trash2, X, Loader2, AlertCircle, ChevronDown, ChevronRight, CheckSquare, Square, Leaf, Sun, Wind, Snowflake, Sparkles } from "lucide-react";
import KiHomeAssistent from "./KiHomeAssistent";
import { supabase } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

const TYPEN = ["Reorganisation", "Reparatur", "Saisonwechsel", "Renovierung", "Dekoration", "Anschaffung", "Sonstiges"];

// ─── Jahreszeiten-Templates ───────────────────────────────────────────────────
const SAISON_TEMPLATES = {
  Frühling: {
    icon: Leaf,
    farbe: "text-primary-500",
    bg: "bg-primary-500/10",
    name: "Frühjahrsputz & Neustart",
    beschreibung: "Frühjahrsputz, Garten vorbereiten und Winterkram einräumen.",
    aufgaben: [
      "Fenster putzen (innen + außen)",
      "Winterkleidung waschen und einlagern",
      "Sommerkleidung herausholen",
      "Keller/Abstellraum aufräumen",
      "Garten vorbereiten (Beete umgraben, Dünger)",
      "Heizung abschalten und überprüfen lassen",
      "Fahrräder herrichten",
    ],
  },
  Sommer: {
    icon: Sun,
    farbe: "text-yellow-500",
    bg: "bg-yellow-500/10",
    name: "Sommer-Vorbereitung",
    beschreibung: "Urlaub vorbereiten, Garten pflegen und Hitzeschutz einrichten.",
    aufgaben: [
      "Sonnenschutz (Rollos, Sonnenschirme) prüfen",
      "Klimaanlage/Ventilatoren warten",
      "Gartengeräte überprüfen",
      "Grillequipment reinigen",
      "Notfall-Wasservorrat prüfen",
      "Fenster abdichten gegen Insekten",
    ],
  },
  Herbst: {
    icon: Wind,
    farbe: "text-orange-500",
    bg: "bg-orange-500/10",
    name: "Herbst-Einräumen",
    beschreibung: "Sommer beenden, auf Winter vorbereiten und Vorräte anlegen.",
    aufgaben: [
      "Sommerkleidung einräumen",
      "Winterkleidung herausholen",
      "Gartenmöbel einräumen / abdecken",
      "Heizung in Betrieb nehmen und testen",
      "Wintervorräte anlegen (Konserven, Trockenware)",
      "Regenrinnen reinigen",
      "Rauchmelder und CO-Melder testen",
    ],
  },
  Winter: {
    icon: Snowflake,
    farbe: "text-blue-400",
    bg: "bg-blue-400/10",
    name: "Winter-Vorbereitung",
    beschreibung: "Frostschutz, Notfall-Ausrüstung prüfen und gemütlich machen.",
    aufgaben: [
      "Winterreifen aufziehen",
      "Frostschutzmittel prüfen (Auto, Wasserrohre)",
      "Schneeschaufel und Streugut bereitstellen",
      "Notfall-Vorräte prüfen (Kerzen, Taschenlampe, Batterien)",
      "Heizöl / Pellets / Gas auffüllen",
      "Weihnachtsdeko hervorholen und prüfen",
    ],
  },
};

const SaisonWahlModal = ({ onWaehle, onAbbrechen }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl max-w-sm w-full border border-light-border dark:border-dark-border">
      <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
        <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">Jahreszeiten-Template</h3>
        <button onClick={onAbbrechen} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(SAISON_TEMPLATES).map(([saison, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={saison}
              onClick={() => onWaehle(saison)}
              className={`flex flex-col items-center gap-2 p-4 rounded-card-sm border border-light-border dark:border-dark-border hover:border-current transition-colors ${meta.bg}`}
            >
              <Icon size={28} className={meta.farbe} />
              <span className={`text-sm font-medium rounded-pill ${meta.farbe}`}>{saison}</span>
              <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary text-center">{meta.aufgaben.length} Aufgaben</span>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-4">
        <button onClick={onAbbrechen} className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Ohne Template fortfahren</button>
      </div>
    </div>
  </div>
);
const STATUS_OPTIONEN = ["geplant", "in_bearbeitung", "pausiert", "abgeschlossen"];
const STATUS_LABEL = { geplant: "Geplant", in_bearbeitung: "In Bearbeitung", pausiert: "Pausiert", abgeschlossen: "Abgeschlossen" };
const STATUS_FARBEN = { geplant: "bg-gray-500/10 text-gray-500", in_bearbeitung: "bg-blue-500/10 text-blue-500", pausiert: "bg-amber-500/10 text-amber-500", abgeschlossen: "bg-green-500/10 text-green-500" };

const ProjektForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    name: initial?.name || "",
    typ: initial?.typ || "Sonstiges",
    status: initial?.status || "geplant",
    beschreibung: initial?.beschreibung || "",
    startdatum: initial?.startdatum || "",
    zieldatum: initial?.zieldatum || "",
    budget: initial?.budget || "",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Projektname*</label>
        <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="z.B. Keller aufräumen" className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Typ</label>
          <select value={form.typ} onChange={(e) => setForm((p) => ({ ...p, typ: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {TYPEN.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {STATUS_OPTIONEN.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Beschreibung</label>
        <textarea value={form.beschreibung} onChange={(e) => setForm((p) => ({ ...p, beschreibung: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Start</label>
          <input type="date" value={form.startdatum} onChange={(e) => setForm((p) => ({ ...p, startdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Zieldatum</label>
          <input type="date" value={form.zieldatum} onChange={(e) => setForm((p) => ({ ...p, zieldatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Budget (€)</label>
          <input type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={() => form.name.trim() && onSpeichern(form)} disabled={!form.name.trim()} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50">Speichern</button>
      </div>
    </div>
  );
};

const HomeProjekte = ({ session }) => {
  const userId = session?.user?.id;
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("projekte");
  const [loading, setLoading] = useState(true);
  const [projekte, setProjekte] = useState([]);
  const [todos, setTodos] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [neuerTodoText, setNeuerTodoText] = useState("");
  const [saisonModal, setSaisonModal] = useState(false);
  const [kiOffen, setKiOffen] = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [projektRes, todoRes] = await Promise.all([
        supabase.from("home_projekte").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("todo_aufgaben").select("id, beschreibung, erledigt, home_projekt_id").eq("user_id", userId).not("home_projekt_id", "is", null),
      ]);
      if (projektRes.error) throw projektRes.error;
      setProjekte(projektRes.data || []);
      setTodos(todoRes.data || []);
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
      await supabase.from("home_projekte").update(daten).eq("id", modal.id);
      await logVerlauf(supabase, userId, "home_projekte", daten.name, "geaendert");
    } else {
      const { data: neu } = await supabase.from("home_projekte").insert(payload).select("id").single();
      await logVerlauf(supabase, userId, "home_projekte", daten.name, "erstellt");
      // Saison-Template-Aufgaben anlegen (aus modal-State, nicht aus ProjektForm-daten)
      const saisonAufgaben = modal?._saisonAufgaben;
      if (saisonAufgaben?.length && neu?.id) {
        const todoPayload = saisonAufgaben.map((text) => ({
          user_id: userId,
          beschreibung: text,
          kategorie: "Sonstiges",
          home_projekt_id: neu.id,
          app_modus: "home",
          erledigt: false,
        }));
        await supabase.from("todo_aufgaben").insert(todoPayload);
      }
    }
    setModal(null);
    ladeDaten();
  };

  // Saison-Template auswählen → Formular mit Vorausfüllung öffnen
  const waehleSaison = (saison) => {
    const tmpl = SAISON_TEMPLATES[saison];
    setSaisonModal(false);
    setModal({
      name: tmpl.name,
      typ: "Saisonwechsel",
      status: "geplant",
      beschreibung: tmpl.beschreibung,
      startdatum: "",
      zieldatum: "",
      budget: "",
      _saisonAufgaben: tmpl.aufgaben,
    });
  };

  const loesche = async (id) => {
    const p = projekte.find((x) => x.id === id);
    if (!window.confirm("Projekt löschen?")) return;
    await supabase.from("home_projekte").delete().eq("id", id);
    if (p) await logVerlauf(supabase, userId, "home_projekte", p.name, "geloescht");
    ladeDaten();
  };

  const toggleTodo = async (todoId, erledigt) => {
    await supabase.from("todo_aufgaben").update({ erledigt: !erledigt }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => t.id === todoId ? { ...t, erledigt: !erledigt } : t));
  };

  const todoHinzufuegen = async (projektId) => {
    const text = neuerTodoText.trim();
    if (!text) return;
    const { data } = await supabase.from("todo_aufgaben").insert({
      user_id: userId,
      beschreibung: text,
      kategorie: "Sonstiges",
      home_projekt_id: projektId,
      app_modus: "home",
      erledigt: false,
    }).select("id, beschreibung, erledigt, home_projekt_id").single();
    if (data) setTodos((prev) => [...prev, data]);
    setNeuerTodoText("");
  };

  const todoLoeschen = async (todoId) => {
    await supabase.from("todo_aufgaben").delete().eq("id", todoId);
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
  };

  const gefiltertProjekte = projekte.filter((p) => !statusFilter || p.status === statusFilter);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen size={22} className="text-purple-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Projekte</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSaisonModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-pill text-sm font-medium" title="Jahreszeiten-Template verwenden">
            <Leaf size={14} />Saison
          </button>
          <button onClick={() => setKiOffen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-pill text-sm font-medium" title="Per KI erfassen">
            <Sparkles size={14} /><span className="hidden sm:inline">KI</span>
          </button>
          <button data-tour="tour-projekte-hinzufuegen" onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium">
            <Plus size={14} />Neues Projekt
          </button>
        </div>
      </div>

      {fehler && <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} />{fehler}</div>}

      {/* Status-Filter */}
      <div data-tour="tour-projekte-status" className="flex gap-2 flex-wrap">
        <button onClick={() => setStatusFilter("")} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${!statusFilter ? "bg-purple-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>Alle</button>
        {STATUS_OPTIONEN.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${statusFilter === s ? "bg-purple-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{STATUS_LABEL[s]}</button>
        ))}
      </div>

      {gefiltertProjekte.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Projekte</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"><Plus size={14} />Erstes Projekt anlegen</button>
        </div>
      ) : (
        <div data-tour="tour-projekte-liste" className="space-y-3">
          {gefiltertProjekte.map((p) => {
            const projektTodos = todos.filter((t) => t.id && t.home_projekt_id === p.id);
            const erledigtCount = projektTodos.filter((t) => t.erledigt).length;
            const isExpanded = expandedId === p.id;
            const fortschritt = projektTodos.length > 0 ? Math.round((erledigtCount / projektTodos.length) * 100) : null;

            return (
              <div key={p.id} className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border overflow-hidden">
                {/* Projekt-Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main truncate">{p.name}</h3>
                      <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{p.typ}</span>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => setModal(p)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={12} /></button>
                      <button onClick={() => loesche(p.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  {p.beschreibung && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-3 line-clamp-2">{p.beschreibung}</p>}
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-pill text-xs font-medium ${STATUS_FARBEN[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    <div className="flex items-center gap-3 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      {p.budget && <span>Budget: {Number(p.budget).toFixed(0)} €</span>}
                      {p.zieldatum && <span>Ziel: {p.zieldatum}</span>}
                    </div>
                  </div>

                  {/* Fortschrittsbalken */}
                  {fortschritt !== null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
                        <span>{erledigtCount}/{projektTodos.length} Aufgaben erledigt</span>
                        <span>{fortschritt}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-light-border dark:bg-dark-border overflow-hidden">
                        <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${fortschritt}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Todo-Toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Aufgaben ({projektTodos.length})
                  </button>
                </div>

                {/* Aufgaben-Sektion (ausgeklappt) */}
                {isExpanded && (
                  <div className="border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
                    <div className="space-y-1 mb-3">
                      {projektTodos.length === 0 && (
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Noch keine Aufgaben in diesem Projekt.</p>
                      )}
                      {projektTodos.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 group">
                          <button onClick={() => toggleTodo(t.id, t.erledigt)} className="flex-shrink-0 text-light-text-secondary dark:text-dark-text-secondary hover:text-purple-500">
                            {t.erledigt ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}
                          </button>
                          <span className={`text-xs flex-1 ${t.erledigt ? "line-through text-light-text-secondary dark:text-dark-text-secondary" : "text-light-text-main dark:text-dark-text-main"}`}>{t.beschreibung}</span>
                          <button onClick={() => todoLoeschen(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 transition-opacity"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                    {/* Neue Aufgabe */}
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={neuerTodoText}
                        onChange={(e) => setNeuerTodoText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && todoHinzufuegen(p.id)}
                        placeholder="Neue Aufgabe..."
                        className="flex-1 px-2 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-purple-500"
                      />
                      <button onClick={() => todoHinzufuegen(p.id)} className="px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-card-sm">
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="projekte"
          onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              await supabase.from("home_projekte").insert({
                user_id: session.user.id,
                name: item.name || "Neues Projekt",
                typ: item.typ || "Sonstiges",
                beschreibung: item.beschreibung || null,
                budget: item.budget || null,
                startdatum: item.startdatum || null,
                zieldatum: item.zieldatum || null,
                status: "geplant",
              });
            }
            ladeDaten();
          }}
        />
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.projekte}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {/* Saison-Template-Modal */}
      {saisonModal && (
        <SaisonWahlModal onWaehle={waehleSaison} onAbbrechen={() => setSaisonModal(false)} />
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {modal.id ? "Projekt bearbeiten" : modal._saisonAufgaben ? `Saison-Projekt: ${modal.name}` : "Neues Projekt"}
              </h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            {modal._saisonAufgaben && (
              <div className="px-4 pt-3 pb-0">
                <div className="p-3 rounded-card-sm bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600 dark:text-orange-400">
                  ✦ Template enthält {modal._saisonAufgaben.length} vorgefertigte Aufgaben, die beim Speichern angelegt werden.
                </div>
              </div>
            )}
            <div className="p-4">
              <ProjektForm initial={modal} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeProjekte;
