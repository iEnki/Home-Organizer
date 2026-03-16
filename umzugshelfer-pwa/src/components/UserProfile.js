import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, Save, LogOut, Truck, Home, CheckCircle, AlertCircle,
  RotateCcw, Bell, BellOff, BellRing, Cpu, Wifi, WifiOff,
  ChevronDown, Camera, Pencil, Check, X, KeyRound, Shield, Layers, Sun,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { useTheme } from "../contexts/ThemeContext";
import { alleToursZuruecksetzen } from "./home/tour/useTour";
import { useAppMode } from "../contexts/AppModeContext";
import ThemeSwitch from "./ThemeSwitch";
import usePushSubscription from "../hooks/usePushSubscription";

// ── Akkordeon-Helper ──────────────────────────────────────────────────────────
const AkkordeonSektion = ({ title, icon, defaultOpen = false, children }) => {
  const [offen, setOffen] = useState(defaultOpen);
  return (
    <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 overflow-hidden">
      <button
        onClick={() => setOffen(!offen)}
        className="w-full flex items-center justify-between px-5 py-4
                   text-light-text-main dark:text-dark-text-main"
      >
        <div className="flex items-center gap-3">
          <span className="text-secondary-500 shrink-0">{icon}</span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-light-text-secondary dark:text-dark-text-secondary
                      transition-transform duration-200 ${offen ? "rotate-180" : ""}`}
        />
      </button>
      {offen && (
        <div className="px-5 pb-5 border-t border-light-border dark:border-dark-border pt-4">
          {children}
        </div>
      )}
    </div>
  );
};

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
const UserProfile = ({ session }) => {
  const navigate  = useNavigate();
  const { theme } = useTheme();
  const {
    appMode, switchToHome, switchToUmzug,
    deaktiviereUmzug, aktiviereUmzug,
  } = useAppMode();

  const userId   = session?.user?.id;
  const email    = session?.user?.email || "";
  const nameRaw  = session?.user?.user_metadata?.full_name || email.split("@")[0] || "Nutzer";
  const initiale = nameRaw.charAt(0).toUpperCase();

  // ── Basis-States ────────────────────────────────────────────────────────────
  const [ladend, setLadend] = useState(true);

  // Name-Bearbeitung
  const [displayName,        setDisplayName]        = useState(nameRaw);
  const [nameBearbeiten,     setNameBearbeiten]      = useState(false);
  const [nameSpeichernStatus,setNameSpeichernStatus] = useState(null); // null | "ok" | "fehler"

  // Avatar
  const [avatarUrl,  setAvatarUrl]  = useState(null);
  const [avatarLadend, setAvatarLadend] = useState(false);

  // KI
  const [apiKey,          setApiKey]          = useState("");
  const [apiKeyVisible,   setApiKeyVisible]   = useState(false);
  const [speichernStatus, setSpeichernStatus] = useState(null);
  const [kiProvider,      setKiProvider]      = useState("openai");
  const [ollamaUrl,       setOllamaUrl]       = useState("");
  const [ollamaModel,     setOllamaModel]     = useState("llama3.2");
  const [ollamaStatus,    setOllamaStatus]    = useState(null);
  const [ollamaTestStatus,setOllamaTestStatus]= useState(null);
  const [ollamaModelle,   setOllamaModelle]   = useState([]);

  // Push
  const {
    isSupported:  pushUnterstuetzt,
    permission:   pushBerechtigung,
    isSubscribed: pushAktiv,
    loading:      pushLadend,
    fehler:       pushFehler,
    aktivieren:   pushAktivieren,
    deaktivieren: pushDeaktivieren,
  } = usePushSubscription(userId);

  // Einkaufsliste-Reminder
  const [einkaufReminderAktiv, setEinkaufReminderAktiv] = useState(false);
  const [einkaufReminderZeit,  setEinkaufReminderZeit]  = useState("08:00");
  const [reminderStatus,       setReminderStatus]       = useState(null);

  // Tour-Reset
  const [tourReset, setTourReset] = useState(false);

  // App-Modus
  const [umzugDeaktiviertLokal, setUmzugDeaktiviertLokal] = useState(false);

  // Account & Sicherheit
  const [neueEmail,            setNeueEmail]            = useState("");
  const [emailStatus,          setEmailStatus]          = useState(null);
  const [passwortStatus,       setPasswortStatus]       = useState(null);
  const [loeschenBestaetigung, setLoeschenBestaetigung] = useState(false);

  // iOS-Erkennung
  const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true ||
                       window.matchMedia("(display-mode: standalone)").matches;

  // ── Daten aus Supabase laden ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_profile")
      .select("openai_api_key, ki_provider, ollama_base_url, ollama_model, einkauf_reminder_aktiv, einkauf_reminder_zeit, umzug_deaktiviert, avatar_url")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.openai_api_key)           setApiKey(data.openai_api_key);
        if (data?.ki_provider)              setKiProvider(data.ki_provider);
        if (data?.ollama_base_url)          setOllamaUrl(data.ollama_base_url);
        if (data?.ollama_model)             setOllamaModel(data.ollama_model);
        if (data?.einkauf_reminder_aktiv !== undefined) setEinkaufReminderAktiv(!!data.einkauf_reminder_aktiv);
        if (data?.einkauf_reminder_zeit)    setEinkaufReminderZeit(data.einkauf_reminder_zeit);
        if (data?.umzug_deaktiviert !== undefined) setUmzugDeaktiviertLokal(!!data.umzug_deaktiviert);
        if (data?.avatar_url)               setAvatarUrl(data.avatar_url);
        setLadend(false);
      });
  }, [userId]);

  // ── Handler ──────────────────────────────────────────────────────────────────

  const handleNameSpeichern = async () => {
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    if (!error) setNameBearbeiten(false);
    setNameSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setNameSpeichernStatus(null), 3000);
  };

  const handleAvatarHochladen = async (e) => {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setAvatarLadend(true);
    const pfad = `${userId}/avatar`;
    const { error: uploadFehler } = await supabase.storage
      .from("avatars")
      .upload(pfad, datei, { upsert: true, contentType: datei.type });
    if (!uploadFehler) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(pfad);
      await supabase.from("user_profile").update({ avatar_url: publicUrl }).eq("id", userId);
      setAvatarUrl(publicUrl);
    }
    setAvatarLadend(false);
  };

  const handleApiKeySpeichern = async () => {
    setSpeichernStatus(null);
    const { error } = await supabase
      .from("user_profile")
      .update({ openai_api_key: apiKey.trim() })
      .eq("id", userId);
    setSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setSpeichernStatus(null), 3000);
  };

  const handleOllamaSpeichern = async () => {
    setOllamaStatus(null);
    const { error } = await supabase
      .from("user_profile")
      .update({ ki_provider: kiProvider, ollama_base_url: ollamaUrl.trim(), ollama_model: ollamaModel.trim() })
      .eq("id", userId);
    setOllamaStatus(error ? "fehler" : "ok");
    setTimeout(() => setOllamaStatus(null), 3000);
  };

  const handleOllamaVerbindungTesten = async () => {
    if (!ollamaUrl.trim()) return;
    setOllamaTestStatus("testing");
    setOllamaModelle([]);
    try {
      const url      = ollamaUrl.trim().replace(/\/$/, "");
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data    = await response.json();
      const modelle = (data.models || []).map((m) => m.name);
      setOllamaModelle(modelle);
      setOllamaTestStatus("ok");
    } catch {
      setOllamaTestStatus("fehler");
      setOllamaModelle([]);
    }
    setTimeout(() => setOllamaTestStatus(null), 8000);
  };

  const handleReminderSpeichern = async () => {
    setReminderStatus(null);
    const { error } = await supabase
      .from("user_profile")
      .update({
        einkauf_reminder_aktiv: einkaufReminderAktiv,
        einkauf_reminder_zeit:  einkaufReminderAktiv ? einkaufReminderZeit : null,
      })
      .eq("id", userId);
    setReminderStatus(error ? "fehler" : "ok");
    setTimeout(() => setReminderStatus(null), 3000);
  };

  const handleTourZuruecksetzen = () => {
    alleToursZuruecksetzen();
    setTourReset(true);
    setTimeout(() => setTourReset(false), 3000);
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

  const handleUmzugDeaktivieren = async () => {
    await supabase.from("user_profile")
      .update({ umzug_deaktiviert: true, app_modus: "home" })
      .eq("id", userId);
    setUmzugDeaktiviertLokal(true);
    deaktiviereUmzug();
    navigate("/home");
  };

  const handleUmzugAktivieren = async () => {
    await supabase.from("user_profile")
      .update({ umzug_deaktiviert: false })
      .eq("id", userId);
    setUmzugDeaktiviertLokal(false);
    aktiviereUmzug();
  };

  const handlePasswortReset = async () => {
    await supabase.auth.resetPasswordForEmail(email);
    setPasswortStatus("ok");
    setTimeout(() => setPasswortStatus(null), 5000);
  };

  const handleEmailAendern = async () => {
    const { error } = await supabase.auth.updateUser({ email: neueEmail.trim() });
    setEmailStatus(error ? "fehler" : "ok");
    setTimeout(() => setEmailStatus(null), 5000);
  };

  const handleAccountLoeschen = async () => {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    });
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleAbmelden = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // ── Eingabe-Klassen (wiederverwendbar) ────────────────────────────────────
  const inputCls = `w-full px-3 py-2.5 text-sm rounded-card-sm
    bg-light-bg dark:bg-canvas-1
    border border-light-border dark:border-dark-border
    text-light-text-main dark:text-dark-text-main
    placeholder-light-text-secondary dark:placeholder-dark-text-secondary
    focus:outline-none focus:ring-2 focus:ring-secondary-500`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-8 space-y-3">

      {/* ── Header: Avatar + Name + E-Mail ────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 p-5
                      flex items-center gap-4">
        {/* Avatar */}
        <label className="relative cursor-pointer shrink-0">
          <input type="file" className="hidden" accept="image/*" onChange={handleAvatarHochladen} />
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profilbild"
              className="w-16 h-16 rounded-full object-cover shadow-glow-primary"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center
                            text-white text-2xl font-bold shadow-glow-primary">
              {initiale}
            </div>
          )}
          {avatarLadend ? (
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-primary-500 rounded-full
                            flex items-center justify-center">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-primary-500 rounded-full
                            flex items-center justify-center">
              <Camera size={11} className="text-white" />
            </div>
          )}
        </label>

        {/* Name + E-Mail */}
        <div className="flex-1 min-w-0">
          {nameBearbeiten ? (
            <div className="flex items-center gap-2">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNameSpeichern()}
                className="flex-1 text-sm px-2 py-1.5 rounded-card-sm
                           bg-light-bg dark:bg-canvas-1
                           border border-light-border dark:border-dark-border
                           text-light-text-main dark:text-dark-text-main
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
              <button
                onClick={handleNameSpeichern}
                className="p-1.5 rounded-card-sm bg-primary-500/10 text-primary-500
                           hover:bg-primary-500/20 transition-colors"
              >
                <Check size={15} />
              </button>
              <button
                onClick={() => { setNameBearbeiten(false); setDisplayName(nameRaw); }}
                className="p-1.5 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:bg-light-border dark:hover:bg-dark-border transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-light-text-main dark:text-dark-text-main truncate">
                {displayName}
              </h2>
              <button
                onClick={() => setNameBearbeiten(true)}
                className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary
                           hover:text-primary-500 transition-colors shrink-0"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
          {nameSpeichernStatus === "ok" && (
            <p className="text-[11px] text-accent-success mt-0.5">Gespeichert</p>
          )}
          {nameSpeichernStatus === "fehler" && (
            <p className="text-[11px] text-accent-danger mt-0.5">Fehler beim Speichern</p>
          )}
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate">
            {email}
          </p>
        </div>
      </div>

      {/* ── Erscheinungsbild ──────────────────────────────────────────────── */}
      <AkkordeonSektion title="Erscheinungsbild" icon={<Sun size={16} />} defaultOpen={true}>
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
      </AkkordeonSektion>

      {/* ── App-Modus ─────────────────────────────────────────────────────── */}
      <AkkordeonSektion title="App-Modus" icon={<Layers size={16} />} defaultOpen={true}>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Wähle, welchen Bereich du primär nutzt. Du kannst jederzeit wechseln.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => !umzugDeaktiviertLokal && handleModusWechsel("umzug")}
            disabled={umzugDeaktiviertLokal}
            className={`flex flex-col items-center gap-3 p-4 rounded-card-sm border-2
                        transition-all duration-200
                        ${umzugDeaktiviertLokal
                          ? "border-light-border dark:border-dark-border opacity-40 cursor-not-allowed bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                          : appMode === "umzug"
                            ? "border-primary-500 bg-primary-500/10 text-primary-500"
                            : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/50"
                        }`}
          >
            <Truck size={28} />
            <div className="text-center">
              <p className="text-sm font-semibold">Umzugplaner</p>
              <p className="text-xs opacity-70 mt-0.5">
                {umzugDeaktiviertLokal ? "Deaktiviert" : "Umzug planen & organisieren"}
              </p>
            </div>
            {appMode === "umzug" && !umzugDeaktiviertLokal && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary-500 text-white">
                Aktiv
              </span>
            )}
          </button>

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

        {umzugDeaktiviertLokal ? (
          <div className="mt-4 p-3 rounded-card-sm bg-accent-success/10 border border-accent-success/30">
            <p className="text-xs text-accent-success mb-2.5 leading-snug">
              Umzugsplaner ist dauerhaft deaktiviert. Du bleibst immer im Home Organizer,
              auch nach einem Neustart oder auf neuen Geräten.
            </p>
            <button
              onClick={handleUmzugAktivieren}
              className="flex items-center gap-2 px-3 py-1.5 rounded-pill text-xs font-medium
                         bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                         border border-primary-500/30 transition-colors"
            >
              <Truck size={13} /> Umzugsplaner wieder aktivieren
            </button>
          </div>
        ) : appMode === "home" ? (
          <div className="mt-4 p-3 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3
                          border border-light-border dark:border-dark-border">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2.5 leading-snug">
              Umzug abgeschlossen? Den Umzugsplaner dauerhaft deaktivieren —
              er bleibt gespeichert und kann jederzeit reaktiviert werden.
            </p>
            <button
              onClick={handleUmzugDeaktivieren}
              className="flex items-center gap-2 px-3 py-1.5 rounded-pill text-xs font-medium
                         bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger
                         border border-accent-danger/30 transition-colors"
            >
              <Truck size={13} /> Umzugsplaner dauerhaft deaktivieren
            </button>
          </div>
        ) : null}
      </AkkordeonSektion>

      {/* ── KI-Einstellungen ──────────────────────────────────────────────── */}
      <AkkordeonSektion title="KI-Einstellungen" icon={<Cpu size={16} />}>
        {ladend ? (
          <div className="h-20 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        ) : (
          <div className="space-y-5">
            {/* Provider-Auswahl */}
            <div>
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2 uppercase tracking-wide">
                KI-Provider
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "openai", label: "OpenAI", desc: "GPT-4o + Whisper" },
                  { id: "ollama", label: "Ollama", desc: "Eigener Server" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setKiProvider(p.id)}
                    className={`flex flex-col items-center p-3 rounded-card-sm border-2 text-sm transition-all
                                ${kiProvider === p.id
                                  ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                                  : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/40"
                                }`}
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="text-xs opacity-70">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* OpenAI API-Key */}
            {kiProvider === "openai" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                  OpenAI API-Key
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={apiKeyVisible ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className={`${inputCls} pr-10`}
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
              </div>
            )}

            {/* Ollama-Einstellungen */}
            {kiProvider === "ollama" && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                  Ollama Server
                </p>
                <div className="space-y-2">
                  <div>
                    <input
                      type="url"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      placeholder="http://192.168.1.100:11434"
                      className={inputCls}
                    />
                    <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Nur die Basis-URL ohne Pfad, z.B.&nbsp;
                      <code className="font-mono text-[11px]">https://mein-server.de</code>&nbsp;
                      oder&nbsp;<code className="font-mono text-[11px]">http://localhost:11434</code>
                    </p>
                  </div>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="llama3.2"
                    className={inputCls}
                  />
                  {ollamaModelle.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ollamaModelle.map((m) => (
                        <button
                          key={m}
                          onClick={() => setOllamaModel(m)}
                          className={`text-xs px-2 py-0.5 rounded-pill border transition-colors
                                      ${ollamaModel === m
                                        ? "border-secondary-500 bg-secondary-500/15 text-secondary-500"
                                        : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/40"
                                      }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleOllamaVerbindungTesten}
                    disabled={!ollamaUrl.trim() || ollamaTestStatus === "testing"}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm font-medium
                               border border-light-border dark:border-dark-border
                               text-light-text-main dark:text-dark-text-main
                               hover:border-secondary-500/50 transition-colors disabled:opacity-40"
                  >
                    {ollamaTestStatus === "testing" ? (
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : ollamaTestStatus === "ok" ? (
                      <Wifi size={14} className="text-accent-success" />
                    ) : ollamaTestStatus === "fehler" ? (
                      <WifiOff size={14} className="text-accent-danger" />
                    ) : (
                      <Wifi size={14} />
                    )}
                    {ollamaTestStatus === "ok" ? "Verbunden"
                      : ollamaTestStatus === "fehler" ? "Nicht erreichbar"
                      : "Testen"}
                  </button>
                  <button
                    onClick={handleOllamaSpeichern}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-medium
                               bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
                  >
                    {ollamaStatus === "ok" ? (
                      <><CheckCircle size={14} /> Gespeichert</>
                    ) : ollamaStatus === "fehler" ? (
                      <><AlertCircle size={14} /> Fehler</>
                    ) : (
                      <><Save size={14} /> Speichern</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Hinweis: Im Ollama-Modus wird die Spracheingabe über die Browser-Spracherkennung (Web Speech API) verarbeitet statt über Whisper.
                </p>
              </div>
            )}
          </div>
        )}
      </AkkordeonSektion>

      {/* ── Push-Benachrichtigungen ────────────────────────────────────────── */}
      <AkkordeonSektion title="Push-Benachrichtigungen" icon={<Bell size={16} />}>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Erhalte Benachrichtigungen auch wenn die App geschlossen ist – für Aufgaben, Vorräte, Wartungen und Deadlines.
        </p>

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

        {!pushUnterstuetzt ? (
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            <BellOff size={15} />
            Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
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

            {pushBerechtigung === "denied" && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Bitte erteile die Berechtigung in den Browser-Einstellungen.
              </p>
            )}
          </div>
        )}

        {pushFehler && (
          <p className="mt-3 text-xs text-accent-danger flex items-center gap-1.5">
            <AlertCircle size={13} /> {pushFehler}
          </p>
        )}

        {pushAktiv && (
          <div className="mt-5 pt-4 border-t border-light-border dark:border-dark-border space-y-3">
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
              Einkaufsliste-Erinnerung
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={einkaufReminderAktiv}
                onChange={(e) => setEinkaufReminderAktiv(e.target.checked)}
                className="mt-0.5 accent-primary-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary leading-snug">
                Täglich erinnern, wenn unerledigte Einkäufe in der Liste vorhanden sind
              </span>
            </label>
            {einkaufReminderAktiv && (
              <div className="flex items-center gap-3 pl-7">
                <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
                  Uhrzeit (UTC):
                </label>
                <input
                  type="time"
                  value={einkaufReminderZeit}
                  onChange={(e) => setEinkaufReminderZeit(e.target.value)}
                  className="rounded-card-sm border border-light-border dark:border-dark-border
                             bg-light-surface-1 dark:bg-canvas-3
                             text-light-text-main dark:text-dark-text-main
                             text-sm px-3 py-1.5 focus:outline-none focus:border-primary-500"
                />
              </div>
            )}
            <div className="flex items-center gap-3 pl-7">
              <button
                onClick={handleReminderSpeichern}
                className="flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-medium
                           bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                           border border-primary-500/30 transition-colors"
              >
                <Save size={14} /> Speichern
              </button>
              {reminderStatus === "ok" && (
                <span className="flex items-center gap-1 text-xs text-accent-success">
                  <CheckCircle size={13} /> Gespeichert
                </span>
              )}
              {reminderStatus === "fehler" && (
                <span className="flex items-center gap-1 text-xs text-accent-danger">
                  <AlertCircle size={13} /> Fehler beim Speichern
                </span>
              )}
            </div>
          </div>
        )}
      </AkkordeonSektion>

      {/* ── Interaktive Anleitungen ────────────────────────────────────────── */}
      <AkkordeonSektion title="Interaktive Anleitungen" icon={<RotateCcw size={16} />}>
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
      </AkkordeonSektion>

      {/* ── Account & Sicherheit ──────────────────────────────────────────── */}
      <AkkordeonSektion title="Account & Sicherheit" icon={<Shield size={16} />}>
        <div className="space-y-5">

          {/* Passwort-Reset */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide
                          text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Passwort
            </p>
            <button
              onClick={handlePasswortReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-light-surface-1 dark:bg-canvas-3
                         text-light-text-main dark:text-dark-text-main
                         border border-light-border dark:border-dark-border
                         hover:border-secondary-500/50 transition-colors"
            >
              <KeyRound size={14} /> Passwort-Reset-Mail senden
            </button>
            {passwortStatus === "ok" && (
              <p className="text-xs text-accent-success mt-2 flex items-center gap-1">
                <CheckCircle size={12} /> E-Mail wurde gesendet.
              </p>
            )}
          </div>

          {/* E-Mail ändern */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide
                          text-light-text-secondary dark:text-dark-text-secondary mb-2">
              E-Mail-Adresse ändern
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={neueEmail}
                onChange={(e) => setNeueEmail(e.target.value)}
                placeholder="neue@email.de"
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={handleEmailAendern}
                disabled={!neueEmail.includes("@")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                           bg-secondary-500/10 hover:bg-secondary-500/20 text-secondary-500
                           border border-secondary-500/30 transition-colors disabled:opacity-40 shrink-0"
              >
                <Save size={14} /> Ändern
              </button>
            </div>
            {emailStatus === "ok" && (
              <p className="text-xs text-accent-success mt-2 flex items-center gap-1">
                <CheckCircle size={12} /> Bestätigungs-Mail wurde gesendet.
              </p>
            )}
            {emailStatus === "fehler" && (
              <p className="text-xs text-accent-danger mt-2 flex items-center gap-1">
                <AlertCircle size={12} /> Fehler beim Ändern der E-Mail.
              </p>
            )}
          </div>

          {/* Abmelden */}
          <div className="pt-2 border-t border-light-border dark:border-dark-border">
            <button
              onClick={handleAbmelden}
              className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger
                         border border-accent-danger/30 transition-colors"
            >
              <LogOut size={15} /> Abmelden
            </button>
          </div>

          {/* Account löschen */}
          <div className="pt-2 border-t border-light-border dark:border-dark-border">
            {!loeschenBestaetigung ? (
              <button
                onClick={() => setLoeschenBestaetigung(true)}
                className="text-xs text-light-text-secondary dark:text-dark-text-secondary
                           hover:text-accent-danger transition-colors underline underline-offset-2"
              >
                Account unwiderruflich löschen
              </button>
            ) : (
              <div className="p-3 bg-accent-danger/10 border border-accent-danger/30 rounded-card-sm space-y-3">
                <p className="text-xs text-accent-danger font-medium leading-snug">
                  Alle Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleAccountLoeschen}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                               bg-accent-danger text-white hover:bg-accent-danger/90 transition-colors"
                  >
                    Ja, Account löschen
                  </button>
                  <button
                    onClick={() => setLoeschenBestaetigung(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                               bg-light-surface-1 dark:bg-canvas-3
                               text-light-text-main dark:text-dark-text-main
                               border border-light-border dark:border-dark-border
                               hover:border-secondary-500/50 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </AkkordeonSektion>

    </div>
  );
};

export default UserProfile;
