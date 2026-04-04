import React from "react";

const KATEGORIEN = [
  "Haushaltsgeräte",
  "Elektronik",
  "Heizung & Klima",
  "Sanitär",
  "Werkzeug",
  "Unterhaltung",
  "Küche",
  "Sonstiges",
];

const inputKlasse =
  "w-full px-3 py-2 text-sm rounded-card-sm border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 text-light-text-main dark:text-dark-text-main focus:outline-none focus:border-primary-500";

const labelKlasse =
  "block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1";

export default function GeraetForm({ value, onChange }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });

  return (
    <div className="space-y-3">
      {/* Name */}
      <div>
        <label className={labelKlasse}>Gerätebezeichnung *</label>
        <input
          value={value.name}
          onChange={set("name")}
          placeholder="z.B. Waschmaschine"
          className={inputKlasse}
        />
      </div>

      {/* Hersteller + Modell */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>Hersteller</label>
          <input
            value={value.hersteller}
            onChange={set("hersteller")}
            placeholder="z.B. Bosch"
            className={inputKlasse}
          />
        </div>
        <div>
          <label className={labelKlasse}>Modell</label>
          <input
            value={value.modell}
            onChange={set("modell")}
            placeholder="z.B. WAX32K42"
            className={inputKlasse}
          />
        </div>
      </div>

      {/* Kategorie */}
      <div>
        <label className={labelKlasse}>Kategorie</label>
        <select value={value.kategorie} onChange={set("kategorie")} className={inputKlasse}>
          <option value="">– Keine –</option>
          {KATEGORIEN.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {/* Kaufdatum + Kaufpreis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>Kaufdatum</label>
          <input
            type="date"
            value={value.kaufdatum}
            onChange={set("kaufdatum")}
            className={inputKlasse}
          />
        </div>
        <div>
          <label className={labelKlasse}>Kaufpreis (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.kaufpreis}
            onChange={set("kaufpreis")}
            placeholder="z.B. 499.00"
            className={inputKlasse}
          />
        </div>
      </div>

      {/* Gewährleistung + Garantie */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>Gewährleistung bis</label>
          <input
            type="date"
            value={value.gewaehrleistung_bis}
            onChange={set("gewaehrleistung_bis")}
            className={inputKlasse}
          />
        </div>
        <div>
          <label className={labelKlasse}>Herstellergarantie bis</label>
          <input
            type="date"
            value={value.garantie_bis}
            onChange={set("garantie_bis")}
            className={inputKlasse}
          />
        </div>
      </div>

      {/* Wartung */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelKlasse}>Nächste Wartung</label>
          <input
            type="date"
            value={value.naechste_wartung}
            onChange={set("naechste_wartung")}
            className={inputKlasse}
          />
        </div>
        <div>
          <label className={labelKlasse}>Intervall (Monate)</label>
          <input
            type="number"
            min="1"
            value={value.wartungsintervall_monate}
            onChange={set("wartungsintervall_monate")}
            placeholder="z.B. 12"
            className={inputKlasse}
          />
        </div>
      </div>

      {/* Seriennummer */}
      <div>
        <label className={labelKlasse}>Seriennummer</label>
        <input
          value={value.seriennummer}
          onChange={set("seriennummer")}
          placeholder="Optional"
          className={inputKlasse}
        />
      </div>

      {/* Notizen */}
      <div>
        <label className={labelKlasse}>Notizen</label>
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
