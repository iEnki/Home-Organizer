import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import OpenAI from "openai";
import { ReactMic } from "react-mic";
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

const KiTodoAssistent = ({ session, onTodosExtracted }) => {
  const userId = session?.user?.id;
  const [apiKey, setApiKey] = useState("");
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(true);
  const [transcribedText, setTranscribedText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [extractedTodos, setExtractedTodos] = useState([]);
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
            .select("openai_api_key")
            .eq("id", userId)
            .single();
          if (dbError && dbError.code !== "PGRST116") throw dbError;
          if (data && data.openai_api_key) {
            setApiKey(data.openai_api_key);
            setIsApiKeySet(true);
            setShowApiKeyInput(false);
          } else {
            setShowApiKeyInput(true);
            setIsApiKeySet(false);
          }
        } catch (err) {
          console.error(
            "Fehler beim Laden des API-Keys für KI Todo Assistent:",
            err
          );
          setShowApiKeyInput(true);
          setIsApiKeySet(false);
        }
      }
    };
    if (userId) loadApiKey();
  }, [userId]);

  const showToast = (text, type = "info", duration = 10000) => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage({ text: "", type: "" }), duration);
  };

  const handleApiKeySubmit = async () => {
    if (apiKey.trim() === "") {
      setError("API-Key darf nicht leer sein.");
      showToast("API-Key darf nicht leer sein.", "error");
      return;
    }
    if (userId) {
      try {
        setIsLoading(true);
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
        console.error("Fehler Speichern API-Key:", err);
        setError("Fehler beim Speichern des API-Keys.");
        showToast("Fehler beim Speichern des API-Keys.", "error");
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsApiKeySet(true);
      setShowApiKeyInput(false);
      setError("");
      showToast("API-Key für Sitzung gesetzt (nicht gespeichert).", "info");
    }
  };

  const handleStartRecording = () => {
    setTranscribedText("");
    setExtractedTodos([]);
    setError("");
    setIsRecording(true);
  };

  const handleStopRecording = () => setIsRecording(false);

  const onStopRecording = (recordedBlob) => {
    if (recordedBlob && recordedBlob.blob) {
      handleTranscription(recordedBlob.blob);
    } else {
      setError("Keine Audiodaten empfangen.");
      showToast("Fehler bei der Aufnahme.", "error");
    }
  };

  const handleTranscription = async (audioBlob) => {
    if (!audioBlob) {
      setError("Keine Audioaufnahme für Transkription.");
      showToast("Keine Audioaufnahme vorhanden.", "error");
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
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const audioFile = new File([audioBlob], "aufnahme.webm", {
        type: audioBlob.type,
      });
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });
      const newTranscribedText = transcriptionResponse.text;
      setTranscribedText(newTranscribedText);
      if (newTranscribedText.trim() !== "") {
        handleProcessTextWithGPT(newTranscribedText);
      }
    } catch (apiError) {
      console.error("Fehler Transkription:", apiError);
      setError(`Fehler Transkription: ${apiError.message}`);
      showToast(`Fehler Transkription: ${apiError.message}`, "error");
      if (apiError.status === 401) {
        setIsApiKeySet(false);
        setShowApiKeyInput(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessTextWithGPT = async (textToProcess) => {
    if (!textToProcess) {
      setError("Kein Text zum Verarbeiten.");
      showToast("Kein Text zum Verarbeiten.", "error");
      return;
    }
    setIsLoading(true);
    setError("");
    setExtractedTodos([]);
    try {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const prompt = `Extrahiere aus dem folgenden Text To-Do Aufgaben und gib die Antwort als JSON-Array zurück. Jedes To-Do sollte ein Objekt mit "beschreibung", optional "kategorie", optional "prioritaet" (Hoch, Mittel, Niedrig), und optional "faelligkeitsdatum" (Format YYYY-MM-DD) sein.
Beispiel-Input: "Arzttermin vereinbaren für nächste Woche Dienstag, Kategorie Gesundheit, Priorität Hoch. Ummelden bis Ende des Monats."
Beispiel-Output:
[
  {"beschreibung": "Arzttermin vereinbaren", "kategorie": "Gesundheit", "prioritaet": "Hoch", "faelligkeitsdatum": "2025-07-15"},
  {"beschreibung": "Ummelden", "faelligkeitsdatum": "2025-06-30"}
]
Input-Text: "${textToProcess}"
Antworte nur mit dem JSON-Array.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      });
      const resultJson = response.choices[0].message.content;
      let cleanedJsonString = resultJson;
      const jsonRegex = /```json\s*([\s\S]*?)\s*```|```([\s\S]*?)```/;
      const match = cleanedJsonString.match(jsonRegex);
      if (match) cleanedJsonString = match[1] || match[2];

      const firstBracket = cleanedJsonString.indexOf("[");
      const lastBracket = cleanedJsonString.lastIndexOf("]");
      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        firstBracket < lastBracket
      ) {
        cleanedJsonString = cleanedJsonString.substring(
          firstBracket,
          lastBracket + 1
        );
      }

      try {
        const parsedTodos = JSON.parse(cleanedJsonString);
        if (Array.isArray(parsedTodos)) {
          setExtractedTodos(parsedTodos);
          showToast(
            parsedTodos.length > 0
              ? `${parsedTodos.length} To-Do(s) von KI erkannt.`
              : "KI konnte keine To-Dos im Text finden.",
            "info"
          );
        } else {
          throw new Error("Antwort ist kein valides JSON-Array.");
        }
      } catch (parseError) {
        console.error(
          "Fehler Parsen GPT-Antwort (To-Do):",
          parseError,
          resultJson
        );
        setError(
          `Fehler Verstehen KI-Antwort (To-Do): ${parseError.message}. Antwort: ${resultJson}`
        );
        showToast("Fehler beim Verstehen der KI-Antwort für To-Dos.", "error");
      }
    } catch (apiError) {
      console.error("Fehler Kommunikation OpenAI (To-Do):", apiError);
      setError(`Fehler bei OpenAI (To-Do): ${apiError.message}`);
      showToast(`Fehler bei OpenAI (To-Do): ${apiError.message}`, "error");
      if (apiError.status === 401) {
        setIsApiKeySet(false);
        setShowApiKeyInput(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!userId)
    return (
      <div className="p-4 text-center text-dark-text-secondary">
        Bitte einloggen.
      </div>
    );

  return (
    <div className="p-4 space-y-4 relative">
      {toastMessage.text && (
        <div
          className={`fixed top-5 right-5 p-3 rounded-md shadow-lg text-sm z-[100] ${
            toastMessage.type === "success"
              ? "bg-green-500 text-white"
              : toastMessage.type === "error"
              ? "bg-red-500 text-white"
              : "bg-blue-500 text-white"
          }`}
        >
          {toastMessage.text}
        </div>
      )}
      <h3 className="text-lg font-semibold text-dark-text-main">
        KI To-Do Assistent
      </h3>

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
              starten" und sprich deutlich deine To-Do Aufgaben. Klicke dann auf
              "Aufnahme stoppen & Verarbeiten".
            </p>
            <p>
              <strong>3. Verarbeitung:</strong> Der Text wird transkribiert und
              von der KI analysiert. Die erkannten To-Dos werden unten
              angezeigt.
            </p>
            <p>
              <strong>4. Hinzufügen:</strong> Klicke auf "Zu To-Do Liste
              hinzufügen", um die erkannten Einträge zu speichern.
            </p>
            <p>
              <strong>Beispiele für Spracheingaben:</strong>
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                "Arzttermin vereinbaren für nächste Woche Dienstag, Kategorie
                Gesundheit, Priorität Hoch."
              </li>
              <li>
                "Nachsendeauftrag bei der Post stellen, Fälligkeit 2025-08-15."
              </li>
              <li>"Wohnung putzen, Kategorie Reinigung, Prio Mittel."</li>
              <li>
                "Versicherungen kündigen." (KI versucht Kategorie und Priorität
                zu erraten, wenn nicht genannt)
              </li>
            </ul>
            <p>
              <strong>Tipps:</strong> Sprich klar und nenne möglichst genau
              Beschreibung, optional Kategorie, Priorität (Hoch, Mittel,
              Niedrig) und Fälligkeitsdatum (Format JJJJ-MM-TT).
            </p>
          </div>
        )}
      </div>

      {!isApiKeySet && showApiKeyInput && (
        /* API Key Input Form */
        <div className="p-3 bg-dark-card-bg border border-dark-border rounded-lg">
          <p className="text-sm text-dark-text-secondary mb-2 flex items-center">
            <Info size={16} className="mr-2 text-blue-400" />
            OpenAI API-Key für To-Do Erfassung benötigt.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="OpenAI API-Key"
              className="flex-grow px-3 py-2 border border-dark-border rounded-md text-sm bg-dark-input text-dark-text-main focus:ring-dark-accent-green focus:border-dark-accent-green"
            />
            <button
              onClick={handleApiKeySubmit}
              disabled={isLoading}
              className="bg-dark-accent-green text-dark-bg px-4 py-2 rounded-md text-sm hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? "Speichere..." : "Key speichern"}
            </button>
          </div>
          {error && apiKey.trim() === "" && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
        </div>
      )}
      {isApiKeySet && (
        <button
          onClick={() => {
            setShowApiKeyInput(true);
            setIsApiKeySet(false);
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
                  disabled={isLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  <Mic size={18} />{" "}
                  {transcribedText || extractedTodos.length > 0
                    ? "Neue To-Do Spracheingabe"
                    : "To-Do Spracheingabe starten"}
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
                extractedTodos.length === 0 &&
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
                placeholder="To-Dos als Text eingeben, z.B.: Arzttermin vereinbaren, Priorität Hoch. Ummelden bis Ende des Monats."
                className="w-full px-3 py-2 border border-dark-border rounded-md text-sm bg-dark-input text-dark-text-main placeholder-dark-text-secondary focus:ring-1 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={() => {
                  if (textEingabe.trim()) {
                    setExtractedTodos([]);
                    setError("");
                    handleProcessTextWithGPT(textEingabe.trim());
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
                <UploadCloud size={16} className="animate-pulse" />{" "}
                {inputModus === "sprache" && !transcribedText
                  ? "Transkription läuft..."
                  : "KI analysiert Text..."}
              </p>
            </div>
          )}
        </div>
      )}
      {error && !isLoading && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {extractedTodos.length > 0 && !isLoading && (
        <div className="space-y-2">
          <h4 className="text-md font-semibold text-dark-text-main">
            Erkannte To-Dos:
          </h4>
          <ul className="list-disc pl-5 space-y-1 text-sm text-dark-text-main">
            {extractedTodos.map((todo, index) => (
              <li key={index}>
                <strong>{todo.beschreibung}</strong>
                {todo.kategorie && ` (Kat: ${todo.kategorie})`}
                {todo.prioritaet && ` (Prio: ${todo.prioritaet})`}
                {todo.faelligkeitsdatum &&
                  ` (Fällig: ${todo.faelligkeitsdatum})`}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              if (onTodosExtracted) {
                onTodosExtracted(extractedTodos);
                showToast(
                  `${extractedTodos.length} To-Do(s) übergeben.`,
                  "success"
                );
                setExtractedTodos([]);
                setTranscribedText("");
              } else {
                showToast("Callback fehlt.", "error");
              }
            }}
            className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm flex items-center justify-center gap-2"
          >
            <CheckSquare size={18} /> Zu To-Do Liste hinzufügen
          </button>
        </div>
      )}
    </div>
  );
};

export default KiTodoAssistent;
