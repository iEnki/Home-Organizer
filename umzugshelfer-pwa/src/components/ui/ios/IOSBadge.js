import React from "react";

const COLORS = {
  blue:  "bg-ios-tint-bg text-ios-tint",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  red:   "bg-red-500/10 text-ios-danger",
  amber: "bg-amber-500/10 text-amber-600",
  gray:  "bg-ios-surface-2 dark:bg-ios-surface-2-dark text-ios-label-2",
};

export const IOSBadge = ({ label, color = "gray", className = "" }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLORS[color] ?? COLORS.gray} ${className}`}>
    {label}
  </span>
);
