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

const findExistingAuthUserByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  inviteEmail: string,
) => {
  const targetEmail = inviteEmail.trim().toLowerCase();
  if (!targetEmail) return false;

  let page = 1;
  const perPage = 200;
  const maxPages = 100;

  while (page <= maxPages) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.some((user) => (user.email || "").toLowerCase() === targetEmail);
    if (found) return true;

    if (users.length < perPage) break;
    page += 1;
  }

  return false;
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

  const inviter = inviterName || authData.user.email || "Ein Haushalts-Admin";
  let existingUserFound = false;
  try {
    existingUserFound = await findExistingAuthUserByEmail(adminClient, inviteEmail);
  } catch (existingUserCheckError) {
    return json(
      {
        error: `Einladung konnte nicht vorbereitet werden (Nutzerpruefung fehlgeschlagen): ${
          existingUserCheckError instanceof Error
            ? existingUserCheckError.message
            : "unbekannter Fehler"
        }`,
      },
      503,
    );
  }

  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: inviteLink,
      data: {
        invite_first_login_required: !existingUserFound,
        household_name: householdName || null,
        inviter_name: inviter || null,
      },
    });

  if (inviteError) {
    return json(
      {
        error:
          `Einladungs-Mail konnte nicht versendet werden: ${inviteError.message}`,
      },
      503,
    );
  }

  return json({
    sent: true,
    provider: "supabase_auth_invite",
    invited_user_id: inviteData?.user?.id || null,
    invite_requires_password_change: !existingUserFound,
  });
});
