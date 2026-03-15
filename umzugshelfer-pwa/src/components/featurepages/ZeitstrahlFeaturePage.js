import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Milestone,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Korrekter Pfad

const ZeitstrahlFeaturePage = () => {
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
          <CalendarClock className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Umzugs-Zeitstrahl: Alle Fristen im Blick
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Visualisiere den gesamten Umzugsprozess auf einem interaktiven
            Zeitstrahl. Verpasse keine wichtigen Termine oder Fristen mehr und
            plane vorausschauend.
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
                  <Milestone size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Chronologische Aufgabenansicht
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Alle deine To-Dos mit Fälligkeitsdatum werden automatisch
                    auf einem übersichtlichen Zeitstrahl dargestellt. So siehst
                    du auf einen Blick, was als Nächstes ansteht.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den Umzugs-Zeitstrahl findest du im Dashboard unter
                      "Umzugsplaner" oder einem ähnlichen Menüpunkt, der eine
                      Gesamtübersicht bietet. Aufgaben, die du in den "To-Do
                      Listen" mit einem Fälligkeitsdatum versiehst, erscheinen
                      automatisch chronologisch auf diesem Zeitstrahl. Wichtige
                      Meilensteine wie "Mietvertrag unterschreiben", "Kündigung
                      alte Wohnung", "Umzugstag" werden visuell hervorgehoben.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Fortschrittsverfolgung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Markiere erledigte Aufgaben direkt im Zeitstrahl und
                    verfolge deinen Fortschritt visuell. Motiviere dich selbst,
                    indem du siehst, was du schon alles geschafft hast.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Wenn du eine Aufgabe in den To-Do Listen als erledigt
                      markierst, wird dies auch im Zeitstrahl visualisiert (z.B.
                      durch farbliche Kennzeichnung oder ein Häkchen{" "}
                      <CheckCircle
                        size={16}
                        className="inline-block text-light-accent-green dark:text-dark-accent-green"
                      />
                      ). So siehst du direkt auf dem Zeitstrahl, welche Phasen
                      deines Umzugs bereits abgeschlossen sind und wo noch
                      Handlungsbedarf besteht. Einige Darstellungen zeigen
                      möglicherweise auch einen prozentualen Fortschrittsbalken
                      für den gesamten Umzug oder einzelne Phasen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Fristen-Warnungen (Geplant)
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    In Zukunft: Erhalte automatische Erinnerungen für
                    bevorstehende oder überfällige Aufgaben, damit du kritische
                    Deadlines nicht vergisst.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Diese Funktion ist aktuell in Planung. Zukünftig soll die
                      App dich proaktiv an wichtige Fristen erinnern, die sich
                      aus deinen To-Do-Einträgen ergeben. Du könntest dann
                      Benachrichtigungen (z.B. per E-Mail oder
                      In-App-Benachrichtigung) erhalten, wenn eine Aufgabe bald
                      fällig wird oder bereits überfällig ist. Dies hilft,
                      kritische Termine wie Kündigungsfristen oder Ummeldungen
                      nicht zu versäumen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/umzugsplaner" // Link zur eigentlichen Umzugsplaner-Seite, die den Zeitstrahl enthält
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Meinen Umzugs-Zeitstrahl ansehen
          </Link>
        </section>
      </div>
    </div>
  );
};

export default ZeitstrahlFeaturePage;
