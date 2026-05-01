import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, Mail, KeyRound, XCircle } from "lucide-react";

const LoginForm = ({ setSession, onLoginSuccess, closeLoginModal }) => {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const passwordResetRedirectUrl =
    process.env.REACT_APP_PASSWORD_RESET_REDIRECT_URL ||
    `${window.location.origin}/update-password`;
  const requestedNextPath = new URLSearchParams(location.search).get("next") || "";
  const redirectPath =
    requestedNextPath.startsWith("/") ? requestedNextPath : "/dashboard";

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) {
        throw signInError;
      }

      if (data.session) {
        if (setSession) setSession(data.session);
        if (onLoginSuccess) onLoginSuccess();
        navigate(redirectPath);
      } else {
        setError(t("auth:login.errors.generic"));
      }
    } catch (err) {
      console.error("Login-Fehler:", err);
      if (err.message.includes("Invalid login credentials")) {
        setError(t("auth:login.errors.invalidCredentials"));
      } else if (err.message.includes("Email not confirmed")) {
        setError(t("auth:login.errors.emailNotConfirmed"));
      } else {
        setError(err.message || t("auth:login.errors.unknown"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordError("");
    setForgotPasswordMessage("");
    setForgotPasswordLoading(true);

    if (!forgotPasswordEmail) {
      setForgotPasswordError(t("auth:login.errors.emailRequired"));
      setForgotPasswordLoading(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        forgotPasswordEmail.trim(),
        {
          redirectTo: passwordResetRedirectUrl,
        }
      );

      if (resetError) {
        throw resetError;
      }
      setForgotPasswordMessage(t("auth:reset.success"));
      setForgotPasswordEmail("");
    } catch (err) {
      const resetErrorMessage = `${err?.message || ""}`.toLowerCase();
      if (
        resetErrorMessage.includes("redirect") &&
        resetErrorMessage.includes("not allowed")
      ) {
        setForgotPasswordError(t("auth:reset.errors.redirectNotAllowed"));
        return;
      }
      console.error("Passwort zurücksetzen Fehler:", err);
      setForgotPasswordError(
        err.message || t("auth:reset.errors.unknown")
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-md w-full space-y-8 bg-light-card-bg dark:bg-dark-card-bg p-10 rounded-xl shadow-2xl border border-light-border dark:border-dark-border">
        {closeLoginModal && (
          <button
            onClick={closeLoginModal}
            className="absolute top-3 right-3 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main z-10"
            aria-label={t("common:actions.close")}
          >
            <XCircle size={24} />
          </button>
        )}
        <div>
          <LogIn className="mx-auto h-12 w-auto text-light-accent-green dark:text-dark-accent-green" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-light-text-main dark:text-dark-text-main">
            {t("auth:login.title")}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <p className="text-sm text-danger-color bg-danger-color/20 p-3 rounded-md">
              {error}
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
                placeholder={t("auth:login.emailLabel")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-light-border dark:border-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border focus:outline-none focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:border-light-accent-green dark:focus:border-dark-accent-green sm:text-sm"
                placeholder={t("auth:login.passwordLabel")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? t("auth:login.submitting") : t("auth:login.submit")}
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link
            to={
              requestedNextPath
                ? `/register?next=${encodeURIComponent(requestedNextPath)}`
                : "/register"
            }
            className="font-medium text-light-accent-green dark:text-dark-accent-green hover:opacity-80"
          >
            {t("auth:login.noAccount")} {t("auth:login.registerHere")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowForgotPasswordModal(true);
              setForgotPasswordEmail("");
              setForgotPasswordMessage("");
              setForgotPasswordError("");
            }}
            className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-green dark:hover:text-dark-accent-green mt-2 mx-auto"
          >
            {t("auth:login.forgotPassword")}
          </button>
        </div>
      </div>

      {showForgotPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          {" "}
          {/* Erhöhter z-index */}
          <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative border border-light-border dark:border-dark-border">
            <button
              onClick={() => setShowForgotPasswordModal(false)}
              className="absolute top-3 right-3 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-4">
              {t("auth:reset.title")}
            </h3>
            {forgotPasswordMessage && (
              <p className="text-sm text-light-accent-green bg-light-accent-green/20 dark:text-dark-accent-green dark:bg-dark-accent-green/20 p-3 rounded-md mb-4">
                {forgotPasswordMessage}
              </p>
            )}
            {forgotPasswordError && (
              <p className="text-sm text-danger-color bg-danger-color/20 p-3 rounded-md mb-4">
                {forgotPasswordError}
              </p>
            )}
            {!forgotPasswordMessage && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1"
                  >
                    {t("auth:reset.emailLabel")}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail
                        className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary"
                        aria-hidden="true"
                      />
                    </div>
                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-light-border dark:border-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border focus:outline-none focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:border-light-accent-green dark:focus:border-dark-accent-green sm:text-sm"
                      placeholder={t("auth:reset.emailPlaceholder")}
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      disabled={forgotPasswordLoading}
                    />
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={forgotPasswordLoading}
                    className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white dark:text-dark-bg bg-light-accent-green dark:bg-dark-accent-green hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-light-accent-green dark:focus:ring-dark-accent-green focus:ring-offset-light-card-bg dark:focus:ring-offset-dark-card-bg disabled:opacity-50"
                  >
                    {forgotPasswordLoading
                      ? t("auth:reset.submitting")
                      : t("auth:reset.submit")}
                  </button>
                </div>
              </form>
            )}
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(false)}
              className="mt-4 w-full text-center text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              {t("auth:reset.back")}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default LoginForm;
