import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { ToastProvider } from "./hooks/useToast";
import useViewport from "./hooks/useViewport";

// ── Layout ─────────────────────────────────────────────────────────────────────
import Sidebar from "./components/layout/Sidebar";
import Topbar  from "./components/layout/Topbar";
import MobileBottomNav from "./components/layout/MobileBottomNav";
import MobileMoreSheet from "./components/layout/MobileMoreSheet";
import MobileSearchSheet from "./components/layout/MobileSearchSheet";

// ── Home Organizer Komponenten ─────────────────────────────────────────────────
import HomeDashboard          from "./components/home/HomeDashboard";
import HomeRechnungScannen   from "./components/home/HomeRechnungScannen";
import HomeInventar         from "./components/home/HomeInventar";
import HomeGlobalSuche      from "./components/home/HomeGlobalSuche";
import HomeVorraete         from "./components/home/HomeVorraete";
import HomeEinkaufliste     from "./components/home/HomeEinkaufliste";
import HomeHaushaltsaufgaben from "./components/home/HomeHaushaltsaufgaben";
import HomeBewohner         from "./components/home/HomeBewohner";
import HomeGeraete          from "./components/home/HomeGeraete";
import HomeBudget           from "./components/home/HomeBudget";
import HomeProjekte         from "./components/home/HomeProjekte";
import HomeOnboarding       from "./components/home/HomeOnboarding";
import HomeVerlauf          from "./components/home/HomeVerlauf";
import HomeWissen           from "./components/home/HomeWissen";
import HomeDokumente        from "./components/home/HomeDokumente";

// ── Umzugsplaner Komponenten ───────────────────────────────────────────────────
import Dashboard            from "./components/Dashboard";
import KontaktManager       from "./components/KontaktManager";
import BudgetTracker        from "./components/BudgetTracker";
import TodoListenManager    from "./components/TodoListenManager";
import PacklisteManager     from "./components/PacklisteManager";
import Materialplaner       from "./components/Materialplaner";
import BedarfsrechnerPage   from "./components/BedarfsrechnerPage";
import UmzugsplanerSeite    from "./components/UmzugsplanerSeite";
import HomePage             from "./components/LoginPage";
import RegisterPage         from "./components/RegisterPage";
import UmzugsZeitstrahl     from "./components/UmzugsZeitstrahl";
import DokumentenManager    from "./components/DokumentenManager";
import UpdatePasswordPage   from "./components/UpdatePasswordPage";
import ForcedPasswordChangeModal from "./components/ForcedPasswordChangeModal";
import KostenVergleich      from "./components/KostenVergleich";
import useErinnerungen      from "./hooks/useErinnerungen";
import UserProfile          from "./components/UserProfile";
import KalenderUebersicht   from "./components/KalenderUebersicht";
import JoinHouseholdPage    from "./components/JoinHouseholdPage";

// ── Feature-Landing-Pages (öffentlich) ────────────────────────────────────────
import TodoListenFeaturePage      from "./components/featurepages/TodoListenFeaturePage";
import PacklisteFeaturePage       from "./components/featurepages/PacklisteFeaturePage";
import BudgetTrackerFeaturePage   from "./components/featurepages/BudgetTrackerFeaturePage";
import KontaktManagerFeaturePage  from "./components/featurepages/KontaktManagerFeaturePage";
import TransportFeaturePage       from "./components/featurepages/TransportFeaturePage";
import RenovierungsplanerFeaturePage from "./components/featurepages/RenovierungsplanerFeaturePage";
import ZeitstrahlFeaturePage      from "./components/featurepages/ZeitstrahlFeaturePage";
import KiAssistentenFeaturePage   from "./components/featurepages/KiAssistentenFeaturePage";
import QrCodeFeaturePage          from "./components/featurepages/QrCodeFeaturePage";

// ── Route → Seitentitel Mapping ────────────────────────────────────────────────
const ROUTE_TITLES = {
  "/dashboard":         "Dashboard",
  "/kontakte":          "Kontakte",
  "/budget":            "Budget",
  "/todos":             "To-Do Listen",
  "/packliste":         "Packliste",
  "/materialplaner":    "Materialplaner",
  "/bedarfsrechner":    "Bedarfsrechner",
  "/umzugsplaner":      "Umzugsplaner",
  "/zeitstrahl":        "Zeitstrahl",
  "/dokumente":         "Dokumente",
  "/kostenvergleich":   "Kostenvergleich",
  "/kalender":          "Kalender",
  "/profil":            "Mein Profil",
  "/home":              "Home Organizer",
  "/home/inventar":     "Inventar",
  "/home/suche":        "Suche",
  "/home/vorraete":     "Vorräte",
  "/home/einkaufliste": "Einkaufsliste",
  "/home/aufgaben":     "Aufgaben",
  "/home/bewohner":     "Bewohner",
  "/home/geraete":      "Geräte",
  "/home/budget":       "Budget",
  "/home/projekte":     "Projekte",
  "/home/verlauf":      "Verlauf",
  "/home/wissen":            "Wissensdatenbank",
  "/home/rechnung-scannen": "Rechnung scannen",
  "/home/dokumente":        "Dokumentenarchiv",
};

