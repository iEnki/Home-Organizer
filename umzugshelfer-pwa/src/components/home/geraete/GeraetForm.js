import React from "react";
import { useTranslation } from "react-i18next";
import { getBewohnerDisplayName } from "../../../utils/budgetAccounts";

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

const sectionKlasse =
  "rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg/40 dark:bg-canvas-1/40 p-3 space-y-3";

const sectionTitelKlasse =
  "text-[11px] font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary";

const STATUS_LABEL = {
  in_verwendung: "In Verwendung",
  eingelagert: "Eingelagert",
  verliehen: "Verliehen",
  defekt: "Defekt",
  entsorgt: "Entsorgt",
};

const ZUGRIFF_LABEL = {
  taeglich: "Taeglich",
  woechentlich: "Woechentlich",
  monatlich: "Monatlich",
  selten: "Selten",
  nie: "Nie",
};

export function getDeviceCategoryLabel(value, locale = "de") {
  const normalized = normalizeDeviceCategory(value);
  if (!normalized) return "";
  const lang = locale === "en-GB" ? "en-GB" : "de";
  return CATEGORY_LABELS[lang][normalized] || value;
}

export default function GeraetForm({ value, onChange, orte = [], lagerorte = [], bewohner = [] }) {
  const { t, i18n } = useTranslation(["home", "common"]);
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const lagerorteFuerOrt = lagerorte.filter((lagerort) => !value.ort_id || lagerort.ort_id === value.ort_id);
  const setOrt = (e) => {
    const ortId = e.target.value;
    onChange({
      ...value,
      ort_id: ortId,
      lagerort_id: value.lagerort_id && lagerorte.some((lagerort) => lagerort.id === value.lagerort_id && lagerort.ort_id === ortId)
        ? value.lagerort_id
        : "",
    });
  };
  const setLagerort = (e) => {
    const lagerortId = e.target.value;
    const lagerort = lagerorte.find((entry) => entry.id === lagerortId);
    onChange({
      ...value,
      lagerort_id: lagerortId,
      ort_id: lagerort?.ort_id || value.ort_id || "",
    });
  };

  return (
    <div className="space-y-4">
      <section className={sectionKlasse}>
        <h4 className={sectionTitelKlasse}>Geraet</h4>
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

        {orte.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelKlasse}>{t("home:devicesForm.location", { defaultValue: "Standort" })}</label>
              <select value={value.ort_id || ""} onChange={setOrt} className={inputKlasse}>
                <option value="">{t("home:devicesForm.noLocation", { defaultValue: "-- Kein Standort --" })}</option>
                {orte.map((ort) => (
                  <option key={ort.id} value={ort.id}>{ort.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelKlasse}>{t("home:devicesForm.storageLocation", { defaultValue: "Lagerort" })}</label>
              <select value={value.lagerort_id || ""} onChange={setLagerort} className={inputKlasse} disabled={!value.ort_id && lagerorte.length === 0}>
                <option value="">{t("home:devicesForm.noStorageLocation", { defaultValue: "-- Kein Lagerort --" })}</option>
                {lagerorteFuerOrt.map((lagerort) => (
                  <option key={lagerort.id} value={lagerort.id}>{lagerort.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      <section className={sectionKlasse}>
        <h4 className={sectionTitelKlasse}>Inventar</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelKlasse}>Status</label>
            <select value={value.status || "in_verwendung"} onChange={set("status")} className={inputKlasse}>
              {Object.entries(STATUS_LABEL).map(([status, label]) => (
                <option key={status} value={status}>{t(`home:inventoryForm.status.${status}`, { defaultValue: label })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelKlasse}>Menge</label>
            <input
              type="number"
              min="1"
              value={value.menge ?? 1}
              onChange={set("menge")}
              className={inputKlasse}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelKlasse}>Zugriffshaeufigkeit</label>
            <select value={value.zugriffshaeufigkeit || "selten"} onChange={set("zugriffshaeufigkeit")} className={inputKlasse}>
              {Object.entries(ZUGRIFF_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          {bewohner.length > 0 && (
            <div>
              <label className={labelKlasse}>Gehoert wem?</label>
              <select value={value.bewohner_id || ""} onChange={set("bewohner_id")} className={inputKlasse}>
                <option value="">-- Niemanden zuordnen --</option>
                {bewohner.map((b) => (
                  <option key={b.id} value={b.id}>{b.emoji} {getBewohnerDisplayName(b)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className={labelKlasse}>Tags (kommagetrennt)</label>
          <input
            value={value.tags || ""}
            onChange={set("tags")}
            placeholder="Technik, VR, Gaming"
            className={inputKlasse}
          />
        </div>
      </section>

      <section className={sectionKlasse}>
        <h4 className={sectionTitelKlasse}>Kauf, Garantie & Wartung</h4>
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
      </section>

      <section className={sectionKlasse}>
        <h4 className={sectionTitelKlasse}>Details</h4>
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
      </section>
    </div>
  );
}
