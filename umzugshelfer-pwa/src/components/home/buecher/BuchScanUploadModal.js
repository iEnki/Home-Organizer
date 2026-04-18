import React, { useState, useRef } from "react";
import { Camera, Upload, X, Loader2, AlertCircle, BookOpen, MapPin, ChevronDown, Check, Edit2 } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { compressImage, fileToBase64 } from "../../../utils/imageTools";
import { cleanKiJsonResponse } from "../../../utils/kiClient";
import { normalizeIsbn, isValidIsbn } from "../../../utils/isbn";
import { erstelleImportBatch } from "../../../utils/buchImportMapping";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";
import { getBookSearchContext, resolveBookMatches } from "../../../utils/bookSearch";

const REGAL_PROMPT = `Du bist ein Bucherkennungs-Assistent. Analysiere dieses Regal-Foto und erkenne nur klar lesbare Buchtitel auf den Buchrücken. Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, keine Erklärungen):

{"buecher":[{"titel":"Erkannter Titel","autor":"Autor oder null","isbn":"falls lesbar oder null","confidence":0.85}]}

Regeln:
- Nur klar lesbare Titel aufnehmen
- confidence 0.0 bis 1.0
- Keine Halluzinationen
- Lieber weniger Treffer als unsichere Falschzuordnungen`;

async function suchePerIsbn(isbn) {
  return resolveBookMatches({
    query: isbn,
    mode: "isbn",
    limit: 4,
    language: "de",
    context: getBookSearchContext({ isbn13: isbn, language: "de" }),
    enableAi: false,
  });
}

async function suchePerTitel(titel, autor) {
  return resolveBookMatches({
    query: `${titel} ${autor ?? ""}`.trim(),
    mode: "title",
    limit: 4,
    language: "de",
    context: getBookSearchContext({
      title: titel,
      authors: autor ? [autor] : [],
      language: "de",
    }),
    enableAi: true,
  });
}

/**
 * Wählt aus mehreren API-Treffern den besten aus.
 * Bevorzugt: passender Autor, passende ISBN, höchstes Confidence.
 */
