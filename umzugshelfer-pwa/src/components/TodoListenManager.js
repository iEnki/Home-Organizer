import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  PlusCircle,
  Edit3,
  Trash2,
  XCircle,
  CheckCircle,
  Circle,
  CalendarDays,
  Paperclip,
  DollarSign,
  CalendarPlus,
  BrainCircuit,
  LayoutGrid,
  List,
  FilePlus,
  FileText,
  BookMarked,
} from "lucide-react";
// import { Link } from "react-router-dom";
import { generateIcsData, downloadIcsFile } from "../utils/calendarUtils";
import KiHomeAssistent from "./home/KiHomeAssistent";
import { useTheme } from "../contexts/ThemeContext";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import DokumentenZuordnungModal from "./DokumentenZuordnungModal";
import BildVorschau from "./BildVorschau";
import useViewport from "../hooks/useViewport";

const prioWerte = { Hoch: 3, Mittel: 2, Niedrig: 1 };
const kategorieKeywords = {
  Versorger: [
    "strom",
    "gas",
    "wasser",
    "internet",
    "telefon",
    "mobilfunk",
    "energieversorger",
    "heizung",
    "fernwärme",
    "rundfunkbeitrag",
    "gis",
    "stromanbieter wechseln",
    "abschlagszahlung",
    "abschalten",
  ],
  Behörde: [
    "ummelden",
    "anmelden",
    "abmelden",
    "ausweis",
    "personalausweis",
    "reisepass",
    "pass",
    "amt",
    "kfz",
    "führerschein",
    "meldebestätigung",
    "wahlbenachrichtigung",
    "finanzamt",
    "krankenkasse",
    "gesundheitskasse",
    "ams",
    "zulassungsstelle",
    "e-card",
    "digitales amt",
    "wohnsitz ändern",
  ],
  Verträge: [
    "kündigen",
    "vertrag",
    "versicherungsvertrag",
    "versicherung",
    "abo",
    "mitgliedschaft",
    "bank",
    "konto",
    "kredit",
    "fitnessstudio",
    "zeitung",
    "mobilfunkvertrag",
    "internetvertrag",
    "stromvertrag",
    "haushaltsversicherung",
    "rechtsschutzversicherung",
  ],
  Umzugstag: [
    "transporter",
    "umzugswagen",
    "helfer",
    "kartons",
    "packen",
    "umzugsfirma",
    "umzugsunternehmen",
    "parkplatz",
    "halteverbot",
    "verpflegung helfer",
    "werkzeugkiste",
    "erste-hilfe-set",
    "wichtige dokumente griffbereit",
    "wertsachen",
    "technik sichern",
    "schutzdecken",
    "tragegurte",
    "handschuhe",
  ],
  Wohnung: [
    "schlüsselübergabe",
    "wohnungsübergabe",
    "protokoll",
    "renovieren",
    "reparaturen",
    "putzen",
    "kaution",
    "nachmieter",
    "mängelliste",
    "zählerstände",
    "besenrein",
    "grundreinigung",
    "rauchmelder",
    "namensschild",
    "wohnungsplan",
    "wohnungsaufteilung",
    "zwischenmiete",
  ],
  Finanzen: [
    "bank",
    "konto",
    "dauerauftrag",
    "budget",
    "rechnungen",
    "kaution überweisen",
    "umzugskosten abrechnen",
    "neue kontoverbindung mitteilen",
    "miet-endabrechnung",
    "zahlungserinnerung",
    "offene beträge",
    "überweisung",
    "nebenkosten",
  ],
  Organisation: [
    "adressänderung mitteilen",
    "urlaub beantragen",
    "kindergartenplatz",
    "schulplatz",
    "nachsendeantrag post",
    "terminplanung",
    "terminübersicht",
    "babysitter",
    "haustierbetreuung organisieren",
    "arbeitgeber",
    "vereine",
    "clubs",
    "abo-dienste",
    "kundenkarten",
    "checklisten",
    "fristen",
    "umzugsplan",
  ],
  Ausmisten: [
    "entrümpeln",
    "sperrmüll",
    "verkaufen",
    "verschenken",
    "spenden",
    "keller aufräumen",
    "dachboden aufräumen",
    "flohmärkte",
    "altkleider",
    "elektroschrott",
    "entsorgung",
  ],
  Einrichten: [
    "möbel abmessen",
    "stellplan",
    "möbel aufbauen",
    "lampen anbringen",
    "gardinen",
    "dekorieren",
    "bilder aufhängen",
    "regale montieren",
    "neue möbel kaufen",
    "lieferung koordinieren",
    "wohnstil",
  ],
  Technik: [
    "wlan",
    "router",
    "netzwerk",
    "elektronik",
    "fernseher",
    "pc",
    "monitor",
    "drucker",
    "smart home",
    "verkabelung",
    "internetzugang",
    "steckdosen",
    "stromleisten",
  ],
  Küche: [
    "geschirr",
    "besteck",
    "töpfe",
    "pfannen",
    "lebensmittel",
    "vorräte",
    "gewürze",
    "kaffeemaschine",
    "kühlschrank",
    "herd",
    "mikrowelle",
    "müllbeutel",
  ],
  Bad: [
    "handtücher",
    "toilettenpapier",
    "duschgel",
    "zahnbürste",
    "putzmittel",
    "badezimmer",
    "waschmaschine",
    "waschmittel",
    "seife",
    "klobürste",
    "medikamente",
  ],
  Kinderzimmer: [
    "spielzeug",
    "bett",
    "wickeltisch",
    "kinderzimmer",
    "sicherungen",
    "steckdosenschutz",
    "babyphone",
    "kinderwagen",
    "kuscheltiere",
    "windeln",
  ],
  Fahrzeuge: [
    "auto",
    "kennzeichen",
    "vignette",
    "garage",
    "stellplatz",
    "umparken",
    "fahrzeugschein",
    "typenschein",
    "zulassung",
    "autoversicherung",
    "fahrzeug ummelden",
  ],
  Dokumente: [
    "dokumente sammeln",
    "verträge",
    "unterlagen",
    "versicherungsschein",
    "wohnungsübergabeprotokoll",
    "mietvertrag",
    "arbeitsvertrag",
    "abrechnung",
    "kontoauszug",
    "stammdaten",
  ],
  Gesundheit: [
    "apotheke",
    "medikamente",
    "erste hilfe",
    "krankenversicherung",
    "arzt",
    "hausarzt wechseln",
    "gesundheitskasse",
    "impfpass",
    "krankmeldung",
    "rezept",
  ],
  Sonstiges: [
    "post",
    "zeitung",
    "freunde informieren",
    "haustiere",
    "pflanzen",
    "willkommenspaket neue nachbarn",
    "erste einkäufe neue wohnung",
    "kleider",
    "rucksack",
    "taschen",
    "koffer",
  ],
};
const standardKategorien = Object.keys(kategorieKeywords);

const prioritaetKeywordsHoch = [
  "kündigen",
  "frist",
  "letzter tag",
  "dringend",
  "wichtig",
  "sofort",
  "unbedingt",
  "anmelden",
  "ummelden",
  "kaution",
  "zählerstände",
  "schlüsselübergabe",
  "nachsendeantrag",
  "wohnsitz ändern",
  "mietvertrag",
  "wohnungsübergabe",
  "stromanbieter wechseln",
  "versicherungen melden",
  "kfz ummelden",
  "finanzamt",
  "ams",
  "krankenversicherung",
  "internetvertrag kündigen",
  "bankverbindung ändern",
  "e-card",
  "arztwechsel",
  "kinderbetreuung organisieren",
  "schulplatz sichern",
  "garage übernehmen",
  "rückzahlung kaution",
  "umschreibung vignetten",
  "wohnungsprotokoll",
];

