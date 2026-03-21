// Supabase Edge Function: ki-vision
// LlamaCloud/LlamaParse Integration fuer Dokumenten-Parsing und OCR.
// Verarbeitet Rechnungen, PDFs und Scans fuer die KI-gestuetzte Rechnungserkennung.
//
// Routing:
//   POST /          -> LlamaParse-Job starten, gibt sofort job_id zurueck
//   GET  /status    -> Job-Status abfragen (Polling)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LLAMACLOUD_BASE = "https://api.cloud.llamaindex.ai/api/v2";
const POLL_MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // Service-Role-Client fuer Column-Level Security (llamacloud_api_key)
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

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ki-vision/, "");

  // ----------------------------------------------------------------
  // GET /status?job_id=... -> Job-Status abfragen
  // ----------------------------------------------------------------
  if (req.method === "GET" && path.startsWith("/status")) {
    const jobId = url.searchParams.get("job_id");
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "job_id fehlt." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: settings } = await supabaseAdmin
      .from("household_settings")
      .select("llamacloud_api_key")
      .eq("household_id", membership.household_id)
      .maybeSingle();

    const llamaKey = settings?.llamacloud_api_key;
    if (!llamaKey) {
      return new Response(
        JSON.stringify({ error: "LlamaCloud API-Key nicht konfiguriert." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const statusRes = await fetch(
        `${LLAMACLOUD_BASE}/parse/${encodeURIComponent(jobId)}?expand=text_full`,
        { headers: { Authorization: `Bearer ${llamaKey}` } },
      );

      const statusJson = await statusRes.json().catch(() => ({}));

      if (!statusRes.ok) {
        return new Response(
          JSON.stringify({ error: statusJson?.detail || `LlamaCloud HTTP ${statusRes.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const isDone = statusJson.status === "COMPLETED" || statusJson.status === "SUCCESS";
      if (isDone) {
        return new Response(
          JSON.stringify({ status: "ok", text: statusJson.text_full ?? "" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Noch nicht fertig - llama_status fuer Debugging mitsenden
      return new Response(
        JSON.stringify({ status: "pending", job_id: jobId, llama_status: statusJson.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || "Status-Abfrage fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ----------------------------------------------------------------
  // POST / -> LlamaParse-Job starten
  // ----------------------------------------------------------------
  if (req.method === "POST") {
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Ungueltige JSON-Payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { mode, file_base64, mime_type, file_name, prompt } = payload ?? {};
    if (!file_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: "file_base64 und mime_type sind erforderlich." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ChatGPT Vision ──────────────────────────────────────────────────────
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

      const messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mime_type};base64,${file_base64}`, detail: "high" } },
          { type: "text", text: prompt ?? "" },
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
      return new Response(JSON.stringify(openaiJson), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LlamaCloud API-Key lesen (nur via service_role moeglich)
    const { data: settings } = await supabaseAdmin
      .from("household_settings")
      .select("llamacloud_api_key")
      .eq("household_id", membership.household_id)
      .maybeSingle();

    const llamaKey = settings?.llamacloud_api_key;
    if (!llamaKey) {
      return new Response(
        JSON.stringify({ error: "LlamaCloud API-Key nicht konfiguriert." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      // Base64 -> Uint8Array -> Blob fuer FormData
      const binaryString = atob(file_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime_type });
      const safeFileName = file_name || `dokument.${mime_type.split("/")[1] || "bin"}`;

      const formData = new FormData();
      formData.append("file", blob, safeFileName);
      formData.append(
        "configuration",
        JSON.stringify({ tier: "fast", version: "latest" }),
      );

      // Job starten
      const uploadRes = await fetch(`${LLAMACLOUD_BASE}/parse/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${llamaKey}` },
        body: formData,
      });

      const uploadJson = await uploadRes.json().catch(() => ({}));

      if (!uploadRes.ok) {
        return new Response(
          JSON.stringify({ error: uploadJson?.detail || `LlamaCloud Upload HTTP ${uploadRes.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const jobId: string = uploadJson.id ?? uploadJson.job_id ?? uploadJson.jobId;
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: "LlamaCloud hat keine Job-ID zurueckgegeben.", raw: uploadJson }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Schnell-Polling: bis zu POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS = 10s
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);

        const pollRes = await fetch(
          `${LLAMACLOUD_BASE}/parse/${encodeURIComponent(jobId)}?expand=text_full`,
          { headers: { Authorization: `Bearer ${llamaKey}` } },
        );

        const pollJson = await pollRes.json().catch(() => ({}));

        const pollDone = pollJson.status === "COMPLETED" || pollJson.status === "SUCCESS";
        if (pollRes.ok && pollDone) {
          return new Response(
            JSON.stringify({ status: "ok", text: pollJson.text_full ?? "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Noch nicht fertig nach Schnell-Polling -> Client soll weiter pollen
      return new Response(
        JSON.stringify({ status: "pending", job_id: jobId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || "LlamaCloud-Verarbeitung fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
});
