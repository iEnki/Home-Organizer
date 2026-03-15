import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ListChecks,
  CheckSquare,
  Filter,
  Zap,
  CalendarPlus, // Behalten, da es im Code verwendet wird (oder werden sollte)
  PlusCircle,
  Edit3,
  Trash2,
  Circle,
  CheckCircle,
  BrainCircuit,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const TodoListenFeaturePage = () => {
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
          <ListChecks className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            Smarte To-Do Listen: Behalte den Überblick
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Unsere intelligenten To-Do-Listen helfen dir, jede Aufgabe deines
            Umzugs effizient zu managen – von der Kündigung des alten
            Mietvertrags bis zur Schlüsselübergabe der neuen Wohnung.
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
                  <CheckSquare size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Aufgabenverwaltung leicht gemacht
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Erstelle, bearbeite und lösche Aufgaben mit wenigen Klicks.
                    Markiere erledigte Aufgaben, um deinen Fortschritt zu
                    visualisieren.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Du findest die To-Do Listen im Dashboard unter dem
                      Menüpunkt "To-Do Listen". Zum Erstellen einer neuen
                      Aufgabe klicke auf den{" "}
                      <PlusCircle
                        size={16}
                        className="inline-block text-light-accent-green dark:text-dark-accent-green"
                      />{" "}
                      Button (oft unten rechts oder oben auf der Seite). Fülle
                      das Formular mit Beschreibung, Kategorie, Priorität und
                      optional Fälligkeitsdatum aus. Bestehende Aufgaben können
                      über{" "}
                      <Edit3
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Bearbeiten) oder{" "}
                      <Trash2
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      (Löschen) Icons direkt an der Aufgabe modifiziert werden.
                      Erledigte Aufgaben werden durch Klick auf das{" "}
                      <Circle
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon (wird zu{" "}
                      <CheckCircle
                        size={16}
                        className="inline-block text-light-accent-green dark:text-dark-accent-green"
                      />
                      ) markiert.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Filter size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Automatische Kategorisierung & Priorisierung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Unsere KI schlägt automatisch passende Kategorien (z.B.
                    Behördengänge, Verträge, Packen) und Prioritäten für deine
                    Aufgaben vor, basierend auf Schlüsselwörtern in der
                    Beschreibung.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Wenn du eine neue Aufgabe erstellst und eine Beschreibung
                      eingibst, analysiert die App den Text. Basierend auf
                      erkannten Schlüsselwörtern (z.B. "Mietvertrag kündigen",
                      "Strom ummelden") werden dir automatisch eine passende
                      Kategorie (z.B. "Verträge", "Versorger") und eine
                      Priorität (z.B. "Hoch") vorgeschlagen. Du kannst diese
                      Vorschläge übernehmen oder manuell anpassen.
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
                    Vorlagen & KI-Assistent
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Nutze vordefinierte Aufgaben-Vorlagen für typische
                    Umzugsphasen oder lasse unseren KI-Assistenten To-Dos aus
                    deinen Notizen extrahieren. Das spart Zeit und stellt
                    sicher, dass du nichts Wichtiges vergisst.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Beim Erstellen einer neuen Aufgabe findest du oft ein
                      Dropdown-Menü "Vorlage wählen". Hier kannst du aus einer
                      Liste typischer Umzugsaufgaben (z.B. "Nachsendeauftrag
                      stellen") wählen, um die Felder vorab auszufüllen. Den
                      KI-Assistenten startest du über einen Button mit{" "}
                      <BrainCircuit
                        size={16}
                        className="inline-block text-light-accent-purple dark:text-dark-accent-purple"
                      />{" "}
                      Icon oder der Beschriftung "KI Assistent". Gib dort deine
                      Notizen oder eine Sprachaufnahme ein, und die KI
                      extrahiert daraus automatisch To-Do-Einträge.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <CalendarPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Kalender-Export & Erinnerungen
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Exportiere fällige Aufgaben als .ics-Datei für deinen
                    Kalender und setze Erinnerungen, um keine Fristen zu
                    verpassen.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Bei Aufgaben mit einem Fälligkeitsdatum findest du oft ein{" "}
                      <CalendarPlus
                        size={16}
                        className="inline-block text-light-text-main dark:text-dark-text-main"
                      />{" "}
                      Icon (Kalender-Export). Ein Klick darauf generiert eine
                      .ics-Datei, die du in gängige Kalenderanwendungen
                      importieren kannst. Erinnerungen können meist direkt beim
                      Bearbeiten der Aufgabe über ein Datumsfeld "Erinnerung
                      am/um" gesetzt werden.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <Link
            to="/todos" // Link zur eigentlichen To-Do-Listen-Seite
            className="bg-light-accent-green dark:bg-dark-accent-green text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Zu meinen To-Do Listen
          </Link>
        </section>
      </div>
    </div>
  );
};

export default TodoListenFeaturePage;
