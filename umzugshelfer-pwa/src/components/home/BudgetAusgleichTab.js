import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Info, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getBewohnerDisplayName } from "../../utils/budgetAccounts";
import { centsToEuro, buildOpenPairBalances, buildOpenSaldoMap, buildSettlementSuggestions } from "../../utils/budgetLedger";
import { formatGermanCurrency } from "../../utils/formatUtils";
import { notifyHouseholdEvent } from "../../utils/pushNotifications";

const currency = (value) => `${formatGermanCurrency(value)} €`;
const INPUT_CLS = "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";
const todayIso = () => new Date().toISOString().slice(0, 10);
const pairKey = (fromMemberId, toMemberId) => `${fromMemberId || ""}::${toMemberId || ""}`;
const saldoAmountClass = (value) => {
  if (value > 0) return "text-emerald-400 dark:text-emerald-300";
  if (value < 0) return "text-rose-400 dark:text-rose-300";
  return "text-light-text-main dark:text-dark-text-main";
};
const debtAmountClass = (value) => {
  if (value > 0) return "text-rose-400 dark:text-rose-300";
  return "text-light-text-main dark:text-dark-text-main";
};
const settledAmountClass = (value) => {
  if (value > 0) return "text-emerald-400 dark:text-emerald-300";
  if (value < 0) return "text-rose-400 dark:text-rose-300";
  return "text-light-text-main dark:text-dark-text-main";
};
const summaryCardTone = (tone) => {
  switch (tone) {
    case "carry":
      return "border-sky-500/25 bg-sky-500/8";
    case "created":
      return "border-amber-500/25 bg-amber-500/8";
    case "settled":
      return "border-emerald-500/25 bg-emerald-500/8";
    case "open":
      return "border-rose-500/25 bg-rose-500/8";
    default:
      return "border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1";
  }
};
const formatIsoDate = (value) => {
  if (!value) return "unbekannt";

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("de-AT");
};
const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const loadMonthCloseDetails = async (householdId, monthValue) => {
  if (!householdId || !monthValue) {
    return { close: null, members: [] };
  }

  const monthDate = `${monthValue}-01`;
  const { data: close, error: closeError } = await supabase
    .from("budget_month_closes")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", monthDate)
    .maybeSingle();

  if (closeError) throw closeError;
  if (!close?.id) return { close: null, members: [] };

  const { data: members, error: membersError } = await supabase
    .from("budget_month_close_members")
    .select("*")
    .eq("month_close_id", close.id)
    .order("closing_balance_cents", { ascending: true });

  if (membersError) throw membersError;
  return { close, members: members || [] };
};

