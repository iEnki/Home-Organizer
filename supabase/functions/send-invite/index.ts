// Supabase Edge Function: send-invite
// Lädt ein neues Mitglied per E-Mail in einen Haushalt ein.
//
// Body: { haushalt_id: string, email: string, app_url?: string }
// Auth: aufrufer muss Mitglied (admin) des Haushalts sein

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // appPublicUrl wird primär aus dem Request-Body gelesen (window.location.origin der App).
  // Env-Vars APP_URL / SITE_URL dienen als optionaler Fallback für Server-seitige Nutzung.
  // So ist keine spezielle Serverkonfiguration für Edge Functions nötig.
  let appPublicUrl = Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "";

  // Aufrufer authentifizieren
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Nicht autorisiert" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { haushalt_id, email, app_url } = body as {
    haushalt_id?: string;
    email?: string;
    app_url?: string;
  };

  // app_url aus dem Body hat höchste Priorität (direkt vom Browser)
  if (app_url && app_url.startsWith("http")) {
    appPublicUrl = app_url;
  }

  if (!appPublicUrl) {
    return new Response(
      JSON.stringify({ error: "App-URL konnte nicht ermittelt werden. Bitte APP_URL in den Edge Function Secrets setzen." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!haushalt_id || !email) {
    return new Response(
      JSON.stringify({ error: "haushalt_id und email sind erforderlich" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Prüfen ob Aufrufer Admin des Haushalts ist
  const { data: mitglied } = await supabaseAdmin
    .from("haushalt_mitglieder")
    .select("rolle")
    .eq("haushalt_id", haushalt_id)
    .eq("user_id", user.id)
    .eq("status", "akzeptiert")
    .single();

  if (!mitglied || mitglied.rolle !== "admin") {
    return new Response(
      JSON.stringify({ error: "Nur Admins können Mitglieder einladen" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Prüfen ob E-Mail bereits eingeladen / Mitglied ist
  const { data: vorhandener } = await supabaseAdmin
    .from("haushalt_mitglieder")
    .select("id, status")
    .eq("haushalt_id", haushalt_id)
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (vorhandener && vorhandener.status === "akzeptiert") {
    return new Response(
      JSON.stringify({ error: "Diese Person ist bereits Mitglied" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Haushalt-Name laden
  const { data: haushalt } = await supabaseAdmin
    .from("haushalte")
    .select("name")
    .eq("id", haushalt_id)
    .single();

  // Einladungs-Eintrag erstellen (oder vorhandenen ausstehenden wiederverwenden)
  let invite_token: string;

  if (vorhandener) {
    // Bereits ausstehende Einladung — Token wiederverwenden
    const { data: existing } = await supabaseAdmin
      .from("haushalt_mitglieder")
      .select("invite_token")
      .eq("id", vorhandener.id)
      .single();
    invite_token = existing?.invite_token ?? crypto.randomUUID();
  } else {
    // Neuen Eintrag anlegen
    const { data: neu, error: insertError } = await supabaseAdmin
      .from("haushalt_mitglieder")
      .insert({
        haushalt_id,
        email: email.toLowerCase(),
        status: "ausstehend",
        eingeladen_von: user.id,
        rolle: "mitglied",
      })
      .select("invite_token")
      .single();

    if (insertError || !neu) {
      console.error("Fehler beim Erstellen des Einladungseintrags:", insertError);
      return new Response(
        JSON.stringify({ error: "Einladung konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    invite_token = neu.invite_token;
  }

  // App-URL für Einladungslink
  const einladungsLink = `${appPublicUrl}/haushalt/einladung?token=${invite_token}`;

  // E-Mail über Supabase Admin senden (inviteUserByEmail)
  // Funktioniert für neue UND bestehende Nutzer
  let emailGesendet = false;
  try {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: einladungsLink,
        data: {
          haushalt_id,
          haushalt_name: haushalt?.name ?? "Haushalt",
          invite_token,
        },
      },
    );
    if (inviteError) {
      console.error("E-Mail Einladungsfehler:", inviteError.message);
    } else {
      emailGesendet = true;
    }
  } catch (e) {
    console.error("E-Mail konnte nicht gesendet werden:", e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      email_gesendet: emailGesendet,
      // Fallback-Link falls kein SMTP konfiguriert
      invite_link: emailGesendet ? undefined : einladungsLink,
      hinweis: emailGesendet
        ? `Einladung an ${email} wurde gesendet.`
        : `Kein SMTP konfiguriert. Teile diesen Link manuell: ${einladungsLink}`,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
