import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getBewohnerDisplayName } from "../../utils/budgetAccounts";
import KostenAufteilungAuswahl from "./KostenAufteilungAuswahl";
import { validateSplitConfig } from "../../utils/budgetSplits";

const HOME_KATEGORIEN = [
  "Lebensmittel", "Haushalt", "Reparaturen", "Abonnements",
  "Versicherungen", "Einrichtung", "Tanken", "Rücklagen", "Sonstiges",
];

const INPUT_CLS = "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

const SPLIT_MODE_LABEL = { equal: 'Gleichmäßig', fixed: 'Fest', percent: 'Prozent' };

export default function BudgetSplitDefaults({ householdId, bewohner = [], kategorien }) {
  const [defaults, setDefaults] = useState([]);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState(null);

  // Bearbeitungs-State
  const [editModal, setEditModal] = useState(null); // null | { kategorie, ...splitFields } | { id, kategorie, ...splitFields }
  const [speichern, setSpeichern] = useState(false);
  const [validierungsFehler, setValidierungsFehler] = useState(null);

  const alleKategorien = kategorien || HOME_KATEGORIEN;

  const ladeDefaults = useCallback(async () => {
    if (!householdId) return;
    setLaden(true);
    try {
      const { data, error } = await supabase
        .from("home_budget_split_defaults")
        .select("*")
        .eq("household_id", householdId)
        .order("kategorie");
      if (error) throw error;
      setDefaults(data || []);
    } catch (err) {
      setFehler(`Fehler beim Laden: ${err.message}`);
    } finally {
      setLaden(false);
    }
  }, [householdId]);

  useEffect(() => { ladeDefaults(); }, [ladeDefaults]);

  const oeffneNeu = () => {
    // Erste freie Kategorie vorschlagen
    const belegte = new Set(defaults.map(d => d.kategorie));
    const frei = alleKategorien.find(k => !belegte.has(k)) || alleKategorien[0];
    setEditModal({
      kategorie: frei,
      splitAktiv: true,
      splitMode: 'equal',
      payerMemberId: bewohner[0]?.id || null,
      teilnehmer: bewohner.map(b => b.id),
      sharesInput: {},
    });
    setValidierungsFehler(null);
  };

  const oeffneEdit = (eintrag) => {
    const sharesInputRaw = eintrag.shares_input && typeof eintrag.shares_input === 'object' ? eintrag.shares_input : {};
    setEditModal({
      id: eintrag.id,
      kategorie: eintrag.kategorie,
      splitAktiv: true,
      splitMode: eintrag.split_mode || 'equal',
      payerMemberId: eintrag.payer_member_id || null,
      teilnehmer: eintrag.teilnehmer_ids || [],
      sharesInput: sharesInputRaw,
    });
    setValidierungsFehler(null);
  };

  const handleSpeichern = async () => {
    if (!editModal || !householdId) return;

    const config = {
      aktiv: true,
      payerMemberId: editModal.payerMemberId,
      splitMode: editModal.splitMode,
      teilnehmer: editModal.teilnehmer,
      sharesInput: editModal.sharesInput,
      betrag: 100, // Dummy-Betrag für Validierung (Prozentwerte werden als solche geprüft)
    };
    const valFehler = validateSplitConfig(config);
    if (valFehler) { setValidierungsFehler(valFehler); return; }
    setValidierungsFehler(null);

    setSpeichern(true);
    try {
      const payload = {
        household_id: householdId,
        kategorie: editModal.kategorie,
        payer_member_id: editModal.payerMemberId,
        split_mode: editModal.splitMode,
        teilnehmer_ids: editModal.teilnehmer,
        shares_input: editModal.splitMode !== 'equal' ? editModal.sharesInput : null,
      };
      if (editModal.id) {
        const { error } = await supabase
          .from("home_budget_split_defaults")
          .update(payload)
          .eq("id", editModal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("home_budget_split_defaults")
          .upsert(payload, { onConflict: "household_id,kategorie" });
        if (error) throw error;
      }
      setEditModal(null);
      await ladeDefaults();
    } catch (err) {
      setValidierungsFehler(`Fehler beim Speichern: ${err.message}`);
    } finally {
      setSpeichern(false);
    }
  };

  const handleLoeschen = async (id) => {
    if (!window.confirm("Standard-Verteilung für diese Kategorie löschen?")) return;
    try {
      const { error } = await supabase
        .from("home_budget_split_defaults")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await ladeDefaults();
    } catch (err) {
      setFehler(`Fehler beim Löschen: ${err.message}`);
    }
  };

  const bewohnerById = Object.fromEntries((bewohner || []).map(b => [b.id, b]));

  return (
    <div className="rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-light-border dark:border-dark-border">
        <div>
          <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
            Standard-Verteilungen
          </h3>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
            Wird beim Erstellen einer neuen Buchung automatisch vorausgefüllt.
          </p>
        </div>
        <button
          onClick={oeffneNeu}
          className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
        >
          <Plus size={14} />
          Neu
        </button>
      </div>

      <div className="p-4 space-y-2">
        {fehler && (
          <div className="rounded-card-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {fehler}
          </div>
        )}
        {laden ? (
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Lade...</p>
        ) : defaults.length === 0 ? (
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Noch keine Standard-Verteilungen angelegt.
          </p>
        ) : (
          defaults.map(eintrag => {
            const payer = bewohnerById[eintrag.payer_member_id];
            const teilnehmer = (eintrag.teilnehmer_ids || []).map(id => bewohnerById[id]).filter(Boolean);
            return (
              <div key={eintrag.id} className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                    {eintrag.kategorie}
                  </p>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {SPLIT_MODE_LABEL[eintrag.split_mode] || eintrag.split_mode}
                    {payer ? ` · Zahler: ${payer.emoji} ${getBewohnerDisplayName(payer)}` : ''}
                    {teilnehmer.length > 0 ? ` · ${teilnehmer.map(b => b.emoji).join('')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => oeffneEdit(eintrag)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500"
                    title="Bearbeiten"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleLoeschen(eintrag.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10"
                    title="Löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bearbeitungs-Modal */}
      {editModal && (
        <div className="mobile-modal-overlay fixed inset-0 z-[110] flex justify-center bg-black/60 backdrop-blur-sm">
          <div className="mobile-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card shadow-elevation-3 max-w-md w-full border border-light-border dark:border-dark-border flex min-h-0 flex-col">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {editModal.id ? 'Standard-Verteilung bearbeiten' : 'Neue Standard-Verteilung'}
              </h3>
              <button onClick={() => setEditModal(null)} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main">
                <X size={18} />
              </button>
            </div>
            <div className="mobile-modal-body flex-1 p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">Kategorie</label>
                <select
                  value={editModal.kategorie}
                  onChange={e => setEditModal(prev => ({ ...prev, kategorie: e.target.value }))}
                  className={INPUT_CLS}
                >
                  {alleKategorien.map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <KostenAufteilungAuswahl
                bewohner={bewohner}
                betrag={100}
                splitAktiv={editModal.splitAktiv}
                onSplitAktivChange={v => setEditModal(prev => ({ ...prev, splitAktiv: v }))}
                vorgestrecktVon={editModal.payerMemberId}
                teilnehmer={editModal.teilnehmer}
                onVorgestrecktVonChange={v => setEditModal(prev => ({ ...prev, payerMemberId: v }))}
                onTeilnehmerChange={v => setEditModal(prev => ({ ...prev, teilnehmer: v }))}
                splitMode={editModal.splitMode}
                onSplitModeChange={v => setEditModal(prev => ({ ...prev, splitMode: v, sharesInput: {} }))}
                sharesInput={editModal.sharesInput}
                onSharesInputChange={v => setEditModal(prev => ({ ...prev, sharesInput: v }))}
                showSettlementHinweis={false}
              />
              {validierungsFehler && (
                <p className="text-sm text-accent-danger">{validierungsFehler}</p>
              )}
            </div>
            <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2">
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-card-sm hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-main dark:text-dark-text-main"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSpeichern}
                disabled={speichern}
                className="flex-1 px-3 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-pill disabled:opacity-50"
              >
                {speichern ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
