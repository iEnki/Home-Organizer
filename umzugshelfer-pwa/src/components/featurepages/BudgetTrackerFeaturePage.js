import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  PieChart,
  ListPlus,
  PlusCircle,
  Edit3,
  Trash2,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const BudgetTrackerFeaturePage = () => {
  // const { theme } = useTheme(); // Theme wird hier nicht direkt verwendet
  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-main dark:text-dark-text-main p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-light-accent-green dark:text-dark-accent-green hover:opacity-80 mb-6 group"
        >
          <ArrowLeft
            size={20}
            className="mr-2 group-hover:-translate-x-1 transition-transform"
          />
          Zurück zur Startseite
        </Link>

        <header className="mb-12 text-center">
          <DollarSign className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Budget Tracker: Finanzen fest im Griff
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Behalte die volle Kontrolle über deine Umzugskosten. Erfasse
            Einnahmen und Ausgaben, kategorisiere Posten und visualisiere deine
            finanzielle Situation.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-6 text-center sm:text-left">
            Funktionen im Detail
          </h2>
          <div className="space-y-8">
            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <ListPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Einfache Erfassung von Posten
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Füge schnell und unkompliziert Einnahmen (z.B. Kaution
                    zurück) und Ausgaben (z.B. Mietwagen, Kartons,
                    Renovierungsmaterial) hinzu.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den Budget Tracker findest du im Dashboard unter "Budget".
                      Um einen neuen Posten hinzuzufügen, klicke auf den{" "}
                      <PlusCircle
                        size={16}
                        className="inline-block text-light-accent-green dark:text-dark-accent-green"
                      />{" "}
                      Button. Gib eine Beschreibung, den Betrag, den Typ
                      (Einnahme/Ausgabe), eine Kategorie und das Datum ein.
                      Bestehende Posten können über{" "}
                      <Edit3
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Bearbeiten) oder{" "}
                      <Trash2
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Löschen) Icons direkt am Posten modifiziert werden.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <PieChart size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Kategorisierung und Übersicht
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Weise jeden Posten einer Kategorie zu (z.B. Transport,
                    Material, Kautionen), um einen klaren Überblick über die
                    Kostenstruktur deines Umzugs zu erhalten.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Beim Erstellen oder Bearbeiten eines Budgetpostens kannst
                      du eine Kategorie aus einer vordefinierten Liste auswählen
                      oder eine neue hinzufügen. Die App stellt deine Ausgaben
                      oft in einem Diagramm (z.B. Tortendiagramm) nach
                      Kategorien dar, sodass du auf einen Blick siehst, wofür du
                      am meisten Geld ausgibst. Eine tabellarische Übersicht,
                      gruppiert nach Kategorien, ist ebenfalls üblich.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Saldo und Visualisierung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Verfolge deinen aktuellen Saldo und visualisiere deine
                    Finanzen mit Diagrammen, um Trends zu erkennen und dein
                    Budget optimal zu steuern.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Auf der Hauptseite des Budget Trackers wird dir dein
                      aktueller Gesamtsaldo (Einnahmen minus Ausgaben) prominent
                      angezeigt. Zusätzlich werden oft Diagramme verwendet, um
                      den Verlauf deiner Ausgaben über die Zeit oder die
                      Verteilung der Kosten auf verschiedene Kategorien
                      darzustellen. Dies hilft dir, dein Budget im Auge zu
                      behalten und gegebenenfalls Anpassungen vorzunehmen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/budget" // Link zur eigentlichen Budget-Tracker-Seite
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Meinen Budget Tracker öffnen
          </Link>
        </section>
      </div>
    </div>
  );
};

export default BudgetTrackerFeaturePage;
