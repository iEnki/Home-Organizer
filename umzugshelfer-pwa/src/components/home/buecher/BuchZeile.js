import React, { useState } from "react";
import { ChevronDown, ChevronUp, Edit2, Trash2, BookOpen, ArrowRightLeft, RefreshCw, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { BUCH_STATUS, BUCH_STATUS_FARBEN, BUCH_ZUSTAND } from "../../../utils/buecher";
import { supabase } from "../../../supabaseClient";
import { normalizeIsbn, isValidIsbn } from "../../../utils/isbn";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";

export default function BuchZeile({ buch, onBearbeiten, onVerleihen, onLoeschen }) {
  const [offen, setOffen] = useState(false);
  const [refreshLaden, setRefreshLaden] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null); // null | "ok" | "fehler" | "kein_treffer"
  const [refreshVorschau, setRefreshVorschau] = useState(null); // neues BookResult zur Vorschau

  const statusLabel = BUCH_STATUS[buch.status] ?? buch.status;
  const statusFarbe = BUCH_STATUS_FARBEN[buch.status] ?? "";

  const handleMetadatenRefresh = async () => {
    setRefreshLaden(true);
    setRefreshStatus(null);
    setRefreshVorschau(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setRefreshStatus("fehler"); return; }

      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;

      let mode = "title";
      let query = `${buch.titel ?? ""} ${buch.autor_anzeige ?? ""}`.trim();

      const isbnNorm = buch.isbn_13 ? normalizeIsbn(buch.isbn_13) : (buch.isbn_10 ? normalizeIsbn(buch.isbn_10) : null);
      if (isbnNorm && isValidIsbn(isbnNorm)) {
        mode = "isbn";
        query = isbnNorm;
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/book-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, mode, limit: 3, language: "de" }),
      });

      if (!res.ok) { setRefreshStatus("fehler"); return; }
      const results = await res.json();
      if (!Array.isArray(results) || !results.length) { setRefreshStatus("kein_treffer"); return; }

      setRefreshVorschau(results[0]);
      setRefreshStatus("vorschau");
    } catch {
      setRefreshStatus("fehler");
    } finally {
      setRefreshLaden(false);
    }
  };

  const handleRefreshBestaetigen = async () => {
    if (!refreshVorschau) return;
    const ERLAUBTE_FELDER = ["beschreibung", "cover_url", "thumbnail_url", "verlag", "seitenzahl", "erscheinungsjahr"];
    const update = {};
    for (const feld of ERLAUBTE_FELDER) {
      const neuerWert = refreshVorschau[{
        beschreibung: "description",
        cover_url: "coverUrl",
        thumbnail_url: "thumbnailUrl",
        verlag: "publisher",
        seitenzahl: "pageCount",
        erscheinungsjahr: "publishedYear",
      }[feld]];
      if (neuerWert != null && neuerWert !== "") {
        update[feld] = neuerWert;
      }
    }
    if (Object.keys(update).length) {
      await supabase.from("home_buecher").update(update).eq("id", buch.id);
    }
    setRefreshStatus("ok");
    setRefreshVorschau(null);
  };

  return (
    <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 overflow-hidden">
      {/* Kopfzeile */}
      <button
        onClick={() => setOffen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-light-bg dark:hover:bg-canvas-1 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {getBuchCoverUrl(buch) ? (
            <img src={getBuchCoverUrl(buch)} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
          ) : (
            <div className="w-8 h-10 rounded bg-teal-500/10 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-teal-500" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">{buch.titel}</p>
            {buch.autor_anzeige && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{buch.autor_anzeige}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`hidden sm:inline px-2 py-0.5 text-xs rounded-pill font-medium ${statusFarbe}`}>
            {statusLabel}
          </span>
          {offen ? <ChevronUp size={15} className="text-light-text-secondary dark:text-dark-text-secondary" /> : <ChevronDown size={15} className="text-light-text-secondary dark:text-dark-text-secondary" />}
        </div>
      </button>

      {/* Detailbereich */}
      {offen && (
        <div className="px-4 pb-3 pt-1 border-t border-light-border dark:border-dark-border space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {buch.verlag && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">Verlag</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{buch.verlag}</p>
              </div>
            )}
            {buch.erscheinungsjahr && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">Jahr</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{buch.erscheinungsjahr}</p>
              </div>
            )}
            {buch.isbn_13 && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">ISBN-13</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{buch.isbn_13}</p>
              </div>
            )}
            {buch.seitenzahl && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">Seiten</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{buch.seitenzahl}</p>
              </div>
            )}
            {buch.zustand && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">Zustand</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{BUCH_ZUSTAND[buch.zustand] ?? buch.zustand}</p>
              </div>
            )}
            {buch.anzahl > 1 && (
              <div>
                <span className="text-light-text-secondary dark:text-dark-text-secondary">Anzahl</span>
                <p className="font-medium text-light-text-main dark:text-dark-text-main">{buch.anzahl}</p>
              </div>
            )}
          </div>

          {/* Verleihinfo */}
          {buch.status === "verliehen" && (
            <div className="rounded-card-sm bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {buch.verliehen_an_name && <p>Ausgeliehen an: <strong>{buch.verliehen_an_name}</strong></p>}
              {buch.verliehen_seit && <p>Seit: {buch.verliehen_seit}</p>}
              {buch.rueckgabe_erwartet_am && <p>Rückgabe bis: {buch.rueckgabe_erwartet_am}</p>}
            </div>
          )}

          {buch.notizen && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary italic">{buch.notizen}</p>
          )}

          {buch.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {buch.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 text-xs rounded-pill bg-teal-500/10 text-teal-700 dark:text-teal-300">{t}</span>
              ))}
            </div>
          )}

          {/* Metadaten-Refresh Vorschau */}
          {refreshStatus === "vorschau" && refreshVorschau && (
            <div className="rounded-card-sm border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs space-y-1">
              <p className="font-medium text-light-text-main dark:text-dark-text-main">Neue Metadaten gefunden:</p>
              {refreshVorschau.description && <p className="text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">{refreshVorschau.description}</p>}
              {refreshVorschau.publisher && <p>Verlag: <span className="font-medium">{refreshVorschau.publisher}</span></p>}
              {refreshVorschau.pageCount && <p>Seiten: <span className="font-medium">{refreshVorschau.pageCount}</span></p>}
              {refreshVorschau.publishedYear && <p>Jahr: <span className="font-medium">{refreshVorschau.publishedYear}</span></p>}
              <div className="flex gap-2 pt-1">
                <button onClick={handleRefreshBestaetigen} className="flex items-center gap-1 px-2 py-1 rounded bg-teal-500 text-white">
                  <CheckCircle size={11} /> Übernehmen
                </button>
                <button onClick={() => { setRefreshStatus(null); setRefreshVorschau(null); }} className="px-2 py-1 rounded border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main">
                  Verwerfen
                </button>
              </div>
            </div>
          )}
          {refreshStatus === "ok" && (
            <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1">
              <CheckCircle size={11} /> Metadaten aktualisiert.
            </p>
          )}
          {refreshStatus === "kein_treffer" && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
              <AlertCircle size={11} /> Kein Treffer gefunden.
            </p>
          )}
          {refreshStatus === "fehler" && (
            <p className="text-xs text-accent-danger flex items-center gap-1">
              <AlertCircle size={11} /> Fehler beim Aktualisieren.
            </p>
          )}

          {/* Aktionen */}
          <div className="flex gap-2 pt-1 flex-wrap">
            <button
              onClick={() => onBearbeiten(buch)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3"
            >
              <Edit2 size={12} /> Bearbeiten
            </button>
            <button
              onClick={() => onVerleihen(buch)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3"
            >
              <ArrowRightLeft size={12} />
              {buch.status === "verliehen" ? "Ausleihe" : "Verleihen"}
            </button>
            <button
              onClick={handleMetadatenRefresh}
              disabled={refreshLaden}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 disabled:opacity-50"
              title="Metadaten aus Datenbank nachladen"
            >
              {refreshLaden ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Aktualisieren
            </button>
            <button
              onClick={() => onLoeschen(buch)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10"
            >
              <Trash2 size={12} /> Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
