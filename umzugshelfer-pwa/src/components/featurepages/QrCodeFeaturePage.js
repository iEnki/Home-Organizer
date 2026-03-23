import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  QrCode,
  PackageSearch,
  Smartphone,
  ScanLine,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const QrCodeFeaturePage = () => {
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
          <QrCode className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            QR-Code System: Kisten-Management leicht gemacht
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Vergiss das mühsame Beschriften und Suchen von Kisteninhalten. Mit
            unserem QR-Code-System weißt du immer genau, was in welcher Kiste
            ist.
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
                    Eindeutige QR-Codes für jede Kiste
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Generiere für jede deiner Umzugskisten einen einzigartigen
                    QR-Code. Drucke ihn aus und klebe ihn auf die Kiste.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Diese Funktion ist eng mit den "Intelligenten Packlisten"
                      verbunden. Wenn du im Bereich "Packlisten" eine neue Kiste
                      anlegst oder eine bestehende bearbeitest, findest du eine
                      Option "QR-Code generieren" (oft ein{" "}
                      <QrCode
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon). Ein Klick darauf erstellt einen einzigartigen
                      QR-Code für diese spezifische Kiste. Diesen Code kannst du
                      dann ausdrucken (die App bietet eventuell eine
                      Druckansicht oder Download-Möglichkeit) und gut sichtbar
                      auf die entsprechende physische Kiste kleben.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Scannen mit dem Smartphone
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Nutze die Kamera deines Smartphones und unsere App, um den
                    QR-Code auf einer Kiste zu scannen.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      In der App, typischerweise im Bereich "Packlisten" oder
                      über einen globalen Scan-Button (
                      <ScanLine
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon), kannst du die Scan-Funktion aktivieren. Die App
                      wird dann die Kamera deines Smartphones nutzen. Richte die
                      Kamera auf den QR-Code, den du zuvor auf die Kiste geklebt
                      hast. Die App erkennt den Code automatisch.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <PackageSearch size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Sofortige Inhaltsanzeige
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Nach dem Scan wird dir sofort der in der App hinterlegte
                    Inhalt der Kiste angezeigt – inklusive Fotos, falls du
                    welche hinzugefügt hast. Kein Öffnen und Wühlen mehr nötig!
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Sobald der QR-Code erfolgreich gescannt wurde, leitet dich
                      die App direkt zur Detailansicht der entsprechenden Kiste
                      in deiner digitalen Packliste. Dort siehst du alle
                      Gegenstände, die du für diese Kiste erfasst hast,
                      inklusive Beschreibungen, Mengen und eventuell
                      hinzugefügter Fotos der Gegenstände oder der gepackten
                      Kiste. Das erspart dir das Öffnen jeder Kiste, wenn du
                      etwas Bestimmtes suchst.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/packliste" // Das QR-Code System ist Teil der Packlisten-Funktion
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Zur Packliste & QR-Codes
          </Link>
        </section>
      </div>
    </div>
  );
};

export default QrCodeFeaturePage;
