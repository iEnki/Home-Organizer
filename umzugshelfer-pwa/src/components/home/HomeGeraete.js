import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, X, FileText, Link2, Loader2, AlertCircle, Sparkles, Plus } from "lucide-react";
import { supabase } from "../../supabaseClient";
import DokumentVorschauModal from "./DokumentVorschauModal";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import GeraetForm from "./geraete/GeraetForm";
import GeraetFilterBar from "./geraete/GeraetFilterBar";
import GeraetZeile from "./geraete/GeraetZeile";
import {
  heuteIso,
  berechneGeraetStatus,
  sortierFrist,
  STATUS_PRIORITAET,
  STATUS_CONFIG,
} from "../../utils/geraetStatus";

const DEFAULT_FORM = {
  name: "",
  hersteller: "",
  modell: "",
  seriennummer: "",
  kaufdatum: "",
  kaufpreis: "",
  gewaehrleistung_bis: "",
  garantie_bis: "",
  naechste_wartung: "",
  wartungsintervall_monate: "",
  notizen: "",
  kategorie: "",
};

const mapGeraetToForm = (g) => ({
  id:                       g.id,
  name:                     g.name || "",
  hersteller:               g.hersteller || "",
  modell:                   g.modell || "",
  seriennummer:             g.seriennummer || "",
  kaufdatum:                g.kaufdatum || "",
  kaufpreis:                g.kaufpreis ?? "",
  gewaehrleistung_bis:      g.gewaehrleistung_bis || "",
  garantie_bis:             g.garantie_bis || "",
  naechste_wartung:         g.naechste_wartung || "",
  wartungsintervall_monate: g.wartungsintervall_monate ?? "",
  notizen:                  g.notizen || "",
  kategorie:                g.kategorie || "",
});

const str2null = (v) => (v === "" || v == null ? null : v);

