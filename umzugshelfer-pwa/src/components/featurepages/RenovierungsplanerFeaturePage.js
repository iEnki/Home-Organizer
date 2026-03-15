import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Palette,
  Paintbrush,
  Ruler,
  ShoppingCart,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const RenovierungsplanerFeaturePage = () => {
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
          <Palette className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Renovierungsplaner: Dein Projekt im Griff
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Plane alle anfallenden Renovierungsarbeiten für deine alte und neue
            Wohnung. Berechne Materialbedarf und Kosten für Farben, Tapeten,
            Böden und mehr.
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
                  <Paintbrush size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Materialbedarfsrechner
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Ermittle präzise, wie viel Farbe, Tapete, Bodenbelag oder
                    Dämmstoff du für deine Räume benötigst. Vermeide
                    Materialüberschuss oder -mangel.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den Renovierungsplaner (oft als Teil der "Bedarfsrechner")
                      findest du im Dashboard. Wähle die Art der Renovierung
                      (z.B. Streichen, Tapezieren, Boden legen). Gib die Maße
                      des Raumes oder der Fläche ein (Länge, Breite, Höhe,
                      Anzahl Fenster/Türen). Die App berechnet dann die
                      benötigte Menge an Material (z.B. Liter Farbe, Rollen
                      Tapete, m² Bodenbelag) unter Berücksichtigung von
                      Verschnitt.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Ruler size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Raum- und Flächenmanagement
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Lege Räume mit ihren spezifischen Abmessungen an. Die App
                    hilft dir, den Materialbedarf pro Raum und für das gesamte
                    Projekt zu kalkulieren.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Du kannst mehrere Räume oder Flächen definieren und für
                      jeden einzelnen den Materialbedarf berechnen lassen. Oft
                      gibt es eine Übersicht, in der alle angelegten Räume mit
                      ihrem jeweiligen Materialbedarf und den geschätzten Kosten
                      aufgelistet sind. Dies ermöglicht eine detaillierte
                      Planung für das gesamte Renovierungsprojekt.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <ShoppingCart size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Kostenübersicht und Einkaufsliste
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Erhalte eine geschätzte Kostenübersicht für deine
                    Renovierungsmaterialien und erstelle eine praktische
                    Einkaufsliste für den Baumarkt.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Nachdem du den Materialbedarf für alle Räume ermittelt
                      hast, kann die App eine zusammenfassende Einkaufsliste
                      generieren. Diese listet alle benötigten Materialien mit
                      den jeweiligen Mengen auf. Optional kannst du
                      Durchschnittspreise hinterlegen oder die App schätzt die
                      Kosten, um dir eine Budgetübersicht zu geben. Die
                      Einkaufsliste kann oft als PDF exportiert oder direkt in
                      der App abgehakt werden.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/bedarfsrechner" // Link zur Hauptseite der Bedarfsrechner
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Zum Renovierungsplaner
          </Link>
        </section>
      </div>
    </div>
  );
};

export default RenovierungsplanerFeaturePage;
