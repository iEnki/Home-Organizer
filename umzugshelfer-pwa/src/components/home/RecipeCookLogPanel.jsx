import React, { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const emptyForm = {
  id: null,
  gekocht_am: new Date().toISOString().slice(0, 10),
  bewertung: "",
  anpassungen: "",
  notizen: "",
};

export default function RecipeCookLogPanel({ supabase, userId, recipe, toast, quickAddSignal = 0 }) {
  const { t } = useTranslation("recipes");
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!supabase || !recipe?.id) return;
    const { data, error } = await supabase
      .from("home_rezept_kochprotokolle")
      .select("*")
      .eq("rezept_id", recipe.id)
      .eq("household_id", recipe.household_id)
      .order("gekocht_am", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast?.error?.(error.message || t("cookLog.loadFailed"));
      return;
    }
    setLogs(data || []);
  }, [recipe?.household_id, recipe?.id, supabase, t, toast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (!quickAddSignal) return;
    setForm(emptyForm);
    setOpen(true);
  }, [quickAddSignal]);

  const save = async () => {
    if (!recipe?.id || !userId) return;
    setBusy(true);
    try {
      const payload = {
        household_id: recipe.household_id,
        user_id: userId,
        rezept_id: recipe.id,
        gekocht_am: form.gekocht_am || new Date().toISOString().slice(0, 10),
        bewertung: form.bewertung ? Number(form.bewertung) : null,
        anpassungen: form.anpassungen.trim() || null,
        notizen: form.notizen.trim() || null,
      };
      const result = form.id
        ? await supabase.from("home_rezept_kochprotokolle").update(payload).eq("id", form.id)
        : await supabase.from("home_rezept_kochprotokolle").insert(payload);
      if (result.error) throw result.error;
      setForm(emptyForm);
      setOpen(false);
      await loadLogs();
      toast?.success?.(t("cookLog.saved"));
    } catch (err) {
      toast?.error?.(err.message || t("cookLog.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(t("cookLog.deleteConfirm"))) return;
    const { error } = await supabase.from("home_rezept_kochprotokolle").delete().eq("id", entry.id);
    if (error) toast?.error?.(error.message || t("cookLog.deleteFailed"));
    else {
      await loadLogs();
      toast?.success?.(t("cookLog.deleted"));
    }
  };

  return (
    <section className="rounded-card-sm border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-canvas-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 font-semibold text-light-text-main dark:text-dark-text-main">
          <CalendarCheck size={16} className="text-primary-500" />
          {t("cookLog.title")}
        </h2>
        <button
          type="button"
          onClick={() => { setForm(emptyForm); setOpen((value) => !value); }}
          className="inline-flex items-center gap-1.5 rounded-pill border border-light-border px-3 py-1.5 text-xs text-light-text-main dark:border-dark-border dark:text-dark-text-main"
        >
          <Plus size={13} /> {t("cookLog.add")}
        </button>
      </div>

      {open && (
        <div className="mb-3 grid gap-2 rounded-card-sm border border-light-border bg-light-card p-3 dark:border-dark-border dark:bg-canvas-2 sm:grid-cols-2">
          <input className="rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm dark:border-dark-border dark:bg-canvas-1" type="date" value={form.gekocht_am} onChange={(e) => setForm((p) => ({ ...p, gekocht_am: e.target.value }))} />
          <select className="rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm dark:border-dark-border dark:bg-canvas-1" value={form.bewertung} onChange={(e) => setForm((p) => ({ ...p, bewertung: e.target.value }))}>
            <option value="">{t("cookLog.rating")}</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <textarea className="rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm dark:border-dark-border dark:bg-canvas-1 sm:col-span-2" rows={2} placeholder={t("cookLog.adjustments")} value={form.anpassungen} onChange={(e) => setForm((p) => ({ ...p, anpassungen: e.target.value }))} />
          <textarea className="rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm dark:border-dark-border dark:bg-canvas-1 sm:col-span-2" rows={2} placeholder={t("cookLog.nextTime")} value={form.notizen} onChange={(e) => setForm((p) => ({ ...p, notizen: e.target.value }))} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-pill border border-light-border px-3 py-1.5 text-xs dark:border-dark-border">{t("cookLog.cancel")}</button>
            <button type="button" onClick={save} disabled={busy} className="rounded-pill bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t("cookLog.save")}</button>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("cookLog.empty")}</p>
      ) : (
        <div className="space-y-2">
          {logs.map((entry) => (
            <div key={entry.id} className="rounded-card-sm border border-light-border bg-light-card p-3 dark:border-dark-border dark:bg-canvas-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{entry.gekocht_am}</p>
                  {entry.bewertung && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
                      <Star size={12} fill="currentColor" /> {entry.bewertung}/5
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setForm({ ...emptyForm, ...entry, bewertung: entry.bewertung || "" }); setOpen(true); }} className="p-1 text-light-text-secondary hover:text-primary-500 dark:text-dark-text-secondary">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => remove(entry)} className="p-1 text-light-text-secondary hover:text-red-500 dark:text-dark-text-secondary">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {entry.anpassungen && <p className="mt-2 text-sm text-light-text-main dark:text-dark-text-main">{entry.anpassungen}</p>}
              {entry.notizen && <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{entry.notizen}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
