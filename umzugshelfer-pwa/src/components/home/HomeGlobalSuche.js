import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Wrench,
  ChefHat,
  Pill,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { answerSemanticHouseholdQuestion } from "../../utils/assistantAi";
import { resolveLocalizedRecipe } from "../../utils/localizedRecipeShopping";
import DokumentVorschauModal from "./DokumentVorschauModal";
import TourOverlay from "./tour/TourOverlay";
import { TOUR_STEPS } from "./tour/tourSteps";
import { useTour } from "./tour/useTour";

const QUELLEN = [
  { key: "objekte", labelKey: "search.sources.inventory", icon: Package, farbe: "text-blue-500", pfad: "/home/inventar" },
  { key: "vorraete", labelKey: "search.sources.supplies", icon: ShoppingCart, farbe: "text-primary-500", pfad: "/home/vorraete" },
  { key: "medikamente", labelKey: "search.sources.medicines", icon: Pill, farbe: "text-rose-500", pfad: "/home/heimapotheke" },
  { key: "geraete", labelKey: "search.sources.devices", icon: Wrench, farbe: "text-orange-500", pfad: "/home/geraete" },
  { key: "aufgaben", labelKey: "search.sources.tasks", icon: CheckSquare, farbe: "text-purple-500", pfad: "/home/aufgaben" },
  { key: "dokumente", labelKey: "search.sources.documents", icon: FileText, farbe: "text-indigo-500", pfad: "/home/dokumente" },
  { key: "buecher", labelKey: "search.sources.books", icon: BookOpen, farbe: "text-teal-500", pfad: "/home/inventar?tab=buecher" },
  { key: "rezepte", labelKey: "search.sources.recipes", icon: ChefHat, farbe: "text-emerald-500", pfad: "/home/kochbuch" },
];

