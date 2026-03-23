// HaushaltEinladung — Einladungs-Annahme-Seite
// Aufruf via /haushalt/einladung?token=XXX
// Öffentliche Route: nicht eingeloggte Nutzer werden zu /login weitergeleitet

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAppMode } from "../contexts/AppModeContext";
import { Home, UserCheck, UserX, Loader2, KeyRound, Eye, EyeOff } from "lucide-react";

const HaushaltEinladung = ({ session, loadingAuth }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { switchToHome, markOnboardingGezeigt } = useAppMode();
  const params    = new URLSearchParams(location.search);
  const token     = params.get("token");

  const [ladeStatus, setLadeStatus]         = useState("laden"); // laden | bereit | fehler | kein_token
  const [einladung, setEinladung]           = useState(null);    // { id, haushalt_id, email, haushalt: { name } }
  const [fehler, setFehler]                 = useState("");
  const [verarbeitung, setVerarbeitung]     = useState(false);
  const [ergebnis, setErgebnis]             = useState(null);    // 'akzeptiert' | 'abgelehnt'

  // Pflicht-Passwort-Modal nach Einladungsannahme
  const [passwortSchritt, setPasswortSchritt] = useState(false);
  const [neuesPasswort, setNeuesPasswort]     = useState("");
  const [pwWiederholung, setPwWiederholung]   = useState("");
  const [pwFehler, setPwFehler]               = useState("");
  const [pwLaedt, setPwLaedt]                 = useState(false);
  const [pwZeigen1, setPwZeigen1]             = useState(false);
  const [pwZeigen2, setPwZeigen2]             = useState(false);

  const handlePasswortSetzen = async () => {
    if (neuesPasswort.length < 8) { setPwFehler("Mindestens 8 Zeichen erforderlich."); return; }
    if (neuesPasswort !== pwWiederholung) { setPwFehler("Passwörter stimmen nicht überein."); return; }
    setPwFehler("");
    setPwLaedt(true);
    const { error } = await supabase.auth.updateUser({ password: neuesPasswort });
    if (error) { setPwFehler(error.message); setPwLaedt(false); return; }
    // Neuen Haushaltsmitgliedern automatisch Home-Modus setzen
    switchToHome();
    markOnboardingGezeigt();
    setPasswortSchritt(false);
  };

  // Kein Token — direkt Fehler
  useEffect(() => {
    if (!token) {
      setLadeStatus("kein_token");
      return;
    }

    // Warten bis Auth-Status bekannt ist
    if (loadingAuth) return;

    // Nicht eingeloggt → zu Login weiterleiten, danach zurückkommen
    if (!session) {
      const redirect = encodeURIComponent(`/haushalt/einladung?token=${token}`);
      navigate(`/login?redirect=${redirect}`, { replace: true });
      return;
    }

    // Token aus Datenbank laden
    const ladeEinladung = async () => {
      const { data, error } = await supabase
        .from("haushalt_mitglieder")
        .select("id, haushalt_id, email, status, rolle, haushalte(name)")
        .eq("invite_token", token)
        .maybeSingle();

      if (error || !data) {
        setFehler("Einladung nicht gefunden oder bereits abgelaufen.");
        setLadeStatus("fehler");
        return;
      }

      if (data.status === "akzeptiert") {
        setErgebnis("akzeptiert");
        setLadeStatus("bereit");
        setEinladung(data);
        return;
      }

      if (data.status === "abgelehnt") {
        setFehler("Diese Einladung wurde bereits abgelehnt.");
        setLadeStatus("fehler");
        return;
      }

      setEinladung(data);
      setLadeStatus("bereit");
    };

    ladeEinladung();
  }, [token, session, navigate, loadingAuth]);

  // ── Einladung annehmen (via SECURITY DEFINER RPC) ────────────────────────────
  const handleAkzeptieren = async () => {
    if (!einladung || verarbeitung) return;
    setVerarbeitung(true);
    setFehler("");

    // Prüfen ob User bereits in einem anderen Haushalt ist
    const { data: bestehendesMitglied } = await supabase
      .from("haushalt_mitglieder")
      .select("id, haushalt_id")
      .eq("user_id", session.user.id)
      .eq("status", "akzeptiert")
      .maybeSingle();

    if (bestehendesMitglied && bestehendesMitglied.haushalt_id !== einladung.haushalt_id) {
      setFehler("Du bist bereits Mitglied eines anderen Haushalts. Verlasse ihn zuerst, um diese Einladung anzunehmen.");
      setVerarbeitung(false);
      return;
    }

    // SECURITY DEFINER RPC — umgeht RLS, validiert per E-Mail
    const { data, error } = await supabase.rpc("accept_haushalt_invite", { p_token: token });

    if (error || !data?.ok) {
      setFehler(data?.error ?? error?.message ?? "Fehler beim Annehmen der Einladung.");
      setVerarbeitung(false);
      return;
    }

    setErgebnis("akzeptiert");
    setPasswortSchritt(true); // Pflicht-Passwort-Modal direkt öffnen
    setVerarbeitung(false);
  };

  // ── Einladung ablehnen (via SECURITY DEFINER RPC) ────────────────────────────
  const handleAblehnen = async () => {
    if (!einladung || verarbeitung) return;
    setVerarbeitung(true);
    setFehler("");

    const { data, error } = await supabase.rpc("reject_haushalt_invite", { p_token: token });

    if (error || !data?.ok) {
      setFehler(data?.error ?? error?.message ?? "Fehler beim Ablehnen der Einladung.");
      setVerarbeitung(false);
      return;
    }

    setErgebnis("abgelehnt");
    setVerarbeitung(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-light-bg dark:bg-canvas-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-primary-500/10 border border-primary-500/20 mb-4">
            <Home size={32} className="text-primary-500" />
          </div>
          <h1 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
            Haushalt-Einladung
          </h1>
        </div>

        <div className="bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border rounded-2xl p-6 shadow-elevation-2">

          {/* Laden */}
          {ladeStatus === "laden" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-primary-500" />
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                Einladung wird geladen…
              </p>
            </div>
          )}

          {/* Kein Token */}
          {ladeStatus === "kein_token" && (
            <div className="text-center py-6">
              <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                Kein Einladungstoken gefunden. Bitte nutze den vollständigen Link aus der Einladungs-E-Mail.
              </p>
              <button
                onClick={() => navigate("/home")}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Zur App
              </button>
            </div>
          )}

          {/* Fehler */}
          {ladeStatus === "fehler" && (
            <div className="text-center py-6">
              <p className="text-red-600 dark:text-red-400 mb-4">{fehler}</p>
              <button
                onClick={() => navigate("/home")}
                className="px-4 py-2 bg-light-hover dark:bg-canvas-3 hover:bg-light-border dark:hover:bg-canvas-4
                           text-light-text-main dark:text-dark-text-main
                           border border-light-border dark:border-dark-border
                           rounded-lg text-sm font-medium transition-colors"
              >
                Zur App
              </button>
            </div>
          )}

          {/* Pflicht-Passwort-Modal (nach Einladungsannahme, nicht schließbar) */}
          {ladeStatus === "bereit" && ergebnis === "akzeptiert" && passwortSchritt && (
            <div className="py-2 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-500/10 border border-primary-500/20
                                flex items-center justify-center">
                  <KeyRound size={20} className="text-primary-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
                    Passwort festlegen
                  </h2>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Schritt 2 von 2 — Einladung angenommen
                  </p>
                </div>
              </div>

              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Du wurdest per Einladung hinzugefügt. Lege jetzt ein eigenes Passwort fest,
                damit du dich später normal einloggen kannst.
              </p>

              {pwFehler && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20
                               px-3 py-2 rounded-lg">
                  {pwFehler}
                </p>
              )}

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={pwZeigen1 ? "text" : "password"}
                    placeholder="Neues Passwort (min. 8 Zeichen)"
                    value={neuesPasswort}
                    onChange={e => { setNeuesPasswort(e.target.value); setPwFehler(""); }}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm
                               bg-light-hover dark:bg-canvas-3
                               border border-light-border dark:border-dark-border
                               text-light-text-main dark:text-dark-text-main
                               placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                               focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                  <button type="button" onClick={() => setPwZeigen1(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary">
                    {pwZeigen1 ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={pwZeigen2 ? "text" : "password"}
                    placeholder="Passwort wiederholen"
                    value={pwWiederholung}
                    onChange={e => { setPwWiederholung(e.target.value); setPwFehler(""); }}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm
                               bg-light-hover dark:bg-canvas-3
                               border border-light-border dark:border-dark-border
                               text-light-text-main dark:text-dark-text-main
                               placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                               focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                  <button type="button" onClick={() => setPwZeigen2(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary">
                    {pwZeigen2 ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                onClick={handlePasswortSetzen}
                disabled={pwLaedt || !neuesPasswort || !pwWiederholung}
                className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-50
                           text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {pwLaedt
                  ? <><Loader2 size={16} className="animate-spin" /> Wird gespeichert…</>
                  : "Passwort festlegen"}
              </button>
            </div>
          )}

          {/* Einladung bereit — Ergebnis: akzeptiert + Passwort gesetzt */}
          {ladeStatus === "bereit" && ergebnis === "akzeptiert" && !passwortSchritt && (
            <div className="text-center py-4 space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full
                              bg-green-500/10 border border-green-500/20">
                <UserCheck size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                  Alles erledigt!
                </h2>
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                  Du bist jetzt Mitglied von{" "}
                  <span className="font-medium text-light-text-main dark:text-dark-text-main">
                    {einladung?.haushalte?.name ?? "Haushalt"}
                  </span>
                  . Alle geteilten Daten sind für dich sichtbar.
                </p>
              </div>
              <button
                onClick={() => { switchToHome(); markOnboardingGezeigt(); navigate("/home"); }}
                className="w-full py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600
                           text-white text-sm font-semibold transition-colors"
              >
                Zur App
              </button>
            </div>
          )}

          {/* Einladung bereit — Ergebnis: abgelehnt */}
          {ladeStatus === "bereit" && ergebnis === "abgelehnt" && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full
                              bg-red-500/10 border border-red-500/20 mb-4">
                <UserX size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                Einladung abgelehnt
              </h2>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm mb-6">
                Du hast die Einladung abgelehnt.
              </p>
              <button
                onClick={() => navigate("/home")}
                className="px-6 py-2 bg-light-hover dark:bg-canvas-3 hover:bg-light-border dark:hover:bg-canvas-4
                           text-light-text-main dark:text-dark-text-main
                           border border-light-border dark:border-dark-border
                           rounded-lg text-sm font-medium transition-colors"
              >
                Zur App
              </button>
            </div>
          )}

          {/* Einladung bereit — Auswahl */}
          {ladeStatus === "bereit" && !ergebnis && einladung && (
            <>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm mb-1">
                Du wurdest eingeladen, dem Haushalt beizutreten:
              </p>
              <h2 className="text-xl font-bold text-light-text-main dark:text-dark-text-main mb-6">
                {einladung.haushalte?.name ?? "Haushalt"}
              </h2>

              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm mb-6">
                Als Mitglied siehst du alle geteilten Haushaltsdaten (Einkaufsliste, Vorräte,
                Aufgaben, Inventar, Budget und mehr) und kannst sie mitbearbeiten.
              </p>

              {fehler && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm">{fehler}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleAkzeptieren}
                  disabled={verarbeitung}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4
                             bg-primary-500 hover:bg-primary-600 disabled:opacity-50
                             text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  {verarbeitung ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  Annehmen
                </button>
                <button
                  onClick={handleAblehnen}
                  disabled={verarbeitung}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4
                             bg-light-hover dark:bg-canvas-3 hover:bg-light-border dark:hover:bg-canvas-4
                             disabled:opacity-50
                             text-light-text-secondary dark:text-dark-text-secondary
                             border border-light-border dark:border-dark-border
                             rounded-xl font-semibold text-sm transition-colors"
                >
                  {verarbeitung ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <UserX size={16} />
                  )}
                  Ablehnen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HaushaltEinladung;
