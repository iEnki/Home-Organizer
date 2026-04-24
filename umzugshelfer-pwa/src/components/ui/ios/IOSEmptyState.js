import React from "react";
import { IOSSecondaryButton } from "./IOSButton";

export const IOSEmptyState = ({ icon: Icon, title, message, action, actionLabel }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    {Icon && (
      <div className="w-16 h-16 rounded-full bg-ios-surface-2 dark:bg-ios-surface-2-dark flex items-center justify-center mb-4">
        <Icon size={28} className="text-ios-label-2" />
      </div>
    )}
    <p className="text-base font-semibold text-ios-label dark:text-white mb-1">{title}</p>
    {message && <p className="text-sm text-ios-label-2 mb-4">{message}</p>}
    {action && <IOSSecondaryButton onClick={action}>{actionLabel}</IOSSecondaryButton>}
  </div>
);
