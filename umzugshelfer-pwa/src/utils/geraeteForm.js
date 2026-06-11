import { normalizeDeviceCategory } from "../components/home/geraete/GeraetForm";

export const DEFAULT_GERAET_FORM = {
  name: "",
  hersteller: "",
  modell: "",
  seriennummer: "",
  status: "in_verwendung",
  tags: "",
  bewohner_id: "",
  zugriffshaeufigkeit: "selten",
  menge: 1,
  kaufdatum: "",
  kaufpreis: "",
  gewaehrleistung_bis: "",
  garantie_bis: "",
  naechste_wartung: "",
  wartungsintervall_monate: "",
  notizen: "",
  kategorie: "",
  ort_id: "",
  lagerort_id: "",
};

export const mapGeraetToForm = (g = {}) => ({
  id:                       g.id,
  name:                     g.name || "",
  hersteller:               g.hersteller || "",
  modell:                   g.modell || "",
  seriennummer:             g.seriennummer || "",
  status:                   g.status || "in_verwendung",
  tags:                     Array.isArray(g.tags) ? g.tags.join(", ") : g.tags || "",
  bewohner_id:              g.bewohner_id || "",
  zugriffshaeufigkeit:      g.zugriffshaeufigkeit || "selten",
  menge:                    g.menge ?? 1,
  kaufdatum:                g.kaufdatum || "",
  kaufpreis:                g.kaufpreis ?? "",
  gewaehrleistung_bis:      g.gewaehrleistung_bis || "",
  garantie_bis:             g.garantie_bis || "",
  naechste_wartung:         g.naechste_wartung || "",
  wartungsintervall_monate: g.wartungsintervall_monate ?? "",
  notizen:                  g.notizen || "",
  kategorie:                normalizeDeviceCategory(g.kategorie || ""),
  ort_id:                   g.ort_id || "",
  lagerort_id:              g.lagerort_id || "",
});

const str2null = (v) => (v === "" || v == null ? null : v);
const parseTags = (value) => {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

export const buildGeraetPayload = (daten = {}) => ({
  name:                     str2null(daten.name),
  hersteller:               str2null(daten.hersteller),
  modell:                   str2null(daten.modell),
  seriennummer:             str2null(daten.seriennummer),
  status:                   daten.status || "in_verwendung",
  tags:                     parseTags(daten.tags),
  bewohner_id:              str2null(daten.bewohner_id),
  zugriffshaeufigkeit:      daten.zugriffshaeufigkeit || "selten",
  menge:                    Math.max(parseInt(daten.menge, 10) || 1, 1),
  kaufdatum:                str2null(daten.kaufdatum),
  gewaehrleistung_bis:      str2null(daten.gewaehrleistung_bis),
  garantie_bis:             str2null(daten.garantie_bis),
  naechste_wartung:         str2null(daten.naechste_wartung),
  notizen:                  str2null(daten.notizen),
  kategorie:                str2null(normalizeDeviceCategory(daten.kategorie)),
  ort_id:                   str2null(daten.ort_id),
  lagerort_id:              str2null(daten.lagerort_id),
  kaufpreis:                daten.kaufpreis === "" ? null : parseFloat(daten.kaufpreis) || null,
  wartungsintervall_monate: daten.wartungsintervall_monate === "" ? null : parseInt(daten.wartungsintervall_monate, 10) || null,
});
