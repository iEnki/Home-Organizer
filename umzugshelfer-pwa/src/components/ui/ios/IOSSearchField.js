import React from "react";
import { Search } from "lucide-react";

export const IOSSearchField = ({
  value,
  onChange,
  placeholder = "Suchen…",
  className = "",
  inputClassName = "",
  leadingIcon: LeadingIcon = Search,
  trailing,
}) => (
  <div className={`relative ${className}`}>
    <LeadingIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-label-3 pointer-events-none" />
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full pl-8 ${trailing ? "pr-10" : "pr-3"} py-2 text-sm rounded-ios-card
                 bg-ios-surface-2 dark:bg-ios-surface-2-dark
                 text-ios-label dark:text-white placeholder-ios-label-3
                 border-none focus:outline-none focus:ring-2 focus:ring-ios-tint ${inputClassName}`}
    />
    {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
  </div>
);
