import React, { useState, useEffect, useCallback } from "react";
import { History, Package, ShoppingCart, Wrench, CheckSquare, FolderOpen, BookOpen, Loader2, RefreshCw, Plus, Edit2, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";

const TABELLEN_META = {
  home_objekte:     { label: "Inventar",       icon: Package,     farbe: "text-blue-500",   bg: "bg-blue-500/10" },
  home_vorraete:    { label: "Vorräte",         icon: ShoppingCart,farbe: "text-primary-500", bg: "bg-primary-500/10" },
  home_geraete:     { label: "Geräte",          icon: Wrench,      farbe: "text-orange-500", bg: "bg-orange-500/10" },
  todo_aufgaben:    { label: "Aufgaben",         icon: CheckSquare, farbe: "text-purple-500", bg: "bg-purple-500/10" },
  home_projekte:    { label: "Projekte",         icon: FolderOpen,  farbe: "text-pink-500",   bg: "bg-pink-500/10" },
  home_wissen:      { label: "Wissen",           icon: BookOpen,    farbe: "text-amber-500",  bg: "bg-amber-500/10" },
};

const AKTIONS_META = {
  erstellt:   { label: "erstellt",  icon: Plus,    farbe: "text-green-600 dark:text-green-400" },
  geaendert:  { label: "geändert",  icon: Edit2,   farbe: "text-blue-600 dark:text-blue-400" },
  geloescht:  { label: "gelöscht",  icon: Trash2,  farbe: "text-red-600 dark:text-red-400" },
};

const gruppiereNachDatum = (eintraege) => {
  const gruppen = {};
  eintraege.forEach((e) => {
    const datum = new Date(e.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    if (!gruppen[datum]) gruppen[datum] = [];
    gruppen[datum].push(e);
  });
  return gruppen;
};

const HomeVerlauf = ({ session }) => {
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [tabelleFilter, setTabelleFilter] = useState("");

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("home_verlauf")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (tabelleFilter) query = query.eq("tabelle", tabelleFilter);
      const { data } = await query;
      setEintraege(data || []);
    } finally {
      setLoading(false);
    }
  }, [userId, tabelleFilter]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const gruppen = gruppiereNachDatum(eintraege);
  const datumKeys = Object.keys(gruppen);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={22} className="text-indigo-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Verlauf</h1>
        </div>
        <button onClick={ladeDaten} className="p-2 rounded-card-sm hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary transition-colors" title="Aktualisieren">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Filter nach Bereich */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTabelleFilter("")} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${!tabelleFilter ? "bg-indigo-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>Alle</button>
        {Object.entries(TABELLEN_META).map(([key, meta]) => (
          <button key={key} onClick={() => setTabelleFilter(key)} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${tabelleFilter === key ? "bg-indigo-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{meta.label}</button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      )}

      {!loading && eintraege.length === 0 && (
        <div className="text-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
          <History size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Aktivitäten aufgezeichnet.</p>
          <p className="text-xs mt-1 opacity-70">Änderungen an Inventar, Vorräten, Projekten usw. erscheinen hier.</p>
        </div>
      )}

      {!loading && datumKeys.map((datum) => (
        <div key={datum} className="mb-6">
          <p className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-3">{datum}</p>
          <div className="space-y-2">
            {gruppen[datum].map((e) => {
              const tabMeta = TABELLEN_META[e.tabelle] || { label: e.tabelle, icon: History, farbe: "text-gray-500", bg: "bg-gray-500/10" };
              const aktMeta = AKTIONS_META[e.aktion] || { label: e.aktion, icon: History, farbe: "text-gray-500" };
              const TabIcon = tabMeta.icon;
              const AktIcon = aktMeta.icon;
              const uhrzeit = new Date(e.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={e.id} className="flex items-center gap-3 p-3 bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border shadow-elevation-2">
                  <div className={`p-2 rounded-card-sm ${tabMeta.bg} flex-shrink-0`}>
                    <TabIcon size={14} className={tabMeta.farbe} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">
                      <span className="font-medium">{e.datensatz_name}</span>
                      <span className={`ml-2 text-xs ${aktMeta.farbe}`}>
                        <AktIcon size={10} className="inline mr-0.5" />{aktMeta.label}
                      </span>
                    </p>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{tabMeta.label}</p>
                  </div>
                  <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">{uhrzeit}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default HomeVerlauf;
