import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X, CheckCircle, XCircle, Edit2, Loader2, AlertCircle, BookOpen,
  CheckCheck, Trash2
} from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { kandidatZuBuch } from "../../../utils/buchImportMapping";
import { logVerlauf } from "../../../utils/homeVerlauf";
import { notifyHouseholdBatchEvent } from "../../../utils/pushNotifications";

function ConfidenceBadge({ value }) {
  if (value == null) return null;
  if (value >= 0.8) return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-green-500/10 text-green-700 dark:text-green-400 font-medium">Sicher</span>;
  if (value >= 0.5) return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">Prüfen</span>;
  return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-red-500/10 text-red-700 dark:text-red-400 font-medium">Unsicher</span>;
}

function KandidatZeile({ kandidat, onStatusChange, t }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [titel, setTitel] = useState(kandidat.vorschlag?.titel ?? "");
  const [autor, setAutor] = useState(kandidat.vorschlag?.autor_anzeige ?? "");

  const v = kandidat.vorschlag ?? {};
  const status = kandidat.review_status;

  const statusFarbe = {
    bestaetigt: "border-green-500/40 bg-green-500/5",
    abgelehnt:  "border-red-500/20 bg-red-500/5 opacity-60",
    ausstehend: "",
  }[status] ?? "";

  const handleBearbeitenSpeichern = () => {
    const neuerVorschlag = { ...kandidat.vorschlag, titel, autor_anzeige: autor, autoren: autor ? [autor] : [] };
    onStatusChange(kandidat.id, "bestaetigt", neuerVorschlag);
    setBearbeiten(false);
  };

  return (
    <div className={`rounded-card-sm border border-light-border dark:border-dark-border p-3 space-y-2 transition-colors ${statusFarbe}`}>
      <div className="flex items-start gap-3">
        {v.thumbnail_url || v.cover_url ? (
          <img src={v.thumbnail_url ?? v.cover_url} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
        ) : (
          <div className="w-8 h-10 bg-teal-500/10 rounded flex items-center justify-center shrink-0">
            <BookOpen size={13} className="text-teal-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {bearbeiten ? (
            <div className="space-y-1.5">
              <input
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                placeholder="Titel"
                className="w-full px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
              <input
                value={autor}
                onChange={(e) => setAutor(e.target.value)}
                placeholder="Autor"
                className="w-full px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
              />
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">{v.titel ?? "(kein Titel)"}</p>
              {v.autor_anzeige && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{v.autor_anzeige}</p>}
            </>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {v.erscheinungsjahr && <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{v.erscheinungsjahr}</span>}
            {(v.isbn_13 || v.isbn_10) && (
              <span className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary">{v.isbn_13 ?? v.isbn_10}</span>
            )}
            <ConfidenceBadge value={kandidat.confidence} />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {bearbeiten ? (
          <>
            <button
              onClick={handleBearbeitenSpeichern}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-card-sm bg-green-500 text-white"
            >
              <CheckCircle size={11} /> {t("books:importReview.applyItem")}
            </button>
            <button
              onClick={() => setBearbeiten(false)}
              className="px-2.5 py-1 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
            >
              {t("books:importReview.cancelEdit")}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onStatusChange(kandidat.id, "bestaetigt", null)}
              disabled={status === "bestaetigt"}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-card-sm transition-colors ${
                status === "bestaetigt"
                  ? "bg-green-500 text-white"
                  : "border border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10"
              }`}
            >
              <CheckCircle size={11} /> {t("books:importReview.applyItem")}
            </button>
            <button
              onClick={() => setBearbeiten(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3"
            >
              <Edit2 size={11} /> {t("books:importReview.editItem")}
            </button>
            <button
              onClick={() => onStatusChange(kandidat.id, "abgelehnt", null)}
              disabled={status === "abgelehnt"}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-card-sm transition-colors ${
                status === "abgelehnt"
                  ? "bg-red-500 text-white"
                  : "border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
              }`}
            >
              <XCircle size={11} /> {t("books:importReview.rejectItem")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BuchImportReviewModal({
  importId,
  householdId,
  session,
  onErledigt,
  onAbbrechen,
}) {
  const { t } = useTranslation(["books"]);
  const userId = session?.user?.id;

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState(null);
  const [importDaten, setImportDaten] = useState(null);
  const [kandidaten, setKandidaten] = useState([]);
  const [speichern, setSpeichern] = useState(false);

  const ladeDaten = useCallback(async () => {
    if (!importId) return;
    setLaden(true);
    setFehler(null);
    try {
      const [{ data: imp, error: impErr }, { data: kands, error: kandErr }] = await Promise.all([
        supabase.from("home_buch_importe").select("*").eq("id", importId).single(),
        supabase.from("home_buch_import_kandidaten").select("*").eq("import_id", importId).order("created_at"),
      ]);
      if (impErr) throw impErr;
      if (kandErr) throw kandErr;
      setImportDaten(imp);
      setKandidaten(kands ?? []);
    } catch (e) {
      setFehler(e?.message ?? t("books:shelf.errLoad"));
    } finally {
      setLaden(false);
    }
  }, [importId, t]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  const handleStatusChange = (kandId, neuerStatus, neuerVorschlag) => {
    setKandidaten((prev) =>
      prev.map((k) => {
        if (k.id !== kandId) return k;
        return {
          ...k,
          review_status: neuerStatus,
          vorschlag: neuerVorschlag !== null ? neuerVorschlag : k.vorschlag,
        };
      })
    );
  };

  const handleAlleHohenUebernehmen = () => {
    setKandidaten((prev) =>
      prev.map((k) => {
        if ((k.confidence ?? 0) >= 0.8 && k.review_status === "ausstehend") {
          return { ...k, review_status: "bestaetigt" };
        }
        return k;
      })
    );
  };

  const handleAlleVerwerfen = () => {
    setKandidaten((prev) => prev.map((k) => ({ ...k, review_status: "abgelehnt" })));
  };

  const handleSpeichern = async () => {
    const bestaetigte = kandidaten.filter((k) => k.review_status === "bestaetigt");
    setSpeichern(true);
    try {
      const ortId = importDaten?.ort_id ?? null;
      const lagerortId = importDaten?.lagerort_id ?? null;

      for (const kand of bestaetigte) {
        const buchPayload = kandidatZuBuch(kand, householdId, userId, ortId, lagerortId);
        const { data: neuesBuch, error: buchErr } = await supabase
          .from("home_buecher")
          .insert(buchPayload)
          .select("id")
          .single();
        if (buchErr) throw buchErr;

        await supabase
          .from("home_buch_import_kandidaten")
          .update({ review_status: "bestaetigt", buch_id: neuesBuch.id })
          .eq("id", kand.id);

        await logVerlauf(supabase, userId, "home_buecher", kand.vorschlag?.titel ?? "Buch", "erstellt");
      }

      const abgelehnte = kandidaten.filter((k) => k.review_status === "abgelehnt");
      for (const kand of abgelehnte) {
        await supabase
          .from("home_buch_import_kandidaten")
          .update({ review_status: "abgelehnt" })
          .eq("id", kand.id);
      }

      const alleEntschieden = kandidaten.every(
        (k) => k.review_status === "bestaetigt" || k.review_status === "abgelehnt"
      );
      const neuerStatus = alleEntschieden
        ? (bestaetigte.length > 0 ? "abgeschlossen" : "verworfen")
        : "in_bearbeitung";

      await supabase
        .from("home_buch_importe")
        .update({ status: neuerStatus })
        .eq("id", importId);

      if (bestaetigte.length > 0) {
        await notifyHouseholdBatchEvent({
          supabaseClient: supabase,
          userId,
          table: "home_buecher",
          action: "erstellt",
          eintraege: bestaetigte.map((kand) => ({
            datensatz_name: kand.vorschlag?.titel ?? "Buch",
            aktion: "erstellt",
          })),
          url: "/home/inventar?tab=buecher",
          history: false,
          title: "Buch-Import gespeichert",
          body: `${bestaetigte.length} ${bestaetigte.length === 1 ? "Buch wurde" : "Bücher wurden"} ins Regal übernommen.`,
        });
      }

      onErledigt();
    } catch (e) {
      setFehler(t("books:form.errSave") + ": " + (e?.message ?? e));
    } finally {
      setSpeichern(false);
    }
  };

  const bestaetigte = kandidaten.filter((k) => k.review_status === "bestaetigt").length;
  const ausstehende = kandidaten.filter((k) => k.review_status === "ausstehend").length;
  const hoheKonfidenz = kandidaten.filter(
    (k) => k.review_status === "ausstehend" && (k.confidence ?? 0) >= 0.8
  ).length;

  if (laden) {
    return (
      <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
        <div className="bg-light-card dark:bg-canvas-2 rounded-card p-8 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-teal-500" />
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("books:importReview.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
      <div
        className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-lg flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">{t("books:importReview.title")}</h2>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
              {t("books:importReview.candidateCount", { count: kandidaten.length })}
              {ausstehende > 0 ? ` · ${t("books:importReview.pendingCount", { count: ausstehende })}` : ""}
              {bestaetigte > 0 ? ` · ${t("books:importReview.confirmedCount", { count: bestaetigte })}` : ""}
            </p>
          </div>
          <button onClick={onAbbrechen} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        {/* Sammelaktionen */}
        {kandidaten.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-b border-light-border dark:border-dark-border flex gap-2 flex-wrap">
            {hoheKonfidenz > 0 && (
              <button
                onClick={handleAlleHohenUebernehmen}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10"
              >
                <CheckCheck size={12} />
                {t("books:importReview.applyAll")} ({hoheKonfidenz})
              </button>
            )}
            <button
              onClick={handleAlleVerwerfen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={12} />
              {t("books:importReview.rejectAll")}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="mobile-modal-body flex-1 p-4 space-y-3">
          {fehler && (
            <div className="flex items-start gap-2 text-xs text-accent-danger">
              <AlertCircle size={13} className="shrink-0 mt-0.5" /> {fehler}
            </div>
          )}

          {kandidaten.length === 0 && !laden && (
            <p className="text-sm text-center text-light-text-secondary dark:text-dark-text-secondary py-8">
              {t("books:importReview.empty")}
            </p>
          )}

          {kandidaten.map((kand) => (
            <KandidatZeile
              key={kand.id}
              kandidat={kand}
              onStatusChange={handleStatusChange}
              t={t}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-between">
          <button
            onClick={onAbbrechen}
            className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
          >
            {t("books:importReview.close")}
          </button>
          <button
            onClick={handleSpeichern}
            disabled={speichern}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-card-sm bg-teal-500 text-white font-medium disabled:opacity-40"
          >
            {speichern && <Loader2 size={14} className="animate-spin" />}
            {bestaetigte > 0
              ? `${t("books:importReview.save")} (${t("books:shelf.bookCount", { count: bestaetigte })})`
              : t("books:importReview.rejectImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