export default function BudgetAusgleichTab({
  settlements = [],
  bewohner = [],
  householdId,
  userId,
  onDataChanged,
}) {
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingShareId, setApplyingShareId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerState, setLedgerState] = useState(null);
  const [abschlussMonat, setAbschlussMonat] = useState(currentMonthValue);
  const [monthClose, setMonthClose] = useState(null);
  const [monthCloseMembers, setMonthCloseMembers] = useState([]);
  const [closingMonth, setClosingMonth] = useState(false);
  const [monthCloseLoading, setMonthCloseLoading] = useState(false);
  const [expandedSuggestions, setExpandedSuggestions] = useState({});

  const [filterMonat, setFilterMonat] = useState("");
  const [filterMemberId, setFilterMemberId] = useState("");

  const { t, i18n } = useTranslation(["budget", "common"]);

  const bewohnerById = useMemo(
    () => Object.fromEntries((bewohner || []).map((eintrag) => [eintrag.id, eintrag])),
    [bewohner],
  );

  const notifySettlement = useCallback(async ({
    action = "erstellt",
    fromMemberId: nextFromMemberId,
    toMemberId: nextToMemberId,
    amountEuro,
    recordId = null,
    title,
    body,
  }) => {
    if (!userId) return;

    const linkedUserIds = [
      bewohnerById[nextFromMemberId]?.linked_user_id,
      bewohnerById[nextToMemberId]?.linked_user_id,
    ].filter(Boolean);

    const fromName = getBewohnerDisplayName(bewohnerById[nextFromMemberId] || { name: t("budget:settlementTab.unknown") });
    const toName = getBewohnerDisplayName(bewohnerById[nextToMemberId] || { name: t("budget:settlementTab.unknown") });
    await notifyHouseholdEvent({
      supabaseClient: supabase,
      userId,
      table: "budget_settlements",
      action,
      recordName: `${fromName} -> ${toName}`,
      recordId,
      url: "/home/budget?tab=ausgleich",
      pushPolicy: "always",
      recipientMode: linkedUserIds.length ? "custom" : "household",
      recipientUserIds: linkedUserIds,
      title,
      body: body || t("budget:settlementTab.notifySettlementBody", { fromName, toName, amount: Number(amountEuro || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }),
    });
  }, [bewohnerById, i18n.language, t, userId]);

  const loadLedgerState = useCallback(async () => {
    if (!householdId) {
      setLedgerState(null);
      return null;
    }

    const { data, error } = await supabase
      .from("budget_ledger_state")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) throw error;
    setLedgerState(data || null);
    return data || null;
  }, [householdId]);

  const loadLedgerRows = useCallback(async () => {
    if (!householdId) {
      setLedgerRows([]);
      return [];
    }

    setLedgerLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_budget_open_split_ledger", {
        p_household_id: householdId,
        p_as_of_date: todayIso(),
      });
      if (error) throw error;
      setLedgerRows(data || []);
      return data || [];
    } finally {
      setLedgerLoading(false);
    }
  }, [householdId]);

  const loadMonthClose = useCallback(async () => {
    if (!householdId) {
      setMonthClose(null);
      setMonthCloseMembers([]);
      return;
    }

    setMonthCloseLoading(true);
    try {
      const { close, members } = await loadMonthCloseDetails(householdId, abschlussMonat);
      setMonthClose(close);
      setMonthCloseMembers(members);
    } finally {
      setMonthCloseLoading(false);
    }
  }, [abschlussMonat, householdId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadLedgerState().catch(() => null),
      loadLedgerRows(),
      loadMonthClose(),
      onDataChanged?.(),
    ]);
  }, [loadLedgerRows, loadLedgerState, loadMonthClose, onDataChanged]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await Promise.all([loadLedgerState(), loadLedgerRows(), loadMonthClose()]);
      } catch (error) {
        if (!cancelled) {
          setFehler(t("budget:settlementTab.errLoadLedger", { msg: error.message }));
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [loadLedgerRows, loadLedgerState, loadMonthClose, t]);

  const pairBalances = useMemo(() => buildOpenPairBalances(ledgerRows), [ledgerRows]);
  const salden = useMemo(() => buildOpenSaldoMap(ledgerRows), [ledgerRows]);
  const suggestions = useMemo(() => buildSettlementSuggestions(ledgerRows), [ledgerRows]);
  const ledgerRowsByPair = useMemo(() => {
    const groups = new Map();

    (ledgerRows || []).forEach((row) => {
      const cents = Number(row?.open_amount_cents || 0);
      if (cents <= 0 || !row?.from_member_id || !row?.to_member_id) return;

      const key = pairKey(row.from_member_id, row.to_member_id);
      const rows = groups.get(key) || [];
      rows.push(row);
      groups.set(key, rows);
    });

    groups.forEach((rows, key) => {
      groups.set(
        key,
        [...rows].sort((left, right) =>
          `${left.origin_date || ""}${left.beschreibung || ""}${left.share_id || ""}`.localeCompare(
            `${right.origin_date || ""}${right.beschreibung || ""}${right.share_id || ""}`,
          ),
        ),
      );
    });

    return groups;
  }, [ledgerRows]);

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

  const gefilterteSettlements = useMemo(() => (settlements || []).filter((settlement) => {
    if (filterMonat && !settlement.date?.startsWith(filterMonat)) return false;
    if (filterMemberId && settlement.from_member_id !== filterMemberId && settlement.to_member_id !== filterMemberId) return false;
    return true;
  }), [filterMemberId, filterMonat, settlements]);

  const historyRows = useMemo(
    () =>
      [...(gefilterteSettlements || [])].sort((left, right) =>
        `${right.date || ""}${right.created_at || ""}`.localeCompare(
          `${left.date || ""}${left.created_at || ""}`,
        ),
      ),
    [gefilterteSettlements],
  );

  const ausgewaehltePaarSchuld = useMemo(
    () => pairBalances.find((row) => row.from_member_id === fromMemberId && row.to_member_id === toMemberId) || null,
    [fromMemberId, pairBalances, toMemberId],
  );

  const offenePaarSchuldEuro = centsToEuro(ausgewaehltePaarSchuld?.open_amount_cents || 0);
  const numericAmount = Number.parseFloat(amount);
  const migrationBlocked = ledgerState?.migration_status === "blocked";
  const staleFromMonth = ledgerState?.stale_from_month || null;
  const selectedMonthDate = `${abschlussMonat}-01`;
  const selectedMonthIsStale = Boolean(
    monthClose?.is_stale || (staleFromMonth && selectedMonthDate >= staleFromMonth),
  );
  const translateNote = useCallback((note) => {
    if (!note) return "";
    const applied = `ubernommen`.replace("u", String.fromCharCode(252));
    const lineItemApplied = ["Einzelposten", applied].join(" ");
    const suggestionApplied = ["Vorschlag", applied].join(" ");
    const allSuggestionsApplied = ["Alle Vorschlage".replace("a", String.fromCharCode(228)), applied].join(" ");
    const exact = {
      [`Aufrechnung (Gegenposition ${applied})`]: t("budget:settlementTab.noteNettingCounter"),
      "Aufrechnung (Gegenverrechnung)": t("budget:settlementTab.noteNettingMain"),
      [lineItemApplied]: t("budget:settlementTab.noteLineItemNoDesc"),
      [suggestionApplied]: t("budget:settlementTab.notifySuggestionApplied"),
      [allSuggestionsApplied]: t("budget:settlementTab.notifyAllApplied"),
    };
    if (exact[note]) return exact[note];
    const lineItem = note.match(new RegExp(`^${lineItemApplied}: (.+)$`));
    if (lineItem) return t("budget:settlementTab.noteLineItem", { desc: lineItem[1] });
    return note;
  }, [t]);

  const toggleSuggestionDetails = useCallback((suggestionKey) => {
    setExpandedSuggestions((current) => ({
      ...current,
      [suggestionKey]: !current[suggestionKey],
    }));
  }, []);

  const saveSettlement = useCallback(async ({
    fromMemberId: nextFromMemberId,
    toMemberId: nextToMemberId,
    amountEuro,
    noteText = "",
  }) => {
    const { error } = await supabase.rpc("create_budget_settlement_with_allocations", {
      p_household_id: householdId,
      p_from_member_id: nextFromMemberId,
      p_to_member_id: nextToMemberId,
      p_amount: amountEuro,
      p_date: todayIso(),
      p_note: noteText || null,
    });
    if (error) throw error;
    await notifySettlement({
      action: "erstellt",
      fromMemberId: nextFromMemberId,
      toMemberId: nextToMemberId,
      amountEuro,
    });
  }, [householdId, notifySettlement]);

  const handleSave = async () => {
    if (!householdId) {
      setFehler(t("budget:settlementTab.errDetermineHousehold"));
      return;
    }
    if (!fromMemberId || !toMemberId) {
      setFehler(t("budget:settlementTab.errSelectBoth"));
      return;
    }
    if (fromMemberId === toMemberId) {
      setFehler(t("budget:settlementTab.errSamePerson"));
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFehler(t("budget:settlementTab.errInvalidAmount"));
      return;
    }
    if (numericAmount - offenePaarSchuldEuro > 0.0001) {
      setFehler(t("budget:settlementTab.errAmountExceeds"));
      return;
    }

    setSaving(true);
    setFehler(null);
    try {
      await saveSettlement({
        fromMemberId,
        toMemberId,
        amountEuro: numericAmount,
        noteText: note.trim(),
      });

      setFromMemberId("");
      setToMemberId("");
      setAmount("");
      setNote("");
      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errSaveFailed", { msg: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSettlement = async (settlementId) => {
    if (!settlementId) return;
    if (!window.confirm(t("budget:settlementTab.errDeleteConfirm"))) return;

    setDeletingId(settlementId);
    setFehler(null);
    try {
      const { error } = await supabase.rpc("delete_budget_settlement", {
        p_settlement_id: settlementId,
      });
      if (error) throw error;

      const settlement = settlements.find((entry) => entry.id === settlementId);
      await notifySettlement({
        action: "geloescht",
        fromMemberId: settlement?.from_member_id,
        toMemberId: settlement?.to_member_id,
        amountEuro: Number(settlement?.amount || 0) || centsToEuro(settlement?.amount_cents || 0),
        recordId: settlementId,
        title: t("budget:settlementTab.notifyDeleted"),
        body: t("budget:settlementTab.notifyDeletedBody"),
      });

      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errDeleteFailed", { msg: error.message }));
    } finally {
      setDeletingId(null);
    }
  };

  const handleApplySuggestion = async (suggestion) => {
    if (!suggestion?.open_amount_cents || saving) return;

    setSaving(true);
    setFehler(null);
    try {
      await saveSettlement({
        fromMemberId: suggestion.from_member_id,
        toMemberId: suggestion.to_member_id,
        amountEuro: centsToEuro(suggestion.open_amount_cents),
        noteText: t("budget:settlementTab.notifySuggestionApplied"),
      });
      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errApplyFailed", { msg: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyAllSuggestions = async () => {
    if (!suggestions.length || saving) return;

    setSaving(true);
    setFehler(null);
    try {
      for (const suggestion of suggestions) {
        // eslint-disable-next-line no-await-in-loop
        await saveSettlement({
          fromMemberId: suggestion.from_member_id,
          toMemberId: suggestion.to_member_id,
          amountEuro: centsToEuro(suggestion.open_amount_cents),
          noteText: t("budget:settlementTab.notifyAllApplied"),
        });
      }
      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errApplyAllFailed", { msg: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyNettoSuggestion = async (suggestion, counterSuggestion) => {
    if (saving) return;
    setSaving(true);
    setFehler(null);
    try {
      // Gegenrichtung vollständig schließen (z.B. Bettina→Robert 17,99)
      await saveSettlement({
        fromMemberId: counterSuggestion.from_member_id,
        toMemberId: counterSuggestion.to_member_id,
        amountEuro: centsToEuro(counterSuggestion.open_amount_cents),
        noteText: t("budget:settlementTab.noteNettingCounter"),
      });
      // Hauptrichtung um denselben Gegenbetrag reduzieren (z.B. Robert→Bettina: −17,99)
      await saveSettlement({
        fromMemberId: suggestion.from_member_id,
        toMemberId: suggestion.to_member_id,
        amountEuro: centsToEuro(counterSuggestion.open_amount_cents),
        noteText: t("budget:settlementTab.noteNettingMain"),
      });
      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errNettingFailed", { msg: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyShareSuggestion = async (row) => {
    if (!row?.share_id || applyingShareId || saving) return;

    setApplyingShareId(row.share_id);
    setFehler(null);
    try {
      const { error } = await supabase.rpc("create_budget_settlement_for_split_share", {
        p_household_id: householdId,
        p_split_share_id: row.share_id,
        p_amount: centsToEuro(row.open_amount_cents),
        p_date: todayIso(),
        p_note: row.beschreibung ? t("budget:settlementTab.noteLineItem", { desc: row.beschreibung }) : t("budget:settlementTab.noteLineItemNoDesc"),
      });
      if (error) throw error;

      await refreshAll();
    } catch (error) {
      setFehler(t("budget:settlementTab.errShareFailed", { msg: error.message }));
    } finally {
      setApplyingShareId(null);
    }
  };

  const handleCloseMonth = async () => {
    if (!householdId || !abschlussMonat) return;

    setClosingMonth(true);
    setFehler(null);
    try {
      const { error } = await supabase.rpc("close_budget_month", {
        p_household_id: householdId,
        p_month: `${abschlussMonat}-01`,
      });
      if (error) throw error;
      await notifyHouseholdEvent({
        supabaseClient: supabase,
        userId,
        table: "budget_settlements",
        action: "geaendert",
        recordName: t("budget:settlementTab.notifyMonthRecord", { month: abschlussMonat }),
        recordId: `${householdId}-${abschlussMonat}`,
        url: "/home/budget?tab=ausgleich",
        pushPolicy: "always",
        title: t("budget:settlementTab.notifyMonthClosed"),
        body: t("budget:settlementTab.notifyMonthClosedBody", { month: abschlussMonat }),
      });
      await Promise.all([loadMonthClose(), loadLedgerState()]);
    } catch (error) {
      setFehler(t("budget:settlementTab.errMonthCloseFailed", { msg: error.message }));
    } finally {
      setClosingMonth(false);
    }
  };

  return (
    <div className="space-y-4">
      {fehler && (
        <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {fehler}
        </div>
      )}

      {migrationBlocked && (
        <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-300">
          {t("budget:settlementTab.migrationBlocked")}
          {ledgerState?.migration_error ? ` ${ledgerState.migration_error}` : ""}
        </div>
      )}

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.filterMonth")}</label>
            <input type="month" value={filterMonat} onChange={(event) => setFilterMonat(event.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.filterResident")}</label>
            <select value={filterMemberId} onChange={(event) => setFilterMemberId(event.target.value)} className={INPUT_CLS}>
              <option value="">{t("budget:settlementTab.filterAll")}</option>
              {bewohner.map((eintrag) => (
                <option key={eintrag.id} value={eintrag.id}>
                  {eintrag.emoji} {getBewohnerDisplayName(eintrag)}
                </option>
              ))}
            </select>
          </div>
          {(filterMonat || filterMemberId) && (
            <button onClick={() => { setFilterMonat(""); setFilterMemberId(""); }} className="text-sm text-primary-500 hover:underline pb-2">
              {t("budget:settlementTab.filterReset")}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-light-border dark:border-dark-border">
          <div>
            <p className="text-xs uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.openBalancesSubtitle")}</p>
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("budget:settlementTab.openBalances")}</h3>
          </div>
          <ArrowLeftRight size={18} className="text-primary-500" />
        </div>
        <div className="p-4 space-y-3">
          {ledgerLoading ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.ledgerLoading")}</p>
          ) : saldoRows.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.noOpenSplits")}</p>
          ) : (
            saldoRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
                <span className="text-sm text-light-text-main dark:text-dark-text-main">
                  {row.emoji} {getBewohnerDisplayName(row)}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${saldoAmountClass(row.saldo)}`}>
                  {row.saldo > 0 ? "+" : row.saldo < 0 ? "−" : ""}
                  {currency(Math.abs(row.saldo))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-light-border dark:border-dark-border">
          <div>
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("budget:settlementTab.suggestions")}</h3>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.suggestionsSubtitle")}</p>
          </div>
          {suggestions.length > 1 && (
            <button onClick={handleApplyAllSuggestions} disabled={saving || migrationBlocked} className="px-3 py-1.5 rounded-card-sm bg-primary-500 text-white text-sm disabled:opacity-60">
              {t("budget:settlementTab.applyAll")}
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
          {!suggestions.length ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.noPairDebts")}</p>
          ) : (
            <>
              <div className="rounded-card-sm border border-primary-500/20 bg-primary-500/5 px-3 py-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {t("budget:settlementTab.suggestionsInfo")}
              </div>
              {suggestions.map((suggestion) => {
                const suggestionKey = pairKey(suggestion.from_member_id, suggestion.to_member_id);
                const detailRows = ledgerRowsByPair.get(suggestionKey) || [];
                const isExpanded = Boolean(expandedSuggestions[suggestionKey]);

                const counterSuggestion = suggestions.find(
                  (s) =>
                    s.from_member_id === suggestion.to_member_id &&
                    s.to_member_id === suggestion.from_member_id,
                );
                const nettoAmountCents = counterSuggestion
                  ? suggestion.open_amount_cents - counterSuggestion.open_amount_cents
                  : 0;
                const showNettingButton =
                  Boolean(counterSuggestion) &&
                  suggestion.open_amount_cents > counterSuggestion.open_amount_cents;

                return (
              <div key={suggestion.id} className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1">
                <div className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                    {bewohnerById[suggestion.from_member_id]?.emoji} {getBewohnerDisplayName(bewohnerById[suggestion.from_member_id] || { name: t("budget:settlementTab.unknown") })} → {bewohnerById[suggestion.to_member_id]?.emoji} {getBewohnerDisplayName(bewohnerById[suggestion.to_member_id] || { name: t("budget:settlementTab.unknown") })}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {t("budget:settlementTab.openSince", { date: formatIsoDate(suggestion.oldest_origin_date), count: suggestion.share_count })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-base font-semibold tabular-nums ${debtAmountClass(centsToEuro(suggestion.open_amount_cents))}`}>
                    {currency(centsToEuro(suggestion.open_amount_cents))}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSuggestionDetails(suggestionKey)}
                    className="px-3 py-1.5 rounded-card-sm border border-light-border dark:border-dark-border text-sm text-light-text-main dark:text-dark-text-main hover:border-primary-500"
                  >
                    {isExpanded ? t("budget:settlementTab.hideDetails") : t("budget:settlementTab.showDetails")}
                  </button>
                  <button onClick={() => handleApplySuggestion(suggestion)} disabled={saving || migrationBlocked} className="px-3 py-1.5 rounded-card-sm border border-primary-500 text-primary-500 text-sm disabled:opacity-60">
                    {t("budget:settlementTab.apply")}
                  </button>
                  {showNettingButton && (
                    <button
                      onClick={() => handleApplyNettoSuggestion(suggestion, counterSuggestion)}
                      disabled={saving || migrationBlocked}
                      className="px-3 py-1.5 rounded-card-sm border border-sky-500 text-sky-400 text-sm disabled:opacity-60"
                      title={t("budget:settlementTab.netOffsetTitle", { amount: currency(centsToEuro(counterSuggestion.open_amount_cents)) })}
                    >
                      {t("budget:settlementTab.netOffset", { amount: currency(centsToEuro(nettoAmountCents)) })}
                    </button>
                  )}
                </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-light-border dark:border-dark-border px-3 py-3">
                    {!detailRows.length ? (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {t("budget:settlementTab.noDetailItems")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {detailRows.map((row) => (
                          <div key={row.share_id} className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 px-3 py-2">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm text-light-text-main dark:text-dark-text-main">
                                  {row.beschreibung || t("budget:settlementTab.noDescription")}
                                </p>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                  {formatIsoDate(row.origin_date)} · {t("budget:settlementTab.openForDays", { count: Number(row.age_days) })}
                                </p>
                              </div>
                              <div className="text-left md:text-right">
                                <p className={`text-base font-semibold tabular-nums ${debtAmountClass(centsToEuro(row.open_amount_cents))}`}>
                                  {t("budget:settlementTab.openAmount")} {currency(centsToEuro(row.open_amount_cents))}
                                </p>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                  {t("budget:settlementTab.shareAmount")} <span className="text-amber-300 dark:text-amber-200">{currency(centsToEuro(row.amount_owed_cents))}</span> · {t("budget:settlementTab.alreadyAllocated")} <span className="text-emerald-400 dark:text-emerald-300">{currency(centsToEuro(row.allocated_cents))}</span>
                                </p>
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyShareSuggestion(row)}
                                    disabled={saving || Boolean(applyingShareId) || migrationBlocked}
                                    className="px-3 py-1.5 rounded-card-sm border border-primary-500 text-primary-500 text-sm disabled:opacity-60"
                                  >
                                    {applyingShareId === row.share_id ? t("budget:settlementTab.applyingItem") : t("budget:settlementTab.applyItem")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between rounded-card-sm border border-dashed border-light-border dark:border-dark-border px-3 py-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          <span>{t("budget:settlementTab.totalSuggestion")}</span>
                          <span className={`text-sm font-semibold tabular-nums ${debtAmountClass(centsToEuro(suggestion.open_amount_cents))}`}>
                            {currency(centsToEuro(suggestion.open_amount_cents))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("budget:settlementTab.record")}</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.payer")}</label>
              <select value={fromMemberId} onChange={(event) => setFromMemberId(event.target.value)} className={INPUT_CLS}>
                <option value="">{t("budget:settlementTab.selectResident")}</option>
                {bewohner.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    {eintrag.emoji} {getBewohnerDisplayName(eintrag)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.recipient")}</label>
              <select value={toMemberId} onChange={(event) => setToMemberId(event.target.value)} className={INPUT_CLS}>
                <option value="">{t("budget:settlementTab.selectResident")}</option>
                {bewohner.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    {eintrag.emoji} {getBewohnerDisplayName(eintrag)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.amountLabel")}</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className={INPUT_CLS} placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("budget:settlementTab.noteLabel")}</label>
              <input value={note} onChange={(event) => setNote(event.target.value)} className={INPUT_CLS} placeholder={t("budget:settlementTab.notePlaceholder")} />
            </div>
          </div>

          <div className={`rounded-card-sm border px-3 py-2 text-sm ${offenePaarSchuldEuro > 0 ? "border-rose-500/25 bg-rose-500/8" : "border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1"}`}>
            <span className="text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.openPairBalance")} </span>
            <span className={`font-semibold tabular-nums ${debtAmountClass(offenePaarSchuldEuro)}`}>{currency(offenePaarSchuldEuro)}</span>
          </div>

          {fromMemberId && toMemberId && offenePaarSchuldEuro <= 0 && (
            <div className="rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              {t("budget:settlementTab.noDebtForPair")}
            </div>
          )}

          <button onClick={handleSave} disabled={saving || migrationBlocked} className="px-4 py-2 rounded-card-sm bg-primary-500 text-white text-sm disabled:opacity-60">
            {t("budget:settlementTab.save")}
          </button>
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-light-border dark:border-dark-border">
          <div>
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("budget:settlementTab.monthlyClose")}</h3>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.monthlyCloseSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={abschlussMonat} onChange={(event) => setAbschlussMonat(event.target.value)} className={INPUT_CLS} />
            <button onClick={handleCloseMonth} disabled={closingMonth || migrationBlocked} className="px-3 py-1.5 rounded-card-sm bg-primary-500 text-white text-sm disabled:opacity-60">
              {selectedMonthIsStale || !monthClose ? t("budget:settlementTab.recalculate") : t("budget:settlementTab.updateBtn")}
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {monthCloseLoading ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.monthCloseLoading")}</p>
          ) : !monthClose ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.noMonthClose")}</p>
          ) : (
            <>
              <div className={`rounded-card-sm border px-3 py-2 text-sm ${selectedMonthIsStale ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main"}`}>
                {selectedMonthIsStale ? t("budget:settlementTab.monthCloseStale") : t("budget:settlementTab.monthCloseCalculatedAt", { date: new Date(monthClose.calculated_at).toLocaleString(i18n.language) })}
              </div>
              <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {t("budget:settlementTab.monthCloseInfo")}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className={`rounded-card-sm border px-3 py-3 ${summaryCardTone("carry")}`}>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.openFromPrevMonth")}</p>
                  <p className="text-lg font-semibold tabular-nums text-sky-300 dark:text-sky-200">{currency(centsToEuro(monthClose.opening_total_cents))}</p>
                </div>
                <div className={`rounded-card-sm border px-3 py-3 ${summaryCardTone("created")}`}>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.newThisMonth")}</p>
                  <p className="text-lg font-semibold tabular-nums text-amber-300 dark:text-amber-200">{currency(centsToEuro(monthClose.created_total_cents))}</p>
                </div>
                <div className={`rounded-card-sm border px-3 py-3 ${summaryCardTone("settled")}`}>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.alreadySettled")}</p>
                  <p className="text-lg font-semibold tabular-nums text-emerald-400 dark:text-emerald-300">{currency(centsToEuro(monthClose.settled_total_cents))}</p>
                </div>
                <div className={`rounded-card-sm border px-3 py-3 ${summaryCardTone("open")}`}>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.remainingOpen")}</p>
                  <p className={`text-lg font-semibold tabular-nums ${debtAmountClass(centsToEuro(monthClose.closing_total_cents))}`}>{currency(centsToEuro(monthClose.closing_total_cents))}</p>
                </div>
              </div>
              <div className="space-y-2">
                {monthCloseMembers.map((row) => (
                  <div key={row.id} className="grid gap-2 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
                    <div className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                      {bewohnerById[row.member_id]?.emoji} {getBewohnerDisplayName(bewohnerById[row.member_id] || { name: t("budget:settlementTab.unknown") })}
                    </div>
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.prevMonthLabel")} <span className="font-medium tabular-nums text-sky-300 dark:text-sky-200">{currency(centsToEuro(row.opening_balance_cents))}</span></div>
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.newLabel")} <span className={`font-medium tabular-nums ${saldoAmountClass(centsToEuro(row.created_in_month_cents))}`}>{currency(centsToEuro(row.created_in_month_cents))}</span></div>
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.settledLabel")} <span className={`font-medium tabular-nums ${settledAmountClass(centsToEuro(row.settled_in_month_cents))}`}>{currency(centsToEuro(row.settled_in_month_cents))}</span></div>
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.openLabel")} <span className={`font-semibold tabular-nums ${saldoAmountClass(centsToEuro(row.closing_balance_cents))}`}>{currency(centsToEuro(row.closing_balance_cents))}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("budget:settlementTab.history")}</h3>
        </div>
        <div className="p-4 space-y-3">
          {!historyRows.length ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("budget:settlementTab.emptyHistory")}</p>
          ) : (
            historyRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-light-text-main dark:text-dark-text-main">
                    {bewohnerById[row.from_member_id]?.emoji} {getBewohnerDisplayName(bewohnerById[row.from_member_id] || { name: t("budget:settlementTab.unknown") })} → {bewohnerById[row.to_member_id]?.emoji} {getBewohnerDisplayName(bewohnerById[row.to_member_id] || { name: t("budget:settlementTab.unknown") })}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {row.date} {row.note ? `· ${translateNote(row.note)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold tabular-nums text-emerald-400 dark:text-emerald-300">{currency(Number(row.amount || 0))}</span>
                  <button onClick={() => handleDeleteSettlement(row.id)} disabled={deletingId === row.id || migrationBlocked} className="p-2 rounded-full text-red-500 hover:bg-red-500/10 disabled:opacity-60">
                    {deletingId === row.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
