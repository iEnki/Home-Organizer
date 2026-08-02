/**
 * kiClient.js
 * Zentralisierte KI-Client-Initialisierung fuer alle KI-Assistenten.
 * Nutzt serverseitigen Edge-Proxy (household settings), kein API-Key im Browser.
 */

import { getSpeechRecognitionLocale } from "./intlFormatters";
import {
  EdgeFunctionRequestError,
  fetchEdgeFunctionJsonWithAuthRetry,
} from "./edgeFunctionAuth";

export class KiProxyError extends Error {
  constructor({ code = "KI_PROXY_ERROR", message, provider = null, status = null, retryable = false, details = null } = {}) {
    super(message || "KI-Proxy Fehler");
    this.name = "KiProxyError";
    this.code = code;
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const edgeChatClient = {
  chat: {
    completions: {
      create: async ({
        model,
        messages,
        temperature,
        response_format,
        context,
        tools,
        tool_choice,
        max_tokens,
        timeout_ms,
      }) => {
        try {
          return await fetchEdgeFunctionJsonWithAuthRetry("ki-chat", {
            timeoutMs: timeout_ms || 105_000,
            body: {
              model,
              messages,
              temperature,
              response_format,
              context,
              max_tokens,
              ...(Array.isArray(tools) && tools.length > 0 ? { tools, tool_choice } : {}),
            },
          });
        } catch (error) {
          if (!(error instanceof EdgeFunctionRequestError)) throw error;
          throw new KiProxyError({
            code: error.code,
            message: error.message,
            provider: error.details?.provider || null,
            status: error.status,
            retryable: error.retryable,
            details: error.details,
          });
        }
      },
    },
  },
};

/**
 * Liefert einen KI-Client, der serverseitig ?ber Edge Functions proxied.
 */
export async function getKiClient(_userId) {
  return {
    client: edgeChatClient,
    model: "gpt-4o",
    provider: "edge",
    apiKey: "server-side",
  };
}

/**
 * Prueft ob ein nutzbarer KI-Client vorhanden ist.
 */
export function isKiClientReady({ client }) {
  return !!client;
}

/**
 * Startet die Web Speech API fuer Spracheingabe.
 */
export function startSpeechRecognition(onResult, onError, locale = "de") {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError(
      "Web Speech API wird von diesem Browser nicht unterstuetzt. Bitte Chrome oder Edge verwenden."
    );
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = getSpeechRecognitionLocale(locale);
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
 * Erstellt Vision-Nachrichten fuer ChatGPT Vision (GPT-4o).
 * @param {string} imageBase64 - Base64-kodiertes Bild
 * @param {string} mimeType - MIME-Typ (z.B. "image/jpeg")
 * @param {string} promptText - Textanweisung an das Modell
 */
export function createVisionMessages(imageBase64, mimeType, promptText) {
  return [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
            detail: "high",
          },
        },
        { type: "text", text: promptText },
      ],
    },
  ];
}

/**
 * Bereinigt JSON-Antworten der KI (entfernt Markdown-Code-Bloecke).
 */
export function cleanKiJsonResponse(rawText, expectedType = "array") {
  if (typeof rawText !== "string") rawText = String(rawText ?? "");
  let cleaned = rawText.trim();

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }

  const open = expectedType === "array" ? "[" : "{";
  const close = expectedType === "array" ? "]" : "}";
  const first = cleaned.indexOf(open);
  if (first !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = first; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) {
        cleaned = cleaned.substring(first, i + 1);
        break;
      }
    }
  }

  return cleaned;
}
