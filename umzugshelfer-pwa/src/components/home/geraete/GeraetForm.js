import React from "react";
import { useTranslation } from "react-i18next";

const KATEGORIEN = [
  "Haushaltsgeraete",
  "Elektronik",
  "Heizung & Klima",
  "Sanitaer",
  "Werkzeug",
  "Unterhaltung",
  "Kueche",
  "Sonstiges",
];

const CATEGORY_LABELS = {
  de: {
    Haushaltsgeraete: "Haushaltsgeraete",
    Elektronik: "Elektronik",
    "Heizung & Klima": "Heizung & Klima",
    Sanitaer: "Sanitaer",
    Werkzeug: "Werkzeug",
    Unterhaltung: "Unterhaltung",
    Kueche: "Kueche",
    Sonstiges: "Sonstiges",
  },
  "en-GB": {
    Haushaltsgeraete: "Household appliances",
    Elektronik: "Electronics",
    "Heizung & Klima": "Heating & climate",
    Sanitaer: "Sanitary",
    Werkzeug: "Tools",
    Unterhaltung: "Entertainment",
    Kueche: "Kitchen",
    Sonstiges: "Other",
  },
};

export const normalizeDeviceCategory = (value) => {
  const text = String(value || "");
  return text
    .replace("Haushaltsger?te", "Haushaltsgeraete")
    .replace("Haushaltsgeräte", "Haushaltsgeraete")
    .replace("Sanit?r", "Sanitaer")
    .replace("Sanitär", "Sanitaer")
    .replace("K?che", "Kueche")
    .replace("Küche", "Kueche");
};

const inputKlasse =
  "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

const labelKlasse =
  "block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1";

export function getDeviceCategoryLabel(value, locale = "de") {
  const normalized = normalizeDeviceCategory(value);
  if (!normalized) return "";
  const lang = locale === "en-GB" ? "en-GB" : "de";
  return CATEGORY_LABELS[lang][normalized] || value;
}

export default function GeraetForm({ value, onChange }) {
  const { t, i18n } = useTranslation(["home", "common"]);
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });

  return (
    <div className="space-y-3">
      <div>
        <label className={labelKlasse}>{t("home:devicesForm.name")}</label>
        <input
          value={value.name}
          onChange={set("name")}
          placeholder={t("home:devicesForm.namePlaceholder")}
          className={inputKlasse}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.manufacturer")}</label>
          <input
            value={value.hersteller}
            onChange={set("hersteller")}
            placeholder={t("home:devicesForm.manufacturerPlaceholder")}
            className={inputKlasse}
          />
        </div>
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.model")}</label>
          <input
            value={value.modell}
            onChange={set("modell")}
            placeholder={t("home:devicesForm.modelPlaceholder")}
            className={inputKlasse}
          />
        </div>
      </div>

      <div>
        <label className={labelKlasse}>{t("home:devicesForm.category")}</label>
        <select value={value.kategorie} onChange={set("kategorie")} className={inputKlasse}>
          <option value="">{t("home:devicesForm.noCategory")}</option>
          {KATEGORIEN.map((k) => (
            <option key={k} value={k}>{getDeviceCategoryLabel(k, i18n.language)}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.purchaseDate")}</label>
          <input type="date" value={value.kaufdatum} onChange={set("kaufdatum")} className={inputKlasse} />
        </div>
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.purchasePrice")}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.kaufpreis}
            onChange={set("kaufpreis")}
            placeholder={t("home:devicesForm.purchasePricePlaceholder")}
            className={inputKlasse}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.warrantyUntil")}</label>
          <input type="date" value={value.gewaehrleistung_bis} onChange={set("gewaehrleistung_bis")} className={inputKlasse} />
        </div>
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.manufacturerWarrantyUntil")}</label>
          <input type="date" value={value.garantie_bis} onChange={set("garantie_bis")} className={inputKlasse} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.nextMaintenance")}</label>
          <input type="date" value={value.naechste_wartung} onChange={set("naechste_wartung")} className={inputKlasse} />
        </div>
        <div>
          <label className={labelKlasse}>{t("home:devicesForm.intervalMonths")}</label>
          <input
            type="number"
            min="1"
            value={value.wartungsintervall_monate}
            onChange={set("wartungsintervall_monate")}
            placeholder={t("home:devicesForm.intervalPlaceholder")}
            className={inputKlasse}
          />
        </div>
      </div>

      <div>
        <label className={labelKlasse}>{t("home:devicesForm.serialNumber")}</label>
        <input
          value={value.seriennummer}
          onChange={set("seriennummer")}
          placeholder={t("home:devicesForm.optional")}
          className={inputKlasse}
        />
      </div>

      <div>
        <label className={labelKlasse}>{t("home:devicesForm.notes")}</label>
        <textarea
          value={value.notizen}
          onChange={set("notizen")}
          rows={2}
          className={`${inputKlasse} resize-none`}
        />
      </div>
    </div>
  );
}
