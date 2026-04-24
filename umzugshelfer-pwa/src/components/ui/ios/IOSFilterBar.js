import React from "react";

export const IOSFilterBar = ({ children, className = "" }) => (
  <div className={`flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2 ${className}`}>
    {children}
  </div>
);

export const IOSFilterChip = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
      ${active
        ? "bg-ios-tint text-white"
        : "bg-ios-surface-2 dark:bg-ios-surface-2-dark text-ios-label-2 hover:bg-ios-surface-3 dark:hover:bg-ios-surface-3-dark"
      }`}
  >
    {label}
  </button>
);
