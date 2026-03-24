// Supabase Edge Function: ki-vision
// Zentraler Bild-Proxy fuer den Rechnungsscanner.
//
// POST /
//   mode = "chatgpt_vision" -> GPT-4o Vision (bildanalyse_openai_api_key)
//   mode = "ocr_ollama"     -> Ollama Vision (ollama_base_url + ollama_vision_model aus household_settings)
//
// Gibt immer { status: "ok", text: string } zurueck.
//
// WICHTIG: KI_RECHNUNG_PROMPT_SERVER muss identisch mit
// KI_RECHNUNG_PROMPT_VISION in rechnungAnalyse.js gehalten werden!

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WICHTIG: Muss identisch mit KI_RECHNUNG_PROMPT_VISION in rechnungAnalyse.js gehalten werden!
const KI_RECHNUNG_PROMPT_SERVER = `Du bist ein Rechnungs-Analyse-Assistent. Analysiere das Bild dieser Rechnung und gib ausschliesslich ein JSON-Objekt zurueck (kein Markdown, keine Erklaerungen):

{
  "haendler": "Name des Haendlers oder null",
  "datum": "YYYY-MM-DD oder null",
  "gesamt": 49.99,
  "positionen": [
    {
      "name": "Produktname wie auf Rechnung",
      "menge": 1,
      "einheit": "Stueck",
      "einzelpreis": 9.99,
      "gesamtpreis": 9.99,
      "obergruppe": "lebensmittel | getraenke | reinigung | drogerie | elektronik | moebel | kleidung | baumarkt | keine_zuordnung",
      "confidence": 0.91
    }
  ]
}

Wichtige Regeln:
- einzelpreis = Preis pro Einheit (NICHT der Zeilengesamtpreis)
  Kraftstoff-Beispiel: menge=33.43, einheit="Liter", einzelpreis=1.439, gesamtpreis=48.11
  Stueckware-Beispiel: menge=2, einheit="Stueck", einzelpreis=4.99, gesamtpreis=9.98
- einheit: "Liter", "Stueck", "kg", "Pack", "Flasche", "m" etc.
- gesamtpreis = einzelpreis x menge
- Dezimalpunkte fuer Zahlen (kein Komma). Unbekannte Felder auf null.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth pruefen
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Service-Role-Client fuer household_settings
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Haushalt des Users ermitteln
  const { data: membership } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.household_id) {
    return new Response(
      JSON.stringify({ error: "Kein aktiver Haushalt vorhanden." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Ungueltige JSON-Payload." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { mode, file_base64, mime_type, prompt } = payload ?? {};
  if (!file_base64 || !mime_type) {
    return new Response(
      JSON.stringify({ error: "file_base64 und mime_type sind erforderlich." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── ChatGPT Vision ────────────────────────────────────────────────────────
  if (mode === "chatgpt_vision") {
    const { data: visionSettings } = await supabaseAdmin
      .from("household_settings")
      .select("bildanalyse_openai_api_key")
      .eq("household_id", membership.household_id)
      .maybeSingle();

    const openaiKey = visionSettings?.bildanalyse_openai_api_key;
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "Kein OpenAI API-Key fuer Bildanalyse konfiguriert. Bitte unter Profil \u2192 Bildanalyse einen Key hinterlegen." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const visionPrompt = prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER;
    const messages = [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mime_type};base64,${file_base64}`, detail: "high" } },
        { type: "text", text: visionPrompt },
      ],
    }];

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "gpt-4o", messages, temperature: 0.1 }),
    });

    const openaiJson = await openaiRes.json().catch(() => ({}));
    if (!openaiRes.ok) {
      return new Response(
        JSON.stringify({ error: (openaiJson as any)?.error?.message || `OpenAI HTTP ${openaiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = (openaiJson as any)?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return new Response(
      JSON.stringify({ status: "ok", text: content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Ollama Vision ─────────────────────────────────────────────────────────
  if (mode === "ocr_ollama") {
    const { data: s } = await supabaseAdmin
      .from("household_settings")
      .select("ollama_base_url, ollama_model, ollama_vision_model")
      .eq("household_id", membership.household_id)
      .maybeSingle();

    if (!s?.ollama_base_url) {
      return new Response(
        JSON.stringify({ error: "Kein Ollama-Server konfiguriert. Bitte unter Profil \u2192 KI-Assistent eine Ollama-URL hinterlegen." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ollamaBase = s.ollama_base_url.replace(/\/$/, "");
    // Vision-Modell bevorzugt; Fallback auf Text-Modell, dann "llava"
    const ollamaModel = s.ollama_vision_model || s.ollama_model || "llava";
    const ocrPrompt = prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER;

    const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mime_type};base64,${file_base64}` } },
            { type: "text", text: ocrPrompt },
          ],
        }],
        temperature: 0.1,
      }),
    });

    const ollamaJson = await ollamaRes.json().catch(() => ({}));
    if (!ollamaRes.ok) {
      return new Response(
        JSON.stringify({ error: (ollamaJson as any)?.error?.message || `Ollama HTTP ${ollamaRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = (ollamaJson as any)?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return new Response(
      JSON.stringify({ status: "ok", text: content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Unbekannter Modus ─────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ error: `Unbekannter Modus: ${mode}. Erlaubt: chatgpt_vision, ocr_ollama` }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
