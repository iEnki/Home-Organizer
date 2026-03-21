import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import OpenAI from "openai";
import { ReactMic } from "react-mic"; // Hinzugefügt
import { getKiClient, isKiClientReady, startSpeechRecognition } from "../utils/kiClient";
import {
  Mic,
  Settings,
  AlertTriangle,
  Info,
  StopCircle,
  UploadCloud,
  CheckSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Type,
  Send,
} from "lucide-react";

const KiPacklisteAssistent = ({ session, onItemsExtracted }) => {
  // onItemsExtracted Prop hinzugefügt
  const userId = session?.user?.id;
  const [apiKey, setApiKey] = useState("");
  const [isApiKeySet, setIsApiKeySet] = useState(true);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [kiProvider, setKiProvider] = useState("edge");
  const [transcribedText, setTranscribedText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // const [recordedAudioBlob, setRecordedAudioBlob] = useState(null); // Entfernt, da Blob direkt verarbeitet wird
  const [isLoading, setIsLoading] = useState(false); // Wird für Whisper und GPT verwendet
  const [error, setError] = useState("");
  const [extractedItems, setExtractedItems] = useState([]);
  const [toastMessage, setToastMessage] = useState({ text: "", type: "" });
  const [showHelp, setShowHelp] = useState(false);
  const [inputModus, setInputModus] = useState("sprache"); // "sprache" | "text"
  const [textEingabe, setTextEingabe] = useState("");

  useEffect(() => {
    const loadApiKey = async () => {
      if (userId) {
        try {
          const { data, error: dbError } = await supabase
            .from("user_profile")
            .select("openai_api_key, ki_provider, ollama_base_url, ollama_model")
            .eq("id", userId)
            .single();

          if (dbError && dbError.code !== "PGRST116") {
            // PGRST116 = no rows found
            throw dbError;
          }

          if (data?.ki_provider) setKiProvider(data.ki_provider);
          setIsApiKeySet(true);
          setShowApiKeyInput(false);
        } catch (err) {
          console.error("Fehler beim Laden des API-Keys:", err);
          // setError("Fehler beim Laden des API-Keys."); // Fehler hier nicht global setzen, da es normal sein kann, keinen Key zu haben
          setShowApiKeyInput(false);
          setIsApiKeySet(true);
        }
      }
    };
    if (userId) {
      // Nur ausführen wenn userId vorhanden ist
      loadApiKey();
    }
  }, [userId]);

  const showToast = (text, type = "info", duration = 10000) => {
    // Dauer auf 10s erhöht
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage({ text: "", type: "" });
    }, duration);
  };

  const handleApiKeySubmit = async () => {
    if (apiKey.trim() === "") {
      setError("API-Key darf nicht leer sein."); // Lokaler Fehler für das Eingabefeld
      showToast("API-Key darf nicht leer sein.", "error");
      return;
    }

    if (userId) {
      try {
        setIsLoading(true); // Ladezustand während DB-Speicherung
        const { error: updateError } = await supabase
          .from("user_profile")
          .update({ openai_api_key: apiKey.trim() })
          .eq("id", userId);

        if (updateError) throw updateError;

        setIsApiKeySet(true);
        setShowApiKeyInput(false);
        setError("");
        showToast("OpenAI API-Key erfolgreich gespeichert!", "success");
      } catch (err) {
        console.error("Fehler beim Speichern des API-Keys:", err);
        setError("Fehler beim Speichern des API-Keys. Bitte erneut versuchen."); // Lokaler Fehler
        showToast("Fehler beim Speichern des API-Keys.", "error");
      } finally {
        setIsLoading(false);
      }
    } else {
      // Fallback, falls kein User (sollte durch äußere Logik verhindert werden)
      setIsApiKeySet(true);
      setShowApiKeyInput(false);
      setError("");
      showToast(
        "API-Key für diese Sitzung gesetzt (nicht dauerhaft gespeichert).",
        "info"
      );
    }
  };

  const handleStartRecording = () => {
    // setRecordedAudioBlob(null); // Nicht mehr nötig, da kein State mehr dafür
    setTranscribedText("");
    setExtractedItems([]);
    setError("");
    startSpeechRecognition(
      (transcript) => {
        setTranscribedText(transcript);
        if (transcript.trim()) handleProcessText(transcript.trim());
      },
      (err) => {
        setError(`Spracherkennung Fehler: ${err}`);
        showToast(`Spracherkennung Fehler: ${err}`, "error");
      }
    );
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // Das recordedAudioBlob wird durch onStop gesetzt, dann handleTranscription aufrufen
  };

  const onStopRecording = (recordedBlob) => {
    console.log("recordedBlob is: ", recordedBlob);
    // setRecordedAudioBlob(recordedBlob.blob); // Nicht mehr nötig
    // Transkription direkt nach Erhalt des Blobs starten
    if (recordedBlob && recordedBlob.blob) {
      handleTranscription(recordedBlob.blob);
    } else {
      setError("Keine Audiodaten nach der Aufnahme empfangen.");
      showToast("Fehler bei der Aufnahme.", "error");
    }
  };

  const handleTranscription = async (audioBlob) => {
    if (kiProvider === "ollama") {
      // Web Speech API already handled in mic button click
      return;
    }
    if (!audioBlob) {
      setError("Keine Audioaufnahme vorhanden für Transkription.");
      showToast("Keine Audioaufnahme vorhanden.", "error"); // Toast hinzugefügt
      return;
    }
    if (!isApiKeySet || !apiKey) {
      setError("OpenAI API-Key nicht gesetzt.");
      setShowApiKeyInput(true);
      return;
    }

    setIsLoading(true);
    setError("");
    setTranscribedText("");

    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      const audioFile = new File([audioBlob], "aufnahme.webm", {
        type: audioBlob.type,
      });

      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });

      const newTranscribedText = transcriptionResponse.text;
      setTranscribedText(newTranscribedText);
      // Rufe handleProcessText automatisch auf, wenn Text transkribiert wurde
      if (newTranscribedText.trim() !== "") {
        handleProcessText(newTranscribedText); // Übergebe den Text direkt
      }
    } catch (apiError) {
      console.error(
        "Fehler bei der Transkription mit OpenAI Whisper:",
        apiError
      );
      setError(`Fehler bei der Transkription: ${apiError.message}`);
      if (apiError.status === 401) {
        setError(
          "OpenAI API-Key ist ungültig oder hat keine Berechtigung. Bitte überprüfen."
        );
        setIsApiKeySet(false);
        setShowApiKeyInput(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessText = async (currentTranscribedText) => {
    // Akzeptiert Text als Parameter
    if (!currentTranscribedText) {
      // Verwendet Parameter
      setError("Kein Text zum Verarbeiten vorhanden.");
      showToast("Kein Text zum Verarbeiten vorhanden.", "error");
      return;
    }
    setIsLoading(true);
    setError("");
    setExtractedItems([]);

    try {
      const { client, model, provider } = await getKiClient(userId);
      if (!client || !isKiClientReady({ client, provider, apiKey: provider === "openai" ? apiKey : null })) {
        setError("KI nicht konfiguriert. Bitte Provider in den Einstellungen einrichten.");
        setShowApiKeyInput(true);
        setIsLoading(false);
        return;
      }
      const openai = client;

      const prompt = `Extrahiere aus dem folgenden Text alle Aktionen bezüglich Packstücken und gib die Antwort als JSON-Array zurück. Es gibt zwei Aktionsarten:
1. Gegenstände einer Kiste zuordnen: Erkenne Gegenstand, Kiste, optional eine Kategorie für den Gegenstand und optional die Menge des Gegenstands. Wenn keine Menge genannt wird, ist die Menge 1.
   Format: {"aktion": "gegenstand_hinzufuegen", "gegenstand": "Name des Gegenstands", "menge": Anzahl (optional, default 1), "kiste": "Name der Kiste", "kategorie": "Kategorie des Gegenstands (optional, basierend auf typischen Haushaltskategorien wie Medien, Elektronik, Küche, Bad, Kleidung, Büro/Schreibwaren, Werkzeug, Deko/Wohnaccessoires, Dokumente, Spielzeug, Sportgeräte. Leer lassen, wenn unsicher oder nicht explizit genannt.)"}
2. Einer Kiste einen Zielraum zuweisen: Erkenne den Namen der Kiste und den Zielraum. Wenn der Benutzer sagt "Kiste X hat Kategorie [Raumname]" oder "Kiste X ist für [Raumname]" oder "Kiste X Zielraum [Raumname]", ist [Raumname] der Wert für das Feld "raum".
   Format: {"aktion": "raum_zuweisen", "kiste_name": "Name der Kiste", "raum": "Name des Zielraums"}

Beispiel-Input: "3 Bücher, Handy und Tastatur in Kiste 1, Kategorie Büro. Kiste 1 ist für das Arbeitszimmer. 2 Vasen in Kiste Deko."
Beispiel-Output:
[
  {"aktion": "gegenstand_hinzufuegen", "gegenstand": "Bücher", "menge": 3, "kiste": "Kiste 1", "kategorie": "Büro"},
  {"aktion": "gegenstand_hinzufuegen", "gegenstand": "Handy", "menge": 1, "kiste": "Kiste 1", "kategorie": "Büro"},
  {"aktion": "gegenstand_hinzufuegen", "gegenstand": "Tastatur", "menge": 1, "kiste": "Kiste 1", "kategorie": "Büro"},
  {"aktion": "raum_zuweisen", "kiste_name": "Kiste 1", "raum": "Arbeitszimmer"},
  {"aktion": "gegenstand_hinzufuegen", "gegenstand": "Vasen", "menge": 2, "kiste": "Kiste Deko"}
]
Input-Text: "${currentTranscribedText}"
Antworte nur mit dem JSON-Array. Achte darauf, dass jeder explizit genannte Gegenstand ein eigenes Objekt bekommt. Wenn eine Mengenangabe wie "3 Bücher" erfolgt, erstelle ein Objekt für "Bücher" mit "menge": 3.`;

      const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      });

      const resultJson = response.choices[0].message.content;
      console.log("GPT Response:", resultJson);

      // Bereinige die GPT-Antwort von Markdown-Codeblöcken
      let cleanedJsonString = resultJson;
      const jsonRegex = /```json\s*([\s\S]*?)\s*```|```([\s\S]*?)```/;
      const match = cleanedJsonString.match(jsonRegex);
      if (match) {
        cleanedJsonString = match[1] || match[2];
      }
      // Fallback: Wenn es immer noch nicht passt, aber eckige oder geschweifte Klammern enthält,
      // versuchen, den innersten JSON-Teil zu extrahieren.
      // Dies ist ein einfacher Versuch und könnte bei komplexen Antworten fehlschlagen.
      const firstBracket = cleanedJsonString.indexOf("[");
      const lastBracket = cleanedJsonString.lastIndexOf("]");
      const firstBrace = cleanedJsonString.indexOf("{");
      const lastBrace = cleanedJsonString.lastIndexOf("}");

      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        firstBracket < lastBracket
      ) {
        // Bevorzuge Array, wenn vorhanden
        cleanedJsonString = cleanedJsonString.substring(
          firstBracket,
          lastBracket + 1
        );
      } else if (
        firstBrace !== -1 &&
        lastBrace !== -1 &&
        firstBrace < lastBrace
      ) {
        // Sonst Objekt
        cleanedJsonString = cleanedJsonString.substring(
          firstBrace,
          lastBrace + 1
        );
      }

      try {
        const parsedItems = JSON.parse(cleanedJsonString);
        if (Array.isArray(parsedItems)) {
          setExtractedItems(parsedItems);
          if (parsedItems.length > 0) {
            showToast(
              `${parsedItems.length} Packstücke von KI erkannt.`,
              "info"
            );
          } else {
            showToast("KI konnte keine Packstücke im Text finden.", "info");
          }
        } else {
          throw new Error("Antwort ist kein valides JSON-Array.");
        }
      } catch (parseError) {
        console.error(
          "Fehler beim Parsen der GPT-Antwort:",
          parseError,
          resultJson
        );
        setError(
          `Fehler beim Verstehen der KI-Antwort: ${parseError.message}. Antwort der KI: ${resultJson}`
        );
        showToast(
          `Fehler beim Verstehen der KI-Antwort. Details siehe Konsole.`,
          "error"
        );
      }
    } catch (apiError) {
      // Logge nur die Nachricht und den Namen des Fehlers, nicht das ganze Objekt
      console.error(
        "Fehler bei der Kommunikation mit OpenAI:",
        apiError.name,
        apiError.message
      );
      setError(`Fehler bei OpenAI: ${apiError.message}`); // Lokaler Fehler bleibt für Anzeige im Fehler-Div
      showToast(`Fehler bei OpenAI: ${apiError.message}`, "error");
      if (apiError.status === 401) {
        setError(
          "OpenAI API-Key ist ungültig oder hat keine Berechtigung. Bitte überprüfen."
        );
        setIsApiKeySet(false);
        setShowApiKeyInput(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // TODO: Funktion zum Speichern der extrahierten Items in Supabase

  if (!userId) {
    return (
      <div className="p-4 text-center text-dark-text-secondary">
        Bitte einloggen, um den KI-Packlisten-Assistenten zu nutzen.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 relative">
      {" "}
      {/* relative für Toast-Positionierung */}
      {toastMessage.text && (
        <div
          className={`fixed top-5 right-5 p-3 rounded-md shadow-lg text-sm z-[100]
            ${toastMessage.type === "success" ? "bg-green-500 text-white" : ""}
            ${toastMessage.type === "error" ? "bg-red-500 text-white" : ""}
            ${toastMessage.type === "info" ? "bg-blue-500 text-white" : ""}
            ${toastMessage.type === "" ? "bg-gray-700 text-white" : ""}
          `}
        >
          {toastMessage.text}
        </div>
      )}
      <h2 className="text-xl font-semibold text-dark-text-main">
        KI-Packlisten-Assistent
      </h2>
      <div className="mb-2">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center p-1 rounded hover:bg-blue-500/10 transition-colors"
        >
          <HelpCircle size={18} className="mr-1.5" />
          <span>{showHelp ? "Anleitung verbergen" : "Hilfe / Anleitung"}</span>
          {showHelp ? (
            <ChevronUp size={18} className="ml-1" />
          ) : (
            <ChevronDown size={18} className="ml-1" />
          )}
        </button>
        {showHelp && (
          <div className="mt-2 p-3 bg-dark-input border border-dark-border rounded-md text-xs text-light-text-main dark:text-dark-text-main space-y-2">
            <p>
              <strong>1. OpenAI API-Key:</strong> Gib einmalig deinen OpenAI
              API-Key ein. Er wird für zukünftige Sitzungen in deinem Profil
              gespeichert.
            </p>
            <p>
              <strong>2. Spracheingabe:</strong> Klicke auf "Spracheingabe
              starten" und sprich deutlich deine Packanweisungen. Klicke dann
              auf "Aufnahme stoppen & Verarbeiten".
            </p>
            <p>
              <strong>3. Verarbeitung:</strong> Der Text wird transkribiert und
              von der KI analysiert. Die erkannten Packstücke und
              Raumanweisungen werden unten angezeigt.
            </p>
            <p>
              <strong>4. Hinzufügen:</strong> Klicke auf "Zur Packliste
              hinzufügen", um die erkannten Einträge zu speichern.
            </p>
            <p>
              <strong>Beispiele für Spracheingaben:</strong>
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>"Bücher und Vasen in Kiste Wohnzimmer, Kategorie Deko."</li>
              <li>
                "Meine Winterjacken kommen in Kiste Kleidung 1. Kiste Kleidung 1
                ist für den Keller."
              </li>
              <li>
                "Werkzeugkasten in Kiste Garage, Kategorie Werkzeug. Kiste
                Garage Zielraum Garage."
              </li>
              <li>
                "Föhn, Shampoo und Handtücher in Kiste Bad." (KI versucht
                Kategorie für Gegenstände zu erraten, wenn nicht genannt)
              </li>
            </ul>
            <p>
              <strong>Tipps:</strong> Sprich klar und nenne möglichst genau
              Gegenstände, Kisten und optional Kategorien für Gegenstände oder
              Zielräume für Kisten.
            </p>
          </div>
        )}
      </div>
      {false && !isApiKeySet && showApiKeyInput && kiProvider === "openai" && (
        <div className="p-3 bg-dark-card-bg border border-dark-border rounded-lg">
          <p className="text-sm text-dark-text-secondary mb-2 flex items-center">
            <Info size={16} className="mr-2 text-blue-400" />
            Für diese Funktion wird ein OpenAI API-Key benötigt. Du kannst
            deinen eigenen Key verwenden. Der Key wird nur für diese Sitzung im
            Browser gespeichert.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="OpenAI API-Key eingeben"
              className="flex-grow px-3 py-2 border border-dark-border rounded-md text-sm bg-dark-input text-dark-text-main focus:ring-dark-accent-green focus:border-dark-accent-green"
            />
            <button
              onClick={handleApiKeySubmit}
              className="bg-dark-accent-green text-dark-bg px-4 py-2 rounded-md text-sm hover:opacity-90"
            >
              Key speichern
            </button>
          </div>
          {error && apiKey.trim() === "" && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
        </div>
      )}
      {false && isApiKeySet && (
        <button
          onClick={() => {
            setShowApiKeyInput(true);
            setIsApiKeySet(false); /*setApiKey('');*/
          }}
          className="text-xs text-blue-400 hover:underline flex items-center"
        >
          <Settings size={14} className="mr-1" /> API-Key ändern
        </button>
      )}
      {isApiKeySet && (
        <div className="space-y-3">
          {/* Modus-Umschalter */}
          <div className="flex gap-2 border border-dark-border rounded-lg p-1 w-fit">
            <button
              onClick={() => setInputModus("sprache")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                inputModus === "sprache"
                  ? "bg-blue-500 text-white"
                  : "text-dark-text-secondary hover:text-dark-text-main"
              }`}
            >
              <Mic size={15} /> Sprache
            </button>
            <button
              onClick={() => setInputModus("text")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                inputModus === "text"
                  ? "bg-blue-500 text-white"
                  : "text-dark-text-secondary hover:text-dark-text-main"
              }`}
            >
              <Type size={15} /> Text
            </button>
          </div>

          {inputModus === "sprache" ? (
            <>
              <div style={{ display: isRecording ? "block" : "none" }}>
                <ReactMic
                  record={isRecording}
                  className="sound-wave w-full h-20"
                  onStop={onStopRecording}
                  strokeColor="#60A5FA"
                  backgroundColor="#374151"
                  mimeType="audio/webm"
                />
              </div>
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  disabled={isLoading || isRecording}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  <Mic size={18} />{" "}
                  {transcribedText || extractedItems.length > 0
                    ? "Neue Spracheingabe / Erneut versuchen"
                    : "Spracheingabe starten"}
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2"
                >
                  <StopCircle size={18} /> Aufnahme stoppen & Verarbeiten
                </button>
              )}
              {transcribedText &&
                !isLoading &&
                extractedItems.length === 0 &&
                !error && (
                  <div className="p-3 bg-dark-input border border-dark-border rounded-md">
                    <p className="text-sm text-dark-text-secondary mb-1">
                      Erkannter Text (wird automatisch verarbeitet):
                    </p>
                    <p className="text-dark-text-main italic">{transcribedText}</p>
                  </div>
                )}
            </>
          ) : (
            <>
              <textarea
                value={textEingabe}
                onChange={(e) => setTextEingabe(e.target.value)}
                rows={4}
                placeholder="Packstücke als Text eingeben, z.B.: Bücher und Laptop in Kiste Büro. Kiste Büro ist für das Arbeitszimmer."
                className="w-full px-3 py-2 border border-dark-border rounded-md text-sm bg-dark-input text-dark-text-main placeholder-dark-text-secondary focus:ring-1 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={() => {
                  if (textEingabe.trim()) {
                    setExtractedItems([]);
                    setError("");
                    handleProcessText(textEingabe.trim());
                  }
                }}
                disabled={isLoading || !textEingabe.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-70"
              >
                <Send size={16} /> Text analysieren
              </button>
            </>
          )}

          {isLoading && (
            <div className="text-center py-2">
              <p className="text-sm text-dark-text-secondary flex items-center justify-center gap-2">
                <UploadCloud size={16} className="animate-pulse" />
                {inputModus === "sprache" && !transcribedText
                  ? "Transkription läuft..."
                  : "KI analysiert Text..."}
              </p>
            </div>
          )}
        </div>
      )}
      {isLoading && (
        <div className="text-center py-4">
          <p className="text-dark-text-secondary">
            KI analysiert... Bitte warten.
          </p>
        </div>
      )}
      {error && !isLoading && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {extractedItems.length > 0 && !isLoading && (
        <div className="space-y-2">
          <h3 className="text-md font-semibold text-dark-text-main">
            Erkannte Packstücke:
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-dark-text-main">
            {extractedItems.map((item, index) => (
              <li key={index}>
                {item.aktion === "gegenstand_hinzufuegen" && (
                  <>
                    {item.menge && item.menge > 1 ? `${item.menge}x ` : ""}
                    <strong>{item.gegenstand}</strong> in Kiste{" "}
                    <strong>{item.kiste}</strong>
                    {item.kategorie && ` (Kategorie: ${item.kategorie})`}
                  </>
                )}
                {item.aktion === "raum_zuweisen" && (
                  <>
                    Kiste <strong>{item.kiste_name}</strong> Zielraum:{" "}
                    <strong>{item.raum}</strong>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              if (onItemsExtracted && extractedItems.length > 0) {
                onItemsExtracted(extractedItems);
                // Optional: Reset nach dem Übergeben
                setExtractedItems([]);
                setTranscribedText("");
                showToast(
                  `${extractedItems.length} Packstücke an Packliste übergeben.`,
                  "success"
                );
              } else {
                showToast(
                  "Keine Packstücke zum Übergeben vorhanden oder Callback fehlt.",
                  "warn"
                );
              }
            }}
            className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2"
          >
            <CheckSquare size={18} /> Zur Packliste hinzufügen
          </button>
        </div>
      )}
    </div>
  );
};

export default KiPacklisteAssistent;
