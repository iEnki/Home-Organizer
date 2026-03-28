import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Search,
  Tag,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { logVerlauf } from "../../utils/homeVerlauf";
import { deleteInvoiceCascade } from "../../utils/invoiceCascadeDelete";

const KATEGORIEN = [
  "Rechnungen & Belege",
  "Farben & Oberflaechen",
  "Masse & Abmessungen",
  "Geraete-Info",
  "Kontakte & Dienste",
  "Anleitungen",
  "Rezepte",
  "Notizen",
  "Sonstiges",
];

const WissenForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const [form, setForm] = useState({
    titel: initial?.titel || "",
    inhalt: initial?.inhalt || "",
    kategorie: initial?.kategorie || "Notizen",
    tags: initial?.tags?.join(", ") || "",
  });

  const handleSpeichern = () => {
    if (!form.titel.trim()) return;
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSpeichern({ ...form, tags });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Titel*</label>
        <input
          value={form.titel}
          onChange={(e) => setForm((p) => ({ ...p, titel: e.target.value }))}
          placeholder="z.B. Wandfarbe Wohnzimmer"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
        <select
          value={form.kategorie}
          onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))}
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
        >
          {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Inhalt</label>
        <textarea
          value={form.inhalt}
          onChange={(e) => setForm((p) => ({ ...p, inhalt: e.target.value }))}
          rows={5}
          placeholder="Alle relevanten Informationen, Masse, Codes, Notizen..."
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Tags (kommagetrennt)</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
          placeholder="z.B. wohnzimmer, farbe, RAL"
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAbbrechen}
          className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSpeichern}
          disabled={!form.titel.trim()}
          className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-pill disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
};

const isInvoiceEntry = (entry) => {
  const kategorie = (entry?.kategorie || "").trim().toLowerCase();
  const tags = (entry?.tags || []).map((tag) => String(tag).trim().toLowerCase());
  return kategorie === "rechnungen & belege" || Boolean(entry?.rechnung_id) || tags.includes("rechnung");
};

