import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const STORAGE_KEY = "umzug_erinnerungen_gezeigt";

const useErinnerungen = (userId) => {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!userId || !("Notification" in window)) return;

    const pruefeErinnerungen = async () => {
      const now = new Date();
      const vonDatum = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const bisDatum = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

      const { data: aufgaben } = await supabase
        .from("todo_aufgaben")
        .select("id, beschreibung, erinnerungs_datum")
        .eq("user_id", userId)
        .eq("erledigt", false)
        .not("erinnerungs_datum", "is", null)
        .gte("erinnerungs_datum", vonDatum)
        .lte("erinnerungs_datum", bisDatum);

      if (!aufgaben?.length) return;
      if (Notification.permission !== "granted") return;

      const gezeigte = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const neueGezeigte = [...gezeigte];

      for (const aufgabe of aufgaben) {
        if (!gezeigte.includes(aufgabe.id)) {
          new Notification("Umzugsplaner – Erinnerung", {
            body: aufgabe.beschreibung,
            icon: "/logo192.png",
          });
          neueGezeigte.push(aufgabe.id);
        }
      }

      // Keep only last 200 IDs to prevent storage bloat
      if (neueGezeigte.length > 200) {
        neueGezeigte.splice(0, neueGezeigte.length - 200);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(neueGezeigte));
    };

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    pruefeErinnerungen();
    timerRef.current = setInterval(pruefeErinnerungen, 60 * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userId]);
};

export default useErinnerungen;
