// Supabase Edge Function: ki-chat
// Serverseitiger KI-Proxy fuer Haushalts-KI (OpenAI/Ollama).
// Mitglieder duerfen KI nutzen, Schluessel bleiben serverseitig.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

type ChatMessage = { role: string; content: string | ContentPart[] };

const parseJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

  const payload = await parseJson(req);
  const messages = (payload?.messages ?? []) as ChatMessage[];
  const requestedModel = typeof payload?.model === "string" ? payload.model : undefined;
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.2;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages ist erforderlich." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return new Response(membershipError.message, { status: 500, headers: corsHeaders });
  }
  if (!membership?.household_id) {
    return new Response(
      JSON.stringify({ error: "Kein aktiver Haushalt vorhanden." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("household_settings")
    .select("ki_provider, openai_api_key, ollama_base_url, ollama_model")
    .eq("household_id", membership.household_id)
    .maybeSingle();

  if (settingsError) {
    return new Response(settingsError.message, { status: 500, headers: corsHeaders });
  }
  if (!settings) {
    return new Response(
      JSON.stringify({ error: "Keine KI-Einstellungen fuer diesen Haushalt gefunden." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const provider = settings.ki_provider || "openai";

  try {
    if (provider === "ollama" && settings.ollama_base_url) {
      const base = settings.ollama_base_url.replace(/\/$/, "");
      const ollamaModel = requestedModel || settings.ollama_model || "llama3.2";
      const ollamaRes = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages,
          temperature,
        }),
      });

      const ollamaJson = await ollamaRes.json().catch(() => ({}));
      if (!ollamaRes.ok) {
        return new Response(
          JSON.stringify({ error: ollamaJson?.error?.message || ollamaJson?.error || `Ollama HTTP ${ollamaRes.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify(ollamaJson), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = settings.openai_api_key;
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API-Key ist im Haushalt nicht konfiguriert." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiModel = requestedModel || "gpt-4o";
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages,
        temperature,
      }),
    });

    const openaiJson = await openaiRes.json().catch(() => ({}));
    if (!openaiRes.ok) {
      return new Response(
        JSON.stringify({ error: openaiJson?.error?.message || `OpenAI HTTP ${openaiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(openaiJson), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "KI-Proxy Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

