import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Edit2, ArrowRightLeft, Trash2, MoreVertical } from "lucide-react";
import { getBuchCoverUrl } from "../../../utils/buchCoverUtils";
import GlassSurface from "../../ui/GlassSurface";

const STATUS_CONFIG = {
  im_regal:   { dot: "bg-primary-500",        badge: "border-primary-500/30 bg-primary-500/15 text-primary-500" },
  verliehen:  { dot: "bg-accent-yellow",       badge: "border-accent-yellow/30 bg-accent-yellow/15 text-accent-yellow" },
  vermisst:   { dot: "bg-accent-danger",       badge: "border-accent-danger/30 bg-accent-danger/15 text-accent-danger" },
  verschenkt: { dot: "bg-secondary-500",       badge: "border-secondary-500/30 bg-secondary-500/15 text-secondary-500" },
  entsorgt:   { dot: "bg-light-text-secondary dark:bg-dark-text-secondary", badge: "border-dark-border bg-canvas-3 text-dark-text-secondary" },
};

export default function BuchKarte({ buch, onBearbeiten, onVerleihen, onLoeschen, index = 0 }) {
  const { t } = useTranslation(["books"]);
  const [menuOffen, setMenuOffen] = useState(false);

  const statusLabel = t(`books:status.${buch.status}`, { defaultValue: buch.status });
  const statusCfg = STATUS_CONFIG[buch.status] ?? STATUS_CONFIG.im_regal;
  const coverUrl = getBuchCoverUrl(buch);
  const titelInitiale = buch.titel ? buch.titel.charAt(0).toUpperCase() : "B";

  const stopAndClose = (fn) => (e) => {
    e.stopPropagation();
    setMenuOffen(false);
    fn(buch);
  };

  return (
    <GlassSurface
      as="article"
      className="cursor-pointer overflow-hidden"
      onClick={() => onBearbeiten(buch)}
    >
      {/* Cover */}
      <div className="relative overflow-hidden" style={{ paddingBottom: "150%" }}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={buch.titel}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-secondary-500/20 via-canvas-3 to-primary-500/20">
            <span className="text-3xl font-bold text-light-text-main dark:text-dark-text-main opacity-30 select-none leading-none mb-2">
              {titelInitiale}
            </span>
            <BookOpen size={20} className="text-secondary-500 opacity-40" />
          </div>
        )}

        {/* Ambient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status badge */}
        <div className={`absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm ${statusCfg.badge}`}>
          <span className={`h-1 w-1 rounded-full shrink-0 ${statusCfg.dot}`} />
          {statusLabel}
        </div>
      </div>

      {/* Info */}
      <div className="px-2.5 py-2.5">
        <p className="text-[11px] font-semibold text-light-text-main dark:text-dark-text-main leading-snug line-clamp-2 mb-0.5">
          {buch.titel}
        </p>
        {buch.autor_anzeige && (
          <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate">
            {buch.autor_anzeige}
          </p>
        )}
      </div>

      {/* 3-dot menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOffen((v) => !v); }}
          className="p-1.5 rounded-card-sm bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Aktionen"
        >
          <MoreVertical size={12} />
        </button>

        {menuOffen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOffen(false); }} />
            <div className="absolute right-0 top-8 z-20 min-w-[140px] overflow-hidden rounded-card-sm border border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-3 shadow-elevation-3 animate-fade-in">
              <button onClick={stopAndClose(onBearbeiten)} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-primary-500/10 hover:text-primary-500 transition-colors">
                <Edit2 size={12} /> {t("books:card.edit")}
              </button>
              <button onClick={stopAndClose(onVerleihen)} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-secondary-500/10 hover:text-secondary-500 transition-colors">
                <ArrowRightLeft size={12} />
                {buch.status === "verliehen" ? t("books:card.loan") : t("books:card.lend")}
              </button>
              <div className="h-px bg-light-border dark:bg-dark-border mx-2" />
              <button onClick={stopAndClose(onLoeschen)} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-accent-danger hover:bg-accent-danger/10 transition-colors">
                <Trash2 size={12} /> {t("books:card.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    </GlassSurface>
  );
}
