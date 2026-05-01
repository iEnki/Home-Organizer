import React, { useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getBewohnerDisplayName } from "../../../utils/budgetAccounts";
import { getHomeBudgetCategoryLabel } from "../../../utils/homeBudgetCategories";

const SELECT_CLS =
  "w-full px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none";

export default function BudgetFilterSheet({
  offen,
  onClose,
  kategFilter,
  onKategorie,
  bewohnerFilter,
  onBewohner,
  kontoFilter,
  onKonto,
  scopeFilter,
  onScope,
  nurWiederkehrend,
  onNurWiederkehrend,
  nurMitRechnung,
  onNurMitRechnung,
  sortierung,
  onSortierung,
  gruppierung,
  onGruppierung,
  kategorien,
  bewohner,
  konten,
  onReset,
}) {
  const { t, i18n } = useTranslation(["budget", "common"]);

  useEffect(() => {
    if (!offen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [offen, onClose]);

  if (!offen) return null;

  return (
    <div className="fixed inset-0 z-[125]">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t("common:actions.close")}
      />

      <section
        className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-2xl border-t border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3 md:inset-x-1/2 md:bottom-auto md:top-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:max-h-[80dvh]"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-light-border dark:border-dark-border bg-light-card/95 dark:bg-canvas-2/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-primary-500" />
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              {t("budget:filters.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            aria-label={t("common:actions.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.category")}
            </label>
            <select value={kategFilter} onChange={(event) => onKategorie(event.target.value)} className={SELECT_CLS}>
              <option value="">{t("budget:filters.allCategories")}</option>
              {kategorien.map((kategorie) => (
                <option key={kategorie} value={kategorie}>
                  {getHomeBudgetCategoryLabel(kategorie, i18n.language)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.person")}
            </label>
            <select value={bewohnerFilter} onChange={(event) => onBewohner(event.target.value)} className={SELECT_CLS}>
              <option value="">{t("budget:filters.allPeople")}</option>
              {bewohner.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.emoji} {getBewohnerDisplayName(eintrag)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.scope")}
            </label>
            <select value={scopeFilter} onChange={(event) => onScope(event.target.value)} className={SELECT_CLS}>
              <option value="alle">{t("budget:scope.all")}</option>
              <option value="haushalt">{t("budget:scope.household")}</option>
              <option value="privat">{t("budget:scope.private")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.account")}
            </label>
            <select value={kontoFilter} onChange={(event) => onKonto(event.target.value)} className={SELECT_CLS}>
              <option value="">{t("budget:filters.allAccounts")}</option>
              {konten.map((konto) => (
                <option key={konto.id} value={konto.id}>
                  {konto.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.sort")}
            </label>
            <select value={sortierung} onChange={(event) => onSortierung(event.target.value)} className={SELECT_CLS}>
              <option value="datum_desc">{t("budget:filters.sortOptions.newest")}</option>
              <option value="datum_asc">{t("budget:filters.sortOptions.oldest")}</option>
              <option value="betrag_desc">{t("budget:filters.sortOptions.highest")}</option>
              <option value="betrag_asc">{t("budget:filters.sortOptions.lowest")}</option>
              <option value="name">{t("budget:filters.sortOptions.description")}</option>
              <option value="kategorie">{t("budget:filters.sortOptions.category")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.group")}
            </label>
            <select value={gruppierung} onChange={(event) => onGruppierung(event.target.value)} className={SELECT_CLS}>
              <option value="tag">{t("budget:filters.groupOptions.day")}</option>
              <option value="monat">{t("budget:filters.groupOptions.month")}</option>
              <option value="kategorie">{t("budget:filters.groupOptions.category")}</option>
              <option value="person">{t("budget:filters.groupOptions.person")}</option>
              <option value="scope">{t("budget:filters.groupOptions.scope")}</option>
              <option value="konto">{t("budget:filters.groupOptions.account")}</option>
              <option value="keine">{t("budget:filters.groupOptions.none")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("budget:filters.quick")}
            </p>

            <label className="flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main">
              <input
                type="checkbox"
                checked={nurWiederkehrend}
                onChange={(event) => onNurWiederkehrend(event.target.checked)}
                className="h-4 w-4 rounded accent-primary-500"
              />
              {t("budget:filters.recurringOnly")}
            </label>

            <label className="flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main">
              <input
                type="checkbox"
                checked={nurMitRechnung}
                onChange={(event) => onNurMitRechnung(event.target.checked)}
                className="h-4 w-4 rounded accent-primary-500"
              />
              {t("budget:filters.withInvoiceOnly")}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pt-2 md:px-4">
          <button
            onClick={onReset}
            className="rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
          >
            {t("common:actions.reset")}
          </button>
          <button
            onClick={onClose}
            className="rounded-pill bg-primary-500 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            {t("common:actions.done")}
          </button>
        </div>
      </section>
    </div>
  );
}
