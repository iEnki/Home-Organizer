import React, { useState } from "react";
import { X, BookOpen, Loader2 } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { logVerlauf } from "../../../utils/homeVerlauf";
import { notifyHouseholdEvent } from "../../../utils/pushNotifications";

const inputCls =
  "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";
const labelCls =
  "block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1";

// modus: "verleihen" | "verlaengern" | "zurueckgeben"
export default function BuchVerleihModal({
  buch,
  modus = "verleihen",
  session,
  kontakte = [],
  onErledigt,
  onAbbrechen,
}) {
  const userId = session?.user?.id;

  const [form, setForm] = useState({
    verliehen_an_name:        buch.verliehen_an_name ?? "",
    verliehen_an_kontakt_id:  buch.verliehen_an_kontakt_id ?? "",
    verliehen_seit:           buch.verliehen_seit ?? new Date().toISOString().slice(0, 10),
    rueckgabe_erwartet_am:    buch.rueckgabe_erwartet_am ?? "",
    erinnerung_aktiv:         buch.erinnerung_aktiv ?? false,
    erinnerung_intervall_tage: buch.erinnerung_intervall_tage?.toString() ?? "7",
  });
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState(null);

  const titel =
    modus === "verleihen"
      ? "Buch verleihen"
      : modus === "verlaengern"
      ? "Ausleihe verlängern"
      : "Buch zurückgeben";

  const handleSpeichern = async () => {
    setLaden(true);
    setFehler(null);
    try {
      if (modus === "zurueckgeben") {
        // Status zurücksetzen, Ausleihfelder leeren
        const { error } = await supabase
          .from("home_buecher")
          .update({
            status:                    "im_regal",
            verliehen_an_name:         null,
            verliehen_an_kontakt_id:   null,
            verliehen_seit:            null,
            rueckgabe_erwartet_am:     null,
            erinnerung_aktiv:          false,
          })
          .eq("id", buch.id);
        if (error) throw error;

        const { error: vErr } = await supabase.from("home_buch_verleihverlauf").insert({
          user_id:     userId,
          buch_id:     buch.id,
          ereignis:    "zurueckgegeben",
          person_name: buch.verliehen_an_name ?? null,
          kontakt_id:  buch.verliehen_an_kontakt_id ?? null,
          datum:       new Date().toISOString().slice(0, 10),
        });
        if (vErr) console.error("Verlaufsfehler:", vErr);

      } else if (modus === "verlaengern") {
        const { error } = await supabase
          .from("home_buecher")
          .update({
            rueckgabe_erwartet_am:      form.rueckgabe_erwartet_am || null,
            erinnerung_aktiv:           form.erinnerung_aktiv,
            erinnerung_intervall_tage:  parseInt(form.erinnerung_intervall_tage) || 7,
          })
          .eq("id", buch.id);
        if (error) throw error;

        const { error: vErr } = await supabase.from("home_buch_verleihverlauf").insert({
          user_id:     userId,
          buch_id:     buch.id,
          ereignis:    "verlaengert",
          person_name: buch.verliehen_an_name ?? null,
          kontakt_id:  buch.verliehen_an_kontakt_id ?? null,
          datum:       new Date().toISOString().slice(0, 10),
          notiz:       form.rueckgabe_erwartet_am
            ? `Rückgabe verlängert bis ${form.rueckgabe_erwartet_am}`
            : null,
        });
        if (vErr) console.error("Verlaufsfehler:", vErr);

      } else {
        // verleihen
        if (!form.verliehen_an_name.trim() && !form.verliehen_an_kontakt_id) {
          setFehler("Bitte Namen oder Kontakt angeben.");
          setLaden(false);
          return;
        }
        const nameAnzeige = form.verliehen_an_kontakt_id
          ? kontakte.find((k) => k.id === form.verliehen_an_kontakt_id)?.name ?? form.verliehen_an_name
          : form.verliehen_an_name;

        const { error } = await supabase
          .from("home_buecher")
          .update({
            status:                    "verliehen",
            verliehen_an_name:         nameAnzeige || null,
            verliehen_an_kontakt_id:   form.verliehen_an_kontakt_id || null,
            verliehen_seit:            form.verliehen_seit || null,
            rueckgabe_erwartet_am:     form.rueckgabe_erwartet_am || null,
            erinnerung_aktiv:          form.erinnerung_aktiv,
            erinnerung_intervall_tage: parseInt(form.erinnerung_intervall_tage) || 7,
          })
          .eq("id", buch.id);
        if (error) throw error;

        const { error: vErr } = await supabase.from("home_buch_verleihverlauf").insert({
          user_id:     userId,
          buch_id:     buch.id,
          ereignis:    "verliehen",
          person_name: nameAnzeige || null,
          kontakt_id:  form.verliehen_an_kontakt_id || null,
          datum:       form.verliehen_seit || new Date().toISOString().slice(0, 10),
        });
        if (vErr) console.error("Verlaufsfehler:", vErr);
      }

      await logVerlauf(supabase, userId, "home_buecher", buch.titel, "geaendert");
      await notifyHouseholdEvent({
        supabaseClient: supabase,
        userId,
        table: "home_buecher",
        action: "geaendert",
        recordName: buch.titel,
        recordId: buch.id,
        url: "/home/inventar?tab=buecher",
        history: false,
        pushPolicy: "always",
        title:
          modus === "zurueckgeben"
            ? "Buch zurueckgegeben"
            : modus === "verlaengern"
              ? "Buch-Ausleihe verlaengert"
              : "Buch verliehen",
        body:
          modus === "zurueckgeben"
            ? `"${buch.titel}" wurde zurueckgegeben.`
            : modus === "verlaengern"
              ? `"${buch.titel}" wurde bis ${form.rueckgabe_erwartet_am || "unbekannt"} verlaengert.`
              : `"${buch.titel}" wurde an ${form.verliehen_an_name || "unbekannt"} verliehen.`,
      });
      onErledigt();
    } catch (e) {
      setFehler(e.message ?? "Fehler beim Speichern.");
    } finally {
      setLaden(false);
    }
  };

  return (
    <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
      <div
        className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card flex flex-col w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-light-border dark:border-dark-border p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-teal-500" />
            <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{titel}</h2>
          </div>
          <button onClick={onAbbrechen} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="mobile-modal-body flex-1 p-4 pb-2 space-y-4">
          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
            {buch.titel}
          </p>

          {modus === "zurueckgeben" ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Das Buch wird als zurückgegeben markiert und der Ausleihstatus wird zurückgesetzt.
            </p>
          ) : (
            <>
              {modus === "verleihen" && (
                <>
                  <div>
                    <label className={labelCls}>Kontakt</label>
                    <select
                      value={form.verliehen_an_kontakt_id}
                      onChange={(e) => {
                        const k = kontakte.find((c) => c.id === e.target.value);
                        setForm((p) => ({
                          ...p,
                          verliehen_an_kontakt_id: e.target.value,
                          verliehen_an_name: k?.name ?? p.verliehen_an_name,
                        }));
                      }}
                      className={inputCls}
                    >
                      <option value="">— Kontakt wählen —</option>
                      {kontakte.map((k) => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>oder Name eingeben</label>
                    <input
                      type="text"
                      value={form.verliehen_an_name}
                      onChange={(e) => setForm((p) => ({ ...p, verliehen_an_name: e.target.value }))}
                      className={inputCls}
                      placeholder="Vorname Nachname"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Verliehen seit</label>
                    <input type="date" value={form.verliehen_seit} onChange={(e) => setForm((p) => ({ ...p, verliehen_seit: e.target.value }))} className={inputCls} />
                  </div>
                </>
              )}

              <div>
                <label className={labelCls}>Rückgabe erwartet</label>
                <input type="date" value={form.rueckgabe_erwartet_am} onChange={(e) => setForm((p) => ({ ...p, rueckgabe_erwartet_am: e.target.value }))} className={inputCls} />
              </div>

              <label className="flex items-center gap-2 text-sm text-light-text-main dark:text-dark-text-main cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.erinnerung_aktiv}
                  onChange={(e) => setForm((p) => ({ ...p, erinnerung_aktiv: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary-500"
                />
                Push-Erinnerung aktivieren
              </label>

              {form.erinnerung_aktiv && (
                <div>
                  <label className={labelCls}>Erinnerungsintervall (Tage)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.erinnerung_intervall_tage}
                    onChange={(e) => setForm((p) => ({ ...p, erinnerung_intervall_tage: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              )}
            </>
          )}

          {fehler && <p className="text-xs text-accent-danger">{fehler}</p>}
        </div>

        {/* Footer */}
        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-end">
          <button onClick={onAbbrechen} className="px-4 py-2 text-sm rounded-pill border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3">
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            disabled={laden}
            className="px-4 py-2 text-sm rounded-pill bg-primary-500 text-white font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {laden && <Loader2 size={14} className="animate-spin" />}
            {modus === "zurueckgeben" ? "Zurückgeben" : modus === "verlaengern" ? "Verlängern" : "Verleihen"}
          </button>
        </div>
      </div>
    </div>
  );
}
