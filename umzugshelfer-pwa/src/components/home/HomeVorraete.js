import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Edit2,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import KiHomeAssistent from "./KiHomeAssistent";
import { useToast } from "../../hooks/useToast";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import { applySupplyAiItems } from "../../utils/assistantDomainAdapters";
import { applyShoppingBatch, prepareShoppingBatch } from "../../utils/einkaufslisteUtils";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";
import GlassSurface, { glassPageVariants, glassSurfaceClass } from "../ui/GlassSurface";

const KATEGORIEN = ["Haushalt", "Lebensmittel", "Hygiene", "Reinigung", "Technik", "Sonstiges"];
const EINHEITEN = [
  "Stück",
  "Packung",
  "Liter",
  "ml",
  "kg",
  "g",
  "Dose",
  "Flasche",
  "Rolle",
  "Sack",
  "Beutel",
  "Tüte",
  "Tube",
  "Glas",
  "Becher",
  "Kasten",
  "Karton",
  "Paar",
  "Satz",
];

const normalizeUnit = (value) => {
  const raw = String(value || "");
  if (raw === "Stueck" || raw === "Stück" || (raw.startsWith("St") && raw.endsWith("ck"))) return "Stück";
  if (raw === "Tuete" || raw === "Tüte" || (raw.startsWith("T") && raw.endsWith("te"))) return "Tüte";
  return value || "Stück";
};

