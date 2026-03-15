import React, { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, Plus, Edit2, Trash2, X, AlertTriangle,
  Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import { useToast } from "../../hooks/useToast";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

const KATEGORIEN = ["Haushalt", "Lebensmittel", "Hygiene", "Reinigung", "Technik", "Sonstiges"];
const EINHEITEN = ["Stück", "Packung", "Liter", "kg", "Dose", "Flasche", "Rolle", "Paar", "Satz"];

const VorratForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    name: initial?.name || "",
    kategorie: initial?.kategorie || "Haushalt",
    einheit: initial?.einheit || "Stück",
    bestand: initial?.bestand ?? 0,
    mindestmenge: initial?.mindestmenge ?? 1,
    ablaufdatum: initial?.ablaufdatum || "",
    notizen: initial?.notizen || "",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Artikel*</label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="z.B. Waschpulver"
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
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Einheit</label>
          <select value={form.einheit} onChange={(e) => setForm((p) => ({ ...p, einheit: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {EINHEITEN.map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Bestand</label>
          <input type="number" min="0" step="0.5" value={form.bestand} onChange={(e) => setForm((p) => ({ ...p, bestand: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Mindestmenge</label>
          <input type="number" min="0" step="0.5" value={form.mindestmenge} onChange={(e) => setForm((p) => ({ ...p, mindestmenge: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Ablaufdatum (optional)</label>
        <input type="date" value={form.ablaufdatum} onChange={(e) => setForm((p) => ({ ...p, ablaufdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">Abbrechen</button>
        <button onClick={() => form.name.trim() && onSpeichern(form)} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50" disabled={!form.name.trim()}>Speichern</button>
      </div>
    </div>
  );
};

const HomeVorraete = ({ session }) => {
  const userId = session?.user?.id;
  const toast = useToast();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("vorraete");
  const [loading, setLoading] = useState(true);
  const [vorraete, setVorraete] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [kategFilter, setKategFilter] = useState("");
  const [kiOffen, setKiOffen] = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("home_vorraete")
        .select("*")
        .eq("user_id", userId)
        .order("name");
      if (error) throw error;
      setVorraete(data || []);
    } catch (e) {
      setFehler("Fehler beim Laden der Vorräte.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.id) {
      await supabase.from("home_vorraete").update(daten).eq("id", modal.id);
    } else {
      await supabase.from("home_vorraete").insert(payload);
    }
    setModal(null);
    ladeDaten();
  };

  const loesche = async (id) => {
    if (!window.confirm("Vorrat löschen?")) return;
    await supabase.from("home_vorraete").delete().eq("id", id);
    ladeDaten();
  };

  const erstelleEinkaufslisteFuerRote = async () => {
    const rote = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge));
    if (rote.length === 0) return;
    const eintraege = rote.map((v) => ({
      user_id: userId,
      vorrat_id: v.id,
      name: v.name,
      menge: Number(v.mindestmenge) - Number(v.bestand),
      einheit: v.einheit,
      kategorie: v.kategorie,
    }));
    await supabase.from("home_einkaufliste").insert(eintraege);
    toast.success(`${rote.length} Artikel zur Einkaufsliste hinzugefügt.`);
  };

  const ampelKlasse = (v) => {
    const b = Number(v.bestand);
    const m = Number(v.mindestmenge);
    if (b < m) return "bg-red-500";
    if (b < m * 1.2) return "bg-amber-500";
    return "bg-green-500";
  };

  const heute = new Date().toISOString().split("T")[0];
  const inSiebenTagen = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const gefiltertVorraete = vorraete.filter(
    (v) => !kategFilter || v.kategorie === kategFilter
  );

  const rot = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ShoppingCart size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Vorräte</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {rot.length > 0 && (
            <button
              data-tour="tour-vorraete-einkauf"
              onClick={erstelleEinkaufslisteFuerRote}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm font-medium"
            >
              <ShoppingCart size={14} />
              {rot.length} auf Einkaufsliste
            </button>
          )}
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
            data-tour="tour-vorraete-hinzufuegen"
            onClick={() => setModal({})}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium"
          >
            <Plus size={14} />
            Neu
          </button>
        </div>
      </div>

      {fehler && (
        <div className="mb-4 p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      {/* Ampel-Übersicht */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: "Nachkaufen", count: vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge)).length, farbe: "red" },
          { label: "Knapp", count: vorraete.filter((v) => { const b = Number(v.bestand); const m = Number(v.mindestmenge); return b >= m && b < m * 1.2; }).length, farbe: "amber" },
          { label: "Ausreichend", count: vorraete.filter((v) => Number(v.bestand) >= Number(v.mindestmenge) * 1.2).length, farbe: "green" },
        ].map((s) => (
          <div key={s.label} className={`p-3 rounded-card border text-center ${s.farbe === "red" ? "bg-red-500/10 border-red-500/30" : s.farbe === "amber" ? "bg-amber-500/10 border-amber-500/30" : "bg-primary-500/10 border-primary-500/30"}`}>
            <div className={`text-2xl font-bold ${s.farbe === "red" ? "text-red-600 dark:text-red-400" : s.farbe === "amber" ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>{s.count}</div>
            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Kategorie-Filter */}
      <div data-tour="tour-vorraete-filter" className="flex gap-2 flex-wrap mb-4">
        <button onClick={() => setKategFilter("")} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${!kategFilter ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>Alle</button>
        {KATEGORIEN.map((k) => (
          <button key={k} onClick={() => setKategFilter(k)} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${kategFilter === k ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{k}</button>
        ))}
      </div>

      {/* Liste */}
      {gefiltertVorraete.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Vorräte</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm">
            <Plus size={14} />Ersten Vorrat anlegen
          </button>
        </div>
      ) : (
        <div data-tour="tour-vorraete-liste" className="space-y-2">
          {gefiltertVorraete.map((v) => {
            const beinaheAbgelaufen = v.ablaufdatum && v.ablaufdatum <= inSiebenTagen && v.ablaufdatum >= heute;
            const abgelaufen = v.ablaufdatum && v.ablaufdatum < heute;
            return (
              <div key={v.id} className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-3 flex items-center gap-3 group">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ampelKlasse(v)}`} title={`Bestand: ${v.bestand} ${v.einheit}, Mindest: ${v.mindestmenge}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main">{v.name}</h3>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary rounded-pill px-2 py-0.5 bg-light-border dark:bg-dark-border">{v.kategorie}</span>
                    {(beinaheAbgelaufen || abgelaufen) && (
                      <span className={`flex items-center gap-0.5 text-xs ${abgelaufen ? "text-red-500" : "text-amber-500"}`}>
                        <AlertTriangle size={11} />
                        {abgelaufen ? "Abgelaufen" : "Läuft bald ab"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {Number(v.bestand)} / {Number(v.mindestmenge)} {v.einheit}
                    {v.ablaufdatum && <span className="ml-2">MHD: {v.ablaufdatum}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal(v)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={13} /></button>
                  <button onClick={() => loesche(v.id)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center py-4 px-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? "Vorrat bearbeiten" : "Neuer Vorrat"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="p-4">
              <VorratForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}

      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="vorraete"
          onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              await supabase.from("home_vorraete").insert({
                user_id: session.user.id,
                name: item.name || "Unbenannt",
                kategorie: item.kategorie || null,
                bestand: item.bestand ?? item.menge ?? 1,
                mindestmenge: item.mindestmenge ?? 1,
                einheit: item.einheit || "Stück",
              });
            }
            ladeDaten();
          }}
        />
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.vorraete}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeVorraete;
