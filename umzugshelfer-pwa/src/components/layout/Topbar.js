import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, Bell, Home, Truck, ChevronDown, Settings, LogOut, Crown, Users } from "lucide-react";
import ThemeSwitch from "../ThemeSwitch";
import { useAppMode } from "../../contexts/AppModeContext";
import { supabase } from "../../supabaseClient";

/**
 * Premium Topbar — sticky, glassmorphism, Suche + User-Avatar + ThemeSwitch.
 *
 * Props:
 *  pageTitle          – Aktueller Seitentitel (aus ROUTE_TITLES)
 *  session            – Supabase-Session (für E-Mail / Name / Initiale)
 *  searchValue        – Kontrollierter Suchwert (State liegt in App.js)
 *  onSuche            – Handler für Sucheingabe (val: string)
 *  searchResults      – Array von { modul, text, sub, link }
 *  onSearchResultClick– Handler bei Klick auf Suchergebnis (link: string)
 */
const Topbar = ({
  pageTitle,
  session,
  searchValue,
  onSuche,
  searchResults,
  onSearchResultClick,
  onNavigate,
  onOpenMobileSearch,
  onLogout,
}) => {
  const [suchOffen, setSuchOffen] = useState(false);
  const [avatarMenuOffen, setAvatarMenuOffen] = useState(false);
  const [mitglieder, setMitglieder] = useState([]);
  const suchContainerRef = useRef(null);
  const avatarMenuRef = useRef(null);
  const { appMode } = useAppMode();

  const userId   = session?.user?.id;
  const email   = session?.user?.email || "";
  const fallbackName = session?.user?.user_metadata?.full_name || email.split("@")[0] || "Nutzer";
  const aktuellesMitglied = mitglieder.find((m) => m?.is_current_user) || null;
  const name = aktuellesMitglied?.display_name || fallbackName;
  const avatarUrl = aktuellesMitglied?.avatar_url || null;
  const initiale = name.charAt(0).toUpperCase();

  const ladeMitglieder = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc("get_household_members_overview");
    if (Array.isArray(data)) setMitglieder(data);
  }, [userId]);

  useEffect(() => {
    ladeMitglieder();
  }, [ladeMitglieder]);

  useEffect(() => {
    if (!avatarMenuOffen) return;
    ladeMitglieder();
  }, [avatarMenuOffen, ladeMitglieder]);

  // Dropdown öffnen/schließen basierend auf Ergebnissen
  useEffect(() => {
    setSuchOffen(searchResults.length > 0 && searchValue.length >= 2);
  }, [searchResults, searchValue]);

  // Click-Outside schließt Dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suchContainerRef.current && !suchContainerRef.current.contains(e.target)) {
        setSuchOffen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) {
        setAvatarMenuOffen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setAvatarMenuOffen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleChange = (e) => {
    onSuche(e.target.value);
  };

  return (
    <header
      className="sticky top-0 z-40 min-h-[72px]
                 bg-light-surface-1/80 dark:bg-canvas-2/80 backdrop-blur-md
                 border-b border-light-border dark:border-dark-border shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-3 px-4 sm:px-6 lg:pl-6 h-[72px]">
      {/* Seitentitel + Modus-Badge */}
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <h1 className="text-base sm:text-xl font-semibold text-light-text-main dark:text-dark-text-main truncate">
          {pageTitle}
        </h1>
        <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-semibold whitespace-nowrap
          ${appMode === "home"
            ? "bg-secondary-500/15 text-secondary-400 border border-secondary-500/30"
            : "bg-primary-500/15 text-primary-400 border border-primary-500/30"}`}>
          {appMode === "home" ? <Home size={9} /> : <Truck size={9} />}
          {appMode === "home" ? "Home Organizer" : "Umzugplaner"}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Suchfeld (md+) */}
      <div
        className="relative hidden md:flex items-center max-w-[380px] w-full"
        ref={suchContainerRef}
      >
        <Search
          size={15}
          className="absolute left-3 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none z-10"
        />
        <input
          type="text"
          value={searchValue}
          onChange={handleChange}
          onFocus={() => searchResults.length > 0 && setSuchOffen(true)}
          placeholder="Suchen… (⌘K)"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-pill
                     bg-light-bg dark:bg-canvas-1
                     border border-light-border dark:border-dark-border
                     text-light-text-main dark:text-dark-text-main
                     placeholder-light-text-secondary dark:placeholder-dark-text-secondary
                     focus:outline-none focus:ring-2 focus:ring-secondary-500
                     transition-all duration-150"
        />

        {/* Suchergebnisse-Dropdown */}
        {suchOffen && searchResults.length > 0 && (
          <div
            className="absolute top-full mt-1 w-full rounded-card-sm
                       bg-light-card-bg dark:bg-canvas-3
                       border border-light-border dark:border-dark-border
                       shadow-elevation-2 z-50 overflow-hidden max-h-80 overflow-y-auto"
          >
            {searchResults.map((r, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSearchResultClick(r.link);
                  setSuchOffen(false);
                }}
                className="w-full text-left px-3 py-2.5
                           hover:bg-light-surface-1 dark:hover:bg-canvas-4
                           flex items-start gap-2.5
                           border-b border-light-border/50 dark:border-dark-border/50 last:border-0
                           transition-colors duration-100"
              >
                <span
                  className="text-xs px-1.5 py-0.5 rounded
                             bg-primary-500/10 text-primary-600 dark:text-primary-400
                             font-medium flex-shrink-0 mt-0.5 whitespace-nowrap"
                >
                  {r.modul}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-light-text-main dark:text-dark-text-main truncate">
                    {r.text}
                  </p>
                  {r.sub && (
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                      {r.sub}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rechte Aktionsgruppe */}
      <div className="flex items-center gap-2 ml-2">
        <button
          onClick={onOpenMobileSearch}
          className="md:hidden w-10 h-10 rounded-sidebar-tile flex items-center justify-center
                     bg-light-surface-1 dark:bg-canvas-3
                     border border-light-border dark:border-dark-border
                     text-light-text-secondary dark:text-dark-text-secondary
                     hover:bg-light-hover dark:hover:bg-canvas-4
                     transition-all duration-150"
          title="Suche"
          aria-label="Suche öffnen"
        >
          <Search size={18} />
        </button>

        <ThemeSwitch />

        {/* Benachrichtigungs-Button */}
        <button
          className="hidden sm:flex w-10 h-10 rounded-sidebar-tile items-center justify-center
                     bg-light-surface-1 dark:bg-canvas-3
                     border border-light-border dark:border-dark-border
                     text-light-text-secondary dark:text-dark-text-secondary
                     hover:bg-light-hover dark:hover:bg-canvas-4
                     transition-all duration-150"
          title="Benachrichtigungen"
        >
          <Bell size={18} />
        </button>

        <div className="relative" ref={avatarMenuRef}>
          {/* User-Avatar + Name/E-Mail (md+) */}
          <button
            data-tour="tour-topbar-profil"
            onClick={() => setAvatarMenuOffen((prev) => !prev)}
            className="hidden md:flex items-center gap-2.5 pl-2 border-l border-light-border dark:border-dark-border ml-1
                       hover:opacity-80 transition-opacity duration-150 cursor-pointer"
            title="Benutzermenue"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-9 h-9 rounded-full object-cover shadow-glow-primary shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center
                           text-white text-sm font-semibold shadow-glow-primary shrink-0"
              >
                {initiale}
              </div>
            )}
            <div className="hidden lg:block text-left">
              <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main leading-none">
                {name}
              </p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate max-w-[140px]">
                {email}
              </p>
            </div>
            <ChevronDown
              size={14}
              className={`text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
                avatarMenuOffen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Nur Avatar auf Mobile */}
          <button
            onClick={() => setAvatarMenuOffen((prev) => !prev)}
            className="md:hidden w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center
                       text-white text-sm font-semibold shrink-0 hover:opacity-80 transition-opacity duration-150"
            title="Benutzermenue"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
            ) : (
              initiale
            )}
          </button>

          {avatarMenuOffen && (
            <div
              className="absolute right-0 top-full mt-2 w-64 rounded-card-sm
                         bg-light-card-bg dark:bg-canvas-3 border border-light-border dark:border-dark-border
                         shadow-elevation-2 overflow-hidden z-50"
            >
              <div className="px-3 pt-3 pb-2 border-b border-light-border dark:border-dark-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
                  Haushalt & Bewohner
                </p>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setAvatarMenuOffen(false);
                      onNavigate?.("/profil");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-card-sm text-xs
                               text-light-text-main dark:text-dark-text-main
                               hover:bg-light-surface-1 dark:hover:bg-canvas-4 transition-colors"
                  >
                    <Home size={13} />
                    Haushalt
                  </button>
                  <button
                    onClick={() => {
                      setAvatarMenuOffen(false);
                      onNavigate?.("/home/bewohner");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-card-sm text-xs
                               text-light-text-main dark:text-dark-text-main
                               hover:bg-light-surface-1 dark:hover:bg-canvas-4 transition-colors"
                  >
                    <Users size={13} />
                    Bewohner
                  </button>
                </div>
              </div>

              {/* Haushaltsmitglieder (nur wenn > 1) */}
              {mitglieder.length > 1 && (
                <div className="px-3 pt-3 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary mb-2">
                    Haushalt
                  </p>
                  <div className="space-y-1.5">
                    {mitglieder.map((m) => {
                      const ini = (m.display_name || m.email || "?").charAt(0).toUpperCase();
                      return (
                        <div key={m.user_id} className="flex items-center gap-2">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt={m.display_name || ""} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary-500 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                              {ini}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-light-text-main dark:text-dark-text-main truncate">
                              {m.display_name || m.email || "Mitglied"}{m.is_current_user ? " (Du)" : ""}
                            </p>
                          </div>
                          {m.role === "admin" && (
                            <Crown size={11} className="text-secondary-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 border-t border-light-border dark:border-dark-border" />
                </div>
              )}
              <button
                onClick={() => {
                  setAvatarMenuOffen(false);
                  onNavigate?.("/profil");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm
                           text-light-text-main dark:text-dark-text-main
                           hover:bg-light-surface-1 dark:hover:bg-canvas-4 transition-colors"
              >
                <Settings size={15} />
                Einstellungen / Profil
              </button>
              <button
                onClick={() => {
                  setAvatarMenuOffen(false);
                  onLogout?.();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm
                           text-accent-danger hover:bg-accent-danger/10 transition-colors
                           border-t border-light-border dark:border-dark-border"
              >
                <LogOut size={15} />
                Ausloggen
              </button>
            </div>
          )}
        </div>
      </div>
      </div>{/* Ende innerer Content-Wrapper */}
    </header>
  );
};

export default Topbar;
