// Supabase Edge Function: delete-account
// Löscht den authentifizierten User-Account dauerhaft.
// Verifiziert das JWT mit dem Anon-Key, dann löscht den Account mit dem Service-Role-Key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
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

  // User-JWT verifizieren (Anon-Key reicht für getUser)
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Account löschen — braucht Service Role
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(deleteError.message, { status: 500, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ deleted: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
