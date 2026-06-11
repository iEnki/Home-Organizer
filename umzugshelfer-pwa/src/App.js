import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sanitizeMobileNavFavorites } from "./config/mobileNavConfig";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase, setActiveHouseholdId } from "./supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppModeProvider, useAppMode } from "./contexts/AppModeContext";
import { TourProvider, useTourContext } from "./contexts/TourContext";
import { useLocale } from "./contexts/LocaleContext";
import { ToastProvider } from "./hooks/useToast";
import useViewport from "./hooks/useViewport";

// ── UI Primitives ──────────────────────────────────────────────────────────────
import BeamsBackground from "./components/ui/BeamsBackground";

// ── Layout ─────────────────────────────────────────────────────────────────────
import Sidebar from "./components/layout/Sidebar";
import Topbar  from "./components/layout/Topbar";
import MobileBottomNav from "./components/layout/MobileBottomNav";
import MobileMoreSheet from "./components/layout/MobileMoreSheet";
import MobileSearchSheet from "./components/layout/MobileSearchSheet";
import HomeOnboarding       from "./components/home/HomeOnboarding";
import TourPromptModal      from "./components/home/tour/TourPromptModal";
import ForcedPasswordChangeModal from "./components/ForcedPasswordChangeModal";
const GlobalAssistantLauncher = lazy(() => import("./components/assistant/GlobalAssistantLauncher"));

// ── Home Organizer Komponenten ─────────────────────────────────────────────────
const HomeDashboard = lazy(() => import("./components/home/HomeDashboard"));
const HomeRechnungScannen = lazy(() => import("./components/home/HomeRechnungScannen"));
const HomeInventar = lazy(() => import("./components/home/HomeInventar"));
const HomeGlobalSuche = lazy(() => import("./components/home/HomeGlobalSuche"));
const HomeVorraete = lazy(() => import("./components/home/HomeVorraete"));
const HomeHeimapotheke = lazy(() => import("./components/home/HomeHeimapotheke"));
const HomeEinkaufliste = lazy(() => import("./components/home/HomeEinkaufliste"));
const HomeHaushaltsaufgaben = lazy(() => import("./components/home/HomeHaushaltsaufgaben"));
const HomeBewohner = lazy(() => import("./components/home/HomeBewohner"));
const HomeGeraete = lazy(() => import("./components/home/HomeGeraete"));
const HomeKfz = lazy(() => import("./components/home/HomeKfz"));
const HomeBudget = lazy(() => import("./components/home/HomeBudget"));
const HomeProjekte = lazy(() => import("./components/home/HomeProjekte"));
const HomeVerlauf = lazy(() => import("./components/home/HomeVerlauf"));
const HomeWissen = lazy(() => import("./components/home/HomeWissen"));
const HomeDokumente = lazy(() => import("./components/home/HomeDokumente"));
const HomeKochbuch = lazy(() => import("./components/home/HomeKochbuch"));

