import React from "react";

export const IOSSegmentedControl = ({ options, value, onChange, className = "" }) => (
  <div className={`flex p-0.5 bg-ios-surface-2 dark:bg-ios-surface-2-dark rounded-ios-card ${className}`}>
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`flex-1 py-1.5 text-xs font-medium rounded-[10px] transition-all
          ${value === opt.value
            ? "bg-ios-surface dark:bg-ios-surface-dark shadow-ios-card text-ios-label dark:text-white"
            : "text-ios-label-2"
          }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
