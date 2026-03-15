import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Truck, Box, Calculator, Route } from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const TransportFeaturePage = () => {
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
          <Truck className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Transport & Volumen Planer: Optimiere deinen Umzugstransport
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Ermittle das benötigte Ladevolumen für deine Möbel und Kisten und
            erhalte eine Schätzung der Transportkosten, um dein Budget optimal
            zu planen.
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
                  <Box size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Volumenrechner für Umzugsgut
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Gib die Art und Anzahl deiner Möbelstücke und Kisten ein, um
                    das geschätzte Gesamtvolumen deines Umzugsguts zu berechnen.
                    So weißt du genau, welche Transportergröße du benötigst.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den Volumenrechner findest du typischerweise unter
                      "Bedarfsrechner" -> "Volumenrechner" oder
                      "Transportplaner". Du wählst verschiedene Möbelstücke
                      (z.B. Sofa, Bett, Schrank) und Standardgrößen von
                      Umzugskartons aus einer Liste aus und gibst die jeweilige
                      Anzahl an. Die App summiert das Volumen und zeigt dir das
                      Gesamtvolumen in Kubikmetern (m³) an. Oft wird auch direkt
                      eine empfohlene Transportergröße (z.B. Sprinter, 7,5t LKW)
                      angezeigt.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Calculator size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Transportkosten-Schätzung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Basierend auf Entfernung, Volumen und optionalen
                    Zusatzleistungen wie Helfern oder Verpackungsmaterial
                    erhältst du eine grobe Schätzung der anfallenden
                    Transportkosten.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Innerhalb des "Transportplaners" oder als Teil des
                      "Volumenrechners" kannst du die Entfernung zwischen alter
                      und neuer Adresse eingeben (oft über eine
                      Kartenschnittstelle oder PLZ-Eingabe). Zusätzlich zum
                      berechneten Volumen kannst du angeben, ob du Umzugshelfer
                      benötigst, wie viele Stunden diese gebraucht werden oder
                      ob du Verpackungsmaterial über den Anbieter beziehen
                      möchtest. Die App gibt dir dann eine Kostenschätzung
                      basierend auf Durchschnittswerten oder angebundenen
                      Partnerdiensten.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Route size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Tipps zur Optimierung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Erhalte nützliche Hinweise, wie du Ladevolumen einsparen und
                    Transportkosten senken kannst, z.B. durch Demontage von
                    Möbeln oder geschicktes Packen.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Nach der Volumen- und Kostenberechnung zeigt die App oft
                      eine Sektion mit "Optimierungstipps" an. Diese können
                      Ratschläge enthalten wie: "Demontiere große Möbelstücke,
                      um Platz zu sparen", "Nutze Hohlräume in Möbeln zum
                      Verstauen kleinerer Gegenstände" oder "Vergleiche Angebote
                      verschiedener Transportunternehmen". Manchmal sind auch
                      Links zu detaillierteren Ratgebern oder Checklisten
                      vorhanden.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/bedarfsrechner" // Link zur Hauptseite der Bedarfsrechner, wo auch der Transportplaner ist
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Zum Transportplaner
          </Link>
        </section>
      </div>
    </div>
  );
};

export default TransportFeaturePage;
