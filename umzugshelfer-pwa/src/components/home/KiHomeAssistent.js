import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckSquare,
  ChevronUp,
  HelpCircle,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { startSpeechRecognition } from "../../utils/kiClient";
import { extractAssistantDomainItems } from "../../utils/assistantAi";
import { ASSISTANT_DOMAIN_CONFIG } from "../../utils/assistantDomains";

const MODULE_UI = {
  inventar: {
    description: 'z.B. "Bohrmaschine liegt im Kellerregal"',
    help: [
      '"Bohrmaschine liegt im Kellerregal" -> Objekt mit Standort',
      '"2 Winterjacken im Kleiderschrank" -> Menge + Kategorie',
      '"Raclette-Grill, eingelagert, Kueche" -> Objekt mit Kontext',
    ],
    renderItem: (item) =>
      `${item.name || "Unbenannt"}${item.menge > 1 ? ` (${item.menge}x)` : ""}${item.kategorie ? ` - ${item.kategorie}` : ""}${item.ort ? ` @ ${item.ort}` : ""}`,
  },
  vorraete: {
    description: 'z.B. "Milch 2 Liter und Butter im Kuehlschrank"',
    help: [
      '"Milch 2 Liter und Butter im Kuehlschrank" -> mehrere Vorraete',
      '"Kaffee 500g, Kategorie Getraenke" -> Einheit + Kategorie',
      '"3 Flaschen Olivenoel" -> Bestand + Einheit',
    ],
    renderItem: (item) =>
      `${item.name || "Unbenannt"}${item.bestand ?? item.menge ? ` - ${item.bestand ?? item.menge} ${item.einheit || ""}` : ""}${item.kategorie ? ` (${item.kategorie})` : ""}`,
  },
  einkaufliste: {
    description: 'z.B. "Lege Milch und Butter auf die Einkaufsliste"',
    help: [
      '"Milch, Butter und Brot kaufen" -> mehrere Artikel',
      '"2 Liter Orangensaft und Kuechenrolle" -> Menge + Einheit',
      '"Shampoo und Pflaster" -> kategorisierte Vorschlaege',
    ],
    renderItem: (item) =>
      `${item.name || item.normalized_name || item.original_text}${item.menge ? ` - ${item.menge} ${item.einheit || ""}` : ""}${item.unterkategorie ? ` (${item.unterkategorie})` : item.hauptkategorie ? ` (${item.hauptkategorie})` : ""}`,
  },
  geraete: {
    description: 'z.B. "Waschmaschine Bosch Wartung alle 12 Monate"',
    help: [
      '"Waschmaschine Bosch Serie 6, Wartung alle 12 Monate"',
      '"Geschirrspueler Siemens"',
      '"Heizung Vaillant, Wartung jaehrlich"',
    ],
    renderItem: (item) =>
      `${item.name || "Unbenannt"}${item.hersteller ? ` - ${item.hersteller}` : ""}${item.modell ? ` ${item.modell}` : ""}${item.wartungsintervall_monate ? ` (Wartung alle ${item.wartungsintervall_monate} Monate)` : ""}`,
  },
  aufgaben: {
    description: 'z.B. "Keller aufraeumen bis Ende April, monatlich wiederholen"',
    help: [
      '"Keller aufraeumen bis Ende April, monatlich"',
      '"Rauchmelder testen, Prioritaet Hoch"',
      '"Reifenwechsel beauftragen naechsten Montag"',
    ],
    renderItem: (item) =>
      `${item.beschreibung || "Aufgabe"}${item.prioritaet ? ` [${item.prioritaet}]` : ""}${item.faelligkeitsdatum ? ` - bis ${item.faelligkeitsdatum}` : ""}${item.wiederholung_typ && item.wiederholung_typ !== "Keine" ? ` (${item.wiederholung_typ})` : ""}`,
  },
  budget: {
    description: 'z.B. "Netflix 12,99 Euro monatlich vom Haushaltskonto"',
    help: [
      '"Netflix 12,99 Euro monatlich vom Haushaltskonto"',
      '"Strom 80 Euro privat ueber Martins Kreditkarte"',
      '"Miete 950 Euro monatlich, Kategorie Wohnen"',
    ],
    renderItem: (item) =>
      `${item.beschreibung || "Zahlung"} - ${item.betrag || 0} EUR${item.kategorie ? ` (${item.kategorie})` : ""}${item.zahlungskonto_name ? ` · ${item.zahlungskonto_name}` : ""}${item.wiederholen ? ` · ${item.intervall || "wiederkehrend"}` : ""}`,
  },
  projekte: {
    description: 'z.B. "Badezimmer renovieren bis Oktober, Budget 2000 Euro"',
    help: [
      '"Badezimmer renovieren bis Oktober, Budget 2000 Euro"',
      '"Keller aufraeumen und reorganisieren"',
      '"Kueche streichen naechsten Monat"',
    ],
    renderItem: (item) =>
      `${item.name || "Projekt"}${item.typ ? ` [${item.typ}]` : ""}${item.budget ? ` - Budget: ${item.budget} EUR` : ""}${item.zieldatum ? ` · bis ${item.zieldatum}` : ""}`,
  },
  todos: {
    description: 'z.B. "Zahnarzt anrufen bis Freitag, wichtig"',
    help: [
      '"Zahnarzt anrufen bis Freitag, wichtig"',
      '"Reifenwechsel beauftragen naechste Woche"',
      '"Keller aufraeumen, Prioritaet Mittel"',
    ],
    renderItem: (item) =>
      `${item.beschreibung || "To-Do"}${item.prioritaet ? ` [${item.prioritaet}]` : ""}${item.faelligkeitsdatum ? ` - bis ${item.faelligkeitsdatum}` : ""}`,
  },
  packliste: {
    description: 'z.B. "Buecher und Laptop in Kiste 3, Arbeitszimmer"',
    help: [
      '"Buecher und Laptop in Kiste 3, Kategorie Buero"',
      '"Kiste 1 kommt ins Schlafzimmer"',
      '"5 Teller in Kiste Kueche"',
    ],
    renderItem: (item) =>
      item.aktion === "raum_zuweisen"
        ? `Raum: ${item.kiste_name || "Kiste"} -> ${item.raum || "Zielraum"}`
        : `${item.gegenstand || "Gegenstand"}${item.menge > 1 ? ` (${item.menge}x)` : ""} -> ${item.kiste || "Kiste"}${item.kategorie ? ` (${item.kategorie})` : ""}`,
  },
};

