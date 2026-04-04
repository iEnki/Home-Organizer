// Schritt-Definitionen für die interaktive Tour des Home Organizers
// Jeder Schritt: { target: "data-tour-id", title, text, position }

export const TOUR_STEPS = {
  // Dashboard-Tour dient gleichzeitig als Einstiegstour (Variante A).
  // Nur 3 Schritte – knapp und fokussiert.
  // Hinweis: tour-topbar-profil ist hidden md:flex (Desktop/Tablet only).
  // Auf Mobile überspringt die Retry-Logik diesen Schritt nach 1s sauber.
  dashboard: [
    {
      target: "tour-dashboard-willkommen",
      title: "Willkommen im Home Organizer",
      text: "Dein Dashboard zeigt dir täglich den Überblick: offene Aufgaben, Vorratsstatus und Budget auf einen Blick.",
      position: "bottom",
    },
    {
      target: "tour-dashboard-budget",
      title: "Budget-Übersicht",
      text: "Hier siehst du deine monatlichen Ausgaben und kannst direkt in den Finanzmanager wechseln.",
      position: "bottom",
    },
    {
      target: "tour-topbar-profil",
      title: "Dein Profil",
      text: "Hier verwaltest du dein Konto und kannst Touren jederzeit neu starten.",
      position: "bottom",
    },
  ],

  inventar: [
    {
      target: "tour-inventar-hinzufuegen",
      title: "Neues Objekt hinzufügen",
      text: "Füge einen neuen Gegenstand hinzu. Gib Name, Kategorie, Standort und Beschreibung ein und speichere ihn in deinem Inventar.",
      position: "bottom",
    },
    {
      target: "tour-inventar-filter",
      title: "Filter & Suche",
      text: "Nutze diese Filter, um Gegenstände nach Kategorie, Standort oder Status zu sortieren. Das Suchfeld hilft dir, ein bestimmtes Objekt schnell zu finden.",
      position: "bottom",
    },
    {
      target: "tour-inventar-liste",
      title: "Dein Inventar",
      text: "Jede Karte repräsentiert einen Gegenstand. Über das Stift-Symbol bearbeitest du den Eintrag, über den Papierkorb löschst du ihn.",
      position: "top",
    },
  ],

  vorraete: [
    {
      target: "tour-vorraete-hinzufuegen",
      title: "Neuen Vorrat hinzufügen",
      text: "Lege einen neuen Vorratsartikel an. Gib Name, aktuelle Menge, Mindestbestand und Standort an.",
      position: "bottom",
    },
    {
      target: "tour-vorraete-filter",
      title: "Kategorie & Standort-Filter",
      text: "Sortiere deine Vorräte nach Kategorie oder Standort, um schnell zu sehen, was wo gelagert wird.",
      position: "bottom",
    },
    {
      target: "tour-vorraete-liste",
      title: "Vorratsliste",
      text: "Hier siehst du alle Vorräte. Ein farbiger Indikator zeigt den Status: Grün = ausreichend, Gelb = knapp, Rot = leer oder unter Mindestbestand.",
      position: "top",
    },
    {
      target: "tour-vorraete-einkauf",
      title: "Zur Einkaufsliste hinzufügen",
      text: "Artikel unter dem Mindestbestand können direkt zur Einkaufsliste hinzugefügt werden – so vergisst du nichts beim Einkaufen.",
      position: "left",
    },
  ],

  geraete: [
    {
      target: "tour-geraete-hinzufuegen",
      title: "Neues Gerät hinzufügen",
      text: "Trage ein neues Gerät ein: Name, Kaufdatum, Standort, Garantiezeit und nächste Wartung – alles an einem Ort.",
      position: "bottom",
    },
    {
      target: "tour-geraete-liste",
      title: "Geräteliste",
      text: "Liste aller registrierten Geräte mit Name, Standort, letztem Wartungsdatum und aktuellem Status.",
      position: "top",
    },
    {
      target: "tour-geraete-status",
      title: "Wartungs-Status",
      text: "Die Farbmarkierung zeigt, ob ein Gerät gewartet werden muss: Grün = OK, Gelb = bald fällig, Rot = überfällig.",
      position: "left",
    },
  ],

  bewohner: [
    {
      target: "tour-bewohner-hinzufuegen",
      title: "Bewohner hinzufügen",
      text: "Füge eine weitere Person zum Haushalt hinzu. Du kannst Aufgaben zuteilen und ihren Fortschritt verfolgen.",
      position: "bottom",
    },
    {
      target: "tour-bewohner-liste",
      title: "Bewohnerliste",
      text: "Jede Karte zeigt Name und Aufgabenstatus eines Bewohners. Klicke auf eine Person, um ihr Aufgaben zuzuweisen.",
      position: "top",
    },
  ],

  einkaufliste: [
    {
      target: "tour-einkauf-hinzufuegen",
      title: "Sammelerfassung",
      text: "Hier legst du einzelne oder mehrere Artikel auf einmal an. Kommas, Semikolons und Zeilenumbrüche werden als getrennte Einträge erkannt.",
      position: "bottom",
    },
    {
      target: "tour-einkauf-suche",
      title: "Suche",
      text: "Suche nach Artikeln, Hauptkategorien oder Unterkategorien. So findest du auch längere Listen schnell wieder.",
      position: "bottom",
    },
    {
      target: "tour-einkauf-filter",
      title: "Filter & Review",
      text: "Filtere nach offenen, erledigten oder prüfbedürftigen Artikeln. Unsichere Zuordnungen werden hier gezielt sichtbar.",
      position: "bottom",
    },
    {
      target: "tour-einkauf-sort",
      title: "Sortierung",
      text: "Wechsle zwischen Markt-Reihenfolge, Kategorie-Ansicht und Neueste. Standard ist die Markt-Reihenfolge für den Einkauf.",
      position: "bottom",
    },
    {
      target: "tour-einkauf-liste",
      title: "Gruppierte Einkaufsliste",
      text: "Offene Artikel werden gruppiert angezeigt. Prüfen-Badges markieren unsichere Einträge, die du per Bearbeiten dauerhaft korrigieren kannst.",
      position: "top",
    },
  ],

  aufgaben: [
    {
      target: "tour-aufgaben-hinzufuegen",
      title: "Neue Aufgabe",
      text: "Erstelle eine Aufgabe mit Titel, Kategorie, Priorität und Fälligkeit. Du kannst auch eine Notiz hinzufügen.",
      position: "bottom",
    },
    {
      target: "tour-aufgaben-filter",
      title: "Filter",
      text: "Suche gezielt nach Aufgaben in bestimmten Bereichen oder mit bestimmtem Status (offen, in Bearbeitung, erledigt).",
      position: "bottom",
    },
    {
      target: "tour-aufgaben-liste",
      title: "Aufgabenliste",
      text: "Zeigt alle Aufgaben. Klicke auf die Checkbox, um eine Aufgabe als erledigt zu markieren. Farben oder Icons kennzeichnen die Priorität.",
      position: "top",
    },
  ],

  projekte: [
    {
      target: "tour-projekte-hinzufuegen",
      title: "Neues Projekt",
      text: "Lege ein Haushaltsprojekt an – z. B. Renovierung, Möbelkauf oder Gartenpflege. Definiere Titel, Budget, Start- und Enddatum.",
      position: "bottom",
    },
    {
      target: "tour-projekte-liste",
      title: "Projektkarten",
      text: "Jede Karte zeigt Budgetfortschritt, Aufgabenstatus und wichtige Termine. Klicke auf eine Karte, um Details zu sehen.",
      position: "top",
    },
    {
      target: "tour-projekte-status",
      title: "Statusindikatoren",
      text: "Farben oder Symbole zeigen, ob das Projekt im Plan ist, Verzögerungen hat oder das Budget überschreitet.",
      position: "left",
    },
  ],

  budget: [
    {
      target: "tour-budget-hinzufuegen",
      title: "Ausgabe erfassen",
      text: "Erfasse eine neue Ausgabe. Wähle Kategorie, Datum und Betrag, um deine Haushaltskasse aktuell zu halten.",
      position: "bottom",
    },
    {
      target: "tour-budget-limits",
      title: "Monatliche Limits",
      text: "Lege Budgetgrenzen pro Kategorie fest. Der Fortschrittsbalken zeigt, wie viel vom Budget bereits ausgegeben wurde.",
      position: "bottom",
    },
    {
      target: "tour-budget-uebersicht",
      title: "Monatsübersicht",
      text: "Oben siehst du die Gesamtausgaben dieses Monats und wie viele Buchungen du erfasst hast – inkl. Vergleich zum Vormonat.",
      position: "bottom",
    },
    {
      target: "tour-budget-tabs",
      title: "Reiter: Übersicht / Statistiken / Sparziele",
      text: "Wechsle zwischen Monatsübersicht, Statistiken mit Diagrammen (Jahres- und Monatsansicht) und deinen Sparzielen.",
      position: "bottom",
    },
    {
      target: "tour-budget-sparziele",
      title: "Sparziele",
      text: "Lege Sparziele an (z. B. Urlaub, neue Waschmaschine). Du kannst Beträge zuweisen und den Fortschritt verfolgen.",
      position: "top",
    },
  ],

  suche: [
    {
      target: "tour-suche-feld",
      title: "Globale Suche",
      text: "Gib einen Suchbegriff ein, um alle Bereiche gleichzeitig zu durchsuchen: Gegenstände, Vorräte, Aufgaben, Projekte und mehr.",
      position: "bottom",
    },
    {
      target: "tour-suche-tabs",
      title: "Ergebnis-Kategorien",
      text: "Ergebnisse werden nach Kategorie gruppiert. Klicke auf einen Reiter, um nur Einträge aus diesem Bereich zu sehen.",
      position: "bottom",
    },
  ],
  dokumente: [
    {
      target: "tour-dokumente-header",
      title: "Dokumentenarchiv",
      text: "Hier speicherst du alle wichtigen Dokumente deines Haushalts: Rechnungen, Verträge, Handbücher, Garantiebelege und mehr – übersichtlich kategorisiert.",
      position: "bottom",
    },
    {
      target: "tour-dokumente-upload",
      title: "Hochladen",
      text: "Klicke hier, um eine neue Datei hochzuladen. Du kannst eine Kategorie und eine Beschreibung vergeben.",
      position: "bottom",
    },
    {
      target: "tour-dokumente-suche",
      title: "Suche",
      text: "Suche nach Dateinamen oder Beschreibungen – die Ergebnisse werden sofort in Echtzeit gefiltert.",
      position: "bottom",
    },
    {
      target: "tour-dokumente-filter",
      title: "Kategorie-Filter",
      text: "Filtere nach Typ: Rechnung, Vertrag, Handbuch usw. Die Zahl zeigt, wie viele Dokumente in jeder Kategorie liegen.",
      position: "bottom",
    },
    {
      target: "tour-dokumente-liste",
      title: "Dokumentenkarten",
      text: "Jede Karte zeigt Dateiname, Kategorie, Größe und Datum. Per Klick herunterladen, als Wissenseintrag speichern oder löschen.",
      position: "top",
    },
  ],
};
