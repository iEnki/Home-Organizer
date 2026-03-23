import React, { useState, useRef, useEffect, useCallback } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Menu, X, LogOut, Sun, Moon, Search, Truck, Home } from "lucide-react";
import styles from "./Navbar.module.css";
import { useTheme } from "../contexts/ThemeContext";
import { useAppMode } from "../contexts/AppModeContext";

const Navbar = ({ session, setSession }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [suchergebnisse, setSuchergebnisse] = useState([]);
  const [suchOffen, setSuchOffen] = useState(false);
  const [suchLaed, setSuchLaed] = useState(false);
  const suchTimerRef = useRef(null);
  const suchContainerRef = useRef(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { appMode, toggleMode } = useAppMode();

  const toggleMenu = () => setIsOpen(!isOpen);

  const userId = session?.user?.id;

  const handleSuche = useCallback(async (begriff) => {
    if (!userId || !begriff || begriff.trim().length < 2) {
      setSuchergebnisse([]);
      setSuchOffen(false);
      return;
    }
    setSuchLaed(true);
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
        (objRes.data || []).forEach((o) => ergebnisse.push({ modul: "Inventar", text: o.name, sub: o.status, link: "/home/inventar" }));
        (vorratRes.data || []).forEach((v) => ergebnisse.push({ modul: "Vorrat", text: v.name, sub: v.kategorie, link: "/home/vorraete" }));
        (geraetRes.data || []).forEach((g) => ergebnisse.push({ modul: "Gerät", text: g.name, sub: g.hersteller, link: "/home/geraete" }));
        (todoRes.data || []).forEach((t) => ergebnisse.push({ modul: "Aufgabe", text: t.beschreibung, sub: t.kategorie, link: "/home/aufgaben" }));
      } else {
        const [kontakteRes, todosRes, kistenRes, dokRes] = await Promise.all([
          supabase.from("kontakte").select("id, name, typ").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
          supabase.from("todo_aufgaben").select("id, beschreibung, kategorie").eq("user_id", userId).ilike("beschreibung", `%${q}%`).limit(4),
          supabase.from("pack_kisten").select("id, name, raum_neu").eq("user_id", userId).ilike("name", `%${q}%`).limit(4),
          supabase.from("dokumente").select("id, dateiname").eq("user_id", userId).ilike("dateiname", `%${q}%`).limit(4),
        ]);
        (kontakteRes.data || []).forEach((k) => ergebnisse.push({ modul: "Kontakt", text: k.name, sub: k.typ, link: "/kontakte" }));
        (todosRes.data || []).forEach((t) => ergebnisse.push({ modul: "To-Do", text: t.beschreibung, sub: t.kategorie, link: "/todos" }));
        (kistenRes.data || []).forEach((k) => ergebnisse.push({ modul: "Kiste", text: k.name, sub: k.raum_neu, link: "/packliste" }));
        (dokRes.data || []).forEach((d) => ergebnisse.push({ modul: "Dokument", text: d.dateiname, sub: null, link: "/dokumente" }));
      }
      setSuchergebnisse(ergebnisse);
      setSuchOffen(ergebnisse.length > 0);
    } catch (err) {
      // silent fail
    } finally {
      setSuchLaed(false);
    }
  }, [userId, appMode]);

  const handleSuchInput = (e) => {
    const val = e.target.value;
    setSuchbegriff(val);
    if (suchTimerRef.current) clearTimeout(suchTimerRef.current);
    if (val.trim().length < 2) {
      setSuchergebnisse([]);
      setSuchOffen(false);
      return;
    }
    suchTimerRef.current = setTimeout(() => handleSuche(val), 350);
  };

  const handleSuchErgebnisClick = (link) => {
    setSuchbegriff("");
    setSuchergebnisse([]);
    setSuchOffen(false);
    navigate(link);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suchContainerRef.current && !suchContainerRef.current.contains(e.target)) {
        setSuchOffen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    const { error } = await supabase.auth.signOut();

    // Logge den Fehler, falls vorhanden
    if (error) {
      console.error("Error logging out:", error.message);
      // Auch wenn ein Fehler auftritt (z.B. "Auth session missing!"),
      // wollen wir die clientseitige Session bereinigen und navigieren.
    }

    // Diese Aktionen sollten immer ausgeführt werden, um den Client-Zustand zu bereinigen.
    if (setSession) {
      setSession(null);
    }
    navigate("/");
  };

  const umzugNavItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Kontakte", path: "/kontakte" },
    { name: "Budget", path: "/budget" },
    { name: "To-Dos", path: "/todos" },
    { name: "Packliste", path: "/packliste" },
    { name: "Materialplaner", path: "/materialplaner" },
    { name: "Bedarfsrechner", path: "/bedarfsrechner" },
    { name: "Umzugsplaner", path: "/umzugsplaner" },
    { name: "Zeitstrahl", path: "/zeitstrahl" },
    { name: "Dokumente", path: "/dokumente" },
    { name: "Kostenvergleich", path: "/kostenvergleich" },
  ];

  const homeNavItems = [
    { name: "Home", path: "/home" },
    { name: "Inventar", path: "/home/inventar" },
    { name: "Suche", path: "/home/suche" },
    { name: "Vorräte", path: "/home/vorraete" },
    { name: "Einkauf", path: "/home/einkaufliste" },
    { name: "Aufgaben", path: "/home/aufgaben" },
    { name: "Geräte", path: "/home/geraete" },
    { name: "Budget", path: "/home/budget" },
    { name: "Projekte", path: "/home/projekte" },
    { name: "Wissen", path: "/home/wissen" },
    { name: "Verlauf", path: "/home/verlauf" },
  ];

  const navItems = appMode === "home" ? homeNavItems : umzugNavItems;

  // Hilfsfunktion für Desktop NavLink Klassen
  const getDesktopNavLinkClasses = ({ isActive }) => {
    const baseClasses = [
      styles.navLink,
      "px-3",
      "py-2",
      "rounded-md",
      "text-sm",
      "font-medium",
      "transition-colors",
    ];
    if (isActive) {
      // Hell: text-light-accent-green, Dunkel: text-dark-accent-green
      baseClasses.push(
        styles.activeNavLink,
        "text-light-accent-green",
        "dark:text-dark-accent-green"
      );
    } else {
      baseClasses.push(
        styles.inactiveNavLink,
        "text-light-text-secondary", // Hellmodus Text
        "dark:text-dark-text-secondary", // Dunkelmodus Text
        "hover:text-light-text-main", // Hellmodus Hover
        "dark:hover:text-dark-text-main" // Dunkelmodus Hover
      );
    }
    return baseClasses.join(" ");
  };

  // Hilfsfunktion für Mobile NavLink Klassen
  const getMobileNavLinkClasses = ({ isActive }) => {
    const baseClasses = [
      styles.navLink,
      "block",
      "px-3",
      "py-2",
      "rounded-md",
      "text-base",
      "font-medium",
      "w-full",
      "text-center",
      "transition-colors",
    ];
    if (isActive) {
      // Hell: text-light-accent-green, Dunkel: text-dark-accent-green
      baseClasses.push(
        styles.activeNavLink,
        "text-light-accent-green",
        "dark:text-dark-accent-green"
      );
    } else {
      baseClasses.push(
        styles.inactiveNavLink,
        "text-light-text-secondary", // Hellmodus Text
        "dark:text-dark-text-secondary", // Dunkelmodus Text
        "hover:text-light-text-main", // Hellmodus Hover
        "dark:hover:text-dark-text-main" // Dunkelmodus Hover
      );
    }
    return baseClasses.join(" ");
  };

  return (
    <nav
      className={`${styles.navbar} bg-light-card-bg dark:bg-dark-card-bg sticky top-0 z-40 shadow-md`}
    >
      <div className="container mx-auto px-4 flex justify-between items-center h-16">
        {/* Linker Bereich: Logout-Button und App-Name */}
        <div className="flex items-center">
          {session && (
            <button
              onClick={handleLogout}
              className={`${styles.navLink} ${styles.inactiveNavLink} text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color p-2 rounded-md text-sm font-medium transition-colors flex items-center mr-2 sm:mr-4`}
              title="Ausloggen"
            >
              <LogOut size={22} />
            </button>
          )}
          <NavLink
            to={session ? "/dashboard" : "/login"}
            className="text-xl sm:text-2xl font-bold text-light-accent-green dark:text-dark-accent-green hover:opacity-80 transition-colors whitespace-nowrap"
          >
            Umzugplaner
          </NavLink>
        </div>

        {/* Globale Suche */}
        {session && (
          <div className="flex-1 max-w-sm mx-4 relative hidden md:block" ref={suchContainerRef}>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
              <input
                type="text"
                value={suchbegriff}
                onChange={handleSuchInput}
                onFocus={() => suchergebnisse.length > 0 && setSuchOffen(true)}
                placeholder="Suchen..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-1 focus:ring-light-accent-green dark:focus:ring-dark-accent-green"
              />
            </div>
            {suchOffen && (
              <div className="absolute top-full mt-1 left-0 bg-light-card-bg dark:bg-dark-card-bg border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto w-max min-w-full max-w-sm">
                {suchergebnisse.length === 0 && !suchLaed && (
                  <p className="px-3 py-2 text-xs text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap">Keine Ergebnisse</p>
                )}
                {suchergebnisse.map((r, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuchErgebnisClick(r.link)}
                    className="w-full text-left px-3 py-2.5 hover:bg-light-border dark:hover:bg-dark-border flex items-start gap-2.5 border-b border-light-border/50 dark:border-dark-border/50 last:border-0"
                  >
                    <span className="text-xs px-1.5 py-0.5 rounded bg-light-accent-green/10 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green font-medium flex-shrink-0 mt-0.5 whitespace-nowrap">
                      {r.modul}
                    </span>
                    <div>
                      <p className="text-sm text-light-text-main dark:text-dark-text-main whitespace-nowrap">{r.text}</p>
                      {r.sub && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap">{r.sub}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rechter Bereich: Desktop-Navigation oder Mobile Burger-Menü */}
        <div>
          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-1 items-center">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setIsOpen(false)} // Schließt mobiles Menü, falls offen
                className={getDesktopNavLinkClasses}
              >
                {item.name}
              </NavLink>
            ))}
            {/* Theme-Umschalter für Desktop */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary transition-colors ml-2"
              title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {/* Modus-Umschalter: Umzug ↔ Home Organizer */}
            <button
              onClick={toggleMode}
              className="p-2 rounded-full hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary transition-colors ml-1"
              title={appMode === "home" ? "Zum Umzugsplaner wechseln" : "Zum Home Organizer wechseln"}
            >
              {appMode === "home" ? <Truck size={20} /> : <Home size={20} />}
            </button>
            {/* Logout-Button für Desktop ist jetzt links, hier nicht mehr nötig */}
          </div>

          {/* Mobile Burger Menu Button */}
          {session && ( // Burger-Menü nur anzeigen, wenn eingeloggt (da NavItems nur für eingeloggte User sind)
            <div className="md:hidden flex items-center">
              <button
                onClick={toggleMenu}
                className={`${styles.menuButton} text-light-text-main dark:text-dark-text-main p-2`}
                aria-label="Menü öffnen/schließen"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ausklappbares Mobile Menü */}
      {session && isOpen && (
        <div className="md:hidden bg-light-card-bg dark:bg-dark-card-bg absolute w-full shadow-lg pb-4 z-50">
          {" "}
          {/* Nur auf md:hidden */}
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col items-center">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={toggleMenu}
                className={getMobileNavLinkClasses}
              >
                {item.name}
              </NavLink>
            ))}
            {/* Theme-Umschalter für Mobile */}
            <button
              onClick={() => {
                toggleTheme();
                toggleMenu(); // Menü nach Klick schließen
              }}
              className="w-full flex items-center justify-center px-3 py-2 rounded-md text-base font-medium text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main hover:bg-light-border dark:hover:bg-dark-border transition-colors"
              title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
            >
              {theme === "dark" ? (
                <Sun size={20} className="mr-2" />
              ) : (
                <Moon size={20} className="mr-2" />
              )}
              <span>{theme === "dark" ? "Hell" : "Dunkel"}</span>
            </button>
            {/* Modus-Umschalter für Mobile */}
            <button
              onClick={() => {
                toggleMode();
                toggleMenu();
              }}
              className="w-full flex items-center justify-center px-3 py-2 rounded-md text-base font-medium text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main hover:bg-light-border dark:hover:bg-dark-border transition-colors"
            >
              {appMode === "home" ? (
                <Truck size={20} className="mr-2" />
              ) : (
                <Home size={20} className="mr-2" />
              )}
              <span>{appMode === "home" ? "Umzugsplaner" : "Home Organizer"}</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
