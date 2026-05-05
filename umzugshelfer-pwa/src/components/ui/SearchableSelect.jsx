import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export default function SearchableSelect({
  value,
  onValueChange,
  items = [],
  placeholder = "Auswählen...",
  searchPlaceholder = "Suchen...",
  emptyText = "Keine Ergebnisse",
  createText = "Neu anlegen",
  className = "",
  rootClassName = "",
  triggerClassName = "",
  disabled = false,
  showSearch,
  allowCustom = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const shouldShowSearch = showSearch ?? items.length >= 6;
  const selectedLabel = items.find((item) => item.value === value)?.label || (allowCustom && value ? value : "");
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = !shouldShowSearch || !query
      ? [...items]
      : items.filter((item) => item.label.toLowerCase().includes(query));
    if (allowCustom && query && !items.some((item) => item.value.toLowerCase() === search.trim().toLowerCase())) {
      filtered.push({ value: search.trim(), label: `${createText}: ${search.trim()}` });
    }
    return filtered;
  }, [allowCustom, createText, items, search, shouldShowSearch]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open && shouldShowSearch) {
      const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, shouldShowSearch]);

  const selectItem = (nextValue) => {
    onValueChange?.(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={rootRef} className={`relative inline-block min-w-0 ${rootClassName}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((current) => !current)}
        className={`inline-flex min-w-0 items-center justify-between gap-1.5 rounded-card-sm border border-light-border bg-light-bg px-2.5 py-1.5 text-xs text-light-text-main transition-colors hover:border-primary-500/50 focus:border-primary-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main ${triggerClassName}`}
      >
        <span className={`truncate ${selectedLabel ? "" : "text-light-text-secondary dark:text-dark-text-secondary"}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          size={12}
          className={`flex-shrink-0 text-light-text-secondary transition-transform dark:text-dark-text-secondary ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full z-[400] mt-1 max-h-72 min-w-full overflow-hidden rounded-card-sm border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2 ${className}`}
          role="listbox"
        >
          {shouldShowSearch && (
            <div className="border-b border-light-border p-2 dark:border-dark-border">
              <div className="relative">
                <Search
                  size={11}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
                />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-[6px] border border-light-border bg-light-bg py-1.5 pl-7 pr-2 text-xs text-light-text-main focus:border-primary-500 focus:outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main"
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1">
            {filteredItems.length === 0 ? (
              <div className="py-4 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {emptyText}
              </div>
            ) : (
              filteredItems.map((item) => {
                const selected = item.value === value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectItem(item.value)}
                    className={`flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-xs outline-none hover:bg-light-hover dark:hover:bg-canvas-3 ${
                      selected
                        ? "font-medium text-primary-500"
                        : "text-light-text-main dark:text-dark-text-main"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {selected && <Check size={11} className="flex-shrink-0 text-primary-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
