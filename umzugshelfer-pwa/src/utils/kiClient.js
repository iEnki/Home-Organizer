/**
 * kiClient.js
 * Zentralisierte KI-Client-Initialisierung für alle KI-Assistenten.
 * Unterstützt OpenAI und Ollama als Provider.
 *
 * Verwendung:
 *   import { getKiClient, startSpeechRecognition } from "../utils/kiClient";
 *   const { client, model, provider } = await getKiClient(userId);
 */

import OpenAI from "openai";
import { supabase } from "../supabaseClient";

/**
 * Lädt KI-Konfiguration aus user_profile und gibt einen konfigurierten Client zurück.
 *
 * @param {string} userId - Supabase User-ID
 * @returns {{ client: OpenAI, model: string, provider: string, apiKey: string|null }}
 */
export async function getKiClient(userId) {
  if (!userId) {
    return { client: null, model: null, provider: null, apiKey: null };
  }

  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select("ki_provider, ollama_base_url, ollama_model, openai_api_key")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Fehler beim Laden der KI-Konfiguration:", error);
    }

    const provider = data?.ki_provider || "openai";

    if (provider === "ollama" && data?.ollama_base_url) {
      const baseURL = data.ollama_base_url.replace(/\/$/, "") + "/v1";
      const model = data.ollama_model || "llama3.2";

      return {
        client: new OpenAI({
          apiKey: "ollama", // Ollama benötigt keinen echten API-Key
          baseURL,
          dangerouslyAllowBrowser: true,
        }),
        model,
        provider: "ollama",
        apiKey: null,
      };
    }

    // OpenAI (Standard)
    const apiKey = data?.openai_api_key || null;
    return {
      client: apiKey
        ? new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
        : null,
      model: "gpt-4o",
      provider: "openai",
      apiKey,
    };
  } catch (err) {
    console.error("Fehler in getKiClient:", err);
    return { client: null, model: null, provider: "openai", apiKey: null };
  }
}

/**
 * Prüft ob für den gegebenen Provider ein gültiger Client verfügbar ist.
 *
 * @param {{ client: OpenAI|null, provider: string, apiKey: string|null }} kiConfig
 * @returns {boolean}
 */
export function isKiClientReady({ client, provider, apiKey }) {
  if (provider === "ollama") return client !== null;
  return client !== null && !!apiKey;
}

/**
 * Startet die Web Speech API für Spracheingabe (Fallback wenn kein Whisper verfügbar).
 * Wird im Ollama-Modus statt Whisper verwendet.
 *
 * @param {(transcript: string) => void} onResult - Callback mit erkanntem Text
 * @param {(error: string) => void} onError - Callback bei Fehler
 * @returns {SpeechRecognition|null} Recognition-Instanz (zum Stoppen)
 */
export function startSpeechRecognition(onResult, onError) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError(
      "Web Speech API wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden."
    );
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    onResult(transcript);
  };

  recognition.onerror = (event) => {
    const fehlerMeldungen = {
      "not-allowed": "Mikrofon-Zugriff verweigert. Bitte Berechtigung erteilen.",
      "no-speech": "Keine Sprache erkannt. Bitte nochmals versuchen.",
      "audio-capture": "Kein Mikrofon gefunden.",
      network: "Netzwerkfehler bei der Spracherkennung.",
      aborted: "Spracherkennung abgebrochen.",
    };
    onError(fehlerMeldungen[event.error] || `Spracherkennungsfehler: ${event.error}`);
  };

  try {
    recognition.start();
  } catch (err) {
    onError("Spracherkennung konnte nicht gestartet werden: " + err.message);
    return null;
  }

  return recognition;
}

/**
 * Bereinigt JSON-Antworten der KI (entfernt Markdown-Code-Blöcke).
 * Wird von allen KI-Komponenten für konsistentes Parsing verwendet.
 *
 * @param {string} rawText - Rohe KI-Antwort
 * @param {'array'|'object'} expectedType - Erwarteter JSON-Typ
 * @returns {string} Bereinigter JSON-String
 */
export function cleanKiJsonResponse(rawText, expectedType = "array") {
  let cleaned = rawText.trim();

  // Markdown-Code-Blöcke entfernen
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }

  // JSON-Grenzen extrahieren
  if (expectedType === "array") {
    const first = cleaned.indexOf("[");
    const last = cleaned.lastIndexOf("]");
    if (first !== -1 && last !== -1 && first < last) {
      cleaned = cleaned.substring(first, last + 1);
    }
  } else {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last !== -1 && first < last) {
      cleaned = cleaned.substring(first, last + 1);
    }
  }

  return cleaned;
}
