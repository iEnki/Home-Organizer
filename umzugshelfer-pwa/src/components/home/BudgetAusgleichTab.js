import React, { useMemo, useState } from "react";
import { ArrowLeftRight, Info, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { berechneNettoSalden } from "../../utils/budgetSplits";
import { formatGermanCurrency } from "../../utils/formatUtils";

const currency = (value) => `${formatGermanCurrency(value)} €`;

export default function BudgetAusgleichTab({
  splitGroups = [],
  settlements = [],
  bewohner = [],
  householdId,
  onDataChanged,
}) {
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [fehler, setFehler] = useState(null);

  const bewohnerById = useMemo(
    () => Object.fromEntries((bewohner || []).map((eintrag) => [eintrag.id, eintrag])),
    [bewohner],
  );

  const salden = useMemo(
    () => berechneNettoSalden(splitGroups, settlements),
    [settlements, splitGroups],
  );

  const saldoRows = useMemo(
    () =>
      (bewohner || [])
        .map((eintrag) => ({
          ...eintrag,
          saldo: Number(salden[eintrag.id] || 0),
        }))
        .sort((left, right) => right.saldo - left.saldo),
    [bewohner, salden],
  );

  const historyRows = useMemo(
    () =>
      [...(settlements || [])].sort((left, right) =>
        `${right.date || ""}${right.created_at || ""}`.localeCompare(
          `${left.date || ""}${left.created_at || ""}`,
        ),
      ),
    [settlements],
  );

  const fromSaldo = Number(salden[fromMemberId] || 0);
  const warnungKeinNegativSaldo = Boolean(fromMemberId) && fromSaldo >= 0;

  const handleSave = async () => {
    const numericAmount = Number.parseFloat(amount);
    if (!householdId) {
      setFehler("Aktiver Haushalt konnte nicht bestimmt werden.");
      return;
    }
    if (!fromMemberId || !toMemberId) {
      setFehler("Bitte Zahler und Empfänger auswählen.");
      return;
    }
    if (fromMemberId === toMemberId) {
      setFehler("Zahler und Empfänger müssen unterschiedlich sein.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFehler("Bitte einen gültigen Betrag eingeben.");
      return;
    }

    setSaving(true);
    setFehler(null);
    try {
      const { error } = await supabase.from("budget_settlements").insert({
        household_id: householdId,
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount: numericAmount,
        date: new Date().toISOString().slice(0, 10),
        note: note.trim() || null,
      });
      if (error) throw error;

      setFromMemberId("");
      setToMemberId("");
      setAmount("");
      setNote("");
      await onDataChanged?.();
    } catch (error) {
      setFehler(`Ausgleich konnte nicht gespeichert werden: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSwap = () => {
    setFromMemberId(toMemberId);
    setToMemberId(fromMemberId);
    setFehler(null);
  };

  const handleDeleteSettlement = async (settlementId) => {
    if (!settlementId) return;
    if (!window.confirm("Diesen Ausgleich wirklich löschen?")) return;

    setDeletingId(settlementId);
    setFehler(null);
    try {
      const { error } = await supabase
        .from("budget_settlements")
        .delete()
        .eq("id", settlementId);
      if (error) throw error;

      await onDataChanged?.();
    } catch (error) {
      setFehler(`Ausgleich konnte nicht gelöscht werden: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-light-border dark:border-dark-border">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
              Ausgleich
            </p>
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
              Nettosalden im Haushalt
            </h3>
          </div>
          <ArrowLeftRight size={18} className="text-primary-500" />
        </div>
        <div className="p-4 space-y-3">
          {saldoRows.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Noch keine Bewohner oder Kostenaufteilungen vorhanden.
            </p>
          ) : (
            saldoRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2"
              >
                <span className="text-sm text-light-text-main dark:text-dark-text-main">
                  {row.emoji} {row.name}
                </span>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    row.saldo > 0 ? "text-green-500" : row.saldo < 0 ? "text-red-500" : "text-light-text-secondary dark:text-dark-text-secondary"
                  }`}
                >
                  {row.saldo > 0 ? "+" : row.saldo < 0 ? "−" : ""}
                  {currency(Math.abs(row.saldo))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
            Ausgleich erfassen
          </h3>
        </div>
        <div className="p-4 space-y-3">
          {fehler && (
            <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {fehler}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Zahlt
              </label>
              <select
                value={fromMemberId}
                onChange={(event) => setFromMemberId(event.target.value)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main"
              >
                <option value="">Bewohner wählen</option>
                {bewohner.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    {eintrag.emoji} {eintrag.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex md:justify-center">
              <button
                type="button"
                onClick={handleSwap}
                disabled={!fromMemberId && !toMemberId}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main hover:border-primary-500/50 hover:text-primary-500 disabled:opacity-50"
                aria-label="Zahler und Empfänger tauschen"
                title="Zahler und Empfänger tauschen"
              >
                <ArrowLeftRight size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Empfänger
              </label>
              <select
                value={toMemberId}
                onChange={(event) => setToMemberId(event.target.value)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main"
              >
                <option value="">Bewohner wählen</option>
                {bewohner.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    {eintrag.emoji} {eintrag.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Betrag (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Notiz
              </label>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main"
                placeholder="Optional"
              />
            </div>
          </div>

          {warnungKeinNegativSaldo && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Der ausgewählte Zahler hat aktuell keinen negativen Saldo. Der Ausgleich ist trotzdem möglich.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-pill bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? "Speichere..." : "Ausgleich speichern"}
          </button>
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
            Historie
          </h3>
        </div>
        <div className="p-4 space-y-2">
          {historyRows.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Noch keine Ausgleichsbuchungen vorhanden.
            </p>
          ) : (
            historyRows.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-light-text-main dark:text-dark-text-main">
                    {bewohnerById[entry.from_member_id]?.emoji} {bewohnerById[entry.from_member_id]?.name || "Bewohner"} →{" "}
                    {bewohnerById[entry.to_member_id]?.emoji} {bewohnerById[entry.to_member_id]?.name || "Bewohner"}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {entry.date}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-light-text-main dark:text-dark-text-main">
                    {currency(entry.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSettlement(entry.id)}
                    disabled={deletingId === entry.id}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/20 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                    aria-label="Ausgleich löschen"
                    title="Ausgleich löschen"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
