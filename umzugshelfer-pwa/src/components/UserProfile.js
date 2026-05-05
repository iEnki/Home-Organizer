import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Eye, EyeOff, Save, Truck, Home, CheckCircle, AlertCircle,
  RotateCcw, Bell, BellOff, BellRing, Cpu, Wifi, WifiOff,
  ChevronRight, Camera, Pencil, Check, X, KeyRound, Shield, Layers, Sun, Copy, UserPlus,
  Users, Crown, Smartphone, Building2, BookOpen,
} from "lucide-react";
import {
  MOBILE_NAV_REGISTRY, DEFAULT_MOBILE_FAVORITES,
  sanitizeMobileNavFavorites, MOBILE_NAV_FAVORITE_COUNT,
} from "../config/mobileNavConfig";
import { supabase } from "../supabaseClient";
import { useTheme } from "../contexts/ThemeContext";
import { useTourContext } from "../contexts/TourContext";
import { useAppMode } from "../contexts/AppModeContext";
import { useLocale } from "../contexts/LocaleContext";
import useViewport from "../hooks/useViewport";
import ThemeSwitch from "./ThemeSwitch";
import usePushSubscription from "../hooks/usePushSubscription";
import BottomSheet from "./ui/BottomSheet";

// ── Status-Badge ────────────────────────────────────────────────────────────
function StatusBadge({ label, farbe }) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    gray:    "bg-light-border/60 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border",
    red:     "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    primary: "bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20",
    amber:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  }[farbe] ?? "bg-light-border/60 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-pill font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Modul-Karte ─────────────────────────────────────────────────────────────
const iconBgMap = {
  emerald: "bg-emerald-500/15 text-emerald-500",
  gray:    "bg-light-border dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary",
  red:     "bg-red-500/15 text-red-500",
  primary: "bg-primary-500/15 text-primary-500",
  amber:   "bg-amber-500/15 text-amber-500",
  secondary: "bg-secondary-500/15 text-secondary-500",
};

