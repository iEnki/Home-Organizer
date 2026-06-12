import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Edit2,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useLocale } from "../../contexts/LocaleContext";
import { startSpeechRecognition } from "../../utils/kiClient";
import { useToast } from "../../hooks/useToast";
import useViewport from "../../hooks/useViewport";
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
import { notifyHouseholdBatchEvent, notifyHouseholdEvent } from "../../utils/pushNotifications";
import {
  hasLocalizedShoppingContent,
  normalizeContentLocale,
  resolveLocalizedShoppingEntry,
  translateShoppingEntriesIfMissing,
} from "../../utils/localizedRecipeShopping";
import GlassSurface, { glassCollapseVariants, glassPageVariants, glassSurfaceClass } from "../ui/GlassSurface";

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

const SHOPPING_LABELS_EN = new Map([
  ["Alle", "All"],
  ["Offen", "Open"],
  ["Erledigt", "Done"],
  ["Prüfen", "Review"],
  ["Pr?fen", "Review"],
  ["Ungruppiert", "Ungrouped"],
  ["Markt", "Market"],
  ["Kategorie", "Category"],
  ["Neueste", "Newest"],
  ["Lebensmittel", "Groceries"],
  ["Getränke", "Drinks"],
  ["Getr?nke", "Drinks"],
  ["Drogerie", "Drugstore"],
  ["Haushalt", "Household"],
  ["Elektronik", "Electronics"],
  ["Tierbedarf", "Pet supplies"],
  ["Baby", "Baby"],
  ["Apotheke / Gesundheit", "Pharmacy / health"],
  ["Sonstiges", "Other"],
  ["Obst & Gemüse", "Fruit & vegetables"],
  ["Obst & Gem?se", "Fruit & vegetables"],
  ["Fleisch & Geflügel", "Meat & poultry"],
  ["Fleisch & Gefl?gel", "Meat & poultry"],
  ["Fisch", "Fish"],
  ["Milchprodukte", "Dairy"],
  ["Käse", "Cheese"],
  ["K?se", "Cheese"],
  ["Tiefkühl", "Frozen"],
  ["Tiefk?hl", "Frozen"],
  ["Brot & Gebäck", "Bread & pastries"],
  ["Brot & Geb?ck", "Bread & pastries"],
  ["Nudeln, Reis & Vorrat", "Pasta, rice & pantry"],
  ["Snacks & Süßes", "Snacks & sweets"],
  ["Snacks & S??es", "Snacks & sweets"],
  ["Gewürze & Saucen", "Spices & sauces"],
  ["Gew?rze & Saucen", "Spices & sauces"],
  ["Wasser & Softdrinks", "Water & soft drinks"],
  ["Säfte", "Juices"],
  ["S?fte", "Juices"],
  ["Kaffee & Tee", "Coffee & tea"],
  ["Alkohol", "Alcohol"],
  ["Hygiene", "Hygiene"],
  ["Kosmetik", "Cosmetics"],
  ["Baby-Pflege", "Baby care"],
  ["Apotheke", "Pharmacy"],
  ["Reinigung", "Cleaning"],
  ["Küchenbedarf", "Kitchen supplies"],
  ["K?chenbedarf", "Kitchen supplies"],
  ["Papierwaren", "Paper goods"],
  ["Müllbeutel", "Bin bags"],
  ["M?llbeutel", "Bin bags"],
  ["Waschmittel", "Laundry detergent"],
  ["Batterien", "Batteries"],
  ["Kabel", "Cables"],
  ["Zubehör", "Accessories"],
  ["Zubeh?r", "Accessories"],
  ["Lampen", "Lamps"],
  ["Kleingeräte", "Small appliances"],
  ["Kleinger?te", "Small appliances"],
  ["Tierfutter", "Pet food"],
  ["Pflege", "Care"],
  ["Babynahrung", "Baby food"],
  ["Windeln", "Nappies"],
  ["Medikamente", "Medication"],
  ["Erste Hilfe", "First aid"],
  ["Nahrungsergänzung", "Supplements"],
  ["Nahrungserg?nzung", "Supplements"],
]);

