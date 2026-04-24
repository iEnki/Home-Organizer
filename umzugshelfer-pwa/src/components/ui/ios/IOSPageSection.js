import React from "react";

export const IOSPageSection = ({ title, children, className = "" }) => (
  <div className={`mb-6 ${className}`}>
    {title && <p className="ios-section-title px-4 pb-1">{title}</p>}
    <div className="mx-4 ios-card dark:bg-ios-surface-dark overflow-hidden">
      {children}
    </div>
  </div>
);