const VorratForm = ({ initial, onSpeichern, onAbbrechen }) => {
  const { t } = useTranslation(["home", "common"]);
  const [form, setForm] = useState({
    name: initial?.name || "",
    kategorie: initial?.kategorie || "Haushalt",
    einheit: normalizeUnit(initial?.einheit),
    bestand: initial?.bestand ?? 0,
    mindestmenge: initial?.mindestmenge ?? 1,
    ablaufdatum: initial?.ablaufdatum || "",
    notizen: initial?.notizen || "",
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
          {t("home:stockForm.form.item")}
        </label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder={t("home:stockForm.form.itemPlaceholder")}
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:stockForm.form.category")}
          </label>
          <select
            value={form.kategorie}
            onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            {KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {t(`home:stockForm.categories.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:stockForm.form.unit")}
          </label>
          <select
            value={form.einheit}
            onChange={(e) => setForm((p) => ({ ...p, einheit: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            {EINHEITEN.map((e) => (
              <option key={e} value={e}>
                {t(`home:stockForm.units.${e}`, { defaultValue: e })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:stockForm.form.current")}
          </label>
          <input type="number" min="0" step="0.5" value={form.bestand} onChange={(e) => setForm((p) => ({ ...p, bestand: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:stockForm.form.minimum")}
          </label>
          <input type="number" min="0" step="0.5" value={form.mindestmenge} onChange={(e) => setForm((p) => ({ ...p, mindestmenge: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
          {t("home:stockForm.form.expiry")}
        </label>
        <input type="date" value={form.ablaufdatum} onChange={(e) => setForm((p) => ({ ...p, ablaufdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAbbrechen} className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main">
          {t("common:actions.cancel")}
        </button>
        <button onClick={() => form.name.trim() && onSpeichern(form)} className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50" disabled={!form.name.trim()}>
          {t("common:actions.save")}
        </button>
      </div>
    </div>
  );
};

const HomeVorraete = ({ session }) => {
  const { t } = useTranslation(["home", "common"]);
  const reducedMotion = useReducedMotion();
  const userId = session?.user?.id;
  const toast = useToast();
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("vorraete");
  const [loading, setLoading] = useState(true);
  const [vorraete, setVorraete] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [kategFilter, setKategFilter] = useState("");
  const [kiOffen, setKiOffen] = useState(false);
  const unitLabel = useCallback(
    (value) => t(`home:stockForm.units.${normalizeUnit(value)}`, { defaultValue: value || "" }),
    [t],
  );

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
      setVorraete((data || []).map((entry) => ({ ...entry, einheit: normalizeUnit(entry.einheit) })));
    } catch (e) {
      setFehler(t("home:stockForm.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const buildVorratPayload = (daten, includeUser = false) => ({
    ...(includeUser ? { user_id: userId } : {}),
    name: String(daten.name || "").trim(),
    kategorie: daten.kategorie || "Haushalt",
    einheit: normalizeUnit(daten.einheit),
    bestand: Number.isFinite(Number(daten.bestand)) ? Number(daten.bestand) : 0,
    mindestmenge: Number.isFinite(Number(daten.mindestmenge)) ? Number(daten.mindestmenge) : 1,
    ablaufdatum: daten.ablaufdatum || null,
    notizen: daten.notizen?.trim() || null,
  });

  const speichere = async (daten) => {
    try {
      if (modal?.id) {
        const payload = buildVorratPayload(daten, false);
        const { error } = await supabase.from("home_vorraete").update(payload).eq("id", modal.id);
        if (error) throw error;
        await notifyHouseholdEvent({
          userId,
          table: "home_vorraete",
          action: "geaendert",
          recordName: payload.name,
          recordId: modal.id,
          url: "/home/vorraete",
          push: false,
        });
      } else {
        const payload = buildVorratPayload(daten, true);
        const { data: neuerVorrat, error } = await supabase
          .from("home_vorraete")
          .insert(payload)
          .select("id, name")
          .single();
        if (error) throw error;
        await notifyHouseholdEvent({
          userId,
          table: "home_vorraete",
          action: "erstellt",
          recordName: neuerVorrat?.name || payload.name,
          recordId: neuerVorrat?.id,
          url: "/home/vorraete",
        });
      }
      setModal(null);
      await ladeDaten();
      toast.success(t("common:feedback.saved", { defaultValue: "Gespeichert." }));
    } catch (error) {
      console.error("Vorrat konnte nicht gespeichert werden", error);
      setFehler(error?.message || t("home:stockForm.saveError", { defaultValue: "Vorrat konnte nicht gespeichert werden." }));
      toast.error(t("home:stockForm.saveError", { defaultValue: "Vorrat konnte nicht gespeichert werden." }));
    }
  };

  const loesche = async (id) => {
    const vorrat = vorraete.find((eintrag) => eintrag.id === id);
    await supabase.from("home_vorraete").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "home_vorraete",
      action: "geloescht",
      recordName: vorrat?.name,
      recordId: id,
      url: "/home/vorraete",
    });
    ladeDaten();
  };

  const erstelleEinkaufslisteFuerRote = async () => {
    const rote = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge));
    if (rote.length === 0) return;
    try {
      const rawItems = rote.map((v) => ({
        original_text: `${v.name} ${Number(v.mindestmenge) - Number(v.bestand)} ${unitLabel(v.einheit)}`.trim(),
        name: v.name,
        menge: Number(v.mindestmenge) - Number(v.bestand),
        einheit: v.einheit,
        kategorie: v.kategorie,
        vorrat_id: v.id,
      }));

      const result = await prepareShoppingBatch({ rawItems, userId, source: "vorrat" });
      const decisions = {};
      result.duplicates.forEach((duplicate) => {
        decisions[duplicate.client_id] = { action: "merge", existingEntry: duplicate.existing_entry };
      });
      const persisted = await applyShoppingBatch({ userId, drafts: result.drafts, decisions });

      const parts = [];
      if (persisted.inserted > 0) parts.push(t("home:stockForm.shoppingInserted", { count: persisted.inserted }));
      if (persisted.merged > 0) parts.push(t("home:stockForm.shoppingMerged", { count: persisted.merged }));
      toast.success(t("home:stockForm.shoppingUpdated", { details: parts.length ? `: ${parts.join(", ")}` : "" }));
    } catch (error) {
      console.error("Fehler beim Uebertragen auf die Einkaufsliste", error);
      toast.error(t("home:stockForm.shoppingError"));
    }
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
  const gefiltertVorraete = vorraete.filter((v) => !kategFilter || v.kategorie === kategFilter);
  const rot = vorraete.filter((v) => Number(v.bestand) < Number(v.mindestmenge));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
      </div>
    );
  }

  return (
    <div className="home-glass-modern glass-module relative min-h-full min-w-0 max-w-full space-y-4 overflow-x-clip bg-transparent p-4 pb-28 md:p-6 lg:pb-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ShoppingCart size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">{t("home:stockForm.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {rot.length > 0 && (
            <button data-tour="tour-vorraete-einkauf" onClick={erstelleEinkaufslisteFuerRote} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-pill text-sm font-medium">
              <ShoppingCart size={14} />
              {t("home:stockForm.addLowToShopping", { count: rot.length })}
            </button>
          )}
          <button onClick={() => setKiOffen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30 transition-colors" title={t("home:stockForm.aiTitle")}>
            <Sparkles size={15} />
            <span className="hidden sm:inline">KI</span>
          </button>
          <button data-tour="tour-vorraete-hinzufuegen" onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium">
            <Plus size={14} />
            {t("home:stockForm.newShort")}
          </button>
        </div>
      </div>

      {fehler && (
        <div className="mb-4 p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />{fehler}
        </div>
      )}

      <motion.div variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: t("home:stockForm.status.restock"), count: rot.length, farbe: "red" },
          { label: t("home:stockForm.status.low"), count: vorraete.filter((v) => { const b = Number(v.bestand); const m = Number(v.mindestmenge); return b >= m && b < m * 1.2; }).length, farbe: "amber" },
          { label: t("home:stockForm.status.ok"), count: vorraete.filter((v) => Number(v.bestand) >= Number(v.mindestmenge) * 1.2).length, farbe: "green" },
        ].map((s) => (
          <GlassSurface key={s.label} className={`p-3 text-center ${s.farbe === "red" ? "border-red-500/30" : s.farbe === "amber" ? "border-amber-500/30" : "border-primary-500/30"}`}>
            <div className={`text-2xl font-bold ${s.farbe === "red" ? "text-red-600 dark:text-red-400" : s.farbe === "amber" ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>{s.count}</div>
            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{s.label}</div>
          </GlassSurface>
        ))}
      </motion.div>

      <div data-tour="tour-vorraete-filter" className={`${glassSurfaceClass} flex gap-2 flex-wrap mb-4 p-3`}>
        <button onClick={() => setKategFilter("")} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${!kategFilter ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{t("home:stockForm.all")}</button>
        {KATEGORIEN.map((k) => (
          <button key={k} onClick={() => setKategFilter(k)} className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${kategFilter === k ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{t(`home:stockForm.categories.${k}`)}</button>
        ))}
      </div>

      {gefiltertVorraete.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("home:stockForm.empty")}</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm">
            <Plus size={14} />{t("home:stockForm.createFirst")}
          </button>
        </div>
      ) : (
        <motion.div data-tour="tour-vorraete-liste" variants={reducedMotion ? {} : glassPageVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {gefiltertVorraete.map((v) => {
            const beinaheAbgelaufen = v.ablaufdatum && v.ablaufdatum <= inSiebenTagen && v.ablaufdatum >= heute;
            const abgelaufen = v.ablaufdatum && v.ablaufdatum < heute;
            const einheitLabel = unitLabel(v.einheit);
            return (
              <GlassSurface key={v.id} className="flex min-w-0 items-center gap-3 p-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ampelKlasse(v)}`} title={`${t("home:stockForm.form.current")}: ${v.bestand} ${einheitLabel}, ${t("home:stockForm.form.minimum")}: ${v.mindestmenge}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm text-light-text-main dark:text-dark-text-main">{v.name}</h3>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary rounded-pill px-2 py-0.5 bg-light-border dark:bg-dark-border">{t(`home:stockForm.categories.${v.kategorie}`, { defaultValue: v.kategorie })}</span>
                    {(beinaheAbgelaufen || abgelaufen) && (
                      <span className={`flex items-center gap-0.5 text-xs ${abgelaufen ? "text-red-500" : "text-amber-500"}`}>
                        <AlertTriangle size={11} />
                        {abgelaufen ? t("home:stockForm.expired") : t("home:stockForm.expiresSoon")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {Number(v.bestand)} / {Number(v.mindestmenge)} {einheitLabel}
                    {v.ablaufdatum && <span className="ml-2">{t("home:stockForm.bestBefore")}: {v.ablaufdatum}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal(v)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><Edit2 size={13} /></button>
                  <button onClick={() => loesche(v.id)} className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              </GlassSurface>
            );
          })}
        </motion.div>
      )}

      {modal !== null && (
        <div className="mobile-modal-overlay fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${glassSurfaceClass} mobile-modal-dialog max-w-md w-full flex min-h-0 flex-col`}>
            <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border sticky top-0 bg-light-card dark:bg-canvas-2">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">{modal.id ? t("home:stockForm.edit") : t("home:stockForm.new")}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary"><X size={18} /></button>
            </div>
            <div className="mobile-modal-body p-4">
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
            await applySupplyAiItems({ session, items });
            await ladeDaten();
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
