import React, { useState, useEffect, useCallback } from "react";
import { Users, Plus, Trash2, Edit2, X, Check, Loader2, AlertCircle, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";

const FARBEN = [
  "#10B981",
  "#06B6D4",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#3B82F6",
  "#6B7280",
];

const EMOJIS = ["👤", "👨", "👩", "👦", "👧", "🧑", "👴", "👵", "🐱", "🐶"];
const LEER_FORM = { name: "", farbe: "#10B981", emoji: "👤" };

const HomeBewohner = ({ session }) => {
  const userId = session?.user?.id;
  const toast = useToast();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("bewohner");

  const [loading, setLoading] = useState(true);
  const [bewohner, setBewohner] = useState([]);
  const [stats, setStats] = useState({});
  const [fehler, setFehler] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(LEER_FORM);
  const [saving, setSaving] = useState(false);

  const mapBewohner = useCallback((row) => ({
    id: row.id,
    name: row.display_name || row.name || "Bewohner",
    farbe: row.farbe || "#10B981",
    emoji: row.emoji || "👤",
    linked_user_id: row.linked_user_id || null,
    is_household_member: row.is_household_member === true,
    is_admin: row.is_admin === true,
    is_current_user: row.is_current_user === true,
    email: row.email || "",
  }), []);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);
    try {
      const { data, error } = await supabase.rpc("get_bewohner_overview");
      if (error) throw error;

      const liste = Array.isArray(data) ? data.map(mapBewohner) : [];
      setBewohner(liste);

      if (liste.length > 0) {
        const ids = liste.map((b) => b.id);
        const [aufgabenRes, budgetRes] = await Promise.all([
          supabase.from("todo_aufgaben").select("bewohner_id").in("bewohner_id", ids).eq("erledigt", false),
          supabase.from("budget_posten").select("bewohner_id, betrag").in("bewohner_id", ids),
        ]);

        const aufgabenMap = {};
        const budgetMap = {};
        (aufgabenRes.data || []).forEach((a) => {
          aufgabenMap[a.bewohner_id] = (aufgabenMap[a.bewohner_id] || 0) + 1;
        });
        (budgetRes.data || []).forEach((b) => {
          budgetMap[b.bewohner_id] = (budgetMap[b.bewohner_id] || 0) + Math.abs(Number(b.betrag));
        });

        const merged = {};
        ids.forEach((id) => {
          merged[id] = { aufgaben: aufgabenMap[id] || 0, budget: budgetMap[id] || 0 };
        });
        setStats(merged);
      } else {
        setStats({});
      }
    } catch (_e) {
      setBewohner([]);
      setStats({});
      setFehler("Bewohneruebersicht nicht verfuegbar - Migration ausfuehren.");
    } finally {
      setLoading(false);
    }
  }, [userId, mapBewohner]);

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten]);

  const oeffneNeu = () => {
    setForm(LEER_FORM);
    setModal({});
  };

  const oeffneEdit = (b) => {
    if (b.linked_user_id) {
      toast.info("Haushaltsmitglieder werden im Haushaltsbereich verwaltet.");
      return;
    }
    setForm({ name: b.name, farbe: b.farbe, emoji: b.emoji });
    setModal(b);
  };

  const speichern = async () => {
    if (!form.name.trim()) return;
    if (modal?.linked_user_id) {
      toast.info("Haushaltsmitglieder koennen hier nicht bearbeitet werden.");
      return;
    }

    setSaving(true);
    try {
      if (modal.id) {
        const { error } = await supabase
          .from("home_bewohner")
          .update({ name: form.name.trim(), farbe: form.farbe, emoji: form.emoji })
          .eq("id", modal.id);
        if (error) throw error;
        toast.success(`${form.name.trim()} aktualisiert.`);
      } else {
        const { error } = await supabase
          .from("home_bewohner")
          .insert({ user_id: userId, name: form.name.trim(), farbe: form.farbe, emoji: form.emoji });
        if (error) throw error;
        toast.success(`${form.name.trim()} hinzugefuegt.`);
      }
      setModal(null);
      ladeDaten();
    } catch (e) {
      toast.error(`Fehler: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const loesche = async (b) => {
    if (b.linked_user_id) {
      toast.info("Haushaltsmitglieder koennen hier nicht geloescht werden.");
      return;
    }

    if (!window.confirm(`"${b.name}" wirklich loeschen? Bestehende Zuordnungen bleiben erhalten.`)) return;

    const { error } = await supabase.from("home_bewohner").delete().eq("id", b.id);
    if (error) {
      toast.error(`Fehler: ${error.message}`);
      return;
    }
    toast.info(`${b.name} entfernt.`);
    ladeDaten();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={22} className="text-teal-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Bewohner</h1>
          {bewohner.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-teal-500 text-white text-xs font-bold">{bewohner.length}</span>
          )}
        </div>
        <button
          data-tour="tour-bewohner-hinzufuegen"
          onClick={oeffneNeu}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium"
        >
          <Plus size={14} />Bewohner hinzufuegen
        </button>
      </div>

      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      {bewohner.length === 0 ? (
        <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <Users size={44} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium mb-1">Noch keine Bewohner</p>
          <p className="text-xs mb-4">Fuege zusaetzliche Bewohner hinzu (z. B. Kinder oder Haustiere).</p>
          <button
            onClick={oeffneNeu}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
          >
            <Plus size={14} />Ersten Bewohner hinzufuegen
          </button>
        </div>
      ) : (
        <div data-tour="tour-bewohner-liste" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {bewohner.map((b) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 bg-light-card dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border p-4 group"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor: b.farbe + "22", border: `2px solid ${b.farbe}` }}
                >
                  {b.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-light-text-main dark:text-dark-text-main">
                      {b.name}
                      {b.is_current_user ? " (Du)" : ""}
                    </p>
                    {b.is_household_member && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-primary-500/10 text-primary-500 border border-primary-500/30">
                        Haushalt
                      </span>
                    )}
                    {b.is_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-secondary-500/15 text-secondary-500 border border-secondary-500/30">
                        <Crown size={10} />
                        Admin
                      </span>
                    )}
                  </div>

                  {b.email && (
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                      {b.email}
                    </p>
                  )}

                  {stats[b.id] && (
                    <div className="flex items-center gap-3 mt-0.5">
                      {stats[b.id].aufgaben > 0 && (
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          {stats[b.id].aufgaben} offene Aufgabe{stats[b.id].aufgaben !== 1 ? "n" : ""}
                        </span>
                      )}
                      {stats[b.id].budget > 0 && (
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          {stats[b.id].budget.toFixed(2).replace(".", ",")} EUR zugeordnet
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {!b.linked_user_id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => oeffneEdit(b)}
                      className="p-1.5 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => loesche(b)}
                      className="p-1.5 rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {bewohner.length > 0 && (
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center pt-2">
          Haushaltsmitglieder sind automatisch enthalten. Zusatzbewohner koennen frei verwaltet werden.
        </p>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.bewohner}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      <AnimatePresence>
        {modal !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-sm w-full border border-light-border dark:border-dark-border"
            >
              <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                  {modal.id ? "Bewohner bearbeiten" : "Bewohner hinzufuegen"}
                </h3>
                <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex justify-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                    style={{ backgroundColor: form.farbe + "22", border: `3px solid ${form.farbe}` }}
                  >
                    {form.emoji}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && speichern()}
                    placeholder="z.B. Anna"
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">Emoji</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setForm((p) => ({ ...p, emoji: e }))}
                        className={`w-9 h-9 rounded-card-sm text-lg flex items-center justify-center transition-colors
                          ${form.emoji === e ? "bg-primary-500/20 border-2 border-primary-500" : "bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-canvas-3"}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">Farbe</label>
                  <div className="flex gap-2 flex-wrap">
                    {FARBEN.map((f) => (
                      <button
                        key={f}
                        onClick={() => setForm((p) => ({ ...p, farbe: f }))}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{ backgroundColor: f }}
                        title={f}
                      >
                        {form.farbe === f && <Check size={14} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={speichern}
                    disabled={!form.name.trim() || saving}
                    className="flex-1 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
                  >
                    {saving ? "Speichern..." : modal.id ? "Aktualisieren" : "Hinzufuegen"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HomeBewohner;
