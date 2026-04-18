import React, { useState, useCallback, useRef, useEffect } from "react";
import { Search, Package, ShoppingCart, Wrench, CheckSquare, FileText, BookOpen, Loader2, Sparkles, AlertTriangle, Send, ExternalLink } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";
import OpenAI from "openai";
import TourOverlay from "./tour/TourOverlay";
import { useTour } from "./tour/useTour";
import { TOUR_STEPS } from "./tour/tourSteps";
import DokumentVorschauModal from "./DokumentVorschauModal";
import { cleanKiJsonResponse } from "../../utils/kiClient";

const QUELLEN = [
  { key: "objekte",   label: "Inventar",  icon: Package,      farbe: "text-blue-500",    pfad: "/home/inventar" },
  { key: "vorraete",  label: "Vorräte",   icon: ShoppingCart, farbe: "text-primary-500",  pfad: "/home/vorraete" },
  { key: "geraete",   label: "Geräte",    icon: Wrench,        farbe: "text-orange-500",  pfad: "/home/geraete" },
  { key: "aufgaben",  label: "Aufgaben",  icon: CheckSquare,   farbe: "text-purple-500",  pfad: "/home/aufgaben" },
  { key: "dokumente", label: "Dokumente", icon: FileText,      farbe: "text-indigo-500",  pfad: "/home/dokumente" },
  { key: "buecher",   label: "Bücher",    icon: BookOpen,      farbe: "text-teal-500",    pfad: "/home/inventar?tab=buecher" },
];

// ─── Schnellsuche ────────────────────────────────────────────────────────────

