// Edge-Runtime Hauptfunktion — routet alle /functions/v1/<name> Aufrufe
// zu den jeweiligen User-Worker-Functions per EdgeRuntime.userWorkers.create()

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "SUPABASE_DB_URL",
  "VERIFY_JWT",
  "VAPID_SUBJECT",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "RESEND_API_KEY",
  "INVITE_FROM_EMAIL",
  "INVITE_BRAND_NAME",
  "APP_URL",
  "SITE_URL",
];

Deno.serve(async (req: Request) => {
  // Kong streift /functions/v1 — der Router sieht z.B. /check-reminders
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const fnName = parts[0];

  // Kein Funktionsname oder direkte Anfrage an main → Statusantwort
  if (!fnName || fnName === "main") {
    return new Response(
      JSON.stringify({ message: "Supabase Edge Functions running" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const servicePath = `/home/deno/functions/${fnName}`;

  // Umgebungsvariablen als [[key, value], ...] Array (serde_v8 erwartet Array, kein Objekt)
  const envVars: string[][] = ENV_KEYS
    .filter((k) => Deno.env.get(k) !== undefined)
    .map((k) => [k, Deno.env.get(k)!]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 30_000,
      noModuleCache: false,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("not found") || msg.includes("No such file")
      ? 404
      : 500;
    return new Response(
      JSON.stringify({ error: `Funktion '${fnName}' nicht verfügbar: ${msg}` }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
