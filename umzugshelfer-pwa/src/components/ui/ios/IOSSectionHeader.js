import React from "react";

export const IOSSectionHeader = ({ title, action, actionLabel }) => (
  <div className="flex items-center justify-between px-4 pt-6 pb-1">
    <p className="ios-section-title">{title}</p>
    {action && (
      <button onClick={action} className="text-xs text-ios-tint font-medium">
        {actionLabel}
      </button>
    )}
  </div>
);