// ── Umzugsplaner Komponenten ───────────────────────────────────────────────────
const Dashboard = lazy(() => import("./components/Dashboard"));
const KontaktManager = lazy(() => import("./components/KontaktManager"));
const BudgetTracker = lazy(() => import("./components/BudgetTracker"));
const TodoListenManager = lazy(() => import("./components/TodoListenManager"));
const PacklisteManager = lazy(() => import("./components/PacklisteManager"));
const Materialplaner = lazy(() => import("./components/Materialplaner"));
const BedarfsrechnerPage = lazy(() => import("./components/BedarfsrechnerPage"));
const UmzugsplanerSeite = lazy(() => import("./components/UmzugsplanerSeite"));
const HomePage = lazy(() => import("./components/LoginPage"));
const RegisterPage = lazy(() => import("./components/RegisterPage"));
const UmzugsZeitstrahl = lazy(() => import("./components/UmzugsZeitstrahl"));
const DokumentenManager = lazy(() => import("./components/DokumentenManager"));
const UpdatePasswordPage = lazy(() => import("./components/UpdatePasswordPage"));
const KostenVergleich = lazy(() => import("./components/KostenVergleich"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const KalenderUebersicht = lazy(() => import("./components/KalenderUebersicht"));
const JoinHouseholdPage = lazy(() => import("./components/JoinHouseholdPage"));

// ── Feature-Landing-Pages (öffentlich) ────────────────────────────────────────
const TodoListenFeaturePage = lazy(() => import("./components/featurepages/TodoListenFeaturePage"));
const PacklisteFeaturePage = lazy(() => import("./components/featurepages/PacklisteFeaturePage"));
const BudgetTrackerFeaturePage = lazy(() => import("./components/featurepages/BudgetTrackerFeaturePage"));
const KontaktManagerFeaturePage = lazy(() => import("./components/featurepages/KontaktManagerFeaturePage"));
const TransportFeaturePage = lazy(() => import("./components/featurepages/TransportFeaturePage"));
const RenovierungsplanerFeaturePage = lazy(() => import("./components/featurepages/RenovierungsplanerFeaturePage"));
const ZeitstrahlFeaturePage = lazy(() => import("./components/featurepages/ZeitstrahlFeaturePage"));
const KiAssistentenFeaturePage = lazy(() => import("./components/featurepages/KiAssistentenFeaturePage"));
const QrCodeFeaturePage = lazy(() => import("./components/featurepages/QrCodeFeaturePage"));

// ── Route → Seitentitel Mapping ────────────────────────────────────────────────
const ROUTE_TITLE_KEYS = {
  "/dashboard":         "nav:routes.dashboard",
  "/kontakte":          "nav:routes.contacts",
  "/budget":            "nav:routes.budget",
  "/todos":             "nav:routes.todos",
  "/packliste":         "nav:routes.packingList",
  "/materialplaner":    "nav:routes.materials",
  "/bedarfsrechner":    "nav:routes.calculator",
  "/umzugsplaner":      "nav:routes.movingPlanner",
  "/zeitstrahl":        "nav:routes.timeline",
  "/dokumente":         "nav:routes.documents",
  "/kostenvergleich":   "nav:routes.costComparison",
  "/kalender":          "nav:routes.calendar",
  "/profil":            "nav:routes.profile",
  "/home":              "nav:routes.home",
  "/home/inventar":     "nav:routes.inventory",
  "/home/suche":        "nav:routes.search",
  "/home/vorraete":     "nav:routes.stock",
  "/home/heimapotheke": "nav:routes.medicineCabinet",
  "/home/einkaufliste": "nav:routes.shopping",
  "/home/aufgaben":     "nav:routes.tasks",
  "/home/bewohner":     "nav:routes.residents",
  "/home/geraete":      "nav:routes.devices",
  "/home/kfz":          "nav:routes.vehicles",
  "/home/budget":       "nav:routes.budget",
  "/home/projekte":     "nav:routes.projects",
  "/home/verlauf":      "nav:routes.history",
  "/home/wissen":       "nav:routes.knowledge",
  "/home/kochbuch":     "nav:routes.cookbook",
  "/home/rechnung-scannen": "nav:routes.scanInvoice",
  "/home/dokumente":    "nav:routes.documentArchive",
};

// ── Modus-bewusster Redirect nach Login ────────────────────────────────────────
// Liest appMode synchron aus dem Context (bereits aus localStorage initialisiert),
// sodass Home-Organizer-Nutzer direkt zu /home weitergeleitet werden.
export const UMZUG_ROUTE_PREFIXES = [
  "/dashboard",
  "/budget",
  "/kontakte",
  "/todos",
  "/packliste",
  "/materialplaner",
  "/bedarfsrechner",
  "/umzugsplaner",
  "/zeitstrahl",
  "/dokumente",
  "/kostenvergleich",
];

export const isUmzugRoutePath = (pathname = "") =>
  UMZUG_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const SmartRedirect = () => {
  const { appMode, modusGeladen } = useAppMode();
  // Warten bis Modus aus Supabase geladen — verhindert Flash auf /dashboard bei gecleared localStorage
  if (!modusGeladen) return null;
  return <Navigate to={appMode === "home" ? "/home" : "/dashboard"} replace />;
};

// ── Cross-Device Sync (Modus-Persistenz in Supabase) ──────────────────────────
const HomeModusSyncer = ({ session, householdContext }) => {
  const { appMode, switchToHome, switchToUmzug, markOnboardingGezeigt, setModusGeladen, modusGeladen, deaktiviereUmzug, umzugDeaktiviert, clearUmzugDeaktiviert } = useAppMode();
  const navigate  = useNavigate();
  const location  = useLocation();
  const userId    = session?.user?.id;
  const [isAdmin, setIsAdmin] = useState(false);

  // Beim Login: Modus + umzug_deaktiviert einmalig aus Supabase laden.
  // setModusGeladen(true) gibt SmartRedirect und OnboardingGate frei.
  //
  // householdContext wird bei JEDER Navigation neu geladen (location.pathname-Dep
  // in syncHouseholdContext). Um eine Race Condition zu verhindern — bei der ein
  // noch nicht persistierter Moduswechsel durch den Re-Fetch überschrieben wird —
  // wird der appMode nach dem Erstladen (modusGeladen=true) NICHT mehr aus der DB
  // überschrieben. Nur das umzug_deaktiviert-Flag wird weiterhin synchronisiert,
  // da es eine Admin-Entscheidung für alle Haushaltsmitglieder darstellt.
  useEffect(() => {
    if (!userId) return;
    if (!householdContext) {
      setModusGeladen(false);
      return;
    }

    const data = householdContext;
    setIsAdmin(!!data?.is_admin);

    if (modusGeladen) {
      // Bereits geladen: appMode nicht überschreiben, nur umzug_deaktiviert-Flag prüfen
      if (data?.umzug_deaktiviert === true) {
        deaktiviereUmzug();
        if (isUmzugRoutePath(location.pathname)) {
          navigate("/home", { replace: true });
        }
      } else if (data?.umzug_deaktiviert === false && umzugDeaktiviert) {
        // Admin hat Sperre aufgehoben → lokales Flag entfernen
        clearUmzugDeaktiviert();
      }
      return;
    }

    // Erstladen: Modus einmalig aus Supabase setzen
    if (data?.umzug_deaktiviert === true) {
      // Umzugsplaner dauerhaft deaktiviert → immer Home-Modus
      deaktiviereUmzug();
      markOnboardingGezeigt();
      if (isUmzugRoutePath(location.pathname)) {
        navigate("/home", { replace: true });
      }
    } else if (data?.app_modus === "home") {
      switchToHome();
      markOnboardingGezeigt();
      // Zur Home-Startseite weiterleiten, falls auf Umzug-Dashboard gelandet
      if (location.pathname === "/dashboard" || location.pathname === "/") {
        navigate("/home", { replace: true });
      }
    } else if (data?.app_modus === "umzug") {
      switchToUmzug();
      markOnboardingGezeigt();
    }
    setModusGeladen(true);
  }, [
    userId,
    householdContext,
    setModusGeladen,
    modusGeladen,
    deaktiviereUmzug,
    location.pathname,
    navigate,
    umzugDeaktiviert,
    clearUmzugDeaktiviert,
    markOnboardingGezeigt,
    switchToHome,
    switchToUmzug,
  ]);

  // Bei Modus-Änderung in Supabase persistieren —
  // aber erst nachdem der Modus aus Supabase geladen wurde (modusGeladen),
  // sonst überschreibt der localStorage-Startwert den gespeicherten Modus.
  useEffect(() => {
    if (!userId || !modusGeladen || !isAdmin) return;
    supabase
      .rpc("set_household_app_mode", { p_app_modus: appMode, p_umzug_deaktiviert: umzugDeaktiviert })
      .then(({ error }) => {
        if (error) console.error("[App] set_household_app_mode fehlgeschlagen:", error);
      });
  }, [appMode, umzugDeaktiviert, userId, modusGeladen, isAdmin]);

  return null;
};

// ── Onboarding-Gate: Modusauswahl für neue Nutzer ──────────────────────────────
const OnboardingGate = ({ session, blockOnboarding = false, children }) => {
  const { onboardingGezeigt, modusGeladen, markOnboardingGezeigt, switchToHome, switchToUmzug } = useAppMode();
  const navigate = useNavigate();

  // Warten bis Modus aus Supabase geladen → verhindert Flash des Onboarding-Modals
  // für eingeloggte User deren Modus bereits gesetzt ist
  if (session && !onboardingGezeigt && !modusGeladen) {
    return children;
  }

  if (session && !onboardingGezeigt && modusGeladen && !blockOnboarding) {
    return (
      <>
        {children}
        <HomeOnboarding
          onWaehleUmzug={() => { switchToUmzug(); markOnboardingGezeigt(); navigate("/dashboard"); }}
          onWaehleHome={() => { switchToHome(); markOnboardingGezeigt(); navigate("/home"); }}
        />
      </>
    );
  }
  return children;
};

// ── Tour-Prompt Gate (Home Organizer only) ─────────────────────────────────────
// Zeigt einmalig den Intro-Dialog wenn:
//   - Modus-Onboarding abgeschlossen (onboardingGezeigt)
//   - App-Modus aus Supabase geladen (modusGeladen)
//   - User ist im Home-Modus
//   - tour_state.intro_prompt_status === "pending"
// Globaler Session-Dialog (außerhalb Routes) — bewusste Phase-1-Entscheidung.
const TourPromptGate = ({ session }) => {
  const { appMode, onboardingGezeigt, modusGeladen } = useAppMode();
  const ctx = useTourContext();
  const navigate = useNavigate();

  if (
    !onboardingGezeigt ||
    !modusGeladen ||
    !ctx?.geladen ||
    !ctx?.tourState ||
    appMode !== "home" ||
    ctx.tourState.intro_prompt_status !== "pending"
  ) return null;

  return (
    <TourPromptModal
      onJa={() => {
        ctx.setIntroAnswer(true);
        navigate("/home");
        // Dashboard-Tour startet automatisch: useTour("dashboard") liefert active=true
        // da completed_pages.dashboard noch nicht gesetzt
      }}
      onNein={() => ctx.setIntroAnswer(false)}
    />
  );
};

// ── Authenticated Layout Shell ─────────────────────────────────────────────────
// Layout-Komponente für alle geschützten Routen.
// Rendert Sidebar + Topbar + <Outlet /> (React Router v6 Nested Route Pattern).
const AuthenticatedShell = ({
  session,
  setSession,
  householdContext,
  passwordChangeRequired,
  onPasswordChangeCompleted,
  mobileNavFavorites,
}) => {
  const { t } = useTranslation(["common", "nav"]);
  const location = useLocation();
  const navigate = useNavigate();
  const { appMode, toggleMode } = useAppMode();
  const { isDesktop, mobileBottomOffsetPx } = useViewport();
  const userId = session?.user?.id;
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Bottombar-Einstellungen öffnen: Sheet schließen + zu Profil navigieren
  const handleOpenNavSettings = useCallback(() => {
    setMobileMoreOpen(false);
    navigate("/profil", { state: { openSection: "mobile-nav" } });
  }, [navigate]);

  // Modus wechseln + automatisch zum passenden Dashboard navigieren
  const handleToggleMode = useCallback(() => {
    if (householdContext && householdContext.is_admin === false) return;
    const next = appMode === "umzug" ? "home" : "umzug";
    toggleMode();
    navigate(next === "home" ? "/home" : "/dashboard");
  }, [appMode, toggleMode, navigate, householdContext]);

  const suchTimerRef  = useRef(null);
  const assistantOpenRef = useRef(null);
  const [suchbegriff,   setSuchbegriff]   = useState("");
  const [suchergebnisse, setSuchergebnisse] = useState([]);

  // ── Suche (transplantiert aus Navbar.js) ──────────────────────────────────────
  const handleSuche = useCallback(
    async (begriff) => {
      if (!userId || !begriff || begriff.trim().length < 2) {
        setSuchergebnisse([]);
        return;
      }
      const q = begriff.trim().toLowerCase();
      try {
        const ergebnisse = [];
        if (appMode === "home") {
          const [objRes, vorratRes, medikamentRes, rezeptRes, geraetRes, fahrzeugRes, todoRes] = await Promise.all([
            supabase.from("home_objekte").select("id, name, status").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_vorraete").select("id, name, kategorie").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_medikamente").select("id, name, wirkstoff, kategorie").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_rezepte").select("id, titel, quelle_plattform").eq("user_id", userId).ilike("titel", `%${q}%`).limit(3),
            supabase.from("home_geraete").select("id, name, hersteller").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_fahrzeuge").select("id, name, kennzeichen").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("todo_aufgaben").select("id, beschreibung, kategorie").eq("user_id", userId).in("app_modus", ["home", "beides"]).ilike("beschreibung", `%${q}%`).limit(3),
          ]);
          (objRes.data    || []).forEach((o) => ergebnisse.push({ modul: t("nav:searchModules.inventory"), text: o.name,        sub: o.status,      link: "/home/inventar" }));
          (vorratRes.data || []).forEach((v) => ergebnisse.push({ modul: t("nav:searchModules.stock"),     text: v.name,        sub: v.kategorie,   link: "/home/vorraete" }));
          (medikamentRes.data || []).forEach((m) => ergebnisse.push({ modul: t("nav:searchModules.medicine"), text: m.name, sub: m.wirkstoff || m.kategorie, link: "/home/heimapotheke" }));
          (rezeptRes.data || []).forEach((r) => ergebnisse.push({ modul: t("nav:searchModules.recipe"), text: r.titel, sub: r.quelle_plattform, link: "/home/kochbuch" }));
          (geraetRes.data || []).forEach((g) => ergebnisse.push({ modul: t("nav:searchModules.device"),    text: g.name,        sub: g.hersteller,  link: "/home/geraete" }));
          (fahrzeugRes.data || []).forEach((f) => ergebnisse.push({ modul: t("nav:searchModules.vehicle"), text: f.name, sub: f.kennzeichen, link: "/home/kfz" }));
          (todoRes.data   || []).forEach((row) => ergebnisse.push({ modul: t("nav:searchModules.task"),     text: row.beschreibung,sub: row.kategorie,   link: "/home/aufgaben" }));
        } else {
          const [kontakteRes, todosRes, kistenRes, dokRes, kistenInhaltRes] = await Promise.all([
            supabase.from("kontakte").select("id, name, typ").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
            supabase.from("todo_aufgaben").select("id, beschreibung, kategorie").eq("user_id", userId).ilike("beschreibung", `%${q}%`).limit(4),
            supabase.from("pack_kisten").select("id, name, raum_neu").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
            supabase.from("dokumente").select("id, dateiname").eq("user_id", userId).ilike("dateiname", `%${q}%`).limit(4),
            supabase.from("packliste_items").select("id, name, pack_kisten(name)").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
          ]);
          (kontakteRes.data    || []).forEach((k) => ergebnisse.push({ modul: t("nav:searchModules.contact"),    text: k.name,          sub: k.typ,                               link: "/kontakte" }));
          (todosRes.data       || []).forEach((row) => ergebnisse.push({ modul: t("nav:searchModules.todo"),      text: row.beschreibung,  sub: row.kategorie,                         link: "/todos" }));
          (kistenRes.data      || []).forEach((k) => ergebnisse.push({ modul: t("nav:searchModules.box"),        text: k.name,          sub: k.raum_neu,                          link: "/packliste" }));
          (dokRes.data         || []).forEach((d) => ergebnisse.push({ modul: t("nav:searchModules.document"),   text: d.dateiname,     sub: null,                                link: "/dokumente" }));
          (kistenInhaltRes.data|| []).forEach((i) => ergebnisse.push({ modul: t("nav:searchModules.boxContent"), text: i.name,          sub: i.pack_kisten?.name ?? null,         link: "/packliste" }));
        }
        setSuchergebnisse(ergebnisse);
      } catch (_err) {
        // silent fail
      }
    },
    [userId, appMode, t]
  );

  const handleSuchInput = (val) => {
    setSuchbegriff(val);
    if (suchTimerRef.current) clearTimeout(suchTimerRef.current);
    if (val.trim().length < 2) {
      setSuchergebnisse([]);
      return;
    }
    suchTimerRef.current = setTimeout(() => handleSuche(val), 350);
  };

  const handleSuchErgebnisKlick = (link) => {
    setSuchbegriff("");
    setSuchergebnisse([]);
    navigate(link);
  };

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error logging out:", error.message);
    if (setSession) setSession(null);
    navigate("/");
  };

  const titleKey =
    location.pathname === "/home/vorraete" ? "nav:routes.stock" :
    location.pathname === "/home/heimapotheke" ? "nav:routes.medicineCabinet" :
    location.pathname === "/home/geraete" ? "nav:routes.devices" :
    location.pathname === "/home/kfz" ? "nav:routes.vehicles" :
    ROUTE_TITLE_KEYS[location.pathname] ?? "";
  const pageTitle = titleKey ? t(titleKey) : "";

  return (
    <div className="flex min-h-dvh w-full min-w-0 overflow-x-hidden bg-transparent">
      <Sidebar
        activeRoute={location.pathname}
        onNavigate={navigate}
        session={session}
        appMode={appMode}
        onToggleMode={handleToggleMode}
        mobileNavigationEnabled
      />

      {/* Haupt-Content-Spalte — auf Desktop um Sidebar versetzt */}
      <div className="flex w-full min-w-0 flex-col flex-1 min-h-dvh min-h-0 lg:ml-[52px]">
        <Topbar
          pageTitle={pageTitle}
          session={session}
          searchValue={suchbegriff}
          onSuche={handleSuchInput}
          searchResults={suchergebnisse}
          onSearchResultClick={handleSuchErgebnisKlick}
          onNavigate={navigate}
          onOpenMobileSearch={() => setMobileSearchOpen(true)}
          onLogout={handleLogout}
          onOpenAssistant={() => assistantOpenRef.current?.()}
        />
        <main
          className="flex-grow relative z-[1] min-h-0 min-w-0 w-full overflow-x-hidden"
          style={{
            paddingBottom: isDesktop ? 0 : Math.max(mobileBottomOffsetPx, 72),
          }}
        >
          <Outlet />
        </main>
      </div>

      {!isDesktop && (
        <>
          <MobileBottomNav
            activeRoute={location.pathname}
            appMode={appMode}
            onNavigate={navigate}
            onOpenMore={() => setMobileMoreOpen(true)}
            mobileNavFavorites={mobileNavFavorites}
          />

          <MobileMoreSheet
            open={mobileMoreOpen}
            appMode={appMode}
            activeRoute={location.pathname}
            onClose={() => setMobileMoreOpen(false)}
            onNavigate={navigate}
            onToggleMode={handleToggleMode}
            mobileNavFavorites={mobileNavFavorites}
            onOpenNavSettings={handleOpenNavSettings}
          />

          <MobileSearchSheet
            open={mobileSearchOpen}
            onClose={() => setMobileSearchOpen(false)}
            searchValue={suchbegriff}
            onSearchChange={handleSuchInput}
            searchResults={suchergebnisse}
            onSearchResultClick={handleSuchErgebnisKlick}
          />
        </>
      )}

      <ForcedPasswordChangeModal
        open={passwordChangeRequired}
        onCompleted={onPasswordChangeCompleted}
      />
      <GlobalAssistantLauncher
        session={session}
        householdContext={householdContext}
        appMode={appMode}
        onRegisterOpen={(fn) => { assistantOpenRef.current = fn; }}
      />
    </div>
  );
};

