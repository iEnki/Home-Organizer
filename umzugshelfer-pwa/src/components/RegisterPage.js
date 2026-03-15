import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Mail, KeyRound } from "lucide-react";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage("");

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (
        data.user &&
        data.user.identities &&
        data.user.identities.length === 0
      ) {
        setMessage(
          "Benutzer existiert bereits und ist nicht bestätigt. Bitte prüfe dein Postfach für eine neue Bestätigungs-E-Mail."
        );
      } else if (data.session) {
        setMessage("Registrierung erfolgreich! Du wirst weitergeleitet...");
        setTimeout(() => navigate("/dashboard"), 2000);
      } else {
        setMessage(
          "Registrierung erfolgreich! Bitte bestätige deine E-Mail-Adresse, um dich einzuloggen. Überprüfe dein Postfach (auch Spam)."
        );
      }
    } catch (err) {
      console.error("Registrierungsfehler:", err);
      setError(
        err.message || "Ein Fehler ist bei der Registrierung aufgetreten."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 text-light-text-main dark:text-dark-text-main">
      <div className="max-w-md w-full space-y-8 bg-light-card-bg dark:bg-dark-card-bg p-10 rounded-xl shadow-2xl border border-light-border dark:border-dark-border">
        <div>
          <UserPlus className="mx-auto h-12 w-auto text-light-accent-green dark:text-dark-accent-green" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Neues Konto erstellen
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          {error && (
            <p className="text-sm text-danger-color bg-danger-color/20 p-3 rounded-md">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-light-accent-green bg-light-accent-green/20 dark:text-dark-accent-green dark:bg-dark-accent-green/20 p-3 rounded-md">
              {message}
            </p>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div className="relative mb-4">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail
                  className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary"
                  aria-hidden="true"
                />
              </div>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-light-border dark:border-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border focus:outline-none focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:border-light-accent-green dark:focus:border-dark-accent-green sm:text-sm"
                placeholder="E-Mail-Adresse"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="relative mb-4">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound
                  className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary"
                  aria-hidden="true"
                />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-light-border dark:border-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border focus:outline-none focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:border-light-accent-green dark:focus:border-dark-accent-green sm:text-sm"
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound
                  className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary"
                  aria-hidden="true"
                />
              </div>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-light-border dark:border-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border focus:outline-none focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:border-light-accent-green dark:focus:border-dark-accent-green sm:text-sm"
                placeholder="Passwort bestätigen"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white dark:text-dark-bg bg-light-accent-green dark:bg-dark-accent-green hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:ring-offset-light-card-bg dark:focus:ring-offset-dark-card-bg disabled:opacity-50"
            >
              {loading ? "Registriere..." : "Registrieren"}
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link
            to="/login"
            className="font-medium text-light-accent-green dark:text-dark-accent-green hover:opacity-80"
          >
            Bereits ein Konto? Hier einloggen
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
