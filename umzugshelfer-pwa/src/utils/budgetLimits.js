export const getLimitProgress = ({ verbrauch, limitEuro }) => {
  const normalizedLimit = Number(limitEuro || 0);
  if (normalizedLimit <= 0) return 0;
  return Math.min((Number(verbrauch || 0) / normalizedLimit) * 100, 100);
};

export const getLimitStatus = ({ verbrauch, limitEuro }) => {
  const normalizedLimit = Number(limitEuro || 0);
  if (normalizedLimit <= 0) return "kein_limit";
  if (Number(verbrauch || 0) >= normalizedLimit) return "ueberschritten";

  const progress = getLimitProgress({ verbrauch, limitEuro });
  if (progress >= 75) return "warnung";
  return "ok";
};

export const formatLimitMeta = ({ verbrauch, limitEuro, progress, status, fmt }) => {
  const normalizedLimit = Number(limitEuro || 0);
  const remainingPercent = Math.max(0, 100 - Number(progress || 0));

  const statusMap = {
    kein_limit: {
      label: "Kein Limit",
      badgeClass: "border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary",
      barClass: "bg-canvas-3",
      hintText: "Kein Limit gesetzt",
    },
    ok: {
      label: "OK",
      badgeClass: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      barClass: "bg-green-500",
      hintText: null,
    },
    warnung: {
      label: "Warnung",
      badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      barClass: "bg-amber-500",
      hintText: `${remainingPercent.toFixed(0)} % verbleibend`,
    },
    ueberschritten: {
      label: "Ueberschritten",
      badgeClass: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      barClass: "bg-red-500",
      hintText: "Budget ueberschritten!",
    },
  };

  return {
    verbrauchText: fmt(verbrauch),
    limitText: normalizedLimit > 0 ? fmt(normalizedLimit) : "Limit setzen",
    summaryText: normalizedLimit > 0 ? `${fmt(verbrauch)} von ${fmt(normalizedLimit)}` : `${fmt(verbrauch)} ohne Limit`,
    statusLabel: statusMap[status].label,
    statusBadgeClass: statusMap[status].badgeClass,
    progressBarClass: statusMap[status].barClass,
    hintText: statusMap[status].hintText,
  };
};
