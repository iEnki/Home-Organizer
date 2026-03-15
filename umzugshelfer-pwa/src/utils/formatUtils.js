export const formatGermanCurrency = (value) => {
  const number = parseFloat(value);
  if (isNaN(number)) {
    // Überlege, ob "0,00" der beste Fallback ist oder vielleicht "" oder eine Fehlermeldung.
    // Für konsistente Anzeige in Tabellen/Listen ist "0,00" oft besser als leere Strings.
    return "0,00";
  }
  return number.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Falls du später auch eine Version mit Währungssymbol brauchst:
/*
export const formatGermanCurrencyWithSymbol = (value) => {
  const number = parseFloat(value);
  if (isNaN(number)) {
    return ""; 
  }
  return number.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
};
*/
