import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Standalone Sun/Moon Theme-Toggle-Button.
 * Verwendbar in Topbar, Sidebar oder direkt in Komponenten.
 */
const ThemeSwitch = ({ className = "" }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
      className={`w-10 h-10 rounded-sidebar-tile flex items-center justify-center
                  bg-light-surface-1 dark:bg-canvas-3
                  border border-light-border dark:border-dark-border
                  text-light-text-secondary dark:text-dark-text-secondary
                  hover:bg-light-hover dark:hover:bg-canvas-4
                  hover:border-primary-500/40 hover:text-primary-500
                  focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2
                  focus:ring-offset-light-bg dark:focus:ring-offset-canvas-1
                  transition-all duration-150 active:scale-90
                  ${className}`}
    >
      {theme === "dark" ? (
        <Sun size={18} className="transition-transform duration-150" />
      ) : (
        <Moon size={18} className="transition-transform duration-150" />
      )}
    </button>
  );
};

export default ThemeSwitch;
