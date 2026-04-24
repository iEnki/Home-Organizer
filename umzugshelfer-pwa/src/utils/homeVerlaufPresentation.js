const TABELLEN_META = {
  home_objekte: { label: "Inventar", emoji: "📦" },
  budget_posten: { label: "Budget", emoji: "💶" },
  rechnungen: { label: "Rechnungen", emoji: "🧾" },
  home_geraete: { label: "Geräte", emoji: "🔧" },
  home_einkaufliste: { label: "Einkaufsliste", emoji: "🛒" },
  home_projekte: { label: "Projekte", emoji: "📋" },
  home_vorraete: { label: "Vorräte", emoji: "🥫" },
  todo_aufgaben: { label: "Aufgaben", emoji: "✅" },
  home_wissen: { label: "Wissen", emoji: "📚" },
  home_bewohner: { label: "Bewohner", emoji: "👥" },
  home_wartungen: { label: "Wartungen", emoji: "🔧" },
  home_orte: { label: "Orte", emoji: "📍" },
  dokumente: { label: "Dokumente", emoji: "📄" },
  home_buecher: { label: "Bücher", emoji: "📚" },
  home_sparziele: { label: "Sparziele", emoji: "🎯" },
};

const AKTIONS_META = {
  erstellt: { label: "erstellt" },
  geaendert: { label: "geändert" },
  geloescht: { label: "gelöscht" },
};

export const getVerlaufTableMeta = (tabelle) =>
  TABELLEN_META[tabelle] || { label: tabelle || "Unbekannt", emoji: "📝" };

export const getVerlaufActionMeta = (aktion) =>
  AKTIONS_META[aktion] || { label: aktion || "aktualisiert" };

export const getVerlaufDisplayText = (entry) => {
  const { label: bereichLabel } = getVerlaufTableMeta(entry?.tabelle);
  const { label: aktionLabel } = getVerlaufActionMeta(entry?.aktion);
  const name = entry?.datensatz_name?.trim();

  return name ? `${name} ${aktionLabel}` : `${bereichLabel} ${aktionLabel}`;
};
