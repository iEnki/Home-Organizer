import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";
import useViewport from "../../hooks/useViewport";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import {
  applyLegacyShoppingFields,
  applyShoppingBatch,
  buildShoppingGroups,
  filterShoppingEntries,
  getShoppingEntrySubtitle,
  getShoppingFilterOptions,
  getSubcategoriesForMainCategory,
  normalizeShoppingName,
  normalizeUnit,
  prepareShoppingBatch,
  saveShoppingCorrection,
  SHOPPING_MAIN_CATEGORIES,
  SHOPPING_SORT_MODES,
  splitShoppingInput,
} from "../../utils/einkaufslisteUtils";

const DEFAULT_EDIT_FORM = {
  id: null,
  name: "",
  menge: 1,
  einheit: "Stück",
  hauptkategorie: "Haushalt",
  unterkategorie: "",
};

const normalizeEntries = (entries) => (entries || []).map((entry) => applyLegacyShoppingFields(entry));

const SHOPPING_CATEGORY_STYLES = {
  Lebensmittel: {
    soft: "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    solid: "border-emerald-500 bg-emerald-500 text-white",
  },
  Getränke: {
    soft: "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300",
    solid: "border-sky-500 bg-sky-500 text-white",
  },
  Drogerie: {
    soft: "border-fuchsia-500/30 bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
    solid: "border-fuchsia-500 bg-fuchsia-500 text-white",
  },
  Haushalt: {
    soft: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
    solid: "border-amber-500 bg-amber-500 text-white",
  },
  Elektronik: {
    soft: "border-cyan-500/30 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    solid: "border-cyan-500 bg-cyan-500 text-white",
  },
  Tierbedarf: {
    soft: "border-orange-500/30 bg-orange-500/12 text-orange-700 dark:text-orange-300",
    solid: "border-orange-500 bg-orange-500 text-white",
  },
  Baby: {
    soft: "border-pink-500/30 bg-pink-500/12 text-pink-700 dark:text-pink-300",
    solid: "border-pink-500 bg-pink-500 text-white",
  },
  "Apotheke / Gesundheit": {
    soft: "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300",
    solid: "border-rose-500 bg-rose-500 text-white",
  },
  Sonstiges: {
    soft: "border-slate-500/30 bg-slate-500/12 text-slate-700 dark:text-slate-300",
    solid: "border-slate-500 bg-slate-500 text-white",
  },
};

const DEFAULT_CATEGORY_STYLE =
  SHOPPING_CATEGORY_STYLES.Sonstiges;

const getShoppingCategoryStyle = (category) =>
  SHOPPING_CATEGORY_STYLES[category] || DEFAULT_CATEGORY_STYLE;

const getShoppingCategoryBadgeLabel = (entry, fallbackToMain = false) =>
  entry.unterkategorie || (fallbackToMain ? entry.hauptkategorie || null : null);

const getMissingSchemaColumn = (error) => {
  const message = String(error?.message || "");
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] || null;
};

const updateShoppingEntryWithFallback = async ({ id, payload }) => {
  let nextPayload = { ...payload };
  const removedColumns = new Set();

  while (true) {
    const { error } = await supabase
      .from("home_einkaufliste")
      .update(nextPayload)
      .eq("id", id);

    if (!error) return nextPayload;

    const missingColumn = getMissingSchemaColumn(error);
    if (!missingColumn || !(missingColumn in nextPayload) || removedColumns.has(missingColumn)) {
      throw error;
    }

    removedColumns.add(missingColumn);
    delete nextPayload[missingColumn];
  }
};

const buildPreviewDecisions = (duplicates) => {
  const map = {};
  (duplicates || []).forEach((duplicate) => {
    map[duplicate.client_id] = {
      action: "merge",
      existingEntry: duplicate.existing_entry,
    };
  });
  return map;
};

