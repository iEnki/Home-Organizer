import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import LoginForm from "./LoginForm";
import { useTheme } from "../contexts/ThemeContext";
import { useLocale } from "../contexts/LocaleContext";
import {
  BrainCircuit,
  ChefHat,
  ClipboardList,
  DollarSign,
  Home,
  Languages,
  ListChecks,
  Moon,
  Package,
  QrCode,
  ShoppingCart,
  Sun,
  Truck,
  Users,
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

const LocaleToggle = () => {
  const { t } = useTranslation(["common"]);
  const { locale, setLocale } = useLocale();
  const isEnglish = locale === "en-GB";
  const nextLocale = isEnglish ? "de" : "en-GB";

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale)}
      className="inline-flex items-center gap-2 rounded-md border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg px-3 py-2 text-sm font-semibold text-light-text-main dark:text-dark-text-main hover:bg-light-border dark:hover:bg-dark-border transition-colors"
      title={t("locale.title")}
      aria-label={t("locale.title")}
    >
      <Languages size={16} />
      {isEnglish ? "DE" : "EN"}
    </button>
  );
};

const HomePage = ({ setSession }) => {
  const { t } = useTranslation(["auth", "common"]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const movingFeatures = [
    { to: "/features/todo-listen", icon: <ListChecks size={24} />, key: "todoLists" },
    { to: "/features/packliste", icon: <Package size={24} />, key: "packingLists" },
    { to: "/features/budget-tracker", icon: <DollarSign size={24} />, key: "budgetTracker" },
    { to: "/features/transport-planer", icon: <Truck size={24} />, key: "transport" },
    { to: "/features/ki-assistenten", icon: <BrainCircuit size={24} />, key: "aiAssistants" },
    { to: "/features/qr-code-system", icon: <QrCode size={24} />, key: "qrSystem" },
  ];

  const homeFeatures = [
    { icon: <Package size={24} />, key: "inventory" },
    { icon: <DollarSign size={24} />, key: "finance" },
    { icon: <Users size={24} />, key: "householdMembers" },
    { icon: <ClipboardList size={24} />, key: "tasksProjects" },
    { icon: <ShoppingCart size={24} />, key: "shoppingStock" },
    { icon: <ChefHat size={24} />, key: "cookbook" },
    { icon: <BrainCircuit size={24} />, key: "homeAi" },
  ];

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
  };

  return (
    <div className="text-light-text-main dark:text-dark-text-main min-h-screen">
      <nav className="bg-light-bg dark:bg-dark-bg shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center gap-4">
          <Link
            to="/"
            className="text-2xl font-bold text-light-accent-green dark:text-dark-accent-green hover:opacity-80"
          >
            {t("landing.brand")}
          </Link>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 items-center">
            <LocaleToggle />
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full sm:w-auto bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-semibold py-2 px-4 rounded-md hover:opacity-90 transition-colors text-sm"
            >
              {t("login.submit")}
            </button>
            <Link
              to="/register"
              className="w-full sm:w-auto bg-light-border text-light-text-main dark:bg-dark-border dark:text-dark-text-main font-semibold py-2 px-4 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm text-center block"
            >
              {t("register.title")}
            </Link>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary transition-colors ml-0 sm:ml-2 mt-2 sm:mt-0"
              title={theme === "dark" ? t("common:theme.light") : t("common:theme.dark")}
              aria-label={theme === "dark" ? t("common:theme.light") : t("common:theme.dark")}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </nav>

      <header className="bg-light-card-bg/80 dark:bg-dark-card-bg/50 py-20 px-6 text-center border-b border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h1 className="text-5xl font-extrabold text-light-text-main dark:text-dark-text-main mb-4">
            {t("landing.heroTitle")}
          </h1>
          <p className="text-xl text-light-text-secondary dark:text-dark-text-secondary mb-8 max-w-2xl mx-auto">
            {t("landing.heroSubtitle")}
          </p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg"
          >
            {t("landing.getStarted")}
          </button>
        </div>
      </header>

      <section className="py-12 px-6">
        <div className="container mx-auto">
          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-xl border border-light-border dark:border-dark-border p-6 flex items-start gap-4 shadow-lg">
              <div className="w-14 h-14 rounded-xl bg-light-accent-green dark:bg-dark-accent-green flex items-center justify-center flex-shrink-0">
                <Truck size={28} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-light-text-main dark:text-dark-text-main mb-1">
                  {t("landing.modes.move.title")}
                </h3>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  {t("landing.modes.move.description")}
                </p>
              </div>
            </div>
            <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-xl border border-light-border dark:border-dark-border p-6 flex items-start gap-4 shadow-lg">
              <div className="w-14 h-14 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
                <Home size={28} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-light-text-main dark:text-dark-text-main mb-1">
                  {t("landing.modes.home.title")}
                </h3>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  {t("landing.modes.home.description")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 px-6 bg-light-card-bg/40 dark:bg-dark-card-bg/30 border-y border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-light-text-main dark:text-dark-text-main mb-3">
            {t("landing.moveSection.title")}
          </h2>
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary mb-10 max-w-xl mx-auto text-sm">
            {t("landing.moveSection.subtitle")}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {movingFeatures.map((feature) => (
              <Link key={feature.key} to={feature.to} className="no-underline">
                <FeatureCard
                  icon={feature.icon}
                  title={t(`landing.moveFeatures.${feature.key}.title`)}
                  description={t(`landing.moveFeatures.${feature.key}.description`)}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-6">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-light-text-main dark:text-dark-text-main mb-3">
            {t("landing.homeSection.title")}
          </h2>
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary mb-10 max-w-xl mx-auto text-sm">
            {t("landing.homeSection.subtitle")}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homeFeatures.map((feature) => (
              <FeatureCard
                key={feature.key}
                accent="teal"
                icon={feature.icon}
                title={t(`landing.homeFeatures.${feature.key}.title`)}
                description={t(`landing.homeFeatures.${feature.key}.description`)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-light-card-bg/80 dark:bg-dark-card-bg/50 py-16 px-6 text-center border-t border-light-border dark:border-dark-border">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-3">
            {t("landing.ctaTitle")}
          </h2>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mb-8 max-w-md mx-auto">
            {t("landing.ctaSubtitle")}
          </p>
          <Link
            to="/register"
            className="bg-light-accent-green text-white dark:bg-dark-accent-green dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg inline-block"
          >
            {t("landing.registerFree")}
          </Link>
        </div>
      </section>

      <footer className="bg-light-bg dark:bg-dark-bg py-8 text-center text-light-text-secondary dark:text-dark-text-secondary text-sm border-t border-light-border dark:border-dark-border">
        <p>&copy; {new Date().getFullYear()} {t("landing.brand")}. {t("landing.footer.rights")}</p>
        <p className="mt-1">{t("landing.footer.madeFor")}</p>
      </footer>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
