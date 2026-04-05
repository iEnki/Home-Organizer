import React, { useMemo } from "react";
import { Users } from "lucide-react";
import { buildEqualShares } from "../../utils/budgetSplits";
import { formatGermanCurrency } from "../../utils/formatUtils";

const sectionCls =
  "rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-3 space-y-3";

const checkboxCls =
  "w-4 h-4 rounded border-light-border dark:border-dark-border accent-primary-500";

export default function KostenAufteilungAuswahl({
  bewohner = [],
  betrag = 0,
  splitAktiv,
  onSplitAktivChange,
  vorgestrecktVon,
  teilnehmer = [],
  onVorgestrecktVonChange,
  onTeilnehmerChange,
  showSettlementHinweis,
}) {
  const betragNum = Number.parseFloat(betrag) || 0;
  const dedupeTeilnehmer = useMemo(
    () => Array.from(new Set((teilnehmer || []).filter(Boolean))),
    [teilnehmer],
  );
  const shares = useMemo(
    () => buildEqualShares(betragNum, dedupeTeilnehmer, vorgestrecktVon),
    [betragNum, dedupeTeilnehmer, vorgestrecktVon],
  );

  const toggleTeilnehmer = (memberId, checked) => {
    if (!memberId || memberId === vorgestrecktVon) return;
    if (checked) {
      onTeilnehmerChange(Array.from(new Set([...dedupeTeilnehmer, memberId])));
      return;
    }
    onTeilnehmerChange(dedupeTeilnehmer.filter((id) => id !== memberId));
  };

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-primary-500" />
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Kostenaufteilung
            </p>
          </div>
          <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Teile diese Ausgabe gleichmäßig im Haushalt auf.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main">
          <input
            type="checkbox"
            checked={splitAktiv}
            onChange={(event) => onSplitAktivChange(event.target.checked)}
            className={checkboxCls}
          />
          Aktiv
        </label>
      </div>

      {splitAktiv && (
        <>
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
              Vorgestreckt von
            </label>
            <select
              value={vorgestrecktVon || ""}
              onChange={(event) => onVorgestrecktVonChange(event.target.value || null)}
              className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
            >
              {bewohner.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.emoji} {eintrag.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Beteiligte
            </p>
            <div className="space-y-2">
              {bewohner.map((eintrag) => {
                const isPayer = eintrag.id === vorgestrecktVon;
                const checked = isPayer || dedupeTeilnehmer.includes(eintrag.id);
                return (
                  <label
                    key={eintrag.id}
                    className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 bg-light-bg dark:bg-canvas-1"
                  >
                    <span className="text-sm text-light-text-main dark:text-dark-text-main">
                      {eintrag.emoji} {eintrag.name}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPayer}
                      onChange={(event) => toggleTeilnehmer(eintrag.id, event.target.checked)}
                      className={checkboxCls}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {showSettlementHinweis && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Im Haushalt existieren bereits Ausgleichsbuchungen. Eine Änderung der Aufteilung verändert die Nettosalden.
            </div>
          )}

          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Vorschau
            </p>
            {shares.length === 0 ? (
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Noch keine gültige Aufteilung vorhanden.
              </p>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => {
                  const person = bewohner.find((eintrag) => eintrag.id === share.member_id);
                  return (
                    <div key={share.member_id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-light-text-main dark:text-dark-text-main">
                        {person?.emoji} {person?.name || "Bewohner"}
                      </span>
                      <span className="font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                        {formatGermanCurrency(share.amount_owed)} €
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-light-border dark:border-dark-border text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Zahler trägt seinen eigenen Anteil implizit mit.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
