import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Eye, EyeOff, Save, Truck, Home, CheckCircle, AlertCircle,
  RotateCcw, Bell, BellOff, BellRing, Cpu, Wifi, WifiOff,
  ChevronDown, Camera, Pencil, Check, X, KeyRound, Shield, Layers, Sun, Copy, UserPlus,
  Users, Crown, Smartphone,
} from "lucide-react";
import {
  MOBILE_NAV_REGISTRY, DEFAULT_MOBILE_FAVORITES,
  sanitizeMobileNavFavorites, MOBILE_NAV_FAVORITE_COUNT,
} from "../config/mobileNavConfig";
import { supabase } from "../supabaseClient";
import { useTheme } from "../contexts/ThemeContext";
import { alleToursZuruecksetzen } from "./home/tour/useTour";
import { useAppMode } from "../contexts/AppModeContext";
import ThemeSwitch from "./ThemeSwitch";
import usePushSubscription from "../hooks/usePushSubscription";

// â"€â"€ Akkordeon-Helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ Haupt-Komponente â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const UserProfile = ({ session, householdContext, mobileNavFavorites, onMobileNavChange }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme } = useTheme();
  const {
    appMode, switchToHome, switchToUmzug,
    deaktiviereUmzug, aktiviereUmzug,
  } = useAppMode();

  const userId   = session?.user?.id;
  const email    = session?.user?.email || "";
  const nameRaw  = session?.user?.user_metadata?.full_name || email.split("@")[0] || "Nutzer";
  const initiale = nameRaw.charAt(0).toUpperCase();
  const isHouseholdAdmin = householdContext?.is_admin === true;

  // â"€â"€ Basis-States â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // KI-Status für Nicht-Admin-Mitglieder
  const [memberKiStatus, setMemberKiStatus] = useState(null); // { ki_provider, ki_konfiguriert, bildanalyse_modus, bildanalyse_key_gesetzt }

  // Bildanalyse
  const [bildanalyseModus,         setBildanalyseModus]         = useState("chatgpt_vision");
  const [bildanalyseOpenaiKey,     setBildanalyseOpenaiKey]     = useState("");
  const [bildanalyseOpenaiKeySet,  setBildanalyseOpenaiKeySet]  = useState(false);
  const [loescheOpenaiKey,         setLoescheOpenaiKey]         = useState(false);
  const [bildanalyseStatus,        setBildanalyseStatus]        = useState(null);
  const [ollamaVisionModel,        setOllamaVisionModel]        = useState("");

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
  const [inviteEmail,          setInviteEmail]          = useState("");
  const [inviteLink,           setInviteLink]           = useState("");
  const [inviteStatus,         setInviteStatus]         = useState(null); // null | ok | copied | fehler
  const [inviteFehler,         setInviteFehler]         = useState("");
  const [inviteLadend,         setInviteLadend]         = useState(false);
  const [inviteMailStatus,     setInviteMailStatus]     = useState(null); // null | sending | sent | failed
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
  const [navEdit,          setNavEdit]          = useState(null);  // null = noch nicht initialisiert
  const [navSaveStatus,    setNavSaveStatus]     = useState(null);
  const [navPickerModus,   setNavPickerModus]    = useState(null);  // "home"|"umzug" wenn Picker offen
  const [navPickerSlotIdx, setNavPickerSlotIdx]  = useState(null);  // welcher Slot ersetzt wird
  const [navSektionOffen,  setNavSektionOffen]   = useState(false);

  // â"€â"€ Daten aus Supabase laden â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // Bildanalyse-Einstellungen: nur für Admins (mit household_id-Filter)
  useEffect(() => {
    if (!userId || !isHouseholdAdmin || !householdContext?.household_id) return;
    supabase
      .from("household_settings")
      .select("bildanalyse_modus, bildanalyse_openai_key_set, ollama_vision_model")
      .eq("household_id", householdContext.household_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.bildanalyse_modus) setBildanalyseModus(data.bildanalyse_modus);
        if (data?.bildanalyse_openai_key_set !== undefined) setBildanalyseOpenaiKeySet(!!data.bildanalyse_openai_key_set);
        if (data?.ollama_vision_model) setOllamaVisionModel(data.ollama_vision_model);
      });
  }, [userId, isHouseholdAdmin, householdContext?.household_id]);

  // KI-Status für Nicht-Admin-Mitglieder via sicherem RPC
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
        setHaushaltUebersichtFehler("Haushaltsuebersicht nicht verfuegbar - Migration ausfuehren.");
      } finally {
        if (!cancelled) setHaushaltUebersichtLadend(false);
      }
    };

    ladeHaushaltUebersicht();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Mobile Navigation: navEdit aus App.js-State initialisieren (nur einmal)
  useEffect(() => {
    if (navEdit === null && mobileNavFavorites) {
      setNavEdit(sanitizeMobileNavFavorites(mobileNavFavorites));
    }
  }, [mobileNavFavorites, navEdit]);

  // Mobile Navigation: Sektion auto-öffnen wenn per location.state angefragt
  useEffect(() => {
    if (location.state?.openSection === "mobile-nav") {
      setNavSektionOffen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // â"€â"€ Handler â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
    alleToursZuruecksetzen();
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

  // ── Mobile Navigation Handler ────────────────────────────────────────────────

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

  // â"€â"€ Eingabe-Klassen (wiederverwendbar) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const inputCls = `w-full px-3 py-2.5 text-sm rounded-card-sm
    bg-light-bg dark:bg-canvas-1
    border border-light-border dark:border-dark-border
    text-light-text-main dark:text-dark-text-main
    placeholder-light-text-secondary dark:placeholder-dark-text-secondary
    focus:outline-none focus:ring-2 focus:ring-secondary-500`;

  // â"€â"€ Render â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-8 space-y-3">

      {/* â"€â"€ Header: Avatar + Name + E-Mail â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      {/* â"€â"€ Erscheinungsbild â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      <AkkordeonSektion title="Haushalt & Bewohner" icon={<Users size={16} />} defaultOpen={true}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              {householdContext?.household_name ? `Haushalt: ${householdContext.household_name}` : "Dein Haushalt"}
            </div>
            <button
              onClick={() => navigate("/home/bewohner")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                         border border-secondary-500/30 text-secondary-500 hover:bg-secondary-500/10 transition-colors"
            >
              <Users size={13} /> Bewohner verwalten
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-pill bg-primary-500/10 text-primary-500 border border-primary-500/30">
              Haushaltsmitglieder: {haushaltMitglieder.length}
            </span>
            <span className="px-2 py-1 rounded-pill bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
              Bewohner-Eintraege: {bewohnerAnzahl}
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
                        <img src={mitglied.avatar_url} alt={mitglied.display_name || "Profilbild"} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary-500 text-white text-xs font-semibold flex items-center justify-center">
                          {initial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">
                          {mitglied.display_name || "Mitglied"} {mitglied.is_current_user ? "(Du)" : ""}
                        </p>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                          {mitglied.email || "Keine E-Mail"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {mitglied.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[11px] font-medium bg-secondary-500/10 text-secondary-500 border border-secondary-500/30">
                          <Crown size={11} /> Admin
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-pill text-[11px] font-medium bg-light-bg dark:bg-canvas-2 text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
                          Mitglied
                        </span>
                      )}
                      {isHouseholdAdmin && !mitglied.is_current_user && (
                        <button
                          onClick={() => setMitgliedZuEntfernen(mitglied)}
                          className="ml-1 p-1.5 rounded-card-sm text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Mitglied entfernen"
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
      </AkkordeonSektion>

      {/* Bestätigungs-Modal: Mitglied entfernen */}
      {mitgliedZuEntfernen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-4 p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
              Mitglied entfernen
            </h3>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              <strong>{mitgliedZuEntfernen.display_name || mitgliedZuEntfernen.email}</strong> wird sofort aus dem Haushalt entfernt und verliert den Zugriff.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMitgliedZuEntfernen(null)}
                disabled={entfernenLadend}
                className="px-4 py-2 rounded-pill text-sm font-medium border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-surface-1 dark:hover:bg-canvas-3 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleMitgliedEntfernen}
                disabled={entfernenLadend}
                className="px-4 py-2 rounded-pill text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                {entfernenLadend ? "Wird entfernt…" : "Entfernen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isHouseholdAdmin ? (
      <>
      {/* â"€â"€ App-Modus â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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
              Umzug abgeschlossen? Den Umzugsplaner dauerhaft deaktivieren –
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

      {/* â"€â"€ KI-Einstellungen â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <AkkordeonSektion title="Haushaltsmitglieder einladen" icon={<UserPlus size={16} />}>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
          Lade neue Personen per E-Mail ein. Sie koennen auch ohne bestehenden Account beitreten:
          Link oeffnen, registrieren/anmelden und Einladung wird direkt angenommen.
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
            {inviteLadend ? "Erstelle..." : "Einladung erstellen"}
          </button>
        </div>

        {inviteLink && (
          <div className="mt-3 p-3 rounded-card-sm border border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
              Einladungslink
            </p>
            <p className="text-xs break-all text-light-text-main dark:text-dark-text-main">
              {inviteLink}
            </p>
            <button
              onClick={handleInviteLinkKopieren}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium
                         border border-primary-500/30 text-primary-500 hover:bg-primary-500/10 transition-colors"
            >
              <Copy size={13} /> Link kopieren
            </button>
          </div>
        )}

        {inviteStatus === "ok" && (
          <p className="mt-2 text-xs text-accent-success flex items-center gap-1">
            <CheckCircle size={13} /> Einladung erstellt.
          </p>
        )}
        {inviteStatus === "copied" && (
          <p className="mt-2 text-xs text-accent-success flex items-center gap-1">
            <CheckCircle size={13} /> Link kopiert.
          </p>
        )}
        {inviteStatus === "fehler" && (
          <p className="mt-2 text-xs text-accent-danger flex items-center gap-1">
            <AlertCircle size={13} /> {inviteFehler || "Fehler beim Erstellen der Einladung."}
          </p>
        )}
        {inviteMailStatus === "sending" && (
          <p className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Einladungs-Mail wird versendet...
          </p>
        )}
        {inviteMailStatus === "sent" && (
          <p className="mt-2 text-xs text-accent-success flex items-center gap-1">
            <CheckCircle size={13} /> {inviteMailHinweis}
          </p>
        )}
        {inviteMailStatus === "failed" && (
          <p className="mt-2 text-xs text-accent-danger flex items-center gap-1">
            <AlertCircle size={13} /> {inviteMailHinweis}
          </p>
        )}
      </AkkordeonSektion>

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

      {/* -- Bildanalyse / Dokumentenerkennung -------------------------------- */}
      <AkkordeonSektion title="Bildanalyse / Dokumentenerkennung" icon={<Camera size={16} />}>
        {ladend ? (
          <div className="h-20 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Waehle den Modus fuer die KI-gestuetzte Rechnungserkennung. Diese Einstellung gilt fuer den gesamten Haushalt.
            </p>

            {/* Modus-Auswahl */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "chatgpt_vision", label: "ChatGPT Vision",  desc: "GPT-4o analysiert das Bild direkt" },
                { id: "ocr_regeln",     label: "OCR + Regeln",    desc: "Textextraktion, kein API-Key noetig" },
                { id: "ocr_ollama",     label: "OCR + Ollama",    desc: "OCR-Text wird an Ollama uebergeben" },
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

            {/* OpenAI API-Key fuer Bildanalyse (nur wenn Modus = chatgpt_vision) */}
            {bildanalyseModus === "chatgpt_vision" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                  OpenAI API-Key (Bildanalyse)
                </p>
                {bildanalyseOpenaiKeySet && (
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-accent-success flex items-center gap-1.5">
                      <CheckCircle size={13} /> Key gesetzt: <span className="font-mono">***</span>
                    </p>
                    <button
                      onClick={handleOpenaiKeyLoeschen}
                      disabled={loescheOpenaiKey}
                      className="text-xs text-accent-danger hover:underline disabled:opacity-50"
                    >
                      {loescheOpenaiKey ? "…" : "Key löschen"}
                    </button>
                  </div>
                )}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={bildanalyseOpenaiKey}
                  onChange={(e) => setBildanalyseOpenaiKey(e.target.value)}
                  placeholder={bildanalyseOpenaiKeySet ? "Neuen Key eingeben um zu ersetzen" : "sk-..."}
                  className={`w-full px-3 py-2.5 rounded-card-sm border text-sm
                              bg-light-surface-1 dark:bg-canvas-2
                              border-light-border dark:border-dark-border
                              text-light-text-main dark:text-dark-text-main
                              placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                              focus:outline-none focus:border-secondary-500 transition-colors`}
                />
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Unabhaengig von den KI-Einstellungen. Wird nur fuer die Rechnungsanalyse verwendet.
                </p>
              </div>
            )}

            {/* Ollama Vision-Modell (nur wenn Modus = ocr_ollama) */}
            {bildanalyseModus === "ocr_ollama" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                  Ollama Vision-Modell
                </p>
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
                  Separates Modell fuer die Bildanalyse (muss Vision-Faehigkeiten haben). Leer lassen um das Standard-KI-Modell zu verwenden.
                </p>
              </div>
            )}

            {/* Speichern */}
            <button
              onClick={handleBildanalyseSpeichern}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                         bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
            >
              {bildanalyseStatus === "ok" ? (
                <><CheckCircle size={15} /> Gespeichert</>
              ) : bildanalyseStatus === "fehler" ? (
                <><AlertCircle size={15} /> Fehler</>
              ) : (
                <><Save size={15} /> Einstellungen speichern</>
              )}
            </button>
          </div>
        )}
      </AkkordeonSektion>
      </>
      ) : (
      <AkkordeonSektion title="KI-Status" icon={<Cpu size={16} />}>
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Die KI-Konfiguration wird vom Haushalts-Admin verwaltet. Du siehst hier den aktuellen Status.
        </p>
        {memberKiStatus ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-light-border dark:border-dark-border">
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">KI verfügbar</span>
              {memberKiStatus.ki_konfiguriert ? (
                <span className="flex items-center gap-1.5 text-sm text-accent-success">
                  <CheckCircle size={14} /> Ja
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-accent-danger">
                  <AlertCircle size={14} /> Nicht konfiguriert
                </span>
              )}
            </div>
            <div className="flex items-center justify-between py-2 border-b border-light-border dark:border-dark-border">
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Provider</span>
              <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main capitalize">
                {memberKiStatus.ki_provider || "–"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Bildanalyse</span>
              {memberKiStatus.bildanalyse_key_gesetzt ? (
                <span className="flex items-center gap-1.5 text-sm text-accent-success">
                  <CheckCircle size={14} /> Konfiguriert
                </span>
              ) : (
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Nicht konfiguriert</span>
              )}
            </div>
          </div>
        ) : (
          <div className="h-16 bg-light-surface-1 dark:bg-canvas-3 rounded-card-sm animate-pulse" />
        )}
      </AkkordeonSektion>
      )}

      {/* â"€â"€ Push-Benachrichtigungen â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      {/* â"€â"€ Interaktive Anleitungen â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      {/* ── Mobile Navigation ─────────────────────────────────────────────────── */}
      <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 overflow-hidden">
        <button
          onClick={() => setNavSektionOffen(!navSektionOffen)}
          className="w-full flex items-center justify-between px-5 py-4
                     text-light-text-main dark:text-dark-text-main"
        >
          <div className="flex items-center gap-3">
            <span className="text-secondary-500 shrink-0"><Smartphone size={16} /></span>
            <span className="text-sm font-semibold">Mobile Navigation</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-light-text-secondary dark:text-dark-text-secondary
                        transition-transform duration-200 ${navSektionOffen ? "rotate-180" : ""}`}
          />
        </button>

        {navSektionOffen && (
          <div className="px-5 pb-5 border-t border-light-border dark:border-dark-border pt-4 space-y-5">
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Passe die {MOBILE_NAV_FAVORITE_COUNT} mittleren Slots der mobilen Navigationsleiste an.
              Der erste (Home/Dashboard) und letzte Slot (Mehr) sind fest.
            </p>

            {navEdit && ["home", "umzug"].map((mode) => (
              <div key={mode} className="space-y-2">
                <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
                  {mode === "home" ? "Home Organizer" : "Umzugsplaner"}
                </p>

                <div className="space-y-1.5">
                  {navEdit[mode].map((key, idx) => {
                    const item = MOBILE_NAV_REGISTRY[mode].find((i) => i.key === key);
                    if (!item) return null;
                    const Icon = item.icon;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 px-3 py-2 rounded-card-sm
                                   border border-light-border dark:border-dark-border
                                   bg-light-surface-1 dark:bg-canvas-3"
                      >
                        <Icon size={15} className="text-primary-500 shrink-0" />
                        <span className="text-sm text-light-text-main dark:text-dark-text-main flex-1">
                          {item.label}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleNavFavoritVerschieben(mode, idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary
                                       hover:text-light-text-main dark:hover:text-dark-text-main
                                       disabled:opacity-30 transition-colors"
                            title="Nach oben"
                          >↑</button>
                          <button
                            onClick={() => handleNavFavoritVerschieben(mode, idx, 1)}
                            disabled={idx === navEdit[mode].length - 1}
                            className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary
                                       hover:text-light-text-main dark:hover:text-dark-text-main
                                       disabled:opacity-30 transition-colors"
                            title="Nach unten"
                          >↓</button>
                          <button
                            onClick={() => { setNavPickerModus(mode); setNavPickerSlotIdx(idx); }}
                            className="px-2 py-0.5 rounded-pill text-xs border border-primary-500/30
                                       text-primary-500 hover:bg-primary-500/10 transition-colors"
                          >
                            Ersetzen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {navPickerModus === mode && navPickerSlotIdx !== null && (
                  <div className="mt-2 p-3 rounded-card-sm border border-secondary-500/30 bg-secondary-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-secondary-500">Modul wählen:</p>
                      <button
                        onClick={() => { setNavPickerModus(null); setNavPickerSlotIdx(null); }}
                        className="text-xs text-light-text-secondary dark:text-dark-text-secondary
                                   hover:text-light-text-main dark:hover:text-dark-text-main"
                      >
                        Abbrechen
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
                  className="text-xs text-light-text-secondary dark:text-dark-text-secondary
                             hover:text-light-text-main dark:hover:text-dark-text-main
                             underline underline-offset-2 transition-colors"
                >
                  Auf Standard zurücksetzen
                </button>
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2 border-t border-light-border dark:border-dark-border">
              <button
                onClick={handleNavSpeichern}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-pill text-sm font-medium
                           bg-primary-500 hover:bg-primary-600 text-white transition-colors"
              >
                {navSaveStatus === "ok" ? (
                  <><CheckCircle size={15} /> Gespeichert</>
                ) : navSaveStatus === "fehler" ? (
                  <><AlertCircle size={15} /> Fehler</>
                ) : (
                  <><Save size={15} /> Speichern</>
                )}
              </button>
              {navSaveStatus === "ok" && (
                <p className="text-xs text-accent-success">Bottombar aktualisiert</p>
              )}
              {navSaveStatus === "fehler" && (
                <p className="text-xs text-accent-danger">Fehler beim Speichern</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* â"€â"€ Account & Sicherheit â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

