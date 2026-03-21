import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useHaushalt } from "../../contexts/HaushaltsContext";
import { Home, Key, Plus, CheckCircle, AlertCircle, Users } from "lucide-react";

const HaushaltsErstellen = ({ session }) => {
  const navigate = useNavigate();
  const { ladeHaushalt, ausstehende_einladungen, ladeAusstehendeEinladungen } = useHaushalt();

  const [aktiveTab, setAktiveTab] = useState("erstellen"); // 'erstellen' | 'beitreten'
  const [haushaltsName, setHaushaltsName] = useState("Mein Haushalt");
  const [einladungsCode, setEinladungsCode] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");

  const userId = session?.user?.id;

  // ── Neuen Haushalt erstellen ──────────────────────────────────────────────────
  const handleErstellen = async (e) => {
    e.preventDefault();
    if (!haushaltsName.trim()) return;
    setLaden(true);
    setFehler("");

    const { data: haushalt, error: hError } = await supabase
      .from("haushalte")
      .insert({ name: haushaltsName.trim(), admin_id: userId })
      .select()
      .single();

    if (hError || !haushalt) {
      setFehler("Haushalt konnte nicht erstellt werden. Bitte versuche es erneut.");
      setLaden(false);
      return;
    }

    // Mitglied-Eintrag anlegen
    await supabase
      .from("haushalt_mitglieder")
      .insert({ haushalt_id: haushalt.id, user_id: userId, rolle: "admin" });

    // user_profile.haushalt_id setzen
    await supabase
      .from("user_profile")
      .update({ haushalt_id: haushalt.id })
      .eq("id", userId);

    setLaden(false);
    await ladeHaushalt();
    navigate("/home");
  };

  // ── Einladungscode einlösen ───────────────────────────────────────────────────
  const handleBeitreten = async (e) => {
    e.preventDefault();
    if (!einladungsCode.trim()) return;
    setLaden(true);
    setFehler("");

    const { error } = await supabase.rpc("einladung_annehmen", {
      p_code: einladungsCode.trim(),
    });

    if (error) {
      setFehler(error.message || "Ungültiger oder abgelaufener Einladungscode.");
      setLaden(false);
      return;
    }

    setLaden(false);
    await ladeHaushalt();
    navigate("/home");
  };

  // ── E-Mail-Einladung annehmen ─────────────────────────────────────────────────
  const handleEmailEinladungAnnehmen = async (einladung) => {
    setLaden(true);
    setFehler("");

    // Admin legt Code-Einladung an – wir nutzen die haushalt_id der Einladung
    // und fügen das Mitglied direkt hinzu
    const { error } = await supabase
      .from("haushalt_mitglieder")
      .insert({ haushalt_id: einladung.haushalt_id, user_id: userId, rolle: "mitglied" });

    if (!error) {
      await supabase
        .from("user_profile")
        .update({ haushalt_id: einladung.haushalt_id })
        .eq("id", userId);

      await supabase
        .from("haushalt_einladungen")
        .update({ status: "angenommen" })
        .eq("id", einladung.id);
    }

    setLaden(false);
    if (error) {
      setFehler("Einladung konnte nicht angenommen werden.");
    } else {
      await ladeHaushalt();
      navigate("/home");
    }
  };

  const handleEmailEinladungAblehnen = async (einladungId) => {
    await supabase
      .from("haushalt_einladungen")
      .update({ status: "abgelaufen" })
      .eq("id", einladungId);
    await ladeAusstehendeEinladungen();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-canvas-1 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-light-accent-purple/20 dark:bg-accent-purple/20 mb-4">
            <Home className="w-8 h-8 text-light-accent-purple dark:text-accent-purple" />
          </div>
          <h1 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
            Haushalt einrichten
          </h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
            Erstelle einen neuen Haushalt oder tritt einem bestehenden bei.
          </p>
        </div>

        {/* Ausstehende E-Mail-Einladungen */}
        {ausstehende_einladungen.length > 0 && (
          <div className="mb-6 space-y-3">
            {ausstehende_einladungen.map((einladung) => (
              <div
                key={einladung.id}
                className="rounded-xl border border-light-accent-purple/30 dark:border-accent-purple/30 bg-light-accent-purple/5 dark:bg-accent-purple/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-light-accent-purple dark:text-accent-purple mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                      Einladung zu „{einladung.haushalte?.name || "Haushalt"}"
                    </p>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Gültig bis {new Date(einladung.gueltig_bis).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleEmailEinladungAnnehmen(einladung)}
                    disabled={laden}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Annehmen
                  </button>
                  <button
                    onClick={() => handleEmailEinladungAblehnen(einladung.id)}
                    disabled={laden}
                    className="flex-1 py-2 rounded-lg text-sm font-medium border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-card-bg dark:hover:bg-dark-card-bg transition-colors disabled:opacity-50"
                  >
                    Ablehnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab-Navigation */}
        <div className="flex rounded-xl bg-light-card-bg dark:bg-dark-card-bg border border-light-border dark:border-dark-border p-1 mb-6">
          <button
            onClick={() => setAktiveTab("erstellen")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              aktiveTab === "erstellen"
                ? "bg-light-accent-purple dark:bg-accent-purple text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
          >
            Erstellen
          </button>
          <button
            onClick={() => setAktiveTab("beitreten")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              aktiveTab === "beitreten"
                ? "bg-light-accent-purple dark:bg-accent-purple text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
          >
            Beitreten
          </button>
        </div>

        {/* Fehler / Erfolg */}
        {fehler && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {fehler}
          </div>
        )}
        {erfolg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {erfolg}
          </div>
        )}

        {/* Erstellen-Tab */}
        {aktiveTab === "erstellen" && (
          <form onSubmit={handleErstellen} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
                Name des Haushalts
              </label>
              <input
                type="text"
                value={haushaltsName}
                onChange={(e) => setHaushaltsName(e.target.value)}
                placeholder="z.B. Familie Mustermann"
                maxLength={80}
                required
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 text-sm text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
              />
            </div>
            <button
              type="submit"
              disabled={laden || !haushaltsName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {laden ? "Wird erstellt…" : "Haushalt erstellen"}
            </button>
          </form>
        )}

        {/* Beitreten-Tab */}
        {aktiveTab === "beitreten" && (
          <form onSubmit={handleBeitreten} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
                Einladungscode
              </label>
              <input
                type="text"
                value={einladungsCode}
                onChange={(e) => setEinladungsCode(e.target.value.trim())}
                placeholder="32-stelligen Code eingeben…"
                maxLength={64}
                required
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 text-sm font-mono text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
              />
              <p className="mt-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                Du erhältst den Code vom Admin deines Haushalts.
              </p>
            </div>
            <button
              type="submit"
              disabled={laden || !einladungsCode.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              {laden ? "Wird geprüft…" : "Haushalt beitreten"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default HaushaltsErstellen;
