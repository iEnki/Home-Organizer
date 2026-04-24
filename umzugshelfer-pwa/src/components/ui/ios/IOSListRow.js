import React from "react";
import { ChevronRight } from "lucide-react";

export const IOSListRow = ({
  icon,
  leading,
  label,
  title,
  sublabel,
  subtitle,
  value,
  onClick,
  trailing,
  children,
  as = "button",
  type = "button",
  last = false,
  className = "",
}) => {
  const Component = as;
  const resolvedTitle = title ?? label;
  const resolvedSubtitle = subtitle ?? sublabel;
  const resolvedLeading = leading ?? (icon ? <span className="text-ios-tint flex-shrink-0 w-5">{icon}</span> : null);

  return (
    <Component
      type={Component === "button" ? type : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 bg-ios-surface dark:bg-ios-surface-dark text-left
                  hover:bg-ios-surface-2 dark:hover:bg-ios-surface-2-dark transition-colors
                  ${!last ? "ios-list-separator" : ""} ${className}`}
    >
      {resolvedLeading}
      <span className="flex-1 min-w-0">
        {resolvedTitle && (
          <span className="block text-sm text-ios-label dark:text-white font-normal truncate">{resolvedTitle}</span>
        )}
        {resolvedSubtitle && (
          <span className="block text-xs text-ios-label-2 mt-0.5 truncate">{resolvedSubtitle}</span>
        )}
        {children}
      </span>
      {value && <span className="text-sm text-ios-label-2 mr-1 flex-shrink-0">{value}</span>}
      {trailing !== undefined ? trailing : <ChevronRight size={16} className="text-ios-label-3 flex-shrink-0" />}
    </Component>
  );
};