const recipeMatchesQuery = (recipe, query) => {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return false;
  const localizedDe = resolveLocalizedRecipe(recipe, "de");
  const localizedEn = resolveLocalizedRecipe(recipe, "en-GB");
  const haystack = [
    recipe.titel,
    recipe.beschreibung,
    ...(recipe.tags || []),
    localizedDe.title,
    localizedDe.description,
    ...(localizedDe.instructions || []),
    ...(localizedDe.tags || []),
    localizedEn.title,
    localizedEn.description,
    ...(localizedEn.instructions || []),
    ...(localizedEn.tags || []),
    recipe.quelle_plattform,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
};

const Schnellsuche = ({ session }) => {
  const { t } = useTranslation(["home"]);
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const [suchbegriff, setSuchbegriff] = useState("");
  const [loading, setLoading] = useState(false);
  const [ergebnisse, setErgebnisse] = useState({});
  const debounceRef = useRef(null);

  const suche = useCallback(
    async (q) => {
      if (!userId || q.length < 2) {
        setErgebnisse({});
        return;
      }
      setLoading(true);
      try {
        const [
          objekteRes,
          vorraeteRes,
          medikamenteRes,
          geraeteRes,
          aufgabenRes,
          dokumenteRes,
          buecherRes,
          rezepteRes,
        ] = await Promise.all([
          supabase
            .from("home_objekte")
            .select("id, name, status, kategorie")
            .eq("user_id", userId)
            .ilike("name", `%${q}%`)
            .neq("status", "entsorgt")
            .limit(5),
          supabase
            .from("home_vorraete")
            .select("id, name, kategorie, bestand, einheit")
            .eq("user_id", userId)
            .ilike("name", `%${q}%`)
            .limit(5),
          supabase
            .from("home_medikamente")
            .select("id, name, wirkstoff, kategorie, bestand, lagerort")
            .eq("user_id", userId)
            .or(`name.ilike.%${q}%,wirkstoff.ilike.%${q}%`)
            .limit(5),
          supabase
            .from("home_geraete")
            .select("id, name, hersteller, naechste_wartung")
            .eq("user_id", userId)
            .ilike("name", `%${q}%`)
            .limit(5),
          supabase
            .from("todo_aufgaben")
            .select("id, beschreibung, erledigt, kategorie")
            .eq("user_id", userId)
            .in("app_modus", ["home", "beides"])
            .ilike("beschreibung", `%${q}%`)
            .eq("erledigt", false)
            .limit(5),
          supabase
            .from("dokumente")
            .select("id, dateiname, kategorie")
            .eq("user_id", userId)
            .in("app_modus", ["home", "beides"])
            .ilike("dateiname", `%${q}%`)
            .limit(5),
          supabase
            .from("home_buecher")
            .select("id, titel, autor_anzeige, isbn_13, status")
            .eq("user_id", userId)
            .or(`titel.ilike.%${q}%,autor_anzeige.ilike.%${q}%,isbn_13.ilike.%${q}%`)
            .neq("status", "entsorgt")
            .limit(5),
          supabase
            .from("home_rezepte")
            .select("id, titel, beschreibung, quelle_plattform, tags, localized_content")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(100),
        ]);

        setErgebnisse({
          objekte: objekteRes.data || [],
          vorraete: vorraeteRes.data || [],
          medikamente: medikamenteRes.data || [],
          geraete: geraeteRes.data || [],
          aufgaben: aufgabenRes.data || [],
          dokumente: dokumenteRes.data || [],
          buecher: buecherRes.data || [],
          rezepte: (rezepteRes.data || []).filter((recipe) => recipeMatchesQuery(recipe, q)).slice(0, 5),
        });
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const handleInput = (value) => {
    setSuchbegriff(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => suche(value), 350);
  };

  useEffect(() => {
    const assistantFlow = location.state?.assistantFlow;
    const prefillQuery = assistantFlow?.ui_state?.prefillQuery || assistantFlow?.params?.query || "";
    if (!prefillQuery) return;
    setSuchbegriff(prefillQuery);
    suche(prefillQuery);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, suche]);

  const hatErgebnisse = Object.values(ergebnisse).some((arr) => arr.length > 0);

  return (
    <>
      <div data-tour="tour-suche-feld" className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
        {loading && (
          <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-light-text-secondary dark:text-dark-text-secondary" />
        )}
        <input
          value={suchbegriff}
          onChange={(event) => handleInput(event.target.value)}
          placeholder={t("home:search.quickPlaceholder")}
          className="w-full rounded-card-sm border border-light-border bg-light-card py-3 pl-10 pr-10 text-sm text-light-text-main shadow-elevation-2 focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
          autoFocus
        />
      </div>

      {suchbegriff.length >= 2 && !loading && !hatErgebnisse && (
        <div className="py-8 text-center text-light-text-secondary dark:text-dark-text-secondary">
          <Search size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("home:search.noResults", { query: suchbegriff })}</p>
        </div>
      )}

      {hatErgebnisse && (
        <div className="space-y-5">
          {QUELLEN.map(({ key, labelKey, icon: Icon, farbe, pfad }) => {
            const items = ergebnisse[key] || [];
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2">
                  <Icon size={14} className={farbe} />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    {t(`home:${labelKey}`)}
                  </h2>
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => navigate(pfad)}
                      className="w-full rounded-card border border-light-border bg-light-card p-3 text-left shadow-elevation-2 transition-colors hover:border-primary-500/50 dark:border-dark-border dark:bg-canvas-2"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={14} className={`${farbe} flex-shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-light-text-main dark:text-dark-text-main">
                            {item.titel || item.name || item.dateiname || item.beschreibung}
                          </p>
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            {item.autor_anzeige || item.kategorie || item.hersteller || (item.bestand !== undefined ? `${item.bestand} ${item.einheit}` : "")}
                          </p>
                        </div>
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
        <div className="py-8 text-center text-light-text-secondary dark:text-dark-text-secondary">
          <p className="text-sm">{t("home:search.minChars")}</p>
          <p className="mt-1 text-xs opacity-70">
            {t("home:search.quickHint")}
          </p>
        </div>
      )}
    </>
  );
};

const KiAssistent = ({ session }) => {
  const { t } = useTranslation(["home"]);
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const [frage, setFrage] = useState("");
  const [loading, setLoading] = useState(false);
  const [antwort, setAntwort] = useState(null);
  const [fehler, setFehler] = useState("");
  const [verlauf, setVerlauf] = useState([]);
  const [quellenDokumente, setQuellenDokumente] = useState([]);
  const [vorschauDok, setVorschauDok] = useState(null);

  const stelleFrage = async () => {
    const trimmed = frage.trim();
    if (!trimmed || !userId) return;
    setLoading(true);
    setFehler("");
    setAntwort(null);
    setQuellenDokumente([]);

    try {
      const result = await answerSemanticHouseholdQuestion({
        userId,
        question: trimmed,
      });
      setAntwort(result.answer);
      setQuellenDokumente(
        (result.sources || [])
          .filter((source) => source.documentId)
          .map((source) => ({ titel: source.title, dokument_id: source.documentId })),
      );
      setVerlauf((prev) => [{ frage: trimmed, antwort: result.answer }, ...prev].slice(0, 10));
      setFrage("");
    } catch (error) {
      setFehler(error.message || t("home:search.aiError"));
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        <input
          value={frage}
          onChange={(event) => setFrage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !loading) {
              stelleFrage();
            }
          }}
          placeholder={t("home:search.aiPlaceholder")}
          className="flex-1 rounded-card-sm border border-light-border bg-light-card px-4 py-3 text-sm text-light-text-main shadow-elevation-2 focus:border-purple-500 focus:outline-none dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
          autoFocus
        />
        <button
          onClick={stelleFrage}
          disabled={!frage.trim() || loading}
          className="rounded-pill bg-purple-500 px-4 py-3 text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {fehler && (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} />
          {fehler}
        </div>
      )}

      {antwort && (
        <div className="mb-6 rounded-card border border-violet-500/20 bg-violet-500/10 p-4 shadow-elevation-2">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-500">
              {t("home:search.aiAnswer")}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-light-text-main dark:text-dark-text-main">
            {antwort}
          </p>
          {quellenDokumente.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-violet-500/20 pt-3">
              {quellenDokumente.map((quelle, index) => (
                <div key={`${quelle.dokument_id}-${index}`} className="flex items-center gap-1">
                  <button
                    onClick={() => oeffneVorschau(quelle.dokument_id)}
                    className="inline-flex items-center gap-1.5 rounded-card-sm bg-violet-500/15 px-2.5 py-1.5 text-xs text-violet-400 transition-colors hover:bg-violet-500/25"
                  >
                    <FileText size={12} />
                    {quelle.titel}
                  </button>
                  <button
                    onClick={() => navigate("/home/dokumente", { state: { focusDokumentId: quelle.dokument_id } })}
                    className="rounded-card-sm bg-violet-500/10 p-1.5 text-violet-400 transition-colors hover:bg-violet-500/20"
                    title={t("home:search.openInDocuments")}
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

      {verlauf.length > 1 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
            {t("home:search.previousQuestions")}
          </p>
          {verlauf.slice(1).map((eintrag, index) => (
            <div
              key={`${eintrag.frage}-${index}`}
              className="rounded-card border border-light-border bg-light-card p-3 shadow-elevation-2 dark:border-dark-border dark:bg-canvas-2"
            >
              <p className="mb-1 text-xs font-medium text-light-text-main dark:text-dark-text-main">
                ?? {eintrag.frage}
              </p>
              <p className="line-clamp-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {eintrag.antwort}
              </p>
            </div>
          ))}
        </div>
      )}

      {verlauf.length === 0 && !loading && (
        <div className="py-8 text-center text-light-text-secondary dark:text-dark-text-secondary">
          <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("home:search.askQuestion")}</p>
          <div className="mt-4 space-y-2">
            {[
              t("home:search.examples.whereCable"),
              t("home:search.examples.restock"),
              t("home:search.examples.maintenance"),
            ].map((beispiel) => (
              <button
                key={beispiel}
                onClick={() => setFrage(beispiel)}
                className="block w-full rounded-card-sm border border-light-border px-3 py-2 text-left text-xs text-light-text-secondary transition-colors hover:border-purple-500/40 hover:text-light-text-main dark:border-dark-border dark:text-dark-text-secondary dark:hover:text-dark-text-main"
              >
                {beispiel}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const HomeGlobalSuche = ({ session }) => {
  const { t } = useTranslation(["home"]);
  const location = useLocation();
  const [modus, setModus] = useState(
    location.state?.assistantFlow?.ui_state?.startMode === "semantic" ? "ki" : "schnell",
  );
  const {
    active: tourAktiv,
    schritt,
    setSchritt,
    beenden: tourBeenden,
  } = useTour("suche");

  useEffect(() => {
    const startMode = location.state?.assistantFlow?.ui_state?.startMode;
    if (startMode === "semantic") {
      setModus("ki");
    } else if (startMode === "schnell") {
      setModus("schnell");
    }
  }, [location.state]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 lg:px-6">
      <div className="flex items-center gap-2">
        <Search size={22} className="text-primary-500" />
        <h1 className="text-xl font-bold text-light-text-main dark:text-dark-text-main">
          {t("home:search.title")}
        </h1>
      </div>

      <div data-tour="tour-suche-tabs" className="flex gap-1 rounded-card bg-light-border p-1 dark:bg-dark-border">
        <button
          onClick={() => setModus("schnell")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-card-sm px-3 py-2 text-sm font-medium transition-colors ${
            modus === "schnell"
              ? "bg-light-card text-light-text-main shadow-elevation-2 dark:bg-canvas-2 dark:text-dark-text-main"
              : "text-light-text-secondary hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
          }`}
        >
          <Search size={14} />
          {t("home:search.quick")}
        </button>
        <button
          onClick={() => setModus("ki")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-card-sm px-3 py-2 text-sm font-medium transition-colors ${
            modus === "ki"
              ? "bg-light-card text-light-text-main shadow-elevation-2 dark:bg-canvas-2 dark:text-dark-text-main"
              : "text-light-text-secondary hover:text-light-text-main dark:text-dark-text-secondary dark:hover:text-dark-text-main"
          }`}
        >
          <Sparkles size={14} />
          {t("home:search.ai")}
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
