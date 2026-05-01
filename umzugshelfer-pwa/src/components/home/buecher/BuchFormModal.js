import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Loader2, AlertTriangle, BookOpen, ScanLine, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import {
  BUCH_STATUS,
  BUCH_ZUSTAND,
  formatAutoren,
} from "../../../utils/buecher";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";
import { pruefeAufDubletten } from "../../../utils/buchDuplikate";
import { normalizeIsbn, isValidIsbn } from "../../../utils/isbn";
import { getBookSearchContext, removePersistedBookCover, resolveBookMatches, searchBooks } from "../../../utils/bookSearch";
import { notifyHouseholdEvent } from "../../../utils/pushNotifications";
import BuchScannerModal from "./BuchScannerModal";
import BuchCoverSucheModal from "./BuchCoverSucheModal";

const inputCls =
  "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";
const labelCls =
  "block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1";

const DEFAULT_FORM = {
  titel: "",
  untertitel: "",
  autoren: "",        // kommagetrennt im UI, wird als Array gespeichert
  isbn_13: "",
  verlag: "",
  erscheinungsjahr: "",
  sprache: "de",
  seitenzahl: "",
  beschreibung: "",
  tags: "",           // kommagetrennt
  ort_id: "",
  lagerort_id: "",
  status: "im_regal",
  zustand: "",
  anzahl: "1",
  notizen: "",
  // interne Felder (aus API, kein Eingabefeld)
  isbn_10: "",
  cover_url: "",
  thumbnail_url: "",
  api_quelle: "",
  api_ref: "",
  api_payload: null,
};

const mapBuchToForm = (b) => ({
  titel:           b.titel ?? "",
  untertitel:      b.untertitel ?? "",
  autoren:         formatAutoren(b.autoren),
  isbn_13:         b.isbn_13 ?? "",
  verlag:          b.verlag ?? "",
  erscheinungsjahr: b.erscheinungsjahr?.toString() ?? "",
  sprache:         b.sprache ?? "de",
  seitenzahl:      b.seitenzahl?.toString() ?? "",
  beschreibung:    b.beschreibung ?? "",
  tags:            (b.tags ?? []).join(", "),
  ort_id:          b.ort_id ?? "",
  lagerort_id:     b.lagerort_id ?? "",
  status:          b.status ?? "im_regal",
  zustand:         b.zustand ?? "",
  anzahl:          b.anzahl?.toString() ?? "1",
  notizen:         b.notizen ?? "",
  isbn_10:         b.isbn_10 ?? "",
  cover_url:       b.cover_url ?? "",
  thumbnail_url:   b.thumbnail_url ?? "",
  api_quelle:      b.api_quelle ?? "",
  api_ref:         b.api_ref ?? "",
  api_payload:     b.api_payload ?? null,
});

const str2null = (v) => (v === "" || v == null ? null : v);
const parseIntOrNull = (v) => {
  const n = parseInt(v);
  return isNaN(n) ? null : n;
};
const splitComma = (v) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const clearSelectedCoverInPayload = (apiPayload) => {
  if (!apiPayload || typeof apiPayload !== "object") return null;
  if (!apiPayload.selectedCover) return apiPayload;

  return {
    ...apiPayload,
    selectedCover: {
      ...apiPayload.selectedCover,
      url: null,
      storedUrl: null,
      storagePath: null,
    },
  };
};

