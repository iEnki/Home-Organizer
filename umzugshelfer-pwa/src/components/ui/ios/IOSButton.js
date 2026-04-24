import React from "react";

export const IOSPrimaryButton = ({ children, onClick, disabled, className = "" }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full py-3 px-6 rounded-ios-card bg-ios-tint text-white text-sm font-semibold
                disabled:opacity-50 active:opacity-80 transition-opacity ${className}`}
  >
    {children}
  </button>
);

export const IOSSecondaryButton = ({ children, onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-ios-card bg-ios-surface-2 dark:bg-ios-surface-2-dark text-ios-tint
                text-sm font-medium hover:bg-ios-surface-3 dark:hover:bg-ios-surface-3-dark transition-colors ${className}`}
  >
    {children}
  </button>
);

export const IOSIconButton = ({ icon: Icon, onClick, label, className = "" }) => (
  <button
    onClick={onClick}
    title={label}
    className={`w-9 h-9 rounded-full flex items-center justify-center
                bg-ios-surface-2 dark:bg-ios-surface-2-dark text-ios-tint
                hover:bg-ios-surface-3 dark:hover:bg-ios-surface-3-dark transition-colors ${className}`}
  >
    <Icon size={18} />
  </button>
);