const SHOPPING_LABELS_DE = new Map([
  ["Pr?fen", "Pruefen"],
  ["Getr?nke", "Getraenke"],
  ["Obst & Gem?se", "Obst & Gemuese"],
  ["Fleisch & Gefl?gel", "Fleisch & Gefluegel"],
  ["K?se", "Kaese"],
  ["Tiefk?hl", "Tiefkuehl"],
  ["Brot & Geb?ck", "Brot & Gebaeck"],
  ["Snacks & S??es", "Snacks & Suesses"],
  ["Gew?rze & Saucen", "Gewuerze & Saucen"],
  ["S?fte", "Saefte"],
  ["K?chenbedarf", "Kuechenbedarf"],
  ["M?llbeutel", "Muellbeutel"],
  ["Zubeh?r", "Zubehoer"],
  ["Kleinger?te", "Kleingeraete"],
  ["Nahrungserg?nzung", "Nahrungsergaenzung"],
]);

const getShoppingUiLabel = (value, locale) => {
  const raw = String(value || "");
  if (!raw) return raw;
  return locale === "en-GB" ? (SHOPPING_LABELS_EN.get(raw) || raw) : (SHOPPING_LABELS_DE.get(raw) || raw);
};

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

function EntryPreviewRow({
  draft,
  editedValues,
  isAusgeschlossen,
  duplicate,
  decision,
  onToggleAblehnen,
  onEditSpeichern,
  onUpdateDecision,
}) {
  const { t, i18n } = useTranslation(["home", "common"]);
  const [editOffen, setEditOffen] = useState(false);
  const [name, setName] = useState(editedValues?.name ?? draft.name);
  const [menge, setMenge] = useState(String(editedValues?.menge ?? draft.menge ?? 1));
  const [einheit, setEinheit] = useState(editedValues?.einheit ?? draft.einheit ?? "Stück");

  useEffect(() => {
    if (!editedValues) {
      setName(draft.name);
      setMenge(String(draft.menge ?? 1));
      setEinheit(draft.einheit ?? "Stück");
      setEditOffen(false);
    }
  }, [draft.einheit, draft.menge, draft.name, editedValues]);

  const handleSpeichern = () => {
    const trimmedName = name.trim() || draft.name;
    const classified = applyLegacyShoppingFields({
      name: trimmedName,
      normalized_name: normalizeShoppingName(trimmedName),
    });
    onEditSpeichern(draft.client_id, {
      name: trimmedName,
      menge,
      einheit,
      hauptkategorie: classified.hauptkategorie,
      unterkategorie: classified.unterkategorie ?? null,
    });
    setEditOffen(false);
  };

  return (
    <div
      className={`rounded-card border p-3 space-y-3 transition-colors ${
        isAusgeschlossen
          ? "border-red-500/20 bg-red-500/5 opacity-60"
          : "border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-sm font-semibold text-light-text-main dark:text-dark-text-main ${isAusgeschlossen ? "line-through" : ""}`}>
              {editedValues?.name ?? draft.name}
            </h3>
            {getShoppingCategoryBadgeLabel(
              editedValues?.hauptkategorie != null
                ? { ...draft, hauptkategorie: editedValues.hauptkategorie, unterkategorie: editedValues.unterkategorie }
                : draft,
              true
            ) && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  getShoppingCategoryStyle(
                    editedValues?.hauptkategorie ?? draft.hauptkategorie
                  ).soft
                }`}
              >
                {getShoppingUiLabel(getShoppingCategoryBadgeLabel(
                  editedValues?.hauptkategorie != null
                    ? { ...draft, hauptkategorie: editedValues.hauptkategorie, unterkategorie: editedValues.unterkategorie }
                    : draft,
                  true
                ), i18n.language)}
              </span>
            )}
            {draft.review_noetig && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                <AlertTriangle size={12} />
                {t("home:shopping.review", { defaultValue: "Review" })}
              </span>
            )}
          </div>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
            {editedValues?.menge != null || editedValues?.einheit != null
              ? `${editedValues?.menge ?? draft.menge ?? 1} ${editedValues?.einheit ?? draft.einheit ?? "Stück"}`
              : getShoppingEntrySubtitle(draft)}
          </p>
          {draft.merged_original_texts?.length > 1 && (
            <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary mt-1">
              Batch-intern zusammengeführt aus {draft.merged_original_texts.length} Roh-Einträgen
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
            Confidence {Math.round((draft.confidence || 0) * 100)}%
          </span>
          {!isAusgeschlossen && (
            <button
              onClick={() => setEditOffen((v) => !v)}
              title={t("common:actions.edit")}
              className={`p-1 rounded transition-colors ${
                editOffen
                  ? "text-primary-500 bg-primary-500/10"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500"
              }`}
            >
              <Edit2 size={13} />
            </button>
          )}
          <button
            onClick={() => onToggleAblehnen(draft.client_id)}
            title={isAusgeschlossen ? "Reaktivieren" : "Ablehnen"}
            className={`p-1 rounded transition-colors ${
              isAusgeschlossen
                ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger"
            }`}
          >
            {isAusgeschlossen ? <Undo2 size={13} /> : <X size={13} />}
          </button>
        </div>
      </div>

      {/* Inline-Edit-Felder */}
      {editOffen && !isAusgeschlossen && (
        <div className="border-t border-light-border dark:border-dark-border pt-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("home:einkaufliste.namePlaceholder")}
            className="w-full px-3 py-1.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={menge}
              onChange={(e) => setMenge(e.target.value)}
              min="0"
              step="any"
              className="w-20 px-3 py-1.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
            <input
              type="text"
              value={einheit}
              onChange={(e) => setEinheit(e.target.value)}
              placeholder={t("home:shopping.unit", { defaultValue: "Unit" })}
              className="flex-1 px-3 py-1.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSpeichern}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-card-sm bg-primary-500 text-white font-medium"
            >
              <Check size={11} /> {t("common:actions.apply", { defaultValue: "Apply" })}
            </button>
            <button
              onClick={() => setEditOffen(false)}
              className="px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Duplikat-Block (unverändert, nur via Props) */}
      {duplicate && (
        <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("home:shopping.duplicateExisting", { defaultValue: "Already open:" })} <strong>{duplicate.existing_entry.name}</strong>{" "}
            ({getShoppingEntrySubtitle(duplicate.existing_entry)})
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                onUpdateDecision(draft.client_id, {
                  action: "merge",
                  existingEntry: duplicate.existing_entry,
                })
              }
              className={`px-3 py-1.5 rounded-full text-xs border ${
                decision?.action === "merge"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
              }`}
            >
              {t("home:shopping.merge", { defaultValue: "Merge" })}
            </button>
            <button
              onClick={() => onUpdateDecision(draft.client_id, { action: "insert" })}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                decision?.action === "insert"
                  ? "bg-primary-500 text-white border-primary-500"
                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary"
              }`}
            >
              {t("home:shopping.keepSeparate", { defaultValue: "Keep separate" })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const HomeEinkaufliste = ({ session }) => {
  const reducedMotion = useReducedMotion();
  const userId = session?.user?.id;
  const { locale } = useLocale();
  const activeLocale = normalizeContentLocale(locale);
  const { t, i18n } = useTranslation(["home", "common"]);
  const toast = useToast();
  const { isMobile } = useViewport();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("einkaufliste");

  const [loading, setLoading] = useState(true);
  const [eintraege, setEintraege] = useState([]);
  const [fehler, setFehler] = useState("");
  const [spracheAktiv, setSpracheAktiv] = useState(false);
  const recognitionRef = useRef(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Alle");
  const [sortMode, setSortMode] = useState("Markt");
  const [showCompleted, setShowCompleted] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createText, setCreateText] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [previewState, setPreviewState] = useState(null);
  const [previewAusgeschlossen, setPreviewAusgeschlossen] = useState(new Set());
  const [previewEdits, setPreviewEdits] = useState({});

  const [editForm, setEditForm] = useState(DEFAULT_EDIT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [stockDecision, setStockDecision] = useState(null);
  const translationAttemptsRef = useRef(new Set());
  const stockDecisionResolverRef = useRef(null);

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

  useEffect(() => {
    if (!userId || eintraege.length === 0) return;
    const missingEntries = eintraege.filter((entry) => {
      const key = `${entry.id}:${activeLocale}`;
      return !hasLocalizedShoppingContent(entry, activeLocale) && !translationAttemptsRef.current.has(key);
    });

    if (missingEntries.length === 0) return;
    missingEntries.forEach((entry) => translationAttemptsRef.current.add(`${entry.id}:${activeLocale}`));

    translateShoppingEntriesIfMissing({ supabase, userId, entries: missingEntries, locale: activeLocale })
      .then((updatedEntries) => {
        if (!updatedEntries?.length) return;
        const updatedById = new Map(updatedEntries.map((entry) => [entry.id, entry]));
        setEintraege((current) =>
          normalizeEntries(current.map((item) => updatedById.get(item.id) || item))
        );
      })
      .catch((err) => console.warn("Einkaufslistenuebersetzung fehlgeschlagen", err));
  }, [activeLocale, eintraege, userId]);

  const resetCreateFlow = () => {
    setCreateText("");
    setCreateModalOpen(false);
    setPreviewState(null);
  };

  const closeEditModal = () => setEditForm(DEFAULT_EDIT_FORM);

  const openEditModal = (entry) => {
    const normalizedEntry = applyLegacyShoppingFields(entry);
    const display = resolveLocalizedShoppingEntry(normalizedEntry, activeLocale);
    setEditForm({
      id: normalizedEntry.id,
      name: display.name || normalizedEntry.name || "",
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
      setPreviewAusgeschlossen(new Set());
      setPreviewEdits({});
      setCreateModalOpen(false);
    } catch (error) {
      console.error("Fehler beim Vorbereiten des Einkaufs-Batches", error);
      setFehler("Einträge konnten nicht vorbereitet werden.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleSpracheStarten = () => {
    if (spracheAktiv) {
      recognitionRef.current?.stop();
      setSpracheAktiv(false);
      return;
    }
    setSpracheAktiv(true);
    recognitionRef.current = startSpeechRecognition(
      (transcript) => {
        setCreateText((prev) => prev ? prev + ", " + transcript : transcript);
        setSpracheAktiv(false);
      },
      (err) => {
        toast.error(err);
        setSpracheAktiv(false);
      },
      locale
    );
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

  const handleToggleAblehnen = (clientId) => {
    setPreviewAusgeschlossen((prev) => {
      const s = new Set(prev);
      s.has(clientId) ? s.delete(clientId) : s.add(clientId);
      return s;
    });
  };

  const handleEditSpeichern = (clientId, edits) => {
    setPreviewEdits((prev) => ({ ...prev, [clientId]: edits }));
  };

  const commitPreview = async () => {
    if (!previewState || !userId) return;
    setSubmittingCreate(true);
    setFehler("");
    try {
      const draftsGefiltert = previewState.drafts
        .filter((d) => !previewAusgeschlossen.has(d.client_id))
        .map((d) => ({ ...d, ...(previewEdits[d.client_id] ?? {}) }));

      const result = await applyShoppingBatch({
        userId,
        drafts: draftsGefiltert,
        decisions: previewState.decisions,
        locale: activeLocale,
      });

      const neueEintraege = draftsGefiltert.filter(
        (draft) => previewState.decisions[draft.client_id]?.action !== "merge",
      );

      if (neueEintraege.length > 0) {
        await notifyHouseholdBatchEvent({
          userId,
          table: "home_einkaufliste",
          action: "erstellt",
          eintraege: neueEintraege.map((draft) => ({
            datensatz_name: draft.name || draft.original_text || "Einkaufsartikel",
          })),
          url: "/home/einkaufsliste",
          tag: `shopping-batch-${Date.now()}`,
        });
      }

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

    if (erledigt) {
      try {
        const vorratId = await uebernehmeLebensmittelInVorrat(entry);
        if (vorratId && !entry.vorrat_id) {
          const { error: linkError } = await supabase
            .from("home_einkaufliste")
            .update({ vorrat_id: vorratId })
            .eq("id", entry.id);

          if (linkError) throw linkError;

          setEintraege((current) =>
            normalizeEntries(
              current.map((item) =>
                item.id === entry.id
                  ? {
                      ...item,
                      vorrat_id: vorratId,
                    }
                  : item
              )
            )
          );
        }
      } catch (stockError) {
        console.error("Einkaufsartikel konnte nicht in Vorräte übernommen werden", stockError);
        toast.error("Artikel wurde abgehakt, aber nicht in die Vorräte übernommen.");
      }
    }

    await notifyHouseholdEvent({
      userId,
      table: "home_einkaufliste",
      action: "geaendert",
      recordName: entry.name || entry.original_text,
      recordId: entry.id,
      url: "/home/einkaufsliste",
      tag: `shopping-status-${entry.id}-${erledigt ? "done" : "open"}`,
      pushPolicy: "always",
      title: erledigt ? "Einkaufsartikel erledigt" : "Einkaufsartikel wieder offen",
      body: erledigt
        ? `"${entry.name || entry.original_text}" wurde abgehakt.`
        : `"${entry.name || entry.original_text}" ist wieder offen.`,
    });

    toast.success(erledigt ? "Artikel abgehakt." : "Artikel wieder geöffnet.");
  };

  const loesche = async (id) => {
    const eintrag = eintraege.find((item) => item.id === id);
    const { error } = await supabase.from("home_einkaufliste").delete().eq("id", id);
    if (error) {
      console.error("Fehler beim Löschen", error);
      toast.error("Eintrag konnte nicht gelöscht werden.");
      return;
    }

    await notifyHouseholdEvent({
      userId,
      table: "home_einkaufliste",
      action: "geloescht",
      recordName: eintrag?.name || eintrag?.original_text,
      recordId: id,
      url: "/home/einkaufsliste",
    });

    setEintraege((current) => current.filter((entry) => entry.id !== id));
    toast.success("Eintrag gelöscht.");
  };

  const loescheErledigt = async () => {
    if (!window.confirm("Alle erledigten Einkaufsartikel löschen?")) return;
    const erledigteEintraege = eintraege.filter((entry) => entry.erledigt);

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

    if (erledigteEintraege.length > 0) {
      await notifyHouseholdBatchEvent({
        userId,
        table: "home_einkaufliste",
        action: "geloescht",
        eintraege: erledigteEintraege.map((entry) => ({
          datensatz_name: entry.name || entry.original_text || "Einkaufsartikel",
        })),
        url: "/home/einkaufsliste",
        tag: `shopping-delete-completed-${Date.now()}`,
      });
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
        ...(activeLocale === "de"
          ? {
              name: editForm.name.trim(),
              original_text: editForm.name.trim(),
              normalized_name: normalizeShoppingName(editForm.name),
            }
          : {
              localized_content: {
                ...((eintraege.find((entry) => entry.id === editForm.id)?.localized_content) || {}),
                [activeLocale]: {
                  name: editForm.name.trim(),
                  original_text: editForm.name.trim(),
                },
              },
            }),
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

      if (activeLocale === "de") {
        try {
          await saveShoppingCorrection({
            entry: persistedPayload,
            userId,
          });
        } catch (correctionError) {
          console.warn("Einkaufskorrektur konnte nicht gespeichert werden", correctionError);
        }
      }

      await notifyHouseholdEvent({
        userId,
        table: "home_einkaufliste",
        action: "geaendert",
        recordName: persistedPayload.name || editForm.name.trim(),
        recordId: editForm.id,
        url: "/home/einkaufsliste",
        push: false,
      });

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

  const frageVorratUebernahme = ({ vorrat, name, menge, einheit }) =>
    new Promise((resolve) => {
      stockDecisionResolverRef.current = resolve;
      setStockDecision({
        name: vorrat.name || name,
        bestand: Number(vorrat.bestand || 0),
        menge,
        einheit,
      });
    });

  const resolveStockDecision = (decision) => {
    const resolver = stockDecisionResolverRef.current;
    stockDecisionResolverRef.current = null;
    setStockDecision(null);
    resolver?.(decision);
  };

  const uebernehmeLebensmittelInVorrat = async (entry) => {
    if (!userId) return null;

    const normalizedEntry = applyLegacyShoppingFields(entry);
    if (normalizedEntry.hauptkategorie !== "Lebensmittel") return null;

    const display = resolveLocalizedShoppingEntry(normalizedEntry, activeLocale);
    const name =
      normalizeShoppingName(display.name || normalizedEntry.name || normalizedEntry.original_text) ||
      "Lebensmittel";
    const einheit = normalizeUnit(normalizedEntry.einheit) || normalizedEntry.einheit || "Stück";
    const menge = Number(normalizedEntry.menge) > 0 ? Number(normalizedEntry.menge) : 1;

    const updateVorrat = async (vorrat) => {
      const decision = await frageVorratUebernahme({ vorrat, name, menge, einheit });
      const nextBestand = decision === "add" ? Number(vorrat.bestand || 0) + menge : menge;
      const { data, error } = await supabase
        .from("home_vorraete")
        .update({
          bestand: nextBestand,
          einheit: vorrat.einheit || einheit,
          kategorie: "Lebensmittel",
        })
        .eq("id", vorrat.id)
        .eq("user_id", userId)
        .select("id")
        .single();

      if (error) throw error;
      return data?.id || vorrat.id;
    };

    if (normalizedEntry.vorrat_id) {
      const { data, error } = await supabase
        .from("home_vorraete")
        .select("id,name,einheit,bestand,kategorie")
        .eq("id", normalizedEntry.vorrat_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) return updateVorrat(data);
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("home_vorraete")
      .select("id,name,einheit,bestand,kategorie")
      .eq("user_id", userId)
      .eq("kategorie", "Lebensmittel");

    if (existingError) throw existingError;

    const nameKey = normalizeShoppingName(name).toLowerCase();
    const unitKey = normalizeUnit(einheit) || einheit;
    const match = (existingRows || []).find((vorrat) => {
      const existingNameKey = normalizeShoppingName(vorrat.name).toLowerCase();
      const existingUnitKey = normalizeUnit(vorrat.einheit) || vorrat.einheit;
      return existingNameKey === nameKey && existingUnitKey === unitKey;
    });

    if (match) return updateVorrat(match);

    const { data: created, error: createError } = await supabase
      .from("home_vorraete")
      .insert({
        user_id: userId,
        name,
        kategorie: "Lebensmittel",
        einheit,
        bestand: menge,
        mindestmenge: 1,
        notizen: "Aus Einkaufsliste übernommen.",
      })
      .select("id")
      .single();

    if (createError) throw createError;
    return created?.id || null;
  };

  const localizedEintraege = eintraege.map((entry) => {
    const display = resolveLocalizedShoppingEntry(entry, activeLocale);
    return { ...entry, display_name: display.name, display_notizen: display.notes };
  });
  const gefilterteEintraege = filterShoppingEntries(localizedEintraege, {
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
    <div className="home-glass-modern glass-module relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
            <ShoppingCart size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
                {t("home:shopping.title", { defaultValue: "Shopping list" })}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
                {t("home:shopping.openCount", { count: eintraege.filter((entry) => !entry.erledigt).length, defaultValue: "{{count}} open" })}
              </span>
            </div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("home:shopping.subtitle", { defaultValue: "Market order, review hints and batch entry in one flow." })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {eintraege.some((entry) => entry.erledigt) && (
            <button
              onClick={loescheErledigt}
              className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            >
              {t("home:shopping.deleteCompleted", { defaultValue: "Delete completed" })}
            </button>
          )}
          <button
            data-tour="tour-einkauf-hinzufuegen"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors"
          >
            <Plus size={15} />
            <span>{t("common:actions.add")}</span>
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
        <GlassSurface
          interactive={false}
          data-tour="tour-einkauf-suche"
          className="flex items-center gap-3 px-4 py-3"
        >
          <Search size={17} className="text-light-text-secondary dark:text-dark-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("home:shopping.searchPlaceholder", { defaultValue: "Search item, category or subcategory" })}
            className="w-full bg-transparent outline-none text-sm text-light-text-main dark:text-dark-text-main placeholder:text-light-text-secondary dark:placeholder:text-dark-text-secondary"
          />
        </GlassSurface>

        {isMobile ? (
          <div className="grid grid-cols-2 gap-2">
            <div data-tour="tour-einkauf-sort" className="relative">
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                aria-label={t("home:shopping.selectSort", { defaultValue: "Select sort order" })}
                className="w-full appearance-none rounded-pill border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 pl-3 pr-9 py-2.5 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:border-primary-500"
              >
                {SHOPPING_SORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {getShoppingUiLabel(mode, i18n.language)}
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
                aria-label={t("home:shopping.selectFilter", { defaultValue: "Select filter" })}
                className="w-full appearance-none rounded-pill border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 pl-3 pr-9 py-2.5 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:border-primary-500"
              >
                {filterOptions.map((option) => (
                  <option key={option} value={option}>
                    {getShoppingUiLabel(option, i18n.language)}
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
                  {getShoppingUiLabel(mode, i18n.language)}
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
                  {getShoppingUiLabel(option, i18n.language)}
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
              {t("home:shopping.sort", { defaultValue: "Sort" })}: {getShoppingUiLabel(sortMode, i18n.language)}
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
              {t("home:shopping.filter", { defaultValue: "Filter" })}: {getShoppingUiLabel(filter, i18n.language)}
              <button onClick={() => setFilter("Alle")} className="hover:text-amber-500">
                <X size={10} />
              </button>
            </span>
          )}

          <button
            onClick={resetListenFilter}
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main underline underline-offset-2"
          >
            {t("common:actions.reset", { defaultValue: "Reset" })}
          </button>
        </div>
      )}

      <motion.div
        data-tour="tour-einkauf-liste"
        variants={reducedMotion ? {} : glassPageVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {gruppen.length === 0 && erledigteEintraege.length === 0 && (
          <GlassSurface interactive={false} className="border-dashed p-8 text-center">
            <ShoppingCart
              size={36}
              className="mx-auto mb-3 text-light-text-secondary dark:text-dark-text-secondary opacity-50"
            />
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("home:shopping.emptyFilter", { defaultValue: "No entries for the current filter." })}
            </p>
          </GlassSurface>
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
                  {getShoppingUiLabel(gruppe.label, i18n.language)}
                </span>
                <span className="text-xs opacity-80">
                  {gruppe.items.length}
                </span>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {gruppe.items.map((entry) => (
                <GlassSurface
                  as="article"
                  key={entry.id}
                  layout
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3"
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
                              {resolveLocalizedShoppingEntry(entry, activeLocale).name}
                            </h3>
                            {getShoppingCategoryBadgeLabel(entry) && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getShoppingCategoryStyle(
                                  entry.hauptkategorie
                                ).soft}`}
                              >
                                {getShoppingUiLabel(getShoppingCategoryBadgeLabel(entry), i18n.language)}
                              </span>
                            )}
                            {entry.review_noetig && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                                <AlertTriangle size={12} />
                                {t("home:shopping.review", { defaultValue: "Review" })}
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
                            aria-label={t("home:shopping.editEntry", { defaultValue: "Edit entry" })}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => loesche(entry.id)}
                            className="p-2 rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:bg-red-500/10 hover:text-red-500"
                            aria-label={t("home:shopping.deleteEntry", { defaultValue: "Delete entry" })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlassSurface>
              ))}
            </AnimatePresence>
          </section>
        ))}

        {erledigteEintraege.length > 0 && (
          <GlassSurface as="section" className="overflow-hidden">
            <button
              onClick={() => setShowCompleted((current) => !current)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                  {t("home:shopping.completed", { defaultValue: "Done" })}
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("home:shopping.completedCount", { count: erledigteEintraege.length, defaultValue: "{{count}} recently checked off items" })}
                </p>
              </div>
              {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence initial={false}>
            {showCompleted && (
              <motion.div
                key="completed"
                variants={reducedMotion ? {} : glassCollapseVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="overflow-hidden"
              >
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
                        {resolveLocalizedShoppingEntry(entry, activeLocale).name}
                      </h3>
                      {getShoppingCategoryBadgeLabel(entry, true) && (
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getShoppingCategoryStyle(
                              entry.hauptkategorie
                            ).soft}`}
                          >
                            {getShoppingUiLabel(getShoppingCategoryBadgeLabel(entry, true), i18n.language)}
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
                      aria-label={t("home:shopping.deleteEntry", { defaultValue: "Delete entry" })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </GlassSurface>
        )}
      </motion.div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 pb-safe flex items-center justify-center">
          <div className={`${glassSurfaceClass} w-full max-w-2xl overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <div>
                <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                  {t("home:shopping.captureItems", { defaultValue: "Add items" })}
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("home:shopping.captureHint", { defaultValue: "Separate multiple entries with commas, semicolons or line breaks." })}
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
              <div className="relative">
                <textarea
                  value={createText}
                  onChange={(event) => setCreateText(event.target.value)}
                  placeholder={t("home:shopping.capturePlaceholder", { defaultValue: "Milk, bananas, chicken breast 500 g, kitchen roll" })}
                  className="w-full min-h-[180px] rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 pr-12 text-sm text-light-text-main dark:text-dark-text-main outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSpracheStarten}
                  title={spracheAktiv
                    ? t("home:shopping.stopRecording", { defaultValue: "Stop recording" })
                    : t("home:shopping.startVoiceInput", { defaultValue: "Start voice input" })}
                  className={`absolute bottom-3 right-3 p-2 rounded-full transition-colors ${
                    spracheAktiv
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 hover:bg-primary-500/10"
                  }`}
                >
                  {spracheAktiv ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("home:shopping.rawBeforeAnalysis", { count: splitShoppingInput(createText).length, defaultValue: "{{count}} raw entries before analysis" })}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={resetCreateFlow}
                    className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                  >
                    {t("common:actions.cancel")}
                  </button>
                  <button
                    onClick={handleCreateAnalyse}
                    disabled={submittingCreate}
                    className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
                  >
                    {submittingCreate && <Loader2 size={14} className="animate-spin" />}
                    <span>{t("home:shopping.analyse", { defaultValue: "Analyse" })}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewState && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 pb-safe flex items-center justify-center">
          <div className={`${glassSurfaceClass} w-full max-w-3xl overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <div>
                <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                  {t("home:shopping.previewTitle", { defaultValue: "Preview before saving" })}
                </h2>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("home:shopping.previewHint", { defaultValue: "Uncertain entries are marked. Duplicates can be merged." })}
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
              {previewState.drafts.map((draft) => (
                <EntryPreviewRow
                  key={draft.client_id}
                  draft={draft}
                  editedValues={previewEdits[draft.client_id]}
                  isAusgeschlossen={previewAusgeschlossen.has(draft.client_id)}
                  duplicate={previewState.duplicates.find((d) => d.client_id === draft.client_id)}
                  decision={previewState.decisions[draft.client_id] || { action: "insert" }}
                  onToggleAblehnen={handleToggleAblehnen}
                  onEditSpeichern={handleEditSpeichern}
                  onUpdateDecision={updatePreviewDecision}
                />
              ))}
            </div>

            {(() => {
              const aktiveAnzahl = previewState.drafts.filter(
                (d) => !previewAusgeschlossen.has(d.client_id)
              ).length;
              return (
                <div className="px-4 py-3 border-t border-light-border dark:border-dark-border flex items-center justify-between gap-3">
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {t("home:shopping.readyToSave", { count: aktiveAnzahl, defaultValue: "{{count}} entries ready to save" })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewState(null)}
                      className="px-3 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                    >
                      {t("common:actions.close")}
                    </button>
                    <button
                      onClick={commitPreview}
                      disabled={submittingCreate || aktiveAnzahl === 0}
                      className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
                    >
                      {submittingCreate && <Loader2 size={14} className="animate-spin" />}
                      <span>{t("common:actions.save")}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {stockDecision && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm p-4 pb-safe flex items-center justify-center">
          <div className={`${glassSurfaceClass} w-full max-w-md overflow-hidden`}>
            <div className="px-4 py-3 border-b border-light-border dark:border-dark-border">
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                Vorrat aktualisieren
              </h2>
              <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                "{stockDecision.name}" ist bereits in den Vorräten vorhanden.
              </p>
            </div>
            <div className="p-4 space-y-3 text-sm text-light-text-main dark:text-dark-text-main">
              <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
                Aktueller Bestand: {stockDecision.bestand} {stockDecision.einheit}
              </div>
              <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
                Gekauft: {stockDecision.menge} {stockDecision.einheit}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-light-border dark:border-dark-border flex justify-end gap-2">
              <button
                onClick={() => resolveStockDecision("replace")}
                className="px-4 py-2 rounded-pill text-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                Ersetzen
              </button>
              <button
                onClick={() => resolveStockDecision("add")}
                className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white"
              >
                Addieren
              </button>
            </div>
          </div>
        </div>
      )}

      {editForm.id && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 pb-safe flex items-center justify-center">
          <div className={`${glassSurfaceClass} w-full max-w-lg overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                {t("home:shopping.editItem", { defaultValue: "Edit shopping item" })}
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
                  {t("home:shopping.quantity", { defaultValue: "Quantity" })}
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
                  {t("home:shopping.unit", { defaultValue: "Unit" })}
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
                    {t("home:shopping.mainCategory", { defaultValue: "Main category" })}
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
                        {getShoppingUiLabel(category, i18n.language)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    {t("home:shopping.subcategory", { defaultValue: "Subcategory" })}
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
                    <option value="">{t("home:shopping.noSubcategory", { defaultValue: "No subcategory" })}</option>
                    {getSubcategoriesForMainCategory(editForm.hauptkategorie).map((category) => (
                      <option key={category} value={category}>
                        {getShoppingUiLabel(category, i18n.language)}
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
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleEditSave}
                disabled={savingEdit}
                className="px-4 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white flex items-center gap-2"
              >
                {savingEdit && <Loader2 size={14} className="animate-spin" />}
                <span>{t("common:actions.save")}</span>
              </button>
            </div>
          </div>
        </div>
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
