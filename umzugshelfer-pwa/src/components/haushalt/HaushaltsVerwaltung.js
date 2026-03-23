import React, { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import { useHaushalt } from "../../contexts/HaushaltsContext";
import {
  Users, Mail, Link2, Copy, Trash2, Crown, LogOut,
  Plus, Check, X, AlertTriangle, Shield, Clock,
} from "lucide-react";

const HaushaltsVerwaltung = ({ session }) => {
  const { haushalt, haushaltId, istAdmin, mitglieder, ladeHaushalt } = useHaushalt();
  const userId = session?.user?.id;

  const [einladungen,      setEinladungen]      = useState([]);
  const [ladeinladungen,   setLadeinladungen]   = useState(false);
  const [laden,            setLaden]            = useState(false);
  const [fehler,           setFehler]           = useState("");
  const [erfolg,           setErfolg]           = useState("");

  // Einladungsformular
  const [neueMitgliedEmail, setNeueMitgliedEmail] = useState("");
  const [kopiert,           setKopiert]           = useState(null); // einladungs_id des kopierten Links

  // Admin-Übertragung
  const [uebertragenFuer,  setUebertragenFuer]  = useState(null);
  const [bestaetigeLöschen,setBestaetigeLöschen] = useState(false);

  // ── Einladungen laden ──────────────────────────────────────────────────────────
  const ladeEinladungen = async () => {
    if (!haushaltId) return;
    setLadeinladungen(true);
    const { data } = await supabase
      .from("haushalt_einladungen")
      .select("*")
      .eq("haushalt_id", haushaltId)
      .eq("status", "offen")
      .order("created_at", { ascending: false });
    setEinladungen(data || []);
    setLadeinladungen(false);
  };

  useEffect(() => {
    ladeEinladungen();
  }, [haushaltId]); // eslint-disable-line react-hooks/exhaustive-deps

  const zeigeErfolg = (msg) => {
    setFehler("");
    setErfolg(msg);
    setTimeout(() => setErfolg(""), 3000);
  };

  const zeigeFehler = (msg) => {
    setErfolg("");
    setFehler(msg);
    setTimeout(() => setFehler(""), 5000);
  };

  // ── Neue Einladung erstellen ───────────────────────────────────────────────────
  const handleEinladungErstellen = async (e) => {
    e.preventDefault();
    setLaden(true);
    const { error } = await supabase
      .from("haushalt_einladungen")
      .insert({
        haushalt_id:     haushaltId,
        eingeladen_von:  userId,
        einladungs_email: neueMitgliedEmail.trim() || null,
      });
    setLaden(false);

    if (error) {
      zeigeFehler("Einladung konnte nicht erstellt werden.");
    } else {
      setNeueMitgliedEmail("");
      zeigeErfolg("Einladung erstellt.");
      ladeEinladungen();
    }
  };

  // ── Einladungslink kopieren ────────────────────────────────────────────────────
  const handleKopieren = async (einladung) => {
    const link = `${window.location.origin}/einladung/${einladung.einladungs_code}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    setKopiert(einladung.id);
    setTimeout(() => setKopiert(null), 2000);
  };

  // ── Einladung widerrufen ───────────────────────────────────────────────────────
  const handleEinladungWiderrufen = async (einladungId) => {
    await supabase
      .from("haushalt_einladungen")
      .update({ status: "abgelaufen" })
      .eq("id", einladungId);
    ladeEinladungen();
  };

  // ── Mitglied entfernen ─────────────────────────────────────────────────────────
  const handleMitgliedEntfernen = async (mitgliedUserId) => {
    setLaden(true);
    const { error } = await supabase.rpc("mitglied_entfernen", {
      p_haushalt_id: haushaltId,
      p_user_id:     mitgliedUserId,
    });
    setLaden(false);
    if (error) zeigeFehler(error.message);
    else { zeigeErfolg("Mitglied entfernt."); ladeHaushalt(); }
  };

  // ── Admin-Rolle übertragen ─────────────────────────────────────────────────────
  const handleAdminUebertragen = async (neuerAdminId) => {
    setLaden(true);
    const { error } = await supabase.rpc("admin_rolle_uebertragen", {
      p_haushalt_id:    haushaltId,
      p_neuer_admin_id: neuerAdminId,
    });
    setLaden(false);
    setUebertragenFuer(null);
    if (error) zeigeFehler(error.message);
    else { zeigeErfolg("Admin-Rolle erfolgreich übertragen."); ladeHaushalt(); }
  };

  // ── Haushalt verlassen ─────────────────────────────────────────────────────────
  const handleVerlassen = async () => {
    setLaden(true);
    const { error } = await supabase.rpc("haushalt_verlassen", {
      p_haushalt_id: haushaltId,
    });
    setLaden(false);
    if (error) zeigeFehler(error.message);
  };

  // ── Haushalt löschen ──────────────────────────────────────────────────────────
  const handleLoeschen = async () => {
    setLaden(true);
    const { error } = await supabase
      .from("haushalte")
      .delete()
      .eq("id", haushaltId);
    setLaden(false);
    setBestaetigeLöschen(false);
    if (error) zeigeFehler("Haushalt konnte nicht gelöscht werden: " + error.message);
    else ladeHaushalt();
  };

  if (!haushalt) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Überschrift */}
      <div>
        <h1 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
          Haushalt verwalten
        </h1>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
          {haushalt.name}
          {istAdmin && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-light-accent-purple dark:text-accent-purple font-medium">
              <Crown className="w-3 h-3" /> Admin
            </span>
          )}
        </p>
      </div>

      {/* Feedback */}
      {fehler && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {fehler}
        </div>
      )}
      {erfolg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
          <Check className="w-4 h-4 shrink-0" /> {erfolg}
        </div>
      )}

      {/* ── Mitglieder ────────────────────────────────────────────────────────── */}
      <section className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-light-border dark:border-dark-border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-light-text-main dark:text-dark-text-main mb-4">
          <Users className="w-5 h-5 text-light-accent-purple dark:text-accent-purple" />
          Mitglieder ({mitglieder.length})
        </h2>

        <ul className="space-y-3">
          {mitglieder.map((m) => {
            const name  = m.user_profile?.username || m.user_profile?.email || "Unbekannt";
            const email = m.user_profile?.email || "";
            const isMe  = m.user_id === userId;
            const isAdm = m.rolle === "admin";

            return (
              <li
                key={m.id}
                className="flex items-center gap-3 py-2 border-b border-light-border dark:border-dark-border last:border-0"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-light-accent-purple/20 dark:bg-accent-purple/20 flex items-center justify-center text-sm font-bold text-light-accent-purple dark:text-accent-purple shrink-0">
                  {name[0]?.toUpperCase() || "?"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-light-text-main dark:text-dark-text-main truncate">
                      {name}{isMe && " (du)"}
                    </span>
                    {isAdm && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                  </div>
                  <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {email}
                  </span>
                </div>

                {/* Admin-Aktionen */}
                {istAdmin && !isMe && !isAdm && (
                  <div className="flex items-center gap-1">
                    {uebertragenFuer === m.user_id ? (
                      <>
                        <button
                          onClick={() => handleAdminUebertragen(m.user_id)}
                          disabled={laden}
                          className="px-2 py-1 text-xs rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors disabled:opacity-50"
                        >
                          Bestätigen
                        </button>
                        <button
                          onClick={() => setUebertragenFuer(null)}
                          className="p-1.5 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-bg dark:hover:bg-canvas-1 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setUebertragenFuer(m.user_id)}
                          title="Admin-Rolle übertragen"
                          className="p-1.5 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-bg dark:hover:bg-canvas-1 transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMitgliedEntfernen(m.user_id)}
                          title="Mitglied entfernen"
                          disabled={laden}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Einladungen (nur Admin) ────────────────────────────────────────────── */}
      {istAdmin && (
        <section className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-light-border dark:border-dark-border p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-light-text-main dark:text-dark-text-main mb-4">
            <Mail className="w-5 h-5 text-light-accent-purple dark:text-accent-purple" />
            Einladungen
          </h2>

          {/* Neue Einladung */}
          <form onSubmit={handleEinladungErstellen} className="flex gap-2 mb-4">
            <input
              type="email"
              value={neueMitgliedEmail}
              onChange={(e) => setNeueMitgliedEmail(e.target.value)}
              placeholder="E-Mail (optional) – oder leer lassen für Code-only"
              className="flex-1 rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
            />
            <button
              type="submit"
              disabled={laden}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Erstellen
            </button>
          </form>

          {/* Einladungsliste */}
          {ladeinladungen ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Lädt…</p>
          ) : einladungen.length === 0 ? (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Keine offenen Einladungen.
            </p>
          ) : (
            <ul className="space-y-2">
              {einladungen.map((einl) => (
                <li
                  key={einl.id}
                  className="flex items-center gap-3 rounded-xl bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {einl.einladungs_code}
                    </p>
                    {einl.einladungs_email && (
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {einl.einladungs_email}
                      </p>
                    )}
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Gültig bis {new Date(einl.gueltig_bis).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleKopieren(einl)}
                      title="Link kopieren"
                      className="p-1.5 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-card-bg dark:hover:bg-dark-card-bg transition-colors"
                    >
                      {kopiert === einl.id
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <Link2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEinladungWiderrufen(einl.id)}
                      title="Einladung widerrufen"
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Haushalt verlassen (nur Nicht-Admins) ────────────────────────────── */}
      {!istAdmin && (
        <section className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-light-border dark:border-dark-border p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-light-text-main dark:text-dark-text-main mb-3">
            <LogOut className="w-5 h-5 text-orange-500" />
            Haushalt verlassen
          </h2>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
            Deine Daten bleiben im Haushalt erhalten. Du kannst jederzeit über einen neuen Einladungslink wieder beitreten.
          </p>
          <button
            onClick={handleVerlassen}
            disabled={laden}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
          >
            {laden ? "Wird verarbeitet…" : "Haushalt verlassen"}
          </button>
        </section>
      )}

      {/* ── Haushalt löschen (nur Admin) ─────────────────────────────────────── */}
      {istAdmin && (
        <section className="bg-light-card-bg dark:bg-dark-card-bg rounded-2xl border border-red-200 dark:border-red-800/50 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-red-600 dark:text-red-400 mb-3">
            <Trash2 className="w-5 h-5" />
            Haushalt löschen
          </h2>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
            Löscht den Haushalt und alle zugehörigen Daten unwiderruflich. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>

          {bestaetigeLöschen ? (
            <div className="flex gap-2">
              <button
                onClick={handleLoeschen}
                disabled={laden}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {laden ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
              <button
                onClick={() => setBestaetigeLöschen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-bg dark:hover:bg-canvas-1 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBestaetigeLöschen(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Haushalt löschen…
            </button>
          )}
        </section>
      )}

      {/* Hinweis für Admin: nicht verlassen ohne Übergabe */}
      {istAdmin && mitglieder.length > 1 && (
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center">
          Als Admin musst du zuerst die Rolle übertragen oder den Haushalt löschen, bevor du ihn verlassen kannst.
        </p>
      )}
    </div>
  );
};

export default HaushaltsVerwaltung;