const HomeGeraete = ({ session }) => {
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("geraete");

  // --- Daten-State ---
  const [loading, setLoading]         = useState(true);
  const [geraete, setGeraete]         = useState([]);
  const [wartungen, setWartungen]     = useState([]);
  const [dokumente, setDokumente]     = useState([]);
  const [fehler, setFehler]           = useState(null);

  // --- UI-State ---
  const [ausgeklappt, setAusgeklappt] = useState({});
  const [modal, setModal]             = useState(null);   // null | {} | geraetObj
  const [formData, setFormData]       = useState(DEFAULT_FORM);
  const [dokuModal, setDokuModal]     = useState(null);   // geraetId
  const [vorschauDok, setVorschauDok] = useState(null);  // { storage_pfad, dateiname, datei_typ }
  const [kiOffen, setKiOffen]         = useState(false);

  // --- Filter-State ---
  const [suchbegriff, setSuchbegriff]   = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [katFilter, setKatFilter]       = useState("Alle");
  const [sortierung, setSortierung]     = useState("frist");
  const [gruppierung, setGruppierung]   = useState("keine");

  // --- Modal-Helper ---
  const openCreateModal = () => { setFormData(DEFAULT_FORM); setModal({}); };
  const openEditModal   = (g) => { setFormData(mapGeraetToForm(g)); setModal(g); };
  const closeModal      = ()  => { setModal(null); setFormData(DEFAULT_FORM); };

  // --- Daten laden ---
  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);
    try {
      const [geraeteRes, wartungenRes, dokRes] = await Promise.all([
        supabase.from("home_geraete").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_wartungen").select("*").eq("user_id", userId).order("datum", { ascending: false }),
        supabase.from("dokumente").select("id, dateiname, datei_typ, storage_pfad").eq("user_id", userId).order("dateiname"),
      ]);
      setGeraete(geraeteRes.data || []);
      setWartungen(wartungenRes.data || []);
      setDokumente(dokRes.data || []);
    } catch {
      setFehler("Fehler beim Laden der Daten.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  // --- Speichern ---
  const handleSpeichern = async (daten) => {
    const cleanDaten = {
      name:                     str2null(daten.name),
      hersteller:               str2null(daten.hersteller),
      modell:                   str2null(daten.modell),
      seriennummer:             str2null(daten.seriennummer),
      kaufdatum:                str2null(daten.kaufdatum),
      gewaehrleistung_bis:      str2null(daten.gewaehrleistung_bis),
      garantie_bis:             str2null(daten.garantie_bis),
      naechste_wartung:         str2null(daten.naechste_wartung),
      notizen:                  str2null(daten.notizen),
      kategorie:                str2null(daten.kategorie),
      kaufpreis:                daten.kaufpreis === "" ? null : parseFloat(daten.kaufpreis) || null,
      wartungsintervall_monate: daten.wartungsintervall_monate === "" ? null : parseInt(daten.wartungsintervall_monate, 10) || null,
    };
    if (daten.id) {
      await supabase.from("home_geraete").update(cleanDaten).eq("id", daten.id);
    } else {
      await supabase.from("home_geraete").insert({ ...cleanDaten, user_id: userId });
    }
    closeModal();
    ladeDaten();
  };

  // --- Löschen ---
  const loesche = async (id) => {
    if (!window.confirm("Gerät und alle Wartungseinträge löschen?")) return;
    await supabase.from("home_geraete").delete().eq("id", id);
    ladeDaten();
  };

  // --- Wartung erledigt ---
  const wartungErledigt = async (geraetId) => {
    const g = geraete.find((x) => x.id === geraetId);
    if (!g) return;
    const neuesDatum = g.wartungsintervall_monate
      ? new Date(Date.now() + g.wartungsintervall_monate * 30 * 86400000).toISOString().split("T")[0]
      : null;
    await supabase.from("home_wartungen").insert({
      user_id: userId,
      geraet_id: geraetId,
      datum: new Date().toISOString().split("T")[0],
      typ: "Wartung",
      beschreibung: "Reguläre Wartung erledigt",
    });
    if (neuesDatum) {
      await supabase.from("home_geraete").update({ naechste_wartung: neuesDatum }).eq("id", geraetId);
    }
    ladeDaten();
  };

  // --- Dokument verknüpfen/lösen ---
  const toggleDokumentLink = async (geraetId, dokId) => {
    const g = geraete.find((x) => x.id === geraetId);
    if (!g) return;
    const current = g.verknuepfte_dokument_ids || [];
    const updated = current.includes(dokId)
      ? current.filter((id) => id !== dokId)
      : [...current, dokId];
    await supabase.from("home_geraete").update({ verknuepfte_dokument_ids: updated }).eq("id", geraetId);
    setGeraete((prev) =>
      prev.map((x) => x.id === geraetId ? { ...x, verknuepfte_dokument_ids: updated } : x)
    );
  };

  // --- Vorberechnete Maps (useMemo) ---
  const heute = useMemo(() => heuteIso(), []);

  const statusByGeraetId = useMemo(() =>
    Object.fromEntries(geraete.map((g) => [g.id, berechneGeraetStatus(g, heute)])),
    [geraete, heute]);

  const wartungenByGeraetId = useMemo(() => {
    const map = {};
    wartungen.forEach((w) => { (map[w.geraet_id] ??= []).push(w); });
    return map;
  }, [wartungen]);

  const dokumenteById = useMemo(() =>
    Object.fromEntries(dokumente.map((d) => [d.id, d])),
    [dokumente]);

  const verknuepfteDokuByGeraetId = useMemo(() =>
    Object.fromEntries(geraete.map((g) => [
      g.id,
      (g.verknuepfte_dokument_ids || []).map((id) => dokumenteById[id]).filter(Boolean),
    ])),
    [geraete, dokumenteById]);

  // --- Filter-Basis für Zähler (ohne statusFilter) ---
  const basisFuerZaehlung = useMemo(() => {
    let result = geraete;
    if (suchbegriff) {
      const q = suchbegriff.toLowerCase();
      result = result.filter((g) =>
        [g.name, g.hersteller, g.modell].some((f) => f?.toLowerCase().includes(q)));
    }
    if (katFilter !== "Alle") result = result.filter((g) => g.kategorie === katFilter);
    return result;
  }, [geraete, suchbegriff, katFilter]);

  const statusZaehlung = useMemo(() => {
    const z = {};
    basisFuerZaehlung.forEach((g) => {
      const s = statusByGeraetId[g.id];
      z[s] = (z[s] || 0) + 1;
    });
    return z;
  }, [basisFuerZaehlung, statusByGeraetId]);

  const verfuegbareKategorien = useMemo(() =>
    [...new Set(geraete.map((g) => g.kategorie).filter(Boolean))].sort(),
    [geraete]);

  // --- Gefiltert + Sortiert ---
  const gefiltertUndSortiert = useMemo(() => {
    let result = geraete;
    if (suchbegriff) {
      const q = suchbegriff.toLowerCase();
      result = result.filter((g) =>
        [g.name, g.hersteller, g.modell].some((f) => f?.toLowerCase().includes(q)));
    }
    if (statusFilter !== "alle")
      result = result.filter((g) => statusByGeraetId[g.id] === statusFilter);
    if (katFilter !== "Alle")
      result = result.filter((g) => g.kategorie === katFilter);
    return [...result].sort((a, b) => {
      if (sortierung === "name")           return (a.name || "").localeCompare(b.name || "");
      if (sortierung === "kaufdatum_desc") return (b.kaufdatum || "").localeCompare(a.kaufdatum || "");
      if (sortierung === "erstellt_desc")  return (b.created_at || "").localeCompare(a.created_at || "");
      return sortierFrist(a, heute).localeCompare(sortierFrist(b, heute));
    });
  }, [geraete, suchbegriff, statusFilter, katFilter, sortierung, statusByGeraetId, heute]);

  // --- Gruppierung ---
  const gruppierteListe = useMemo(() => {
    if (gruppierung === "status") {
      const map = {};
      gefiltertUndSortiert.forEach((g) => {
        const s = statusByGeraetId[g.id];
        (map[s] ??= []).push(g);
      });
      return STATUS_PRIORITAET
        .filter((s) => map[s])
        .map((s) => ({ key: s, label: STATUS_CONFIG[s].label, items: map[s] }));
    }
    if (gruppierung === "kategorie") {
      const map = {};
      gefiltertUndSortiert.forEach((g) => {
        const k = g.kategorie || "Sonstiges";
        (map[k] ??= []).push(g);
      });
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, items]) => ({ key: k, label: k, items }));
    }
    return [{ key: "__alle__", label: null, items: gefiltertUndSortiert }];
  }, [gefiltertUndSortiert, gruppierung, statusByGeraetId]);

  // --- Render ---
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Geräte & Wartung</h1>
        </div>
        <button
          onClick={() => setKiOffen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30 transition-colors"
        >
          <Sparkles size={15} /><span className="hidden sm:inline">KI</span>
        </button>
      </div>

      {fehler && (
        <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      {/* FilterBar (enthält Hinzufügen-Button) */}
      <GeraetFilterBar
        suchbegriff={suchbegriff}       onSuche={setSuchbegriff}
        statusFilter={statusFilter}     onStatus={setStatusFilter}
        kategorieFilter={katFilter}     onKategorie={setKatFilter}
        sortierung={sortierung}         onSortierung={setSortierung}
        gruppierung={gruppierung}       onGruppierung={setGruppierung}
        verfuegbareKategorien={verfuegbareKategorien}
        statusZaehlung={statusZaehlung}
        anzahlGefiltert={gefiltertUndSortiert.length}
        onAdd={openCreateModal}
      />

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : geraete.length === 0 ? (
        <div data-tour="tour-geraete-liste" className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <Wrench size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Geräte erfasst</p>
          <button
            onClick={openCreateModal}
            className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
          >
            <Plus size={14} /> Erstes Gerät hinzufügen
          </button>
        </div>
      ) : gefiltertUndSortiert.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <p className="text-sm">Keine Geräte für die gewählten Filter.</p>
        </div>
      ) : (
        <div data-tour="tour-geraete-liste" className="space-y-3">
          {gruppierteListe.map((gruppe) => (
            <section key={gruppe.key}>
              {/* Gruppen-Header */}
              {gruppe.label && (
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <ChevronPlaceholder />
                  <span className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                    {gruppe.label}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    {gruppe.items.length}
                  </span>
                </div>
              )}

              <div className="bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border overflow-hidden">
                {gruppe.items.map((g) => (
                  <GeraetZeile
                    key={g.id}
                    g={g}
                    status={statusByGeraetId[g.id]}
                    heute={heute}
                    geraetWartungen={wartungenByGeraetId[g.id] || []}
                    verknuepfteDokumente={verknuepfteDokuByGeraetId[g.id] || []}
                    isOffen={!!ausgeklappt[g.id]}
                    onToggle={() => setAusgeklappt((p) => ({ ...p, [g.id]: !p[g.id] }))}
                    onBearbeiten={() => openEditModal(g)}
                    onLoeschen={() => loesche(g.id)}
                    onWartungErledigt={() => wartungErledigt(g.id)}
                    onDokuModalOpen={() => setDokuModal(g.id)}
                    onDokumentUnlink={(dokId) => toggleDokumentLink(g.id, dokId)}
                    onVorschau={(dok) => setVorschauDok(dok)}
                    onNavigate={(dokId) => navigate("/home/dokumente", { state: { focusDokumentId: dokId } })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Gerät-Formular-Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2 rounded-t-card">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {formData.id ? "Gerät bearbeiten" : "Neues Gerät"}
              </h3>
              <button onClick={closeModal} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <GeraetForm value={formData} onChange={setFormData} />
            </div>
            <div className="shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleSpeichern(formData)}
                disabled={!formData.name?.trim()}
                className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tour */}
      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.geraete}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {/* KI-Assistent */}
      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="geraete"
          onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            for (const item of items) {
              await supabase.from("home_geraete").insert({
                user_id: userId,
                name:                     item.name || "Unbenannt",
                hersteller:               item.hersteller || null,
                modell:                   item.modell || null,
                wartungsintervall_monate: item.wartungsintervall_monate || null,
                kategorie:                item.kategorie || null,
              });
            }
            ladeDaten();
          }}
        />
      )}

      {/* Dokument-Vorschau-Modal */}
      {vorschauDok && (
        <DokumentVorschauModal
          storagePfad={vorschauDok.storage_pfad}
          dateiname={vorschauDok.dateiname}
          datei_typ={vorschauDok.datei_typ}
          onSchliessen={() => setVorschauDok(null)}
        />
      )}

      {/* Dokumenten-Picker-Modal */}
      {dokuModal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-safe">
          <div className="bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-sm w-full border border-light-border dark:border-dark-border max-h-[80vh] flex flex-col">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">Dokument verknüpfen</h3>
              <button onClick={() => setDokuModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {dokumente.length === 0 ? (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-8">
                  Noch keine Dokumente vorhanden. Lade Dokumente im Dokumenten-Manager hoch.
                </p>
              ) : (
                <div className="space-y-1">
                  {dokumente.map((d) => {
                    const geraet = geraete.find((g) => g.id === dokuModal);
                    const isLinked = (geraet?.verknuepfte_dokument_ids || []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDokumentLink(dokuModal, d.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-card-sm text-sm transition-colors ${
                          isLinked
                            ? "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400"
                            : "hover:bg-light-border dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
                        }`}
                      >
                        <FileText size={14} className={isLinked ? "text-blue-500" : "text-light-text-secondary dark:text-dark-text-secondary"} />
                        <span className="flex-1 text-left truncate">{d.dateiname}</span>
                        {isLinked && <Link2 size={12} className="text-blue-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="shrink-0 p-3 border-t border-light-border dark:border-dark-border">
              <button
                onClick={() => setDokuModal(null)}
                className="w-full px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Platzhalter für optische Ausrichtung des Gruppen-Headers (kein Collapse-Toggle)
function ChevronPlaceholder() {
  return <div className="w-3.5 h-3.5 flex-shrink-0" />;
}

export default HomeGeraete;