// Die hartcodierte 'aufgabenVorlagen' Konstante wurde entfernt, da Vorlagen nun aus der DB geladen werden.
// const aufgabenVorlagen = [
//   { beschreibung: "", kategorie: "", prioritaet: "Mittel" },
//   {
//     beschreibung: "Mietvertrag rechtzeitig kündigen",
//     kategorie: "Verträge",
//     prioritaet: "Hoch",
//   },
// ];

const wiederholungOptionen = [
  "Keine",
  "Täglich",
  "Wöchentlich",
  "Monatlich",
  "Jährlich",
];

const formatDateTimeLocalValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseDateTimeLocalToIso = (value) => {
  if (!value) return null;

  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  if ([year, month, day, hours, minutes].some((part) => Number.isNaN(part))) {
    return null;
  }

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(localDate.getTime())) return null;

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hours ||
    localDate.getMinutes() !== minutes
  ) {
    return null;
  }

  return localDate.toISOString();
};

const TodoListenManager = ({ session }) => {
  const { isMobile, mobileBottomOffsetPx } = useViewport();
  const [userId, setUserId] = useState(null);
  const [aufgaben, setAufgaben] = useState([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [prioritaet, setPrioritaet] = useState("Mittel");
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState("");
  const [selectedVorlage, setSelectedVorlage] = useState("");
  const [aufgabenVorlagenDB, setAufgabenVorlagenDB] = useState([]); // State für DB-Vorlagen
  const [gruppierteVorlagen, setGruppierteVorlagen] = useState({}); // Neuer State für gruppierte Vorlagen
  const [erinnerungsDatum, setErinnerungsDatum] = useState("");
  const [anhaengeText, setAnhaengeText] = useState("");
  const [wiederholungTyp, setWiederholungTyp] = useState("Keine");
  const [wiederholungIntervall, setWiederholungIntervall] = useState(1);
  const [budgetVerknuepfung, setBudgetVerknuepfung] = useState("");
  const [budgetPostenListe, setBudgetPostenListe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingAufgabeId, setEditingAufgabeId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [justAddedTaskId, setJustAddedTaskId] = useState(null);
  const [showKiTodoAssistent, setShowKiTodoAssistent] = useState(false);
  const [viewMode, setViewMode] = useState("kacheln");
  const { theme } = useTheme();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSlides, setLightboxSlides] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showDokumentenModal, setShowDokumentenModal] = useState(false);
  const [aktuelleAufgabeFuerDokumente, setAktuelleAufgabeFuerDokumente] =
    useState(null);
  const [showVorlagenModal, setShowVorlagenModal] = useState(false);
  const [meineVorlagen, setMeineVorlagen] = useState([]);
  const [neueVorlageBeschreibung, setNeueVorlageBeschreibung] = useState("");
  const [neueVorlageKategorie, setNeueVorlageKategorie] = useState("");
  const [neueVorlagePrioritaet, setNeueVorlagePrioritaet] = useState("Mittel");

  useEffect(() => {
    setUserId(session?.user?.id || null);
  }, [session]);

  useEffect(() => {
    if (isMobile && viewMode !== "kacheln") {
      setViewMode("kacheln");
    }
  }, [isMobile, viewMode]);

  const fetchVorlagen = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("todo_vorlagen")
        .select("*")
        .order("kategorie", { ascending: true }) // Zuerst nach Kategorie sortieren für konsistente Gruppen
        .order("sortier_reihenfolge", { ascending: true });
      if (fetchError) throw fetchError;

      const vorlagenArray = data || [];
      setAufgabenVorlagenDB(vorlagenArray); // Flache Liste weiterhin speichern

      const gruppiert = vorlagenArray.reduce((acc, vorlage) => {
        const kategorieKey = vorlage.kategorie || "Sonstige";
        if (!acc[kategorieKey]) {
          acc[kategorieKey] = [];
        }
        acc[kategorieKey].push(vorlage);
        return acc;
      }, {});
      setGruppierteVorlagen(gruppiert);
    } catch (err) {
      console.error("Fehler beim Laden der To-Do-Vorlagen:", err);
      // Optional: setError state für Vorlagen-Ladefehler setzen
    }
  }, []);

  const fetchMeineVorlagen = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error: fetchError } = await supabase
        .from("todo_vorlagen")
        .select("*")
        .eq("user_id", userId)
        .order("beschreibung", { ascending: true });
      if (fetchError) throw fetchError;
      setMeineVorlagen(data || []);
    } catch (err) {
      console.error("Fehler beim Laden eigener Vorlagen:", err);
    }
  }, [userId]);

  const handleVorlageErstellen = async (e) => {
    e.preventDefault();
    if (!userId || !neueVorlageBeschreibung || !neueVorlageKategorie) return;
    try {
      const { error: insertError } = await supabase
        .from("todo_vorlagen")
        .insert([{
          user_id: userId,
          beschreibung: neueVorlageBeschreibung,
          kategorie: neueVorlageKategorie,
          prioritaet: neueVorlagePrioritaet,
          sortier_reihenfolge: 999,
        }]);
      if (insertError) throw insertError;
      setNeueVorlageBeschreibung("");
      setNeueVorlageKategorie("");
      setNeueVorlagePrioritaet("Mittel");
      await fetchMeineVorlagen();
      await fetchVorlagen();
    } catch (err) {
      alert(`Fehler beim Erstellen der Vorlage: ${err.message}`);
    }
  };

  const handleVorlageLoeschen = async (vorlageId) => {
    if (!userId || !window.confirm("Vorlage löschen?")) return;
    try {
      const { error: deleteError } = await supabase
        .from("todo_vorlagen")
        .delete()
        .match({ id: vorlageId, user_id: userId });
      if (deleteError) throw deleteError;
      await fetchMeineVorlagen();
      await fetchVorlagen();
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  const fetchBudgetPosten = useCallback(async () => {
    if (!userId) {
      setBudgetPostenListe([]);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from("budget_posten")
        .select("id, beschreibung, betrag")
        .eq("user_id", userId)
        .order("beschreibung", { ascending: true });
      if (fetchError) throw fetchError;
      setBudgetPostenListe(data || []);
    } catch (err) {
      console.error("Fehler Laden Budgetposten:", err);
    }
  }, [userId]);

  const fetchAufgaben = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!userId) {
      setAufgaben([]);
      setLoading(false);
      return;
    }
    try {
      let { data: aufgabenData, error: dbError } = await supabase
        .from("todo_aufgaben")
        .select(
          "*, budget_posten_id (id, beschreibung), angehaengte_dokument_ids"
        )
        .eq("user_id", userId)
        .order("erledigt", { ascending: true })
        .order("faelligkeitsdatum", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (dbError) throw dbError;
      if (aufgabenData && aufgabenData.length > 0) {
        const alleDokumentenIds = aufgabenData.reduce((acc, aufg) => {
          if (aufg.angehaengte_dokument_ids) {
            acc.push(...aufg.angehaengte_dokument_ids);
          }
          return acc;
        }, []);
        const eindeutigeDokumentenIds = [...new Set(alleDokumentenIds)];
        let dokumenteDetailsMap = {};
        if (eindeutigeDokumentenIds.length > 0) {
          const { data: dokumenteData, error: docError } = await supabase
            .from("dokumente")
            .select("id, dateiname, datei_typ, storage_pfad, todo_aufgabe_id")
            .in("id", eindeutigeDokumentenIds);
          if (docError) throw docError;
          dokumenteData.forEach((doc) => (dokumenteDetailsMap[doc.id] = doc));
        }
        aufgabenData = aufgabenData.map((aufg) => ({
          ...aufg,
          angehaengteDokumenteDetails:
            aufg.angehaengte_dokument_ids
              ?.map((id) => dokumenteDetailsMap[id])
              .filter(Boolean) || [],
        }));
        aufgabenData.sort((a, b) => {
          if (a.erledigt && !b.erledigt) return 1;
          if (!a.erledigt && b.erledigt) return -1;
          const dateA = a.faelligkeitsdatum
            ? new Date(a.faelligkeitsdatum)
            : null;
          const dateB = b.faelligkeitsdatum
            ? new Date(b.faelligkeitsdatum)
            : null;
          if (dateA && dateB) {
            if (dateA < dateB) return -1;
            if (dateA > dateB) return 1;
          } else if (dateA) return -1;
          else if (dateB) return 1;
          const prioAWert = prioWerte[a.prioritaet] || 0;
          const prioBWert = prioWerte[b.prioritaet] || 0;
          return prioBWert - prioAWert;
        });
      }
      setAufgaben(aufgabenData || []);
    } catch (err) {
      console.error("Fehler Laden To-Do:", err);
      setError("To-Do Aufgaben nicht geladen.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchAufgaben();
      fetchBudgetPosten();
      fetchVorlagen();
      fetchMeineVorlagen();
    } else {
      setAufgaben([]);
      setBudgetPostenListe([]);
      setAufgabenVorlagenDB([]);
      setMeineVorlagen([]);
      setLoading(false);
    }
  }, [userId, fetchAufgaben, fetchBudgetPosten, fetchVorlagen, fetchMeineVorlagen]);

  const handleBeschreibungChange = (e) => {
    const neueBeschreibung = e.target.value;
    setBeschreibung(neueBeschreibung);
    setSelectedVorlage("");
    if (!kategorie || (neueBeschreibung.length > 3 && !editingAufgabeId)) {
      const lowerBeschreibung = neueBeschreibung.toLowerCase();
      let vorgeschlageneKategorie = "";
      for (const kat in kategorieKeywords) {
        if (
          kategorieKeywords[kat].some((keyword) =>
            lowerBeschreibung.includes(keyword)
          )
        ) {
          vorgeschlageneKategorie = kat;
          break;
        }
      }
      if (vorgeschlageneKategorie && !editingAufgabeId)
        setKategorie(vorgeschlageneKategorie);
    }
    if (!editingAufgabeId && prioritaet === "Mittel") {
      const lowerBeschreibung = neueBeschreibung.toLowerCase();
      if (
        prioritaetKeywordsHoch.some((keyword) =>
          lowerBeschreibung.includes(keyword)
        )
      ) {
        setPrioritaet("Hoch");
      }
    }
  };

  const handleVorlageChange = (e) => {
    const vorlageId = e.target.value;
    setSelectedVorlage(vorlageId);

    if (vorlageId === "") {
      // "-- Bitte Vorlage wählen --" ausgewählt
      setBeschreibung("");
      setKategorie("");
      setPrioritaet("Mittel");
      setFaelligkeitsdatum("");
      setErinnerungsDatum("");
      setAnhaengeText("");
      setWiederholungTyp("Keine");
      setWiederholungIntervall(1);
      setBudgetVerknuepfung("");
    } else {
      const vorlage = aufgabenVorlagenDB.find((v) => v.id === vorlageId);
      if (vorlage) {
        setBeschreibung(vorlage.beschreibung || "");
        setKategorie(vorlage.kategorie || "");
        setPrioritaet(vorlage.prioritaet || "Mittel");

        if (
          vorlage.faelligkeitsdatum_offset_tage !== null &&
          vorlage.faelligkeitsdatum_offset_tage !== undefined
        ) {
          const faelligkeitsDatumBasis = new Date();
          const faelligkeitsDatum = new Date(
            faelligkeitsDatumBasis.setDate(
              faelligkeitsDatumBasis.getDate() +
                vorlage.faelligkeitsdatum_offset_tage
            )
          );

          const year = faelligkeitsDatum.getFullYear();
          const month = (faelligkeitsDatum.getMonth() + 1)
            .toString()
            .padStart(2, "0");
          const day = faelligkeitsDatum.getDate().toString().padStart(2, "0");
          const hours = "09";
          const minutes = "00";
          setFaelligkeitsdatum(`${year}-${month}-${day}T${hours}:${minutes}`);
        } else {
          setFaelligkeitsdatum("");
        }

        setErinnerungsDatum("");

        setAnhaengeText(vorlage.standard_anhaenge_text || "");
        setWiederholungTyp(vorlage.standard_wiederholung_typ || "Keine");
        setWiederholungIntervall(vorlage.standard_wiederholung_intervall || 1);
        setBudgetVerknuepfung("");
      }
    }
  };

  const resetForm = () => {
    setBeschreibung("");
    setKategorie("");
    setPrioritaet("Mittel");
    setFaelligkeitsdatum("");
    setSelectedVorlage("");
    setErinnerungsDatum("");
    setAnhaengeText("");
    setWiederholungTyp("Keine");
    setWiederholungIntervall(1);
    setBudgetVerknuepfung("");
    setEditingAufgabeId(null);
    setShowFormModal(false);
  };
  const handleEditClick = (aufgabe) => {
    setEditingAufgabeId(aufgabe.id);
    setBeschreibung(aufgabe.beschreibung);
    setKategorie(aufgabe.kategorie);
    setPrioritaet(aufgabe.prioritaet);
    setFaelligkeitsdatum(formatDateTimeLocalValue(aufgabe.faelligkeitsdatum));
    setErinnerungsDatum(formatDateTimeLocalValue(aufgabe.erinnerungs_datum));
    setAnhaengeText(
      Array.isArray(aufgabe.anhaenge)
        ? aufgabe.anhaenge.join(", ")
        : aufgabe.anhaenge || ""
    );
    setWiederholungTyp(aufgabe.wiederholung_typ || "Keine");
    setWiederholungIntervall(aufgabe.wiederholung_intervall || 1);
    setBudgetVerknuepfung(
      aufgabe.budget_posten_id?.id || aufgabe.budget_posten_id || ""
    );
    setSelectedVorlage("");
    setShowFormModal(true);
  };
  const handleAddNewClick = () => {
    resetForm();
    setEditingAufgabeId(null);
    setShowFormModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId) {
      alert("Bitte einloggen.");
      return;
    }
    if (!beschreibung || !kategorie) {
      alert("Beschreibung & Kategorie Pflicht.");
      return;
    }

    const faelligkeitsdatumIso = faelligkeitsdatum
      ? parseDateTimeLocalToIso(faelligkeitsdatum)
      : null;
    if (faelligkeitsdatum && !faelligkeitsdatumIso) {
      alert("Ungültiges Fälligkeitsdatum. Bitte Eingabe prüfen.");
      return;
    }

    const erinnerungsDatumIso = erinnerungsDatum
      ? parseDateTimeLocalToIso(erinnerungsDatum)
      : null;
    if (erinnerungsDatum && !erinnerungsDatumIso) {
      alert("Ungültiges Erinnerungsdatum. Bitte Eingabe prüfen.");
      return;
    }

    const aufgabeDaten = {
      user_id: userId,
      beschreibung,
      kategorie,
      prioritaet,
      faelligkeitsdatum: faelligkeitsdatumIso,
      erinnerungs_datum: erinnerungsDatumIso,
      anhaenge: anhaengeText
        ? anhaengeText
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s)
        : null,
      wiederholung_typ: wiederholungTyp === "Keine" ? null : wiederholungTyp,
      wiederholung_intervall:
        wiederholungTyp === "Keine"
          ? null
          : parseInt(wiederholungIntervall, 10) || 1,
      budget_posten_id: budgetVerknuepfung || null,
    };
    try {
      let errorSubmit, newId;
      if (editingAufgabeId) {
        const { error: updateError } = await supabase
          .from("todo_aufgaben")
          .update(aufgabeDaten)
          .match({ id: editingAufgabeId });
        errorSubmit = updateError;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .from("todo_aufgaben")
          .insert([{ ...aufgabeDaten, erledigt: false }])
          .select("id")
          .single();
        errorSubmit = insertError;
        if (insertData) newId = insertData.id;
      }
      if (errorSubmit) throw errorSubmit;
      await fetchAufgaben();
      if (newId && !editingAufgabeId) {
        setJustAddedTaskId(newId);
        setTimeout(() => setJustAddedTaskId(null), 1000);
      }
      resetForm();
    } catch (err) {
      console.error(`Fehler: ${err.message}`);
      alert(`Fehler: ${err.message}`);
    }
  };
  const berechnNaechstesDatum = (basisDatum, typ, intervall) => {
    if (!basisDatum || !typ || typ === "Keine") return null;
    const datum = new Date(basisDatum);
    const n = parseInt(intervall, 10) || 1;
    switch (typ) {
      case "Täglich": datum.setDate(datum.getDate() + n); break;
      case "Wöchentlich": datum.setDate(datum.getDate() + 7 * n); break;
      case "Monatlich": datum.setMonth(datum.getMonth() + n); break;
      case "Jährlich": datum.setFullYear(datum.getFullYear() + n); break;
      default: return null;
    }
    return datum.toISOString();
  };

  const handleToggleErledigt = async (id, aktuellerStatus) => {
    if (!userId) return;
    try {
      const { error: toggleError } = await supabase
        .from("todo_aufgaben")
        .update({ erledigt: !aktuellerStatus })
        .match({ id, user_id: userId });
      if (toggleError) throw toggleError;

      // Wenn Aufgabe als erledigt markiert wird und Wiederholung gesetzt ist → neue Aufgabe anlegen
      if (!aktuellerStatus) {
        const erledigteAufgabe = aufgaben.find((a) => a.id === id);
        if (
          erledigteAufgabe &&
          erledigteAufgabe.wiederholung_typ &&
          erledigteAufgabe.wiederholung_typ !== "Keine"
        ) {
          const naechstesDatum = berechnNaechstesDatum(
            erledigteAufgabe.faelligkeitsdatum || new Date().toISOString(),
            erledigteAufgabe.wiederholung_typ,
            erledigteAufgabe.wiederholung_intervall
          );
          if (naechstesDatum) {
            await supabase.from("todo_aufgaben").insert([{
              user_id: userId,
              beschreibung: erledigteAufgabe.beschreibung,
              kategorie: erledigteAufgabe.kategorie,
              prioritaet: erledigteAufgabe.prioritaet,
              faelligkeitsdatum: naechstesDatum,
              wiederholung_typ: erledigteAufgabe.wiederholung_typ,
              wiederholung_intervall: erledigteAufgabe.wiederholung_intervall,
              erledigt: false,
            }]);
          }
        }
      }

      fetchAufgaben();
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };
  const handleDeleteAufgabe = async (id) => {
    if (!userId) return;
    if (!window.confirm("Aufgabe löschen?")) return;
    try {
      const { error: deleteError } = await supabase
        .from("todo_aufgaben")
        .delete()
        .match({ id, user_id: userId });
      if (deleteError) throw deleteError;
      setAufgaben(aufgaben.filter((aufg) => aufg.id !== id));
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };
  const handleKiExtractedTodos = async (extractedTodos) => {
    if (!extractedTodos?.length || !userId) return;
    try {
      for (const item of extractedTodos) {
        await supabase.from("todo_aufgaben").insert([{
          user_id: userId,
          beschreibung: item.beschreibung || "Aufgabe",
          kategorie: item.kategorie || null,
          prioritaet: item.prioritaet || null,
          faelligkeitsdatum: item.faelligkeitsdatum || null,
          wiederholung_typ: null,
          erledigt: false,
        }]);
      }
      fetchAufgaben();
    } catch (err) {
      console.error("Fehler beim Speichern der KI-Aufgaben:", err);
    }
  };

  const handleExportTaskToIcs = async (aufgabe) => {
    console.log("handleExportTaskToIcs aufgerufen für Aufgabe:", aufgabe);
    if (!aufgabe.faelligkeitsdatum) {
      alert("Für diese Aufgabe ist kein Fälligkeitsdatum gesetzt.");
      console.log("Export abgebrochen: Kein Fälligkeitsdatum.");
      return;
    }
    const faelligkeit = new Date(aufgabe.faelligkeitsdatum);
    let anhaengeString = "";
    if (
      aufgabe.anhaenge &&
      Array.isArray(aufgabe.anhaenge) &&
      aufgabe.anhaenge.length > 0
    ) {
      anhaengeString = `\nAnhänge: ${aufgabe.anhaenge.join(", ")}`;
    }

    const eventDetails = {
      title: aufgabe.beschreibung,
      start: [
        faelligkeit.getFullYear(),
        faelligkeit.getMonth() + 1,
        faelligkeit.getDate(),
        faelligkeit.getHours(),
        faelligkeit.getMinutes(),
      ],
      duration: { hours: 1 },
      description: `Kategorie: ${aufgabe.kategorie || "N/A"}\nPriorität: ${
        aufgabe.prioritaet || "N/A"
      }\nErledigt: ${aufgabe.erledigt ? "Ja" : "Nein"}${anhaengeString}`,
      uid: `umzug-todo-${aufgabe.id}@umzugsplaner.app`,
      calName: "Umzugsplaner Aufgaben",
    };
    console.log("EventDetails für ICS:", eventDetails);

    const icsData = await generateIcsData(eventDetails);
    console.log(
      "Generierte ICS Daten:",
      icsData ? "Daten vorhanden" : "null oder leer"
    );

    if (icsData) {
      console.log("Versuche, ICS-Datei herunterzuladen...");
      downloadIcsFile(icsData, aufgabe.beschreibung);
      console.log("Download-Funktion aufgerufen.");
    } else {
      alert(
        "Fehler beim Erstellen der Kalenderdatei. Bitte versuche es erneut oder prüfe die Konsolenausgabe (generateIcsData hat null zurückgegeben)."
      );
      console.error("generateIcsData hat null oder leere Daten zurückgegeben.");
    }
  };

  const gruppierteAufgaben = aufgaben.reduce((acc, aufgabe) => {
    const kat = aufgabe.kategorie || "Sonstige Aufgaben";
    if (!acc[kat]) acc[kat] = [];
    acc[kat].push(aufgabe);
    return acc;
  }, {});

  const getTaskCardStyling = (prio, faelligkeit, erledigt, currentTheme) => {
    let borderClass = "border-l-4 ";
    let bgClass;

    if (currentTheme === "dark") {
      bgClass = erledigt ? "bg-primary-600/20" : "bg-canvas-2";
      if (erledigt) {
        borderClass += "border-primary-500";
      } else {
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        const faelligDatum = faelligkeit ? new Date(faelligkeit) : null;
        if (faelligDatum) {
          const diffTage = Math.ceil(
            (faelligDatum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffTage < 0) {
            borderClass += "border-red-500";
            bgClass = "bg-red-700/20";
          } else if (diffTage <= 3) {
            borderClass += "border-orange-400";
            bgClass = "bg-orange-600/20";
          } else {
            if (prio === "Hoch") borderClass += "border-red-500/70";
            else if (prio === "Mittel") borderClass += "border-orange-400/70";
            else if (prio === "Niedrig") borderClass += "border-blue-400/70";
            else borderClass += "border-dark-border";
          }
        } else {
          if (prio === "Hoch") borderClass += "border-red-500/70";
          else if (prio === "Mittel") borderClass += "border-orange-400/70";
          else if (prio === "Niedrig") borderClass += "border-blue-400/70";
          else borderClass += "border-dark-border";
        }
      }
    } else {
      bgClass = erledigt ? "bg-primary-500/10" : "bg-white";
      if (erledigt) {
        borderClass += "border-primary-500";
      } else {
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        const faelligDatum = faelligkeit ? new Date(faelligkeit) : null;
        if (faelligDatum) {
          const diffTage = Math.ceil(
            (faelligDatum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffTage < 0) {
            borderClass += "border-red-500";
            bgClass = "bg-red-100";
          } else if (diffTage <= 3) {
            borderClass += "border-orange-500";
            bgClass = "bg-orange-100";
          } else {
            if (prio === "Hoch") borderClass += "border-red-400";
            else if (prio === "Mittel") borderClass += "border-orange-400";
            else if (prio === "Niedrig") borderClass += "border-blue-400";
            else borderClass += "border-gray-300";
          }
        } else {
          if (prio === "Hoch") borderClass += "border-red-400";
          else if (prio === "Mittel") borderClass += "border-orange-400";
          else if (prio === "Niedrig") borderClass += "border-blue-400";
          else borderClass += "border-gray-300";
        }
      }
    }
    return { borderClass, bgClass };
  };

  const getPrioChipClass = (prio, currentTheme) => {
    /* ... unverändert ... */ return "bg-gray-200 text-gray-700";
  };

  const openLightboxForImage = (imageUrl) => {
    if (imageUrl) {
      setLightboxSlides([{ src: imageUrl }]);
      setLightboxIndex(0);
      setLightboxOpen(true);
    } else {
      console.warn(
        "Lightbox konnte nicht geöffnet werden: Keine Bild-URL vorhanden."
      );
    }
  };

  const handleOpenDokumentenModal = (aufgabe) => {
    setAktuelleAufgabeFuerDokumente(aufgabe);
    setShowDokumentenModal(true);
  };

  const renderDokumentVorschau = (dokument) => {
    if (!dokument) return null;
    if (dokument.datei_typ?.startsWith("image/")) {
      return (
        <BildVorschau
          key={dokument.id}
          storagePfad={dokument.storage_pfad}
          altText={dokument.dateiname}
          theme={theme}
          onClick={(_event, signedUrl) => openLightboxForImage(signedUrl)}
        />
      );
    } else {
      let icon = <FilePlus size={18} className="text-gray-500" />;
      if (dokument.datei_typ === "application/pdf")
        icon = <FileText size={18} className="text-red-500" />;
      else if (
        dokument.datei_typ?.includes("document") ||
        dokument.datei_typ?.includes("word")
      )
        icon = <FileText size={18} className="text-blue-500" />;
      return (
        <div
          key={dokument.id}
          className="mr-1 mb-1 p-1.5 bg-gray-100 dark:bg-gray-700 rounded"
          title={dokument.dateiname}
        >
          {icon}
        </div>
      );
    }
  };

  const renderKachelAnsicht = () => {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(gruppierteAufgaben).map(([kat, aufgInKat]) => (
          <div
            key={kat}
            className={`p-4 rounded-card shadow-elevation-2 flex flex-col self-start border ${
              theme === "dark"
                ? "bg-canvas-2 border-dark-border"
                : "bg-light-card-bg border-light-border"
            }`}
          >
            <h4
              className={`text-md font-semibold mb-2 pb-1.5 border-b ${
                theme === "dark"
                  ? "text-dark-text-main border-dark-border/50"
                  : "text-light-text-main border-light-border"
              }`}
            >
              {kat}
            </h4>
            <ul className="space-y-2 flex-grow">
              {aufgInKat.map((aufgabe) => {
                const { borderClass, bgClass } = getTaskCardStyling(
                  aufgabe.prioritaet,
                  aufgabe.faelligkeitsdatum,
                  aufgabe.erledigt,
                  theme
                );
                return (
                  <li
                    key={aufgabe.id}
                    className={`flex items-start p-2.5 rounded-card-sm transition-all group hover:shadow-sm ${borderClass} ${bgClass} ${
                      justAddedTaskId === aufgabe.id ? "animate-pulse-once" : ""
                    }`}
                  >
                    <button
                      onClick={() =>
                        handleToggleErledigt(aufgabe.id, aufgabe.erledigt)
                      }
                      className={`mr-2 mt-0.5 p-0.5 rounded-full ${
                        aufgabe.erledigt
                          ? "text-primary-500"
                          : theme === "dark"
                          ? "text-dark-text-secondary hover:text-dark-text-main"
                          : "text-light-text-secondary hover:text-light-text-main"
                      }`}
                      title={aufgabe.erledigt ? "Unerledigt" : "Erledigt"}
                    >
                      {aufgabe.erledigt ? (
                        <CheckCircle size={18} strokeWidth={2} />
                      ) : (
                        <Circle size={18} strokeWidth={2} />
                      )}
                    </button>
                    <div className="flex-grow">
                      <span
                        className={`block font-medium text-sm ${
                          aufgabe.erledigt
                            ? theme === "dark"
                              ? "line-through text-dark-text-secondary/70"
                              : "line-through text-light-text-secondary"
                            : theme === "dark"
                            ? "text-dark-text-main"
                            : "text-light-text-main"
                        }`}
                      >
                        {aufgabe.beschreibung}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${getPrioChipClass(
                            aufgabe.prioritaet,
                            theme
                          )}`}
                        >
                          {aufgabe.prioritaet}
                        </span>
                        {aufgabe.faelligkeitsdatum && (
                          <span
                            className={`flex items-center px-1.5 py-0.5 rounded-full ${
                              theme === "dark"
                                ? "bg-dark-border text-dark-text-secondary"
                                : "bg-light-border text-light-text-secondary"
                            }`}
                          >
                            {" "}
                            <CalendarDays size={12} className="mr-1" />{" "}
                            {new Date(aufgabe.faelligkeitsdatum).toLocaleString(
                              "de-DE",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }
                            )}{" "}
                          </span>
                        )}
                      </div>
                      {aufgabe.anhaenge && aufgabe.anhaenge.length > 0 && (
                        <div
                          className={`flex items-center text-xs mt-0.5 ${
                            theme === "dark"
                              ? "text-dark-text-secondary"
                              : "text-light-text-secondary"
                          }`}
                        >
                          {" "}
                          <Paperclip size={12} className="mr-1" />{" "}
                          <span>
                            {Array.isArray(aufgabe.anhaenge)
                              ? aufgabe.anhaenge.join(", ")
                              : aufgabe.anhaenge}
                          </span>{" "}
                        </div>
                      )}
                      {aufgabe.angehaengteDokumenteDetails &&
                        aufgabe.angehaengteDokumenteDetails.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center">
                            {" "}
                            {aufgabe.angehaengteDokumenteDetails.map((doc) =>
                              renderDokumentVorschau(doc)
                            )}{" "}
                          </div>
                        )}
                      {aufgabe.budget_posten_id && (
                        <div
                          className={`flex items-center text-xs mt-0.5 ${
                            theme === "dark"
                              ? "text-dark-accent-purple"
                              : "text-light-accent-purple"
                          }`}
                        >
                          {" "}
                          <DollarSign size={12} className="mr-1" />{" "}
                          <span>
                            Budget: {aufgabe.budget_posten_id.beschreibung}
                          </span>{" "}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-0.5 transition-opacity ml-1 self-start mt-0.5">
                      <button
                        onClick={() => handleEditClick(aufgabe)}
                        title="Bearbeiten"
                        className={`p-1 rounded hover:bg-opacity-20 ${
                          theme === "dark"
                            ? "text-dark-text-secondary hover:text-primary-400 hover:bg-dark-border/50"
                            : "text-light-text-secondary hover:text-primary-500 hover:bg-light-border"
                        }`}
                      >
                        {" "}
                        <Edit3 size={14} />{" "}
                      </button>
                      <button
                        onClick={() => handleExportTaskToIcs(aufgabe)}
                        title="Als Kalendereintrag exportieren"
                        disabled={!aufgabe.faelligkeitsdatum}
                        className={`p-1 rounded hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed ${
                          theme === "dark"
                            ? "text-dark-text-secondary hover:text-blue-400 hover:bg-dark-border/50"
                            : "text-light-text-secondary hover:text-blue-500 hover:bg-light-border"
                        }`}
                      >
                        {" "}
                        <CalendarPlus size={14} />{" "}
                      </button>
                      <button
                        onClick={() => handleDeleteAufgabe(aufgabe.id)}
                        title="Löschen"
                        className={`p-1 rounded hover:bg-opacity-20 ${
                          theme === "dark"
                            ? "text-dark-text-secondary hover:text-danger-color hover:bg-dark-border/50"
                            : "text-light-text-secondary hover:text-danger-color hover:bg-light-border"
                        }`}
                      >
                        {" "}
                        <Trash2 size={14} />{" "}
                      </button>
                      <button
                        onClick={() => handleOpenDokumentenModal(aufgabe)}
                        title="Dokumente verwalten"
                        className={`p-1 rounded hover:bg-opacity-20 ${
                          theme === "dark"
                            ? "text-dark-text-secondary hover:text-indigo-400 hover:bg-dark-border/50"
                            : "text-light-text-secondary hover:text-indigo-500 hover:bg-light-border"
                        }`}
                      >
                        {" "}
                        <FilePlus size={14} />{" "}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  const renderListenAnsicht = () => {
    return (
      <div className="space-y-6">
        {Object.entries(gruppierteAufgaben).map(([kat, aufgInKat]) => (
          <div
            key={kat}
            className={`p-4 rounded-card shadow-elevation-2 border ${
              theme === "dark"
                ? "bg-canvas-2 border-dark-border"
                : "bg-light-card-bg border-light-border"
            }`}
          >
            <h4
              className={`text-lg font-semibold mb-3 pb-2 border-b ${
                theme === "dark"
                  ? "text-dark-text-main border-dark-border/50"
                  : "text-light-text-main border-light-border"
              }`}
            >
              {kat} ({aufgInKat.length})
            </h4>
            <div className="overflow-x-auto -mx-4 px-4">
              <table
                className={`min-w-full text-sm text-left ${
                  theme === "dark"
                    ? "text-dark-text-secondary"
                    : "text-light-text-secondary"
                }`}
              >
                <thead
                  className={`text-xs uppercase ${
                    theme === "dark"
                      ? "text-dark-text-main bg-canvas-1"
                      : "text-light-text-main bg-gray-50"
                  }`}
                >
                  <tr>
                    <th scope="col" className="px-3 py-2 w-16 text-center">
                      Erledigt
                    </th>
                    <th scope="col" className="px-3 py-2 min-w-[200px]">
                      Beschreibung
                    </th>
                    <th scope="col" className="px-3 py-2 w-28 text-center">
                      Priorität
                    </th>
                    <th scope="col" className="px-3 py-2 w-32 text-center">
                      Fällig
                    </th>
                    <th scope="col" className="px-3 py-2 w-28 text-center">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aufgInKat.map((aufgabe) => (
                    <tr
                      key={aufgabe.id}
                      className={`border-b hover:bg-opacity-10 ${
                        theme === "dark"
                          ? "border-dark-border/50 hover:bg-canvas-1/30"
                          : "border-light-border hover:bg-gray-100"
                      } ${aufgabe.erledigt ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 py-2 text-center w-16">
                        <button
                          onClick={() =>
                            handleToggleErledigt(aufgabe.id, aufgabe.erledigt)
                          }
                          className={`p-0.5 rounded-full ${
                            aufgabe.erledigt
                              ? "text-primary-500"
                              : theme === "dark"
                              ? "text-dark-text-secondary hover:text-dark-text-main"
                              : "text-light-text-secondary hover:text-light-text-main"
                          }`}
                          title={aufgabe.erledigt ? "Unerledigt" : "Erledigt"}
                        >
                          {aufgabe.erledigt ? (
                            <CheckCircle size={18} />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>
                      </td>
                      <td
                        className={`px-3 py-2 min-w-[200px] ${
                          theme === "dark"
                            ? "text-dark-text-main"
                            : "text-light-text-main"
                        } ${aufgabe.erledigt ? "line-through" : ""}`}
                      >
                        {aufgabe.beschreibung}
                        {aufgabe.budget_posten_id && (
                          <div
                            className={`text-xs flex items-center mt-0.5 ${
                              theme === "dark"
                                ? "text-dark-accent-purple"
                                : "text-light-accent-purple"
                            }`}
                          >
                            {" "}
                            <DollarSign
                              size={12}
                              className="mr-1 flex-shrink-0"
                            />{" "}
                            <span
                              className="truncate"
                              title={`Budget: ${aufgabe.budget_posten_id.beschreibung}`}
                            >
                              Budget: {aufgabe.budget_posten_id.beschreibung}
                            </span>{" "}
                          </div>
                        )}
                        {aufgabe.angehaengteDokumenteDetails &&
                          aufgabe.angehaengteDokumenteDetails.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center">
                              {" "}
                              {aufgabe.angehaengteDokumenteDetails.map((doc) =>
                                renderDokumentVorschau(doc)
                              )}{" "}
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2 text-center w-28">
                        {" "}
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${getPrioChipClass(
                            aufgabe.prioritaet,
                            theme
                          )}`}
                        >
                          {aufgabe.prioritaet}
                        </span>{" "}
                      </td>
                      <td className="px-3 py-2 text-center w-32">
                        {aufgabe.faelligkeitsdatum
                          ? new Date(aufgabe.faelligkeitsdatum).toLocaleString(
                              "de-DE",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }
                            )
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-center w-28">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleEditClick(aufgabe)}
                            title="Bearbeiten"
                            className={`p-1 rounded hover:bg-opacity-20 ${
                              theme === "dark"
                                ? "text-dark-text-secondary hover:text-primary-400 hover:bg-dark-border/50"
                                : "text-light-text-secondary hover:text-primary-500 hover:bg-light-border"
                            }`}
                          >
                            {" "}
                            <Edit3 size={14} />{" "}
                          </button>
                          <button
                            onClick={() => handleExportTaskToIcs(aufgabe)}
                            title="Als Kalendereintrag exportieren"
                            disabled={!aufgabe.faelligkeitsdatum}
                            className={`p-1 rounded hover:bg-opacity-20 disabled:opacity-50 ${
                              theme === "dark"
                                ? "text-dark-text-secondary hover:text-blue-400 hover:bg-dark-border/50"
                                : "text-light-text-secondary hover:text-blue-500 hover:bg-light-border"
                            }`}
                          >
                            {" "}
                            <CalendarPlus size={14} />{" "}
                          </button>
                          <button
                            onClick={() => handleDeleteAufgabe(aufgabe.id)}
                            title="Löschen"
                            className={`p-1 rounded hover:bg-opacity-20 ${
                              theme === "dark"
                                ? "text-dark-text-secondary hover:text-danger-color hover:bg-dark-border/50"
                                : "text-light-text-secondary hover:text-danger-color hover:bg-light-border"
                            }`}
                          >
                            {" "}
                            <Trash2 size={14} />{" "}
                          </button>
                          <button
                            onClick={() => handleOpenDokumentenModal(aufgabe)}
                            title="Dokumente verwalten"
                            className={`p-1 rounded hover:bg-opacity-20 ${
                              theme === "dark"
                                ? "text-dark-text-secondary hover:text-indigo-400 hover:bg-dark-border/50"
                                : "text-light-text-secondary hover:text-indigo-500 hover:bg-light-border"
                            }`}
                          >
                            {" "}
                            <FilePlus size={14} />{" "}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading && !userId && !aufgaben.length)
    return (
      <div className="text-center py-8">
        <p
          className={`text-light-text-secondary dark:text-dark-text-secondary`}
        >
          Lade To-Do Listen...
        </p>
      </div>
    );
  if (error && !userId)
    return (
      <div className="text-center py-8">
        <p className="text-danger-color">{error}</p>
      </div>
    );

  return (
    <div
      className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4 relative"
      style={{ paddingBottom: isMobile ? Math.max(mobileBottomOffsetPx + 24, 96) : 80 }}
    >
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        <h2 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
          Smarte To-Do Listen
        </h2>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => setViewMode("kacheln")}
            className={`p-1.5 rounded-card-sm ${
              viewMode === "kacheln"
                ? "bg-primary-500 hover:bg-primary-600 text-white"
                : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title="Kachelansicht"
          >
            {" "}
            <LayoutGrid size={18} />{" "}
          </button>
          {!isMobile && (
            <button
              onClick={() => setViewMode("liste")}
              className={`p-1.5 rounded-card-sm ${
                viewMode === "liste"
                  ? "bg-primary-500 hover:bg-primary-600 text-white"
                  : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              title="Listenansicht"
            >
              {" "}
              <List size={18} />{" "}
            </button>
          )}
          <button
            onClick={() => { setShowVorlagenModal(true); fetchMeineVorlagen(); }}
            disabled={!userId}
            className="flex items-center bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white px-3 py-1.5 rounded-pill transition-colors shadow-sm text-sm disabled:opacity-50"
            title="Meine Vorlagen verwalten"
          >
            <BookMarked size={18} className="mr-1.5" /> Vorlagen
          </button>
          <button
            onClick={() => setShowKiTodoAssistent(!showKiTodoAssistent)}
            disabled={!userId}
            className="flex items-center bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white px-3 py-1.5 rounded-pill transition-colors shadow-sm text-sm disabled:opacity-50"
            title="To-Dos mit KI-Assistent erstellen"
          >
            {" "}
            <BrainCircuit size={18} className="mr-1.5" /> KI Assistent{" "}
          </button>
        </div>
      </div>
      {showKiTodoAssistent && userId && (
        <KiHomeAssistent
          session={session}
          modul="todos"
          onClose={() => setShowKiTodoAssistent(false)}
          onErgebnis={handleKiExtractedTodos}
        />
      )}
      {showFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-4 pb-safe z-50">
          <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-3 w-full max-w-md border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">
                {editingAufgabeId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
              </h3>
              <button onClick={resetForm} className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main">
                <XCircle size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3">
            <form id="todo-form" onSubmit={handleSubmit} className="space-y-3">
              {!editingAufgabeId && (
                <div>
                  {" "}
                  <label
                    htmlFor="todoVorlage"
                    className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                  >
                    {" "}
                    Vorlage (optional){" "}
                  </label>{" "}
                  <select
                    id="todoVorlage"
                    value={selectedVorlage}
                    onChange={handleVorlageChange}
                    className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm shadow-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  >
                    <option value="">-- Bitte Vorlage wählen --</option>
                    {Object.entries(gruppierteVorlagen)
                      .sort(([katA], [katB]) => katA.localeCompare(katB)) // Kategorien alphabetisch sortieren
                      .map(([kategorieName, vorlagenInGruppe]) => (
                        <optgroup key={kategorieName} label={kategorieName}>
                          {vorlagenInGruppe.map((vorlage) => (
                            <option key={vorlage.id} value={vorlage.id}>
                              {vorlage.beschreibung}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>{" "}
                </div>
              )}
              <div>
                {" "}
                <label
                  htmlFor="todoBeschreibung"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  {" "}
                  Beschreibung{" "}
                </label>{" "}
                <input
                  type="text"
                  id="todoBeschreibung"
                  value={beschreibung}
                  onChange={handleBeschreibungChange}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                />{" "}
              </div>
              <div>
                {" "}
                <label
                  htmlFor="todoKategorie"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  {" "}
                  Kategorie (Liste){" "}
                </label>{" "}
                <input
                  type="text"
                  id="todoKategorie"
                  value={kategorie}
                  onChange={(e) => setKategorie(e.target.value)}
                  placeholder="z.B. Behörden"
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  list="kategorie-vorschlaege"
                />{" "}
                <datalist id="kategorie-vorschlaege">
                  {standardKategorien.map((kat) => (
                    <option key={kat} value={kat} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {" "}
                <div>
                  {" "}
                  <label
                    htmlFor="todoPrioritaet"
                    className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                  >
                    {" "}
                    Priorität{" "}
                  </label>{" "}
                  <select
                    id="todoPrioritaet"
                    value={prioritaet}
                    onChange={(e) => setPrioritaet(e.target.value)}
                    className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  >
                    {" "}
                    <option value="Hoch">Hoch</option>{" "}
                    <option value="Mittel">Mittel</option>{" "}
                    <option value="Niedrig">Niedrig</option>{" "}
                  </select>{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label
                    htmlFor="todoFaelligkeit"
                    className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                  >
                    {" "}
                    Fällig (opt.){" "}
                  </label>{" "}
                  <input
                    type="datetime-local"
                    id="todoFaelligkeit"
                    value={faelligkeitsdatum} // State speichert jetzt datetime-local String
                    onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                    className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  />{" "}
                </div>{" "}
              </div>
              <div>
                {" "}
                <label
                  htmlFor="todoErinnerung"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  {" "}
                  Erinnerung (opt.){" "}
                </label>{" "}
                <input
                  type="datetime-local"
                  id="todoErinnerung"
                  value={erinnerungsDatum}
                  onChange={(e) => setErinnerungsDatum(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                />{" "}
              </div>
              <div>
                {" "}
                <label
                  htmlFor="todoAnhaenge"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  {" "}
                  Anhänge (Links/Notizen, kommasep., opt.){" "}
                </label>{" "}
                <textarea
                  id="todoAnhaenge"
                  value={anhaengeText}
                  onChange={(e) => setAnhaengeText(e.target.value)}
                  rows="2"
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                />{" "}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {" "}
                <div>
                  {" "}
                  <label
                    htmlFor="todoWiederholungTyp"
                    className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                  >
                    {" "}
                    Wiederholung (opt.){" "}
                  </label>{" "}
                  <select
                    id="todoWiederholungTyp"
                    value={wiederholungTyp}
                    onChange={(e) => setWiederholungTyp(e.target.value)}
                    className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                  >
                    {" "}
                    {wiederholungOptionen.map((opt) => (
                      <option key={opt} value={opt}>
                        {" "}
                        {opt}{" "}
                      </option>
                    ))}{" "}
                  </select>{" "}
                </div>{" "}
                {wiederholungTyp !== "Keine" && (
                  <div>
                    {" "}
                    <label
                      htmlFor="todoWiederholungIntervall"
                      className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                    >
                      {" "}
                      Intervall{" "}
                    </label>{" "}
                    <input
                      type="number"
                      id="todoWiederholungIntervall"
                      value={wiederholungIntervall}
                      min="1"
                      onChange={(e) =>
                        setWiederholungIntervall(
                          parseInt(e.target.value, 10) || 1
                        )
                      }
                      className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                    />{" "}
                  </div>
                )}{" "}
              </div>
              <div>
                {" "}
                <label
                  htmlFor="todoBudgetVerknuepfung"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  {" "}
                  Budget-Posten (opt.){" "}
                </label>{" "}
                <select
                  id="todoBudgetVerknuepfung"
                  value={budgetVerknuepfung}
                  onChange={(e) => setBudgetVerknuepfung(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                >
                  {" "}
                  <option value="">Keine Verknüpfung</option>{" "}
                  {budgetPostenListe.map((p) => (
                    <option key={p.id} value={p.id}>
                      {" "}
                      {p.beschreibung} ({p.betrag}€){" "}
                    </option>
                  ))}{" "}
                </select>{" "}
              </div>
            </form>
          </div>
          <div className="shrink-0 border-t border-light-border dark:border-dark-border px-4 py-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-border dark:bg-dark-border hover:bg-gray-200 dark:hover:bg-gray-700 rounded-card-sm"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="todo-form"
              className="px-3 py-1.5 text-xs text-white bg-primary-500 hover:bg-primary-600 rounded-pill"
            >
              {editingAufgabeId ? "Speichern" : "Hinzufügen"}
            </button>
          </div>
        </div>
      </div>
      )}
      {Object.keys(gruppierteAufgaben).length === 0 &&
        !loading &&
        !showFormModal && (
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary py-6 text-sm">
            Keine Aufgaben. Erstelle deine erste!
          </p>
        )}
      {Object.keys(gruppierteAufgaben).length > 0 &&
        !loading &&
        !showFormModal && (
          <>
            {" "}
            {viewMode === "kacheln" && renderKachelAnsicht()}{" "}
            {viewMode === "liste" && renderListenAnsicht()}{" "}
          </>
        )}
      <button
        onClick={handleAddNewClick}
        title="Neue Aufgabe"
        className="fixed right-4 bg-primary-500 hover:bg-primary-600 text-white p-3 rounded-full shadow-elevation-2 z-40"
        style={{ bottom: `calc(var(--mobile-bottom-offset, 0px) + ${isMobile ? "12px" : "16px"})` }}
      >
        {" "}
        <PlusCircle size={24} />{" "}
      </button>
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />
      {showVorlagenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-4 pb-safe z-50">
          <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-3 w-full max-w-md border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border">
              <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">
                Meine Vorlagen
              </h3>
              <button
                onClick={() => setShowVorlagenModal(false)}
                className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
            <form onSubmit={handleVorlageErstellen} className="space-y-2 mb-5 pb-4 border-b border-light-border dark:border-dark-border">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">Neue Vorlage erstellen</p>
              <input
                type="text"
                placeholder="Beschreibung *"
                value={neueVorlageBeschreibung}
                onChange={(e) => setNeueVorlageBeschreibung(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main"
              />
              <input
                type="text"
                placeholder="Kategorie *"
                value={neueVorlageKategorie}
                onChange={(e) => setNeueVorlageKategorie(e.target.value)}
                required
                list="kategorie-vorschlaege-vorlage"
                className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main"
              />
              <datalist id="kategorie-vorschlaege-vorlage">
                {standardKategorien.map((kat) => <option key={kat} value={kat} />)}
              </datalist>
              <select
                value={neueVorlagePrioritaet}
                onChange={(e) => setNeueVorlagePrioritaet(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main"
              >
                <option value="Hoch">Hoch</option>
                <option value="Mittel">Mittel</option>
                <option value="Niedrig">Niedrig</option>
              </select>
              <button
                type="submit"
                className="w-full px-3 py-1.5 text-sm text-white dark:text-dark-bg bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 rounded-pill"
              >
                Vorlage speichern
              </button>
            </form>
            <div className="space-y-2">
              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                Gespeicherte Vorlagen ({meineVorlagen.length})
              </p>
              {meineVorlagen.length === 0 ? (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center py-3">
                  Noch keine eigenen Vorlagen erstellt.
                </p>
              ) : (
                meineVorlagen.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-2.5 rounded-card-sm bg-light-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border"
                  >
                    <div>
                      <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">{v.beschreibung}</p>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{v.kategorie} · {v.prioritaet}</p>
                    </div>
                    <button
                      onClick={() => handleVorlageLoeschen(v.id)}
                      className="p-1 rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
                      title="Vorlage löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            </div>
          </div>
        </div>
      )}
      {showDokumentenModal && aktuelleAufgabeFuerDokumente && (
        <DokumentenZuordnungModal
          session={session}
          aufgabe={aktuelleAufgabeFuerDokumente}
          onClose={() => {
            setShowDokumentenModal(false);
            setAktuelleAufgabeFuerDokumente(null);
          }}
          onDokumenteAktualisiert={() => {
            fetchAufgaben();
          }}
        />
      )}
    </div>
  );
};
export default TodoListenManager;
