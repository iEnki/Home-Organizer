import React, { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// ── Context ───────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast muss innerhalb von ToastProvider verwendet werden");
  return ctx;
};

// ── Icons pro Typ ─────────────────────────────────────────────────────────────
const ICONS = {
  success: <CheckCircle2 size={16} className="shrink-0" />,
  error:   <XCircle      size={16} className="shrink-0" />,
  info:    <Info         size={16} className="shrink-0" />,
};

const STYLES = {
  success: "bg-primary-500 text-white",
  error:   "bg-accent-danger text-white",
  info:    "bg-canvas-2 border border-dark-border text-dark-text-main",
};

// ── ToastContainer (intern) ───────────────────────────────────────────────────
const ToastContainer = ({ toasts, onRemove }) => (
  <div
    className="fixed right-4 sm:right-6 z-[500] flex flex-col gap-2 pointer-events-none"
    style={{ bottom: "calc(var(--mobile-bottom-offset, 0px) + 1.5rem)" }}
    aria-live="polite"
    aria-label="Benachrichtigungen"
  >
    <AnimatePresence mode="popLayout">
      {toasts.map((t) => (
        <motion.div
          key={t.id}
          layout
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{    opacity: 0, y: 8,  scale: 0.92 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3
                      rounded-card shadow-elevation-2 text-sm max-w-xs
                      ${STYLES[t.type] ?? STYLES.info}`}
        >
          {ICONS[t.type]}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            className="opacity-70 hover:opacity-100 transition-opacity ml-1"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

// ── Provider ──────────────────────────────────────────────────────────────────
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((message, type = "success", dauer = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (dauer > 0) {
      setTimeout(() => remove(id), dauer);
    }
    return id;
  }, [remove]);

  // Kurzformen
  const success = useCallback((msg, d) => add(msg, "success", d), [add]);
  const error   = useCallback((msg, d) => add(msg, "error",   d), [add]);
  const info    = useCallback((msg, d) => add(msg, "info",    d), [add]);

  return (
    <ToastContext.Provider value={{ add, success, error, info, remove }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
};
