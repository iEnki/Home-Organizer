import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Users } from "lucide-react";
import { supabase, setActiveHouseholdId } from "../supabaseClient";
import ForcedPasswordChangeModal from "./ForcedPasswordChangeModal";

const mapInviteError = (message) => {
  const text = (message || "").toLowerCase();
  if (text.includes("bereits einem haushalt")) {
    return "Dein Account ist bereits einem Haushalt zugeordnet. Verlasse zuerst den aktuellen Haushalt oder nutze ein anderes Konto.";
  }
  if (text.includes("andere e-mail")) {
    return "Diese Einladung ist an eine andere E-Mail-Adresse gebunden.";
  }
  if (text.includes("ungueltig") || text.includes("ungültig") || text.includes("abgelaufen")) {
    return "Dieser Einladungslink ist ungültig oder abgelaufen.";
  }
  return message || "Einladung konnte nicht angenommen werden.";
};

const JoinHouseholdPage = ({ session }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [status, setStatus] = useState(token ? "ready" : "invalid");
  const [errorText, setErrorText] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const nextPath = useMemo(
    () => `/join-household?token=${encodeURIComponent(token)}`,
    [token]
  );

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
    }
  }, [session?.user?.id, token]);

  const handleAcceptInvite = async () => {
    if (!session?.user?.id || !token) return;

    setStatus("loading");
    setErrorText("");

    const { data, error } = await supabase.rpc("accept_household_invite", {
      p_token: token,
    });

    if (error) {
      setStatus("error");
      setErrorText(mapInviteError(error.message));
      return;
    }

    if (data) setActiveHouseholdId(data);

    const { data: profile, error: profileError } = await supabase
      .from("user_profile")
      .select("password_change_required")
      .eq("id", session.user.id)
      .maybeSingle();

    const { data: currentUserData } = await supabase.auth.getUser();
    const markerRaw =
      currentUserData?.user?.user_metadata?.invite_first_login_required;
    const metadataRequiresPasswordChange =
      markerRaw === true || markerRaw === "true";

    if (
      (!profileError && profile?.password_change_required === true) ||
      metadataRequiresPasswordChange
    ) {
      setStatus("awaiting_password");
      setShowPasswordModal(true);
      return;
    }

    setStatus("success");
    setTimeout(() => navigate("/", { replace: true }), 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 text-light-text-main dark:text-dark-text-main">
      <div className="w-full max-w-lg rounded-xl border border-light-border dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg shadow-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-secondary-500/15 text-secondary-500 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Haushalt beitreten</h1>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Einladung über Link annehmen
            </p>
          </div>
        </div>

        {status === "invalid" && (
          <p className="text-sm text-accent-danger flex items-center gap-2">
            <AlertCircle size={16} /> Es wurde kein gültiger Token im Link gefunden.
          </p>
        )}

        {token && !session && (
          <div className="space-y-4">
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Bitte melde dich mit der eingeladenen E-Mail-Adresse an oder registriere ein neues Konto.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/login?next=${encodeURIComponent(nextPath)}`}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                Anmelden
              </Link>
              <Link
                to={`/register?next=${encodeURIComponent(nextPath)}`}
                className="px-4 py-2 rounded-md text-sm font-medium border border-light-border dark:border-dark-border hover:border-secondary-500/50 transition-colors"
              >
                Neu registrieren
              </Link>
            </div>
          </div>
        )}

        {token && session && status !== "success" && (
          <div className="space-y-4">
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Willkommen. Bitte bestätige, dass du dieser Haushaltseinladung beitreten möchtest.
            </p>
            <button
              type="button"
              onClick={handleAcceptInvite}
              disabled={
                status === "loading" ||
                status === "awaiting_password" ||
                status === "success"
              }
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Einladung wird angenommen..." : "Einladung annehmen"}
            </button>
          </div>
        )}

        {token && session && status === "loading" && (
          <p className="text-sm flex items-center gap-2 text-light-text-secondary dark:text-dark-text-secondary">
            <Loader2 size={16} className="animate-spin" /> Einladung wird geprüft...
          </p>
        )}

        {status === "success" && (
          <p className="text-sm text-accent-success flex items-center gap-2">
            <CheckCircle2 size={16} /> Erfolgreich beigetreten. Du wirst weitergeleitet...
          </p>
        )}

        {status === "awaiting_password" && (
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Bitte lege jetzt dein Passwort fest, um fortzufahren.
          </p>
        )}

        {status === "error" && (
          <p className="text-sm text-accent-danger flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </p>
        )}
      </div>

      <ForcedPasswordChangeModal
        open={showPasswordModal}
        onCompleted={() => {
          setShowPasswordModal(false);
          setStatus("success");
          navigate("/", { replace: true });
        }}
      />
    </div>
  );
};

export default JoinHouseholdPage;
