import React, { useState } from "react";
import { Link } from "react-router-dom";
import LoginForm from "./LoginForm";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";

import {
  ListChecks,
  Package,
  DollarSign,
  Users,
  Truck,
  BrainCircuit,
  QrCode,
  ShoppingCart,
  ClipboardList,
  Home,
} from "lucide-react";

const FeatureCard = ({ icon, title, description, accent = "green" }) => (
  <div className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border hover:shadow-xl transition-shadow h-full">
    <div className={`flex justify-center items-center mb-4 w-12 h-12 rounded-full text-white ${
      accent === "teal" ? "bg-teal-500" : "bg-light-accent-green dark:bg-dark-accent-green"
    }`}>
      {icon}
    </div>
    <h3 className="mb-2 text-xl font-semibold text-light-text-main dark:text-dark-text-main">
      {title}
    </h3>
    <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
      {description}
    </p>
  </div>
);

const HomePage = ({ setSession }) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
  };

  return (
    <div className="text-light-text-main dark:text-dark-text-main min-h-screen">
      {/* Nav */}
      <nav className="bg-light-bg dark:bg-dark-bg shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <Link
            to="/"
            className="text-2xl font-bold text-light-accent-green dark:text-dark-accent-green hover:opacity-80"
          >
            Umzugsplaner
          </Link>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 items-center">
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full sm:w-auto bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-semibold py-2 px-4 rounded-md hover:opacity-90 transition-colors text-sm"
            >
              Anmelden
            </button>
            <Link
              to="/register"
              className="w-full sm:w-auto bg-light-border text-light-text-main dark:bg-dark-border dark:text-dark-text-main font-semibold py-2 px-4 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm text-center block"
            >
              Registrieren
            </Link>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary transition-colors ml-0 sm:ml-2 mt-2 sm:mt-0"
              title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-light-card-bg/80 dark:bg-dark-card-bg/50 py-20 px-6 text-center border-b border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h1 className="text-5xl font-extrabold text-light-text-main dark:text-dark-text-main mb-4">
            Dein smarter{" "}
            <span className="text-light-accent-green dark:text-dark-accent-green">
              Umzugsplaner
            </span>{" "}
            &amp; Home Organizer
          </h1>
          <p className="text-xl text-light-text-secondary dark:text-dark-text-secondary mb-8 max-w-2xl mx-auto">
            Plane deinen Umzug stressfrei – und behalte danach deinen Haushalt
            im Griff. Alles an einem Ort.
          </p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            Jetzt loslegen
          </button>
        </div>
      </header>

      {/* Zwei-Modus-Banner */}
      <section className="py-12 px-6">
        <div className="container mx-auto">
          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-xl border border-light-border dark:border-dark-border p-6 flex items-start gap-4 shadow-lg">
              <div className="w-14 h-14 rounded-xl bg-light-accent-green dark:bg-dark-accent-green flex items-center justify-center flex-shrink-0">
                <Truck size={28} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-light-text-main dark:text-dark-text-main mb-1">
                  Umzugsplaner
                </h3>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Packlisten, Aufgaben, Budget und Zeitplan – alles was du für
                  einen stressfreien Umzug brauchst.
                </p>
              </div>
            </div>
            <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-xl border border-light-border dark:border-dark-border p-6 flex items-start gap-4 shadow-lg">
              <div className="w-14 h-14 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
                <Home size={28} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-light-text-main dark:text-dark-text-main mb-1">
                  Home Organizer
                </h3>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Inventar, Finanzen, Einkauf und Haushaltsmitglieder – für
                  einen organisierten Alltag nach dem Umzug.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features: Umzugsplaner */}
      <section className="py-12 px-6 bg-light-card-bg/40 dark:bg-dark-card-bg/30 border-y border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-light-text-main dark:text-dark-text-main mb-3">
            Alles was du für deinen{" "}
            <span className="text-light-accent-green dark:text-dark-accent-green">
              Umzug
            </span>{" "}
            brauchst
          </h2>
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary mb-10 max-w-xl mx-auto text-sm">
            Von der ersten Planung bis zum letzten Umzugskarton.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link to="/features/todo-listen" className="no-underline">
              <FeatureCard
                icon={<ListChecks size={24} />}
                title="Smarte To-Do Listen"
                description="Behalte den Überblick über alle Aufgaben. Automatische Kategorisierung und Priorisierung helfen dir dabei."
              />
            </Link>
            <Link to="/features/packliste" className="no-underline">
              <FeatureCard
                icon={<Package size={24} />}
                title="Intelligente Packlisten"
                description="Organisiere dein Hab und Gut. Mit QR-Codes, Fotos und KI-Unterstützung für schnelles Finden."
              />
            </Link>
            <Link to="/features/budget-tracker" className="no-underline">
              <FeatureCard
                icon={<DollarSign size={24} />}
                title="Budget Tracker"
                description="Verwalte deine Umzugskosten. Behalte Einnahmen und Ausgaben im Blick und vermeide böse Überraschungen."
              />
            </Link>
            <Link to="/features/transport-planer" className="no-underline">
              <FeatureCard
                icon={<Truck size={24} />}
                title="Transport & Volumen Planer"
                description="Berechne das benötigte Ladevolumen und die Transportkosten für deinen Umzug."
              />
            </Link>
            <Link to="/features/ki-assistenten" className="no-underline">
              <FeatureCard
                icon={<BrainCircuit size={24} />}
                title="KI-Assistenten"
                description="Lass dir von unseren intelligenten Assistenten beim Erstellen von Pack- und To-Do-Listen helfen."
              />
            </Link>
            <Link to="/features/qr-code-system" className="no-underline">
              <FeatureCard
                icon={<QrCode size={24} />}
                title="QR-Code System"
                description="Generiere und scanne QR-Codes für deine Kisten, um den Inhalt schnell zu identifizieren."
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Features: Home Organizer */}
      <section className="py-12 px-6">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-light-text-main dark:text-dark-text-main mb-3">
            Alles was du für deinen{" "}
            <span className="text-teal-500">Alltag</span> brauchst
          </h2>
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary mb-10 max-w-xl mx-auto text-sm">
            Der Home Organizer hilft dir, nach dem Umzug den Überblick zu
            behalten.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              accent="teal"
              icon={<Package size={24} />}
              title="Haushalts-Inventar"
              description="Verwalte Möbel, Geräte und Wertgegenstände mit Fotos, Räumen und Kategorien."
            />
            <FeatureCard
              accent="teal"
              icon={<DollarSign size={24} />}
              title="Finanzmanager"
              description="Einnahmen & Ausgaben, Kategorienlimits, Sparziele und Cashflow-Vorschau für die nächsten 30 Tage."
            />
            <FeatureCard
              accent="teal"
              icon={<Users size={24} />}
              title="Haushaltsmitglieder"
              description="Ordne Aufgaben, Ausgaben und Gegenstände einzelnen Personen im Haushalt zu."
            />
            <FeatureCard
              accent="teal"
              icon={<ClipboardList size={24} />}
              title="Aufgaben & Projekte"
              description="Plane Heimwerken, Renovierungen und Alltagsaufgaben strukturiert mit Prioritäten und Fälligkeiten."
            />
            <FeatureCard
              accent="teal"
              icon={<ShoppingCart size={24} />}
              title="Einkauf & Vorräte"
              description="Smarte Einkaufslisten und Vorratsverwaltung mit Mindestmengen – nie wieder etwas vergessen."
            />
            <FeatureCard
              accent="teal"
              icon={<BrainCircuit size={24} />}
              title="KI-Haushalt-Assistent"
              description="Intelligente Hilfe für Budget-Analyse, Inventar-Erfassung und smarte Haushaltsplanung."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-light-card-bg/80 dark:bg-dark-card-bg/50 py-16 px-6 text-center border-t border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-3">
            Bereit für einen smarten Alltag?
          </h2>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mb-8 max-w-md mx-auto">
            Starte mit dem Umzugsplaner oder direkt mit dem Home Organizer –
            kostenlos und ohne Kreditkarte.
          </p>
          <Link
            to="/register"
            className="bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg inline-block"
          >
            Kostenlos registrieren
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-light-bg dark:bg-dark-bg py-8 text-center text-light-text-secondary dark:text-dark-text-secondary text-sm border-t border-light-border dark:border-dark-border">
        <p>&copy; {new Date().getFullYear()} Umzugsplaner. Alle Rechte vorbehalten.</p>
        <p className="mt-1">Entwickelt mit ❤️ für einen einfacheren Umzug.</p>
      </footer>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4 pb-safe">
          <LoginForm
            setSession={setSession}
            onLoginSuccess={handleLoginSuccess}
            closeLoginModal={() => setShowLoginModal(false)}
          />
        </div>
      )}
    </div>
  );
};

export default HomePage;