// ── Haupt-App ──────────────────────────────────────────────────────────────────
function App() {
  const { t } = useTranslation(["common"]);
  const { loadProfileLocale } = useLocale();
  const location = useLocation();
  const [session,     setSession]     = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [householdContext, setHouseholdContext] = useState(null);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [passwordFlagLoading, setPasswordFlagLoading] = useState(false);
  const [mobileNavFavorites, setMobileNavFavorites] = useState(() => sanitizeMobileNavFavorites(null));
  useEffect(() => {
    // Initialen Session-Status prüfen
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setLoadingAuth(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (_event === "INITIAL_SESSION") {
          setLoadingAuth(false);
        }
      }
    );

    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncHouseholdContext = async () => {
      if (!session?.user?.id) {
        setActiveHouseholdId(null);
        setHouseholdContext(null);
        setHouseholdLoading(false);
        return;
      }

      setHouseholdLoading(true);

      const loadContext = async () => {
        const { data } = await supabase.rpc("get_household_context");
        return Array.isArray(data) ? data[0] : data;
      };

      let ctx = null;
      const searchParams = new URLSearchParams(location.search);
      const tokenInCurrentUrl =
        location.pathname === "/join-household" && !!searchParams.get("token");
      const nextPath = searchParams.get("next") || "";
      const joinViaNextPath = nextPath.startsWith("/join-household");
      const shouldSkipAutoCreate = tokenInCurrentUrl || joinViaNextPath;

      try {
        ctx = await loadContext();
        if (!ctx?.household_id && !shouldSkipAutoCreate) {
          await supabase.rpc("create_household", { p_name: null });
          ctx = await loadContext();
        }
      } catch (_err) {
        ctx = null;
      }

      if (cancelled) return;
      setHouseholdContext(ctx || null);
      setActiveHouseholdId(ctx?.household_id || null);
      setHouseholdLoading(false);
    };

    syncHouseholdContext();
    return () => { cancelled = true; };
  }, [session?.user?.id, location.pathname, location.search]);

  useEffect(() => {
    loadProfileLocale(session?.user?.id || null);
  }, [loadProfileLocale, session?.user?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadUserConfig = async () => {
      if (!session?.user?.id) {
        setPasswordChangeRequired(false);
        setMobileNavFavorites(sanitizeMobileNavFavorites(null));
        setPasswordFlagLoading(false);
        return;
      }

      setPasswordFlagLoading(true);
      try {
        const { data } = await supabase
          .from("user_profile")
          .select("password_change_required, mobile_nav_config")
          .eq("id", session.user.id)
          .single();
        if (!cancelled) {
          setPasswordChangeRequired(data?.password_change_required === true);
          setMobileNavFavorites(sanitizeMobileNavFavorites(data?.mobile_nav_config ?? null));
        }
      } catch (_err) {
        if (!cancelled) {
          setPasswordChangeRequired(false);
          setMobileNavFavorites(sanitizeMobileNavFavorites(null));
        }
      } finally {
        if (!cancelled) setPasswordFlagLoading(false);
      }
    };

    loadUserConfig();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // ── Lade-Screen ──────────────────────────────────────────────────────────────
  const loadingScreen = (
    <div className="text-center py-20 text-dark-text-main">
      {t("app.loadingAuth")}
    </div>
  );

  // ── Element für geschützte Layout-Route ──────────────────────────────────────
  // React Router v6: Layout-Route mit <Outlet /> in AuthenticatedShell.
  // AuthenticatedShell ist außerhalb von App definiert → stabile Komponenten-Referenz.
  const protectedShellElement = loadingAuth
    ? loadingScreen
    : !session
    ? <Navigate to="/login" replace />
    : householdLoading
    ? loadingScreen
    : passwordFlagLoading
    ? loadingScreen
    : (
      <AuthenticatedShell
        session={session}
        setSession={setSession}
        householdContext={householdContext}
        passwordChangeRequired={passwordChangeRequired}
        onPasswordChangeCompleted={() => setPasswordChangeRequired(false)}
        mobileNavFavorites={mobileNavFavorites}
      />
    );

  return (
    <ToastProvider>
    <ThemeProvider>
      {/* Animierter Canvas-Hintergrund — liegt hinter allen Inhalten (z-index: 0) */}
      <BeamsBackground intensity="subtle" />
      <AppModeProvider>
        <HomeModusSyncer session={session} householdContext={householdContext} />
        <TourProvider session={session}>
          <TourPromptGate session={session} />
        <OnboardingGate
          session={session}
          blockOnboarding={passwordFlagLoading || passwordChangeRequired}
        >
          <Suspense fallback={loadingScreen}>
          <Routes>
            {/* ── Öffentliche Routen (ohne Shell) ─────────────────────────────── */}
            <Route path="/login"           element={<HomePage setSession={setSession} />} />
            <Route path="/register"        element={
              loadingAuth ? loadingScreen :
              session     ? <SmartRedirect /> :
              <RegisterPage />
            } />
            <Route path="/"                element={
              session ? <SmartRedirect /> :
              <HomePage setSession={setSession} />
            } />
            <Route path="/update-password" element={<UpdatePasswordPage />} />
            <Route path="/join-household"  element={<JoinHouseholdPage session={session} />} />

            {/* Feature-Landing-Pages */}
            <Route path="/features/todo-listen"        element={<TodoListenFeaturePage />} />
            <Route path="/features/packliste"          element={<PacklisteFeaturePage />} />
            <Route path="/features/budget-tracker"     element={<BudgetTrackerFeaturePage />} />
            <Route path="/features/kontakt-manager"    element={<KontaktManagerFeaturePage />} />
            <Route path="/features/transport-planer"   element={<TransportFeaturePage />} />
            <Route path="/features/renovierungsplaner" element={<RenovierungsplanerFeaturePage />} />
            <Route path="/features/zeitstrahl"         element={<ZeitstrahlFeaturePage />} />
            <Route path="/features/ki-assistenten"     element={<KiAssistentenFeaturePage />} />
            <Route path="/features/qr-code-system"     element={<QrCodeFeaturePage />} />

            {/* ── Geschützte Routen (mit Shell) ───────────────────────────────── */}
            <Route element={protectedShellElement}>
              {/* Umzugsplaner */}
              <Route path="/dashboard"      element={<Dashboard session={session} />} />
              <Route path="/budget"         element={<BudgetTracker session={session} />} />
              <Route path="/kontakte"       element={<KontaktManager session={session} />} />
              <Route path="/todos"          element={<TodoListenManager session={session} />} />
              <Route path="/packliste"      element={<PacklisteManager session={session} />} />
              <Route path="/materialplaner" element={<Materialplaner session={session} />} />
              <Route path="/bedarfsrechner" element={<BedarfsrechnerPage session={session} />} />
              <Route path="/umzugsplaner"   element={<UmzugsplanerSeite />} />
              <Route path="/zeitstrahl"     element={<UmzugsZeitstrahl session={session} />} />
              <Route path="/dokumente"      element={<DokumentenManager session={session} />} />
              <Route path="/kostenvergleich" element={<KostenVergleich session={session} />} />

              {/* Home Organizer */}
              <Route path="/home"              element={<HomeDashboard session={session} />} />
              <Route path="/home/inventar"     element={<HomeInventar session={session} />} />
              <Route path="/home/suche"        element={<HomeGlobalSuche session={session} />} />
              <Route path="/home/vorraete"     element={<HomeVorraete session={session} />} />
              <Route path="/home/heimapotheke" element={<HomeHeimapotheke session={session} />} />
              <Route path="/home/einkaufliste" element={<HomeEinkaufliste session={session} />} />
              <Route path="/home/aufgaben"     element={<HomeHaushaltsaufgaben session={session} />} />
              <Route path="/home/bewohner"     element={<HomeBewohner session={session} />} />
              <Route path="/home/geraete"      element={<HomeGeraete session={session} />} />
              <Route path="/home/kfz"          element={<HomeKfz session={session} />} />
              <Route path="/home/budget"       element={<HomeBudget session={session} />} />
              <Route path="/home/projekte"     element={<HomeProjekte session={session} />} />
              <Route path="/home/verlauf"      element={<HomeVerlauf session={session} />} />
              <Route path="/home/wissen"            element={<HomeWissen session={session} />} />
              <Route path="/home/kochbuch"          element={<HomeKochbuch session={session} />} />
              <Route path="/home/kochbuch/:rezeptId" element={<HomeKochbuch session={session} />} />
              <Route path="/home/rechnung-scannen" element={<HomeRechnungScannen session={session} />} />
              <Route path="/home/dokumente"        element={<HomeDokumente session={session} />} />

              {/* Übergreifend */}
              <Route path="/kalender" element={<KalenderUebersicht session={session} />} />
              <Route path="/profil"   element={<UserProfile session={session} householdContext={householdContext} mobileNavFavorites={mobileNavFavorites} onMobileNavChange={setMobileNavFavorites} />} />
            </Route>

            {/* ── Fallback ─────────────────────────────────────────────────────── */}
            <Route path="*" element={session ? <SmartRedirect /> : <Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </OnboardingGate>
        </TourProvider>
      </AppModeProvider>
    </ThemeProvider>
    </ToastProvider>
  );
}

export default App;
