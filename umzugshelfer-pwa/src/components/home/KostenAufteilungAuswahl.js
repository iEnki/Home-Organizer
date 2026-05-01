import React, { useMemo } from "react";
import { Users } from "lucide-react";
import { buildShares } from "../../utils/budgetSplits";
import { formatGermanCurrency } from "../../utils/formatUtils";
import { getBewohnerDisplayName } from "../../utils/budgetAccounts";

const sectionCls =
  "rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-3 space-y-3";

const checkboxCls =
  "w-4 h-4 rounded border-light-border dark:border-dark-border accent-primary-500";

const inputCls =
  "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

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
  splitMode = "equal",
  onSplitModeChange,
  sharesInput = {},
  onSharesInputChange,
  modeVariant = "full",
}) {
  const betragNum = Number.parseFloat(betrag) || 0;
  const isEqualOnly = modeVariant === "equalOnly";
  const effectiveSplitMode = isEqualOnly ? "equal" : splitMode || "equal";
  const dedupeTeilnehmer = useMemo(
    () => Array.from(new Set((teilnehmer || []).filter(Boolean))),
    [teilnehmer],
  );

  const shares = useMemo(() => {
    if (!splitAktiv || !vorgestrecktVon) return null;
    return (
      buildShares({
        aktiv: true,
        payerMemberId: vorgestrecktVon,
        splitMode: effectiveSplitMode,
        teilnehmer: dedupeTeilnehmer,
        sharesInput: isEqualOnly ? {} : sharesInput,
        betrag: betragNum,
      })?.shares || null
    );
  }, [
    betragNum,
    dedupeTeilnehmer,
    effectiveSplitMode,
    isEqualOnly,
    sharesInput,
    splitAktiv,
    vorgestrecktVon,
  ]);

  const toggleTeilnehmer = (memberId, checked) => {
    if (!memberId || memberId === vorgestrecktVon) return;
    if (checked) {
      onTeilnehmerChange(Array.from(new Set([...dedupeTeilnehmer, memberId])));
      return;
    }
    onTeilnehmerChange(dedupeTeilnehmer.filter((id) => id !== memberId));
  };

  const fixedZahlerAnteil = useMemo(() => {
    if (effectiveSplitMode !== "fixed" || !betragNum) return null;
    const sum = Object.entries(sharesInput || {})
      .filter(([id]) => id !== vorgestrecktVon)
      .reduce((s, [, v]) => s + (Number.parseFloat(v) || 0), 0);
    return Math.max(0, betragNum - sum);
  }, [betragNum, effectiveSplitMode, sharesInput, vorgestrecktVon]);

  const percentSumme = useMemo(() => {
    if (effectiveSplitMode !== "percent") return null;
    return Object.values(sharesInput || {}).reduce((s, v) => s + (Number.parseFloat(v) || 0), 0);
  }, [effectiveSplitMode, sharesInput]);

  const renderPersonLabel = (person) => {
    const displayName = getBewohnerDisplayName(person);
    return `${person?.emoji ? `${person.emoji} ` : ""}${displayName}`;
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
            Teile diese Ausgabe im Haushalt auf.
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
              className={inputCls}
            >
              <option value="">Bitte Zahler wählen</option>
              {bewohner.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {renderPersonLabel(eintrag)}
                </option>
              ))}
            </select>
          </div>

          {!isEqualOnly && (
            <div>
              <p className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                Aufteilungsmodus
              </p>
              <div className="flex gap-4">
                {[
                  ["equal", "Gleichmaessig"],
                  ["fixed", "Fest"],
                  ["percent", "Prozent"],
                ].map(([val, label]) => (
                  <label
                    key={val}
                    className="flex items-center gap-1.5 text-sm text-light-text-main dark:text-dark-text-main cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="splitMode"
                      value={val}
                      checked={effectiveSplitMode === val}
                      onChange={() => {
                        onSplitModeChange?.(val);
                        onSharesInputChange?.({});
                      }}
                      className="accent-primary-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {effectiveSplitMode === "equal" && (
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
                        {renderPersonLabel(eintrag)}
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
          )}

          {!isEqualOnly && effectiveSplitMode === "fixed" && (
            <div>
              <p className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                Feste Anteile
              </p>
              <div className="space-y-2">
                {bewohner.map((eintrag) => {
                  const isPayer = eintrag.id === vorgestrecktVon;
                  if (isPayer) {
                    return (
                      <div
                        key={eintrag.id}
                        className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 bg-light-bg dark:bg-canvas-1"
                      >
                        <span className="text-sm text-light-text-main dark:text-dark-text-main">
                          {renderPersonLabel(eintrag)}
                          <span className="ml-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            (Zahler)
                          </span>
                        </span>
                        <span className="text-sm font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                          {fixedZahlerAnteil != null
                            ? `${formatGermanCurrency(fixedZahlerAnteil)} EUR`
                            : "-"}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={eintrag.id}
                      className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 bg-light-bg dark:bg-canvas-1"
                    >
                      <span className="text-sm text-light-text-main dark:text-dark-text-main">
                        {renderPersonLabel(eintrag)}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={sharesInput[eintrag.id] ?? ""}
                          onChange={(e) =>
                            onSharesInputChange({
                              ...sharesInput,
                              [eintrag.id]:
                                e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-24 px-2 py-1 text-sm text-right rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
                          placeholder="0,00"
                        />
                        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                          EUR
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isEqualOnly && effectiveSplitMode === "percent" && (
            <div>
              <p className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                Prozentanteile
              </p>
              <div className="space-y-2">
                {bewohner.map((eintrag) => {
                  const isPayer = eintrag.id === vorgestrecktVon;
                  return (
                    <div
                      key={eintrag.id}
                      className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border px-3 py-2 bg-light-bg dark:bg-canvas-1"
                    >
                      <span className="text-sm text-light-text-main dark:text-dark-text-main">
                        {renderPersonLabel(eintrag)}
                        {isPayer && (
                          <span className="ml-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            (Zahler)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={sharesInput[eintrag.id] ?? ""}
                          onChange={(e) =>
                            onSharesInputChange({
                              ...sharesInput,
                              [eintrag.id]:
                                e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-20 px-2 py-1 text-sm text-right rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
                          placeholder="0"
                        />
                        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                          %
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {percentSumme != null && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    Math.abs(percentSumme - 100) <= 0.01
                      ? "text-accent-success"
                      : "text-accent-danger"
                  }`}
                >
                  Summe: {percentSumme.toFixed(2)} %
                  {Math.abs(percentSumme - 100) > 0.01 ? " (muss 100 % ergeben)" : ""}
                </p>
              )}
            </div>
          )}

          {showSettlementHinweis && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Im Haushalt existieren bereits Ausgleichsbuchungen. Eine Aenderung der Aufteilung
              veraendert die Nettosalden.
            </div>
          )}

          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Vorschau
            </p>
            {betragNum <= 0 ? (
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Betrag eingeben, um Vorschau anzuzeigen.
              </p>
            ) : !shares || shares.length === 0 ? (
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Noch keine gueltige Aufteilung vorhanden.
              </p>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => {
                  const person = bewohner.find((eintrag) => eintrag.id === share.member_id);
                  return (
                    <div
                      key={share.member_id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-light-text-main dark:text-dark-text-main">
                        {renderPersonLabel(person)}
                      </span>
                      <span className="font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                        {formatGermanCurrency(share.amount_owed)} EUR
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-light-border dark:border-dark-border text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Zahler traegt seinen eigenen Anteil implizit mit.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
