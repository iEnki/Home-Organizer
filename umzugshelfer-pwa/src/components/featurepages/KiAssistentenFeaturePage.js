import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  MessageSquarePlus,
  ListChecks,
  Package,
} from "lucide-react";
// import { useTheme } from "../../contexts/ThemeContext"; // Nicht verwendet

const KiAssistentenFeaturePage = () => {
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
          <BrainCircuit className="mx-auto h-16 w-16 text-light-accent-green dark:text-dark-accent-green mb-4" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            KI-Assistenten: Intelligente Unterstützung für deinen Umzug
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            Lass dir von künstlicher Intelligenz unter die Arme greifen. Unsere
            Assistenten helfen dir, Aufgaben und Packlisten schneller und
            effizienter zu erstellen.
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
                  <MessageSquarePlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Textbasierte Aufgabenerstellung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Beschreibe einfach in natürlicher Sprache, was zu tun ist.
                    Unser KI-Assistent für To-Do-Listen extrahiert daraus
                    automatisch Aufgaben, schlägt Kategorien und Prioritäten
                    vor.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Den KI-Assistenten für To-Do-Listen findest du direkt in
                      der "To-Do Listen" Ansicht. Suche nach einem Button mit
                      einem{" "}
                      <BrainCircuit
                        size={16}
                        className="inline-block text-light-accent-purple dark:text-dark-accent-purple"
                      />{" "}
                      Icon oder der Beschriftung "KI Assistent". Nach dem Klick
                      öffnet sich ein Eingabefeld. Hier kannst du deine
                      Gedanken, Notizen oder eine Liste von Erledigungen als
                      Fließtext eingeben (z.B. "Morgen Vermieter anrufen wegen
                      Übergabe und dann noch Kartons im Keller holen"). Die KI
                      analysiert den Text und schlägt dir einzelne, formulierte
                      Aufgaben mit erkannten Details (wie Fälligkeiten, wenn
                      genannt) vor, die du dann direkt in deine To-Do-Liste
                      übernehmen kannst.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Intelligente Packlisten-Erfassung
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Gib eine Liste von Gegenständen ein oder beschreibe den
                    Inhalt einer Kiste. Der KI-Packlisten-Assistent hilft dir,
                    die Items zu strukturieren, Mengen zu erfassen und Kisten
                    zuzuordnen.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Ähnlich wie beim To-Do-Assistenten findest du den
                      KI-Packlisten-Assistenten in der "Packlisten"-Sektion, oft
                      über einen Button mit{" "}
                      <BrainCircuit
                        size={16}
                        className="inline-block text-light-accent-purple dark:text-dark-accent-purple"
                      />{" "}
                      Icon. Du kannst hier entweder eine kommaseparierte Liste
                      von Gegenständen eingeben (z.B. "Teller, Tassen, Besteck,
                      Gläser") oder den Inhalt einer Kiste frei beschreiben. Die
                      KI versucht, einzelne Gegenstände zu identifizieren,
                      schlägt Mengen vor und hilft dir, diese schnell einer
                      bestimmten Kiste zuzuordnen oder neue Kisten anzulegen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-light-accent-green/20 dark:bg-dark-accent-green/20 text-light-accent-green dark:text-dark-accent-green flex items-center justify-center">
                  <ListChecks size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                    Automatische Vervollständigung & Vorschläge
                  </h3>
                  <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Während du tippst, machen unsere Assistenten intelligente
                    Vorschläge, um den Erfassungsprozess zu beschleunigen und
                    dir zu helfen, an alles Wichtige zu denken.
                  </p>
                  <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                      Diese Funktion ist oft subtil integriert. Wenn du
                      beispielsweise in der To-Do-Beschreibung "Mietvertrag..."
                      tippst, könnte die KI direkt "Mietvertrag kündigen" oder
                      "Mietvertrag neue Wohnung prüfen" als Vervollständigung
                      vorschlagen. Bei Packlisten könnte nach Eingabe von
                      "Bücher" automatisch die Kategorie "Wohnzimmer" oder
                      "Arbeitszimmer" vorgeschlagen werden, basierend auf
                      typischen Zuordnungen. Diese Vorschläge erscheinen meist
                      als Dropdown oder Inline-Text während der Eingabe.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="text-center py-10">
          <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
            Die KI-Assistenten findest du direkt in den jeweiligen Modulen:
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              to="/todos"
              className="bg-light-accent-purple dark:bg-dark-accent-purple text-white dark:text-dark-bg font-semibold py-2 px-6 rounded-md hover:opacity-90 transition-colors text-sm"
            >
              Zu den To-Do Listen
            </Link>
            <Link
              to="/packliste"
              className="bg-light-accent-blue dark:bg-dark-accent-blue text-white dark:text-dark-bg font-semibold py-2 px-6 rounded-md hover:opacity-90 transition-colors text-sm"
            >
              Zur Packliste
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default KiAssistentenFeaturePage;
