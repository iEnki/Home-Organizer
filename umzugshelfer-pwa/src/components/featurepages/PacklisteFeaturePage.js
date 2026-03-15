import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  QrCode,
  Camera,
  Zap,
  Search,
  Edit3,
  ScanLine,
  BrainCircuit,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const PacklisteFeaturePage = () => {
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
          <Package className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Intelligente Packlisten: Nie wieder etwas verlieren
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Organisiere dein gesamtes Hab und Gut digital. Unsere
            Packlisten-Funktion macht das Kistenpacken und Wiederfinden zum
            Kinderspiel.
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
                  <QrCode size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    QR-Code System für jede Kiste
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Generiere eindeutige QR-Codes für jede deiner Umzugskisten.
                    Ein schneller Scan mit deinem Smartphone zeigt dir sofort
                    den Inhalt, ohne die Kiste öffnen zu müssen.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Navigiere im Dashboard zu "Packlisten". Für jede erstellte
                      Kiste kannst du einen QR-Code generieren lassen (oft ein{" "}
                      <QrCode
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon neben der Kiste). Drucke diesen Code aus und bringe
                      ihn an der Kiste an. Später kannst du mit der integrierten
                      Scan-Funktion der App (oft ein{" "}
                      <ScanLine
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon in der Packlisten-Übersicht oder ein dedizierter
                      "Scan" Menüpunkt) den Code scannen, um sofort den
                      digitalen Inhalt der Kiste anzuzeigen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Camera size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Fotos von Kisten und Inhalt
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Mache Fotos von gepackten Kisten oder wertvollen
                    Gegenständen und füge sie deiner digitalen Packliste hinzu.
                    So weißt du immer, was wo ist und wie es aussah.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Beim Bearbeiten einer Kiste (
                      <Edit3
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon) oder eines Gegenstands innerhalb einer Kiste findest
                      du eine Option zum Hochladen oder Aufnehmen von Fotos
                      (z.B. ein{" "}
                      <Camera
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon). Diese Bilder werden dann in der Detailansicht der
                      Kiste oder des Gegenstands angezeigt und helfen dir, den
                      Inhalt visuell zuzuordnen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Zap size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    KI-gestützte Inhaltserfassung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Nutze unseren KI-Assistenten, um schnell Gegenstände zu
                    deinen Kisten hinzuzufügen. Die KI kann auch Kategorien
                    vorschlagen und hilft dir, den Überblick zu behalten.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      In der Packlisten-Verwaltung gibt es oft einen Button "KI
                      Packliste" oder ein{" "}
                      <BrainCircuit
                        size={16}
                        className="inline-block text-light-accent-purple dark:text-dark-accent-purple"
                      />{" "}
                      Icon. Dort kannst du eine Liste von Gegenständen per Text
                      eingeben oder diktieren. Die KI analysiert deine Eingabe
                      und schlägt einzelne Gegenstände mit Mengen und ggf.
                      Kategorien vor, die du dann einfach zu deinen Kisten
                      hinzufügen kannst.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Search size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Durchsuchebare Listen
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Finde jeden Gegenstand und jede Kiste schnell über die
                    Suchfunktion. Filtere nach Name, Raum oder Inhalt.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Innerhalb der Packlisten-Ansicht befindet sich meist oben
                      ein Suchfeld (
                      <Search
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon). Gib dort den Namen eines Gegenstands, einer Kiste
                      oder eines Raumes ein, um deine Packlisten dynamisch zu
                      filtern und schnell das Gesuchte zu finden.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/packliste" // Link zur eigentlichen Packlisten-Seite
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Zu meiner Packliste
          </Link>
        </section>
      </div>
    </div>
  );
};

export default PacklisteFeaturePage;
