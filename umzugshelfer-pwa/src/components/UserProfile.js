import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Save, LogOut, Truck, Home, CheckCircle, AlertCircle, RotateCcw, Bell, BellOff, BellRing } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useTheme } from "../contexts/ThemeContext";
import { alleToursZuruecksetzen } from "./home/tour/useTour";
import { useAppMode } from "../contexts/AppModeContext";
import ThemeSwitch from "./ThemeSwitch";
import usePushSubscription from "../hooks/usePushSubscription";

const UserProfile = ({ session }) => {
  const navigate   = useNavigate();
  const { theme }  = useTheme();
  const { appMode, switchToHome, switchToUmzug } = useAppMode();

  const userId  = session?.user?.id;
  const email   = session?.user?.email || "";
  const name    = session?.user?.user_metadata?.full_name || email.split("@")[0] || "Nutzer";
  const initiale = name.charAt(0).toUpperCase();

  const [apiKey,         setApiKey]         = useState("");
  const [apiKeyVisible,  setApiKeyVisible]  = useState(false);
  const [speichernStatus, setSpeichernStatus] = useState(null); // null | "ok" | "fehler"
  const [ladend,         setLadend]         = useState(true);
  const [tourReset,      setTourReset]      = useState(false); // Bestätigungs-Feedback

  // Push-Benachrichtigungen
  const {
    isSupported:  pushUnterstuetzt,
    permission:   pushBerechtigung,
    isSubscribed: pushAktiv,
    loading:      pushLadend,
    fehler:       pushFehler,
    aktivieren:   pushAktivieren,
    deaktivieren: pushDeaktivieren,
  } = usePushSubscription(userId);

  // iOS-Erkennung (Push auf iOS nur wenn PWA installiert)
  const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true ||
                       window.matchMedia("(display-mode: standalone)").matches;

  // API-Key aus Supabase laden
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_profile")
      .select("openai_api_key")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.openai_api_key) setApiKey(data.openai_api_key);
        setLadend(false);
      });
  }, [userId]);

  const handleApiKeySpeichern = async () => {
    setSpeichernStatus(null);
    const { error } = await supabase
      .from("user_profile")
      .update({ openai_api_key: apiKey.trim() })
      .eq("id", userId);
    setSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setSpeichernStatus(null), 3000);
  };

  const handleModusWechsel = (ziel) => {
    if (ziel === "home") {
      switchToHome();
      navigate("/home");
    } else {
      switchToUmzug();
      navigate("/dashboard");
    }
  };

  const handleTourZuruecksetzen = () => {
    alleToursZuruecksetzen();
    setTourReset(true);
    setTimeout(() => setTourReset(false), 3000);
  };

  const handleAbmelden = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6
                      flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center
                        text-white text-2xl font-bold shadow-glow-primary shrink-0">
          {initiale}
        </div>
        <div>
          <h2 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">{name}</h2>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-0.5">{email}</p>
        </div>
      </div>

      {/* ── KI-Einstellungen ─────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6 space-y-4">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
          KI-Einstellungen
        </h3>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          OpenAI API-Key für KI-Assistenten (Spracheingabe, Texterkennung). Der Key wird verschlüsselt gespeichert.
        </p>

        {ladend ? (
          <div className="h-10 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={apiKeyVisible ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full pr-10 pl-3 py-2.5 text-sm rounded-card-sm
                           bg-light-bg dark:bg-canvas-1
                           border border-light-border dark:border-dark-border
                           text-light-text-main dark:text-dark-text-main
                           placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                           focus:outline-none focus:ring-2 focus:ring-secondary-500"
              />
              <button
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:text-primary-500 transition-colors"
              >
                {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              onClick={handleApiKeySpeichern}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-primary-500 hover:bg-primary-600 text-white transition-colors shrink-0"
            >
              {speichernStatus === "ok" ? (
                <><CheckCircle size={15} /> Gespeichert</>
              ) : speichernStatus === "fehler" ? (
                <><AlertCircle size={15} /> Fehler</>
              ) : (
                <><Save size={15} /> Speichern</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Erscheinungsbild ─────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mb-4">
          Erscheinungsbild
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Farbmodus
            </p>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
              Aktuell: {theme === "dark" ? "Dunkles Design" : "Helles Design"}
            </p>
          </div>
          <ThemeSwitch />
        </div>
      </div>

      {/* ── App-Modus ────────────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mb-1">
          App-Modus
        </h3>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Wähle, welchen Bereich du primär nutzt. Du kannst jederzeit wechseln.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {/* Umzugplaner */}
          <button
            onClick={() => handleModusWechsel("umzug")}
            className={`flex flex-col items-center gap-3 p-4 rounded-card-sm border-2
                        transition-all duration-200
                        ${appMode === "umzug"
                          ? "border-primary-500 bg-primary-500/10 text-primary-500"
                          : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/50"
                        }`}
          >
            <Truck size={28} />
            <div className="text-center">
              <p className="text-sm font-semibold">Umzugplaner</p>
              <p className="text-xs opacity-70 mt-0.5">Umzug planen & organisieren</p>
            </div>
            {appMode === "umzug" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary-500 text-white">
                Aktiv
              </span>
            )}
          </button>

          {/* Home Organizer */}
          <button
            onClick={() => handleModusWechsel("home")}
            className={`flex flex-col items-center gap-3 p-4 rounded-card-sm border-2
                        transition-all duration-200
                        ${appMode === "home"
                          ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                          : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/50"
                        }`}
          >
            <Home size={28} />
            <div className="text-center">
              <p className="text-sm font-semibold">Home Organizer</p>
              <p className="text-xs opacity-70 mt-0.5">Haushalt & Alltag verwalten</p>
            </div>
            {appMode === "home" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-secondary-500 text-white">
                Aktiv
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Interaktive Anleitungen ───────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mb-1">
          Interaktive Anleitungen
        </h3>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Setze alle Schritt-für-Schritt-Anleitungen zurück. Beim nächsten Besuch jedes Bereichs erscheint die Tour wieder automatisch.
        </p>
        <button
          onClick={handleTourZuruecksetzen}
          className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                     bg-secondary-500/10 hover:bg-secondary-500/20 text-secondary-500
                     border border-secondary-500/30 transition-colors"
        >
          {tourReset ? (
            <><CheckCircle size={15} /> Anleitungen zurückgesetzt</>
          ) : (
            <><RotateCcw size={15} /> Alle Anleitungen zurücksetzen</>
          )}
        </button>
      </div>

      {/* ── Push-Benachrichtigungen ──────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mb-1">
          Push-Benachrichtigungen
        </h3>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Erhalte Benachrichtigungen auch wenn die App geschlossen ist – für Aufgaben, Vorräte, Wartungen und Deadlines.
        </p>

        {/* iOS-Hinweis: nur wenn iOS und noch nicht installiert */}
        {isIOS && !isStandalone && (
          <div className="mb-4 flex gap-2.5 p-3 rounded-card-sm
                          bg-accent-yellow/10 border border-accent-yellow/30">
            <BellRing size={16} className="text-accent-yellow shrink-0 mt-0.5" />
            <p className="text-xs text-accent-yellow leading-relaxed">
              Auf iOS müssen Push-Nachrichten über Safari aktiviert werden und die App muss
              zuerst zum Homescreen hinzugefügt werden <strong>(Teilen → Zum Home-Bildschirm)</strong>.
            </p>
          </div>
        )}

        {/* Browser nicht unterstützt */}
        {!pushUnterstuetzt ? (
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            <BellOff size={15} />
            Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            {/* Status-Badge */}
            <div className="flex items-center gap-2">
              {pushAktiv ? (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill
                                 bg-accent-success/15 text-accent-success border border-accent-success/30">
                  <Bell size={12} /> Aktiv
                </span>
              ) : pushBerechtigung === "denied" ? (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill
                                 bg-accent-danger/10 text-accent-danger border border-accent-danger/30">
                  <BellOff size={12} /> Verweigert
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill
                                 bg-light-surface-1 dark:bg-canvas-3
                                 text-light-text-secondary dark:text-dark-text-secondary
                                 border border-light-border dark:border-dark-border">
                  <BellOff size={12} /> Inaktiv
                </span>
              )}
            </div>

            {/* Toggle-Button */}
            {pushBerechtigung !== "denied" && (
              <button
                onClick={pushAktiv ? pushDeaktivieren : pushAktivieren}
                disabled={pushLadend}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                            transition-colors disabled:opacity-50
                            ${pushAktiv
                              ? "bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger border border-accent-danger/30"
                              : "bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 border border-primary-500/30"
                            }`}
              >
                {pushLadend ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : pushAktiv ? (
                  <><BellOff size={15} /> Deaktivieren</>
                ) : (
                  <><Bell size={15} /> Aktivieren</>
                )}
              </button>
            )}

            {/* Berechtigung verweigert – Hinweis */}
            {pushBerechtigung === "denied" && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Bitte erteile die Berechtigung in den Browser-Einstellungen.
              </p>
            )}
          </div>
        )}

        {/* Fehleranzeige */}
        {pushFehler && (
          <p className="mt-3 text-xs text-accent-danger flex items-center gap-1.5">
            <AlertCircle size={13} /> {pushFehler}
          </p>
        )}
      </div>

      {/* ── Account ──────────────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-6">
        <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main mb-4">
          Account
        </h3>
        <button
          onClick={handleAbmelden}
          className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                     bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger
                     border border-accent-danger/30 transition-colors"
        >
          <LogOut size={15} />
          Abmelden
        </button>
      </div>
    </div>
  );
};

export default UserProfile;
