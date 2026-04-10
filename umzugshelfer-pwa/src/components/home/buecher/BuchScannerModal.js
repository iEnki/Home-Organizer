import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  X, ScanLine, Loader2, AlertCircle, CheckCircle, BookOpen,
  Trash2, MapPin, ChevronDown
} from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { normalizeIsbn, isValidIsbn } from "../../../utils/isbn";
import { erstelleImportBatch } from "../../../utils/buchImportMapping";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";

const SCANNER_DIV_ID = "buch-scanner-region";
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

async function suchePerIsbn(isbn, token) {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/book-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: isbn, mode: "isbn", limit: 5, language: "de" }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function BuchScannerModal({
  modus = "einzel",
  householdId,
  session,
  orte = [],
  lagerorte = [],
  onBuchGefunden,
  onImportBatchErstellt,
  onAbbrechen,
}) {
  const userId = session?.user?.id;

  // scanning steuert die Kamera-Ansicht (true = läuft)
  const [scanning, setScanning] = useState(false);
  const [manuelleIsbn, setManuelleIsbn] = useState("");
  const [fehler, setFehler] = useState(null);
  const [treffer, setTreffer] = useState([]); // Einzel-Modus: Vorschlagsliste
  const [kandidaten, setKandidaten] = useState([]); // Stapel-Modus: { isbn, bookResult }
  const [gescannteIsbns, setGescannteIsbns] = useState(new Set());
  const [ladeTreffer, setLadeTreffer] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [ortId, setOrtId] = useState("");
  const [lagerortId, setLagerortId] = useState("");
  const [zuletzt, setZuletzt] = useState(null); // zuletzt gescannte ISBN (Stapel)

  const [hatGescannt, setHatGescannt] = useState(false);

  const scannerRef = useRef(null);
  const aktiv = useRef(false); // verhindert Race-Conditions im Callback
  const processingRef = useRef(false); // verhindert Doppelverarbeitung desselben Scans

  const getToken = async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    return sess?.access_token;
  };

  const verarbeiteIsbn = useCallback(async (rawIsbn) => {
    const norm = normalizeIsbn(rawIsbn);
    if (!isValidIsbn(norm)) {
      setFehler("Kein gültiger ISBN-Code erkannt.");
      return;
    }
    setFehler(null);

    if (modus === "stapel") {
      if (gescannteIsbns.has(norm)) return; // Duplikat ignorieren
      setGescannteIsbns((prev) => new Set(prev).add(norm));
      setZuletzt(norm);
      setLadeTreffer(true);
      try {
        const token = await getToken();
        const results = await suchePerIsbn(norm, token);
        const bookResult = results[0] ?? null;
        if (bookResult) {
          setKandidaten((prev) => [...prev, { isbn: norm, bookResult }]);
        } else {
          setKandidaten((prev) => [...prev, { isbn: norm, bookResult: null }]);
        }
      } finally {
        setLadeTreffer(false);
      }
    } else {
      // Einzel: API aufrufen, Treffer anzeigen
      setLadeTreffer(true);
      setTreffer([]);
      try {
        const token = await getToken();
        const results = await suchePerIsbn(norm, token);
        if (!results.length) {
          setFehler(`Kein Buch für ISBN ${norm} gefunden.`);
        } else {
          setTreffer(results);
        }
      } finally {
        setLadeTreffer(false);
      }
    }
  }, [modus, gescannteIsbns]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setFehler(null);
    try {
      const scanner = new Html5Qrcode(SCANNER_DIV_ID, { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
      scannerRef.current = scanner;
      aktiv.current = true;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 120 }, aspectRatio: 1.5 },
        (decodedText) => {
          if (!aktiv.current || processingRef.current) return;
          processingRef.current = true;
          if (modus === "einzel") {
            aktiv.current = false;
            (async () => {
              try {
                await stopScanner();
                await verarbeiteIsbn(decodedText);
              } finally {
                processingRef.current = false;
                setHatGescannt(true);
              }
            })();
          } else {
            verarbeiteIsbn(decodedText).finally(() => {
              processingRef.current = false;
            });
          }
        },
        () => { /* Scan-Fehler ignorieren */ }
      );
      setScanning(true);
    } catch (e) {
      setFehler("Kamera konnte nicht gestartet werden: " + (e?.message ?? e));
    }
  }, [modus, verarbeiteIsbn]);

  const stopScanner = useCallback(async () => {
    aktiv.current = false;
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const handleManuelleEingabe = async (e) => {
    e.preventDefault();
    if (!manuelleIsbn.trim()) return;
    await verarbeiteIsbn(manuelleIsbn.trim());
    setManuelleIsbn("");
  };

  const handleErneut = () => {
    setTreffer([]);
    setFehler(null);
    setLadeTreffer(false);
    setHatGescannt(false);
    setManuelleIsbn("");
    setZuletzt(null);
    processingRef.current = false;
    startScanner();
  };

  const handleKandidatEntfernen = (isbn) => {
    setKandidaten((prev) => prev.filter((k) => k.isbn !== isbn));
    setGescannteIsbns((prev) => {
      const next = new Set(prev);
      next.delete(isbn);
      return next;
    });
  };

  const handleImportieren = async () => {
    const gueltige = kandidaten.filter((k) => k.bookResult);
    if (!gueltige.length) return;
    setSpeichern(true);
    try {
      const batchKandidaten = gueltige.map(({ isbn, bookResult }) => ({
        bookResult,
        rohDaten: { isbn },
      }));
      const importId = await erstelleImportBatch(
        supabase, householdId, userId,
        batchKandidaten,
        ortId || null,
        lagerortId || null,
        "regal_scan",
      );
      await stopScanner();
      onImportBatchErstellt(importId);
    } catch (e) {
      setFehler("Import fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setSpeichern(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pb-[calc(var(--safe-area-bottom)+1rem)] bg-black/60">
      <div className="bg-light-card dark:bg-canvas-2 rounded-card max-h-[90dvh] w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine size={18} className="text-teal-500" />
            <h2 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
              {modus === "stapel" ? "Bücher scannen (Stapel)" : "ISBN scannen"}
            </h2>
          </div>
          <button onClick={() => { stopScanner(); onAbbrechen(); }} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Kamera-Bereich */}
          <div>
            <div
              id={SCANNER_DIV_ID}
              className={`w-full rounded-card-sm overflow-hidden border border-light-border dark:border-dark-border bg-canvas-1 ${!scanning ? "hidden" : ""}`}
              style={{ minHeight: 180 }}
            />
            {!scanning && (
              <button
                onClick={startScanner}
                className="w-full flex items-center justify-center gap-2 py-8 rounded-card-sm border-2 border-dashed border-teal-500/40 text-teal-500 hover:bg-teal-500/5 transition-colors text-sm"
              >
                <ScanLine size={20} />
                Kamera starten
              </button>
            )}
          </div>

          {/* Status-Zeile beim Stapel-Scan */}
          {modus === "stapel" && zuletzt && (
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center">
              Zuletzt gescannt: <span className="font-mono">{zuletzt}</span>
            </p>
          )}

          {ladeTreffer && (
            <div className="flex items-center justify-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary py-2">
              <Loader2 size={15} className="animate-spin" /> Buch wird gesucht…
            </div>
          )}

          {fehler && (
            <div className="flex items-center gap-2 text-xs text-accent-danger">
              <AlertCircle size={13} /> {fehler}
            </div>
          )}

          {/* Einzel-Modus: Erneut scannen nach abgeschlossenem Versuch */}
          {modus === "einzel" && hatGescannt && !scanning && !ladeTreffer && (
            <button
              onClick={handleErneut}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-card-sm border-2 border-dashed border-teal-500/40 text-teal-500 hover:bg-teal-500/5 transition-colors text-sm"
            >
              <ScanLine size={16} />
              Erneut scannen
            </button>
          )}

          {/* Einzel-Modus: Trefferliste */}
          {modus === "einzel" && treffer.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                Treffer — wähle das richtige Buch:
              </p>
              {treffer.map((buch, idx) => (
                <button
                  key={idx}
                  onClick={() => { stopScanner(); onBuchGefunden(buch); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-card-sm border border-light-border dark:border-dark-border hover:border-teal-500/40 text-left transition-colors"
                >
                  {getBuchCoverUrl(buch) ? (
                    <img src={getBuchCoverUrl(buch)} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-8 h-10 bg-teal-500/10 rounded flex items-center justify-center shrink-0">
                      <BookOpen size={13} className="text-teal-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">{buch.title}</p>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {buch.authorDisplay}{buch.publishedYear ? ` · ${buch.publishedYear}` : ""}
                    </p>
                  </div>
                  <CheckCircle size={15} className="text-teal-500 shrink-0 ml-auto" />
                </button>
              ))}
            </div>
          )}

          {/* Stapel-Modus: Kandidatenliste */}
          {modus === "stapel" && kandidaten.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                {kandidaten.length} {kandidaten.length === 1 ? "Buch" : "Bücher"} gescannt:
              </p>
              {kandidaten.map(({ isbn, bookResult }) => (
                <div key={isbn} className="flex items-center gap-3 p-2.5 rounded-card-sm border border-light-border dark:border-dark-border">
                  {getBuchCoverUrl(bookResult) ? (
                    <img src={getBuchCoverUrl(bookResult)} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-7 h-9 bg-teal-500/10 rounded flex items-center justify-center shrink-0">
                      <BookOpen size={11} className="text-teal-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {bookResult ? (
                      <>
                        <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">{bookResult.title}</p>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{bookResult.authorDisplay}</p>
                      </>
                    ) : (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-mono">{isbn} — kein Treffer</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleKandidatEntfernen(isbn)}
                    className="shrink-0 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {/* Standort-Auswahl */}
              <div className="grid grid-cols-2 gap-2 pt-1">
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
            </div>
          )}

          {/* Manuelle ISBN-Eingabe */}
          <form onSubmit={handleManuelleEingabe} className="flex gap-2">
            <input
              type="text"
              value={manuelleIsbn}
              onChange={(e) => setManuelleIsbn(e.target.value)}
              placeholder="ISBN manuell eingeben…"
              className="flex-1 px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 font-mono"
            />
            <button
              type="submit"
              disabled={!manuelleIsbn.trim()}
              className="px-3 py-2 text-sm rounded-card-sm bg-teal-500 text-white font-medium disabled:opacity-40"
            >
              Suchen
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex gap-2 justify-between">
          <button
            onClick={() => { stopScanner(); onAbbrechen(); }}
            className="px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main"
          >
            Abbrechen
          </button>

          {modus === "stapel" && (
            <button
              onClick={handleImportieren}
              disabled={speichern || !kandidaten.some((k) => k.bookResult)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-card-sm bg-teal-500 text-white font-medium disabled:opacity-40"
            >
              {speichern && <Loader2 size={14} className="animate-spin" />}
              Importieren ({kandidaten.filter((k) => k.bookResult).length} {kandidaten.filter((k) => k.bookResult).length === 1 ? "Buch" : "Bücher"})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
