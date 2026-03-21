import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const resolveInviteLink = (inviteLink: string) => {
  const trimmed = inviteLink.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const appUrl =
    (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
  if (!appUrl) return "";
  if (!trimmed.startsWith("/")) return "";
  return `${appUrl}${trimmed}`;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Supabase Umgebungsvariablen fehlen." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const inviteEmail = String(body?.inviteEmail || "").trim().toLowerCase();
  const inviteLinkRaw = String(body?.inviteLink || "").trim();
  const householdName = String(body?.householdName || "").trim();
  const inviterName = String(body?.inviterName || "").trim();

  if (!inviteEmail || !inviteEmail.includes("@")) {
    return json({ error: "inviteEmail ist ungueltig." }, 400);
  }
  const inviteLink = resolveInviteLink(inviteLinkRaw);
  if (!inviteLink) {
    return json({ error: "inviteLink ist ungueltig oder APP_URL/SITE_URL fehlt." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: membership, error: membershipError } = await adminClient
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError) return json({ error: membershipError.message }, 500);
  if (!membership?.household_id) {
    return json({ error: "Nur Haushalts-Admin darf Einladungen versenden." }, 403);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = Deno.env.get("INVITE_FROM_EMAIL") || "";
  const brandName = Deno.env.get("INVITE_BRAND_NAME") || "Umzugshelfer";
  const title = householdName
    ? `Einladung zum Haushalt "${householdName}"`
    : "Einladung zu einem gemeinsamen Haushalt";
  const inviter = inviterName || authData.user.email || "Ein Haushalts-Admin";

  const html = `
  <div style="margin:0;padding:0;background:#071224;font-family:Inter,Segoe UI,Arial,sans-serif;color:#dbeafe;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1a33;border:1px solid #14325f;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 10px;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8;">${escapeHtml(brandName)}</div>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;color:#f8fafc;">Haushaltseinladung</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#cbd5e1;">
                ${escapeHtml(inviter)} hat dich eingeladen, gemeinsam im Haushalt zu arbeiten.
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;font-size:14px;line-height:1.6;color:#94a3b8;">
                ${householdName ? `Haushalt: <strong style="color:#f1f5f9">${escapeHtml(householdName)}</strong><br/>` : ""}
                Wenn du noch kein Konto hast, kannst du dich nach Klick auf den Link direkt registrieren.
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;">
                <a href="${escapeHtml(inviteLink)}" style="display:inline-block;background:#06b6d4;color:#042f2e;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;">
                  Einladung annehmen
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;font-size:12px;line-height:1.5;color:#64748b;">
                Falls der Button nicht funktioniert, nutze diesen Link:<br/>
                <a href="${escapeHtml(inviteLink)}" style="color:#38bdf8;word-break:break-all;">${escapeHtml(inviteLink)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  const text = `${inviter} hat dich zu einem Haushalt eingeladen.\n\nEinladung annehmen: ${inviteLink}`;

  if (resendApiKey && fromEmail) {
    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [inviteEmail],
        subject: title,
        html,
        text,
      }),
    });

    const mailJson = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok) {
      return json(
        {
          error: mailJson?.message || mailJson?.error || `Resend HTTP ${mailResponse.status}`,
        },
        502,
      );
    }

    return json({ sent: true, provider: "resend" });
  }

  // Fallback: Supabase Auth Mail (SMTP aus GoTrue Konfiguration).
  // Verwendet Standard-Mailtemplate der Auth-Instanz und funktioniert auch ohne Resend.
  const otpClient = createClient(supabaseUrl, anonKey);
  const { error: otpError } = await otpClient.auth.signInWithOtp({
    email: inviteEmail,
    options: {
      emailRedirectTo: inviteLink,
      shouldCreateUser: true,
      data: {
        invite_first_login_required: true,
        household_name: householdName || null,
        inviter_name: inviter || null,
      },
    },
  });

  if (otpError) {
    return json(
      {
        error:
          `Mailversand fehlgeschlagen (Resend nicht gesetzt und SMTP-OTP fehlgeschlagen): ${otpError.message}`,
      },
      503,
    );
  }

  return json({ sent: true, provider: "supabase_smtp" });
});
