import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// Combobox: zeigt beim Fokus IMMER alle Optionen (unabhängig vom aktuellen Wert),
// erlaubt aber zusätzlich freie Eingabe wie ein normales Input-Feld.
// Behebt die HTML5-<datalist>-Schwäche, dass Vorschläge gefiltert werden
// und bei nicht-passendem Wert gar nichts angezeigt wird.
export default function KategorieCombobox({
  value,
  onChange,
  options = [],
  placeholder = "",
  required = false,
  id,
  className = "",
  optionLabel,
  dropdownPortal = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Beim Tippen filtern; sonst alle Optionen zeigen
  const filteredOptions = filterText
    ? options.filter((opt) => opt.toLowerCase().includes(filterText.toLowerCase()))
    : options;

  // Beim Klick außerhalb schließen
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      const clickedInput = wrapperRef.current && wrapperRef.current.contains(event.target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!clickedInput && !clickedDropdown) {
        setIsOpen(false);
        setFilterText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !dropdownPortal) return;

    const updateDropdownPosition = () => {
      const input = inputRef.current;
      if (!input) return;

      const rect = input.getBoundingClientRect();
      const gap = 4;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = viewportHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
      const availableSpace = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(144, Math.min(224, availableSpace - gap));

      setDropdownStyle({
        position: "fixed",
        left: `${rect.left}px`,
        top: openAbove ? `${rect.top - maxHeight - gap}px` : `${rect.bottom + gap}px`,
        width: `${rect.width}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 220,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, dropdownPortal, filteredOptions.length]);

  const handleInputChange = (event) => {
    const next = event.target.value;
    setFilterText(next);
    onChange(next);
    if (!isOpen) setIsOpen(true);
  };

  const handleFocus = () => {
    setIsOpen(true);
    setFilterText("");
  };

  const handleOptionClick = (option) => {
    onChange(option);
    setIsOpen(false);
    setFilterText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setFilterText("");
      inputRef.current?.blur();
    } else if (event.key === "ArrowDown" && !isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={`w-full px-2.5 py-1.5 pr-8 ${className}`}
      />
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            setFilterText("");
          } else {
            inputRef.current?.focus();
            setIsOpen(true);
          }
        }}
        tabIndex={-1}
        aria-label="Toggle list"
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
      >
        <ChevronDown size={16} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {isOpen &&
        filteredOptions.length > 0 &&
        (dropdownPortal
          ? createPortal(
              <OptionsList
                ref={dropdownRef}
                options={filteredOptions}
                value={value}
                optionLabel={optionLabel}
                onSelect={handleOptionClick}
                className="overflow-y-auto rounded-card-sm border border-light-border dark:border-dark-border bg-white dark:bg-canvas-2 shadow-elevation-2"
                style={dropdownStyle || { position: "fixed", visibility: "hidden" }}
              />,
              document.body
            )
          : (
            <OptionsList
              ref={dropdownRef}
              options={filteredOptions}
              value={value}
              optionLabel={optionLabel}
              onSelect={handleOptionClick}
              className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-card-sm border border-light-border dark:border-dark-border bg-white dark:bg-canvas-2 shadow-elevation-2"
            />
          ))}
    </div>
  );
}

const OptionsList = React.forwardRef(function OptionsList(
  { options, value, optionLabel, onSelect, className, style },
  ref
) {
  return (
    <ul ref={ref} role="listbox" className={className} style={style}>
      {options.map((option) => (
        <li
          key={option}
          role="option"
          aria-selected={value === option}
          onMouseDown={(event) => {
            // mousedown statt click, damit der Blur des Inputs nicht zuerst feuert
            event.preventDefault();
            onSelect(option);
          }}
          className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-light-hover dark:hover:bg-canvas-3 ${
            value === option
              ? "text-primary-500 dark:text-primary-400 font-medium"
              : "text-light-text-main dark:text-dark-text-main"
          }`}
        >
          {optionLabel ? optionLabel(option) : option}
        </li>
      ))}
    </ul>
  );
});