const Schnellsuche = ({ session }) => {
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const [suchbegriff, setSuchbegriff] = useState("");
  const [loading, setLoading] = useState(false);
  const [ergebnisse, setErgebnisse] = useState({});
  const debounceRef = useRef(null);

  const suche = useCallback(async (q) => {
    if (!userId || q.length < 2) { setErgebnisse({}); return; }
    setLoading(true);
    try {
      const [objekteRes, vorraeteRes, geraeteRes, aufgabenRes, dokumenteRes, buecherRes] = await Promise.all([
        supabase.from("home_objekte").select("id, name, status, kategorie").eq("user_id", userId).ilike("name", `%${q}%`).neq("status", "entsorgt").limit(5),
        supabase.from("home_vorraete").select("id, name, kategorie, bestand, einheit").eq("user_id", userId).ilike("name", `%${q}%`).limit(5),
        supabase.from("home_geraete").select("id, name, hersteller, naechste_wartung").eq("user_id", userId).ilike("name", `%${q}%`).limit(5),
        supabase.from("todo_aufgaben").select("id, beschreibung, erledigt, kategorie").eq("user_id", userId).in("app_modus", ["home", "beides"]).ilike("beschreibung", `%${q}%`).eq("erledigt", false).limit(5),
        supabase.from("dokumente").select("id, dateiname, kategorie").eq("user_id", userId).ilike("dateiname", `%${q}%`).limit(5),
        supabase.from("home_buecher").select("id, titel, autor_anzeige, isbn_13, status").eq("user_id", userId).or(`titel.ilike.%${q}%,autor_anzeige.ilike.%${q}%,isbn_13.ilike.%${q}%`).neq("status", "entsorgt").limit(5),
      ]);
      setErgebnisse({
        objekte: objekteRes.data || [], vorraete: vorraeteRes.data || [],
        geraete: geraeteRes.data || [], aufgaben: aufgabenRes.data || [],
        dokumente: dokumenteRes.data || [], buecher: buecherRes.data || [],
      });
    } finally { setLoading(false); }
  }, [userId]);

  const handleInput = (val) => {
    setSuchbegriff(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => suche(val), 350);
  };

  const hatErgebnisse = Object.values(ergebnisse).some((arr) => arr.length > 0);

  return (
    <>
      <div data-tour="tour-suche-feld" className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
        {loading && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-light-text-secondary dark:text-dark-text-secondary" />}
        <input value={suchbegriff} onChange={(e) => handleInput(e.target.value)} placeholder="Stichwort eingeben …" className="w-full pl-10 pr-10 py-3 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500 shadow-elevation-2" autoFocus />
      </div>

      {suchbegriff.length >= 2 && !loading && !hatErgebnisse && (
        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
          <Search size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Keine Ergebnisse für „{suchbegriff}"</p>
        </div>
      )}

      {hatErgebnisse && (
        <div className="space-y-5">
          {QUELLEN.map(({ key, label, icon: Icon, farbe, pfad }) => {
            const items = ergebnisse[key] || [];
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={farbe} />
                  <h2 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{label}</h2>
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <button key={item.id} onClick={() => navigate(pfad)} className="w-full flex items-center gap-3 p-3 rounded-card shadow-elevation-2 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border hover:border-primary-500/50 transition-colors text-left">
                      <Icon size={14} className={`${farbe} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">{item.titel || item.name || item.dateiname || item.beschreibung}</p>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{item.autor_anzeige || item.kategorie || item.hersteller || (item.bestand !== undefined ? `${item.bestand} ${item.einheit}` : "")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suchbegriff.length < 2 && (
        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
          <p className="text-sm">Mindestens 2 Zeichen eingeben</p>
          <p className="text-xs mt-1 opacity-70">Durchsucht Inventar, Vorräte, Geräte, Aufgaben und Dokumente</p>
        </div>
      )}
    </>
  );
};

// ─── KI-Assistent ────────────────────────────────────────────────────────────

const KiAssistent = ({ session }) => {
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyGeladen, setApiKeyGeladen] = useState(false);
  const [apiKeyFehler, setApiKeyFehler] = useState(false);
  const [frage, setFrage] = useState("");
  const [loading, setLoading] = useState(false);
  const [antwort, setAntwort] = useState(null);
  const [fehler, setFehler] = useState("");
  const [verlauf, setVerlauf] = useState([]); // [{frage, antwort}]
  const [quellenDokumente, setQuellenDokumente] = useState([]); // [{titel, dokument_id}]
  const [vorschauDok, setVorschauDok] = useState(null); // {storage_pfad, dateiname, datei_typ} | null

  // API-Key aus user_profile laden
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_profile").select("openai_api_key").eq("id", userId).single()
      .then(({ data }) => {
        if (data?.openai_api_key) {
          setApiKey(data.openai_api_key);
          setApiKeyGeladen(true);
        } else {
          setApiKeyFehler(true);
        }
      });
  }, [userId]);

  const stelleFrage = async () => {
    const f = frage.trim();
    if (!f || !apiKey) return;
    setLoading(true);
    setFehler("");
    setAntwort(null);
    setQuellenDokumente([]);

    try {
      // Alle Home-Daten als Kontext laden
      const [objekteRes, vorraeteRes, geraeteRes, lagerorteRes, buecherRes, budgetRes, wissenRes, wartungenRes, todosRes] = await Promise.all([
        supabase.from("home_objekte").select("name, kategorie, status, tags").eq("user_id", userId).neq("status", "entsorgt").limit(100),
        supabase.from("home_vorraete").select("name, kategorie, bestand, einheit, mindestmenge").eq("user_id", userId).limit(50),
        supabase.from("home_geraete").select("name, hersteller, modell, naechste_wartung, kaufdatum, garantie_bis").eq("user_id", userId).limit(50),
        supabase.from("home_lagerorte").select("name, ort_id, home_orte(name)").eq("user_id", userId).limit(50),
        supabase.from("home_buecher").select("id, titel, autor_anzeige, isbn_13, status, verliehen_an_name, rueckgabe_erwartet_am, tags").eq("user_id", userId).limit(100),
        supabase.from("budget_posten").select("beschreibung, betrag, datum, kategorie, typ").eq("user_id", userId).order("datum", { ascending: false }).limit(200),
        supabase.from("home_wissen").select("id, dokument_id, titel, inhalt, kategorie, tags").eq("user_id", userId).limit(100),
        supabase.from("home_wartungen").select("datum, typ, beschreibung, home_geraete(name)").eq("user_id", userId).order("datum", { ascending: false }).limit(50),
        supabase.from("todo_aufgaben").select("beschreibung, kategorie").eq("user_id", userId).eq("erledigt", false).limit(50),
      ]);

      const lagerorte = lagerorteRes.data || [];
      const objekte = objekteRes.data || [];
      const vorraete = vorraeteRes.data || [];
      const geraete = geraeteRes.data || [];
      const buecher = buecherRes.data || [];
      const budgetPosten = budgetRes.data || [];
      const wissen = wissenRes.data || [];
      const wartungen = wartungenRes.data || [];
      const todos = todosRes.data || [];

      const wissenRefs = {};
      wissen.forEach((w, i) => { wissenRefs[`W${i + 1}`] = w; });

      const kontext = [
        objekte.length > 0 && `## Inventar (${objekte.length} Objekte)\n` + objekte.map((o) => `- ${o.name}${o.kategorie ? ` (${o.kategorie})` : ""}${o.tags?.length ? ` [${o.tags.join(", ")}]` : ""}`).join("\n"),
        lagerorte.length > 0 && `## Lagerorte\n` + lagerorte.map((l) => `- ${l.name}${l.home_orte?.name ? ` → ${l.home_orte.name}` : ""}`).join("\n"),
        vorraete.length > 0 && `## Vorräte\n` + vorraete.map((v) => `- ${v.name}: ${v.bestand} ${v.einheit || ""} (Min: ${v.mindestmenge || 0})`).join("\n"),
        geraete.length > 0 && `## Geräte\n` + geraete.map((g) => {
          let zeile = `- ${g.name}`;
          if (g.hersteller || g.modell) zeile += ` (${[g.hersteller, g.modell].filter(Boolean).join(" ")})`;
          if (g.kaufdatum) zeile += `, Kauf: ${g.kaufdatum}`;
          if (g.garantie_bis) zeile += `, Garantie bis: ${g.garantie_bis}`;
          if (g.naechste_wartung) zeile += `, nächste Wartung: ${g.naechste_wartung}`;
          return zeile;
        }).join("\n"),
        buecher.length > 0 && `## Bibliothek (${buecher.length} Bücher)\n` + buecher.map((b) => {
          let zeile = `- ${b.titel}${b.autor_anzeige ? ` von ${b.autor_anzeige}` : ""}`;
          if (b.status === "verliehen") zeile += ` [verliehen an ${b.verliehen_an_name ?? "unbekannt"}${b.rueckgabe_erwartet_am ? `, bis ${b.rueckgabe_erwartet_am}` : ""}]`;
          else zeile += ` [${b.status}]`;
          return zeile;
        }).join("\n"),
        budgetPosten.length > 0 && `## Budget-Einträge (${budgetPosten.length} Einträge, neueste zuerst)\n` + budgetPosten.map((b) => `- ${b.datum} | ${b.beschreibung || "–"} | ${b.typ === "einnahme" ? "+" : "-"}${b.betrag} € | ${b.kategorie || "–"}`).join("\n"),
        wissen.length > 0 && `## Wissensdatenbank (${wissen.length} Einträge)\n` + wissen.map((w, i) => {
          let zeile = `- [W${i + 1}] [${w.kategorie || "–"}] ${w.titel}`;
          if (w.inhalt) zeile += `: ${w.inhalt.substring(0, 300)}`;
          if (w.tags?.length) zeile += ` [${w.tags.join(", ")}]`;
          return zeile;
        }).join("\n"),
        wartungen.length > 0 && `## Wartungshistorie\n` + wartungen.map((w) => `- ${w.datum}: ${w.home_geraete?.name || "Gerät"} – ${w.beschreibung || w.typ || "Wartung"}`).join("\n"),
        todos.length > 0 && `## Offene Aufgaben\n` + todos.map((t) => `- ${t.beschreibung}${t.kategorie ? ` (${t.kategorie})` : ""}`).join("\n"),
      ].filter(Boolean).join("\n\n");

      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Du bist ein hilfreicher Haushalts-Assistent mit vollständigem Zugriff auf die Haushaltsdaten des Nutzers. Die Daten umfassen: Inventar, Lagerorte, Vorräte, Geräte (mit Garantie- und Wartungsterminen), Bibliothek, alle Budget-Einträge und Ausgaben, Wissensdatenbank (Dokumente, Versicherungen, Verträge, Rechnungen), Wartungshistorie und offene Aufgaben. Beantworte alle Fragen präzise auf Deutsch anhand dieser Daten. Wenn du etwas nicht findest, sage es ehrlich. Antworte IMMER als JSON in diesem Format: {"antwort": "...", "quellen": ["W1", "W3"]}. Setze in "quellen" die Referenzschlüssel (W1, W2, ...) der Wissensdatenbank-Einträge, die du für die Antwort verwendet hast. Wenn keine Wissensdatenbank-Einträge relevant sind, gib ein leeres Array zurück.`,
          },
          {
            role: "user",
            content: `Mein Haushalt:\n${kontext || "(Noch keine Daten vorhanden)"}\n\nFrage: ${f}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      const a = response.choices[0].message.content;

      let antwortText = a;
      let resolvedQuellen = [];
      try {
        const cleaned = cleanKiJsonResponse(a, "object");
        const parsed = JSON.parse(cleaned);
        if (parsed?.antwort) {
          antwortText = parsed.antwort;
          resolvedQuellen = (parsed.quellen || [])
            .map((ref) => wissenRefs[ref])
            .filter((w) => w?.dokument_id)
            .map((w) => ({ titel: w.titel, dokument_id: w.dokument_id }));
        }
      } catch { /* kein JSON → plain text, kein Problem */ }

      setAntwort(antwortText);
      setQuellenDokumente(resolvedQuellen);
      setVerlauf((prev) => [{ frage: f, antwort: antwortText }, ...prev].slice(0, 10));
      setFrage("");
    } catch (e) {
      setFehler(e.message || "Fehler bei der KI-Anfrage.");
    } finally {
      setLoading(false);
    }
  };

  const oeffneVorschau = async (dokumentId) => {
    const { data } = await supabase
      .from("dokumente")
      .select("storage_pfad, dateiname, datei_typ")
      .eq("id", dokumentId)
      .single();
    if (data) setVorschauDok(data);
  };

  if (apiKeyFehler && !apiKey) {
    return (
      <div className="text-center py-10">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
        <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1">Kein OpenAI API-Key hinterlegt</p>
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Hinterlege deinen API-Key im KI-Packlisten-Assistenten (Umzugs-Modus) unter Einstellungen.</p>
      </div>
    );
  }

  if (!apiKeyGeladen && !apiKeyFehler) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-light-text-secondary dark:text-dark-text-secondary" /></div>;
  }

  return (
    <div>
      {/* Eingabe */}
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && stelleFrage()}
          placeholder="z.B. Wo ist das HDMI-Kabel? Was brauche ich nachkaufen?"
          className="flex-1 px-4 py-3 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-purple-500 shadow-elevation-2"
          autoFocus
        />
        <button
          onClick={stelleFrage}
          disabled={!frage.trim() || loading}
          className="px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-pill disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {fehler && (
        <div className="mb-4 p-3 rounded-card bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} />{fehler}
        </div>
      )}

      {/* Aktuelle Antwort — keep violet/purple theme */}
      {antwort && (
        <div className="mb-6 p-4 rounded-card shadow-elevation-2 bg-violet-500/10 border border-violet-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-purple-500" />
            <span className="text-xs font-semibold text-purple-500 uppercase tracking-wider">KI-Antwort</span>
          </div>
          <p className="text-sm text-light-text-main dark:text-dark-text-main whitespace-pre-wrap">{antwort}</p>
          {quellenDokumente.length > 0 && (
            <div className="mt-3 pt-3 border-t border-violet-500/20 flex flex-wrap gap-2">
              {quellenDokumente.map((q, i) => (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => oeffneVorschau(q.dokument_id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors"
                  >
                    <FileText size={12} /> {q.titel}
                  </button>
                  <button
                    onClick={() => navigate("/home/dokumente", { state: { focusDokumentId: q.dokument_id } })}
                    className="p-1.5 rounded-card-sm bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
                    title="Im Dokumentarchiv öffnen"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vorschauDok && (
        <DokumentVorschauModal
          storagePfad={vorschauDok.storage_pfad}
          dateiname={vorschauDok.dateiname}
          datei_typ={vorschauDok.datei_typ}
          onSchliessen={() => setVorschauDok(null)}
        />
      )}

      {/* Früherer Verlauf */}
      {verlauf.length > 1 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">Frühere Fragen</p>
          {verlauf.slice(1).map((v, i) => (
            <div key={i} className="p-3 rounded-card shadow-elevation-2 bg-light-card dark:bg-canvas-2 border border-light-border dark:border-dark-border">
              <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main mb-1">❓ {v.frage}</p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">{v.antwort}</p>
            </div>
          ))}
        </div>
      )}

      {verlauf.length === 0 && !loading && (
        <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
          <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Stelle eine Frage zu deinem Haushalt</p>
          <div className="mt-4 space-y-2">
            {["Wo ist das HDMI-Kabel?", "Was muss ich nachkaufen?", "Welche Geräte brauchen bald Wartung?"].map((b) => (
              <button key={b} onClick={() => setFrage(b)} className="block w-full text-left px-3 py-2 text-xs rounded-card-sm border border-light-border dark:border-dark-border hover:border-purple-500/40 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main transition-colors">
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

const HomeGlobalSuche = ({ session }) => {
  const [modus, setModus] = useState("schnell"); // "schnell" | "ki"
  const { active: tourAktiv, schritt, setSchritt, beenden: tourBeenden } = useTour("suche");

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Search size={22} className="text-primary-500" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">Suche</h1>
      </div>

      {/* Modus-Tabs */}
      <div data-tour="tour-suche-tabs" className="flex gap-1 p-1 bg-light-border dark:bg-dark-border rounded-card">
        <button
          onClick={() => setModus("schnell")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-card-sm text-sm font-medium transition-colors ${modus === "schnell" ? "bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main shadow-elevation-2" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}
        >
          <Search size={14} />Schnellsuche
        </button>
        <button
          onClick={() => setModus("ki")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-card-sm text-sm font-medium transition-colors ${modus === "ki" ? "bg-light-card dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main shadow-elevation-2" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"}`}
        >
          <Sparkles size={14} />KI-Assistent
        </button>
      </div>

      {modus === "schnell" ? <Schnellsuche session={session} /> : <KiAssistent session={session} />}

      {tourAktiv && (
        <TourOverlay
          steps={TOUR_STEPS.suche}
          schritt={schritt}
          onSchritt={setSchritt}
          onBeenden={tourBeenden}
        />
      )}
    </div>
  );
};

export default HomeGlobalSuche;