export default function BuchFormModal({
  buch = null,         // null = Neuanlage
  prefill = null,      // BookResult aus Scanner / Barcode zum Vorausfüllen
  householdId,
  session,
  orte = [],
  lagerorte = [],
  onSpeichern,
  onAbbrechen,
}) {
  const { t } = useTranslation(["books"]);
  const userId = session?.user?.id;
  const istNeu = !buch;

  const [form, setForm] = useState(() =>
    buch ? mapBuchToForm(buch) : { ...DEFAULT_FORM },
  );
  const [scannerOffen, setScannerOffen] = useState(false);
  const [coverSucheOffen, setCoverSucheOffen] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [speichern, setSpeichern] = useState(false);

  // API-Suche
  const [suchbegriff, setSuchbegriff] = useState("");
  const [suchLaed, setSuchLaed] = useState(false);
  const [suchErgebnisse, setSuchErgebnisse] = useState([]);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // Dublettenwarnung
  const [dubletten, setDubletten] = useState([]);

  const filteredLagerorte = useMemo(
    () =>
      form.ort_id
        ? lagerorte.filter((l) => l.ort_id === form.ort_id)
        : lagerorte,
    [lagerorte, form.ort_id],
  );

  const aktuellesCover = useMemo(
    () => getBuchCoverUrl(form),
    [form],
  );

  // API-Suche mit Debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (suchbegriff.length < 3) {
      setSuchErgebnisse([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setSuchLaed(true);
      try {
        const context = getBookSearchContext({
          titel: form.titel,
          untertitel: form.untertitel,
          autoren: splitComma(form.autoren),
          isbn_13: form.isbn_13,
          isbn_10: form.isbn_10,
          verlag: form.verlag,
          erscheinungsjahr: form.erscheinungsjahr ? Number(form.erscheinungsjahr) : null,
          sprache: form.sprache,
        });
        const normIsbn = normalizeIsbn(suchbegriff);
        const isIsbn = isValidIsbn(normIsbn);
        const titleQuery = suchbegriff.trim().split(/\s+/).slice(0, 6).join(" ");
        const ergebnisse = await searchBooks({
          query: isIsbn ? normIsbn : titleQuery,
          mode: isIsbn ? "isbn" : "title",
          limit: 8,
          language: "",
          context,
        });
        setSuchErgebnisse(ergebnisse);
      } catch (e) {
        if (e.name !== "AbortError") console.error("Buchsuche Fehler:", e);
      } finally {
        setSuchLaed(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [suchbegriff, form.autoren, form.erscheinungsjahr, form.isbn_10, form.isbn_13, form.sprache, form.titel, form.untertitel, form.verlag]);

  // Dublettenprüfung bei Titel/Autor/ISBN-Änderung
  useEffect(() => {
    if (!householdId || !form.titel) { setDubletten([]); return; }
    const timeout = setTimeout(async () => {
      const treffer = await pruefeAufDubletten(
        supabase,
        householdId,
        {
          titel: form.titel,
          autoren: splitComma(form.autoren),
          isbn13: form.isbn_13 || undefined,
          isbn10: form.isbn_10 || undefined,
          lagerortId: form.lagerort_id || undefined,
        },
        buch?.id ?? null,
      );
      setDubletten(treffer);
    }, 600);
    return () => clearTimeout(timeout);
  }, [form.titel, form.autoren, form.isbn_13, form.lagerort_id, householdId, buch?.id, form.isbn_10]);

  const uebernehmeVorschlag = useCallback((ergebnis) => {
    setForm((prev) => ({
      ...prev,
      titel:           ergebnis.title ?? prev.titel,
      untertitel:      ergebnis.subtitle ?? prev.untertitel,
      autoren:         formatAutoren(ergebnis.authors),
      isbn_13:         ergebnis.isbn13 ?? prev.isbn_13,
      isbn_10:         ergebnis.isbn10 ?? prev.isbn_10,
      verlag:          ergebnis.publisher ?? prev.verlag,
      erscheinungsjahr: ergebnis.publishedYear?.toString() ?? prev.erscheinungsjahr,
      sprache:         ergebnis.language ?? prev.sprache,
      seitenzahl:      ergebnis.pageCount?.toString() ?? prev.seitenzahl,
      beschreibung:    ergebnis.description ?? prev.beschreibung,
      cover_url:       ergebnis.coverUrl ?? prev.cover_url,
      thumbnail_url:   ergebnis.thumbnailUrl ?? prev.thumbnail_url,
      api_quelle:      ergebnis.source ?? prev.api_quelle,
      api_ref:         ergebnis.sourceRef ?? prev.api_ref,
      api_payload:     clearSelectedCoverInPayload(prev.api_payload),
    }));
    setSuchbegriff("");
    setSuchErgebnisse([]);
  }, []);

  // Prefill bei Neuanlage aus Scanner-Ergebnis
  useEffect(() => {
    if (prefill && istNeu) {
      uebernehmeVorschlag(prefill);
    }
    // Nur beim ersten Render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ISBN-Direktsuche bei Blur (isbn_13-Feld)
  const handleIsbnBlur = useCallback(async (raw) => {
    const norm = normalizeIsbn(raw);
    if (!isValidIsbn(norm)) return;
    setSuchLaed(true);
    try {
      const resolved = await resolveBookMatches({
        query: norm,
        mode: "isbn",
        limit: 5,
        language: "",
        context: getBookSearchContext({
          titel: form.titel,
          untertitel: form.untertitel,
          autoren: splitComma(form.autoren),
          isbn_13: form.isbn_13 || norm,
          isbn_10: form.isbn_10,
          verlag: form.verlag,
          erscheinungsjahr: form.erscheinungsjahr ? Number(form.erscheinungsjahr) : null,
          sprache: form.sprache,
        }),
      });
      if (resolved.results.length) {
        setSuchErgebnisse(resolved.results);
      }
    } catch (e) {
      if (e.name !== "AbortError") console.error("ISBN-Suche Fehler:", e);
    } finally {
      setSuchLaed(false);
    }
  }, [form.autoren, form.erscheinungsjahr, form.isbn_10, form.isbn_13, form.sprache, form.titel, form.untertitel, form.verlag]);

  const handleCoverEntfernen = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      cover_url: "",
      thumbnail_url: "",
      api_payload: clearSelectedCoverInPayload(prev.api_payload),
    }));
  }, []);

  const handleSpeichern = async () => {
    if (!form.titel.trim()) { setFehler(t("books:form.errTitleRequired")); return; }
    setSpeichern(true);
    setFehler(null);
    try {
      const originalCoverUrl = buch ? getBuchCoverUrl(buch) : null;
      const finalCoverUrl = aktuellesCover;
      const shouldRemovePreviousStoredCover =
        !istNeu &&
        Boolean(buch?.api_payload?.selectedCover?.storagePath) &&
        originalCoverUrl !== finalCoverUrl;

      const payload = {
        titel:            form.titel.trim(),
        untertitel:       str2null(form.untertitel),
        autoren:          splitComma(form.autoren),
        autor_anzeige:    splitComma(form.autoren).join(", ") || null,
        isbn_13:          str2null(form.isbn_13),
        isbn_10:          str2null(form.isbn_10),
        verlag:           str2null(form.verlag),
        erscheinungsjahr: parseIntOrNull(form.erscheinungsjahr),
        sprache:          str2null(form.sprache),
        seitenzahl:       parseIntOrNull(form.seitenzahl),
        beschreibung:     str2null(form.beschreibung),
        tags:             splitComma(form.tags),
        ort_id:           str2null(form.ort_id),
        lagerort_id:      str2null(form.lagerort_id),
        status:           form.status,
        zustand:          str2null(form.zustand),
        anzahl:           parseIntOrNull(form.anzahl) ?? 1,
        notizen:          str2null(form.notizen),
        cover_url:        str2null(form.cover_url),
        thumbnail_url:    str2null(form.thumbnail_url),
        api_quelle:       str2null(form.api_quelle),
        api_ref:          str2null(form.api_ref),
        api_payload:      form.api_payload ?? null,
      };

      if (istNeu) {
        payload.user_id = userId;
        payload.created_by_user_id = userId;
        const { data, error } = await supabase.from("home_buecher").insert(payload).select("id").single();
        if (error) throw error;
        await notifyHouseholdEvent({
          supabaseClient: supabase,
          userId,
          table: "home_buecher",
          action: "erstellt",
          recordName: payload.titel,
          recordId: data?.id,
          url: "/home/inventar?tab=buecher",
        });
      } else {
        const { error } = await supabase
          .from("home_buecher")
          .update(payload)
          .eq("id", buch.id);
        if (error) throw error;
        await notifyHouseholdEvent({
          supabaseClient: supabase,
          userId,
          table: "home_buecher",
          action: "geaendert",
          recordName: payload.titel,
          recordId: buch.id,
          url: "/home/inventar?tab=buecher",
          pushPolicy: "always",
        });
      }

      if (shouldRemovePreviousStoredCover) {
        await removePersistedBookCover(buch?.api_payload?.selectedCover ?? null);
      }

      onSpeichern();
    } catch (e) {
      setFehler(e.message ?? t("books:form.errSave"));
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
      <div
        className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card flex flex-col w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-light-border dark:border-dark-border p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-teal-500" />
            <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
              {istNeu ? t("books:form.addTitle") : t("books:form.editTitle")}
            </h2>
          </div>
          <button onClick={onAbbrechen} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="mobile-modal-body flex-1 p-4 pb-2 space-y-4">
          {/* API-Suche */}
          <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3 space-y-2">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
              {t("books:form.searchDb")}
            </p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
              <input
                type="text"
                value={suchbegriff}
                onChange={(e) => setSuchbegriff(e.target.value)}
                placeholder={t("books:form.searchPlaceholder")}
                className={`${inputCls} pl-8`}
              />
              {suchLaed && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-light-text-secondary dark:text-dark-text-secondary" />}
            </div>
            {suchErgebnisse.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {suchErgebnisse.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => uebernehmeVorschlag(e)}
                    className="w-full text-left px-3 py-2 rounded-card-sm hover:bg-light-border dark:hover:bg-canvas-3 text-sm"
                  >
                    <p className="font-medium text-light-text-main dark:text-dark-text-main truncate">{e.title}</p>
                    {e.authorDisplay && (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{e.authorDisplay}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {aktuellesCover ? (
            <div className="rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
              <div className="flex items-start gap-3">
                <img
                  src={aktuellesCover}
                  alt={`Cover von ${form.titel || "Buch"}`}
                  className="w-16 h-24 rounded object-cover shrink-0 border border-light-border dark:border-dark-border"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                    {t("books:form.currentCover")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoverSucheOffen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-primary-500/30 text-primary-500 hover:bg-primary-500/10"
                    >
                      <ImageIcon size={12} />
                      {t("books:form.changeCover")}
                    </button>
                    <button
                      type="button"
                      onClick={handleCoverEntfernen}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-card-sm border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10"
                    >
                      <Trash2 size={12} />
                      {t("books:form.removeCover")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : form.titel.trim().length >= 2 ? (
            <button
              type="button"
              onClick={() => setCoverSucheOffen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-card-sm border border-dashed border-light-border dark:border-dark-border
                         text-xs text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/40 hover:text-primary-500 transition-colors"
            >
              <ImageIcon size={14} />
              {t("books:form.searchCover")}
            </button>
          ) : null}

          {/* Dublettenwarnung */}
          {dubletten.length > 0 && (
            <div className="flex items-start gap-2 rounded-card-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {t("books:form.duplicate", { title: dubletten[0].titel })}
              </span>
            </div>
          )}

          {/* Pflichtfelder */}
          <div>
            <label className={labelCls}>{t("books:form.titleLabel")}</label>
            <input type="text" value={form.titel} onChange={(e) => setForm((p) => ({ ...p, titel: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t("books:form.subtitle")}</label>
            <input type="text" value={form.untertitel} onChange={(e) => setForm((p) => ({ ...p, untertitel: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t("books:form.authors")}</label>
            <input type="text" value={form.autoren} onChange={(e) => setForm((p) => ({ ...p, autoren: e.target.value }))} className={inputCls} placeholder={t("books:form.authorsPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("books:form.isbn13")}</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={form.isbn_13}
                  onChange={(e) => setForm((p) => ({ ...p, isbn_13: e.target.value }))}
                  onBlur={(e) => handleIsbnBlur(e.target.value)}
                  className={`${inputCls} flex-1`}
                  placeholder={t("books:form.isbnPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => setScannerOffen(true)}
                  className="flex items-center justify-center px-2 py-2 rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-canvas-3 shrink-0"
                  title={t("books:form.scanIsbn")}
                >
                  <ScanLine size={14} />
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>{t("books:form.publisher")}</label>
              <input type="text" value={form.verlag} onChange={(e) => setForm((p) => ({ ...p, verlag: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t("books:form.year")}</label>
              <input type="number" value={form.erscheinungsjahr} onChange={(e) => setForm((p) => ({ ...p, erscheinungsjahr: e.target.value }))} className={inputCls} placeholder="2024" />
            </div>
            <div>
              <label className={labelCls}>{t("books:form.language")}</label>
              <input type="text" value={form.sprache} onChange={(e) => setForm((p) => ({ ...p, sprache: e.target.value }))} className={inputCls} placeholder={t("books:form.languagePlaceholder")} />
            </div>
            <div>
              <label className={labelCls}>{t("books:form.pages")}</label>
              <input type="number" value={form.seitenzahl} onChange={(e) => setForm((p) => ({ ...p, seitenzahl: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("books:form.description")}</label>
            <textarea rows={3} value={form.beschreibung} onChange={(e) => setForm((p) => ({ ...p, beschreibung: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t("books:form.tags")}</label>
            <input type="text" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} className={inputCls} placeholder={t("books:form.tagsPlaceholder")} />
          </div>

          {/* Standort */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("books:form.location")}</label>
              <select value={form.ort_id} onChange={(e) => setForm((p) => ({ ...p, ort_id: e.target.value, lagerort_id: "" }))} className={inputCls}>
                <option value="">{t("books:form.locationNone")}</option>
                {orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("books:form.storageLocation")}</label>
              <select value={form.lagerort_id} onChange={(e) => setForm((p) => ({ ...p, lagerort_id: e.target.value }))} className={inputCls}>
                <option value="">{t("books:form.storageNone")}</option>
                {filteredLagerorte.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Status/Zustand/Anzahl */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t("books:form.statusLabel")}</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
                {Object.keys(BUCH_STATUS).map((val) => (
                  <option key={val} value={val}>{t(`books:status.${val}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("books:form.conditionLabel")}</label>
              <select value={form.zustand} onChange={(e) => setForm((p) => ({ ...p, zustand: e.target.value }))} className={inputCls}>
                <option value="">—</option>
                {Object.keys(BUCH_ZUSTAND).map((val) => (
                  <option key={val} value={val}>{t(`books:condition.${val}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("books:form.quantity")}</label>
              <input type="number" min="1" value={form.anzahl} onChange={(e) => setForm((p) => ({ ...p, anzahl: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("books:form.notes")}</label>
            <textarea rows={2} value={form.notizen} onChange={(e) => setForm((p) => ({ ...p, notizen: e.target.value }))} className={inputCls} />
          </div>

          {fehler && (
            <p className="text-xs text-accent-danger">{fehler}</p>
          )}
        </div>

        {/* Footer */}
        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-2 flex gap-2 justify-end">
          <button onClick={onAbbrechen} className="px-4 py-1.5 text-sm rounded-pill border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-3">
            {t("books:form.cancel")}
          </button>
          <button
            onClick={handleSpeichern}
            disabled={speichern || !form.titel.trim()}
            className="px-4 py-1.5 text-sm rounded-pill bg-primary-500 text-white font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {speichern && <Loader2 size={14} className="animate-spin" />}
            {t("books:form.save")}
          </button>
        </div>
      </div>

      {scannerOffen && (
        <BuchScannerModal
          modus="einzel"
          householdId={householdId}
          session={session}
          orte={orte}
          lagerorte={lagerorte}
          onBuchGefunden={(bookResult) => {
            setScannerOffen(false);
            uebernehmeVorschlag(bookResult);
          }}
          onImportBatchErstellt={() => setScannerOffen(false)}
          onAbbrechen={() => setScannerOffen(false)}
        />
      )}

      {coverSucheOffen && (
        <BuchCoverSucheModal
          buchData={form}
          onBestaetigen={(coverUrl) => {
            setForm((prev) => ({ ...prev, cover_url: coverUrl, thumbnail_url: coverUrl }));
            setCoverSucheOffen(false);
          }}
          onAbbrechen={() => setCoverSucheOffen(false)}
        />
      )}
    </div>
  );
}