// eslint-disable-next-line no-unused-vars
function bestesTreffer(results, kiEintrag) {
  if (!results.length) return null;
  if (results.length === 1) return results[0];

  const autorNorm = (kiEintrag.autor ?? "").toLowerCase();
  const isbnNorm = kiEintrag.isbn ? normalizeIsbn(kiEintrag.isbn) : null;

  const scored = results.map((r) => {
    let score = r.confidence ?? 0.5;
    if (autorNorm && r.authorDisplay?.toLowerCase().includes(autorNorm)) score += 0.3;
    if (isbnNorm && (r.isbn13 === isbnNorm || r.isbn10 === isbnNorm)) score += 0.5;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].r;
}

function ConfidenceBadge({ value }) {
  if (value >= 0.8) return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-green-500/10 text-green-700 dark:text-green-400 font-medium">Sicher</span>;
  if (value >= 0.5) return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">Prüfen</span>;
  return <span className="px-1.5 py-0.5 text-xs rounded-pill bg-red-500/10 text-red-700 dark:text-red-400 font-medium">Unsicher</span>;
}

function KandidatZeile({ eintrag, idx, onStatusChange, onEditChange }) {
  const [editOffen, setEditOffen] = useState(false);
  const [titelEdit, setTitelEdit] = useState(
    eintrag.titelOverride ?? eintrag.bookResult?.title ?? eintrag.kiEintrag.titel ?? ""
  );
  const [autorEdit, setAutorEdit] = useState(
    eintrag.autorOverride ?? eintrag.bookResult?.authorDisplay ?? eintrag.kiEintrag.autor ?? ""
  );

  const abgelehnt = eintrag.status === "abgelehnt";

  const handleEditSpeichern = () => {
    onEditChange(idx, titelEdit, autorEdit);
    setEditOffen(false);
  };

  return (
    <div className={`rounded-card-sm border transition-colors ${
      abgelehnt
        ? "border-red-500/20 bg-red-500/5 opacity-60"
        : "border-light-border dark:border-dark-border"
    }`}>
      <div className="flex items-center gap-2.5 p-2.5">
        {/* Cover */}
        {getBuchCoverUrl(eintrag.bookResult) ? (
          <img src={getBuchCoverUrl(eintrag.bookResult)} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
        ) : (
          <div className="w-7 h-9 bg-teal-500/10 rounded flex items-center justify-center shrink-0">
            <BookOpen size={11} className="text-teal-500" />
          </div>
        )}

        {/* Titel + Autor */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
            {eintrag.titelOverride ?? eintrag.bookResult?.title ?? eintrag.kiEintrag.titel}
          </p>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
            {eintrag.autorOverride ?? eintrag.bookResult?.authorDisplay ?? eintrag.kiEintrag.autor ?? ""}
          </p>
        </div>

        {/* Confidence + Aktionen */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ConfidenceBadge value={eintrag.confidence} />
          {!abgelehnt && (
            <button
              onClick={() => setEditOffen((v) => !v)}
              className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-teal-500 transition-colors"
              title="Bearbeiten"
            >
              <Edit2 size={12} />
            </button>
          )}
          <button
            onClick={() => onStatusChange(idx, abgelehnt ? "ausstehend" : "abgelehnt")}
            className={`p-1 rounded transition-colors ${
              abgelehnt
                ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger"
            }`}
            title={abgelehnt ? "Wieder aufnehmen" : "Ablehnen"}
          >
            {abgelehnt ? <Check size={12} /> : <X size={12} />}
          </button>
        </div>
      </div>

      {/* Inline-Edit-Felder */}
      {editOffen && !abgelehnt && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-1.5 border-t border-light-border dark:border-dark-border">
          <input
            type="text"
            value={titelEdit}
            onChange={(e) => setTitelEdit(e.target.value)}
            placeholder="Titel"
            className="w-full px-2.5 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
          <input
            type="text"
            value={autorEdit}
            onChange={(e) => setAutorEdit(e.target.value)}
            placeholder="Autor"
            className="w-full px-2.5 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleEditSpeichern}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-teal-500 text-white"
            >
              <Check size={10} /> Übernehmen
            </button>
            <button
              onClick={() => { setTitelEdit(eintrag.titelOverride ?? eintrag.bookResult?.title ?? eintrag.kiEintrag.titel ?? ""); setAutorEdit(eintrag.autorOverride ?? eintrag.bookResult?.authorDisplay ?? eintrag.kiEintrag.autor ?? ""); setEditOffen(false); }}
              className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuchScanUploadModal({
  householdId,
  session,
  orte = [],
  lagerorte = [],
  onImportBatchErstellt,
  onAbbrechen,
}) {
  const userId = session?.user?.id;

  const [datei, setDatei] = useState(null);
  const [vorschauUrl, setVorschauUrl] = useState(null);
  const [analysiert, setAnalysiert] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState(null);
  // kandidaten: { kiEintrag, bookResult, confidence, status: "ausstehend"|"abgelehnt", titelOverride, autorOverride }
  const [kandidaten, setKandidaten] = useState([]);
  const [ortId, setOrtId] = useState("");
  const [lagerortId, setLagerortId] = useState("");
  const [speichern, setSpeichern] = useState(false);

  const inputRef = useRef(null);
  const uploadRef = useRef(null);

  const handleDateiAuswahl = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDatei(file);
    setVorschauUrl(URL.createObjectURL(file));
    setAnalysiert(false);
    setKandidaten([]);
    setFehler(null);
  };

  const handleAnalysieren = async () => {
    if (!datei) return;
    setLaden(true);
    setFehler(null);
    setKandidaten([]);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const token = sess?.access_token;
      if (!token) throw new Error("Nicht angemeldet.");

      // 1. Bild komprimieren + Base64
      const compressed = await compressImage(datei, 1200);
      const base64 = await fileToBase64(compressed);

      // 2. ki-vision aufrufen
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
      const visionRes = await fetch(`${supabaseUrl}/functions/v1/ki-vision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "chatgpt_vision",
          file_base64: base64,
          mime_type: "image/jpeg",
          prompt: REGAL_PROMPT,
        }),
      });

      if (visionRes.status === 401) throw new Error("Authentifizierungsfehler. Bitte neu anmelden.");
      if (visionRes.status === 409) throw new Error("Kein Bildanalyse-Key konfiguriert. Bitte in den Haushaltseinstellungen konfigurieren.");
      if (!visionRes.ok) throw new Error(`Analyse fehlgeschlagen (${visionRes.status}).`);

      const visionData = await visionRes.json();
      const rawText = visionData?.text ?? "";
      const cleaned = cleanKiJsonResponse(rawText, "object");
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Antwort der KI konnte nicht verarbeitet werden.");
      }

      const erkannte = parsed?.buecher ?? [];
      if (!erkannte.length) {
        setFehler("Keine lesbaren Bücher im Foto erkannt.");
        setAnalysiert(true);
        return;
      }

      // 3. Pro erkanntem Buch API-Abgleich
      const results = await Promise.all(
        erkannte.map(async (ki) => {
          const isbnNorm = ki.isbn ? normalizeIsbn(ki.isbn) : null;
          let resolved = { results: [], selected: null, needsReview: false };

          if (isbnNorm && isValidIsbn(isbnNorm)) {
            resolved = await suchePerIsbn(isbnNorm);
          }
          if (!resolved.results.length) {
            resolved = await suchePerTitel(ki.titel, ki.autor);
          }

          const bookResult = resolved.selected ?? null;
          const confidence = bookResult
            ? Math.max(bookResult.score ?? 0, bookResult.confidence ?? ki.confidence ?? 0.5)
            : Math.min(ki.confidence ?? 0.4, 0.49);

          return {
            kiEintrag: ki,
            bookResult,
            confidence,
            status: "ausstehend",
            titelOverride: null,
            autorOverride: null,
          };
        })
      );

      setKandidaten(results);
      setAnalysiert(true);
    } catch (e) {
      setFehler(e?.message ?? "Unbekannter Fehler.");
    } finally {
      setLaden(false);
    }
  };

  const handleStatusChange = (idx, neuerStatus) => {
    setKandidaten((prev) => prev.map((k, i) => i === idx ? { ...k, status: neuerStatus } : k));
  };

  const handleEditChange = (idx, titel, autor) => {
    setKandidaten((prev) => prev.map((k, i) =>
      i === idx ? { ...k, titelOverride: titel || null, autorOverride: autor || null } : k
    ));
  };

  const handleWeiter = async () => {
    const aktive = kandidaten.filter((k) => k.status !== "abgelehnt" && (k.bookResult || k.titelOverride || k.kiEintrag.titel));
    if (!aktive.length) return;
    setSpeichern(true);
    try {
      const batchKandidaten = aktive.map(({ kiEintrag, bookResult, confidence, titelOverride, autorOverride }) => {
        // Wenn kein API-Match, synthetisches BookResult aus KI-Daten + manuellen Overrides erstellen
        const effektivesResult = bookResult
          ? {
              ...bookResult,
              title: titelOverride ?? bookResult.title,
              authorDisplay: autorOverride ?? bookResult.authorDisplay,
              authors: autorOverride ? [autorOverride] : (bookResult.authors ?? []),
              confidence,
            }
          : {
              title: titelOverride ?? kiEintrag.titel,
              authorDisplay: autorOverride ?? kiEintrag.autor ?? "",
              authors: autorOverride ? [autorOverride] : (kiEintrag.autor ? [kiEintrag.autor] : []),
              confidence,
            };
        return {
          bookResult: effektivesResult,
          rohDaten: kiEintrag,
        };
      });

      const importId = await erstelleImportBatch(
        supabase, householdId, userId,
        batchKandidaten,
        ortId || null,
        lagerortId || null,
        "regal_scan",
      );
      onImportBatchErstellt(importId);
    } catch (e) {
      setFehler("Import fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setSpeichern(false);
    }
  };

  const aktiveAnzahl = kandidaten.filter((k) => k.status !== "abgelehnt").length;
  const hatAktive = aktiveAnzahl > 0;

  return (
    <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
      <div
        className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-md flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-teal-500" />
            <h2 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">Regal fotografieren</h2>
          </div>
          <button onClick={onAbbrechen} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="mobile-modal-body flex-1 p-4 space-y-4">
          {/* Foto-Auswahl */}
          <div>
            {/* Kamera-Input */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleDateiAuswahl}
              className="hidden"
            />
            {/* Galerie-Upload-Input */}
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              onChange={handleDateiAuswahl}
              className="hidden"
            />
            {vorschauUrl ? (
              <div className="space-y-2">
                <div className="relative rounded-card-sm overflow-hidden border border-light-border dark:border-dark-border">
                  <img src={vorschauUrl} alt="Regal-Vorschau" className="w-full object-cover max-h-48" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:text-teal-500 transition-colors"
                  >
                    <Camera size={13} /> Neu aufnehmen
                  </button>
                  <button
                    onClick={() => uploadRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:text-teal-500 transition-colors"
                  >
                    <Upload size={13} /> Anderes Foto
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-2 py-8 rounded-card-sm border-2 border-dashed border-teal-500/40 text-teal-500 hover:bg-teal-500/5 transition-colors"
                >
                  <Camera size={22} />
                  <span className="text-xs">Foto aufnehmen</span>
                </button>
                <button
                  onClick={() => uploadRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-2 py-8 rounded-card-sm border-2 border-dashed border-teal-500/40 text-teal-500 hover:bg-teal-500/5 transition-colors"
                >
                  <Upload size={22} />
                  <span className="text-xs">Foto hochladen</span>
                </button>
              </div>
            )}
          </div>

          {fehler && (
            <div className="flex items-start gap-2 text-xs text-accent-danger">
              <AlertCircle size={13} className="shrink-0 mt-0.5" /> {fehler}
            </div>
          )}

          {/* Laden-Anzeige */}
          {laden && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              <Loader2 size={16} className="animate-spin text-teal-500" />
              Regal wird analysiert…
            </div>
          )}

          {/* Erkannte Bücher mit Inline-Review */}
          {analysiert && kandidaten.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                  {kandidaten.length} {kandidaten.length === 1 ? "Buch" : "Bücher"} erkannt — {aktiveAnzahl} ausgewählt
                </p>
                {kandidaten.some((k) => k.status !== "abgelehnt") && (
                  <button
                    onClick={() => setKandidaten((prev) => prev.map((k) => ({ ...k, status: "abgelehnt" })))}
                    className="text-xs text-accent-danger hover:underline"
                  >
                    Alle ablehnen
                  </button>
                )}
              </div>
              {kandidaten.map((eintrag, idx) => (
                <KandidatZeile
                  key={idx}
                  eintrag={eintrag}
                  idx={idx}
                  onStatusChange={handleStatusChange}
                  onEditChange={handleEditChange}
                />
              ))}
            </div>
          )}

          {analysiert && kandidaten.length === 0 && !fehler && (
            <p className="text-sm text-center text-light-text-secondary dark:text-dark-text-secondary py-4">
              Keine Bücher erkannt. Versuche ein klareres Foto.
            </p>
          )}

          {/* Standort-Auswahl */}
          {analysiert && hatAktive && (
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
                <select
                  value={ortId}
                  onChange={(e) => setOrtId(e.target.value)}
                  className="w-full pl-7 pr-6 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main appearance-none focus:outline-none focus:border-primary-500"
                >
                  <option value="">Ort (optional)</option>
                  {orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={lagerortId}
                  onChange={(e) => setLagerortId(e.target.value)}
                  className="w-full px-2.5 pr-6 py-1.5 text-xs rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main appearance-none focus:outline-none focus:border-primary-500"
                >
                  <option value="">Lagerort (optional)</option>
                  {lagerorte.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mobile-modal-footer shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-between">
          <button
            onClick={onAbbrechen}
            className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>
          <div className="flex gap-2">
            {datei && !laden && !analysiert && (
              <button
                onClick={handleAnalysieren}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-card-sm bg-teal-500 text-white font-medium"
              >
                <Camera size={14} />
                Analysieren
              </button>
            )}
            {analysiert && datei && !laden && (
              <button
                onClick={handleAnalysieren}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
              >
                Neu analysieren
              </button>
            )}
            {analysiert && hatAktive && (
              <button
                onClick={handleWeiter}
                disabled={speichern}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-card-sm bg-teal-500 text-white font-medium disabled:opacity-40"
              >
                {speichern && <Loader2 size={14} className="animate-spin" />}
                Speichern ({aktiveAnzahl} {aktiveAnzahl === 1 ? "Buch" : "Bücher"})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
