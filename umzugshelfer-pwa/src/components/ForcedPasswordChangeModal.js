import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "../supabaseClient";

const ForcedPasswordChangeModal = ({ open, onCompleted }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const blockEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockEscape, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", blockEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Die Passwoerter stimmen nicht ueberein.");
      return;
    }

    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { invite_first_login_required: false },
      });
      if (updateError) throw updateError;

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const userId = userData?.user?.id;
      if (!userId) {
        throw new Error("Benutzer konnte nicht ermittelt werden.");
      }

      const { error: profileError } = await supabase
        .from("user_profile")
        .upsert(
          { id: userId, password_change_required: false },
          { onConflict: "id" }
        );
      if (profileError) throw profileError;

      setSuccess("Passwort erfolgreich aktualisiert.");
      onCompleted?.();
    } catch (submitError) {
      setError(
        submitError?.message ||
          "Passwort konnte nicht aktualisiert werden. Bitte erneut versuchen."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-password-change-title"
    >
      <div className="w-full max-w-md bg-light-card-bg dark:bg-dark-card-bg border border-light-border dark:border-dark-border rounded-xl shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <ShieldCheck className="mx-auto h-12 w-12 text-light-accent-green dark:text-dark-accent-green" />
          <h2
            id="forced-password-change-title"
            className="mt-4 text-2xl font-bold text-light-text-main dark:text-dark-text-main"
          >
            Passwort aendern erforderlich
          </h2>
          <p className="mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Aus Sicherheitsgruenden musst du jetzt ein eigenes Passwort festlegen.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md text-sm bg-danger-color/20 text-danger-color">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-md text-sm bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <KeyRound className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
            </div>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="Neues Passwort"
              className="w-full rounded-md border border-light-border dark:border-dark-border bg-white dark:bg-dark-border px-3 py-3 pl-10 text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <KeyRound className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
            </div>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              placeholder="Passwort bestaetigen"
              className="w-full rounded-md border border-light-border dark:border-dark-border bg-white dark:bg-dark-border px-3 py-3 pl-10 text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md py-3 px-4 text-sm font-medium text-white dark:text-dark-bg bg-light-accent-green dark:bg-dark-accent-green hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Speichere..." : "Passwort jetzt festlegen"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForcedPasswordChangeModal;
