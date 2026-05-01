import { formatNumber } from "./intlFormatters";

export const formatGermanCurrency = (value) => {
  const formatted = formatNumber(value, "de", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted || "0,00";
};