const HomeEinkaufliste = ({ session }) => {
  const userId = session?.user?.id;
  const toast = useToast();
  const { isMobile } = useViewport();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("einkaufliste");

  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [fehler, setFehler] = useState("");
  const [kiOffen, setKiOffen] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Alle");
  const [sortMode, setSortMode] = useState("Markt");
  const [showCompleted, setShowCompleted] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createText, setCreateText] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [previewState, setPreviewState] = useState(null);

  const [editForm, setEditForm] = useState(DEFAULT_EDIT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler("");
    try {
      const { data, error } = await supabase
        .from("home_einkaufliste")
        .select("*")
        .eq("user_id", userId)
        .order("erledigt", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEintraege(normalizeEntries(data));
    } catch (error) {
      console.error("Fehler beim Laden der Einkaufsliste", error);
      setFehler("Einkaufsliste konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten]);

  const resetCreateFlow = () => {
    setCreateText("");
    setCreateModalOpen(false);
    setPreviewState(null);
  };

  const closeEditModal = () => setEditForm(DEFAULT_EDIT_FORM);

  const openEditModal = (entry) => {
    const normalizedEntry = applyLegacyShoppingFields(entry);
    setEditForm({
      id: normalizedEntry.id,
      name: normalizedEntry.name || "",
      menge: normalizedEntry.menge || 1,
      einheit: normalizedEntry.einheit || "Stück",
      hauptkategorie: normalizedEntry.hauptkategorie || "Sonstiges",
      unterkategorie: normalizedEntry.unterkategorie || "",
    });
  };

  const handleIncomingShoppingItems = async (rawItems, source = "manuell") => {
    if (!userId || !Array.isArray(rawItems) || rawItems.length === 0) return;

    setSubmittingCreate(true);
    setFehler("");
    try {
      const offeneEintraege = normalizeEntries(eintraege).filter((entry) => !entry.erledigt);
      const result = await prepareShoppingBatch({
        rawItems,
        userId,
        source,
        existingEntries: offeneEintraege,
      });

      setPreviewState({
        ...result,
        decisions: buildPreviewDecisions(result.duplicates),
      });
      setCreateModalOpen(false);
      setKiOffen(false);
    } catch (error) {
      console.error("Fehler beim Vorbereiten des Einkaufs-Batches", error);
      setFehler("Einträge konnten nicht vorbereitet werden.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleCreateAnalyse = async () => {
    const parts = splitShoppingInput(createText);
    if (parts.length === 0) {
      toast.info("Bitte mindestens einen Artikel eingeben.");
      return;
    }

    await handleIncomingShoppingItems(
      parts.map((part) => ({ original_text: part })),
      "manuell"
    );
  };

  const updatePreviewDecision = (clientId, nextDecision) => {
    setPreviewState((current) => {
      if (!current) return current;
      return {
        ...current,
        decisions: {
          ...current.decisions,
          [clientId]: nextDecision,
        },
      };
    });
  };

  const commitPreview = async () => {
    if (!previewState || !userId) return;
    setSubmittingCreate(true);
    setFehler("");
    try {
      const result = await applyShoppingBatch({
        userId,
        drafts: previewState.drafts,
        decisions: previewState.decisions,
      });

      setPreviewState(null);
      setCreateText("");
      await ladeDaten();

      const parts = [];
      if (result.inserted > 0) parts.push(`${result.inserted} neu`);
      if (result.merged > 0) parts.push(`${result.merged} zusammengeführt`);
      toast.success(`Einkaufsliste aktualisiert${parts.length ? `: ${parts.join(", ")}` : ""}.`);
    } catch (error) {
      console.error("Fehler beim Speichern des Einkaufs-Batches", error);
      setFehler("Einträge konnten nicht gespeichert werden.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const toggleErledigt = async (entry) => {
    const erledigt = !entry.erledigt;
    const timestamp = erledigt ? new Date().toISOString() : null;

    setEintraege((current) =>
      normalizeEntries(
        current.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                erledigt,
                erledigt_am: timestamp,
              }
            : item
        )
      )
    );

    const { error } = await supabase
      .from("home_einkaufliste")
      .update({
        erledigt,
        erledigt_am: timestamp,
      })
      .eq("id", entry.id);

    if (error) {
      console.error("Fehler beim Aktualisieren des Status", error);
      toast.error("Status konnte nicht gespeichert werden.");
      await ladeDaten();
      return;
    }

    toast.success(erledigt ? "Artikel abgehakt." : "Artikel wieder geöffnet.");
  };

  const loesche = async (id) => {
    const { error } = await supabase.from("home_einkaufliste").delete().eq("id", id);
    if (error) {
      console.error("Fehler beim Löschen", error);
      toast.error("Eintrag konnte nicht gelöscht werden.");
      return;
    }

    setEintraege((current) => current.filter((entry) => entry.id !== id));
    toast.success("Eintrag gelöscht.");
  };

  const loescheErledigt = async () => {
    if (!window.confirm("Alle erledigten Einkaufsartikel löschen?")) return;

    const { error } = await supabase
      .from("home_einkaufliste")
      .delete()
      .eq("user_id", userId)
      .eq("erledigt", true);

    if (error) {
      console.error("Fehler beim Löschen erledigter Einträge", error);
      toast.error("Erledigte Einträge konnten nicht gelöscht werden.");
      return;
    }

    setEintraege((current) => current.filter((entry) => !entry.erledigt));
    toast.success("Erledigte Einträge gelöscht.");
  };

  const handleEditSave = async () => {
    if (!editForm.id || !editForm.name.trim()) return;

    setSavingEdit(true);
    setFehler("");
    try {
      const payload = {
        name: editForm.name.trim(),
        original_text: editForm.name.trim(),
        normalized_name: normalizeShoppingName(editForm.name),
        menge: Number(editForm.menge) > 0 ? Number(editForm.menge) : 1,
        einheit: normalizeUnit(editForm.einheit) || "Stück",
        hauptkategorie: editForm.hauptkategorie || "Sonstiges",
        unterkategorie: editForm.unterkategorie || null,
        kategorie: editForm.hauptkategorie || "Sonstiges",
        review_noetig: false,
        confidence: 0.99,
      };

      const persistedPayload = await updateShoppingEntryWithFallback({
        id: editForm.id,
        payload,
      });

      try {
        await saveShoppingCorrection({
          entry: persistedPayload,
          userId,
        });
      } catch (correctionError) {
        console.warn("Einkaufskorrektur konnte nicht gespeichert werden", correctionError);
      }

      closeEditModal();
      await ladeDaten();
      toast.success("Eintrag aktualisiert.");
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Eintrags", error);
      setFehler("Eintrag konnte nicht aktualisiert werden.");
    } finally {
      setSavingEdit(false);
    }
  };

  const gefilterteEintraege = filterShoppingEntries(eintraege, {
    search,
    filter,
  });
  const offeneEintraege = gefilterteEintraege.filter((entry) => !entry.erledigt);
  const erledigteEintraege = gefilterteEintraege
    .filter((entry) => entry.erledigt)
    .sort((left, right) => new Date(right.erledigt_am || 0) - new Date(left.erledigt_am || 0));
  const gruppen = buildShoppingGroups(offeneEintraege, sortMode);
  const filterOptions = getShoppingFilterOptions();
  const hatAktiveListenFilter = filter !== "Alle" || sortMode !== "Markt";

  const resetListenFilter = () => {
    setFilter("Alle");
    setSortMode("Markt");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          size={30}
          className="animate-spin text-light-text-secondary dark:text-dark-text-secondary"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
            <ShoppingCart size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
                Einkaufsliste
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
                {eintraege.filter((entry) => !entry.erledigt).length} offen
              </span>
            </div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Markt-Reihenfolge, Review-Hinweise und Sammelerfassung in einem Flow.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {eintraege.some((entry) => entry.erledigt) && (
            <button
              onClick={loescheErledigt}
              className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            >
              Erledigte löschen
            </button>
          )}
          <button
            onClick={() => setKiOffen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-pill text-sm font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30 transition-colors"
          >
            <Sparkles size={15} />
            <span>KI</span>
          </button>
          <button
            data-tour="tour-einkauf-hinzufuegen"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors"
          >
            <Plus size={15} />
            <span>Hinzufügen</span>
          </button>
        </div>
      </div>

      {fehler && (
        <div className="rounded-card border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{fehler}</span>
        </div>
      )}

      <div className="grid gap-3">
        <div
          data-tour="tour-einkauf-suche"
          className="flex items-center gap-3 rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-4 py-3"
        >
          <Search size={17} className="text-light-text-secondary dark:text-dark-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Artikel, Kategorie oder Unterkategorie suchen"
            className="w-full bg-transparent outline-none text-sm text-light-text-main dark:text-dark-text-main placeholder:text-light-text-secondary dark:placeholder:text-dark-text-secondary"
          />
        </div>

        {isMobile ? (
          <div className="grid grid-cols-2 gap-2">
            <div data-tour="tour-einkauf-sort" className="relative">
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                aria-label="Sortierung auswählen"
                className="w-full appearance-none rounded-pill border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 pl-3 pr-9 py-2.5 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:border-primary-500"
              >
                {SHOPPING_SORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
              />
            </div>

            <div data-tour="tour-einkauf-filter" className="relative">
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter auswählen"
                className="w-full appearance-none rounded-pill border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 pl-3 pr-9 py-2.5 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:border-primary-500"
              >
                {filterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
              />
            </div>
          </div>
        ) : (
          <>
            <div data-tour="tour-einkauf-sort" className="flex flex-wrap gap-2">
              {SHOPPING_SORT_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`px-3 py-2 rounded-pill text-sm border transition-colors ${
                    sortMode === mode
                      ? "bg-primary-500 text-white border-primary-500"
                      : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div data-tour="tour-einkauf-filter" className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {filterOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors whitespace-nowrap flex-shrink-0 ${
                    filter === option
                      ? SHOPPING_MAIN_CATEGORIES.includes(option)
                        ? getShoppingCategoryStyle(option).solid
                        : "bg-amber-500 text-white border-amber-500"
                      : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {hatAktiveListenFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          {sortMode !== "Markt" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-500 border border-primary-500/20">
              Sortierung: {sortMode}
              <button onClick={() => setSortMode("Markt")} className="hover:text-primary-600">
                <X size={10} />
              </button>
            </span>
          )}

          {filter !== "Alle" && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                SHOPPING_MAIN_CATEGORIES.includes(filter)
                  ? getShoppingCategoryStyle(filter).soft
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              Filter: {filter}
              <button onClick={() => setFilter("Alle")} className="hover:text-amber-500">
                <X size={10} />
              </button>
            </span>
          )}

          <button
            onClick={resetListenFilter}
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main underline underline-offset-2"
          >
            Zurücksetzen
          </button>
        </div>
      )}

      <div data-tour="tour-einkauf-liste" className="space-y-4">
        {gruppen.length === 0 && erledigteEintraege.length === 0 && (
          <div className="rounded-card border border-dashed border-light-border dark:border-dark-border p-8 text-center bg-light-card dark:bg-canvas-2">
            <ShoppingCart
              size={36}
              className="mx-auto mb-3 text-light-text-secondary dark:text-dark-text-secondary opacity-50"
            />
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Keine Einträge für den aktuellen Filter.
            </p>
          </div>
        )}

        {gruppen.map((gruppe) => (
          <section key={gruppe.label} className="space-y-2">
            <div className="sticky top-[72px] z-10 -mx-1 px-1 py-1 bg-light-bg/90 dark:bg-canvas-1/90 backdrop-blur-sm">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 border ${getShoppingCategoryStyle(
                  gruppe.label
                ).soft}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {gruppe.label}
                </span>
                <span className="text-xs opacity-80">
                  {gruppe.items.length}
                </span>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {gruppe.items.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-3"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleErledigt(entry)}
                      className="w-5 h-5 mt-1 rounded-full border-2 border-light-border dark:border-dark-border flex items-center justify-center hover:border-primary-500/50 transition-colors flex-shrink-0"
                    >
                      <Circle size={11} className="text-light-text-secondary dark:text-dark-text-secondary" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                              {entry.name}
                            </h3>
                            {getShoppingCategoryBadgeLabel(entry) && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getShoppingCategoryStyle(
                                  entry.hauptkategorie
                                ).soft}`}
                              >
                                {getShoppingCategoryBadgeLabel(entry)}
                              </span>
                            )}
                            {entry.review_noetig && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                                <AlertTriangle size={12} />
                                Prüfen
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            {getShoppingEntrySubtitle(entry)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                            aria-label="Eintrag bearbeiten"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => loesche(entry.id)}
                            className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-red-500/10 hover:text-red-500"
                            aria-label="Eintrag löschen"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        ))}

        {erledigteEintraege.length > 0 && (
          <section className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 overflow-hidden">
            <button
              onClick={() => setShowCompleted((current) => !current)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                  Erledigt
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {erledigteEintraege.length} zuletzt abgehakte Artikel
                </p>
              </div>
              {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showCompleted && (
              <div className="px-3 pb-3 space-y-2">
                {erledigteEintraege.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3 flex items-start gap-3 opacity-75"
                  >
                    <button
                      onClick={() => toggleErledigt(entry)}
                      className="w-5 h-5 mt-1 rounded-full bg-primary-500 text-white flex items-center justify-center flex-shrink-0"
                    >
                      <Check size={12} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm line-through text-light-text-main dark:text-dark-text-main">
                        {entry.name}
                      </h3>
                      {getShoppingCategoryBadgeLabel(entry, true) && (
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getShoppingCategoryStyle(
                              entry.hauptkategorie
                            ).soft}`}
                          >
                            {getShoppingCategoryBadgeLabel(entry, true)}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        {getShoppingEntrySubtitle(entry)}
                      </p>
                    </div>
                    <button
                      onClick={() => loesche(entry.id)}
                      className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-red-500/10 hover:text-red-500"
                      aria-label="Eintrag löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border shadow-elevation-3 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <div>
                <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                  Artikel erfassen
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Mehrere Einträge mit Komma, Semikolon oder Zeilenumbruch trennen.
                </p>
              </div>
              <button
                onClick={resetCreateFlow}
                className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <textarea
                value={createText}
                onChange={(event) => setCreateText(event.target.value)}
                placeholder={"Milch, Bananen, Hendlbrust 500 g, Küchenrolle"}
                className="w-full min-h-[180px] rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {splitShoppingInput(createText).length} erkannte Roh-Einträge vor der Analyse
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={resetCreateFlow}
                    className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleCreateAnalyse}
                    disabled={submittingCreate}
                    className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
                  >
                    {submittingCreate && <Loader2 size={14} className="animate-spin" />}
                    <span>Analysieren</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewState && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border shadow-elevation-3 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <div>
                <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                  Vorschau vor dem Speichern
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Unsichere Einträge sind markiert. Duplikate können zusammengeführt werden.
                </p>
              </div>
              <button
                onClick={() => setPreviewState(null)}
                className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-auto space-y-3">
              {previewState.drafts.map((draft) => {
                const duplicate = previewState.duplicates.find(
                  (item) => item.client_id === draft.client_id
                );
                const decision = previewState.decisions[draft.client_id] || { action: "insert" };

                return (
                  <div
                    key={draft.client_id}
                    className="rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                            {draft.name}
                          </h3>
                          {getShoppingCategoryBadgeLabel(draft, true) && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getShoppingCategoryStyle(
                                draft.hauptkategorie
                              ).soft}`}
                            >
                              {getShoppingCategoryBadgeLabel(draft, true)}
                            </span>
                          )}
                          {draft.review_noetig && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                              <AlertTriangle size={12} />
                              Prüfen
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                          {getShoppingEntrySubtitle(draft)}
                        </p>
                        {draft.merged_original_texts?.length > 1 && (
                          <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            Batch-intern zusammengeführt aus {draft.merged_original_texts.length} Roh-Einträgen
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                        Confidence {Math.round((draft.confidence || 0) * 100)}%
                      </span>
                    </div>

                    {duplicate && (
                      <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Bereits offen vorhanden: <strong>{duplicate.existing_entry.name}</strong>{" "}
                          ({getShoppingEntrySubtitle(duplicate.existing_entry)})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              updatePreviewDecision(draft.client_id, {
                                action: "merge",
                                existingEntry: duplicate.existing_entry,
                              })
                            }
                            className={`px-3 py-1.5 rounded-full text-xs border ${
                              decision.action === "merge"
                                ? "bg-amber-500 text-white border-amber-500"
                                : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
                            }`}
                          >
                            Zusammenführen
                          </button>
                          <button
                            onClick={() =>
                              updatePreviewDecision(draft.client_id, {
                                action: "insert",
                              })
                            }
                            className={`px-3 py-1.5 rounded-full text-xs border ${
                              decision.action === "insert"
                                ? "bg-primary-500 text-white border-primary-500"
                                : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
                            }`}
                          >
                            Separat lassen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-light-border dark:border-dark-border flex items-center justify-between gap-3">
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {previewState.drafts.length} Einträge bereit zum Speichern
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewState(null)}
                  className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                >
                  Schließen
                </button>
                <button
                  onClick={commitPreview}
                  disabled={submittingCreate}
                  className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
                >
                  {submittingCreate && <Loader2 size={14} className="animate-spin" />}
                  <span>Speichern</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editForm.id && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-card bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border shadow-elevation-3 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                Einkaufsartikel bearbeiten
              </h2>
              <button
                onClick={closeEditModal}
                className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                  Name
                </label>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    Menge
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editForm.menge}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, menge: event.target.value }))
                    }
                    className="w-full rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    Einheit
                  </label>
                  <input
                    value={editForm.einheit}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, einheit: event.target.value }))
                    }
                    className="w-full rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    Hauptkategorie
                  </label>
                  <select
                    value={editForm.hauptkategorie}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        hauptkategorie: event.target.value,
                        unterkategorie: "",
                      }))
                    }
                    className="w-full rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {SHOPPING_MAIN_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    Unterkategorie
                  </label>
                  <select
                    value={editForm.unterkategorie}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        unterkategorie: event.target.value,
                      }))
                    }
                    className="w-full rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Keine Unterkategorie</option>
                    {getSubcategoriesForMainCategory(editForm.hauptkategorie).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-light-border dark:border-dark-border flex justify-end gap-2">
              <button
                onClick={closeEditModal}
                className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                Abbrechen
              </button>
              <button
                onClick={handleEditSave}
                disabled={savingEdit}
                className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
              >
                {savingEdit && <Loader2 size={14} className="animate-spin" />}
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {kiOffen && (
        <KiHomeAssistent
          session={session}
          modul="einkaufliste"
          onClose={() => setKiOffen(false)}
          onErgebnis={(items) => handleIncomingShoppingItems(items, "ki")}
        />
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.einkaufliste}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeEinkaufliste;
