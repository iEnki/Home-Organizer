import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useHaushalt } from "../../contexts/HaushaltsContext";
import { useAppMode } from "../../contexts/AppModeContext";
import { Settings, Eye, EyeOff, Save, Check, AlertTriangle, Lock } from "lucide-react";

const HaushaltsEinstellungen = () => {
  const navigate = useNavigate();
  const { haushalt, haushaltId, istAdmin, ladeHaushalt } = useHaushalt();
  const { switchToHome, switchToUmzug, deaktiviereUmzug, aktiviereUmzug, umzugDeaktiviert } = useAppMode();

  const [name,         setName]         = useState("");
  const [appModus,     setAppModus]     = useState("umzug");
  const [openaiKey,    setOpenaiKey]    = useState("");
  const [keySichtbar,  setKeySichtbar]  = useState(false);
  const [laden,        setLaden]        = useState(false);
  const [erfolg,       setErfolg]       = useState(false);
  const [fehler,       setFehler]       = useState("");

  // Felder aus Context befüllen
  useEffect(() => {
    if (haushalt) {
      setName(haushalt.name || "");
      setAppModus(haushalt.app_modus || "umzug");
      setOpenaiKey(haushalt.openai_api_key || "");
    }
  }, [haushalt]);

  // Nicht-Admins: Umleitung
  if (!istAdmin) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-light-border dark:bg-dark-border mb-4">
          <Lock className="w-7 h-7 text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
        <h2 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-2">
          Kein Zugriff
        </h2>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
          Haushaltseinstellungen können nur vom Admin bearbeitet werden.
        </p>
        <button
          onClick={() => navigate("/haushalt")}
          className="px-5 py-2 rounded-xl text-sm font-medium bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity"
        >
          Zur Hausverwaltung
        </button>
      </div>
    );
  }

  const handleSpeichern = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLaden(true);
    setFehler("");

    const { error } = await supabase
      .from("haushalte")
      .update({
        name:           name.trim(),
        app_modus:      appModus,
        openai_api_key: openaiKey.trim() || null,
      })
      .eq("id", haushaltId);

    setLaden(false);

    if (error) {
      setFehler("Einstellungen konnten nicht gespeichert werden: " + error.message);
      return;
    }

    // Lokalen App-Modus synchronisieren
    if (appModus === "home") {
      switchToHome();
    } else if (appModus === "umzug") {
      switchToUmzug();
    }

    await ladeHaushalt();
    setErfolg(true);
    setTimeout(() => setErfolg(false), 2500);
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      {/* Überschrift */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-light-text-main dark:text-dark-text-main">
          <Settings className="w-6 h-6 text-light-accent-purple dark:text-accent-purple" />
          Haushaltseinstellungen
        </h1>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
          Diese Einstellungen gelten für alle Mitglieder des Haushalts.
        </p>
      </div>

      {fehler && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {fehler}
        </div>
      )}

      <form onSubmit={handleSpeichern} className="space-y-5">
        {/* Haushaltsname */}
        <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-light-border dark:border-dark-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main uppercase tracking-wide">
            Allgemein
          </h2>

          <div>
            <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
              Haushaltsname
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-2.5 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
            />
          </div>

          {/* App-Modus */}
          <div>
            <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
              App-Modus
            </label>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Legt fest, welche Bereiche der App für alle Mitglieder verfügbar sind.
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                { wert: "umzug", label: "Umzugsplaner" },
                { wert: "home",  label: "Home Organizer" },
                { wert: "beide", label: "Beides" },
              ].map(({ wert, label }) => (
                <button
                  key={wert}
                  type="button"
                  onClick={() => setAppModus(wert)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    appModus === wert
                      ? "bg-light-accent-purple dark:bg-accent-purple text-white border-transparent"
                      : "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-bg dark:hover:bg-canvas-1"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KI-Einstellungen */}
        <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-light-border dark:border-dark-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main uppercase tracking-wide">
            KI-Assistent
          </h2>

          <div>
            <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
              OpenAI API-Schlüssel
            </label>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Wird für alle Haushaltsmitglieder geteilt. Leer lassen, um KI-Funktionen zu deaktivieren.
            </p>
            <div className="relative">
              <input
                type={keySichtbar ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-…"
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-2.5 pr-11 text-sm font-mono text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
              />
              <button
                type="button"
                onClick={() => setKeySichtbar((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main transition-colors"
              >
                {keySichtbar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Speichern */}
        <button
          type="submit"
          disabled={laden}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90"
        >
          {erfolg ? (
            <><Check className="w-4 h-4" /> Gespeichert</>
          ) : laden ? (
            "Wird gespeichert…"
          ) : (
            <><Save className="w-4 h-4" /> Einstellungen speichern</>
          )}
        </button>
      </form>
    </div>
  );
};

export default HaushaltsEinstellungen;
