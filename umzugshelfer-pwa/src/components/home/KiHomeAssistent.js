import React, { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import OpenAI from "openai";
import { ReactMic } from "react-mic";
import { getKiClient, isKiClientReady, startSpeechRecognition } from "../../utils/kiClient";
import { motion } from "framer-motion";
import {
  Mic, StopCircle, Send, Type, X, AlertTriangle, UploadCloud,
  CheckSquare, Sparkles, Eye, EyeOff, Settings, HelpCircle, ChevronUp,
} from "lucide-react";

// ── Modul-Konfiguration ──────────────────────────────────────────────────────
const MODUL_CONFIG = {
  inventar: {
    titel: "Objekte per KI erfassen",
    beschreibung: 'z.B. „Bohrmaschine liegt im Kellerregal"',
    felder: "name, kategorie, ort (optional), menge (optional, default 1)",
    schema: '{"name":"Bohrmaschine","kategorie":"Werkzeug","ort":"Keller","menge":1}',
    ergebnisLabel: "Erkannte Objekte",
    renderItem: (item) => `${item.name}${item.menge > 1 ? ` (${item.menge}x)` : ""}${item.kategorie ? ` — ${item.kategorie}` : ""}${item.ort ? ` @ ${item.ort}` : ""}`,
    hilfe: [
      '"Bohrmaschine liegt im Kellerregal" → Objekt mit Standort',
      '"2 Winterjacken im Kleiderschrank, Kategorie Kleidung" → Menge + Kategorie',
      '"Raclette-Grill, eingelagert, Küche" → Gerät mit Status',
    ],
  },
  vorraete: {
    titel: "Vorräte per KI erfassen",
    beschreibung: 'z.B. „Milch 2 Liter und Butter im Kühlschrank"',
    felder: "name, menge (Zahl), einheit (Liter/Stück/kg/etc.), kategorie (optional)",
    schema: '{"name":"Milch","menge":2,"einheit":"Liter","kategorie":"Kühlwaren"}',
    ergebnisLabel: "Erkannte Vorräte",
    renderItem: (item) => `${item.name}${item.menge ? ` — ${item.menge} ${item.einheit || ""}` : ""}${item.kategorie ? ` (${item.kategorie})` : ""}`,
    hilfe: [
      '"Milch 2 Liter und Butter im Kühlschrank" → mehrere Vorräte auf einmal',
      '"Kaffee 500g, Kategorie Getränke" → mit Einheit + Kategorie',
      '"3 Flaschen Olivenöl" → Menge + Einheit',
    ],
  },
  einkaufliste: {
    titel: "Einkaufsliste per KI",
    beschreibung: 'z.B. „Lege Milch und Butter auf die Einkaufsliste"',
    felder: "name, menge (Zahl, optional, default 1), einheit (optional), kategorie (optional)",
    schema: '{"name":"Butter","menge":1,"einheit":"Stück","kategorie":"Milchprodukte"}',
    ergebnisLabel: "Erkannte Einkaufsartikel",
    renderItem: (item) => `${item.name}${item.menge ? ` — ${item.menge} ${item.einheit || ""}` : ""}${item.kategorie ? ` (${item.kategorie})` : ""}`,
    hilfe: [
      '"Milch, Butter und Brot kaufen" → mehrere Artikel auf einmal',
      '"2 Liter Orangensaft" → Menge + Einheit',
      '"Shampoo, Kategorie Drogerie" → mit Kategorie',
    ],
  },
  geraete: {
    titel: "Gerät per KI erfassen",
    beschreibung: 'z.B. „Waschmaschine Bosch Wartung alle 12 Monate"',
    felder: "name, hersteller (optional), modell (optional), wartungsintervall_monate (Zahl, optional)",
    schema: '{"name":"Waschmaschine","hersteller":"Bosch","modell":"Serie 6","wartungsintervall_monate":12}',
    ergebnisLabel: "Erkannte Geräte",
    renderItem: (item) => `${item.name}${item.hersteller ? ` — ${item.hersteller}` : ""}${item.wartungsintervall_monate ? ` (Wartung alle ${item.wartungsintervall_monate} Monate)` : ""}`,
    hilfe: [
      '"Waschmaschine Bosch Serie 6, Wartung alle 12 Monate" → Gerät mit Intervall',
      '"Geschirrspüler Siemens" → Gerät ohne Wartungsplan',
      '"Heizung Vaillant, Wartung jährlich" → Jahresintervall',
    ],
  },
  aufgaben: {
    titel: "Aufgaben per KI erstellen",
    beschreibung: 'z.B. „Keller aufräumen bis Ende April, monatlich wiederholen"',
    felder: "beschreibung, prioritaet (Hoch/Mittel/Niedrig, optional), faelligkeitsdatum (ISO-Datum, optional), wiederholung_typ (Keine/Täglich/Wöchentlich/Monatlich/Jährlich, optional)",
    schema: '{"beschreibung":"Keller aufräumen","prioritaet":"Mittel","faelligkeitsdatum":"2026-04-30","wiederholung_typ":"Monatlich"}',
    ergebnisLabel: "Erkannte Aufgaben",
    renderItem: (item) => `${item.beschreibung}${item.prioritaet ? ` [${item.prioritaet}]` : ""}${item.faelligkeitsdatum ? ` — bis ${item.faelligkeitsdatum}` : ""}${item.wiederholung_typ && item.wiederholung_typ !== "Keine" ? ` (${item.wiederholung_typ})` : ""}`,
    hilfe: [
      '"Keller aufräumen bis Ende April, monatlich" → Aufgabe mit Datum + Wiederholung',
      '"Rauchmelder testen, Priorität Hoch" → mit Priorität',
      '"Reifenwechsel beauftragen nächsten Montag" → Aufgabe mit Fälligkeitsdatum',
    ],
  },
  budget: {
    titel: "Zahlung per KI erfassen",
    beschreibung: 'z.B. „Netflix 12,99 Euro monatlich" oder „Strom 80 Euro"',
    felder: "beschreibung, betrag (Zahl), kategorie (optional), wiederholen (true/false), intervall (Monatlich/Jährlich/etc., wenn wiederholen=true)",
    schema: '{"beschreibung":"Netflix","betrag":12.99,"kategorie":"Abonnement","wiederholen":true,"intervall":"Monatlich"}',
    ergebnisLabel: "Erkannte Zahlungen",
    renderItem: (item) => `${item.beschreibung} — ${item.betrag} €${item.kategorie ? ` (${item.kategorie})` : ""}${item.wiederholen ? ` · ${item.intervall}` : ""}`,
    hilfe: [
      '"Netflix 12,99 Euro monatlich" → wiederkehrende Ausgabe',
      '"Strom 80 Euro" → einmalige Ausgabe',
      '"Miete 950 Euro monatlich, Kategorie Wohnen" → mit Kategorie',
    ],
  },
  // ── Umzugsplaner-Module ────────────────────────────────────────────────────
  todos: {
    titel: "Aufgaben per KI erstellen",
    beschreibung: 'z.B. „Zahnarzt anrufen bis Freitag, wichtig"',
    felder: "beschreibung, kategorie (optional), prioritaet (Hoch/Mittel/Niedrig, optional), faelligkeitsdatum (ISO-Datum, optional)",
    schema: '{"beschreibung":"Zahnarzt anrufen","kategorie":"Gesundheit","prioritaet":"Hoch","faelligkeitsdatum":"2026-03-20"}',
    ergebnisLabel: "Erkannte Aufgaben",
    renderItem: (item) =>
      `${item.beschreibung}${item.prioritaet ? ` [${item.prioritaet}]` : ""}${item.faelligkeitsdatum ? ` — bis ${item.faelligkeitsdatum}` : ""}`,
    hilfe: [
      '"Zahnarzt anrufen bis Freitag, wichtig" → Aufgabe mit Fälligkeit + Priorität',
      '"Reifenwechsel beauftragen nächste Woche" → Aufgabe mit Datum',
      '"Keller aufräumen, monatlich" → Wiederholende Aufgabe',
    ],
  },
  packliste: {
    titel: "Packliste per KI befüllen",
    beschreibung: 'z.B. „Bücher und Laptop in Kiste 3, Arbeitszimmer"',
    felder: 'aktion ("gegenstand_hinzufuegen" oder "raum_zuweisen"), für gegenstand_hinzufuegen: gegenstand, menge, kiste, kategorie; für raum_zuweisen: kiste_name, raum',
    schema: '{"aktion":"gegenstand_hinzufuegen","gegenstand":"Bücher","menge":3,"kiste":"Kiste 3","kategorie":"Büro"}',
    ergebnisLabel: "Erkannte Packlist-Aktionen",
    renderItem: (item) =>
      item.aktion === "gegenstand_hinzufuegen"
        ? `${item.gegenstand}${item.menge > 1 ? ` (${item.menge}x)` : ""} → ${item.kiste}${item.kategorie ? ` (${item.kategorie})` : ""}`
        : `Raum: ${item.kiste_name} → ${item.raum}`,
    hilfe: [
      '"Bücher und Laptop in Kiste 3, Kategorie Büro" → Gegenstände mit Kiste',
      '"Kiste 1 kommt ins Schlafzimmer" → Raum zuweisen',
      '"5 Teller in Kiste Küche" → Menge + Kiste',
    ],
  },
};

// ── JSON Parsing Hilfsfunktion (identisch mit KiPacklisteAssistent) ──────────
const parseJsonAntwort = (raw) => {
  let s = raw;
  const match = s.match(/```json\s*([\s\S]*?)\s*```|```([\s\S]*?)```/);
  if (match) s = match[1] || match[2];
  const i1 = s.indexOf("["), i2 = s.lastIndexOf("]");
  const i3 = s.indexOf("{"), i4 = s.lastIndexOf("}");
  if (i1 !== -1 && i2 !== -1 && i1 < i2) return JSON.parse(s.substring(i1, i2 + 1));
  if (i3 !== -1 && i4 !== -1 && i3 < i4) return [JSON.parse(s.substring(i3, i4 + 1))];
  throw new Error("Kein JSON gefunden");
};

// ── Komponente ───────────────────────────────────────────────────────────────
const KiHomeAssistent = ({ session, modul, onClose, onErgebnis }) => {
  const userId = session?.user?.id;
  const config = MODUL_CONFIG[modul];

  const [apiKey,        setApiKey]        = useState("");
  const [apiKeySet,     setApiKeySet]     = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showApiInput,  setShowApiInput]  = useState(false);
  const [kiProvider,    setKiProvider]    = useState("openai");

  const [inputModus,    setInputModus]    = useState("sprache"); // "sprache" | "text"
  const [isRecording,   setIsRecording]   = useState(false);
  const [textEingabe,   setTextEingabe]   = useState("");
  const [transkription, setTranskription] = useState("");

  const [ladend,        setLadend]        = useState(false);
  const [fehler,        setFehler]        = useState("");
  const [ergebnisse,    setErgebnisse]    = useState([]);
  const [showHelp,      setShowHelp]      = useState(false);

  // API-Key laden
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_profile").select("openai_api_key, ki_provider, ollama_base_url, ollama_model").eq("id", userId).single()
      .then(({ data }) => {
        if (data?.ki_provider) setKiProvider(data.ki_provider);
        if (data?.ki_provider === "ollama" && data?.ollama_base_url) {
          setApiKeySet(true);
          setShowApiInput(false);
        } else if (data?.openai_api_key) {
          setApiKey(data.openai_api_key); setApiKeySet(true);
        } else {
          setShowApiInput(true);
        }
      });
  }, [userId]);

  const handleApiKeySpeichern = async () => {
    if (!apiKey.trim()) return;
    await supabase.from("user_profile").update({ openai_api_key: apiKey.trim() }).eq("id", userId);
    setApiKeySet(true);
    setShowApiInput(false);
  };

  // Aufnahme-Lifecycle
  const handleStartRecording = () => {
    setTranskription(""); setErgebnisse([]); setFehler("");
    if (kiProvider === "ollama") {
      startSpeechRecognition(
        (transcript) => {
          setTranskription(transcript);
          if (transcript.trim()) handleVerarbeiten(transcript.trim());
        },
        (err) => setFehler(`Spracherkennung Fehler: ${err}`)
      );
    } else {
      setIsRecording(true);
    }
  };
  const handleStopRecording  = () => setIsRecording(false);
  const onStopRecording = (blob) => {
    if (blob?.blob) handleTranscription(blob.blob);
    else setFehler("Keine Audiodaten erhalten.");
  };

  // Whisper-Transkription
  const handleTranscription = async (audioBlob) => {
    if (kiProvider === "ollama") {
      // Web Speech API already handled in mic button click
      return;
    }
    if (!apiKeySet || !apiKey) { setShowApiInput(true); return; }
    setLadend(true); setFehler(""); setTranskription("");
    try {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const file   = new File([audioBlob], "aufnahme.webm", { type: audioBlob.type });
      const res    = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
      const text   = res.text;
      setTranskription(text);
      if (text.trim()) await handleVerarbeiten(text);
    } catch (e) {
      setFehler(`Transkriptionsfehler: ${e.message}`);
      if (e.status === 401) { setApiKeySet(false); setShowApiInput(true); }
    } finally { setLadend(false); }
  };

  // GPT-4o Verarbeitung
  const handleVerarbeiten = async (text) => {
    if (!text?.trim()) { setFehler("Kein Text zum Verarbeiten."); return; }
    setLadend(true); setFehler(""); setErgebnisse([]);
    try {
      const { client, model, provider } = await getKiClient(userId);
      if (!client || !isKiClientReady({ client, provider, apiKey: provider === "openai" ? apiKey : null })) {
        setFehler("KI nicht konfiguriert. Bitte Provider in den Einstellungen einrichten.");
        setShowApiInput(true);
        setLadend(false);
        return;
      }
      const openai = client;
      const prompt = `Extrahiere alle relevanten Felder (${config.felder}) aus dem folgenden Text und gib ein JSON-Array zurück.
Format: [${config.schema}]
Erkenne automatisch: Kategorien, Mengen, Zeitangaben, Intervalle, wiederkehrende Ereignisse.
Text: "${text}"
Antworte NUR mit dem JSON-Array, kein anderer Text.`;
      const res = await openai.chat.completions.create({
        model: model, messages: [{ role: "user", content: prompt }], temperature: 0.2,
      });
      const items = parseJsonAntwort(res.choices[0].message.content);
      if (Array.isArray(items) && items.length > 0) setErgebnisse(items);
      else setFehler("KI konnte keine Einträge im Text finden.");
    } catch (e) {
      setFehler(`KI-Fehler: ${e.message}`);
      if (e.status === 401) { setApiKeySet(false); setShowApiInput(true); }
    } finally { setLadend(false); }
  };

  const handleUebernehmen = () => {
    if (onErgebnis && ergebnisse.length > 0) {
      onErgebnis(ergebnisse);
      onClose();
    }
  };

  if (!config) return null;

  return (
    /* Modal-Overlay */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-canvas-0/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-3 w-full max-w-lg
                      flex flex-col max-h-[90vh] overflow-hidden"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card-sm bg-primary-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-primary-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                {config.titel}
              </h2>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {config.beschreibung}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {config.hilfe && (
              <button
                onClick={() => setShowHelp(!showHelp)}
                title="Hilfe & Beispiele"
                className="w-8 h-8 rounded-card-sm flex items-center justify-center
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors">
                {showHelp ? <ChevronUp size={18} /> : <HelpCircle size={18} />}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-card-sm flex items-center justify-center
                                                 text-light-text-secondary dark:text-dark-text-secondary
                                                 hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Hilfe-Panel */}
        {showHelp && config.hilfe && (
          <div className="px-5 py-3 border-b border-light-border dark:border-dark-border
                          bg-primary-500/5">
            <p className="text-xs font-semibold text-primary-500 mb-2">Beispiele</p>
            <ul className="space-y-1">
              {config.hilfe.map((tip, i) => (
                <li key={i} className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-start gap-1.5">
                  <span className="text-primary-500 mt-0.5 shrink-0">›</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* API-Key Eingabe */}
          {(!apiKeySet || showApiInput) && kiProvider === "openai" && (
            <div className="p-4 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3
                            border border-light-border dark:border-dark-border space-y-3">
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                OpenAI API-Key eingeben (einmalig — wird in deinem Profil gespeichert):
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={apiKeyVisible ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full pr-9 pl-3 py-2 text-sm rounded-card-sm
                               bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border
                               text-light-text-main dark:text-dark-text-main
                               focus:outline-none focus:ring-2 focus:ring-secondary-500"
                  />
                  <button onClick={() => setApiKeyVisible(!apiKeyVisible)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary">
                    {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button onClick={handleApiKeySpeichern}
                        className="px-3 py-2 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white">
                  Speichern
                </button>
              </div>
            </div>
          )}

          {apiKeySet && !showApiInput && (
            <button onClick={() => setShowApiInput(true)}
                    className="flex items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors">
              <Settings size={12} /> API-Key ändern
            </button>
          )}

          {/* Eingabe-Modus Tabs */}
          {apiKeySet && (
            <>
              <div className="flex gap-1 p-1 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 w-fit">
                <button onClick={() => setInputModus("sprache")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm text-sm font-medium transition-all
                          ${inputModus === "sprache" ? "bg-primary-500 text-white" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}>
                  <Mic size={14} /> Sprache
                </button>
                <button onClick={() => setInputModus("text")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm text-sm font-medium transition-all
                          ${inputModus === "text" ? "bg-primary-500 text-white" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}>
                  <Type size={14} /> Text
                </button>
              </div>

              {inputModus === "sprache" ? (
                <div className="space-y-3">
                  {isRecording && (
                    <ReactMic
                      record={isRecording}
                      className="w-full h-16 rounded-card-sm"
                      onStop={onStopRecording}
                      strokeColor="#10B981"
                      backgroundColor="#0E1B22"
                      mimeType="audio/webm"
                    />
                  )}
                  {!isRecording ? (
                    <button onClick={handleStartRecording} disabled={ladend}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-pill text-sm font-medium
                                       bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60">
                      <Mic size={16} />
                      {ergebnisse.length > 0 ? "Neue Aufnahme" : "Spracheingabe starten"}
                    </button>
                  ) : (
                    <button onClick={handleStopRecording}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-pill text-sm font-medium
                                       bg-accent-danger hover:bg-red-500 text-white">
                      <StopCircle size={16} /> Aufnahme stoppen & verarbeiten
                    </button>
                  )}
                  {transkription && (
                    <div className="p-3 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3
                                    border border-light-border dark:border-dark-border text-sm
                                    text-light-text-secondary dark:text-dark-text-secondary italic">
                      „{transkription}"
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={textEingabe}
                    onChange={(e) => setTextEingabe(e.target.value)}
                    rows={4}
                    placeholder={config.beschreibung}
                    className="w-full px-3 py-2.5 text-sm rounded-card-sm resize-none
                               bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border
                               text-light-text-main dark:text-dark-text-main
                               placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                               focus:outline-none focus:ring-2 focus:ring-secondary-500"
                  />
                  <button onClick={() => { if (textEingabe.trim()) { setErgebnisse([]); setFehler(""); handleVerarbeiten(textEingabe.trim()); } }}
                          disabled={ladend || !textEingabe.trim()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-pill text-sm font-medium
                                     bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60">
                    <Send size={15} /> Text analysieren
                  </button>
                </div>
              )}
            </>
          )}

          {/* Ladezustand */}
          {ladend && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              <UploadCloud size={16} className="animate-pulse text-primary-500" />
              KI analysiert…
            </div>
          )}

          {/* Fehler */}
          {fehler && !ladend && (
            <div className="flex items-center gap-2 p-3 rounded-card-sm bg-accent-danger/10 border border-accent-danger/30 text-accent-danger text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              {fehler}
            </div>
          )}

          {/* Ergebnisse */}
          {ergebnisse.length > 0 && !ladend && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {config.ergebnisLabel} ({ergebnisse.length})
              </h3>
              <ul className="space-y-1.5">
                {ergebnisse.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 p-2.5 rounded-card-sm
                                         bg-primary-500/5 border border-primary-500/20 text-sm
                                         text-light-text-main dark:text-dark-text-main">
                    <CheckSquare size={15} className="text-primary-500 shrink-0 mt-0.5" />
                    {config.renderItem(item)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        {ergebnisse.length > 0 && !ladend && (
          <div className="px-5 py-4 border-t border-light-border dark:border-dark-border flex gap-2">
            <button onClick={onClose}
                    className="flex-1 py-2.5 rounded-pill text-sm font-medium border border-light-border dark:border-dark-border
                               text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors">
              Abbrechen
            </button>
            <button onClick={handleUebernehmen}
                    className="flex-1 py-2.5 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors">
              {ergebnisse.length} Eintrag{ergebnisse.length !== 1 ? "einträge" : ""} übernehmen
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default KiHomeAssistent;
