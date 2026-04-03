import React from "react";
import { Sparkles } from "lucide-react";

/**
 * Einmaliger Intro-Dialog für das Tour-System 2.0.
 * Erscheint nach dem ersten Login (Home-Modus) wenn tour_state.intro_prompt_status === "pending".
 *
 * @param {Function} onJa   - User möchte die Tour
 * @param {Function} onNein - User lehnt ab (nie wieder fragen)
 */
export default function TourPromptModal({ onJa, onNein }) {
  return (
    <div className="fixed inset-0 z-[10100] flex items-center justify-center p-4 pb-safe bg-black/60">
      <div
        className="bg-light-card dark:bg-canvas-2 rounded-card border border-light-border
                   dark:border-dark-border shadow-elevation-2 max-w-sm w-full p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-primary-500" />
          <h2 className="text-base font-semibold text-light-text-main dark:text-dark-text-main">
            Kurze Einführung
          </h2>
        </div>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-5 leading-relaxed">
          Möchtest du eine kurze Tour durch die wichtigsten Funktionen des Home Organizers?
          Du kannst sie jederzeit im Profil neu starten.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onNein}
            className="flex-1 py-2 px-4 rounded-card-sm border border-light-border
                       dark:border-dark-border text-sm text-light-text-secondary
                       dark:text-dark-text-secondary hover:bg-light-surface-1
                       dark:hover:bg-canvas-3 transition-colors"
          >
            Nein, danke
          </button>
          <button
            onClick={onJa}
            className="flex-1 py-2 px-4 rounded-card-sm bg-primary-500 text-white
                       text-sm font-medium hover:bg-primary-400 transition-colors"
          >
            Ja, zeigen
          </button>
        </div>
      </div>
    </div>
  );
}
