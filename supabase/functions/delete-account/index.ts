// Supabase Edge Function: delete-account
// Loescht den authentifizierten User-Account dauerhaft.
// Verifiziert das JWT mit dem Anon-Key, dann loescht den Account mit dem Service-Role-Key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // User-JWT verifizieren (Anon-Key reicht fuer getUser)
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Account loeschen - braucht Service Role
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin darf seinen Account nicht loeschen, solange er Admin eines Haushalts ist.
  // Falls die Multiuser-Tabellen noch nicht existieren, wird diese Pruefung uebersprungen.
  const { data: adminMembership, error: membershipError } = await supabaseAdmin
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError && membershipError.code !== "42P01" && membershipError.code !== "PGRST205") {
    return new Response(membershipError.message, { status: 500, headers: corsHeaders });
  }

  if (adminMembership?.household_id) {
    return new Response(
      JSON.stringify({
        error:
          "Admin-Account kann nicht geloescht werden, solange die Admin-Rolle aktiv ist. Erst Admin uebertragen oder Haushalt loeschen.",
      }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(deleteError.message, { status: 500, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ deleted: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
