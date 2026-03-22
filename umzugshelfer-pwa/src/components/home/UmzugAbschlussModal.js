import React, { useState } from "react";
import { CheckCircle, ArrowRight, X, Loader2, Home, Package, CheckSquare, DollarSign } from "lucide-react";
import { supabase } from "../../supabaseClient";

const SCHRITTE = ["Zusammenfassung", "Optionen", "Vorschau", "Migration", "Fertig"];

const UmzugAbschlussModal = ({ session, onAbschluss, onSchliessen }) => {
  const userId = session?.user?.id;
  const [schritt, setSchritt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [stats, setStats] = useState(null);
  const [fortschritt, setFortschritt] = useState(0);

  const [optionen, setOptionen] = useState({
    kistenMigrieren: true,
    gegenstaendeMigrieren: true,
    todosMigrieren: true,
    budgetMigrieren: true,
  });

  // Schritt 0: Zusammenfassung laden
  const ladeZusammenfassung = async () => {
    setLoading(true);
    try {
      const [kistenRes, gegenstaendeRes, todosRes, budgetRes] = await Promise.all([
        supabase.from("pack_kisten").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("pack_gegenstaende").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("todo_aufgaben").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("budget_posten").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      setStats({
        kisten: kistenRes.count || 0,
        gegenstaende: gegenstaendeRes.count || 0,
        todos: todosRes.count || 0,
        budget: budgetRes.count || 0,
      });
      setSchritt(1);
    } catch (e) {
      setFehler("Fehler beim Laden der Daten.");
    } finally {
      setLoading(false);
    }
  };

  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  // Migrations-Ausführung
  const fuehreMigrationAus = async () => {
    setLoading(true);
    setFehler(null);
    setFortschritt(0);

    try {
      let ortId = null;

      if (optionen.kistenMigrieren) {
        // Basis-Ort anlegen
        const { data: ort, error: ortErr } = await supabase
          .from("home_orte")
          .insert({ user_id: userId, name: "Meine Wohnung", typ: "Wohnung" })
          .select()
          .single();

        if (ortErr) throw ortErr;
        ortId = ort.id;
        setFortschritt(20);

        // Kisten als Lagerorte
        const { data: kisten, error: kistenErr } = await supabase
          .from("pack_kisten")
          .select("id, name, raum_neu, foto_pfad, notizen")
          .eq("user_id", userId);

        if (kistenErr) throw kistenErr;

        if (kisten && kisten.length > 0) {
          const chunks = chunkArray(kisten, 50);
          for (const chunk of chunks) {
            const { error: lagerErr } = await supabase.from("home_lagerorte").insert(
              chunk.map((k) => ({
                user_id: userId,
                ort_id: ortId,
                name: k.name,
                typ: "Kiste",
                beschreibung: k.raum_neu ? `Zielraum: ${k.raum_neu}` : null,
                foto_pfad: k.foto_pfad,
                migriert_von_kiste_id: k.id,
              }))
            );
            if (lagerErr) throw lagerErr;
          }
        }
        setFortschritt(45);
      }

      if (optionen.gegenstaendeMigrieren && ortId) {
        // Lagerorte mit Migration-Links abrufen
        const { data: lagerorte } = await supabase
          .from("home_lagerorte")
          .select("id, migriert_von_kiste_id")
          .eq("user_id", userId)
          .not("migriert_von_kiste_id", "is", null);

        const kistenMap = {};
        (lagerorte || []).forEach((l) => {
          kistenMap[l.migriert_von_kiste_id] = l.id;
        });

        const { data: gegenstaende, error: gErr } = await supabase
          .from("pack_gegenstaende")
          .select("id, kiste_id, beschreibung, menge, kategorie")
          .eq("user_id", userId);

        if (gErr) throw gErr;

        if (gegenstaende && gegenstaende.length > 0) {
          const chunks = chunkArray(gegenstaende, 50);
          for (const chunk of chunks) {
            const { error: objErr } = await supabase.from("home_objekte").insert(
              chunk.map((g) => ({
                user_id: userId,
                lagerort_id: kistenMap[g.kiste_id] || null,
                ort_id: ortId,
                name: g.beschreibung,
                menge: g.menge,
                kategorie: g.kategorie,
                status: "eingelagert",
                migriert_von_gegenstand_id: g.id,
              }))
            );
            if (objErr) throw objErr;
          }
        }
        setFortschritt(70);
      }

      if (optionen.todosMigrieren) {
        const { error: todoErr } = await supabase
          .from("todo_aufgaben")
          .update({ app_modus: "beides" })
          .eq("user_id", userId);
        if (todoErr) throw todoErr;
        setFortschritt(85);
      }

      if (optionen.budgetMigrieren) {
        const { error: budErr } = await supabase
          .from("budget_posten")
          .update({ app_modus: "beides" })
          .eq("user_id", userId);
        if (budErr) throw budErr;
      }

      setFortschritt(100);
      setSchritt(4);
    } catch (e) {
      setFehler(`Fehler bei der Migration: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe">
      <div className="bg-light-card dark:bg-dark-card rounded-2xl shadow-2xl max-w-lg w-full border border-light-border dark:border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-dark-border">
          <div>
            <h2 className="text-lg font-bold text-light-text-main dark:text-dark-text-main">
              Umzug abschließen
            </h2>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
              Schritt {schritt + 1} von {SCHRITTE.length}: {SCHRITTE[schritt]}
            </p>
          </div>
          <button
            onClick={onSchliessen}
            className="p-1.5 rounded-lg hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Inhalt */}
        <div className="p-6">
          {/* Schritt 0: Willkommen */}
          {schritt === 0 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                Glückwunsch zum erfolgreichen Umzug!
              </h3>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
                Du kannst deine bestehenden Daten (Kisten, Gegenstände, Todos, Budget) in den
                Home Organizer übernehmen — ohne etwas zu verlieren.
              </p>
              <button
                onClick={ladeZusammenfassung}
                disabled={loading}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Weiter
              </button>
            </div>
          )}

          {/* Schritt 1: Optionen */}
          {schritt === 1 && stats && (
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                Wähle aus, was übernommen werden soll:
              </p>
              <div className="space-y-3">
                {[
                  { key: "kistenMigrieren", icon: Package, label: `${stats.kisten} Kisten als Lagerorte`, desc: "Kisten werden zu Lagerorten im Inventar" },
                  { key: "gegenstaendeMigrieren", icon: Package, label: `${stats.gegenstaende} Gegenstände als Inventar`, desc: "Inhalte werden zu Inventar-Objekten" },
                  { key: "todosMigrieren", icon: CheckSquare, label: `${stats.todos} Aufgaben übernehmen`, desc: "In beiden Modi sichtbar" },
                  { key: "budgetMigrieren", icon: DollarSign, label: `${stats.budget} Budget-Einträge übernehmen`, desc: "In beiden Modi sichtbar" },
                ].map(({ key, icon: Icon, label, desc }) => (
                  <label key={key} className="flex items-start gap-3 p-3 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optionen[key]}
                      onChange={(e) => setOptionen((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="mt-0.5 accent-green-500"
                    />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-light-text-main dark:text-dark-text-main">
                        <Icon size={14} />
                        {label}
                      </div>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setSchritt(2)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                >
                  <ArrowRight size={16} />
                  Vorschau
                </button>
              </div>
            </div>
          )}

          {/* Schritt 2: Vorschau */}
          {schritt === 2 && stats && (
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                Folgendes wird beim Start der Migration erstellt:
              </p>
              <div className="space-y-2 mb-5">
                {optionen.kistenMigrieren && (
                  <div className="flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main p-2 rounded-lg bg-light-hover dark:bg-dark-hover">
                    <ArrowRight size={14} className="text-green-500 flex-shrink-0" />
                    Neuer Ort „Meine Wohnung" + {stats.kisten} Lagerorte aus Kisten
                  </div>
                )}
                {optionen.gegenstaendeMigrieren && (
                  <div className="flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main p-2 rounded-lg bg-light-hover dark:bg-dark-hover">
                    <ArrowRight size={14} className="text-green-500 flex-shrink-0" />
                    {stats.gegenstaende} Inventar-Objekte (Status: eingelagert)
                  </div>
                )}
                {optionen.todosMigrieren && (
                  <div className="flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main p-2 rounded-lg bg-light-hover dark:bg-dark-hover">
                    <ArrowRight size={14} className="text-green-500 flex-shrink-0" />
                    {stats.todos} Todos in beiden Modi sichtbar
                  </div>
                )}
                {optionen.budgetMigrieren && (
                  <div className="flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main p-2 rounded-lg bg-light-hover dark:bg-dark-hover">
                    <ArrowRight size={14} className="text-green-500 flex-shrink-0" />
                    {stats.budget} Budget-Einträge in beiden Modi sichtbar
                  </div>
                )}
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-4">
                Deine Umzugsdaten bleiben vollständig erhalten — die Migration ist nicht-destruktiv.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSchritt(1)}
                  className="flex-1 px-4 py-2.5 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={() => { setSchritt(3); fuehreMigrationAus(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                >
                  Migration starten
                </button>
              </div>
            </div>
          )}

          {/* Schritt 3: Migration läuft */}
          {schritt === 3 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                Migration läuft...
              </h3>
              <div className="w-full bg-light-border dark:bg-dark-border rounded-full h-2 mb-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${fortschritt}%` }}
                />
              </div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{fortschritt}%</p>
              {fehler && (
                <p className="text-red-500 text-sm mt-3">{fehler}</p>
              )}
            </div>
          )}

          {/* Schritt 4: Fertig */}
          {schritt === 4 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Home size={32} className="text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                Migration abgeschlossen!
              </h3>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
                Deine Daten wurden erfolgreich in den Home Organizer übernommen. Willkommen zuhause!
              </p>
              <button
                onClick={onAbschluss}
                className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
              >
                <Home size={16} />
                Zum Home Organizer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UmzugAbschlussModal;
