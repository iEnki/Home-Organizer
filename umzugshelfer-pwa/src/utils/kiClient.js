/**
 * kiClient.js
 * Zentralisierte KI-Client-Initialisierung fuer alle KI-Assistenten.
 * Nutzt serverseitigen Edge-Proxy (household settings), kein API-Key im Browser.
 */

import { supabase } from "../supabaseClient";
import { getSpeechRecognitionLocale } from "./intlFormatters";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;

const buildFunctionsUrl = (fnName) => {
  if (!SUPABASE_URL) {
    throw new Error("REACT_APP_SUPABASE_URL fehlt.");
  }
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${fnName}`;
};

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

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);
    if (isObject(json)) return json;
  }
  const text = await response.text().catch(() => "");
  if (text) {
    return { message: text };
  }
  return null;
};

const edgeChatClient = {
  chat: {
    completions: {
      create: async ({ model, messages, temperature, response_format }) => {
        const doFetch = async (token) =>
          fetch(buildFunctionsUrl("ki-chat"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ model, messages, temperature, response_format }),
          });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Nicht eingeloggt.");
        }

        let response = await doFetch(session.access_token);

        // Bei 401: Session refreshen und einmal retry
        if (response.status === 401) {
          const { data: { session: freshSession }, error: refreshError } =
            await supabase.auth.refreshSession();
          if (refreshError || !freshSession?.access_token) {
            throw new Error("Sitzung abgelaufen. Bitte neu anmelden.");
          }
          response = await doFetch(freshSession.access_token);
        }

        const payload = response.ok
          ? await response.json().catch(() => ({}))
          : await parseErrorResponse(response);
        if (!response.ok) {
          throw new KiProxyError({
            code: payload?.code || (response.status === 401 ? "AUTH_REQUIRED" : "KI_PROXY_ERROR"),
            message:
              payload?.message ||
              payload?.error ||
              `KI-Proxy Fehler (${response.status})`,
            provider: payload?.provider || null,
            status: payload?.status || response.status,
            retryable: Boolean(payload?.retryable),
            details: payload,
          });
        }

        return payload;
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
