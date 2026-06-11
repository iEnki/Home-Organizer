import React, { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatLocalizedDateInput, parseLocalizedDate } from "../../../utils/kfzDate";

export default function LocalizedDateField({
  label,
  value,
  onChange,
  required = false,
  error = "",
  className = "",
  onValidityChange,
}) {
  const id = useId();
  const pickerRef = useRef(null);
  const validityCallbackRef = useRef(onValidityChange);
  const [text, setText] = useState(() => formatLocalizedDateInput(value));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    validityCallbackRef.current = onValidityChange;
  }, [onValidityChange]);

  useEffect(() => {
    setText(formatLocalizedDateInput(value));
    setLocalError("");
    validityCallbackRef.current?.(true);
  }, [value]);

  const commit = () => {
    const parsed = parseLocalizedDate(text);
    setLocalError(parsed.error || "");
    validityCallbackRef.current?.(!parsed.error);
    if (!parsed.error) onChange(parsed.iso);
  };

  return (
    <label className={`block ${className}`} htmlFor={id}>
      <span className="mb-1 block text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
        {label}{required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      <span className="relative block">
        <input
          id={id}
          value={text}
          inputMode="numeric"
          placeholder="TT.MM.JJJJ"
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseLocalizedDate(event.target.value);
            validityCallbackRef.current?.(!parsed.error);
          }}
          onBlur={commit}
          aria-invalid={Boolean(error || localError)}
          className="w-full min-h-11 rounded-card-sm border border-light-border bg-light-card px-3 pr-11 text-sm text-light-text-main outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-dark-border dark:bg-canvas-2 dark:text-dark-text-main"
        />
        <button
          type="button"
          onClick={() => {
            if (pickerRef.current?.showPicker) pickerRef.current.showPicker();
            else pickerRef.current?.click();
          }}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-light-text-secondary hover:text-primary-500 dark:text-dark-text-secondary"
          aria-label="Kalender öffnen"
        >
          <CalendarDays size={18} />
        </button>
        <input
          ref={pickerRef}
          type="date"
          value={value || ""}
          onChange={(event) => {
            setLocalError("");
            validityCallbackRef.current?.(true);
            onChange(event.target.value);
          }}
          className="pointer-events-none absolute h-px w-px opacity-0"
          tabIndex={-1}
        />
      </span>
      {error || localError ? <span className="mt-1 block text-xs text-red-500">{error || localError}</span> : null}
    </label>
  );
}
