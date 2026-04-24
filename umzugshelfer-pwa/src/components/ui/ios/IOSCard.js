import React from "react";

export const IOSCard = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`ios-card dark:bg-ios-surface-dark ${onClick ? "cursor-pointer active:opacity-80" : ""} ${className}`}
  >
    {children}
  </div>
);