const KiHomeAssistent = ({ session, modul, onClose, onErgebnis }) => {
  const userId = session?.user?.id;
  const domainConfig = ASSISTANT_DOMAIN_CONFIG[modul];
  const uiConfig = MODULE_UI[modul];

  const [inputModus, setInputModus] = useState("sprache");
  const [textEingabe, setTextEingabe] = useState("");
  const [transkription, setTranskription] = useState("");
  const [ladend, setLadend] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ergebnisse, setErgebnisse] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const [sprachAktiv, setSprachAktiv] = useState(false);

  const handleVerarbeiten = async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      setFehler("Kein Text zum Verarbeiten.");
      return;
    }

    setLadend(true);
    setFehler("");
    setErgebnisse([]);

    try {
      const items = await extractAssistantDomainItems({
        userId,
        domain: modul,
        text: trimmed,
      });

      if (Array.isArray(items) && items.length > 0) {
        setErgebnisse(items);
      } else {
        setFehler("KI konnte keine Eintraege im Text finden.");
      }
    } catch (error) {
      setFehler(`KI-Fehler: ${error?.message || "Unbekannter Fehler"}`);
    } finally {
      setLadend(false);
    }
  };

  const handleStartRecording = () => {
    setTranskription("");
    setErgebnisse([]);
    setFehler("");
    setSprachAktiv(true);

    startSpeechRecognition(
      (transcript) => {
        setSprachAktiv(false);
        setTranskription(transcript);
        if (String(transcript || "").trim()) {
          handleVerarbeiten(transcript);
        }
      },
      (errorMessage) => {
        setSprachAktiv(false);
        setFehler(`Spracherkennung Fehler: ${errorMessage}`);
      },
    );
  };

  const handleUebernehmen = async () => {
    if (typeof onErgebnis !== "function" || ergebnisse.length === 0) return;

    setLadend(true);
    setFehler("");
    try {
      await Promise.resolve(onErgebnis(ergebnisse));
      onClose?.();
    } catch (error) {
      setFehler(`Speichern fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    } finally {
      setLadend(false);
    }
  };

  if (!domainConfig || !uiConfig) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[200] flex items-center justify-center pt-4 px-4 pb-[calc(var(--safe-area-bottom)+1rem)] bg-canvas-0/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-3 w-full max-w-lg flex flex-col max-h-[calc(100dvh-var(--safe-area-bottom)-2rem)] lg:max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card-sm bg-primary-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-primary-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                {domainConfig.title}
              </h2>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {uiConfig.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {uiConfig.help?.length > 0 && (
              <button
                onClick={() => setShowHelp((prev) => !prev)}
                title="Hilfe und Beispiele"
                className="w-8 h-8 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
              >
                {showHelp ? <ChevronUp size={18} /> : <HelpCircle size={18} />}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-card-sm flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {showHelp && uiConfig.help?.length > 0 && (
          <div className="px-5 py-3 border-b border-light-border dark:border-dark-border bg-primary-500/5">
            <p className="text-xs font-semibold text-primary-500 mb-2">Beispiele</p>
            <ul className="space-y-1">
              {uiConfig.help.map((tip, index) => (
                <li
                  key={index}
                  className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-start gap-1.5"
                >
                  <span className="text-primary-500 mt-0.5 shrink-0">›</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex gap-1 p-1 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 w-fit">
            <button
              onClick={() => setInputModus("sprache")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm text-sm font-medium transition-all ${
                inputModus === "sprache"
                  ? "bg-primary-500 text-white"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              <Mic size={14} />
              Sprache
            </button>
            <button
              onClick={() => setInputModus("text")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card-sm text-sm font-medium transition-all ${
                inputModus === "text"
                  ? "bg-primary-500 text-white"
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              }`}
            >
              <Type size={14} />
              Text
            </button>
          </div>

          {inputModus === "sprache" ? (
            <div className="space-y-3">
              {sprachAktiv ? (
                <div className="flex items-center justify-center gap-3 py-3 rounded-pill bg-accent-danger/10 border border-accent-danger/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent-danger animate-pulse" />
                  <span className="text-sm font-medium text-accent-danger">
                    Aufnahme laeuft - bitte sprechen...
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={ladend}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60"
                >
                  <Mic size={16} />
                  {ergebnisse.length > 0 ? "Neue Aufnahme" : "Spracheingabe starten"}
                </button>
              )}

              {transkription && (
                <div className="p-3 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 border border-light-border dark:border-dark-border text-sm text-light-text-secondary dark:text-dark-text-secondary italic">
                  "{transkription}"
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={textEingabe}
                onChange={(event) => setTextEingabe(event.target.value)}
                rows={4}
                placeholder={uiConfig.description}
                className="w-full px-3 py-2.5 text-sm rounded-card-sm resize-none bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-secondary-500"
              />
              <button
                onClick={() => handleVerarbeiten(textEingabe)}
                disabled={ladend || !textEingabe.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60"
              >
                <Send size={15} />
                Text analysieren
              </button>
            </div>
          )}

          {ladend && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              <Loader2 size={16} className="animate-spin text-primary-500" />
              KI analysiert...
            </div>
          )}

          {fehler && !ladend && (
            <div className="flex items-center gap-2 p-3 rounded-card-sm bg-accent-danger/10 border border-accent-danger/30 text-accent-danger text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              {fehler}
            </div>
          )}

          {ergebnisse.length > 0 && !ladend && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                {domainConfig.summaryLabel} ({ergebnisse.length})
              </h3>
              <ul className="space-y-1.5">
                {ergebnisse.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 p-2.5 rounded-card-sm bg-primary-500/5 border border-primary-500/20 text-sm text-light-text-main dark:text-dark-text-main"
                  >
                    <CheckSquare size={15} className="text-primary-500 shrink-0 mt-0.5" />
                    {uiConfig.renderItem(item)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {ergebnisse.length > 0 && !ladend && (
          <div className="px-5 py-4 border-t border-light-border dark:border-dark-border flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-pill text-sm font-medium border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleUebernehmen}
              className="flex-1 py-2.5 rounded-pill text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors"
            >
              {ergebnisse.length} Eintrag{ergebnisse.length !== 1 ? "e" : ""} uebernehmen
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default KiHomeAssistent;
