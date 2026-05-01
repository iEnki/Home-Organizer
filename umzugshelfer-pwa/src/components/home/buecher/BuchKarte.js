import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit2, ArrowRightLeft, Trash2, MoreVertical } from "lucide-react";
import { BUCH_STATUS_FARBEN } from "../../../utils/buecher";

export default function BuchKarte({ buch, onBearbeiten, onVerleihen, onLoeschen }) {
  const { t } = useTranslation(["books"]);
  const [menuOffen, setMenuOffen] = useState(false);

  const statusLabel = t(`books:status.${buch.status}`, { defaultValue: buch.status });
  const statusFarbe = BUCH_STATUS_FARBEN[buch.status] ?? "";

  const titelInitiale = buch.titel ? buch.titel.charAt(0).toUpperCase() : "B";

  const handleBearbeiten = (e) => {
    e.stopPropagation();
    setMenuOffen(false);
    onBearbeiten(buch);
  };

  const handleVerleihen = (e) => {
    e.stopPropagation();
    setMenuOffen(false);
    onVerleihen(buch);
  };

  const handleLoeschen = (e) => {
    e.stopPropagation();
    setMenuOffen(false);
    onLoeschen(buch);
  };

  return (
    <div
      className="relative rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 overflow-hidden cursor-pointer hover:border-teal-500/40 transition-colors"
      onClick={() => onBearbeiten(buch)}
    >
      {/* Cover-Bereich */}
      <div className="relative bg-teal-500/5 flex items-center justify-center" style={{ height: 110 }}>
        {buch.thumbnail_url || buch.cover_url ? (
          <img
            src={buch.thumbnail_url ?? buch.cover_url}
            alt={buch.titel}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-teal-500/10">
            <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 select-none">
              {titelInitiale}
            </span>
          </div>
        )}

        {/* Status-Badge */}
        <span className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-xs rounded-pill font-medium ${statusFarbe}`}>
          {statusLabel}
        </span>
      </div>

      {/* Titel + Autor */}
      <div className="px-2.5 py-2 min-h-0">
        <p className="text-xs font-semibold text-light-text-main dark:text-dark-text-main leading-snug line-clamp-2">
          {buch.titel}
        </p>
        {buch.autor_anzeige && (
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
            {buch.autor_anzeige}
          </p>
        )}
      </div>

      {/* 3-Punkte-Menü */}
      <div className="absolute top-1.5 right-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOffen((v) => !v); }}
          className="p-1 rounded-card-sm bg-black/30 hover:bg-black/50 text-white transition-colors"
        >
          <MoreVertical size={12} />
        </button>

        {menuOffen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOffen(false); }} />
            <div className="absolute right-0 top-7 z-20 bg-light-card dark:bg-canvas-3 border border-light-border dark:border-dark-border rounded-card-sm shadow-elevation-2 overflow-hidden min-w-[130px]">
              <button
                onClick={handleBearbeiten}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-4"
              >
                <Edit2 size={12} /> {t("books:card.edit")}
              </button>
              <button
                onClick={handleVerleihen}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-canvas-4"
              >
                <ArrowRightLeft size={12} />
                {buch.status === "verliehen" ? t("books:card.loan") : t("books:card.lend")}
              </button>
              <button
                onClick={handleLoeschen}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-accent-danger hover:bg-accent-danger/10"
              >
                <Trash2 size={12} /> {t("books:card.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
