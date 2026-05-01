import React, { useState, useEffect, useCallback } from "react";
import { useRef, useImperativeHandle, forwardRef } from "react";
import { CheckSquare, Plus, Trash2, Check, Loader2, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient";
import { getBewohnerDisplayName } from "../../utils/budgetAccounts";
import KiHomeAssistent from "./KiHomeAssistent";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import ModalShell from "../ui/ModalShell";
import { applyHomeTaskAiItems } from "../../utils/assistantDomainAdapters";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";

const KATEGORIEN = ["Reinigung", "Pflege", "Garten", "Einkauf", "Reparatur", "Wartung", "Organisation", "Sonstiges"];
const PRIORITAETEN = ["Hoch", "Mittel", "Niedrig"];
const WIEDERHOLUNG = ["Keine", "Taeglich", "Woechentlich", "Monatlich", "Jaehrlich"];

const REPEAT_KEY_BY_VALUE = {
  Keine: "Keine",
  Taeglich: "Taeglich",
  "Täglich": "Taeglich",
  "T?glich": "Taeglich",
  Woechentlich: "Woechentlich",
  "Wöchentlich": "Woechentlich",
  "W?chentlich": "Woechentlich",
  Monatlich: "Monatlich",
  Jaehrlich: "Jaehrlich",
  "Jährlich": "Jaehrlich",
  "J?hrlich": "Jaehrlich",
};

function taskLabel(t, group, value) {
  if (!value) return value;
  const key = group === "repeat" ? REPEAT_KEY_BY_VALUE[value] || value : value;
  return t(`home:householdTasks.${group}.${key}`, { defaultValue: value });
}

const BewohnerBadge = ({ bewohner }) => {
  if (!bewohner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${bewohner.farbe}22`, color: bewohner.farbe }}
    >
      {bewohner.emoji} {getBewohnerDisplayName(bewohner)}
    </span>
  );
};

const AufgabeForm = forwardRef(({ initial, onSpeichern, bewohner, onValidityChange }, ref) => {
  const { t } = useTranslation(["home", "common"]);
  const [form, setForm] = useState({
    beschreibung: initial?.beschreibung || "",
    kategorie: initial?.kategorie || "Reinigung",
    prioritaet: initial?.prioritaet || "Mittel",
    faelligkeitsdatum: initial?.faelligkeitsdatum ? initial.faelligkeitsdatum.split("T")[0] : "",
    wiederholung_typ: initial?.wiederholung_typ || "Keine",
    bewohner_id: initial?.bewohner_id || "",
    app_modus: "home",
  });
  const kannSpeichern = form.beschreibung.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(kannSpeichern);
  }, [kannSpeichern, onValidityChange]);

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!kannSpeichern) return;
      onSpeichern({
        ...form,
        faelligkeitsdatum: form.faelligkeitsdatum ? `${form.faelligkeitsdatum}T12:00:00` : null,
        bewohner_id: form.bewohner_id || null,
      });
    },
  }), [form, kannSpeichern, onSpeichern]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
          {t("home:householdTasks.form.task")}
        </label>
        <input
          value={form.beschreibung}
          onChange={(e) => setForm((p) => ({ ...p, beschreibung: e.target.value }))}
          placeholder={t("home:householdTasks.form.taskPlaceholder")}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:householdTasks.form.category")}
          </label>
          <select value={form.kategorie} onChange={(e) => setForm((p) => ({ ...p, kategorie: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {KATEGORIEN.map((k) => <option key={k} value={k}>{taskLabel(t, "categories", k)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:householdTasks.form.priority")}
          </label>
          <select value={form.prioritaet} onChange={(e) => setForm((p) => ({ ...p, prioritaet: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {PRIORITAETEN.map((p) => <option key={p} value={p}>{taskLabel(t, "priorities", p)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:householdTasks.form.dueDate")}
          </label>
          <input type="date" value={form.faelligkeitsdatum} onChange={(e) => setForm((p) => ({ ...p, faelligkeitsdatum: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:householdTasks.form.repeat")}
          </label>
          <select value={form.wiederholung_typ} onChange={(e) => setForm((p) => ({ ...p, wiederholung_typ: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none">
            {WIEDERHOLUNG.map((w) => <option key={w} value={w}>{taskLabel(t, "repeat", w)}</option>)}
          </select>
        </div>
      </div>
      {bewohner.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            {t("home:householdTasks.form.assignee")}
          </label>
          <select
            value={form.bewohner_id}
            onChange={(e) => setForm((p) => ({ ...p, bewohner_id: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none"
          >
            <option value="">{t("home:householdTasks.form.unassigned")}</option>
            {bewohner.map((b) => (
              <option key={b.id} value={b.id}>{b.emoji} {getBewohnerDisplayName(b)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
});

const HomeHaushaltsaufgaben = ({ session }) => {
  const { t } = useTranslation(["home", "common"]);
  const userId = session?.user?.id;
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("aufgaben");
  const [loading, setLoading] = useState(true);
  const [aufgaben, setAufgaben] = useState([]);
  const [bewohner, setBewohner] = useState([]);
  const [modal, setModal] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [kategFilter, setKategFilter] = useState("");
  const [bewohnerFilter, setBewohnerFilter] = useState("");
  const [kiOffen, setKiOffen] = useState(false);
  const [modalKannSpeichern, setModalKannSpeichern] = useState(false);
  const aufgabeFormRef = useRef(null);

  const ladeDaten = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("todo_aufgaben")
        .select("*")
        .eq("user_id", userId)
        .in("app_modus", ["home", "beides"])
        .order("erledigt")
        .order("faelligkeitsdatum", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAufgaben(data || []);
    } catch (e) {
      setFehler(t("home:householdTasks.loadError"));
    } finally {
      setLoading(false);
    }

    supabase.rpc("get_bewohner_overview").then(({ data, error }) => {
      if (!error && Array.isArray(data)) {
        setBewohner(data.map((b) => ({
          id: b.id,
          name: b.name || t("home:residents"),
          display_name: b.display_name || b.name || t("home:residents"),
          emoji: b.emoji || "\uD83D\uDC64",
          farbe: b.farbe || "#10B981",
          is_current_user: b.is_current_user === true,
        })));
      }
    });
  }, [userId, t]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const speichere = async (daten) => {
    const payload = { ...daten, user_id: userId };
    if (modal?.id) {
      await supabase.from("todo_aufgaben").update(daten).eq("id", modal.id);
      await notifyHouseholdEvent({
        userId,
        table: "todo_aufgaben",
        action: "geaendert",
        recordName: daten.beschreibung,
        recordId: modal.id,
        push: false,
      });
    } else {
      const { data: neueAufgabe } = await supabase
        .from("todo_aufgaben")
        .insert(payload)
        .select("id, beschreibung")
        .single();

      await notifyHouseholdEvent({
        userId,
        table: "todo_aufgaben",
        action: "erstellt",
        recordName: neueAufgabe?.beschreibung || daten.beschreibung,
        recordId: neueAufgabe?.id,
        url: "/home/aufgaben",
        tag: `aufgabe-neu-${neueAufgabe?.id || Date.now()}`,
      });
    }
    setModal(null);
    ladeDaten();
  };

  const toggleErledigt = async (a) => {
    const neuerWert = !a.erledigt;
    setAufgaben((prev) =>
      prev.map((item) => item.id === a.id ? { ...item, erledigt: neuerWert } : item)
    );
    await supabase.from("todo_aufgaben").update({ erledigt: neuerWert }).eq("id", a.id);
    await notifyHouseholdEvent({
      userId,
      table: "todo_aufgaben",
      action: "geaendert",
      recordName: a.beschreibung,
      recordId: a.id,
      url: "/home/aufgaben",
      tag: `aufgabe-status-${a.id}-${neuerWert ? "done" : "open"}`,
      pushPolicy: "always",
      title: neuerWert ? t("home:householdTasks.notifications.doneTitle") : t("home:householdTasks.notifications.openTitle"),
      body: neuerWert
        ? t("home:householdTasks.notifications.doneBody", { task: a.beschreibung })
        : t("home:householdTasks.notifications.openBody", { task: a.beschreibung }),
    });
  };

  const loesche = async (id) => {
    if (!window.confirm(t("home:householdTasks.deleteConfirm"))) return;
    const ziel = aufgaben.find((eintrag) => eintrag.id === id);
    await supabase.from("todo_aufgaben").delete().eq("id", id);
    await notifyHouseholdEvent({
      userId,
      table: "todo_aufgaben",
      action: "geloescht",
      recordName: ziel?.beschreibung,
      recordId: id,
      url: "/home/aufgaben",
      tag: `aufgabe-delete-${id}`,
    });
    ladeDaten();
  };

  const prioritaetFarbe = (p) => {
    if (p === "Hoch") return "text-red-500";
    if (p === "Mittel") return "text-amber-500";
    return "text-primary-500";
  };

  const heute = new Date().toISOString().split("T")[0];

  const gefilterteAufgaben = aufgaben.filter((a) => {
    if (kategFilter && a.kategorie !== kategFilter) return false;
    if (bewohnerFilter && a.bewohner_id !== bewohnerFilter) return false;
    return true;
  });

  const offen = gefilterteAufgaben.filter((a) => !a.erledigt);
  const erledigt = gefilterteAufgaben.filter((a) => a.erledigt);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare size={22} className="text-primary-500" />
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main truncate">{t("home:householdTasks.title")}</h1>
          {offen.length > 0 && <span className="px-2 py-0.5 rounded-pill bg-red-500 text-white text-xs font-bold">{offen.length}</span>}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button onClick={() => setKiOffen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium
                       bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                       border border-primary-500/30 transition-colors">
            <Sparkles size={15} /><span className="hidden sm:inline">AI</span>
          </button>
          <button data-tour="tour-aufgaben-hinzufuegen" onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm font-medium whitespace-nowrap shrink-0">
            <Plus size={14} />
            <span className="hidden sm:inline">{t("home:householdTasks.new")}</span>
            <span className="sm:hidden">{t("home:householdTasks.newShort")}</span>
          </button>
        </div>
      </div>

      {fehler && <div className="p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} />{fehler}</div>}

      <div data-tour="tour-aufgaben-filter" className="flex gap-2 flex-wrap">
        <button onClick={() => setKategFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!kategFilter ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{t("home:householdTasks.all")}</button>
        {KATEGORIEN.map((k) => (
          <button key={k} onClick={() => setKategFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${kategFilter === k ? "bg-primary-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}>{taskLabel(t, "categories", k)}</button>
        ))}
      </div>

      {bewohner.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setBewohnerFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!bewohnerFilter ? "bg-teal-500 text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
          >
            {t("home:householdTasks.allPeople")}
          </button>
          {bewohner.map((b) => (
            <button
              key={b.id}
              onClick={() => setBewohnerFilter(b.id)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${bewohnerFilter === b.id ? "text-white" : "bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"}`}
              style={bewohnerFilter === b.id ? { backgroundColor: b.farbe } : {}}
            >
              {b.emoji} {getBewohnerDisplayName(b)}
            </button>
          ))}
        </div>
      )}

      {gefilterteAufgaben.length === 0 ? (
        <div className="text-center py-12 text-light-text-secondary dark:text-dark-text-secondary">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("home:householdTasks.empty")}</p>
          <button onClick={() => setModal({})} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"><Plus size={14} />{t("home:householdTasks.createFirst")}</button>
        </div>
      ) : (
        <div data-tour="tour-aufgaben-liste" className="space-y-4">
          {offen.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-2">{t("home:householdTasks.open")} ({offen.length})</h2>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                {offen.map((a) => {
                  const ueberfaellig = a.faelligkeitsdatum && a.faelligkeitsdatum.split("T")[0] < heute;
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className={`flex items-start gap-3 bg-light-card dark:bg-canvas-2 rounded-card-sm border p-3 group ${ueberfaellig ? "border-red-500/40" : "border-light-border dark:border-dark-border"}`}
                    >
                      <motion.button whileTap={{ scale: 1.35 }} onClick={() => toggleErledigt(a)} className="mt-0.5 w-5 h-5 rounded border-2 border-light-border dark:border-dark-border hover:border-primary-500 flex items-center justify-center flex-shrink-0 transition-colors">
                        <div className="w-2 h-2 rounded-sm" />
                      </motion.button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-light-text-main dark:text-dark-text-main">{a.beschreibung}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-medium ${prioritaetFarbe(a.prioritaet)}`}>{taskLabel(t, "priorities", a.prioritaet)}</span>
                          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{taskLabel(t, "categories", a.kategorie)}</span>
                          {a.faelligkeitsdatum && <span className={`text-xs ${ueberfaellig ? "text-red-500 font-medium" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>{ueberfaellig ? t("home:householdTasks.overdue") : t("home:householdTasks.due")} {a.faelligkeitsdatum.split("T")[0]}</span>}
                          {a.wiederholung_typ && a.wiederholung_typ !== "Keine" && <span className="flex items-center gap-0.5 text-xs text-blue-500"><RefreshCw size={10} />{taskLabel(t, "repeat", a.wiederholung_typ)}</span>}
                          <BewohnerBadge bewohner={bewohner.find((b) => b.id === a.bewohner_id)} />
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal(a)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500"><AlertCircle size={12} /></button>
                        <button onClick={() => loesche(a.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {erledigt.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-2">{t("home:householdTasks.done")} ({erledigt.length})</h2>
              <div className="space-y-2">
                {erledigt.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 bg-light-card dark:bg-canvas-2 rounded-card-sm border border-light-border dark:border-dark-border p-3 opacity-60 group">
                    <button onClick={() => toggleErledigt(a)} className="w-5 h-5 rounded bg-primary-500 flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-white" />
                    </button>
                    <p className="flex-1 text-sm text-light-text-main dark:text-dark-text-main line-through">{a.beschreibung}</p>
                    {a.bewohner_id && <BewohnerBadge bewohner={bewohner.find((b) => b.id === a.bewohner_id)} />}
                    <button onClick={() => loesche(a.id)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <ModalShell
          open
          title={modal.id ? t("home:householdTasks.edit") : t("home:householdTasks.new")}
          onClose={() => setModal(null)}
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={() => aufgabeFormRef.current?.submit()}
                disabled={!modalKannSpeichern}
                className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
              >
                {t("common:actions.save")}
              </button>
            </div>
          }
        >
          <AufgabeForm
            ref={aufgabeFormRef}
            initial={modal.id ? modal : null}
            onSpeichern={speichere}
            bewohner={bewohner}
            onValidityChange={setModalKannSpeichern}
          />
        </ModalShell>
      )}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.aufgaben}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}

      {kiOffen && (
        <KiHomeAssistent session={session} modul="aufgaben" onClose={() => setKiOffen(false)}
          onErgebnis={async (items) => {
            await applyHomeTaskAiItems({ session, items });
            ladeDaten();
          }}
        />
      )}
    </div>
  );
};

export default HomeHaushaltsaufgaben;
