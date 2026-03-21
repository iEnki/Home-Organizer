import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2, Crown, Clock, Check, X,
  Home, LogOut, AlertTriangle, Mail, Copy, ExternalLink,
  Settings, Truck, Layers, Cpu, Eye, EyeOff, Save,
  CheckCircle, AlertCircle, Wifi, WifiOff,
} from "lucide-react";

import { supabase } from "../supabaseClient";
import { useHaushalt } from "../contexts/HaushaltContext";
import { useAppMode } from "../contexts/AppModeContext";

export default function HaushaltVerwaltung({ session }) {
  const navigate = useNavigate();
  const {
    haushalt, mitglieder, isAdmin, inHaushalt, geladen,
    haushaltErstellen, haushaltVerlassen, haushaltAufloesen,
    mitgliedEntfernen, nameAendern, ladeHaushalt,
    kiSettingsSpeichern, appModusSpeichern,
  } = useHaushalt();
  const { appMode, switchToHome, switchToUmzug } = useAppMode();

  const [nameEdit, setNameEdit]       = useState(false);
  const [neuerName, setNeuerName]     = useState("");
  const [einladEmail, setEinladEmail] = useState("");
  const [laedt, setLaedt]             = useState(false);
  const [meldung, setMeldung]         = useState(null); // { typ: 'ok'|'err', text }
  const [inviteLink, setInviteLink]   = useState(null);
  const [bestaetige, setBestaetige]   = useState(null); // 'verlassen'|'aufloesen'|mitgliedId
  const [neuerHaushaltName, setNeuerHaushaltName] = useState("Unser Haushalt");

  // Admin-Einstellungen: App-Modus
  const [modusStatus, setModusStatus] = useState(null);

  // Admin-Einstellungen: KI
  const [kiProvider,       setKiProvider]       = useState("openai");
  const [apiKey,           setApiKey]           = useState("");
  const [apiKeyVisible,    setApiKeyVisible]    = useState(false);
  const [ollamaUrl,        setOllamaUrl]        = useState("");
  const [ollamaModel,      setOllamaModel]      = useState("llama3.2");
  const [ollamaModelle,    setOllamaModelle]    = useState([]);
  const [ollamaTestStatus, setOllamaTestStatus] = useState(null);
  const [kiSpeichernStatus,setKiSpeichernStatus]= useState(null);

  const userId = session?.user?.id;

  // KI-Settings aus Haushalt laden wenn Admin
  useEffect(() => {
    if (!haushalt || !isAdmin) return;
    if (haushalt.ki_provider)     setKiProvider(haushalt.ki_provider);
    if (haushalt.openai_api_key)  setApiKey(haushalt.openai_api_key);
    if (haushalt.ollama_base_url) setOllamaUrl(haushalt.ollama_base_url);
    if (haushalt.ollama_model)    setOllamaModel(haushalt.ollama_model);
  }, [haushalt, isAdmin]);

  const zeigeMeldung = (typ, text) => {
    setMeldung({ typ, text });
    setTimeout(() => setMeldung(null), 5000);
  };

  // ── Haushalt erstellen ────────────────────────────────────────────────────────
  const handleErstellen = async () => {
    setLaedt(true);
    const { error } = await haushaltErstellen(neuerHaushaltName);
    setLaedt(false);
    if (error) zeigeMeldung("err", error);
    else zeigeMeldung("ok", "Haushalt erstellt!");
  };

  // ── Namen speichern ───────────────────────────────────────────────────────────
  const handleNameSpeichern = async () => {
    if (!neuerName.trim()) return;
    const { error } = await nameAendern(neuerName.trim());
    if (error) zeigeMeldung("err", error);
    else { setNameEdit(false); zeigeMeldung("ok", "Name gespeichert."); }
  };

  // ── Mitglied einladen ─────────────────────────────────────────────────────────
  const handleEinladen = async () => {
    if (!einladEmail.trim()) return;
    setLaedt(true);
    setInviteLink(null);

    const { data: { session: aktuell } } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/send-invite`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aktuell?.access_token}`,
        },
        body: JSON.stringify({
          haushalt_id: haushalt.id,
          email: einladEmail.trim(),
          app_url: window.location.origin,
        }),
      }
    );

    const data = await res.json();
    setLaedt(false);

    if (!res.ok) {
      zeigeMeldung("err", data.error ?? "Einladung fehlgeschlagen");
    } else {
      setEinladEmail("");
      if (data.email_gesendet) {
        zeigeMeldung("ok", `Einladung an ${einladEmail} gesendet.`);
      } else {
        setInviteLink(data.invite_link);
        zeigeMeldung("ok", "Kein SMTP konfiguriert — Link zum manuellen Teilen:");
      }
      ladeHaushalt();
    }
  };

  // ── Mitglied entfernen ────────────────────────────────────────────────────────
  const handleEntfernen = async (mitgliedId) => {
    setLaedt(true);
    const { error } = await mitgliedEntfernen(mitgliedId);
    setLaedt(false);
    if (error) zeigeMeldung("err", error);
    else zeigeMeldung("ok", "Mitglied entfernt.");
    setBestaetige(null);
  };

  // ── Haushalt verlassen ────────────────────────────────────────────────────────
  const handleVerlassen = async () => {
    setLaedt(true);
    const { error } = await haushaltVerlassen();
    setLaedt(false);
    if (error) zeigeMeldung("err", error);
    else zeigeMeldung("ok", "Du hast den Haushalt verlassen.");
    setBestaetige(null);
  };

  // ── Haushalt auflösen ─────────────────────────────────────────────────────────
  const handleAufloesen = async () => {
    setLaedt(true);
    const { error } = await haushaltAufloesen();
    setLaedt(false);
    if (error) zeigeMeldung("err", error);
    else zeigeMeldung("ok", "Haushalt wurde aufgelöst.");
    setBestaetige(null);
  };

  // ── Admin: App-Modus wechseln ─────────────────────────────────────────────────
  const handleModusWechsel = async (modus) => {
    setModusStatus(null);
    const { error } = await appModusSpeichern(modus);
    if (error) { zeigeMeldung("err", error); return; }
    modus === "home" ? switchToHome() : switchToUmzug();
    navigate(modus === "home" ? "/home" : "/dashboard");
    setModusStatus("ok");
    setTimeout(() => setModusStatus(null), 3000);
  };

  // ── Admin: KI-Settings speichern ─────────────────────────────────────────────
  const handleKiSpeichern = async () => {
    setKiSpeichernStatus(null);
    const { error } = await kiSettingsSpeichern({
      ki_provider:      kiProvider,
      openai_api_key:   apiKey.trim(),
      ollama_base_url:  ollamaUrl.trim(),
      ollama_model:     ollamaModel.trim(),
    });
    setKiSpeichernStatus(error ? "fehler" : "ok");
    setTimeout(() => setKiSpeichernStatus(null), 3000);
  };

  // ── Admin: Ollama-Verbindung testen ───────────────────────────────────────────
  const handleOllamaVerbindungTesten = async () => {
    if (!ollamaUrl.trim()) return;
    setOllamaTestStatus("testing");
    setOllamaModelle([]);
    try {
      const url      = ollamaUrl.trim().replace(/\/$/, "");
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data    = await response.json();
      setOllamaModelle((data.models || []).map((m) => m.name));
      setOllamaTestStatus("ok");
    } catch {
      setOllamaTestStatus("fehler");
      setOllamaModelle([]);
    }
    setTimeout(() => setOllamaTestStatus(null), 8000);
  };

  // ── Status-Badge ──────────────────────────────────────────────────────────────
  const StatusBadge = ({ status, rolle }) => {
    if (rolle === "admin") return (
      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
        <Crown size={12} /> Admin
      </span>
    );
    if (status === "akzeptiert") return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Check size={12} /> Mitglied
      </span>
    );
    if (status === "ausstehend") return (
      <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
        <Clock size={12} /> Ausstehend
      </span>
    );
    return null;
  };

  if (!geladen) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-light-text-secondary dark:text-dark-text-secondary">
        Lade Haushalt…
      </div>
    );
  }

  const INPUT_CLS = "w-full px-3 py-2 rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";
  const CARD_CLS  = "p-5 rounded-2xl bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-500/10">
          <Home className="text-blue-600 dark:text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Haushalt</h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Teile deinen Haushalt mit anderen Personen
          </p>
        </div>
      </div>

      {/* Meldung */}
      {meldung && (
        <div className={`p-3 rounded-xl text-sm font-medium ${
          meldung.typ === "ok"
            ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30"
            : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30"
        }`}>
          {meldung.text}
        </div>
      )}

      {/* Invite Link (kein SMTP) */}
      {inviteLink && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-2">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Einladungslink (manuell teilen):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-bg dark:bg-canvas-1 px-2 py-1 rounded border border-light-border dark:border-dark-border break-all">
              {inviteLink}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); zeigeMeldung("ok", "Link kopiert!"); }}
              className="p-2 rounded-lg bg-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-500/30"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Kein Haushalt ───────────────────────────────────────────────────── */}
      {!inHaushalt && (
        <div className="space-y-4">
          <div className={`${CARD_CLS} space-y-4`}>
            <h2 className="font-semibold text-light-text-main dark:text-dark-text-main">Haushalt erstellen</h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Erstelle einen Haushalt und lade andere Personen ein, um Einkaufslisten,
              Inventar, Aufgaben und mehr gemeinsam zu verwalten.
            </p>
            <input
              type="text"
              value={neuerHaushaltName}
              onChange={(e) => setNeuerHaushaltName(e.target.value)}
              placeholder="Name des Haushalts"
              className={INPUT_CLS}
            />
            <button
              onClick={handleErstellen}
              disabled={laedt || !neuerHaushaltName.trim()}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                         text-white font-semibold text-sm transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {laedt ? "Erstelle…" : "Haushalt erstellen"}
            </button>
          </div>

          <div className={`${CARD_CLS} space-y-3`}>
            <h2 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
              Einladung erhalten?
            </h2>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Klicke auf den Einladungslink in der E-Mail oder gib den Token manuell ein.
            </p>
            <a
              href="/haushalt/einladung"
              className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            >
              <ExternalLink size={14} /> Einladung annehmen
            </a>
          </div>
        </div>
      )}

      {/* ── Haushalt vorhanden ────────────────────────────────────────────── */}
      {inHaushalt && haushalt && (
        <div className="space-y-4">

          {/* Haushalt-Name + Mitgliederliste */}
          <div className={CARD_CLS}>
            <div className="flex items-center justify-between mb-4">
              {nameEdit ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={neuerName}
                    onChange={(e) => setNeuerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSpeichern()}
                    autoFocus
                    className={INPUT_CLS}
                  />
                  <button onClick={handleNameSpeichern}
                    className="p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-500/10">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setNameEdit(false)}
                    className="p-1.5 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-bold text-light-text-main dark:text-dark-text-main text-lg">
                    {haushalt.name}
                  </h2>
                  {isAdmin && (
                    <button
                      onClick={() => { setNeuerName(haushalt.name); setNameEdit(true); }}
                      className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main px-2 py-1 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-3"
                    >
                      Umbenennen
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Mitgliederliste */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wide mb-3">
                Mitglieder ({mitglieder.filter((m) => m.status === "akzeptiert").length})
              </p>
              {mitglieder.map((m) => {
                const istIch = m.user_id === userId;
                const name = m.email || "Unbekannt";
                return (
                  <div key={m.id}
                    className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-light-hover dark:hover:bg-canvas-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500
                                      flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                          {name}{" "}
                          {istIch && (
                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              (du)
                            </span>
                          )}
                        </p>
                        <StatusBadge status={m.status} rolle={m.rolle} />
                      </div>
                    </div>

                    {/* Admin kann andere entfernen (nicht sich selbst) */}
                    {isAdmin && !istIch && (
                      bestaetige === m.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEntfernen(m.id)}
                            disabled={laedt}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-500/10"
                          >
                            Ja, entfernen
                          </button>
                          <button
                            onClick={() => setBestaetige(null)}
                            className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main px-2 py-1 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-3"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setBestaetige(m.id)}
                          className="p-1.5 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mitglied einladen (nur Admin) */}
          {isAdmin && (
            <div className={`${CARD_CLS} space-y-3`}>
              <h3 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm flex items-center gap-2">
                <Mail size={16} className="text-blue-600 dark:text-blue-400" /> Mitglied einladen
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={einladEmail}
                  onChange={(e) => setEinladEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEinladen()}
                  placeholder="E-Mail-Adresse"
                  className={INPUT_CLS}
                />
                <button
                  onClick={handleEinladen}
                  disabled={laedt || !einladEmail.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white
                             text-sm font-semibold transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {laedt ? "…" : "Einladen"}
                </button>
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Die Person erhält eine E-Mail mit einem Einladungslink.
                Falls kein SMTP konfiguriert ist, erhältst du einen Link zum manuellen Teilen.
              </p>
            </div>
          )}

          {/* ── Admin-Einstellungen ─────────────────────────────────────────── */}
          {isAdmin && (
            <div className="space-y-4">

              {/* Trennlinie mit Label */}
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-light-border dark:bg-dark-border" />
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider
                                 text-light-text-secondary dark:text-dark-text-secondary px-1">
                  <Settings size={12} /> Haushalt-Einstellungen
                </span>
                <div className="h-px flex-1 bg-light-border dark:bg-dark-border" />
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary -mt-2">
                Diese Einstellungen gelten für alle Mitglieder des Haushalts.
              </p>

              {/* App-Modus */}
              <div className={`${CARD_CLS} space-y-4`}>
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-secondary-500 shrink-0" />
                  <h3 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
                    App-Modus
                  </h3>
                </div>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary -mt-1">
                  Legt für alle Mitglieder fest, welcher Bereich primär angezeigt wird.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleModusWechsel("umzug")}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2
                                transition-all duration-200
                                ${appMode === "umzug"
                                  ? "border-primary-500 bg-primary-500/10 text-primary-500"
                                  : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-primary-500/50"
                                }`}
                  >
                    <Truck size={26} />
                    <div className="text-center">
                      <p className="text-sm font-semibold">Umzugsplaner</p>
                      <p className="text-xs opacity-70 mt-0.5">Umzug planen</p>
                    </div>
                    {appMode === "umzug" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-500 text-white">
                        Aktiv
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => handleModusWechsel("home")}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2
                                transition-all duration-200
                                ${appMode === "home"
                                  ? "border-secondary-500 bg-secondary-500/10 text-secondary-500"
                                  : "border-light-border dark:border-dark-border bg-light-surface-1 dark:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary hover:border-secondary-500/50"
                                }`}
                  >
                    <Home size={26} />
                    <div className="text-center">
                      <p className="text-sm font-semibold">Home Organizer</p>
                      <p className="text-xs opacity-70 mt-0.5">Haushalt verwalten</p>
                    </div>
                    {appMode === "home" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary-500 text-white">
                        Aktiv
                      </span>
                    )}
                  </button>
                </div>

                {modusStatus === "ok" && (
                  <p className="text-xs text-accent-success flex items-center gap-1">
                    <CheckCircle size={12} /> Modus gespeichert und für alle Mitglieder aktiv.
                  </p>
                )}
              </div>

              {/* KI-Einstellungen */}
              <div className={`${CARD_CLS} space-y-4`}>
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-secondary-500 shrink-0" />
                  <h3 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
                    KI-Einstellungen
                  </h3>
                </div>

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
                        className={`flex flex-col items-center p-3 rounded-xl border-2 text-sm transition-all
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
                    <div className="relative">
                      <input
                        type={apiKeyVisible ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className={`${INPUT_CLS} pr-10`}
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
                          className={INPUT_CLS}
                        />
                        <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          Basis-URL ohne Pfad, z.B.{" "}
                          <code className="font-mono text-[11px]">http://localhost:11434</code>
                        </p>
                      </div>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="llama3.2"
                        className={INPUT_CLS}
                      />
                      {ollamaModelle.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {ollamaModelle.map((m) => (
                            <button
                              key={m}
                              onClick={() => setOllamaModel(m)}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors
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
                    <button
                      onClick={handleOllamaVerbindungTesten}
                      disabled={!ollamaUrl.trim() || ollamaTestStatus === "testing"}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
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
                        : "Verbindung testen"}
                    </button>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Im Ollama-Modus wird die Spracheingabe über die Browser-Spracherkennung (Web Speech API) verarbeitet statt über Whisper.
                    </p>
                  </div>
                )}

                {/* Speichern-Button */}
                <button
                  onClick={handleKiSpeichern}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                             bg-secondary-500 hover:bg-secondary-600 text-white transition-colors"
                >
                  {kiSpeichernStatus === "ok" ? (
                    <><CheckCircle size={15} /> Gespeichert</>
                  ) : kiSpeichernStatus === "fehler" ? (
                    <><AlertCircle size={15} /> Fehler</>
                  ) : (
                    <><Save size={15} /> KI-Einstellungen speichern</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Haushalt verlassen / auflösen */}
          <div className={`${CARD_CLS} space-y-3`}>
            <h3 className="font-semibold text-light-text-main dark:text-dark-text-main text-sm">
              Haushalt verlassen
            </h3>

            {/* Nicht-Admin: verlassen */}
            {!isAdmin && (
              bestaetige === "verlassen" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
                  <p className="flex-1 text-sm text-red-700 dark:text-red-300">
                    Haushalt wirklich verlassen?
                  </p>
                  <button onClick={handleVerlassen} disabled={laedt}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold">
                    Ja
                  </button>
                  <button onClick={() => setBestaetige(null)}
                    className="text-xs px-3 py-1.5 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setBestaetige("verlassen")}
                  className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 py-1"
                >
                  <LogOut size={16} /> Haushalt verlassen
                </button>
              )
            )}

            {/* Admin: auflösen */}
            {isAdmin && (
              bestaetige === "aufloesen" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
                  <p className="flex-1 text-sm text-red-700 dark:text-red-300">
                    Haushalt auflösen? Alle Mitglieder verlieren den gemeinsamen Zugriff.
                  </p>
                  <button onClick={handleAufloesen} disabled={laedt}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold">
                    Ja
                  </button>
                  <button onClick={() => setBestaetige(null)}
                    className="text-xs px-3 py-1.5 rounded-lg hover:bg-light-hover dark:hover:bg-canvas-3 text-light-text-secondary dark:text-dark-text-secondary">
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setBestaetige("aufloesen")}
                  className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 py-1"
                >
                  <Trash2 size={16} /> Haushalt auflösen
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
