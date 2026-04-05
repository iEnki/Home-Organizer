import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  Pencil,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";

const INPUT_CLS =
  "w-full rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-3 py-2 text-sm text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

function ViewRow({
  view,
  isActive,
  renameId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onApply,
  onOverwrite,
  onRename,
  onDelete,
  onSetDefault,
  onClearDefault,
  busy,
}) {
  return (
    <div className="space-y-3 rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
          <Bookmark size={15} />
        </div>

        <div className="min-w-0 flex-1">
          {renameId === view.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              className={INPUT_CLS}
              placeholder="Ansichtsname"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-light-text-main dark:text-dark-text-main">
                {view.name}
              </p>
              {view.is_default && (
                <span className="inline-flex items-center gap-1 rounded-pill border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-300">
                  <Star size={10} />
                  Standard
                </span>
              )}
              {isActive && (
                <span className="inline-flex items-center gap-1 rounded-pill border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-[11px] text-primary-500">
                  <Check size={10} />
                  Aktiv
                </span>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Zuletzt aktualisiert {new Date(view.updated_at || view.created_at || Date.now()).toLocaleString("de-AT")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onApply(view)}
          disabled={busy}
          className="rounded-pill bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          Laden
        </button>
        <button
          onClick={() => onOverwrite(view)}
          disabled={busy}
          className="rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
        >
          Überschreiben
        </button>
        {renameId === view.id ? (
          <>
            <button
              onClick={() => onRename(view)}
              disabled={busy}
              className="rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
            >
              Speichern
            </button>
            <button
              onClick={() => onStartRename(null, "")}
              disabled={busy}
              className="rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <button
            onClick={() => onStartRename(view.id, view.name)}
            disabled={busy}
            className="rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1">
              <Pencil size={12} />
              Umbenennen
            </span>
          </button>
        )}
        <button
          onClick={() => (view.is_default ? onClearDefault(view) : onSetDefault(view))}
          disabled={busy}
          className="rounded-pill border border-light-border dark:border-dark-border px-3 py-1.5 text-xs text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3 disabled:opacity-50"
        >
          {view.is_default ? "Standard entfernen" : "Als Standard setzen"}
        </button>
        <button
          onClick={() => onDelete(view)}
          disabled={busy}
          className="rounded-pill border border-red-500/30 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1">
            <Trash2 size={12} />
            Löschen
          </span>
        </button>
      </div>
    </div>
  );
}

export default function BudgetSavedViewsSheet({
  offen,
  onClose,
  views,
  currentState,
  activeViewId,
  onApplyView,
  onSaveCurrentAsView,
  onOverwriteView,
  onRenameView,
  onDeleteView,
  onSetDefaultView,
  onClearDefaultView,
  saving = false,
}) {
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState("");
  const [busyViewId, setBusyViewId] = useState(null);

  const sortedViews = useMemo(
    () =>
      [...(views || [])].sort((left, right) => {
        if (left.is_default !== right.is_default) return left.is_default ? -1 : 1;
        return String(left.name || "").localeCompare(String(right.name || ""), "de");
      }),
    [views],
  );

  useEffect(() => {
    if (!offen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [offen, onClose]);

  useEffect(() => {
    if (!offen) {
      setNewName("");
      setRenameId(null);
      setRenameValue("");
      setError("");
      setBusyViewId(null);
    }
  }, [offen]);

  if (!offen) return null;

  const handleAsync = async (viewId, action) => {
    setError("");
    setBusyViewId(viewId);
    try {
      await action();
    } catch (err) {
      setError(err?.message || "Aktion fehlgeschlagen.");
    } finally {
      setBusyViewId(null);
    }
  };

  const handleSave = async () => {
    await handleAsync("create", async () => {
      await onSaveCurrentAsView?.(newName, currentState);
      setNewName("");
    });
  };

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Ansichten schliessen"
      />

      <section
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-light-border dark:border-dark-border bg-light-card dark:bg-canvas-2 shadow-elevation-3 md:inset-x-1/2 md:bottom-auto md:top-1/2 md:w-full md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:max-h-[82dvh]"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-light-border dark:border-dark-border bg-light-card/95 dark:bg-canvas-2/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Bookmark size={16} className="text-primary-500" />
            <h2 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Gespeicherte Ansichten
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
            aria-label="Ansichten schliessen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 p-4">
            <h3 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
              Aktuelle Filter speichern
            </h3>
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Die aktuelle Budget-Übersicht wird als neue persönliche Ansicht gespeichert.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="z. B. Privat monatlich"
                className={`${INPUT_CLS} sm:flex-1`}
              />
              <button
                onClick={handleSave}
                disabled={saving || !newName.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                <Save size={14} />
                Speichern
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-card border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {sortedViews.length === 0 ? (
            <div className="rounded-card border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 py-10 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Noch keine gespeicherten Budget-Ansichten vorhanden.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedViews.map((view) => (
                <ViewRow
                  key={view.id}
                  view={view}
                  isActive={view.id === activeViewId}
                  renameId={renameId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onStartRename={(id, value) => {
                    setRenameId(id);
                    setRenameValue(value);
                    setError("");
                  }}
                  onApply={(currentView) =>
                    handleAsync(currentView.id, () => onApplyView?.(currentView))
                  }
                  onOverwrite={(currentView) =>
                    handleAsync(currentView.id, () => onOverwriteView?.(currentView.id))
                  }
                  onRename={(currentView) =>
                    handleAsync(currentView.id, async () => {
                      await onRenameView?.(currentView.id, renameValue);
                      setRenameId(null);
                      setRenameValue("");
                    })
                  }
                  onDelete={(currentView) =>
                    handleAsync(currentView.id, () => onDeleteView?.(currentView.id))
                  }
                  onSetDefault={(currentView) =>
                    handleAsync(currentView.id, () => onSetDefaultView?.(currentView.id))
                  }
                  onClearDefault={(currentView) =>
                    handleAsync(currentView.id, () => onClearDefaultView?.(currentView.id))
                  }
                  busy={saving || busyViewId === view.id}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