function ModulKarte({ icon, titel, status, statusFarbe, beschreibung, aktionLabel, onAktion, disabled, iconFarbe }) {
  const reduced = useReducedMotion();
  const iconCls = iconBgMap[iconFarbe ?? "secondary"] ?? iconBgMap.secondary;
  return (
    <motion.button
      onClick={disabled ? undefined : onAktion}
      disabled={disabled}
      whileHover={reduced || disabled ? {} : { y: -3, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={reduced || disabled ? {} : { scale: 0.97 }}
      className={`w-full text-left bg-light-card dark:bg-canvas-2 rounded-card border
                  border-light-border dark:border-dark-border p-4 flex flex-col gap-3
                  shadow-elevation-2 transition-[border-color,box-shadow] disabled:opacity-50
                  ${disabled ? "cursor-default" : "hover:border-primary-500/40 hover:shadow-glow-primary cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-card-sm ${iconCls}`}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-light-text-main dark:text-dark-text-main leading-tight">
            {titel}
          </span>
        </div>
        {status && <StatusBadge label={status} farbe={statusFarbe ?? "gray"} />}
      </div>
      {beschreibung && (
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-snug line-clamp-2">
          {beschreibung}
        </p>
      )}
      {aktionLabel && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-500">
          {aktionLabel} <ChevronRight size={12} />
        </span>
      )}
    </motion.button>
  );
}

// ── Abschnitt-Label ──────────────────────────────────────────────────────────
function GruppenLabel({ children }) {
  return (
    <div className="mb-3 flex items-center gap-3 px-1">
      <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">
        {children}
      </p>
      <div className="h-px flex-1 bg-light-border dark:bg-dark-border" />
    </div>
  );
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────
const UserProfile = ({ session, householdContext, mobileNavFavorites, onMobileNavChange }) => {
  const { t } = useTranslation(["common", "profile"]);
  const { locale, supportedLocales, setLocale } = useLocale();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme } = useTheme();
  const {
    appMode, switchToHome, switchToUmzug,
    deaktiviereUmzug, aktiviereUmzug,
  } = useAppMode();
  const { isDesktop } = useViewport();
  const reduced = useReducedMotion();

  const userId   = session?.user?.id;
  const email    = session?.user?.email || "";
  const nameRaw  = session?.user?.user_metadata?.full_name || email.split("@")[0] || "Nutzer";
  const initiale = nameRaw.charAt(0).toUpperCase();
  const isHouseholdAdmin = householdContext?.is_admin === true;

  // Tour-Context
  const {
    tourState,
    geladen: tourGeladen,
    setIntroAnswer,
    resetAllTours,
    setAutoTours,
    resetPageTour,
  } = useTourContext() || {};

  // ── Basis-States ──────────────────────────────────────────────────────────
  const [ladend, setLadend] = useState(true);
  const [localeStatus, setLocaleStatus] = useState(null);

  // Panel & Tab
  const [aktivesPanel, setAktivesPanel] = useState(null);
  const [mobilTab, setMobilTab]         = useState("allgemein");

  // Name-Bearbeitung
  const [displayName,        setDisplayName]        = useState(nameRaw);
  const [nameBearbeiten,     setNameBearbeiten]      = useState(false);
  const [nameSpeichernStatus,setNameSpeichernStatus] = useState(null);

  // Haushaltsname-Bearbeitung (nur Admin)
  const [haushaltsName,              setHaushaltsName]              = useState("");
  const [haushaltsNameBearbeiten,    setHaushaltsNameBearbeiten]    = useState(false);
  const [haushaltsNameStatus,        setHaushaltsNameStatus]        = useState(null);

  // Avatar
  const [avatarUrl,    setAvatarUrl]    = useState(null);
  const [avatarLadend, setAvatarLadend] = useState(false);

  // KI
  const [apiKey,           setApiKey]           = useState("");
  const [apiKeyVisible,    setApiKeyVisible]    = useState(false);
  const [speichernStatus,  setSpeichernStatus]  = useState(null);
  const [kiProvider,       setKiProvider]       = useState("openai");
  const [ollamaUrl,        setOllamaUrl]        = useState("");
  const [ollamaModel,      setOllamaModel]      = useState("llama3.2");
  const [ollamaStatus,     setOllamaStatus]     = useState(null);
  const [ollamaTestStatus, setOllamaTestStatus] = useState(null);
  const [ollamaModelle,    setOllamaModelle]    = useState([]);

  // KI-Status für Nicht-Admin-Mitglieder
  const [memberKiStatus, setMemberKiStatus] = useState(null);

  // Bildanalyse
  const [bildanalyseModus,        setBildanalyseModus]        = useState("chatgpt_vision");
  const [bildanalyseOpenaiKey,    setBildanalyseOpenaiKey]    = useState("");
  const [bildanalyseOpenaiKeySet, setBildanalyseOpenaiKeySet] = useState(false);
  const [loescheOpenaiKey,        setLoescheOpenaiKey]        = useState(false);
  const [bildanalyseStatus,       setBildanalyseStatus]       = useState(null);
  const [ollamaVisionModel,       setOllamaVisionModel]       = useState("");

  // Kochbuch-Importe
  const [kochbuchWebLimit,   setKochbuchWebLimit]   = useState(20);
  const [kochbuchVideoLimit, setKochbuchVideoLimit] = useState(5);
  const [kochbuchStatus,     setKochbuchStatus]     = useState(null);
  const [kochbuchKiProvider, setKochbuchKiProvider] = useState("global");
  const [kochbuchOpenaiModel, setKochbuchOpenaiModel] = useState("");
  const [kochbuchOllamaModel, setKochbuchOllamaModel] = useState("");
  const [kochbuchOllamaThinkingEnabled, setKochbuchOllamaThinkingEnabled] = useState(false);
  const [kochbuchKiStatus, setKochbuchKiStatus] = useState(null);

  // Push
  const {
    isSupported:  pushUnterstuetzt,
    permission:   pushBerechtigung,
    isSubscribed: pushAktiv,
    loading:      pushLadend,
    fehler:       pushFehler,
    aktivieren:   pushAktivieren,
    deaktivieren: pushDeaktivieren,
    refresh:      pushRefresh,
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
  const [inviteEmail,          setInviteEmail]          = useState("");
  const [inviteLink,           setInviteLink]           = useState("");
  const [inviteStatus,         setInviteStatus]         = useState(null);
  const [inviteFehler,         setInviteFehler]         = useState("");
  const [inviteLadend,         setInviteLadend]         = useState(false);
  const [inviteMailStatus,     setInviteMailStatus]     = useState(null);
  const [inviteMailHinweis,    setInviteMailHinweis]    = useState("");
  const [haushaltMitglieder,   setHaushaltMitglieder]   = useState([]);
  const [haushaltUebersichtLadend, setHaushaltUebersichtLadend] = useState(false);
  const [haushaltUebersichtFehler, setHaushaltUebersichtFehler] = useState("");
  const [bewohnerAnzahl,       setBewohnerAnzahl]       = useState(0);
  const [mitgliedZuEntfernen,  setMitgliedZuEntfernen]  = useState(null);
  const [entfernenLadend,      setEntfernenLadend]      = useState(false);

  // iOS-Erkennung
  const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true ||
                       window.matchMedia("(display-mode: standalone)").matches;

  // Mobile Navigation
  const [navEdit,          setNavEdit]          = useState(null);
  const [navSaveStatus,    setNavSaveStatus]     = useState(null);
  const [navPickerModus,   setNavPickerModus]    = useState(null);
  const [navPickerSlotIdx, setNavPickerSlotIdx]  = useState(null);
  const [navSektionOffen,  setNavSektionOffen]   = useState(false); // eslint-disable-line no-unused-vars

  // ── Daten aus Supabase laden ──────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_profile")
      .select("openai_api_key, ki_provider, ollama_base_url, ollama_model, kochbuch_ki_provider, kochbuch_openai_model, kochbuch_ollama_model, kochbuch_ollama_thinking_enabled, einkauf_reminder_aktiv, einkauf_reminder_zeit, umzug_deaktiviert, avatar_url, username")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.openai_api_key)           setApiKey(data.openai_api_key);
        if (data?.ki_provider)              setKiProvider(data.ki_provider);
        if (data?.ollama_base_url)          setOllamaUrl(data.ollama_base_url);
        if (data?.ollama_model)             setOllamaModel(data.ollama_model);
        if (data?.kochbuch_ki_provider)     setKochbuchKiProvider(data.kochbuch_ki_provider);
        if (data?.kochbuch_openai_model)    setKochbuchOpenaiModel(data.kochbuch_openai_model);
        if (data?.kochbuch_ollama_model)    setKochbuchOllamaModel(data.kochbuch_ollama_model);
        if (data?.kochbuch_ollama_thinking_enabled !== undefined) setKochbuchOllamaThinkingEnabled(!!data.kochbuch_ollama_thinking_enabled);
        if (data?.einkauf_reminder_aktiv !== undefined) setEinkaufReminderAktiv(!!data.einkauf_reminder_aktiv);
        if (data?.einkauf_reminder_zeit)    setEinkaufReminderZeit(data.einkauf_reminder_zeit);
        if (data?.umzug_deaktiviert !== undefined) setUmzugDeaktiviertLokal(!!data.umzug_deaktiviert);
        if (data?.avatar_url)               setAvatarUrl(data.avatar_url);
        if (data?.username)                 setDisplayName(data.username);
        setLadend(false);
      });
  }, [userId]);

  // Bildanalyse-Einstellungen: nur für Admins
  useEffect(() => {
    if (!userId || !isHouseholdAdmin || !householdContext?.household_id) return;
    supabase
      .from("household_settings")
      .select("bildanalyse_modus, bildanalyse_openai_key_set, ollama_vision_model, kochbuch_daily_web_import_limit, kochbuch_daily_video_import_limit, kochbuch_ki_provider, kochbuch_openai_model, kochbuch_ollama_model, kochbuch_ollama_thinking_enabled")
      .eq("household_id", householdContext.household_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.bildanalyse_modus) setBildanalyseModus(data.bildanalyse_modus);
        if (data?.bildanalyse_openai_key_set !== undefined) setBildanalyseOpenaiKeySet(!!data.bildanalyse_openai_key_set);
        if (data?.ollama_vision_model) setOllamaVisionModel(data.ollama_vision_model);
        if (data?.kochbuch_daily_web_import_limit !== undefined) setKochbuchWebLimit(data.kochbuch_daily_web_import_limit);
        if (data?.kochbuch_daily_video_import_limit !== undefined) setKochbuchVideoLimit(data.kochbuch_daily_video_import_limit);
        if (data?.kochbuch_ki_provider) setKochbuchKiProvider(data.kochbuch_ki_provider);
        if (data?.kochbuch_openai_model) setKochbuchOpenaiModel(data.kochbuch_openai_model);
        if (data?.kochbuch_ollama_model) setKochbuchOllamaModel(data.kochbuch_ollama_model);
        if (data?.kochbuch_ollama_thinking_enabled !== undefined) setKochbuchOllamaThinkingEnabled(!!data.kochbuch_ollama_thinking_enabled);
      });
  }, [userId, isHouseholdAdmin, householdContext?.household_id]);

  // KI-Status für Nicht-Admin-Mitglieder
  useEffect(() => {
    if (!userId || isHouseholdAdmin) return;
    supabase
      .rpc("get_household_ki_status")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMemberKiStatus(data);
      });
  }, [userId, isHouseholdAdmin]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const ladeHaushaltUebersicht = async () => {
      setHaushaltUebersichtLadend(true);
      setHaushaltUebersichtFehler("");

      try {
        const [mitgliederRes, bewohnerRes] = await Promise.all([
          supabase.rpc("get_household_members_overview"),
          supabase.rpc("get_bewohner_overview"),
        ]);

        if (mitgliederRes.error) throw mitgliederRes.error;
        if (bewohnerRes.error) throw bewohnerRes.error;

        if (cancelled) return;
        setHaushaltMitglieder(Array.isArray(mitgliederRes.data) ? mitgliederRes.data : []);
        setBewohnerAnzahl(Array.isArray(bewohnerRes.data) ? bewohnerRes.data.length : 0);
      } catch (_err) {
        if (cancelled) return;
        setHaushaltMitglieder([]);
        setBewohnerAnzahl(0);
        setHaushaltUebersichtFehler("Haushaltsübersicht nicht verfügbar - Migration ausführen.");
      } finally {
        if (!cancelled) setHaushaltUebersichtLadend(false);
      }
    };

    ladeHaushaltUebersicht();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (aktivesPanel === "push") {
      pushRefresh?.();
    }
  }, [aktivesPanel, pushRefresh]);

  // Haushaltsname aus Context initialisieren
  useEffect(() => {
    if (householdContext?.household_name && !haushaltsName) {
      setHaushaltsName(householdContext.household_name);
    }
  }, [householdContext?.household_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile Navigation: navEdit initialisieren
  useEffect(() => {
    if (navEdit === null && mobileNavFavorites) {
      setNavEdit(sanitizeMobileNavFavorites(mobileNavFavorites));
    }
  }, [mobileNavFavorites, navEdit]);

  // Mobile Navigation: Panel auto-öffnen wenn per location.state angefragt
  useEffect(() => {
    if (location.state?.openSection === "mobile-nav") {
      setAktivesPanel("mobile-nav");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // ── Handler ───────────────────────────────────────────────────────────────

  const handleNameSpeichern = async () => {
    const trimmed = displayName.trim();
    const [authRes, profileRes] = await Promise.all([
      supabase.auth.updateUser({ data: { full_name: trimmed } }),
      supabase.from("user_profile").update({ username: trimmed }).eq("id", userId),
    ]);
    const error = authRes.error || profileRes.error;
    if (!error) setNameBearbeiten(false);
    setNameSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setNameSpeichernStatus(null), 3000);
  };

  const handleHaushaltsNameSpeichern = async () => {
    const trimmed = haushaltsName.trim();
    if (!trimmed || !householdContext?.household_id) return;
    const { error } = await supabase
      .from("households")
      .update({ name: trimmed })
      .eq("id", householdContext.household_id);
    setHaushaltsNameStatus(error ? "fehler" : "ok");
    if (!error) setHaushaltsNameBearbeiten(false);
    setTimeout(() => setHaushaltsNameStatus(null), 3000);
  };

  const handleLocaleChange = async (nextLocale) => {
    setLocaleStatus("saving");
    const { error } = await setLocale(nextLocale, { userId });
    setLocaleStatus(error ? "fehler" : "ok");
    setTimeout(() => setLocaleStatus(null), 3000);
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
      .update({ openai_api_key: apiKey.trim(), ki_provider: "openai" })
      .eq("id", userId);
    if (!error && isHouseholdAdmin) {
      await supabase.rpc("set_household_ki_settings", {
        p_ki_provider: "openai",
        p_openai_api_key: apiKey.trim() || null,
        p_ollama_base_url: null,
        p_ollama_model: null,
      });
    }
    setSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setSpeichernStatus(null), 3000);
  };

  const handleOllamaSpeichern = async () => {
    setOllamaStatus(null);
    const { error } = await supabase
      .from("user_profile")
      .update({ ki_provider: kiProvider, ollama_base_url: ollamaUrl.trim(), ollama_model: ollamaModel.trim() })
      .eq("id", userId);
    if (!error && isHouseholdAdmin) {
      await supabase.rpc("set_household_ki_settings", {
        p_ki_provider: kiProvider,
        p_openai_api_key: kiProvider === "openai" ? (apiKey.trim() || null) : null,
        p_ollama_base_url: kiProvider === "ollama" ? (ollamaUrl.trim() || null) : null,
        p_ollama_model: kiProvider === "ollama" ? (ollamaModel.trim() || "llama3.2") : null,
      });
    }
    setOllamaStatus(error ? "fehler" : "ok");
    setTimeout(() => setOllamaStatus(null), 3000);
  };

  const handleBildanalyseSpeichern = async () => {
    setBildanalyseStatus(null);
    const { error } = await supabase.rpc("set_household_bildanalyse_settings", {
      p_modus: bildanalyseModus,
      p_bildanalyse_openai_api_key: bildanalyseOpenaiKey.trim() || null,
      p_ollama_vision_model: bildanalyseModus === "ocr_ollama" ? (ollamaVisionModel.trim() || null) : null,
    });
    if (!error) {
      if (bildanalyseOpenaiKey.trim()) setBildanalyseOpenaiKeySet(true);
      setBildanalyseOpenaiKey("");
    }
    setBildanalyseStatus(error ? "fehler" : "ok");
    setTimeout(() => setBildanalyseStatus(null), 3000);
  };

  const handleOpenaiKeyLoeschen = async () => {
    setLoescheOpenaiKey(true);
    const { error } = await supabase.rpc("set_household_bildanalyse_settings", {
      p_modus: bildanalyseModus,
      p_bildanalyse_openai_api_key: "",
    });
    setLoescheOpenaiKey(false);
    if (!error) {
      setBildanalyseOpenaiKeySet(false);
      setBildanalyseOpenaiKey("");
    }
    setBildanalyseStatus(error ? "fehler" : "ok");
    setTimeout(() => setBildanalyseStatus(null), 3000);
  };

  const handleKochbuchLimitsSpeichern = async () => {
    if (!householdContext?.household_id) return;
    setKochbuchStatus(null);
    const webLimit = Math.max(0, Math.min(1000, Number.parseInt(String(kochbuchWebLimit), 10) || 0));
    const videoLimit = Math.max(0, Math.min(1000, Number.parseInt(String(kochbuchVideoLimit), 10) || 0));
    const { error } = await supabase.rpc("set_household_kochbuch_limits", {
      p_daily_web_import_limit: webLimit,
      p_daily_video_import_limit: videoLimit,
    });
    if (!error) {
      setKochbuchWebLimit(webLimit);
      setKochbuchVideoLimit(videoLimit);
    }
    setKochbuchStatus(error ? "fehler" : "ok");
    setTimeout(() => setKochbuchStatus(null), 3000);
  };

  const handleKochbuchKiSpeichern = async () => {
    setKochbuchKiStatus(null);
    const patch = {
      kochbuch_ki_provider: kochbuchKiProvider,
      kochbuch_openai_model: kochbuchOpenaiModel.trim() || null,
      kochbuch_ollama_model: kochbuchOllamaModel.trim() || null,
      kochbuch_ollama_thinking_enabled: !!kochbuchOllamaThinkingEnabled,
      ...(kochbuchKiProvider === "ollama"
        ? {
            ollama_base_url: ollamaUrl.trim() || null,
            ollama_model: (kochbuchOllamaModel.trim() || ollamaModel.trim() || "llama3.2"),
          }
        : {}),
    };
    const { error: profileError } = await supabase
      .from("user_profile")
      .update(patch)
      .eq("id", userId);
    let rpcError = null;
    if (!profileError && isHouseholdAdmin) {
      const { error } = await supabase.rpc("set_household_kochbuch_ai_settings", {
        p_kochbuch_ki_provider: kochbuchKiProvider,
        p_kochbuch_openai_model: kochbuchOpenaiModel.trim() || null,
        p_kochbuch_ollama_model: kochbuchOllamaModel.trim() || null,
        p_ollama_base_url: kochbuchKiProvider === "ollama" ? (ollamaUrl.trim() || null) : null,
        p_ollama_model: kochbuchKiProvider === "ollama" ? (kochbuchOllamaModel.trim() || ollamaModel.trim() || "llama3.2") : null,
        p_kochbuch_ollama_thinking_enabled: !!kochbuchOllamaThinkingEnabled,
      });
      rpcError = error;
    }
    setKochbuchKiStatus(profileError || rpcError ? "fehler" : "ok");
    setTimeout(() => setKochbuchKiStatus(null), 3000);
  };

  const handleMitgliedEntfernen = async () => {
    if (!mitgliedZuEntfernen) return;
    setEntfernenLadend(true);
    const { error } = await supabase.rpc("remove_household_member", {
      p_user_id: mitgliedZuEntfernen.user_id,
    });
    setEntfernenLadend(false);
    setMitgliedZuEntfernen(null);
    if (!error) {
      setHaushaltMitglieder((prev) => prev.filter((m) => m.user_id !== mitgliedZuEntfernen.user_id));
    }
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
    resetAllTours?.();
    setTourReset(true);
    setTimeout(() => setTourReset(false), 3000);
  };

  const handleModusWechsel = (ziel) => {
    if (ziel === "home") {
      switchToHome();
    } else {
      switchToUmzug();
    }
  };

  const handleUmzugDeaktivieren = async () => {
    await supabase.from("user_profile")
      .update({ umzug_deaktiviert: true, app_modus: "home" })
      .eq("id", userId);
    setUmzugDeaktiviertLokal(true);
    deaktiviereUmzug();
  };

  const handleUmzugAktivieren = async () => {
    await supabase.from("user_profile")
      .update({ umzug_deaktiviert: false, app_modus: "umzug" })
      .eq("id", userId);
    setUmzugDeaktiviertLokal(false);
    aktiviereUmzug();
  };

  const handleInviteErstellen = async () => {
    const emailNormalisiert = inviteEmail.trim().toLowerCase();
    if (!emailNormalisiert || !emailNormalisiert.includes("@")) {
      setInviteStatus("fehler");
      setInviteFehler("Bitte eine gueltige E-Mail-Adresse eingeben.");
      return;
    }

    setInviteLadend(true);
    setInviteStatus(null);
    setInviteFehler("");
    setInviteMailStatus(null);
    setInviteMailHinweis("");

    const { data, error } = await supabase.rpc("create_household_invite", {
      p_email: emailNormalisiert,
      p_expires_in: "7 days",
    });

    if (error) {
      setInviteStatus("fehler");
      setInviteFehler(error.message || "Einladung konnte nicht erstellt werden.");
      setInviteLadend(false);
      return;
    }

    const eintrag = Array.isArray(data) ? data[0] : data;
    if (eintrag?.id) {
      await supabase.from("household_invites").update({ locale }).eq("id", eintrag.id);
    }
    const relativeUrl = eintrag?.invite_url || "";
    const absoluteUrl = relativeUrl.startsWith("http")
      ? relativeUrl
      : `${window.location.origin}${relativeUrl}`;

    setInviteLink(absoluteUrl);
    setInviteStatus("ok");

    setInviteMailStatus("sending");
    try {
      const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!supabaseUrl || !currentSession?.access_token) {
        throw new Error("Mailversand aktuell nicht verfuegbar.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-household-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({
          inviteEmail: emailNormalisiert,
          inviteLink: absoluteUrl,
          householdName: householdContext?.household_name || "",
          inviterName: displayName?.trim() || nameRaw,
          locale,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.sent !== true) {
        throw new Error(payload?.error || "Einladungs-Mail konnte nicht gesendet werden.");
      }

      setInviteMailStatus("sent");
      setInviteMailHinweis("Einladung wurde per E-Mail verschickt.");
    } catch (mailError) {
      setInviteMailStatus("failed");
      setInviteMailHinweis(
        mailError?.message
          ? `${mailError.message} Link bitte manuell teilen.`
          : "Mailversand fehlgeschlagen. Link bitte manuell teilen.",
      );
    }

    setInviteLadend(false);
  };

  const handleInviteLinkKopieren = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteStatus("copied");
      setTimeout(() => setInviteStatus("ok"), 1800);
    } catch {
      setInviteStatus("fehler");
      setInviteFehler("Link konnte nicht kopiert werden.");
    }
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

  // ── Mobile Navigation Handler ─────────────────────────────────────────────

  const handleNavFavoritErsetzen = (mode, slotIdx, neuerKey) => {
    setNavEdit((prev) => {
      const liste = [...(prev?.[mode] || [])];
      liste[slotIdx] = neuerKey;
      return { ...prev, [mode]: liste };
    });
    setNavPickerModus(null);
    setNavPickerSlotIdx(null);
  };

  const handleNavFavoritVerschieben = (mode, idx, richtung) => {
    setNavEdit((prev) => {
      const liste = [...(prev?.[mode] || [])];
      const neuerIdx = idx + richtung;
      if (neuerIdx < 0 || neuerIdx >= liste.length) return prev;
      [liste[idx], liste[neuerIdx]] = [liste[neuerIdx], liste[idx]];
      return { ...prev, [mode]: liste };
    });
  };

  const handleNavFavoritenZuruecksetzen = (mode) => {
    setNavEdit((prev) => ({ ...prev, [mode]: [...DEFAULT_MOBILE_FAVORITES[mode]] }));
    setNavPickerModus(null);
    setNavPickerSlotIdx(null);
  };

  const handleNavSpeichern = async () => {
    const sanitized = sanitizeMobileNavFavorites(navEdit);
    const { error } = await supabase
      .from("user_profile")
      .update({ mobile_nav_config: sanitized })
      .eq("id", userId);
    if (error) {
      setNavSaveStatus("fehler");
    } else {
      onMobileNavChange(sanitized);
      setNavSaveStatus("ok");
    }
    setTimeout(() => setNavSaveStatus(null), 2500);
  };

  // ── Eingabe-Klassen ───────────────────────────────────────────────────────
  const inputCls = `w-full px-3 py-2.5 text-sm rounded-card-sm
    bg-light-bg dark:bg-canvas-1
    border border-light-border dark:border-dark-border
    text-light-text-main dark:text-dark-text-main
    placeholder-light-text-secondary dark:placeholder-dark-text-secondary
    focus:outline-none focus:ring-2 focus:ring-secondary-500`;

  // ── Status-Berechnungen für Karten ────────────────────────────────────────
  const kiStatus = isHouseholdAdmin
    ? (kiProvider === "openai" && apiKey
        ? { label: t("profile:ki.openAiConfigured"), farbe: "emerald" }
        : kiProvider === "ollama" && ollamaUrl
        ? { label: t("profile:ki.ollamaConfigured"), farbe: "emerald" }
        : { label: t("common:status.notConfigured"), farbe: "gray" })
    : (memberKiStatus?.ki_konfiguriert
        ? { label: t("common:status.configured"), farbe: "emerald" }
        : { label: t("common:status.notConfigured"), farbe: "gray" });

  const pushStatus = !pushUnterstuetzt
    ? { label: t("common:status.notSupported"), farbe: "gray" }
    : pushAktiv
    ? { label: t("common:status.active"), farbe: "emerald" }
    : pushBerechtigung === "denied"
    ? { label: t("common:status.blocked"), farbe: "red" }
    : pushFehler
    ? { label: t("common:status.error"), farbe: "amber" }
    : { label: t("common:status.inactive"), farbe: "gray" };

  const modusStatus = {
    label: appMode === "home" ? "Home Organizer" : "Umzugsplaner",
    farbe: "primary",
  };

  const bildanalyseLabel = {
    chatgpt_vision: "ChatGPT Vision",
    ocr_regeln: "OCR + Regeln",
    ocr_ollama: "OCR + Ollama",
  }[bildanalyseModus] ?? "–";

  const mitgliederLabel = haushaltUebersichtLadend
    ? t("profile:members.loading")
    : t("profile:members.count", { count: haushaltMitglieder.length });

  // ── Panel-Titel ───────────────────────────────────────────────────────────
  const panelTitel = {
    "erscheinungsbild": t("profile:panels.appearance"),
    "app-modus":        t("profile:panels.appMode"),
    "haushalt":         t("profile:panels.household"),
    "einladen":         t("profile:panels.invite"),
    "ki":               t("profile:panels.ai"),
    "bildanalyse":      t("profile:panels.imageAnalysis"),
    "push":             t("profile:panels.push"),
    "touren":           t("profile:panels.tours"),
    "mobile-nav":       t("profile:panels.mobileNav"),
    "account":          t("profile:panels.account"),
  };

  // ── Panel-Inhalte ─────────────────────────────────────────────────────────
  const renderPanelInhalt = (key) => {
    if (key === "erscheinungsbild") return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{t("theme.colorMode")}</p>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
              {t("locale.current", { language: t("theme." + theme) })}
            </p>
          </div>
          <ThemeSwitch />
        </div>
        <div className="border-t border-light-border dark:border-dark-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{t("locale.title")}</p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                {t("locale.description")}
              </p>
            </div>
            <div className="inline-flex rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden bg-light-bg dark:bg-canvas-1">
              {supportedLocales.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleLocaleChange(option)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    locale === option
                      ? "bg-primary-500 text-white"
                      : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
                  }`}
                >
                  {t(`locale.${option}`)}
                </button>
              ))}
            </div>
          </div>
          {localeStatus === "ok" && <p className="text-xs text-accent-success mt-2">{t("locale.updated")}</p>}
          {localeStatus === "fehler" && <p className="text-xs text-accent-danger mt-2">{t("locale.updateFailed")}</p>}
        </div>
      </div>
    );

    if (key === "app-modus") return (
      <div className="space-y-4">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {t("profile:panelContent.appMode.intro")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => !umzugDeaktiviertLokal && handleModusWechsel("umzug")}
            disabled={umzugDeaktiviertLokal}
            className={`flex flex-col items-center gap-3 p-4 rounded-card-sm border-2 transition-all duration-200
                        ${umzugDeaktiviertLokal
                          ? "border-light-border dark:border-dark-border opacity-40 cursor-not-allowed bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary"
                          : appMode === "umzug"
                            ? "border-primary-500 bg-primary-500/10 text-primary-500"
                            : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/50"
                        }`}
          >
            <Truck size={28} />
            <div className="text-center">
              <p className="text-sm font-semibold">{t("profile:panelContent.appMode.movers")}</p>
              <p className="text-xs opacity-70 mt-0.5">
                {umzugDeaktiviertLokal ? t("profile:panelContent.appMode.moversDisabled") : t("profile:panelContent.appMode.moversDesc")}
              </p>
            </div>
            {appMode === "umzug" && !umzugDeaktiviertLokal && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary-500 text-white">{t("profile:panelContent.appMode.active")}</span>
            )}
          </button>
          <button
            onClick={() => handleModusWechsel("home")}
            className={`flex flex-col items-center gap-3 p-4 rounded-card-sm border-2 transition-all duration-200
                        ${appMode === "home"
                          ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                          : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/50"
                        }`}
          >
            <Home size={28} />
            <div className="text-center">
              <p className="text-sm font-semibold">{t("profile:panelContent.appMode.homeOrg")}</p>
              <p className="text-xs opacity-70 mt-0.5">{t("profile:panelContent.appMode.homeOrgDesc")}</p>
            </div>
            {appMode === "home" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-secondary-500 text-white">{t("profile:panelContent.appMode.active")}</span>
            )}
          </button>
        </div>
        {umzugDeaktiviertLokal ? (
          <div className="p-3 rounded-card-sm bg-accent-success/10 border border-accent-success/30">
            <p className="text-xs text-accent-success mb-2.5 leading-snug">
              {t("profile:panelContent.appMode.deactivatedInfo")}
            </p>
            <button
              onClick={handleUmzugAktivieren}
              className="flex items-center gap-2 px-3 py-1.5 rounded-pill text-xs font-medium
                         bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                         border border-primary-500/30 transition-colors"
            >
              <Truck size={13} /> {t("profile:panelContent.appMode.reactivate")}
            </button>
          </div>
        ) : appMode === "home" ? (
          <div className="p-3 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 border border-light-border dark:border-dark-border">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2.5 leading-snug">
              {t("profile:panelContent.appMode.deactivateInfo")}
            </p>
            <button
              onClick={handleUmzugDeaktivieren}
              className="flex items-center gap-2 px-3 py-1.5 rounded-pill text-xs font-medium
                         bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger
                         border border-accent-danger/30 transition-colors"
            >
              <Truck size={13} /> {t("profile:panelContent.appMode.deactivate")}
            </button>
          </div>
        ) : null}
      </div>
    );

    if (key === "haushalt") return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isHouseholdAdmin && haushaltsNameBearbeiten ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                value={haushaltsName}
                onChange={(e) => setHaushaltsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleHaushaltsNameSpeichern(); if (e.key === "Escape") setHaushaltsNameBearbeiten(false); }}
                className="flex-1 min-w-0 text-xs px-2 py-1 rounded-card-sm border border-light-border dark:border-dark-border
                           bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main
                           focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
              <button onClick={handleHaushaltsNameSpeichern} className="text-primary-500 hover:text-primary-400 transition-colors"><Check size={14} /></button>
              <button onClick={() => { setHaushaltsNameBearbeiten(false); setHaushaltsName(householdContext?.household_name || ""); }} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger transition-colors"><X size={14} /></button>
              {haushaltsNameStatus === "fehler" && <span className="text-[10px] text-accent-danger">{t("common:status.error")}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              <span>{haushaltsName || householdContext?.household_name || t("profile:panelContent.household.defaultName")}</span>
              {isHouseholdAdmin && (
                <button onClick={() => setHaushaltsNameBearbeiten(true)} className="text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors" title={t("profile:panelContent.household.editNameTitle")}>
                  <Pencil size={12} />
                </button>
              )}
              {haushaltsNameStatus === "ok" && <CheckCircle size={12} className="text-accent-success" />}
            </div>
          )}
          <button
            onClick={() => navigate("/home/bewohner")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                       border border-secondary-500/30 text-secondary-500 hover:bg-secondary-500/10 transition-colors"
          >
            <Users size={13} /> {t("profile:panelContent.household.manageBewohner")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded-pill bg-primary-500/10 text-primary-500 border border-primary-500/30">
            {t("profile:panelContent.household.memberCount", { count: haushaltMitglieder.length })}
          </span>
          <span className="px-2 py-1 rounded-pill bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
            {t("profile:panelContent.household.residentCount", { count: bewohnerAnzahl })}
          </span>
        </div>

        {haushaltUebersichtLadend ? (
          <div className="space-y-2">
            <div className="h-14 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 animate-pulse" />
            <div className="h-14 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 animate-pulse" />
          </div>
        ) : haushaltUebersichtFehler ? (
          <p className="text-xs text-accent-danger flex items-center gap-1.5">
            <AlertCircle size={13} /> {haushaltUebersichtFehler}
          </p>
        ) : (
          <div className="space-y-2">
            {haushaltMitglieder.map((mitglied) => {
              const initial = (mitglied.display_name || mitglied.email || "?").charAt(0).toUpperCase();
              return (
                <div
                  key={mitglied.user_id}
                  className="flex items-center justify-between gap-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {mitglied.avatar_url ? (
                      <img src={mitglied.avatar_url} alt={mitglied.display_name || t("profile:panelContent.household.profilePicAlt")} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary-500 text-white text-xs font-semibold flex items-center justify-center">
                        {initial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">
                        {mitglied.display_name || t("common:profile.member")} {mitglied.is_current_user ? t("profile:panelContent.household.youSuffix") : ""}
                      </p>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                        {mitglied.email || t("profile:panelContent.household.noEmail")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mitglied.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[11px] font-medium bg-secondary-500/10 text-secondary-500 border border-secondary-500/30">
                        <Crown size={11} /> {t("common:profile.admin")}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-pill text-[11px] font-medium bg-light-bg dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
                        {t("common:profile.member")}
                      </span>
                    )}
                    {isHouseholdAdmin && !mitglied.is_current_user && (
                      <button
                        onClick={() => setMitgliedZuEntfernen(mitglied)}
                        className="ml-1 p-1.5 rounded-card-sm text-red-500 hover:bg-red-500/10 transition-colors"
                        title={t("profile:panelContent.household.removeTitle")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

    if (key === "einladen") return (
      <div className="space-y-3">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {t("profile:panelContent.invite.intro")}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="person@email.de"
            className={`flex-1 ${inputCls}`}
          />
          <button
            onClick={handleInviteErstellen}
            disabled={inviteLadend}
            className="px-4 py-2.5 rounded-pill text-sm font-medium
                       bg-secondary-500 hover:bg-secondary-600 text-white
                       transition-colors disabled:opacity-50"
          >
            {inviteLadend ? t("profile:panelContent.invite.creating") : t("profile:panelContent.invite.create")}
          </button>
        </div>
        {inviteLink && (
          <div className="p-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">{t("profile:panelContent.invite.linkLabel")}</p>
            <p className="text-xs break-all text-light-text-main dark:text-dark-text-main">{inviteLink}</p>
            <button
              onClick={handleInviteLinkKopieren}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                         border border-primary-500/30 text-primary-500 hover:bg-primary-500/10 transition-colors"
            >
              <Copy size={13} /> {t("profile:panelContent.invite.copyLink")}
            </button>
          </div>
        )}
        {inviteStatus === "ok" && <p className="text-xs text-accent-success flex items-center gap-1"><CheckCircle size={13} /> {t("profile:panelContent.invite.created")}</p>}
        {inviteStatus === "copied" && <p className="text-xs text-accent-success flex items-center gap-1"><CheckCircle size={13} /> {t("profile:panelContent.invite.copied")}</p>}
        {inviteStatus === "fehler" && <p className="text-xs text-accent-danger flex items-center gap-1"><AlertCircle size={13} /> {inviteFehler || t("profile:panelContent.invite.error")}</p>}
        {inviteMailStatus === "sending" && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{t("profile:panelContent.invite.mailSending")}</p>}
        {inviteMailStatus === "sent" && <p className="text-xs text-accent-success flex items-center gap-1"><CheckCircle size={13} /> {inviteMailHinweis}</p>}
        {inviteMailStatus === "failed" && <p className="text-xs text-accent-danger flex items-center gap-1"><AlertCircle size={13} /> {inviteMailHinweis}</p>}
      </div>
    );

    if (key === "ki") return (
      <div className="space-y-5">
        {!isHouseholdAdmin ? (
          <>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-4">
              {t("profile:panelContent.ki.memberIntro")}
            </p>
            {memberKiStatus ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b border-light-border dark:border-dark-border">
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("profile:panelContent.ki.available")}</span>
                  {memberKiStatus.ki_konfiguriert ? (
                    <span className="flex items-center gap-1.5 text-sm text-accent-success"><CheckCircle size={14} /> {t("profile:panelContent.ki.yes")}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-accent-danger"><AlertCircle size={14} /> {t("common:status.notConfigured")}</span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2 border-b border-light-border dark:border-dark-border">
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("profile:panelContent.ki.providerLabel")}</span>
                  <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main capitalize">{memberKiStatus.ki_provider || "–"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("profile:panelContent.ki.imageAnalysisLabel")}</span>
                  {memberKiStatus.bildanalyse_key_gesetzt ? (
                    <span className="flex items-center gap-1.5 text-sm text-accent-success"><CheckCircle size={14} /> {t("common:status.configured")}</span>
                  ) : (
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{t("common:status.notConfigured")}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-16 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
            )}
          </>
        ) : ladend ? (
          <div className="h-20 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        ) : (
          <>
            <div>
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2 uppercase tracking-wide">{t("profile:panelContent.ki.providerSection")}</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "openai", label: "OpenAI", desc: "GPT-4o + Whisper" },
                  { id: "ollama", label: "Ollama", desc: t("profile:panelContent.ki.ollamaDesc") },
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

            {kiProvider === "openai" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">{t("profile:panelContent.ki.apiKeySection")}</p>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleApiKeySpeichern();
                  }}
                >
                  <div className="relative flex-1">
                    <input
                      type={apiKeyVisible ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="new-password"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyVisible(!apiKeyVisible)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors"
                    >
                      {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                               bg-primary-500 hover:bg-primary-600 text-white transition-colors shrink-0"
                  >
                    {speichernStatus === "ok" ? <><CheckCircle size={15} /> {t("common:status.saved")}</>
                      : speichernStatus === "fehler" ? <><AlertCircle size={15} /> {t("common:status.error")}</>
                      : <><Save size={15} /> {t("common:actions.save")}</>}
                  </button>
                </form>
              </div>
            )}

            {kiProvider === "ollama" && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">{t("profile:panelContent.ki.ollamaServerSection")}</p>
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
                      {t("profile:panelContent.ki.ollamaUrlHint")}
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
                    {ollamaTestStatus === "ok" ? t("profile:panelContent.ki.connected") : ollamaTestStatus === "fehler" ? t("profile:panelContent.ki.notReachable") : t("profile:panelContent.ki.testBtn")}
                  </button>
                  <button
                    onClick={handleOllamaSpeichern}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-medium
                               bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
                  >
                    {ollamaStatus === "ok" ? <><CheckCircle size={14} /> {t("common:status.saved")}</>
                      : ollamaStatus === "fehler" ? <><AlertCircle size={14} /> {t("common:status.error")}</>
                      : <><Save size={14} /> {t("common:actions.save")}</>}
                  </button>
                </div>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.ki.ollamaNote")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    );

    if (key === "bildanalyse") return (
      <div className="space-y-5">
        {ladend ? (
          <div className="h-20 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        ) : (
          <>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {t("profile:panelContent.imageAnalysis.intro")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "chatgpt_vision", label: "ChatGPT Vision",  desc: t("profile:panelContent.imageAnalysis.chatgptVisionDesc") },
                { id: "ocr_regeln",     label: "OCR + Regeln",    desc: t("profile:panelContent.imageAnalysis.ocrRegelnDesc") },
                { id: "ocr_ollama",     label: "OCR + Ollama",    desc: t("profile:panelContent.imageAnalysis.ocrOllamaDesc") },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setBildanalyseModus(m.id)}
                  className={`flex flex-col items-center p-3 rounded-card-sm border-2 text-sm transition-all text-center
                              ${bildanalyseModus === m.id
                                ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                                : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/40"
                              }`}
                >
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-xs opacity-70 mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>
            {bildanalyseModus === "chatgpt_vision" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">{t("profile:panelContent.imageAnalysis.apiKeySection")}</p>
                {bildanalyseOpenaiKeySet && (
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-accent-success flex items-center gap-1.5"><CheckCircle size={13} /> {t("profile:panelContent.imageAnalysis.keySet")} <span className="font-mono">***</span></p>
                    <button
                      onClick={handleOpenaiKeyLoeschen}
                      disabled={loescheOpenaiKey}
                      className="text-xs text-accent-danger hover:underline disabled:opacity-50"
                    >
                      {loescheOpenaiKey ? "…" : t("profile:panelContent.imageAnalysis.deleteKey")}
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleBildanalyseSpeichern();
                  }}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={bildanalyseOpenaiKey}
                    onChange={(e) => setBildanalyseOpenaiKey(e.target.value)}
                    placeholder={bildanalyseOpenaiKeySet ? t("profile:panelContent.imageAnalysis.replaceKeyPlaceholder") : "sk-..."}
                    className={`w-full px-3 py-2.5 rounded-card-sm border text-sm
                                bg-light-surface-1 dark:bg-canvas-2
                                border-light-border dark:border-dark-border
                                text-light-text-main dark:text-dark-text-main
                                placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                                focus:outline-none focus:border-secondary-500 transition-colors`}
                  />
                </form>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.imageAnalysis.apiKeyNote")}
                </p>
              </div>
            )}
            {bildanalyseModus === "ocr_ollama" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">{t("profile:panelContent.imageAnalysis.ollamaModelSection")}</p>
                <input
                  type="text"
                  value={ollamaVisionModel}
                  onChange={(e) => setOllamaVisionModel(e.target.value)}
                  placeholder="z.B. llava, llama3.2-vision, bakllava"
                  className={`w-full px-3 py-2.5 rounded-card-sm border text-sm
                              bg-light-surface-1 dark:bg-canvas-2
                              border-light-border dark:border-dark-border
                              text-light-text-main dark:text-dark-text-main
                              placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                              focus:outline-none focus:border-secondary-500 transition-colors`}
                />
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.imageAnalysis.ollamaModelNote")}
                </p>
              </div>
            )}
            <button
              onClick={handleBildanalyseSpeichern}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
            >
              {bildanalyseStatus === "ok" ? <><CheckCircle size={15} /> {t("common:status.saved")}</>
                : bildanalyseStatus === "fehler" ? <><AlertCircle size={15} /> {t("common:status.error")}</>
                : <><Save size={15} /> {t("profile:panelContent.imageAnalysis.saveSettings")}</>}
            </button>
          </>
        )}
      </div>
    );

    if (key === "kochbuch") return (
      <div className="space-y-4">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {t("profile:panelContent.kochbuch.intro")}
        </p>
        <div className="space-y-3 p-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
              {t("profile:panelContent.kochbuch.aiProviderSection")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: "global", label: t("profile:panelContent.kochbuch.aiProviderGlobal"), desc: t("profile:panelContent.kochbuch.aiProviderGlobalDesc") },
                { id: "openai", label: "OpenAI", desc: t("profile:panelContent.kochbuch.aiProviderOpenaiDesc") },
                { id: "ollama", label: "Ollama", desc: t("profile:panelContent.kochbuch.aiProviderOllamaDesc") },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setKochbuchKiProvider(p.id)}
                  className={`flex flex-col items-center p-3 rounded-card-sm border-2 text-sm text-center transition-all
                              ${kochbuchKiProvider === p.id
                                ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                                : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/40"
                              }`}
                >
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-xs opacity-70 mt-0.5">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {kochbuchKiProvider === "openai" && (
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                {t("profile:panelContent.kochbuch.openaiModel")}
              </span>
              <input
                type="text"
                value={kochbuchOpenaiModel}
                onChange={(e) => setKochbuchOpenaiModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className={inputCls}
              />
            </label>
          )}
          {kochbuchKiProvider === "ollama" && (
            <div className="space-y-3">
              <label className="space-y-1.5 block">
                <span className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.kochbuch.ollamaUrl")}
                </span>
                <input
                  type="url"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://192.168.1.100:11434"
                  className={inputCls}
                />
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.kochbuch.ollamaUrlHint")}
                </p>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                  {t("profile:panelContent.kochbuch.ollamaModel")}
                </span>
                <input
                  type="text"
                  value={kochbuchOllamaModel}
                  onChange={(e) => setKochbuchOllamaModel(e.target.value)}
                  placeholder={ollamaModel || "llama3.2"}
                  className={inputCls}
                />
              </label>
              <label className="flex items-start gap-3 p-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-surface-2 dark:bg-canvas-2">
                <input
                  type="checkbox"
                  checked={kochbuchOllamaThinkingEnabled}
                  onChange={(e) => setKochbuchOllamaThinkingEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-light-border dark:border-dark-border text-secondary-500 focus:ring-secondary-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-light-text-main dark:text-dark-text-main">
                    {t("profile:panelContent.kochbuch.ollamaThinking")}
                  </span>
                  <span className="block text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                    {t("profile:panelContent.kochbuch.ollamaThinkingHint")}
                  </span>
                </span>
              </label>
            </div>
          )}
          <button
            onClick={handleKochbuchKiSpeichern}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-medium
                       bg-primary-500 hover:bg-primary-600 text-white transition-colors"
          >
            {kochbuchKiStatus === "ok" ? <><CheckCircle size={15} /> {t("common:status.saved")}</>
              : kochbuchKiStatus === "fehler" ? <><AlertCircle size={15} /> {t("common:status.error")}</>
              : <><Save size={15} /> {t("profile:panelContent.kochbuch.saveAiProvider")}</>}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
              {t("profile:panelContent.kochbuch.webLimit")}
            </span>
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={kochbuchWebLimit}
              onChange={(e) => setKochbuchWebLimit(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
              {t("profile:panelContent.kochbuch.videoLimit")}
            </span>
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={kochbuchVideoLimit}
              onChange={(e) => setKochbuchVideoLimit(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <button
          onClick={handleKochbuchLimitsSpeichern}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-medium
                     bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
        >
          {kochbuchStatus === "ok" ? <><CheckCircle size={15} /> {t("common:status.saved")}</>
            : kochbuchStatus === "fehler" ? <><AlertCircle size={15} /> {t("common:status.error")}</>
            : <><Save size={15} /> {t("profile:panelContent.kochbuch.saveLimits")}</>}
        </button>
      </div>
    );

    if (key === "push") return (
      <div className="space-y-4">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {t("profile:panelContent.push.intro")}
        </p>
        {isIOS && !isStandalone && (
          <div className="flex gap-2.5 p-3 rounded-card-sm bg-accent-yellow/10 border border-accent-yellow/30">
            <BellRing size={16} className="text-accent-yellow shrink-0 mt-0.5" />
            <p className="text-xs text-accent-yellow leading-relaxed">
              {t("profile:panelContent.push.iosHint")}
            </p>
          </div>
        )}
        {!pushUnterstuetzt ? (
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            <BellOff size={15} /> {t("profile:panelContent.push.notSupported")}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {pushAktiv ? (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill bg-accent-success/15 text-accent-success border border-accent-success/30">
                  <Bell size={12} /> {t("profile:panelContent.push.active")}
                </span>
              ) : pushBerechtigung === "denied" ? (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill bg-accent-danger/10 text-accent-danger border border-accent-danger/30">
                  <BellOff size={12} /> {t("profile:panelContent.push.denied")}
                </span>
              ) : pushFehler ? (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                  <AlertCircle size={12} /> {t("profile:panelContent.push.techError")}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
                  <BellOff size={12} /> {t("profile:panelContent.push.inactive")}
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
                  <><BellOff size={15} /> {t("profile:panelContent.push.deactivate")}</>
                ) : (
                  <><Bell size={15} /> {t("profile:panelContent.push.activate")}</>
                )}
              </button>
            )}
            {pushBerechtigung === "denied" && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {t("profile:panelContent.push.permissionHint")}
              </p>
            )}
          </div>
        )}
        {pushFehler && (
          <p className="text-xs text-accent-danger flex items-center gap-1.5">
            <AlertCircle size={13} /> {pushFehler}
          </p>
        )}
        {pushAktiv && (
          <div className="pt-4 border-t border-light-border dark:border-dark-border space-y-3">
            <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{t("profile:panelContent.push.shoppingReminder")}</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={einkaufReminderAktiv}
                onChange={(e) => setEinkaufReminderAktiv(e.target.checked)}
                className="mt-0.5 accent-primary-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary leading-snug">
                {t("profile:panelContent.push.shoppingReminderDesc")}
              </span>
            </label>
            {einkaufReminderAktiv && (
              <div className="flex items-center gap-3 pl-7">
                <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap">{t("profile:panelContent.push.timeUtc")}</label>
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
                <Save size={14} /> {t("common:actions.save")}
              </button>
              {reminderStatus === "ok" && <span className="flex items-center gap-1 text-xs text-accent-success"><CheckCircle size={13} /> {t("common:status.saved")}</span>}
              {reminderStatus === "fehler" && <span className="flex items-center gap-1 text-xs text-accent-danger"><AlertCircle size={13} /> {t("common:actions.saveFailed")}</span>}
            </div>
          </div>
        )}
      </div>
    );

    if (key === "touren") return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-light-text-secondary dark:text-dark-text-secondary">{t("profile:panelContent.tours.statusLabel")}</span>
          {!tourGeladen ? (
            <span className="text-light-text-secondary dark:text-dark-text-secondary text-xs">{t("profile:panelContent.tours.loading")}</span>
          ) : tourState?.intro_opt_in === true ? (
            <span className="text-primary-500 text-xs font-medium">{t("profile:panelContent.tours.active")}</span>
          ) : tourState?.intro_opt_in === false ? (
            <span className="text-light-text-secondary dark:text-dark-text-secondary text-xs">{t("profile:panelContent.tours.disabled")}</span>
          ) : (
            <span className="text-amber-400 text-xs font-medium">{t("profile:panelContent.tours.undecided")}</span>
          )}
        </div>
        {tourState?.intro_opt_in === true && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-light-text-main dark:text-dark-text-main">{t("profile:panelContent.tours.autoTours")}</span>
            <button
              onClick={() => setAutoTours?.(!tourState.auto_tours_enabled)}
              className={`px-3 py-1 rounded-pill text-xs font-medium transition-colors
                ${tourState.auto_tours_enabled
                  ? "bg-primary-500 text-white"
                  : "border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-1 dark:hover:bg-canvas-3"}`}
            >
              {tourState.auto_tours_enabled ? t("profile:panelContent.tours.on") : t("profile:panelContent.tours.off")}
            </button>
          </div>
        )}
        {tourState?.intro_opt_in === true && (
          <div className="space-y-1">
            <button
              onClick={handleTourZuruecksetzen}
              className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-secondary-500/10 hover:bg-secondary-500/20 text-secondary-500
                         border border-secondary-500/30 transition-colors"
            >
              {tourReset ? <><CheckCircle size={15} /> {t("profile:panelContent.tours.resetDone")}</> : <><RotateCcw size={15} /> {t("profile:panelContent.tours.resetAll")}</>}
            </button>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {t("profile:panelContent.tours.autoStartNote")}
            </p>
          </div>
        )}
        {tourState?.intro_opt_in === true && (
          <button
            onClick={() => { setAutoTours?.(true); resetPageTour?.("dashboard"); navigate("/home"); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                       border border-light-border dark:border-dark-border
                       text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
          >
            <RotateCcw size={15} /> {t("profile:panelContent.tours.restartDashboard")}
          </button>
        )}
        {tourState?.intro_opt_in === false && (
          <button
            onClick={() => { setIntroAnswer?.(true); resetPageTour?.("dashboard"); navigate("/home"); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                       bg-primary-500/10 hover:bg-primary-500/20 text-primary-500
                       border border-primary-500/30 transition-colors"
          >
            <RotateCcw size={15} /> {t("profile:panelContent.tours.activateAndStart")}
          </button>
        )}
      </div>
    );

    if (key === "mobile-nav") return (
      <div className="space-y-5">
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {t("profile:panelContent.mobileNav.intro", { count: MOBILE_NAV_FAVORITE_COUNT })}
        </p>
        {navEdit && ["home", "umzug"].map((mode) => (
          <div key={mode} className="space-y-2">
            <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
              {mode === "home" ? t("common:app.name") : t("common:app.moveName")}
            </p>
            <div className="space-y-1.5">
              {navEdit[mode].map((key2, idx) => {
                const item = MOBILE_NAV_REGISTRY[mode].find((i) => i.key === key2);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <div
                    key={key2}
                    className="flex items-center gap-2 px-3 py-2 rounded-card-sm
                               border border-light-border dark:border-dark-border
                               bg-light-surface-1 dark:bg-canvas-3"
                  >
                    <Icon size={15} className="text-primary-500 shrink-0" />
                    <span className="text-sm text-light-text-main dark:text-dark-text-main flex-1">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleNavFavoritVerschieben(mode, idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main disabled:opacity-30 transition-colors"
                        title={t("profile:panelContent.mobileNav.moveUp")}
                      >↑</button>
                      <button
                        onClick={() => handleNavFavoritVerschieben(mode, idx, 1)}
                        disabled={idx === navEdit[mode].length - 1}
                        className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main disabled:opacity-30 transition-colors"
                        title={t("profile:panelContent.mobileNav.moveDown")}
                      >↓</button>
                      <button
                        onClick={() => { setNavPickerModus(mode); setNavPickerSlotIdx(idx); }}
                        className="px-2 py-0.5 rounded-pill text-xs border border-primary-500/30 text-primary-500 hover:bg-primary-500/10 transition-colors"
                      >
                        {t("profile:panelContent.mobileNav.replace")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {navPickerModus === mode && navPickerSlotIdx !== null && (
              <div className="mt-2 p-3 rounded-card-sm border border-secondary-500/30 bg-secondary-500/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-secondary-500">{t("profile:panelContent.mobileNav.chooseModule")}</p>
                  <button
                    onClick={() => { setNavPickerModus(null); setNavPickerSlotIdx(null); }}
                    className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
                  >
                    {t("common:actions.cancel")}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MOBILE_NAV_REGISTRY[mode]
                    .filter((i) => i.favoriteEligible && !navEdit[mode].includes(i.key))
                    .map((i) => {
                      const Icon = i.icon;
                      return (
                        <button
                          key={i.key}
                          onClick={() => handleNavFavoritErsetzen(mode, navPickerSlotIdx, i.key)}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-card-sm
                                     border border-light-border dark:border-dark-border
                                     text-light-text-main dark:text-dark-text-main
                                     hover:border-secondary-500/50 hover:bg-secondary-500/5
                                     text-sm transition-colors text-left"
                        >
                          <Icon size={14} className="shrink-0" />
                          <span>{i.label}</span>
                        </button>
                      );
                    })
                  }
                </div>
              </div>
            )}
            <button
              onClick={() => handleNavFavoritenZuruecksetzen(mode)}
              className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main underline underline-offset-2 transition-colors"
            >
              {t("profile:panelContent.mobileNav.resetDefault")}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2 border-t border-light-border dark:border-dark-border">
          <button
            onClick={handleNavSpeichern}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                       bg-primary-500 hover:bg-primary-600 text-white transition-colors"
          >
            {navSaveStatus === "ok" ? <><CheckCircle size={15} /> {t("common:status.saved")}</>
              : navSaveStatus === "fehler" ? <><AlertCircle size={15} /> {t("common:status.error")}</>
              : <><Save size={15} /> {t("common:actions.save")}</>}
          </button>
          {navSaveStatus === "ok" && <p className="text-xs text-accent-success">{t("profile:panelContent.mobileNav.navUpdated")}</p>}
          {navSaveStatus === "fehler" && <p className="text-xs text-accent-danger">{t("common:actions.saveFailed")}</p>}
        </div>
      </div>
    );

    if (key === "account") return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">{t("profile:panelContent.account.passwordSection")}</p>
          <button
            onClick={handlePasswortReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-medium
                       bg-light-surface-1 dark:bg-canvas-3
                       text-light-text-main dark:text-dark-text-main
                       border border-light-border dark:border-dark-border
                       hover:border-secondary-500/50 transition-colors"
          >
            <KeyRound size={14} /> {t("profile:panelContent.account.sendResetMail")}
          </button>
          {passwortStatus === "ok" && (
            <p className="text-xs text-accent-success mt-2 flex items-center gap-1">
              <CheckCircle size={12} /> {t("profile:panelContent.account.emailSent")}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">{t("profile:panelContent.account.emailSection")}</p>
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
              <Save size={14} /> {t("common:actions.change")}
            </button>
          </div>
          {emailStatus === "ok" && <p className="text-xs text-accent-success mt-2 flex items-center gap-1"><CheckCircle size={12} /> {t("profile:panelContent.account.emailConfirmSent")}</p>}
          {emailStatus === "fehler" && <p className="text-xs text-accent-danger mt-2 flex items-center gap-1"><AlertCircle size={12} /> {t("profile:panelContent.account.emailChangeFailed")}</p>}
        </div>
        <div className="pt-2 border-t border-light-border dark:border-dark-border">
          {!loeschenBestaetigung ? (
            <button
              onClick={() => setLoeschenBestaetigung(true)}
              className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-danger transition-colors underline underline-offset-2"
            >
              {t("profile:panelContent.account.deleteAccount")}
            </button>
          ) : (
            <div className="p-3 bg-accent-danger/10 border border-accent-danger/30 rounded-card-sm space-y-3">
              <p className="text-xs text-accent-danger font-medium leading-snug">
                {t("profile:panelContent.account.deleteWarning")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAccountLoeschen}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium bg-accent-danger text-white hover:bg-accent-danger/90 transition-colors"
                >
                  {t("profile:panelContent.account.confirmDelete")}
                </button>
                <button
                  onClick={() => setLoeschenBestaetigung(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                             bg-light-surface-1 dark:bg-canvas-3
                             text-light-text-main dark:text-dark-text-main
                             border border-light-border dark:border-dark-border
                             hover:border-secondary-500/50 transition-colors"
                >
                  {t("common:actions.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );

    return null;
  };

  // ── Avatar-Block (wiederverwendet in Desktop + Mobile) ────────────────────
  const AvatarBlock = ({ gross = false }) => (
    <motion.label
      className="relative cursor-pointer shrink-0"
      whileHover={reduced ? {} : { scale: 1.05, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={reduced ? {} : { scale: 0.97 }}
    >
      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarHochladen} />
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={t("profile:panelContent.household.profilePicAlt")}
          className={`${gross ? "w-20 h-20" : "w-14 h-14"} rounded-full object-cover ring-2 ring-primary-500/40 shadow-glow-primary`}
        />
      ) : (
        <div className={`${gross ? "w-20 h-20 text-2xl" : "w-14 h-14 text-xl"} rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold shadow-glow-primary ring-2 ring-primary-500/30`}>
          {initiale}
        </div>
      )}
      <div className={`absolute bottom-0 right-0 ${gross ? "w-6 h-6" : "w-5 h-5"} bg-primary-500 rounded-full flex items-center justify-center shadow-elevation-2 ring-2 ring-light-card dark:ring-canvas-2`}>
        {avatarLadend
          ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Camera size={gross ? 12 : 10} className="text-white" />
        }
      </div>
    </motion.label>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-8">

      {/* Mitglied entfernen — Bestätigungs-Modal */}
      {mitgliedZuEntfernen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-4 p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">{t("profile:panelContent.household.removeTitle")}</h3>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {t("profile:panelContent.household.removeConfirm", { name: mitgliedZuEntfernen.display_name || mitgliedZuEntfernen.email })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMitgliedZuEntfernen(null)}
                disabled={entfernenLadend}
                className="px-4 py-2 rounded-pill text-sm font-medium border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleMitgliedEntfernen}
                disabled={entfernenLadend}
                className="px-4 py-2 rounded-pill text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                {entfernenLadend ? t("profile:panelContent.household.removing") : t("profile:panelContent.household.remove")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop-Modal */}
      <AnimatePresence>
      {aktivesPanel && isDesktop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        >
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.95, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? {} : { opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-lg
                          flex flex-col border border-light-border dark:border-dark-border
                          max-h-[90vh] overflow-hidden shadow-elevation-3"
          >
            <div className="shrink-0 border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-light-text-main dark:text-dark-text-main">
                {panelTitel[aktivesPanel]}
              </h2>
              <button
                onClick={() => setAktivesPanel(null)}
                className="w-9 h-9 rounded-card-sm flex items-center justify-center
                           text-light-text-secondary dark:text-dark-text-secondary
                           hover:text-accent-danger hover:bg-accent-danger/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {renderPanelInhalt(aktivesPanel)}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Mobile Bottom Sheet */}
      <BottomSheet
        open={!!aktivesPanel && !isDesktop}
        onClose={() => setAktivesPanel(null)}
        title={aktivesPanel ? panelTitel[aktivesPanel] : ""}
      >
        {aktivesPanel && !isDesktop && renderPanelInhalt(aktivesPanel)}
      </BottomSheet>

      {/* ── Desktop Layout ──────────────────────────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[320px_1fr] lg:gap-6">

        {/* Linke Spalte: Profilkarte */}
        <motion.div
          initial={reduced ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-2">

            {/* Gradient top strip */}
            <div className="h-20 bg-gradient-to-br from-primary-500/20 via-secondary-500/10 to-transparent" />

            {/* Avatar + Name + E-Mail */}
            <div className="-mt-10 flex items-end gap-4 px-5 pb-4">
              <AvatarBlock gross />
              <div className="flex-1 min-w-0 pb-1">
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
                    <button onClick={handleNameSpeichern} className="p-1.5 rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors">
                      <Check size={15} />
                    </button>
                    <button onClick={() => { setNameBearbeiten(false); setDisplayName(nameRaw); }} className="p-1.5 rounded-card-sm bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary hover:bg-light-border dark:hover:bg-dark-border transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold truncate bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
                      {displayName}
                    </h2>
                    <button onClick={() => setNameBearbeiten(true)} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors shrink-0">
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                {nameSpeichernStatus === "ok" && <p className="text-[11px] text-accent-success mt-0.5">Gespeichert</p>}
                {nameSpeichernStatus === "fehler" && <p className="text-[11px] text-accent-danger mt-0.5">Fehler beim Speichern</p>}
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{email}</p>
              </div>
              <StatusBadge label={isHouseholdAdmin ? "Admin" : "Mitglied"} farbe={isHouseholdAdmin ? "primary" : "gray"} />
            </div>

            {/* Status-Chips */}
            <div className="grid grid-cols-2 gap-px border-t border-light-border dark:border-dark-border bg-light-border dark:bg-dark-border">
              {[
                { label: t("profile:chips.appMode"), badge: modusStatus, icon: <Layers size={11} /> },
                { label: t("profile:chips.push"),    badge: pushStatus,   icon: <Bell size={11} /> },
                { label: t("profile:chips.ai"),      badge: kiStatus,     icon: <Cpu size={11} /> },
                { label: t("profile:chips.household"), badge: { label: mitgliederLabel, farbe: "primary" }, icon: <Users size={11} /> },
              ].map(({ label, badge, icon }) => (
                <div key={label} className="bg-light-card dark:bg-canvas-2 px-3 py-2.5">
                  <p className="flex items-center gap-1 text-[10px] text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    {icon} {label}
                  </p>
                  <StatusBadge label={badge.label} farbe={badge.farbe} />
                </div>
              ))}
            </div>
          </div>

            {/* Quick Actions */}
            <div className="space-y-1.5 pt-1 border-t border-light-border dark:border-dark-border">
              {[
                { key: "haushalt", icon: <Building2 size={14} />, label: t("profile:sidebar.manageHousehold"),    farbe: "secondary", show: true },
                { key: "einladen", icon: <UserPlus size={14} />,  label: t("profile:sidebar.inviteMember"),       farbe: "emerald",   show: isHouseholdAdmin },
                { key: "ki",       icon: <Cpu size={14} />,       label: t("profile:sidebar.configureAI"),        farbe: "primary",   show: true },
                { key: "push",     icon: <Bell size={14} />,      label: t("profile:sidebar.pushNotifications"),  farbe: "amber",     show: true },
              ].filter((a) => a.show).map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAktivesPanel(a.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-card-sm
                             border border-light-border dark:border-dark-border
                             text-light-text-main dark:text-dark-text-main
                             hover:border-primary-500/30 hover:bg-primary-500/5 transition-colors text-sm"
                >
                  <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[8px] ${iconBgMap[a.farbe] ?? iconBgMap.secondary}`}>
                    {a.icon}
                  </div>
                  <span className="flex-1 text-left">{a.label}</span>
                  <ChevronRight size={13} className="text-light-text-secondary dark:text-dark-text-secondary" />
                </button>
              ))}
            </div>
        </motion.div>

        {/* Rechte Hauptfläche: Modul-Grid */}
        <motion.div
          initial={reduced ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
          className="space-y-6"
        >

          {/* Gruppe: Persönlich */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.15 }}
          >
            <GruppenLabel>{t("profile:groups.personal")}</GruppenLabel>
            <div className="grid grid-cols-2 gap-3">
              <ModulKarte
                icon={<Sun size={16} />}
                titel={t("profile:cards.appearance.title")}
                status={theme === "dark" ? t("common:theme.dark") : t("common:theme.light")}
                statusFarbe="gray"
                beschreibung={t("profile:cards.appearance.desc")}
                aktionLabel={t("profile:cards.appearance.action")}
                onAktion={() => setAktivesPanel("erscheinungsbild")}
                iconFarbe="amber"
              />
              {isHouseholdAdmin && (
                <ModulKarte
                  icon={<Layers size={16} />}
                  titel={t("profile:cards.appMode.title")}
                  status={modusStatus.label}
                  statusFarbe={modusStatus.farbe}
                  beschreibung={t("profile:cards.appMode.desc")}
                  aktionLabel={t("profile:cards.appMode.action")}
                  onAktion={() => setAktivesPanel("app-modus")}
                  iconFarbe="primary"
                />
              )}
              <ModulKarte
                icon={<Smartphone size={16} />}
                titel={t("profile:cards.mobileNav.title")}
                beschreibung={t("profile:cards.mobileNav.desc")}
                aktionLabel={t("profile:cards.mobileNav.action")}
                onAktion={() => setAktivesPanel("mobile-nav")}
                iconFarbe="secondary"
              />
              <ModulKarte
                icon={<RotateCcw size={16} />}
                titel={t("profile:cards.tours.title")}
                status={tourState?.intro_opt_in === true ? t("common:status.active") : tourState?.intro_opt_in === false ? t("common:status.inactive") : "–"}
                statusFarbe={tourState?.intro_opt_in === true ? "emerald" : "gray"}
                beschreibung={t("profile:cards.tours.desc")}
                aktionLabel={t("profile:cards.tours.action")}
                onAktion={() => setAktivesPanel("touren")}
                iconFarbe="emerald"
              />
            </div>
          </motion.div>

          {/* Gruppe: Haushalt */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.22 }}
          >
            <GruppenLabel>{t("profile:groups.household")}</GruppenLabel>
            <div className="grid grid-cols-2 gap-3">
              <ModulKarte
                icon={<Users size={16} />}
                titel={t("profile:cards.household.title")}
                status={mitgliederLabel}
                statusFarbe="primary"
                beschreibung={t("profile:cards.household.desc")}
                aktionLabel={t("profile:cards.household.action")}
                onAktion={() => setAktivesPanel("haushalt")}
                iconFarbe="secondary"
              />
              {isHouseholdAdmin && (
                <ModulKarte
                  icon={<UserPlus size={16} />}
                  titel={t("profile:cards.invite.title")}
                  beschreibung={t("profile:cards.invite.desc")}
                  aktionLabel={t("profile:cards.invite.action")}
                  onAktion={() => setAktivesPanel("einladen")}
                  iconFarbe="emerald"
                />
              )}
            </div>
          </motion.div>

          {/* Gruppe: Intelligenz & Analyse */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.29 }}
          >
            <GruppenLabel>{t("profile:groups.intelligence")}</GruppenLabel>
            <div className="grid grid-cols-2 gap-3">
              <ModulKarte
                icon={<Cpu size={16} />}
                titel={t("profile:cards.ai.title")}
                status={kiStatus.label}
                statusFarbe={kiStatus.farbe}
                beschreibung={isHouseholdAdmin ? t("profile:cards.ai.descAdmin") : t("profile:cards.ai.descMember")}
                aktionLabel={t("profile:cards.ai.action")}
                onAktion={() => setAktivesPanel("ki")}
                iconFarbe="primary"
              />
              {isHouseholdAdmin && (
                <ModulKarte
                  icon={<Camera size={16} />}
                  titel={t("profile:cards.imageAnalysis.title")}
                  status={bildanalyseLabel}
                  statusFarbe="gray"
                  beschreibung={t("profile:cards.imageAnalysis.desc")}
                  aktionLabel={t("profile:cards.imageAnalysis.action")}
                  onAktion={() => setAktivesPanel("bildanalyse")}
                  iconFarbe="secondary"
                />
              )}
              {isHouseholdAdmin && (
                <ModulKarte
                  icon={<BookOpen size={16} />}
                  titel={t("profile:cards.kochbuch.title")}
                  status={t("profile:cards.kochbuch.statusVideo", { count: kochbuchVideoLimit })}
                  statusFarbe="amber"
                  beschreibung={t("profile:cards.kochbuch.desc")}
                  aktionLabel={t("profile:cards.kochbuch.action")}
                  onAktion={() => setAktivesPanel("kochbuch")}
                  iconFarbe="amber"
                />
              )}
            </div>
          </motion.div>

          {/* Gruppe: Benachrichtigungen & Sicherheit */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.36 }}
          >
            <GruppenLabel>{t("profile:groups.notifications")}</GruppenLabel>
            <div className="grid grid-cols-2 gap-3">
              <ModulKarte
                icon={<Bell size={16} />}
                titel={t("profile:cards.push.title")}
                status={pushStatus.label}
                statusFarbe={pushStatus.farbe}
                beschreibung={t("profile:cards.push.desc")}
                aktionLabel={pushAktiv ? t("profile:cards.push.actionManage") : t("profile:cards.push.actionActivate")}
                onAktion={() => setAktivesPanel("push")}
                iconFarbe="primary"
              />
              <ModulKarte
                icon={<Shield size={16} />}
                titel={t("profile:cards.account.title")}
                beschreibung={t("profile:cards.account.desc")}
                aktionLabel={t("profile:cards.account.action")}
                onAktion={() => setAktivesPanel("account")}
                iconFarbe="red"
              />
            </div>
          </motion.div>

        </motion.div>
      </div>

      {/* ── Mobile Layout ────────────────────────────────────────────────────── */}
      <div className="lg:hidden space-y-4">

        {/* Profilkopf */}
        <div className="overflow-hidden rounded-card border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-2">
          <div className="h-14 bg-gradient-to-br from-primary-500/20 via-secondary-500/10 to-transparent" />
          <div className="-mt-7 flex items-end gap-3 px-4 pb-4">
            <AvatarBlock />
            <div className="flex-1 min-w-0 pb-0.5">
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
                  <button onClick={handleNameSpeichern} className="p-1.5 rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors">
                    <Check size={15} />
                  </button>
                  <button onClick={() => { setNameBearbeiten(false); setDisplayName(nameRaw); }} className="p-1.5 rounded-card-sm text-light-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold truncate bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
                    {displayName}
                  </h2>
                  <button onClick={() => setNameBearbeiten(true)} className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-colors shrink-0">
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              {nameSpeichernStatus === "ok" && <p className="text-[11px] text-accent-success">Gespeichert</p>}
              {nameSpeichernStatus === "fehler" && <p className="text-[11px] text-accent-danger">Fehler</p>}
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{email}</p>
            </div>
            <StatusBadge label={isHouseholdAdmin ? "Admin" : "Mitglied"} farbe={isHouseholdAdmin ? "primary" : "gray"} />
          </div>

          {/* Status-Chips Mobile */}
          <div className="flex flex-wrap gap-1.5 border-t border-light-border dark:border-dark-border px-4 py-2.5">
            <StatusBadge label={modusStatus.label} farbe={modusStatus.farbe} />
            <StatusBadge label={pushStatus.label} farbe={pushStatus.farbe} />
            <StatusBadge label={kiStatus.label} farbe={kiStatus.farbe} />
            <StatusBadge label={mitgliederLabel} farbe="primary" />
          </div>
        </div>

        {/* Quick-Actions Strip */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          {[
            { key: "haushalt", icon: <Building2 size={15} />, label: t("profile:mobileQuickActions.household"), farbe: "secondary" },
            { key: "ki",       icon: <Cpu size={15} />,       label: t("profile:mobileQuickActions.ai"),       farbe: "primary" },
            { key: "push",     icon: <Bell size={15} />,      label: t("profile:mobileQuickActions.push"),     farbe: "amber" },
            ...(isHouseholdAdmin ? [{ key: "einladen", icon: <UserPlus size={15} />, label: t("profile:mobileQuickActions.invite"), farbe: "emerald" }] : []),
            { key: "account",  icon: <Shield size={15} />,    label: t("profile:mobileQuickActions.security"), farbe: "red" },
          ].map((a) => (
            <motion.button
              key={a.key}
              onClick={() => setAktivesPanel(a.key)}
              whileTap={reduced ? {} : { scale: 0.95 }}
              className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-card-sm shrink-0
                         bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:border-primary-500/30 hover:text-primary-500 transition-colors shadow-elevation-2"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-card-sm ${iconBgMap[a.farbe] ?? iconBgMap.secondary}`}>
                {a.icon}
              </div>
              <span className="text-[11px] font-medium whitespace-nowrap">{a.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Segment-Tabs */}
        <div className="flex rounded-card-sm border border-light-border dark:border-dark-border overflow-hidden bg-light-surface-1 dark:bg-canvas-3 p-0.5 gap-0.5">
          {[
            { id: "allgemein",  label: t("profile:mobileTabs.general") },
            { id: "haushalt",   label: t("profile:mobileTabs.household") },
            { id: "ki",         label: t("profile:mobileTabs.ai") },
            { id: "sicherheit", label: t("profile:mobileTabs.security") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobilTab(tab.id)}
              className={`flex-1 text-xs font-medium py-2 rounded-[10px] transition-colors
                          ${mobilTab === tab.id
                            ? "bg-light-card-bg dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main shadow-elevation-1"
                            : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
                          }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab-Inhalte als Karten-Liste */}
        <div className="space-y-2">
          {mobilTab === "allgemein" && <>
            <ModulKarte
              icon={<Sun size={16} />}
              titel={t("profile:cards.appearance.title")}
              status={theme === "dark" ? t("common:theme.dark") : t("common:theme.light")}
              statusFarbe="gray"
              beschreibung={t("profile:cards.appearance.descMobile")}
              aktionLabel={t("profile:cards.appearance.action")}
              onAktion={() => setAktivesPanel("erscheinungsbild")}
              iconFarbe="amber"
            />
            {isHouseholdAdmin && (
              <ModulKarte
                icon={<Layers size={16} />}
                titel={t("profile:cards.appMode.title")}
                status={modusStatus.label}
                statusFarbe={modusStatus.farbe}
                beschreibung={t("profile:cards.appMode.descMobile")}
                aktionLabel={t("profile:cards.appMode.action")}
                onAktion={() => setAktivesPanel("app-modus")}
                iconFarbe="primary"
              />
            )}
            <ModulKarte
              icon={<Smartphone size={16} />}
              titel={t("profile:cards.mobileNav.title")}
              beschreibung={t("profile:cards.mobileNav.desc")}
              aktionLabel={t("profile:cards.mobileNav.action")}
              onAktion={() => setAktivesPanel("mobile-nav")}
              iconFarbe="secondary"
            />
            <ModulKarte
              icon={<RotateCcw size={16} />}
              titel={t("profile:cards.tours.title")}
              status={tourState?.intro_opt_in === true ? t("common:status.active") : tourState?.intro_opt_in === false ? t("common:status.inactive") : "–"}
              statusFarbe={tourState?.intro_opt_in === true ? "emerald" : "gray"}
              beschreibung={t("profile:cards.tours.descMobile")}
              aktionLabel={t("profile:cards.tours.action")}
              onAktion={() => setAktivesPanel("touren")}
              iconFarbe="emerald"
            />
          </>}

          {mobilTab === "haushalt" && <>
            <ModulKarte
              icon={<Users size={16} />}
              titel={t("profile:cards.household.title")}
              status={mitgliederLabel}
              statusFarbe="primary"
              beschreibung={t("profile:cards.household.desc")}
              aktionLabel={t("profile:cards.household.action")}
              onAktion={() => setAktivesPanel("haushalt")}
              iconFarbe="secondary"
            />
            {isHouseholdAdmin && (
              <ModulKarte
                icon={<UserPlus size={16} />}
                titel={t("profile:cards.invite.title")}
                beschreibung={t("profile:cards.invite.desc")}
                aktionLabel={t("profile:cards.invite.action")}
                onAktion={() => setAktivesPanel("einladen")}
                iconFarbe="emerald"
              />
            )}
          </>}

          {mobilTab === "ki" && <>
            <ModulKarte
              icon={<Cpu size={16} />}
              titel={t("profile:cards.ai.title")}
              status={kiStatus.label}
              statusFarbe={kiStatus.farbe}
              beschreibung={isHouseholdAdmin ? t("profile:cards.ai.descAdmin") : t("profile:cards.ai.descMember")}
              aktionLabel={t("profile:cards.ai.action")}
              onAktion={() => setAktivesPanel("ki")}
              iconFarbe="primary"
            />
            {isHouseholdAdmin && (
              <ModulKarte
                icon={<Camera size={16} />}
                titel={t("profile:cards.imageAnalysis.title")}
                status={bildanalyseLabel}
                statusFarbe="gray"
                beschreibung={t("profile:cards.imageAnalysis.descMobile")}
                aktionLabel={t("profile:cards.imageAnalysis.action")}
                onAktion={() => setAktivesPanel("bildanalyse")}
                iconFarbe="secondary"
              />
            )}
            {isHouseholdAdmin && (
              <ModulKarte
                icon={<BookOpen size={16} />}
                titel={t("profile:cards.kochbuch.title")}
                status={t("profile:cards.kochbuch.statusVideo", { count: kochbuchVideoLimit })}
                statusFarbe="amber"
                beschreibung={t("profile:cards.kochbuch.desc")}
                aktionLabel={t("profile:cards.kochbuch.action")}
                onAktion={() => setAktivesPanel("kochbuch")}
                iconFarbe="amber"
              />
            )}
          </>}

          {mobilTab === "sicherheit" && <>
            <ModulKarte
              icon={<Bell size={16} />}
              titel={t("profile:cards.push.title")}
              status={pushStatus.label}
              statusFarbe={pushStatus.farbe}
              beschreibung={t("profile:cards.push.descMobile")}
              aktionLabel={pushAktiv ? t("profile:cards.push.actionManage") : t("profile:cards.push.actionActivate")}
              onAktion={() => setAktivesPanel("push")}
              iconFarbe="primary"
            />
            <ModulKarte
              icon={<Shield size={16} />}
              titel={t("profile:cards.account.title")}
              beschreibung={t("profile:cards.account.desc")}
              aktionLabel={t("profile:cards.account.action")}
              onAktion={() => setAktivesPanel("account")}
              iconFarbe="red"
            />
          </>}
        </div>

      </div>

    </div>
  );
};

export default UserProfile;
