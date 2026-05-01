import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarPlus,
  Camera,
  CheckSquare,
  ClipboardList,
  DollarSign,
  Filter,
  Hammer,
  ListChecks,
  ListPlus,
  MapPin,
  Package,
  PackageSearch,
  Paintbrush,
  Phone,
  PieChart,
  QrCode,
  Ruler,
  Search,
  Smartphone,
  Timer,
  Truck,
  Users,
  Zap,
} from "lucide-react";

const ICONS = {
  brain: BrainCircuit,
  budget: DollarSign,
  calendar: CalendarPlus,
  camera: Camera,
  check: CheckSquare,
  checklist: ClipboardList,
  contacts: Users,
  filter: Filter,
  hammer: Hammer,
  list: ListChecks,
  listPlus: ListPlus,
  map: MapPin,
  package: Package,
  packageSearch: PackageSearch,
  phone: Phone,
  pie: PieChart,
  qr: QrCode,
  ruler: Ruler,
  search: Search,
  smartphone: Smartphone,
  timer: Timer,
  truck: Truck,
  zap: Zap,
  paint: Paintbrush,
};

export default function FeaturePageTemplate({ page, accent = "green" }) {
  const { t } = useTranslation(["featurePages"]);
  const sections = t(`${page}.sections`, { returnObjects: true });
  const ctas = t(`${page}.ctas`, { returnObjects: true });
  const pageIconName = t(`${page}.icon`);
  const PageIcon = ICONS[pageIconName] || Package;
  const accentClass =
    accent === "purple"
      ? "text-light-accent-purple dark:text-dark-accent-purple"
      : "text-light-accent-green dark:text-dark-accent-green";
  const accentBg =
    accent === "purple"
      ? "bg-light-accent-purple dark:bg-dark-accent-purple"
      : "bg-light-accent-green dark:bg-dark-accent-green";
  const softBg =
    accent === "purple"
      ? "bg-light-accent-purple/20 dark:bg-dark-accent-purple/20"
      : "bg-light-accent-green/20 dark:bg-dark-accent-green/20";

  return (
    <div className="min-h-screen text-light-text-main dark:text-dark-text-main p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className={`inline-flex items-center ${accentClass} hover:opacity-80 mb-6 group`}>
          <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" />
          {t("common.backHome")}
        </Link>

        <header className="mb-12 text-center">
          <PageIcon className={`mx-auto h-16 w-16 ${accentClass} mb-4`} />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-light-text-main dark:text-dark-text-main">
            {t(`${page}.title`)}
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-light-text-secondary dark:text-dark-text-secondary max-w-2xl mx-auto">
            {t(`${page}.subtitle`)}
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main mb-6 text-center sm:text-left">
            {t("common.details")}
          </h2>
          <div className="space-y-8">
            {Array.isArray(sections) && sections.map((section, index) => {
              const Icon = ICONS[section.icon] || PageIcon;
              return (
                <div key={index} className="bg-light-card-bg dark:bg-dark-card-bg p-6 rounded-lg shadow-lg border border-light-border dark:border-dark-border">
                  <div className="flex items-start space-x-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full ${softBg} ${accentClass} flex items-center justify-center`}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main mb-1">
                        {section.title}
                      </h3>
                      <p className="text-light-text-secondary dark:text-dark-text-secondary mb-3">
                        {section.body}
                      </p>
                      <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md p-4">
                        <p className="text-light-text-secondary dark:text-dark-text-secondary">
                          {section.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {Array.isArray(ctas) && ctas.length > 0 && (
          <section className="text-center py-10">
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              {ctas.map((cta) => (
                <Link
                  key={cta.to}
                  to={cta.to}
                  className={`${accentBg} text-white dark:text-dark-bg font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-transform transform hover:scale-105 shadow-lg`}
                >
                  {cta.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
