import React, { useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";

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
        aria-label="Filter schließen"
      />

      <section
        className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-2xl border-t border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3 md:inset-x-1/2 md:bottom-auto md:top-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:max-h-[80dvh]"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-light-border dark:border-dark-border bg-light-card/95 dark:bg-canvas-2/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-primary-500" />
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Filter & Darstellung
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            aria-label="Filter schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Kategorie
            </label>
            <select
              value={kategFilter}
              onChange={(event) => onKategorie(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Alle Kategorien</option>
              {kategorien.map((kategorie) => (
                <option key={kategorie} value={kategorie}>
                  {kategorie}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Person
            </label>
            <select
              value={bewohnerFilter}
              onChange={(event) => onBewohner(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Alle Personen</option>
              {bewohner.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.emoji} {eintrag.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Scope
            </label>
            <select
              value={scopeFilter}
              onChange={(event) => onScope(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="alle">Alle</option>
              <option value="haushalt">Haushalt</option>
              <option value="privat">Privat</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Konto
            </label>
            <select
              value={kontoFilter}
              onChange={(event) => onKonto(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Alle Konten</option>
              {konten.map((konto) => (
                <option key={konto.id} value={konto.id}>
                  {konto.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Sortierung
            </label>
            <select
              value={sortierung}
              onChange={(event) => onSortierung(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="datum_desc">Neueste zuerst</option>
              <option value="datum_asc">Älteste zuerst</option>
              <option value="betrag_desc">Höchster Betrag zuerst</option>
              <option value="betrag_asc">Niedrigster Betrag zuerst</option>
              <option value="name">Beschreibung A–Z</option>
              <option value="kategorie">Kategorie A–Z</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Gruppierung
            </label>
            <select
              value={gruppierung}
              onChange={(event) => onGruppierung(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="tag">Tag</option>
              <option value="monat">Monat</option>
              <option value="kategorie">Kategorie</option>
              <option value="person">Person</option>
              <option value="scope">Scope</option>
              <option value="konto">Konto</option>
              <option value="keine">Keine</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Quick Filter
            </p>

            <label className="flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main">
              <input
                type="checkbox"
                checked={nurWiederkehrend}
                onChange={(event) => onNurWiederkehrend(event.target.checked)}
                className="h-4 w-4 rounded accent-primary-500"
              />
              Nur wiederkehrend
            </label>

            <label className="flex items-center gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main">
              <input
                type="checkbox"
                checked={nurMitRechnung}
                onChange={(event) => onNurMitRechnung(event.target.checked)}
                className="h-4 w-4 rounded accent-primary-500"
              />
              Nur mit Rechnung
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pt-2 md:px-4">
          <button
            onClick={onReset}
            className="rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2.5 text-sm text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
          >
            Zurücksetzen
          </button>
          <button
            onClick={onClose}
            className="rounded-pill bg-primary-500 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            Fertig
          </button>
        </div>
      </section>
    </div>
  );
}
