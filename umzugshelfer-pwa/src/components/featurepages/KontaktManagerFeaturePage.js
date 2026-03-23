import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Phone,
  MapPin,
  PlusCircle,
  Edit3,
  Trash2,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const KontaktManagerFeaturePage = () => {
  // const { theme } = useTheme(); // Theme wird hier nicht direkt verwendet
  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-main dark:text-dark-text-main p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-light-accent-purple dark:text-dark-accent-purple hover:opacity-80 mb-6 group"
        >
          <ArrowLeft
            size={20}
            className="mr-2 group-hover:-translate-x-1 transition-transform"
          />
          Zurück zur Startseite
        </Link>

        <header className="mb-12 text-center">
          <Users className="mx-auto h-16 w-16 text-light-accent-purple dark:text-dark-accent-purple mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Kontakt Manager: Alle wichtigen Nummern parat
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Verwalte alle relevanten Kontakte für deinen Umzug an einem
            zentralen Ort – von Umzugshelfern über Handwerker bis zu wichtigen
            Behörden.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-6 text-center sm:text-left">
            Funktionen im Detail
          </h2>
          <div className="space-y-8">
            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-purple/20 dark:bg-dark-accent-purple/20 text-light-accent-purple dark:text-dark-accent-purple flex items-center justify-center">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Zentrale Kontaktdatenbank
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Erfasse Namen, Telefonnummern, E-Mail-Adressen und Notizen
                    zu all deinen wichtigen Kontakten.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den Kontaktmanager erreichst du über den Menüpunkt
                      "Kontakte" im Dashboard. Um einen neuen Kontakt
                      hinzuzufügen, klicke auf den{" "}
                      <PlusCircle
                        size={16}
                        className="inline-block text-light-accent-purple dark:text-dark-accent-purple"
                      />{" "}
                      Button. Fülle Felder wie Name, Telefon, E-Mail, Kategorie
                      (z.B. "Handwerker", "Freund") und Notizen aus. Bestehende
                      Kontakte können über{" "}
                      <Edit3
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Bearbeiten) oder{" "}
                      <Trash2
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Löschen) Icons direkt am Kontakt modifiziert werden.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-purple/20 dark:bg-dark-accent-purple/20 text-light-accent-purple dark:text-dark-accent-purple flex items-center justify-center">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Adressverwaltung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Speichere Adressen zu deinen Kontakten, um beispielsweise
                    Handwerker schnell zu finden oder die neue Adresse an
                    Freunde weiterzugeben.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Beim Erstellen oder Bearbeiten eines Kontakts gibt es ein
                      Feld für die Adresse. Hier kannst du die vollständige
                      Anschrift (Straße, Hausnummer, PLZ, Ort) eintragen. Dies
                      ist nützlich, um beispielsweise die Adressen von
                      Umzugsunternehmen oder neuen Nachbarn parat zu haben.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-purple/20 dark:bg-dark-accent-purple/20 text-light-accent-purple dark:text-dark-accent-purple flex items-center justify-center">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Schneller Zugriff
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Greife jederzeit und von überall auf deine Kontakte zu. Kein
                    langes Suchen mehr nach Telefonnummern oder E-Mail-Adressen
                    in Notizzetteln.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Da die App eine PWA (Progressive Web App) ist, kannst du
                      sie auf deinem Smartphone oder Tablet installieren und
                      auch offline (mit zuvor synchronisierten Daten) auf deine
                      Kontakte zugreifen. Die Such- und Filterfunktion innerhalb
                      des Kontaktmanagers hilft dir, schnell die gewünschte
                      Person zu finden.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/kontakte" // Link zur eigentlichen Kontakt-Manager-Seite
            className="bg-light-accent-purple dark:bg-dark-accent-purple text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Meine Kontakte verwalten
          </Link>
        </section>
      </div>
    </div>
  );
};

export default KontaktManagerFeaturePage;
