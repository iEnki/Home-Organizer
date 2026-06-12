import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Wrench, X, FileText, Link2, Loader2, AlertCircle, Sparkles, Plus, LayoutGrid, List } from "lucide-react";
import { supabase } from "../../supabaseClient";
import DokumentVorschauModal from "./DokumentVorschauModal";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import GeraetForm, { getDeviceCategoryLabel, normalizeDeviceCategory } from "./geraete/GeraetForm";
import GeraetFilterBar from "./geraete/GeraetFilterBar";
import GeraetZeile from "./geraete/GeraetZeile";
import {
  heuteIso,
  berechneGeraetStatus,
  sortierFrist,
  STATUS_PRIORITAET,
  STATUS_CONFIG,
} from "../../utils/geraetStatus";
import { applyDeviceAiItems } from "../../utils/assistantDomainAdapters";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import { DEFAULT_GERAET_FORM, buildGeraetPayload, mapGeraetToForm } from "../../utils/geraeteForm";
import { glassItemVariants, glassPageVariants, glassSurfaceClass } from "../ui/GlassSurface";

const HomeGeraete = ({ session }) => {
  const { t, i18n } = useTranslation(["home", "common"]);
  const reducedMotion = useReducedMotion();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightedGeraetId = searchParams.get("highlight");
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("geraete");

  // --- Daten-State ---
  const [loading, setLoading]         = useState(true);
  const [geraete, setGeraete]         = useState([]);
  const [wartungen, setWartungen]     = useState([]);
  const [dokumente, setDokumente]     = useState([]);
  const [orte, setOrte]               = useState([]);
  const [lagerorte, setLagerorte]     = useState([]);
  const [bewohner, setBewohner]       = useState([]);
  const [fehler, setFehler]           = useState(null);

  // --- UI-State ---
  const [ausgeklappt, setAusgeklappt] = useState({});
  const [ansicht, setAnsicht]         = useState(() => localStorage.getItem("geraete_ansicht") || "liste");
  const [modal, setModal]             = useState(null);   // null | {} | geraetObj
  const [formData, setFormData]       = useState(DEFAULT_GERAET_FORM);
  const [dokuModal, setDokuModal]     = useState(null);   // geraetId
  const [vorschauDok, setVorschauDok] = useState(null);  // { storage_pfad, dateiname, datei_typ }
  const [kiOffen, setKiOffen]         = useState(false);

  // --- Filter-State ---
  const [suchbegriff, setSuchbegriff]   = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [katFilter, setKatFilter]       = useState("Alle");
  const [sortierung, setSortierung]     = useState("frist");
  const [gruppierung, setGruppierung]   = useState("keine");

  const toggleGeraet = useCallback(
    (id) => setAusgeklappt((prev) => (!!prev[id] ? {} : { [id]: true })), []
  );

  const toggleAnsicht = useCallback((neu) => {
    setAnsicht(neu);
    localStorage.setItem("geraete_ansicht", neu);
  }, []);

  // --- Modal-Helper ---
  const openCreateModal = () => { setFormData(DEFAULT_GERAET_FORM); setModal({}); };
  const openEditModal   = (g) => { setFormData(mapGeraetToForm(g)); setModal(g); };
  const closeModal      = ()  => { setModal(null); setFormData(DEFAULT_GERAET_FORM); };

  // --- Daten laden ---
  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);
    try {
      const [geraeteRes, wartungenRes, dokRes, orteRes, lagerorteRes] = await Promise.all([
        supabase.from("home_geraete").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_wartungen").select("*").eq("user_id", userId).order("datum", { ascending: false }),
        supabase.from("dokumente").select("id, dateiname, datei_typ, storage_pfad").eq("user_id", userId).in("app_modus", ["home", "beides"]).order("dateiname"),
        supabase.from("home_orte").select("*").eq("user_id", userId).order("name"),
        supabase.from("home_lagerorte").select("*").eq("user_id", userId).order("position").order("name"),
      ]);
      setGeraete(geraeteRes.data || []);
      setWartungen(wartungenRes.data || []);
      setDokumente(dokRes.data || []);
      setOrte(orteRes.data || []);
      setLagerorte(lagerorteRes.data || []);
      supabase.rpc("get_bewohner_overview").then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setBewohner(
            data.map((b) => ({
              id: b.id,
              name: b.name || "Bewohner",
              display_name: b.display_name || b.name || "Bewohner",
              farbe: b.farbe || "#10B981",
              emoji: b.emoji || "👤",
            })),
          );
        }
      });
    } catch {
      setFehler(t("home:loadError", { defaultValue: "Data could not be loaded." }));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  useEffect(() => {
    if (!highlightedGeraetId) return;
    setAusgeklappt({ [highlightedGeraetId]: true });
    window.setTimeout(() => {
      document
        .querySelector(`[data-geraet-id="${highlightedGeraetId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [highlightedGeraetId, geraete.length]);

  // --- Speichern ---
  const handleSpeichern = async (daten) => {
    const cleanDaten = buildGeraetPayload(daten);
    if (daten.id) {
      await supabase.from("home_geraete").update(cleanDaten).eq("id", daten.id);
      await notifyHouseholdEvent({
        userId,
        table: "home_geraete",
        action: "geaendert",
        recordName: daten.name,
        recordId: daten.id,
        url: "/home/geraete",
        push: false,
      });
    } else {
      const { data: neuesGeraet } = await supabase
        .from("home_geraete")
        .insert({ ...cleanDaten, user_id: userId })
        .select("id, name")
        .single();
      await notifyHouseholdEvent({
        userId,
        table: "home_geraete",
        action: "erstellt",
        recordName: neuesGeraet?.name || daten.name,
        recordId: neuesGeraet?.id,
        url: "/home/geraete",
      });
    }
    closeModal();
    ladeDaten();
  };

  // --- Löschen ---
  const loesche = async (id) => {
    if (!window.confirm(t("home:devicesDeleteConfirm", { defaultValue: "Delete device and all maintenance entries?" }))) return;
    const geraet = geraete.find((eintrag) => eintrag.id === id);
    await supabase.from("home_geraete").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_geraete",
      action: "geloescht",
      recordName: geraet?.name,
      recordId: id,
      url: "/home/geraete",
    });
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
      beschreibung: t("home:devicesForm.maintenanceDoneNote"),
    });
    if (neuesDatum) {
      await supabase.from("home_geraete").update({ naechste_wartung: neuesDatum }).eq("id", geraetId);
    }
    await notifyHouseholdEvent({
      userId,
      table: "home_wartungen",
      action: "geaendert",
      recordName: g.name,
      recordId: geraetId,
      url: "/home/geraete",
      tag: `wartung-erledigt-${geraetId}`,
      pushPolicy: "always",
      title: t("home:devicesMaintenanceDone", { defaultValue: "Maintenance completed" }),
      body: g.name
        ? t("home:devicesMaintenanceDoneBody", { device: g.name, defaultValue: `Maintenance for "${g.name}" was completed.` })
        : t("home:devicesMaintenanceDoneBodyGeneric", { defaultValue: "Maintenance was completed." }),
    });
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
        [g.name, g.hersteller, g.modell, g.seriennummer, ...(g.tags || [])].some((f) => f?.toLowerCase().includes(q)));
    }
    if (katFilter !== "Alle") result = result.filter((g) => normalizeDeviceCategory(g.kategorie) === katFilter);
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
    [...new Set(geraete.map((g) => normalizeDeviceCategory(g.kategorie)).filter(Boolean))].sort(),
    [geraete]);

  // --- Gefiltert + Sortiert ---
  const gefiltertUndSortiert = useMemo(() => {
    let result = geraete;
    if (suchbegriff) {
      const q = suchbegriff.toLowerCase();
      result = result.filter((g) =>
        [g.name, g.hersteller, g.modell, g.seriennummer, ...(g.tags || [])].some((f) => f?.toLowerCase().includes(q)));
    }
    if (statusFilter !== "alle")
      result = result.filter((g) => statusByGeraetId[g.id] === statusFilter);
    if (katFilter !== "Alle")
      result = result.filter((g) => normalizeDeviceCategory(g.kategorie) === katFilter);
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
        .map((s) => ({
          key: s,
          label: t(`home:devicesStatus.${s}`, { defaultValue: STATUS_CONFIG[s].label }),
          items: map[s],
        }));
    }
    if (gruppierung === "kategorie") {
      const map = {};
      gefiltertUndSortiert.forEach((g) => {
        const k = normalizeDeviceCategory(g.kategorie) || "Sonstiges";
        (map[k] ??= []).push(g);
      });
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, items]) => ({ key: k, label: getDeviceCategoryLabel(k, i18n.language), items }));
    }
    return [{ key: "__alle__", label: null, items: gefiltertUndSortiert }];
  }, [gefiltertUndSortiert, gruppierung, statusByGeraetId, i18n.language, t]);

  // --- Render ---
  return (
    <div className="home-glass-modern glass-module relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench size={22} className="text-primary-500 shrink-0" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">{t("home:devicesForm.title")}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Ansicht-Toggle (nur Desktop) */}
          <div className={`${glassSurfaceClass} hidden sm:flex items-center overflow-hidden rounded-card-sm`}>
            <button
              onClick={() => toggleAnsicht("liste")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${ansicht === "liste" ? "bg-primary-500 text-white" : "text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"}`}
              title="Listenansicht"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => toggleAnsicht("karten")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${ansicht === "karten" ? "bg-primary-500 text-white" : "text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"}`}
              title="Kartenansicht"
            >
              <LayoutGrid size={13} />
            </button>
          </div>
          <button
            onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30 transition-colors"
          >
            <Sparkles size={15} /><span className="hidden sm:inline">KI</span>
          </button>
        </div>
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

      {/* Stats-Leiste */}
      {!loading && geraete.length > 0 && Object.keys(statusZaehlung).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          {STATUS_PRIORITAET.filter((s) => statusZaehlung[s]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const colorMap = { red: "bg-red-500/10 text-red-500 border-red-500/30", amber: "bg-amber-500/10 text-amber-500 border-amber-500/30", gray: "bg-gray-500/10 text-gray-500 border-gray-500/30", green: "bg-green-500/10 text-green-500 border-green-500/30" };
            const dotMap = { red: "bg-red-500", amber: "bg-amber-400", gray: "bg-gray-400", green: "bg-green-500" };
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(isActive ? "alle" : s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold border transition-colors cursor-pointer ${
                  isActive ? colorMap[cfg?.farbe] + " ring-1 ring-inset ring-current" : "border-light-border dark:border-dark-border text-dark-text-secondary hover:border-primary-500/40"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotMap[cfg?.farbe] || "bg-gray-400"}`} />
                {t(`home:devicesStatus.${s}`, { defaultValue: cfg?.label || s })}
                <span className="opacity-70">{statusZaehlung[s]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Liste / Karten */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      ) : geraete.length === 0 ? (
        <div data-tour="tour-geraete-liste" className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <Wrench size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("home:devicesForm.empty")}</p>
          <button
            onClick={openCreateModal}
            className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
          >
            <Plus size={14} /> {t("home:devicesForm.addFirst")}
          </button>
        </div>
      ) : gefiltertUndSortiert.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <p className="text-sm">{t("home:devicesForm.emptyFilter")}</p>
        </div>
      ) : ansicht === "karten" ? (
        /* Kartenansicht */
        <div data-tour="tour-geraete-liste" className="space-y-4">
          {gruppierteListe.map((gruppe) => (
            <section key={gruppe.key}>
              {gruppe.label && (
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                    {gruppe.label}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    {gruppe.items.length}
                  </span>
                </div>
              )}
              <motion.div variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {gruppe.items.map((g) => (
                  <motion.div
                    key={g.id}
                    variants={reducedMotion ? {} : glassItemVariants}
                  >
                    <GeraetZeile
                      g={g}
                      status={statusByGeraetId[g.id]}
                      heute={heute}
                      geraetWartungen={wartungenByGeraetId[g.id] || []}
                      verknuepfteDokumente={verknuepfteDokuByGeraetId[g.id] || []}
                      isOffen={!!ausgeklappt[g.id]}
                      onToggle={() => toggleGeraet(g.id)}
                      onBearbeiten={() => openEditModal(g)}
                      onLoeschen={() => loesche(g.id)}
                      onWartungErledigt={() => wartungErledigt(g.id)}
                      onDokuModalOpen={() => setDokuModal(g.id)}
                      onDokumentUnlink={(dokId) => toggleDokumentLink(g.id, dokId)}
                      onVorschau={(dok) => setVorschauDok(dok)}
                      onNavigate={(dokId) => navigate("/home/dokumente", { state: { focusDokumentId: dokId } })}
                      isHighlighted={g.id === highlightedGeraetId}
                      orte={orte}
                      lagerorte={lagerorte}
                      bewohner={bewohner}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      ) : (
        /* Listenansicht */
        <div data-tour="tour-geraete-liste" className="space-y-3">
          {gruppierteListe.map((gruppe) => (
            <section key={gruppe.key}>
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
              <motion.div variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" className="space-y-2">
                {gruppe.items.map((g) => (
                  <GeraetZeile
                    key={g.id}
                    g={g}
                    status={statusByGeraetId[g.id]}
                    heute={heute}
                    geraetWartungen={wartungenByGeraetId[g.id] || []}
                    verknuepfteDokumente={verknuepfteDokuByGeraetId[g.id] || []}
                    isOffen={!!ausgeklappt[g.id]}
                    onToggle={() => toggleGeraet(g.id)}
                    onBearbeiten={() => openEditModal(g)}
                    onLoeschen={() => loesche(g.id)}
                    onWartungErledigt={() => wartungErledigt(g.id)}
                    onDokuModalOpen={() => setDokuModal(g.id)}
                    onDokumentUnlink={(dokId) => toggleDokumentLink(g.id, dokId)}
                    onVorschau={(dok) => setVorschauDok(dok)}
                    onNavigate={(dokId) => navigate("/home/dokumente", { state: { focusDokumentId: dokId } })}
                    isHighlighted={g.id === highlightedGeraetId}
                    orte={orte}
                    lagerorte={lagerorte}
                    bewohner={bewohner}
                  />
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}

      {/* Gerät-Formular-Modal */}
      {modal !== null && (
        <div className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${glassSurfaceClass} mobile-modal-dialog max-w-md w-full flex min-h-0 flex-col`}>
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2 rounded-t-card">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {formData.id ? t("home:devicesForm.edit") : t("home:devicesForm.new")}
              </h3>
              <button onClick={closeModal} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="mobile-modal-body flex-1 p-4">
              <GeraetForm value={formData} onChange={setFormData} orte={orte} lagerorte={lagerorte} bewohner={bewohner} />
            </div>
            <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={() => handleSpeichern(formData)}
                disabled={!formData.name?.trim()}
                className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
              >
                {t("common:actions.save")}
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
            await applyDeviceAiItems({ session, items });
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
          <div className={`${glassSurfaceClass} max-w-sm w-full max-h-[80vh] flex flex-col`}>
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">
                {t("home:devicesForm.linkDocument", { defaultValue: "Link document" })}
              </h3>
              <button onClick={() => setDokuModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {dokumente.length === 0 ? (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-8">
                  {t("home:devicesForm.noDocuments", { defaultValue: "No documents yet. Upload documents in the document archive." })}
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
                {t("common:actions.done", { defaultValue: "Done" })}
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
