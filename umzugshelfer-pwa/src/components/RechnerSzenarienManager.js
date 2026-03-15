import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Save, Trash2, PlusCircle, XCircle } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const RECHNER_TYPEN = ["Wandfarbe", "Bodenbelag", "Tapete", "Dämmstoff", "Kisten", "Volumen", "Sonstiges"];

const RechnerSzenarienManager = ({ session }) => {
  const userId = session?.user?.id;
  useTheme();
  const [szenarien, setSzenarien] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rechnerTyp, setRechnerTyp] = useState("Wandfarbe");
  const [ergebnis, setErgebnis] = useState("");
  const [notizen, setNotizen] = useState("");

  const fetchSzenarien = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from("rechner_szenarien")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setSzenarien(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchSzenarien();
  }, [fetchSzenarien]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!userId || !name) return;
    const { error } = await supabase.from("rechner_szenarien").insert([{
      user_id: userId,
      name,
      rechner_typ: rechnerTyp,
      ergebnis: ergebnis || null,
      notizen: notizen || null,
    }]);
    if (error) { alert(`Fehler: ${error.message}`); return; }
    setName("");
    setRechnerTyp("Wandfarbe");
    setErgebnis("");
    setNotizen("");
    setShowForm(false);
    fetchSzenarien();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Szenario löschen?")) return;
    await supabase.from("rechner_szenarien").delete().match({ id, user_id: userId });
    setSzenarien(szenarien.filter((s) => s.id !== id));
  };

  const cardBase = "p-3 rounded-lg border bg-light-card-bg dark:bg-dark-card-bg border-light-border dark:border-dark-border";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          Speichere Berechnungsergebnisse als Szenarien, um verschiedene Varianten zu vergleichen.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={!userId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <PlusCircle size={16} />
          Szenario speichern
        </button>
      </div>

      {showForm && (
        <div className={cardBase}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
              Neues Szenario
            </h3>
            <button onClick={() => setShowForm(false)}>
              <XCircle size={18} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="z.B. Wohnzimmer – Variante 1"
                  className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-md text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-1 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                  Rechner-Typ
                </label>
                <select
                  value={rechnerTyp}
                  onChange={(e) => setRechnerTyp(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-md text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-1 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
                >
                  {RECHNER_TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                Ergebnis / Menge
              </label>
              <input
                type="text"
                value={ergebnis}
                onChange={(e) => setErgebnis(e.target.value)}
                placeholder="z.B. 12,5 Liter Farbe"
                className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-md text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-1 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5">
                Notizen
              </label>
              <textarea
                value={notizen}
                onChange={(e) => setNotizen(e.target.value)}
                rows={2}
                placeholder="Eingabewerte, Annahmen, Bemerkungen..."
                className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-md text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-1 focus:ring-light-accent-green dark:focus:ring-dark-accent-green resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm border border-light-border dark:border-dark-border rounded-md text-light-text-secondary dark:text-dark-text-secondary hover:opacity-80"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg rounded-md text-sm font-medium hover:opacity-90"
              >
                <Save size={14} />
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Lade Szenarien...</p>
      ) : szenarien.length === 0 ? (
        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary text-sm italic">
          Noch keine Szenarien gespeichert.
        </div>
      ) : (
        <div className="space-y-2">
          {szenarien.map((s) => (
            <div key={s.id} className={`${cardBase} flex items-start justify-between gap-3`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-light-accent-purple/10 dark:bg-dark-accent-purple/20 text-light-accent-purple dark:text-dark-accent-purple font-medium">
                    {s.rechner_typ}
                  </span>
                  <h4 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main truncate">
                    {s.name}
                  </h4>
                </div>
                {s.ergebnis && (
                  <p className="text-sm font-medium text-light-accent-green dark:text-dark-accent-green">{s.ergebnis}</p>
                )}
                {s.notizen && (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 whitespace-pre-line">
                    {s.notizen}
                  </p>
                )}
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 opacity-60">
                  {new Date(s.created_at).toLocaleDateString("de-DE")}
                </p>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color flex-shrink-0 mt-0.5"
                title="Szenario löschen"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RechnerSzenarienManager;
