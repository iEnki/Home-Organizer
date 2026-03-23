import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import { supabase } from "../supabaseClient";

const HaushaltContext = createContext(null);

export const useHaushalt = () => useContext(HaushaltContext);

export const HaushaltProvider = ({ session, children }) => {
  const [haushalt, setHaushalt]     = useState(null);   // haushalte-Eintrag
  const [mitglieder, setMitglieder] = useState([]);     // haushalt_mitglieder[]
  const [eigeneRolle, setEigeneRolle] = useState(null); // 'admin' | 'mitglied' | null
  const [geladen, setGeladen]       = useState(false);

  const userId = session?.user?.id;

  // Haushalt + Mitglieder laden
  const ladeHaushalt = useCallback(async () => {
    if (!userId) {
      setHaushalt(null);
      setMitglieder([]);
      setEigeneRolle(null);
      setGeladen(true);
      return;
    }

    // Eigene Mitgliedschaft suchen (akzeptiert)
    const { data: meinMitglied } = await supabase
      .from("haushalt_mitglieder")
      .select("haushalt_id, rolle, status")
      .eq("user_id", userId)
      .eq("status", "akzeptiert")
      .maybeSingle();

    if (!meinMitglied) {
      setHaushalt(null);
      setMitglieder([]);
      setEigeneRolle(null);
      setGeladen(true);
      return;
    }

    setEigeneRolle(meinMitglied.rolle);

    // Haushalt-Daten laden
    const { data: haushaltData } = await supabase
      .from("haushalte")
      .select("*")
      .eq("id", meinMitglied.haushalt_id)
      .single();

    setHaushalt(haushaltData ?? null);

    // Alle Mitglieder laden (inkl. ausstehende Einladungen)
    // Hinweis: kein profil-Join, da user_id → user_profile keine direkte FK hat;
    // email ist bereits in haushalt_mitglieder gespeichert.
    const { data: mitgliederData } = await supabase
      .from("haushalt_mitglieder")
      .select("id, user_id, email, status, rolle, eingeladen_am, joined_at")
      .eq("haushalt_id", meinMitglied.haushalt_id)
      .order("joined_at", { ascending: true });

    setMitglieder(mitgliederData ?? []);
    setGeladen(true);
  }, [userId]);

  useEffect(() => {
    ladeHaushalt();
  }, [ladeHaushalt]);

  // Haushalt erstellen
  const haushaltErstellen = useCallback(async (name = "Unser Haushalt") => {
    if (!userId) return { error: "Nicht eingeloggt" };

    // Prüfen ob User bereits in einem Haushalt ist
    const { data: vorhandene } = await supabase
      .from("haushalt_mitglieder")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "akzeptiert")
      .maybeSingle();

    if (vorhandene) {
      return { error: "Du bist bereits Mitglied eines Haushalts" };
    }

    const { data: neuerHaushalt, error } = await supabase
      .from("haushalte")
      .insert({ name, created_by: userId })
      .select()
      .single();

    if (error || !neuerHaushalt) {
      return { error: error?.message ?? "Haushalt konnte nicht erstellt werden" };
    }

    // Ersteller als Admin eintragen
    await supabase.from("haushalt_mitglieder").insert({
      haushalt_id: neuerHaushalt.id,
      user_id: userId,
      status: "akzeptiert",
      rolle: "admin",
      joined_at: new Date().toISOString(),
    });

    await ladeHaushalt();
    return { ok: true };
  }, [userId, ladeHaushalt]);

  // Haushalt verlassen
  const haushaltVerlassen = useCallback(async () => {
    if (!userId || !haushalt) return { error: "Kein Haushalt" };
    if (haushalt.created_by === userId) {
      return { error: "Als Ersteller kannst du den Haushalt nicht verlassen. Löse ihn zuerst auf." };
    }

    // Inhalte dem Admin übergeben, bevor das Mitglied entfernt wird
    const admin = mitglieder.find(
      (m) => m.rolle === "admin" && m.user_id !== userId && m.status === "akzeptiert",
    );
    if (admin?.user_id) {
      await supabase.rpc("uebergib_haushalt_inhalte", {
        p_von_user_id: userId,
        p_zu_user_id: admin.user_id,
      });
    }

    await supabase
      .from("haushalt_mitglieder")
      .delete()
      .eq("user_id", userId)
      .eq("haushalt_id", haushalt.id);

    setHaushalt(null);
    setMitglieder([]);
    setEigeneRolle(null);
    return { ok: true };
  }, [userId, haushalt, mitglieder]);

  // Haushalt auflösen (nur Ersteller)
  const haushaltAufloesen = useCallback(async () => {
    if (!haushalt || haushalt.created_by !== userId) {
      return { error: "Nur der Ersteller kann den Haushalt auflösen" };
    }

    const { error } = await supabase
      .from("haushalte")
      .delete()
      .eq("id", haushalt.id);

    if (error) return { error: error.message };

    setHaushalt(null);
    setMitglieder([]);
    setEigeneRolle(null);
    return { ok: true };
  }, [haushalt, userId]);

  // Mitglied entfernen (nur Admin)
  const mitgliedEntfernen = useCallback(async (mitgliedId) => {
    if (eigeneRolle !== "admin") return { error: "Keine Berechtigung" };

    // Inhalte des Mitglieds dem Admin (eigener userId) übergeben, bevor es entfernt wird
    const mitglied = mitglieder.find((m) => m.id === mitgliedId);
    if (mitglied?.user_id) {
      await supabase.rpc("uebergib_haushalt_inhalte", {
        p_von_user_id: mitglied.user_id,
        p_zu_user_id: userId,
      });
    }

    const { error } = await supabase
      .from("haushalt_mitglieder")
      .delete()
      .eq("id", mitgliedId)
      .eq("haushalt_id", haushalt?.id);

    if (error) return { error: error.message };

    await ladeHaushalt();
    return { ok: true };
  }, [eigeneRolle, mitglieder, userId, haushalt, ladeHaushalt]);

  // Haushalt-Name ändern (nur Admin)
  const nameAendern = useCallback(async (neuerName) => {
    if (!haushalt || eigeneRolle !== "admin") return { error: "Keine Berechtigung" };

    const { error } = await supabase
      .from("haushalte")
      .update({ name: neuerName, updated_at: new Date().toISOString() })
      .eq("id", haushalt.id);

    if (error) return { error: error.message };

    setHaushalt((prev) => ({ ...prev, name: neuerName }));
    return { ok: true };
  }, [haushalt, eigeneRolle]);

  // KI-Settings speichern (nur Admin)
  const kiSettingsSpeichern = useCallback(async (settings) => {
    if (!haushalt || eigeneRolle !== "admin") return { error: "Keine Berechtigung" };

    const { error } = await supabase
      .from("haushalte")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("id", haushalt.id);

    if (error) return { error: error.message };

    setHaushalt((prev) => ({ ...prev, ...settings }));
    return { ok: true };
  }, [haushalt, eigeneRolle]);

  // App-Modus speichern (nur Admin)
  const appModusSpeichern = useCallback(async (modus) => {
    if (!haushalt || eigeneRolle !== "admin") return { error: "Keine Berechtigung" };

    const { error } = await supabase
      .from("haushalte")
      .update({ app_modus: modus, updated_at: new Date().toISOString() })
      .eq("id", haushalt.id);

    if (error) return { error: error.message };

    setHaushalt((prev) => ({ ...prev, app_modus: modus }));
    return { ok: true };
  }, [haushalt, eigeneRolle]);

  const isAdmin   = eigeneRolle === "admin";
  const inHaushalt = haushalt !== null;

  return (
    <HaushaltContext.Provider
      value={{
        haushalt,
        mitglieder,
        eigeneRolle,
        isAdmin,
        inHaushalt,
        geladen,
        ladeHaushalt,
        haushaltErstellen,
        haushaltVerlassen,
        haushaltAufloesen,
        mitgliedEntfernen,
        nameAendern,
        kiSettingsSpeichern,
        appModusSpeichern,
      }}
    >
      {children}
    </HaushaltContext.Provider>
  );
};