// ── Modus-bewusster Redirect nach Login ────────────────────────────────────────
// Liest appMode synchron aus dem Context (bereits aus localStorage initialisiert),
// sodass Home-Organizer-Nutzer direkt zu /home weitergeleitet werden.
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
    const umzugPfade = ["/dashboard", "/packliste", "/todo", "/budget",
      "/contacts", "/dokumente", "/kalender", "/rechner", "/planung", "/zeitstrahl"];
    setIsAdmin(!!data?.is_admin);

    if (modusGeladen) {
      // Bereits geladen: appMode nicht überschreiben, nur umzug_deaktiviert-Flag prüfen
      if (data?.umzug_deaktiviert === true) {
        deaktiviereUmzug();
        if (umzugPfade.some((p) => location.pathname.startsWith(p))) {
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
      if (umzugPfade.some((p) => location.pathname.startsWith(p))) {
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
  }, [userId, householdContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bei Modus-Änderung in Supabase persistieren —
  // aber erst nachdem der Modus aus Supabase geladen wurde (modusGeladen),
  // sonst überschreibt der localStorage-Startwert den gespeicherten Modus.
  useEffect(() => {
    if (!userId || !modusGeladen || !isAdmin) return;
    supabase.rpc("set_household_app_mode", { p_app_modus: appMode, p_umzug_deaktiviert: umzugDeaktiviert });
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

// ── Authenticated Layout Shell ─────────────────────────────────────────────────
// Layout-Komponente für alle geschützten Routen.
// Rendert Sidebar + Topbar + <Outlet /> (React Router v6 Nested Route Pattern).
const AuthenticatedShell = ({
  session,
  setSession,
  householdContext,
  passwordChangeRequired,
  onPasswordChangeCompleted,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { appMode, toggleMode } = useAppMode();
  const { isDesktop, mobileBottomOffsetPx } = useViewport();
  const userId = session?.user?.id;
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Modus wechseln + automatisch zum passenden Dashboard navigieren
  const handleToggleMode = useCallback(() => {
    if (householdContext && householdContext.is_admin === false) return;
    const next = appMode === "umzug" ? "home" : "umzug";
    toggleMode();
    navigate(next === "home" ? "/home" : "/dashboard");
  }, [appMode, toggleMode, navigate, householdContext]);

  const suchTimerRef  = useRef(null);
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
          const [objRes, vorratRes, geraetRes, todoRes] = await Promise.all([
            supabase.from("home_objekte").select("id, name, status").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_vorraete").select("id, name, kategorie").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("home_geraete").select("id, name, hersteller").eq("user_id", userId).ilike("name", `%${q}%`).limit(3),
            supabase.from("todo_aufgaben").select("id, beschreibung, kategorie").eq("user_id", userId).in("app_modus", ["home", "beides"]).ilike("beschreibung", `%${q}%`).limit(3),
          ]);
          (objRes.data    || []).forEach((o) => ergebnisse.push({ modul: "Inventar", text: o.name,        sub: o.status,      link: "/home/inventar" }));
          (vorratRes.data || []).forEach((v) => ergebnisse.push({ modul: "Vorrat",   text: v.name,        sub: v.kategorie,   link: "/home/vorraete" }));
          (geraetRes.data || []).forEach((g) => ergebnisse.push({ modul: "Gerät",    text: g.name,        sub: g.hersteller,  link: "/home/geraete" }));
          (todoRes.data   || []).forEach((t) => ergebnisse.push({ modul: "Aufgabe",  text: t.beschreibung,sub: t.kategorie,   link: "/home/aufgaben" }));
        } else {
          const [kontakteRes, todosRes, kistenRes, dokRes, kistenInhaltRes] = await Promise.all([
            supabase.from("kontakte").select("id, name, typ").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
            supabase.from("todo_aufgaben").select("id, beschreibung, kategorie").eq("user_id", userId).ilike("beschreibung", `%${q}%`).limit(4),
            supabase.from("pack_kisten").select("id, name, raum_neu").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
            supabase.from("dokumente").select("id, dateiname").eq("user_id", userId).ilike("dateiname", `%${q}%`).limit(4),
            supabase.from("packliste_items").select("id, name, pack_kisten(name)").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
          ]);
          (kontakteRes.data    || []).forEach((k) => ergebnisse.push({ modul: "Kontakt",       text: k.name,          sub: k.typ,                               link: "/kontakte" }));
          (todosRes.data       || []).forEach((t) => ergebnisse.push({ modul: "To-Do",          text: t.beschreibung,  sub: t.kategorie,                         link: "/todos" }));
          (kistenRes.data      || []).forEach((k) => ergebnisse.push({ modul: "Kiste",          text: k.name,          sub: k.raum_neu,                          link: "/packliste" }));
          (dokRes.data         || []).forEach((d) => ergebnisse.push({ modul: "Dokument",       text: d.dateiname,     sub: null,                                link: "/dokumente" }));
          (kistenInhaltRes.data|| []).forEach((i) => ergebnisse.push({ modul: "Kisteninhalt",  text: i.name,          sub: i.pack_kisten?.name ?? null,         link: "/packliste" }));
        }
        setSuchergebnisse(ergebnisse);
      } catch (_err) {
        // silent fail
      }
    },
    [userId, appMode]
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

  const pageTitle = ROUTE_TITLES[location.pathname] ?? "";

  return (
    <div className="flex min-h-screen bg-light-bg dark:bg-canvas-1">
      <Sidebar
        activeRoute={location.pathname}
        onNavigate={navigate}
        session={session}
        appMode={appMode}
        onToggleMode={handleToggleMode}
        mobileNavigationEnabled
      />

      {/* Haupt-Content-Spalte — auf Desktop um Sidebar versetzt */}
      <div className="flex flex-col flex-1 min-h-screen lg:ml-20">
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
        />
        <main
          className="flex-grow relative z-[1]"
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
          />

          <MobileMoreSheet
            open={mobileMoreOpen}
            appMode={appMode}
            activeRoute={location.pathname}
            onClose={() => setMobileMoreOpen(false)}
            onNavigate={navigate}
            onToggleMode={handleToggleMode}
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
    </div>
  );
};

// ── Haupt-App ──────────────────────────────────────────────────────────────────
function App() {
  const location = useLocation();
  const [session,     setSession]     = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [householdContext, setHouseholdContext] = useState(null);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [passwordFlagLoading, setPasswordFlagLoading] = useState(false);
  useErinnerungen(session?.user?.id);

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
    let cancelled = false;

    const loadPasswordFlag = async () => {
      if (!session?.user?.id) {
        setPasswordChangeRequired(false);
        setPasswordFlagLoading(false);
        return;
      }

      setPasswordFlagLoading(true);
      try {
        const { data } = await supabase
          .from("user_profile")
          .select("password_change_required")
          .eq("id", session.user.id)
          .single();

        if (cancelled) return;
        setPasswordChangeRequired(data?.password_change_required === true);
      } catch (_err) {
        if (!cancelled) setPasswordChangeRequired(false);
      } finally {
        if (!cancelled) setPasswordFlagLoading(false);
      }
    };

    loadPasswordFlag();
    return () => { cancelled = true; };
  }, [session?.user?.id, location.pathname]);

  // ── Lade-Screen ──────────────────────────────────────────────────────────────
  const loadingScreen = (
    <div className="text-center py-20 text-dark-text-main">
      Authentifizierung wird geladen…
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
      />
    );

  return (
    <ToastProvider>
    <ThemeProvider>
      <AppModeProvider>
        <HomeModusSyncer session={session} householdContext={householdContext} />
        <OnboardingGate
          session={session}
          blockOnboarding={passwordFlagLoading || passwordChangeRequired}
        >
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
              <Route path="/home/einkaufliste" element={<HomeEinkaufliste session={session} />} />
              <Route path="/home/aufgaben"     element={<HomeHaushaltsaufgaben session={session} />} />
              <Route path="/home/bewohner"     element={<HomeBewohner session={session} />} />
              <Route path="/home/geraete"      element={<HomeGeraete session={session} />} />
              <Route path="/home/budget"       element={<HomeBudget session={session} />} />
              <Route path="/home/projekte"     element={<HomeProjekte session={session} />} />
              <Route path="/home/verlauf"      element={<HomeVerlauf session={session} />} />
              <Route path="/home/wissen"            element={<HomeWissen session={session} />} />
              <Route path="/home/rechnung-scannen" element={<HomeRechnungScannen session={session} />} />
              <Route path="/home/dokumente"        element={<HomeDokumente session={session} />} />

              {/* Übergreifend */}
              <Route path="/kalender" element={<KalenderUebersicht session={session} />} />
              <Route path="/profil"   element={<UserProfile session={session} householdContext={householdContext} />} />
            </Route>

            {/* ── Fallback ─────────────────────────────────────────────────────── */}
            <Route path="*" element={session ? <SmartRedirect /> : <Navigate to="/" replace />} />
          </Routes>
        </OnboardingGate>
      </AppModeProvider>
    </ThemeProvider>
    </ToastProvider>
  );
}

export default App;
