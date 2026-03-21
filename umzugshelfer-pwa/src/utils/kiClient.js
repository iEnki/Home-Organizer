/**
 * kiClient.js
 * Zentralisierte KI-Client-Initialisierung fuer alle KI-Assistenten.
 * Nutzt serverseitigen Edge-Proxy (household settings), kein API-Key im Browser.
 */

import { supabase } from "../supabaseClient";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;

const buildFunctionsUrl = (fnName) => {
  if (!SUPABASE_URL) {
    throw new Error("REACT_APP_SUPABASE_URL fehlt.");
  }
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${fnName}`;
};

const edgeChatClient = {
  chat: {
    completions: {
      create: async ({ model, messages, temperature }) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Nicht eingeloggt.");
        }

        const response = await fetch(buildFunctionsUrl("ki-chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ model, messages, temperature }),
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(json?.error || `KI-Proxy Fehler (${response.status})`);
        }

        return json;
      },
    },
  },
};

/**
 * Liefert einen KI-Client, der serverseitig über Edge Functions proxied.
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
export function startSpeechRecognition(onResult, onError) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError(
      "Web Speech API wird von diesem Browser nicht unterstuetzt. Bitte Chrome oder Edge verwenden."
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
 * Bereinigt JSON-Antworten der KI (entfernt Markdown-Code-Bloecke).
 */
export function cleanKiJsonResponse(rawText, expectedType = "array") {
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
