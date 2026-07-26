import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 6;
const MAX_MENU_HEIGHT = 288;

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
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const shouldShowSearch = showSearch ?? items.length >= 6;
  const selectedLabel = items.find((item) => item.value === value)?.label || (allowCustom && value ? value : "");
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = !shouldShowSearch || !query
      ? [...items]
      : items.filter((item) =>
          [item.label, item.description, item.badge]
            .filter(Boolean)
            .some((part) => String(part).toLowerCase().includes(query)));
    if (
      allowCustom
      && query
      && !items.some((item) => String(item.value).toLowerCase() === search.trim().toLowerCase())
    ) {
      filtered.push({ value: search.trim(), label: `${createText}: ${search.trim()}` });
    }
    return filtered;
  }, [allowCustom, createText, items, search, shouldShowSearch]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const width = Math.min(
      Math.max(rect.width, 240),
      Math.max(240, viewportWidth - VIEWPORT_MARGIN * 2),
    );
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN),
    );
    const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      96,
      Math.min(MAX_MENU_HEIGHT, openAbove ? spaceAbove : spaceBelow),
    );

    setMenuStyle({
      position: "fixed",
      left,
      width,
      maxHeight: availableHeight,
      ...(openAbove
        ? { bottom: viewportHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (
        !rootRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && shouldShowSearch) {
      const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, shouldShowSearch]);

  const selectItem = (nextValue, itemDisabled = false) => {
    if (itemDisabled) return;
    onValueChange?.(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={rootRef} className={`relative inline-block min-w-0 ${rootClassName}`}>
      <button
        ref={triggerRef}
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

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          data-testid="searchable-select-menu"
          style={menuStyle}
          className={`z-[1000] overflow-hidden rounded-card-sm border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2 ${className}`}
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
                const badgeToneClass = {
                  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
                  muted: "bg-light-border/60 text-light-text-secondary dark:bg-canvas-3 dark:text-dark-text-secondary",
                }[item.badgeTone] || "bg-primary-500/10 text-primary-500";
                return (
                  <button
                    type="button"
                    key={item.value}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={item.disabled === true}
                    disabled={item.disabled === true}
                    onClick={() => selectItem(item.value, item.disabled)}
                    className={`flex w-full select-none items-center justify-between gap-2 rounded-[6px] px-2.5 py-2 text-left text-xs outline-none ${
                      item.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-light-hover dark:hover:bg-canvas-3"
                    } ${
                      selected
                        ? "font-medium text-primary-500"
                        : "text-light-text-main dark:text-dark-text-main"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      {item.description && (
                        <span className="mt-0.5 block truncate text-[10px] font-normal text-light-text-secondary dark:text-dark-text-secondary">
                          {item.description}
                        </span>
                      )}
                    </span>
                    {item.badge && (
                      <span className={`flex-shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-medium ${badgeToneClass}`}>
                        {item.badge}
                      </span>
                    )}
                    {selected && <Check size={11} className="flex-shrink-0 text-primary-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
