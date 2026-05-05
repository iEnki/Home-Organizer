import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import { normalizeIngredientName } from "../../utils/recipeNormalize";

const emptyIngredient = { name: "", menge: "", einheit: "g", menge_text: "" };

export default function RecipeFormModal({ open, initialRecipe, initialIngredients, onClose, onSave }) {
  const { t } = useTranslation("recipes");
  const [form, setForm] = useState({
    titel: "",
    beschreibung: "",
    portionen: 4,
    gruppe: "",
    vorbereitungszeit_minuten: "",
    kochzeit_minuten: "",
    tags: "",
    notizen: "",
    anleitung: "",
  });
  const [ingredients, setIngredients] = useState([emptyIngredient]);

  useEffect(() => {
    if (!open) return;
    setForm({
      titel: initialRecipe?.titel || "",
      beschreibung: initialRecipe?.beschreibung || "",
      portionen: initialRecipe?.portionen || 4,
      gruppe: initialRecipe?.gruppe || "",
      vorbereitungszeit_minuten: initialRecipe?.vorbereitungszeit_minuten || "",
      kochzeit_minuten: initialRecipe?.kochzeit_minuten || "",
      tags: (initialRecipe?.tags || []).join(", "),
      notizen: initialRecipe?.notizen || "",
      anleitung: Array.isArray(initialRecipe?.anleitung) ? initialRecipe.anleitung.join("\n") : "",
    });
    setIngredients(initialIngredients?.length ? initialIngredients : [emptyIngredient]);
  }, [open, initialRecipe, initialIngredients]);

  const updateIngredient = (index, patch) => {
    setIngredients((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const save = () => {
    const recipe = {
      ...form,
      portionen: Number(form.portionen) || 4,
      gruppe: form.gruppe.trim() || null,
      vorbereitungszeit_minuten: form.vorbereitungszeit_minuten ? Number(form.vorbereitungszeit_minuten) : null,
      kochzeit_minuten: form.kochzeit_minuten ? Number(form.kochzeit_minuten) : null,
      gesamtzeit_minuten: (Number(form.vorbereitungszeit_minuten) || 0) + (Number(form.kochzeit_minuten) || 0) || null,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      anleitung: form.anleitung.split("\n").map((step) => step.trim()).filter(Boolean),
      import_typ: initialRecipe?.import_typ || "manuell",
      analyse_modus: initialRecipe?.analyse_modus || "web",
      status: "gespeichert",
    };
    const ingredientRows = ingredients
      .filter((item) => item.name?.trim())
      .map((item, index) => ({
        ...item,
        menge: item.menge === "" ? null : Number(item.menge),
        normalized_name: normalizeIngredientName(item.name),
        sortierung: index,
      }));
    onSave(recipe, ingredientRows);
  };

  const inputCls = "w-full rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main";
  const labelCls = "mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary";

  return (
    <ModalShell
      open={open}
      title={initialRecipe?.id ? t("form.editTitle") : t("form.createTitle")}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      footer={(
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main">{t("form.cancel")}</button>
          <button onClick={save} disabled={!form.titel.trim()} className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("form.save")}</button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls}>{t("form.title")}</label>
          <input className={inputCls} value={form.titel} onChange={(e) => setForm((p) => ({ ...p, titel: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>{t("form.description")}</label>
          <textarea className={inputCls} rows={2} value={form.beschreibung} onChange={(e) => setForm((p) => ({ ...p, beschreibung: e.target.value }))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t("form.servings")}</label>
            <input className={inputCls} type="number" min="1" value={form.portionen} onChange={(e) => setForm((p) => ({ ...p, portionen: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{t("form.group")}</label>
            <input className={inputCls} value={form.gruppe} placeholder={t("form.groupPlaceholder")} onChange={(e) => setForm((p) => ({ ...p, gruppe: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{t("form.prepMinutes")}</label>
            <input className={inputCls} type="number" min="0" value={form.vorbereitungszeit_minuten} onChange={(e) => setForm((p) => ({ ...p, vorbereitungszeit_minuten: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t("form.cookMinutes")}</label>
            <input className={inputCls} type="number" min="0" value={form.kochzeit_minuten} onChange={(e) => setForm((p) => ({ ...p, kochzeit_minuten: e.target.value }))} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className={labelCls}>{t("form.ingredients")}</label>
            <button type="button" onClick={() => setIngredients((p) => [...p, emptyIngredient])} className="text-xs text-primary-500">{t("form.addIngredient")}</button>
          </div>
          <div className="space-y-2">
            {ingredients.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_90px_90px_36px] gap-2">
                <input className={inputCls} placeholder={t("form.ingredientName")} value={item.name || ""} onChange={(e) => updateIngredient(index, { name: e.target.value })} />
                <input className={inputCls} placeholder={t("form.amount")} type="number" value={item.menge ?? ""} onChange={(e) => updateIngredient(index, { menge: e.target.value })} />
                <input className={inputCls} placeholder={t("form.unit")} value={item.einheit || ""} onChange={(e) => updateIngredient(index, { einheit: e.target.value })} />
                <button type="button" aria-label={t("form.removeIngredient")} onClick={() => setIngredients((p) => p.filter((_, i) => i !== index))} className="rounded-card-sm border border-light-border text-light-text-secondary dark:border-dark-border">×</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>{t("form.instructions")}</label>
          <textarea className={inputCls} rows={6} value={form.anleitung} onChange={(e) => setForm((p) => ({ ...p, anleitung: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>{t("form.tags")}</label>
          <input className={inputCls} value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>{t("form.notes")}</label>
          <textarea className={inputCls} rows={3} value={form.notizen} onChange={(e) => setForm((p) => ({ ...p, notizen: e.target.value }))} />
        </div>
      </div>
    </ModalShell>
  );
}