const formatEuro = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} EUR`;
};

const HomeWissen = ({ session }) => {
  const navigate = useNavigate();
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [kategFilter, setKategFilter] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [positionenByEintrag, setPositionenByEintrag] = useState({});
  const [positionenLoading, setPositionenLoading] = useState({});

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

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten]);

  const holeRechnungId = useCallback(async (eintrag) => {
    if (eintrag?.rechnung_id) return eintrag.rechnung_id;
    if (!eintrag?.dokument_id) return null;

    const { data, error } = await supabase
      .from("rechnungen")
      .select("id")
      .eq("dokument_id", eintrag.dokument_id)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data?.id || null;
  }, []);

  const ladeRechnungsPositionen = useCallback(async (eintrag) => {
    if (!eintrag || !isInvoiceEntry(eintrag)) return;
    if (positionenByEintrag[eintrag.id]) return;

    setPositionenLoading((prev) => ({ ...prev, [eintrag.id]: true }));
    try {
      const rechnungId = await holeRechnungId(eintrag);
      if (!rechnungId) {
        setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: [] }));
        return;
      }

      const { data, error } = await supabase
        .from("rechnungs_positionen")
        .select("id, pos_nr, beschreibung, menge, einheit, einzelpreis, gesamtpreis")
        .eq("rechnung_id", rechnungId)
        .order("pos_nr", { ascending: true });

      if (error) throw error;
      setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: data || [] }));
    } catch {
      setPositionenByEintrag((prev) => ({ ...prev, [eintrag.id]: [] }));
    } finally {
      setPositionenLoading((prev) => ({ ...prev, [eintrag.id]: false }));
    }
  }, [holeRechnungId, positionenByEintrag]);

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

  const loesche = async (eintrag) => {
    if (!eintrag) return;
    if (!window.confirm(`\"${eintrag.titel}\" loeschen?`)) return;

    try {
      if (eintrag.dokument_id && isInvoiceEntry(eintrag)) {
        await deleteInvoiceCascade({
          supabase,
          dokumentId: eintrag.dokument_id,
        });
      } else {
        const { error } = await supabase.from("home_wissen").delete().eq("id", eintrag.id);
        if (error) throw error;
      }

      await logVerlauf(supabase, userId, "home_wissen", eintrag.titel, "geloescht");
      if (detailId === eintrag.id) setDetailId(null);
      ladeDaten();
    } catch (err) {
      setFehler(`Loeschen fehlgeschlagen: ${err.message}`);
    }
  };

  const toggleDetails = async (eintrag) => {
    const nextId = detailId === eintrag.id ? null : eintrag.id;
    setDetailId(nextId);
    if (nextId && isInvoiceEntry(eintrag)) {
      await ladeRechnungsPositionen(eintrag);
    }
  };

  const oeffneDokumentarchiv = (dokumentId) => {
    if (!dokumentId) return;
    navigate("/home/dokumente", { state: { focusDokumentId: dokumentId } });
  };

  const gefiltertEintraege = eintraege.filter((e) => {
    const matchKateg = !kategFilter || e.kategorie === kategFilter;
    const q = suchbegriff.toLowerCase();
    const matchSuche =
      !q ||
      e.titel.toLowerCase().includes(q) ||
      e.inhalt?.toLowerCase().includes(q) ||
      (e.tags || []).some((t) => t.toLowerCase().includes(q));
    return matchKateg && matchSuche;
  });

  const detailEintrag = eintraege.find((e) => e.id === detailId);

  const renderDetailInhalt = (eintrag, compact = false) => {
    if (!eintrag) return null;

    if (isInvoiceEntry(eintrag)) {
      const loadingPos = positionenLoading[eintrag.id];
      const positionen = positionenByEintrag[eintrag.id] || [];

      if (loadingPos) {
        return (
          <div className="flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            <Loader2 size={12} className="animate-spin" /> Positionen werden geladen...
          </div>
        );
      }

      if (positionen.length > 0) {
        return (
          <div className="space-y-2">
            {positionen.map((pos) => (
              <div key={pos.id} className="p-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main break-words">
                      {pos.pos_nr ? `${pos.pos_nr}. ` : ""}{pos.beschreibung || "Position"}
                    </p>
                    <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Menge: {pos.menge ?? "-"} {pos.einheit || ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-light-text-main dark:text-dark-text-main">
                      {formatEuro(pos.gesamtpreis)}
                    </p>
                    <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                      Einzel: {formatEuro(pos.einzelpreis)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      }
    }

    if (eintrag.inhalt) {
      return (
        <pre className={`${compact ? "text-xs" : "text-sm"} text-light-text-main dark:text-dark-text-main whitespace-pre-wrap font-sans`}>
          {eintrag.inhalt}
        </pre>
      );
    }

    return (
      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Keine Details verfuegbar.</p>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-amber-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Wissensdatenbank</h1>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm font-medium"
        >
          <Plus size={14} />Eintrag
        </button>
      </div>

      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
        <input
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          placeholder="Titel, Inhalt oder Tags durchsuchen..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setKategFilter("")}
          className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${
            !kategFilter
              ? "bg-amber-500 text-white"
              : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
          }`}
        >
          Alle
        </button>
        {KATEGORIEN.map((k) => (
          <button
            key={k}
            onClick={() => setKategFilter(k)}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${
              kategFilter === k
                ? "bg-amber-500 text-white"
                : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {gefiltertEintraege.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{suchbegriff || kategFilter ? "Keine Eintraege gefunden" : "Noch keine Eintraege"}</p>
          {!suchbegriff && !kategFilter && (
            <button
              onClick={() => setModal({})}
              className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm"
            >
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
              onClick={() => toggleDetails(e)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main line-clamp-1">{e.titel}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setModal(e); }}
                    className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); loesche(e); }}
                    className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
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

              {detailId === e.id && (
                <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border space-y-3">
                  {renderDetailInhalt(e, true)}
                  {e.dokument_id && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        oeffneDokumentarchiv(e.dokument_id);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                    >
                      <ExternalLink size={12} /> Zum Dokumentarchiv
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {detailEintrag && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)] sm:hidden">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{detailEintrag.titel}</h3>
              <button onClick={() => setDetailId(null)}>
                <X size={18} className="text-light-text-secondary dark:text-dark-text-secondary" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 space-y-3">
              <p className="text-xs text-amber-500">{detailEintrag.kategorie}</p>
              {renderDetailInhalt(detailEintrag, false)}
              {(detailEintrag.tags || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-4">
                  {detailEintrag.tags.map((t) => (
                    <span key={t} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Tag size={10} />{t}
                    </span>
                  ))}
                </div>
              )}
              {detailEintrag.dokument_id && (
                <button
                  type="button"
                  onClick={() => oeffneDokumentarchiv(detailEintrag.dokument_id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                >
                  <ExternalLink size={12} /> Zum Dokumentarchiv
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(var(--safe-area-bottom)+1rem)]">
          <div className="bg-light-card dark:bg-canvas-2 rounded-2xl shadow-2xl max-w-lg w-full border border-light-border dark:border-dark-border max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <WissenForm initial={modal.id ? modal : null} onSpeichern={speichere} onAbbrechen={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeWissen;
