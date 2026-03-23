import { supabase } from "../supabaseClient";

export const isMissingUserProfileError = (error) =>
  error?.code === "PGRST116" || Number(error?.status) === 406;

export const isAuthSessionError = (error) => {
  if (!error) return false;
  if (Number(error.status) === 401 || Number(error.code) === 401) return true;
  const message = String(error.message || "");
  return /auth|jwt|session|token|not authenticated|invalid/i.test(message);
};

export const getSupabaseErrorMessage = (
  error,
  fallback = "Speichern fehlgeschlagen."
) => {
  if (isAuthSessionError(error)) {
    return "Sitzung abgelaufen. Bitte neu einloggen und erneut versuchen.";
  }
  if (isMissingUserProfileError(error)) {
    return "Profil fehlt noch. Bitte erneut versuchen.";
  }
  return fallback;
};

export const ensureUserProfile = async (userId) => {
  if (!userId) {
    return { data: null, error: new Error("Missing user id") };
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_profile")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingError && !isMissingUserProfileError(existingError)) {
    return { data: null, error: existingError };
  }
  if (existing) return { data: existing, error: null };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError && !isAuthSessionError(authError)) {
    return { data: null, error: authError };
  }

  const fallbackEmail = authData?.user?.email || null;
  const fallbackUsername =
    authData?.user?.user_metadata?.username ||
    authData?.user?.user_metadata?.full_name ||
    (fallbackEmail ? fallbackEmail.split("@")[0] : null);

  const { error: insertError } = await supabase.from("user_profile").insert({
    id: userId,
    email: fallbackEmail,
    username: fallbackUsername,
  });

  if (insertError && insertError.code !== "23505") {
    return { data: null, error: insertError };
  }

  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error && !isMissingUserProfileError(error)) {
    return { data: null, error };
  }

  return { data: data || null, error: null };
};

export const fetchUserProfile = async (userId, columns = "*") => {
  const { error: ensureError } = await ensureUserProfile(userId);
  if (ensureError) return { data: null, error: ensureError };

  const { data, error } = await supabase
    .from("user_profile")
    .select(columns)
    .eq("id", userId)
    .maybeSingle();

  if (error && !isMissingUserProfileError(error)) {
    return { data: null, error };
  }

  return { data: data || null, error: null };
};

export const updateUserProfile = async (userId, values) => {
  const { error: ensureError } = await ensureUserProfile(userId);
  if (ensureError) return { error: ensureError };

  const { error } = await supabase
    .from("user_profile")
    .update(values)
    .eq("id", userId);

  return { error: error || null };
};
