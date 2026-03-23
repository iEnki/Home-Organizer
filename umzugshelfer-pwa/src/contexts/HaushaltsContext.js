import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import { supabase } from "../supabaseClient";

const HaushaltsContext = createContext();

export const useHaushalt = () => useContext(HaushaltsContext);

export const HaushaltsProvider = ({ session, children }) => {
  const [haushalt,               setHaushalt]               = useState(null);
  const [mitglieder,             setMitglieder]             = useState([]);
  const [ausstehende_einladungen,setAusstehendeEinladungen] = useState([]);
  // 'laden' | 'kein_haushalt' | 'bereit'
  const [ladeStatus,             setLadeStatus]             = useState("laden");

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  // ── Haushalt + Mitglieder laden ───────────────────────────────────────────────
  const ladeHaushalt = useCallback(async () => {
    if (!userId) {
      setLadeStatus("kein_haushalt");
      return;
    }

    // Eigenen Mitglieder-Eintrag suchen
    const { data: mitglied } = await supabase
      .from("haushalt_mitglieder")
      .select("haushalt_id, rolle")
      .eq("user_id", userId)
      .maybeSingle();

    if (!mitglied) {
      setLadeStatus("kein_haushalt");
      return;
    }

    // Haushaltsdaten laden
    const { data: haushaltData } = await supabase
      .from("haushalte")
      .select("*")
      .eq("id", mitglied.haushalt_id)
      .single();

    if (!haushaltData) {
      setLadeStatus("kein_haushalt");
      return;
    }

    // Mitgliederliste laden (mit user_profile für Namen/E-Mail)
    const { data: mitgliederData } = await supabase
      .from("haushalt_mitglieder")
      .select("id, user_id, rolle, beigetreten_am, user_profile(username, email)")
      .eq("haushalt_id", mitglied.haushalt_id)
      .order("beigetreten_am");

    setHaushalt(haushaltData);
    setMitglieder(mitgliederData || []);
    setLadeStatus("bereit");
  }, [userId]);

  // ── Ausstehende E-Mail-Einladungen prüfen ─────────────────────────────────────
  const ladeAusstehendeEinladungen = useCallback(async () => {
    if (!userEmail) return;

    const { data } = await supabase
      .from("haushalt_einladungen")
      .select("id, haushalt_id, eingeladen_von, gueltig_bis, haushalte(name)")
      .eq("einladungs_email", userEmail)
      .eq("status", "offen")
      .gt("gueltig_bis", new Date().toISOString());

    setAusstehendeEinladungen(data || []);
  }, [userEmail]);

  // ── Initialer Ladevorgang ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setLadeStatus("kein_haushalt");
      return;
    }
    setLadeStatus("laden");
    Promise.all([ladeHaushalt(), ladeAusstehendeEinladungen()]);
  }, [userId, ladeHaushalt, ladeAusstehendeEinladungen]);

  // ── Realtime: Mitgliedschaft überwachen ───────────────────────────────────────
  useEffect(() => {
    if (!userId || !haushalt?.id) return;

    const kanal = supabase
      .channel(`haushalt_mitglieder_${haushalt.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "haushalt_mitglieder",
          filter: `haushalt_id=eq.${haushalt.id}`,
        },
        (payload) => {
          // Eigener Eintrag gelöscht → Haushalt verlassen
          if (
            payload.eventType === "DELETE" &&
            payload.old?.user_id === userId
          ) {
            setHaushalt(null);
            setMitglieder([]);
            setLadeStatus("kein_haushalt");
            return;
          }
          // Mitgliederliste aktualisieren
          ladeHaushalt();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(kanal);
    };
  }, [userId, haushalt?.id, ladeHaushalt]);

  // ── Abgeleitete Werte ─────────────────────────────────────────────────────────
  const haushaltId = haushalt?.id ?? null;
  const istAdmin   = haushalt ? haushalt.admin_id === userId : false;

  return (
    <HaushaltsContext.Provider
      value={{
        haushalt,
        haushaltId,
        istAdmin,
        mitglieder,
        ausstehende_einladungen,
        ladeStatus,
        ladeHaushalt,
        ladeAusstehendeEinladungen,
      }}
    >
      {children}
    </HaushaltsContext.Provider>
  );
};
