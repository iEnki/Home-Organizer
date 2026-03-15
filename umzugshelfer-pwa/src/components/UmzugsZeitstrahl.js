import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useTheme } from "../contexts/ThemeContext";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle,
  Info,
  Archive,
  Briefcase,
  Home,
  FilePlus,
  FileText,
  BookOpen,
  KeyRound, // Für API Key Button/Modal
  Save, // Für Speicherbutton
  XCircle as XCircleIcon, // Umbenannt für Klarheit im Modal
  Info as InfoIcon, // Für den Hinweis, wenn kein API Key gesetzt ist
  CalendarPlus, // Für Liefertermine
  DollarSign,
  TrendingUp,
} from "lucide-react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import BildVorschau from "./BildVorschau";
import { PDFDownloadLink } from "@react-pdf/renderer";
import TagebuchPDF from "./TagebuchPDF";
import OpenAI from "openai";

const getTailwindColor = (colorName, theme) => {
  const lightColors = {
    cardBg: "#ffffff",
    textMain: "#1f2937",
    textSecondary: "#6b7280",
    border: "#e5e7eb",
    accentGreen: "#16a34a",
    accentOrange: "#f97316",
    accentBlue: "#2563eb",
    red: "#ef4444",
    orange: "#f97316",
    blue: "#3b82f6",
    green: "#22c55e",
    workBlue: "rgb(33, 150, 243)",
    educationRed: "rgb(233, 30, 99)",
  };
  const darkColors = {
    cardBg: "#1f2937",
    textMain: "#f3f4f6",
    textSecondary: "#9ca3af",
    border: "#374151",
    accentGreen: "#22c55e",
    accentOrange: "#f97316",
    accentBlue: "#60a5fa",
    red: "#f87171",
    orange: "#fb923c",
    blue: "#60a5fa",
    green: "#4ade80",
    workBlue: "rgb(33, 150, 243)",
    educationRed: "rgb(233, 30, 99)",
  };
  if (colorName === "workBlue") return lightColors.workBlue;
  if (colorName === "educationRed") return lightColors.educationRed;
  return theme === "dark" ? darkColors[colorName] : lightColors[colorName];
};

const UmzugsZeitstrahl = ({ session }) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zukuenftigeAufgaben, setZukuenftigeAufgaben] = useState([]);
  const [heutigeAufgaben, setHeutigeAufgaben] = useState([]);
  const [vergangeneAufgaben, setVergangeneAufgaben] = useState([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSlides, setLightboxSlides] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const userId = session?.user?.id;

  const [tagebuchLoading, setTagebuchLoading] = useState(false);
  const [tagebuchError, setTagebuchError] = useState(null);
  const [generierterTagebuchText, setGenerierterTagebuchText] = useState(null);
  const [umzugsdatenJSON, setUmzugsdatenJSON] = useState(null);
  const [pdfBereit, setPdfBereit] = useState(false);
  const [signedImageUrlsMap, setSignedImageUrlsMap] = useState({});

  // States für API Key Management
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [currentApiKey, setCurrentApiKey] = useState(""); // Um den geladenen Key zu halten
  const [isApiKeySetForZeitstrahl, setIsApiKeySetForZeitstrahl] =
    useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyToastMessage, setApiKeyToastMessage] = useState({
    text: "",
    type: "",
  });

  const [kistenEvents, setKistenEvents] = useState([]);
  const [lieferEvents, setLieferEvents] = useState([]);
  const [zusatzEvents, setZusatzEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState("alle");

  const fetchAufgaben = useCallback(async () => {
    if (!userId) {
      setZukuenftigeAufgaben([]);
      setHeutigeAufgaben([]);
      setVergangeneAufgaben([]);
      setKistenEvents([]);
      setLieferEvents([]);
      setZusatzEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Aufgaben laden
      const { data: aufgabenData, error: dbError } = await supabase
        .from("todo_aufgaben")
        .select("*, angehaengte_dokument_ids")
        .eq("user_id", userId)
        .order("faelligkeitsdatum", { ascending: true });
      if (dbError) throw dbError;
      let alleAufgaben = aufgabenData || [];
      if (alleAufgaben.length > 0) {
        const alleDokumentenIds = alleAufgaben.reduce((acc, aufg) => {
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
            .select("id, dateiname, datei_typ, storage_pfad") // Nur benötigte Spalten
            .in("id", eindeutigeDokumentenIds);
          if (docError) throw docError;
          if (dokumenteData && Array.isArray(dokumenteData)) {
            dokumenteData.forEach((doc) => {
              dokumenteDetailsMap[doc.id] = doc;
            });
          }
        }
        alleAufgaben = alleAufgaben.map((aufg) => ({
          ...aufg,
          angehaengteDokumenteDetails:
            aufg.angehaengte_dokument_ids
              ?.map((id) => dokumenteDetailsMap[id])
              .filter(Boolean) || [],
        }));
      }
      const heuteTimestamp = new Date();
      heuteTimestamp.setHours(0, 0, 0, 0);
      const zukunft = [],
        heuteListe = [],
        vergangenheit = [];
      alleAufgaben.forEach((aufgabe) => {
        const basisDatum = aufgabe.faelligkeitsdatum || aufgabe.created_at;
        const faelligkeit = new Date(basisDatum);
        const userTimezoneOffset = faelligkeit.getTimezoneOffset() * 60000;
        const localFaelligkeit = new Date(
          faelligkeit.getTime() + userTimezoneOffset
        );
        localFaelligkeit.setHours(0, 0, 0, 0);
        if (localFaelligkeit.getTime() > heuteTimestamp.getTime())
          zukunft.push(aufgabe);
        else if (localFaelligkeit.getTime() === heuteTimestamp.getTime())
          heuteListe.push(aufgabe);
        else vergangenheit.push(aufgabe);
      });
      setZukuenftigeAufgaben(zukunft);
      setHeutigeAufgaben(heuteListe);
      setVergangeneAufgaben(
        vergangenheit.sort(
          (a, b) =>
            new Date(a.faelligkeitsdatum) - new Date(b.faelligkeitsdatum)
        )
      );

      // Kisten + Gegenstände laden
      const { data: kistenData, error: kistenError } = await supabase
        .from("pack_kisten")
        .select(
          "*, gegenstaende:pack_gegenstaende(id, beschreibung, menge, kategorie)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (kistenError) throw kistenError;
      const kistenEventsArr =
        (kistenData || []).map((kiste) => {
          const gegenstaende = Array.isArray(kiste.gegenstaende)
            ? kiste.gegenstaende
            : [];
          return {
            __eventType: "kiste",
            __timestamp: kiste.created_at,
            title: `Kiste gepackt: ${kiste.name}`,
            details: [
              kiste.raum_neu ? `Zielraum: ${kiste.raum_neu}` : null,
              kiste.status_kiste ? `Status: ${kiste.status_kiste}` : null,
              kiste.notizen ? `Notizen: ${kiste.notizen}` : null,
              gegenstaende.length > 0
                ? "Inhalt:\n" +
                  gegenstaende
                    .map(
                      (g) =>
                        `- ${g.menge}x ${g.beschreibung}${
                          g.kategorie ? ` (${g.kategorie})` : ""
                        }`
                    )
                    .join("\n")
                : "Inhalt: (leer)",
            ]
              .filter(Boolean)
              .join("\n"),
          };
        }) || [];
      setKistenEvents(kistenEventsArr);

      // Liefertermine laden
      const { data: lieferData, error: lieferError } = await supabase
        .from("budget_posten")
        .select("id, beschreibung, kategorie, lieferdatum, betrag, datum, created_at")
        .eq("user_id", userId);
      if (lieferError) throw lieferError;
      const lieferEventsArr =
        (lieferData || [])
          .filter((p) => p.lieferdatum)
          .map((p) => ({
            __eventType: "lieferung",
            __timestamp: p.lieferdatum,
            title: `Lieferung: ${p.beschreibung}`,
            details: [
              p.kategorie ? `Kategorie: ${p.kategorie}` : null,
              p.betrag ? `Betrag: ${p.betrag} €` : null,
            ]
              .filter(Boolean)
              .join(" | "),
          })) || [];
      setLieferEvents(lieferEventsArr);

      // Weitere Umzugs-Ereignisse laden (Budget, Teilzahlungen, Dokumente, Kontakte, Renovierung)
      const [
        { data: teilzahlungenData, error: teilzahlungenError },
        { data: dokumenteData, error: dokumenteError },
        { data: kontakteData, error: kontakteError },
        { data: renovierungsData, error: renovierungsError },
      ] = await Promise.all([
        supabase
          .from("budget_teilzahlungen")
          .select(
            "id, posten_id, betrag_teilzahlung, datum_teilzahlung, notiz_teilzahlung, created_at"
          )
          .eq("user_id", userId),
        supabase
          .from("dokumente")
          .select("id, dateiname, datei_typ, beschreibung, todo_aufgabe_id, erstellt_am")
          .eq("user_id", userId),
        supabase
          .from("kontakte")
          .select("id, name, typ, telefon, adresse, created_at")
          .eq("user_id", userId),
        supabase
          .from("renovierungs_posten")
          .select(
            "id, beschreibung, raum, kategorie, status, geschaetzter_preis, created_at, updated_at"
          )
          .eq("user_id", userId),
      ]);

      if (teilzahlungenError) throw teilzahlungenError;
      if (dokumenteError) throw dokumenteError;
      if (kontakteError) throw kontakteError;
      if (renovierungsError) throw renovierungsError;

      const budgetBeschreibungById = (lieferData || []).reduce((acc, posten) => {
        acc[posten.id] = posten.beschreibung;
        return acc;
      }, {});

      const budgetPostenEvents =
        (lieferData || []).map((p) => ({
          __eventType: "budget",
          __timestamp: p.datum || p.created_at,
          title: `Kostenposten: ${p.beschreibung}`,
          details: [
            p.kategorie ? `Kategorie: ${p.kategorie}` : null,
            p.betrag != null ? `Geplant: ${p.betrag} €` : null,
          ]
            .filter(Boolean)
            .join(" | "),
          __label: "Budget",
          __link: "/budget",
        })) || [];

      const teilzahlungsEvents =
        (teilzahlungenData || []).map((tz) => ({
          __eventType: "teilzahlung",
          __timestamp: tz.datum_teilzahlung || tz.created_at,
          title: `Teilzahlung: ${
            budgetBeschreibungById[tz.posten_id] || "Budgetposten"
          }`,
          details: [
            `Bezahlt: ${tz.betrag_teilzahlung} €`,
            tz.notiz_teilzahlung ? `Notiz: ${tz.notiz_teilzahlung}` : null,
          ]
            .filter(Boolean)
            .join(" | "),
          __label: "Teilzahlung",
          __link: "/budget",
        })) || [];

      const dokumentEvents =
        (dokumenteData || []).map((doc) => ({
          __eventType: "dokument",
          __timestamp: doc.erstellt_am,
          title: `Dokument: ${doc.dateiname}`,
          details: [
            doc.datei_typ ? `Typ: ${doc.datei_typ}` : null,
            doc.beschreibung ? `Beschreibung: ${doc.beschreibung}` : null,
            doc.todo_aufgabe_id ? "Mit Aufgabe verknüpft" : "Ohne Aufgabenbezug",
          ]
            .filter(Boolean)
            .join(" | "),
          __label: "Dokument",
          __link: "/dokumente",
        })) || [];

      const kontaktEvents =
        (kontakteData || []).map((kontakt) => ({
          __eventType: "kontakt",
          __timestamp: kontakt.created_at,
          title: `Kontakt: ${kontakt.name}`,
          details: [
            kontakt.typ ? `Typ: ${kontakt.typ}` : null,
            kontakt.telefon ? `Telefon: ${kontakt.telefon}` : null,
            kontakt.adresse ? `Adresse: ${kontakt.adresse}` : null,
          ]
            .filter(Boolean)
            .join(" | "),
          __label: "Kontakt",
          __link: "/kontakte",
        })) || [];

      const renovierungsEvents =
        (renovierungsData || []).map((rp) => ({
          __eventType: "renovierung",
          __timestamp: rp.updated_at || rp.created_at,
          title: `Renovierung: ${rp.beschreibung}`,
          details: [
            rp.raum ? `Raum: ${rp.raum}` : null,
            rp.kategorie ? `Kategorie: ${rp.kategorie}` : null,
            rp.status ? `Status: ${rp.status}` : null,
            rp.geschaetzter_preis != null
              ? `Geschätzt: ${rp.geschaetzter_preis} €`
              : null,
          ]
            .filter(Boolean)
            .join(" | "),
          __label: "Renovierung",
          __link: "/materialplaner",
        })) || [];

      setZusatzEvents([
        ...budgetPostenEvents,
        ...teilzahlungsEvents,
        ...dokumentEvents,
        ...kontaktEvents,
        ...renovierungsEvents,
      ]);
    } catch (err) {
      console.error("Fehler Zeitstrahl:", err);
      setError("Zeitstrahl-Ereignisse konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAufgaben();
  }, [fetchAufgaben]);

  // Effekt zum Laden des API-Keys
  useEffect(() => {
    const loadApiKey = async () => {
      if (userId) {
        try {
          const { data, error: dbError } = await supabase
            .from("user_profile")
            .select("openai_api_key")
            .eq("id", userId)
            .single();

          if (dbError && dbError.code !== "PGRST116") {
            // PGRST116 = no rows found, was ok ist
            throw dbError;
          }

          if (data && data.openai_api_key) {
            setCurrentApiKey(data.openai_api_key);
            setApiKeyInput(data.openai_api_key); // Vorbelegen für das Modal
            setIsApiKeySetForZeitstrahl(true);
          } else {
            setIsApiKeySetForZeitstrahl(false);
          }
        } catch (err) {
          console.error("Fehler beim Laden des API-Keys für Zeitstrahl:", err);
          setIsApiKeySetForZeitstrahl(false);
          // Optional: Fehler dem Benutzer anzeigen
        }
      }
    };
    if (userId) {
      loadApiKey();
    }
  }, [userId]);

  const showApiKeyToast = (text, type = "info", duration = 5000) => {
    setApiKeyToastMessage({ text, type });
    setTimeout(() => setApiKeyToastMessage({ text: "", type: "" }), duration);
  };

  const handleSaveApiKey = async () => {
    if (apiKeyInput.trim() === "") {
      setApiKeyError("API-Key darf nicht leer sein.");
      showApiKeyToast("API-Key darf nicht leer sein.", "error");
      return;
    }
    if (!userId) {
      showApiKeyToast("Benutzer nicht angemeldet.", "error");
      return;
    }

    setApiKeyLoading(true);
    setApiKeyError("");
    try {
      const { error: updateError } = await supabase
        .from("user_profile")
        .update({ openai_api_key: apiKeyInput.trim() })
        .eq("id", userId);

      if (updateError) throw updateError;

      setCurrentApiKey(apiKeyInput.trim());
      setIsApiKeySetForZeitstrahl(true);
      setShowApiKeyModal(false);
      showApiKeyToast("OpenAI API-Key erfolgreich gespeichert!", "success");
    } catch (err) {
      console.error("Fehler Speichern API-Key:", err);
      setApiKeyError("Fehler beim Speichern des API-Keys.");
      showApiKeyToast(
        `Fehler beim Speichern des API-Keys: ${err.message}`,
        "error"
      );
    } finally {
      setApiKeyLoading(false);
    }
  };

  const formatDateForTimeline = (dateString) => {
    if (!dateString) return "Unbekannt";
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() + userTimezoneOffset);
    return localDate.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isOverdue = (dateString, erledigt) => {
    if (erledigt || !dateString) return false;
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const faelligkeit = new Date(dateString);
    const userTimezoneOffset = faelligkeit.getTimezoneOffset() * 60000;
    const localFaelligkeit = new Date(
      faelligkeit.getTime() + userTimezoneOffset
    );
    localFaelligkeit.setHours(0, 0, 0, 0);
    return localFaelligkeit < heute;
  };

  const getIconForAufgabe = (aufgabe) => {
    if (aufgabe.erledigt) return <CheckCircle />;
    if (isOverdue(aufgabe.faelligkeitsdatum, aufgabe.erledigt))
      return <AlertTriangle />;
    const kategorie = aufgabe.kategorie?.toLowerCase() || "";
    if (kategorie.includes("arbeit") || kategorie.includes("büro"))
      return <Briefcase />;
    if (kategorie.includes("kurs") || kategorie.includes("lernen"))
      return <Home />;
    if (kategorie.includes("verpacken")) return <Archive />;
    if (aufgabe.prioritaet === "Niedrig") return <Info />;
    return <CalendarClock />;
  };

  const getIconStyle = (aufgabe) => {
    const color = "#fff";
    let background;
    const kategorie = aufgabe.kategorie?.toLowerCase() || "";
    if (kategorie.includes("arbeit") || kategorie.includes("büro"))
      background = getTailwindColor("workBlue", theme);
    else if (kategorie.includes("kurs") || kategorie.includes("lernen"))
      background = getTailwindColor("educationRed", theme);
    else if (aufgabe.erledigt) background = getTailwindColor("green", theme);
    else if (isOverdue(aufgabe.faelligkeitsdatum, aufgabe.erledigt))
      background = getTailwindColor("red", theme);
    else {
      switch (aufgabe.prioritaet) {
        case "Hoch":
          background = getTailwindColor("red", theme);
          break;
        case "Mittel":
          background = getTailwindColor("orange", theme);
          break;
        case "Niedrig":
          background = getTailwindColor("blue", theme);
          break;
        default:
          background = getTailwindColor("accentBlue", theme);
          break;
      }
    }
    return { background, color };
  };

  const getContentStyle = (aufgabe) => {
    let background = getTailwindColor("cardBg", theme);
    let color = getTailwindColor("textMain", theme);
    const kategorie = aufgabe.kategorie?.toLowerCase() || "";
    if (kategorie.includes("arbeit") || kategorie.includes("büro")) {
      background = getTailwindColor("workBlue", theme);
      color = "#fff";
    } else if (kategorie.includes("kurs") || kategorie.includes("lernen")) {
      background = getTailwindColor("educationRed", theme);
      color = "#fff";
    }
    return {
      background,
      color,
      boxShadow: `0 3px 0 ${
        theme === "dark"
          ? getTailwindColor("border", theme)
          : getTailwindColor("accentBlue", theme)
      }`,
      border: `1px solid ${getTailwindColor("border", theme)}`,
      borderRadius: "0.25rem",
    };
  };

  const getContentArrowStyle = (aufgabe) => {
    let arrowColor = getTailwindColor("cardBg", theme);
    const kategorie = aufgabe.kategorie?.toLowerCase() || "";
    if (kategorie.includes("arbeit") || kategorie.includes("büro"))
      arrowColor = getTailwindColor("workBlue", theme);
    else if (kategorie.includes("kurs") || kategorie.includes("lernen"))
      arrowColor = getTailwindColor("educationRed", theme);
    return { borderRight: `7px solid ${arrowColor}` };
  };

  const fetchSignedImageUrls = async (events) => {
    const urlsMap = {};
    if (!events || events.length === 0) return urlsMap;

    const imagePromises = [];
    events.forEach((event) => {
      if (event.media && Array.isArray(event.media)) {
        event.media.forEach((mediaItem) => {
          if (mediaItem.type === "image" && mediaItem.storage_path) {
            if (
              mediaItem.storage_path.startsWith("http://") ||
              mediaItem.storage_path.startsWith("https://")
            ) {
              urlsMap[mediaItem.storage_path] = mediaItem.storage_path;
            } else {
              // Kistenfotos werden hier nicht mehr speziell behandelt, da sie nicht im PDF erscheinen sollen.
              // Nur Fotos von Aufgaben (aus 'user-dokumente') werden geladen.
              if (event.type !== "pack_kiste") {
                imagePromises.push(
                  supabase.storage
                    .from("user-dokumente")
                    .createSignedUrl(mediaItem.storage_path, 3600)
                    .then(({ data, error }) => {
                      if (error) {
                        console.error(
                          `Fehler beim Erstellen der Signed URL für ${mediaItem.storage_path} im Bucket user-dokumente:`,
                          error
                        );
                        return {
                          path: mediaItem.storage_path,
                          url: null,
                          error: error.message,
                        };
                      }
                      return {
                        path: mediaItem.storage_path,
                        url: data?.signedUrl,
                        error: null,
                      };
                    })
                );
              }
            }
          }
        });
      }
    });

    const results = await Promise.all(imagePromises);
    results.forEach((result) => {
      if (result.url) {
        urlsMap[result.path] = result.url;
      } else if (result.error) {
        console.warn(
          `Konnte Signed URL für ${result.path} nicht laden: ${result.error}`
        );
      }
    });
    return urlsMap;
  };

  const handleGenerateTagebuch = async () => {
    setTagebuchLoading(true);
    setTagebuchError(null);
    setGenerierterTagebuchText(null);
    setUmzugsdatenJSON(null);
    setPdfBereit(false);
    setSignedImageUrlsMap({});
    console.log("Starte Tagebuch-Generierung...");

    if (!userId) {
      setTagebuchError("Benutzer nicht angemeldet.");
      setTagebuchLoading(false);
      return;
    }

    try {
      const { data: todosData, error: todosError } = await supabase
        .from("todo_aufgaben")
        .select("*, angehaengte_dokument_ids")
        .eq("user_id", userId)
        .order("faelligkeitsdatum", { ascending: true });
      if (todosError) throw todosError;

      const allDocumentIdsFromTodos = todosData.reduce((acc, aufgabe) => {
        if (
          aufgabe.angehaengte_dokument_ids &&
          aufgabe.angehaengte_dokument_ids.length > 0
        ) {
          acc.push(...aufgabe.angehaengte_dokument_ids);
        }
        return acc;
      }, []);
      const uniqueDocumentIds = [...new Set(allDocumentIdsFromTodos)];

      let dokumenteDetailsMap = {};
      if (uniqueDocumentIds.length > 0) {
        const { data: dokumenteData, error: docError } = await supabase
          .from("dokumente")
          .select("*")
          .in("id", uniqueDocumentIds);
        if (docError) throw docError;
        if (dokumenteData && Array.isArray(dokumenteData)) {
          dokumenteData.forEach((doc) => (dokumenteDetailsMap[doc.id] = doc));
        }
      }

      const { data: packKistenData, error: packKistenError } = await supabase
        .from("pack_kisten")
        .select(
          "*, inhalte:pack_gegenstaende(id, beschreibung, menge, kategorie)" // foto_url für Gegenstände nicht mehr nötig
        )
        .eq("user_id", userId);
      if (packKistenError) {
        console.error(
          "Fehler beim Laden der Packkisten und Gegenstände:",
          packKistenError
        );
        throw packKistenError;
      }

      const { data: userProfileData, error: profileError } = await supabase
        .from("user_profile")
        .select("openai_api_key")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Fehler beim Abrufen des User-Profils:", profileError);
        if (profileError.code === "PGRST116") {
          setTagebuchError(
            "Benutzerprofil nicht gefunden. API Key kann nicht geladen werden."
          );
        } else {
          setTagebuchError(
            `Fehler beim Laden des API-Keys: ${profileError.message}`
          );
        }
        setTagebuchLoading(false);
        return;
      }

      if (!userProfileData?.openai_api_key) {
        setTagebuchError(
          "OpenAI API Key nicht im Benutzerprofil gefunden oder nicht konfiguriert."
        );
        setTagebuchLoading(false);
        return;
      }
      const apiKey = userProfileData.openai_api_key;

      const umzugsEvents = [];
      todosData.forEach((aufgabe) => {
        umzugsEvents.push({
          timestamp:
            aufgabe.erledigt_am ||
            aufgabe.faelligkeitsdatum ||
            aufgabe.created_at,
          type: `aufgabe_${aufgabe.erledigt ? "erledigt" : "offen"}`,
          title: aufgabe.beschreibung,
          details: aufgabe.notizen || "",
          category: aufgabe.kategorie,
          status: aufgabe.erledigt ? "Erledigt" : "Offen",
          priority: aufgabe.prioritaet,
          media:
            aufgabe.angehaengte_dokument_ids
              ?.map((docId) => {
                const doc = dokumenteDetailsMap[docId];
                if (!doc) return null;
                return {
                  id: doc.id,
                  type: doc.datei_typ?.startsWith("image/")
                    ? "image"
                    : "document",
                  name: doc.dateiname,
                  description: doc.beschreibung || "",
                  storage_path: doc.storage_pfad,
                };
              })
              .filter(Boolean) || [],
        });
      });

      if (packKistenData) {
        packKistenData.forEach((kiste) => {
          const kisteEvent = {
            timestamp: kiste.updated_at || kiste.created_at,
            type: "pack_kiste",
            title: `Kiste gepackt: ${kiste.name}`,
            details: `Status: ${kiste.status}. Von Raum: ${
              kiste.raum_alt || "N/A"
            } nach Raum: ${kiste.raum_neu || "N/A"}. Notizen: ${
              kiste.notizen || ""
            }`,
            category: `Packen (${
              kiste.raum_neu || kiste.raum_alt || "Allgemein"
            })`,
            status: kiste.status,
            media: [], // Kistenfotos werden nicht mehr ins media-Array aufgenommen
            inhalt:
              kiste.inhalte?.map((g) => ({
                name: g.beschreibung,
                menge: g.menge,
                kategorie: g.kategorie,
              })) || [],
          };
          // Logik zum Hinzufügen von kiste.foto_url zu kisteEvent.media entfernt
          umzugsEvents.push(kisteEvent);
        });
      }

      umzugsEvents.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      const datenFuerKI = {
        umzugstitel: "Mein Umzugstagebuch",
        phasen: [
          "Vorbereitung",
          "Packen",
          "Umzugstag",
          "Ankommen",
          "Abschluss",
        ],
        events: umzugsEvents,
      };

      console.log("Lade signierte URLs für Bilder (nur für Aufgaben)...");
      const urlsMap = await fetchSignedImageUrls(datenFuerKI.events);
      setSignedImageUrlsMap(urlsMap);
      console.log("Signierte URLs geladen:", urlsMap);

      console.log(
        "Strukturierte Daten für KI:",
        JSON.stringify(datenFuerKI, null, 2)
      );

      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      const prompt = `Erstelle ein sehr ausführliches, detailliertes, lebendiges und freundliches Umzugstagebuch im lockeren Plauderton, gerne mit einer Prise Humor.
Gliedere den Text deutlich in die Phasen: "Phase: Vorbereitung", "Phase: Packen", "Phase: Umzugstag", "Phase: Ankommen" und "Phase: Abschluss". Jede Phase soll als klare Überschrift auf einer neuen Zeile beginnen (z.B. "Phase: Packen" oder "PACKEN").
Baue alle erledigten Aufgaben und Meilensteine als natürlichen Teil des Fließtextes ein. Beschreibe die Ereignisse und Aufgaben so, als würdest du einem Freund davon erzählen.
Wenn eine Kiste beschrieben wird, erwähne ihren Namen und sei kreativ bei der Beschreibung! Liste dann ihren Inhalt (Gegenstände mit Menge und optional Kategorie) als übersichtliche Aufzählungspunkte auf, etwa so:
In Kiste '**Kistenname XY**' (oder ein lustiger Spitzname für die Kiste) habe ich folgende Schätze verstaut:
- Menge x Gegenstandsname (Kategorie: Kategorie)
- Menge x Gegenstandsname
(Kommentiere den Inhalt vielleicht mit einem Augenzwinkern, passend zum Stil des Tagebuchs. Der Name des Gegenstands wird im 'name'-Feld der Inhaltsobjekte übergeben.)
Wenn zu einem Ereignis Medien (Bilder oder Dokumente, die NICHT zu Kisten gehören) gehören, erwähne diese im Text. Für Bilder verwende bitte das Format [BILD: EXAKTER_DATEINAME.EXT, BESCHREIBUNG_DES_BILDES] und für Dokumente [DOKUMENT: EXAKTER_DATEINAME.EXT, BESCHREIBUNG_DES_DOKUMENTS]. Der EXAKTE_DATEINAME.EXT muss genau dem Namen der Datei entsprechen, ohne zusätzliche Informationen oder Pfade.
Füge – falls vorhanden – persönliche Notizen/Zitate als kurze, kursiv formatierte Abschnitte ein (z.B. *Das war anstrengend!*).

Hier sind die Umzugsdaten:
${JSON.stringify(datenFuerKI, null, 2)}

Generiere nun das Umzugstagebuch:`;

      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein kreativer Assistent, der fesselnde und humorvolle Umzugstagebücher im Plauderton schreibt und dabei Listen von Kisteninhalten als Aufzählungspunkte formatiert.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const tagebuchText = chatCompletion.choices[0]?.message?.content;

      if (!tagebuchText) {
        throw new Error("Kein Text von OpenAI API erhalten.");
      }

      console.log("Generierter Tagebuchtext:", tagebuchText);
      setGenerierterTagebuchText(tagebuchText);
      setUmzugsdatenJSON(datenFuerKI);
      setPdfBereit(true);
      setTagebuchError(null);
    } catch (err) {
      console.error("Fehler bei Tagebuch-Generierung:", err);
      setGenerierterTagebuchText(null);
      setUmzugsdatenJSON(null);
      setPdfBereit(false);
      let errorMessage = "Ein unbekannter Fehler ist aufgetreten.";
      if (
        err.response &&
        err.response.data &&
        err.response.data.error &&
        err.response.data.error.message
      ) {
        errorMessage = `OpenAI API Fehler: ${err.response.data.error.message}`;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setTagebuchError(errorMessage);
    } finally {
      setTagebuchLoading(false);
    }
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

  const renderDokumentVorschau = (dokument) => {
    if (!dokument) return null;
    if (dokument.datei_typ?.startsWith("image/")) {
      return (
        <BildVorschau
          key={dokument.id}
          storagePfad={dokument.storage_pfad}
          altText={dokument.dateiname}
          theme={theme}
          onClick={(event, signedUrl) => {
            if (event) event.stopPropagation();
            openLightboxForImage(signedUrl);
          }}
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
          className="mr-1 mb-1 p-1.5 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center w-10 h-10"
          title={dokument.dateiname}
        >
          {icon}
        </div>
      );
    }
  };

  const renderTimelineElement = (aufgabe) => {
    return (
      <VerticalTimelineElement
        key={aufgabe.id}
        date={formatDateForTimeline(
          aufgabe.faelligkeitsdatum || aufgabe.created_at || aufgabe.__timestamp
        )}
        iconStyle={getIconStyle(aufgabe)}
        icon={getIconForAufgabe(aufgabe)}
        contentStyle={getContentStyle(aufgabe)}
        contentArrowStyle={getContentArrowStyle(aufgabe)}
        onTimelineElementClick={() => navigate(`/todos?edit=${aufgabe.id}`)}
        className="cursor-pointer"
      >
        <h3 className="vertical-timeline-element-title text-lg font-semibold">
          {aufgabe.beschreibung}
        </h3>
        {aufgabe.kategorie && (
          <h4 className="vertical-timeline-element-subtitle text-sm">
            Kategorie: {aufgabe.kategorie}
          </h4>
        )}
        <p className="text-xs mt-1">
          Priorität: {aufgabe.prioritaet || "Standard"}{" "}
          {isOverdue(aufgabe.faelligkeitsdatum, aufgabe.erledigt) && (
            <span className="text-red-500 dark:text-red-400 font-semibold ml-2">
              Überfällig!
            </span>
          )}
        </p>
        <span
          className={`mt-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
            aufgabe.erledigt
              ? "bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100"
              : "bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100"
          }`}
        >
          {aufgabe.erledigt ? "Erledigt" : "Offen"}
        </span>
        {aufgabe.angehaengteDokumenteDetails &&
          aufgabe.angehaengteDokumenteDetails.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <h5 className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">
                Dokumente:
              </h5>
              <div className="flex flex-wrap items-center">
                {aufgabe.angehaengteDokumenteDetails.map((doc) =>
                  renderDokumentVorschau(doc)
                )}
              </div>
            </div>
          )}
      </VerticalTimelineElement>
    );
  };

  if (loading)
    return (
      <div className="text-center py-10 text-light-text-secondary dark:text-dark-text-secondary">
        Lade Zeitstrahl...
      </div>
    );
  if (error)
    return (
      <div className="text-center py-10 text-red-500 dark:text-red-400">
        Fehler: {error}
      </div>
    );

  // Hilfsfunktion für Kisten-Events
  const renderKistenTimelineElement = (event, idx) => (
    <VerticalTimelineElement
      key={`kiste-${idx}`}
      date={formatDateForTimeline(event.__timestamp)}
      iconStyle={{
        background: getTailwindColor("accentOrange", theme),
        color: "#fff",
      }}
      icon={<Archive />}
      contentStyle={{
        background: getTailwindColor("cardBg", theme),
        color: getTailwindColor("textMain", theme),
        border: `1px solid ${getTailwindColor("border", theme)}`,
        borderRadius: "0.25rem",
      }}
      contentArrowStyle={{
        borderRight: `7px solid ${getTailwindColor("cardBg", theme)}`,
      }}
    >
      <h3 className="vertical-timeline-element-title text-lg font-semibold">
        {event.title}
      </h3>
      <div className="text-xs mt-1 whitespace-pre-line">{event.details}</div>
      <span className="mt-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-100">
        Kiste gepackt
      </span>
    </VerticalTimelineElement>
  );

  // Timeline-Elemente für Aufgaben und Kisten gemischt nach Datum
  // Filter- und Sortierlogik nach Userwunsch
  const alleAufgaben = [
    ...zukuenftigeAufgaben,
    ...heutigeAufgaben,
    ...vergangeneAufgaben,
  ];

  const offeneAufgaben = [...alleAufgaben]
    .filter((aufgabe) => !aufgabe.erledigt)
    .map((aufgabe) => ({
      ...aufgabe,
      __eventType: "aufgabe",
      __timestamp: aufgabe.faelligkeitsdatum || aufgabe.created_at,
    }))
    .sort((a, b) => new Date(a.__timestamp) - new Date(b.__timestamp));

  const erledigteAufgaben = [...alleAufgaben]
    .filter((aufgabe) => !!aufgabe.erledigt)
    .map((aufgabe) => ({
      ...aufgabe,
      __eventType: "aufgabe",
      __timestamp: aufgabe.faelligkeitsdatum || aufgabe.created_at,
    }))
    .sort((a, b) => new Date(a.__timestamp) - new Date(b.__timestamp));

  const kistenHistorisch = [...kistenEvents].sort(
    (a, b) => new Date(a.__timestamp) - new Date(b.__timestamp)
  );

  const zusatzHistorisch = [...zusatzEvents].sort(
    (a, b) => new Date(a.__timestamp) - new Date(b.__timestamp)
  );

  const alleEvents = [
    ...offeneAufgaben,
    ...lieferEvents,
    ...kistenHistorisch,
    ...zusatzHistorisch,
    ...erledigteAufgaben,
  ].sort((a, b) => {
    const aTime = new Date(a.__timestamp).getTime();
    const bTime = new Date(b.__timestamp).getTime();
    if (isNaN(aTime) && isNaN(bTime)) return 0;
    if (isNaN(aTime)) return 1;
    if (isNaN(bTime)) return -1;
    return aTime - bTime;
  });

  const eventFilterChips = [
    { key: "alle", label: "Alle" },
    { key: "aufgabe", label: "To-Dos" },
    { key: "kiste", label: "Kisten" },
    { key: "lieferung", label: "Lieferungen" },
    { key: "budget", label: "Budget" },
    { key: "teilzahlung", label: "Teilzahlungen" },
    { key: "dokument", label: "Dokumente" },
    { key: "kontakt", label: "Kontakte" },
    { key: "renovierung", label: "Renovierung" },
  ];

  const eventTypeCounts = alleEvents.reduce((acc, event) => {
    acc[event.__eventType] = (acc[event.__eventType] || 0) + 1;
    return acc;
  }, {});

  const gefilterteEvents = alleEvents.filter(
    (event) => eventFilter === "alle" || event.__eventType === eventFilter
  );

  // Hilfsfunktion für Liefertermine
  const renderLieferTimelineElement = (event, idx) => (
    <VerticalTimelineElement
      key={`lieferung-${idx}`}
      date={formatDateForTimeline(event.__timestamp)}
      iconStyle={{
        background: getTailwindColor("accentBlue", theme),
        color: "#fff",
      }}
      icon={<CalendarPlus />}
      contentStyle={{
        background: getTailwindColor("cardBg", theme),
        color: getTailwindColor("textMain", theme),
        border: `1px solid ${getTailwindColor("border", theme)}`,
        borderRadius: "0.25rem",
      }}
      contentArrowStyle={{
        borderRight: `7px solid ${getTailwindColor("cardBg", theme)}`,
      }}
    >
      <h3 className="vertical-timeline-element-title text-lg font-semibold">
        {event.title}
      </h3>
      <div className="text-xs mt-1 whitespace-pre-line">{event.details}</div>
      <span className="mt-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100">
        Liefertermin
      </span>
    </VerticalTimelineElement>
  );

  const getZusatzEventMeta = (eventType) => {
    switch (eventType) {
      case "budget":
        return {
          icon: <DollarSign size={18} />,
          badge: "Budget",
          badgeClass:
            "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
          bg: "#4f46e5",
        };
      case "teilzahlung":
        return {
          icon: <TrendingUp size={18} />,
          badge: "Teilzahlung",
          badgeClass:
            "bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100",
          bg: "#16a34a",
        };
      case "dokument":
        return {
          icon: <FileText size={18} />,
          badge: "Dokument",
          badgeClass:
            "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
          bg: "#2563eb",
        };
      case "kontakt":
        return {
          icon: <Briefcase size={18} />,
          badge: "Kontakt",
          badgeClass:
            "bg-teal-100 text-teal-700 dark:bg-teal-700 dark:text-teal-100",
          bg: "#0f766e",
        };
      case "renovierung":
        return {
          icon: <Home size={18} />,
          badge: "Renovierung",
          badgeClass:
            "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
          bg: "#d97706",
        };
      default:
        return {
          icon: <Info size={18} />,
          badge: "Ereignis",
          badgeClass:
            "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100",
          bg: getTailwindColor("accentBlue", theme),
        };
    }
  };

  const renderZusatzTimelineElement = (event, idx) => {
    const meta = getZusatzEventMeta(event.__eventType);
    return (
      <VerticalTimelineElement
        key={`${event.__eventType}-${event.id || idx}`}
        date={formatDateForTimeline(event.__timestamp)}
        iconStyle={{ background: meta.bg, color: "#fff" }}
        icon={meta.icon}
        contentStyle={{
          background: getTailwindColor("cardBg", theme),
          color: getTailwindColor("textMain", theme),
          border: `1px solid ${getTailwindColor("border", theme)}`,
          borderRadius: "0.25rem",
        }}
        contentArrowStyle={{
          borderRight: `7px solid ${getTailwindColor("cardBg", theme)}`,
        }}
        onTimelineElementClick={() => {
          if (event.__link) navigate(event.__link);
        }}
        className={event.__link ? "cursor-pointer" : ""}
      >
        <h3 className="vertical-timeline-element-title text-lg font-semibold">
          {event.title}
        </h3>
        {event.details && (
          <div className="text-xs mt-1 whitespace-pre-line">{event.details}</div>
        )}
        <span
          className={`mt-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badgeClass}`}
        >
          {meta.badge}
        </span>
      </VerticalTimelineElement>
    );
  };

  const angezeigteTimelineElemente = gefilterteEvents.map((event, idx) =>
    event.__eventType === "kiste"
      ? renderKistenTimelineElement(event, idx)
      : event.__eventType === "lieferung"
      ? renderLieferTimelineElement(event, idx)
      : event.__eventType === "aufgabe"
      ? renderTimelineElement(event)
      : renderZusatzTimelineElement(event, idx)
  );

  const timelineGlobalStyles = `
    .vertical-timeline::before { background: ${getTailwindColor(
      "border",
      theme
    )} !important; }
    .vertical-timeline-element-content .vertical-timeline-element-date { color: ${getTailwindColor(
      "textSecondary",
      theme
    )}; padding: .2em 0; }
    .vertical-timeline-element-content h4.vertical-timeline-element-subtitle { color: ${
      theme === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"
    }; }
  `;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4 bg-light-bg dark:bg-canvas-1 min-h-screen">
      <style>{timelineGlobalStyles}</style>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-light-text-main dark:text-dark-text-main flex items-center">
          <CalendarClock
            size={32}
            className="mr-3 text-light-accent-orange dark:text-dark-accent-orange"
          />
          Mein Umzugs-Zeitstrahl
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
          Dein Umzug chronologisch: Aufgaben, Budget, Kisten, Dokumente,
          Kontakte und Renovierung im Zeitverlauf.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleGenerateTagebuch}
            disabled={tagebuchLoading || !isApiKeySetForZeitstrahl}
            className={`px-4 py-2 text-sm font-semibold rounded-pill flex items-center transition-colors
              ${
                tagebuchLoading || !isApiKeySetForZeitstrahl
                  ? theme === "dark"
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : theme === "dark"
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-indigo-500 hover:bg-indigo-600 text-white"
              }`}
            title={
              !isApiKeySetForZeitstrahl
                ? "Bitte zuerst API-Key einrichten"
                : "Tagebuch als PDF generieren"
            }
          >
            <BookOpen size={18} className="mr-2" />
            {tagebuchLoading
              ? "Generiere Tagebuch..."
              : "Tagebuch als PDF generieren"}
          </button>
          {!isApiKeySetForZeitstrahl && !tagebuchLoading && (
            <p className="text-xs text-orange-500 dark:text-orange-400 flex items-center mt-1">
              <InfoIcon size={14} className="mr-1 flex-shrink-0" />
              Für die Tagebuch-Generierung wird ein OpenAI API-Key benötigt.
              Bitte über "API-Key verwalten" einrichten.
            </p>
          )}
          {tagebuchError && (
            <p className="text-red-500 text-xs mt-2">{tagebuchError}</p>
          )}
          <button
            onClick={() => {
              setApiKeyInput(currentApiKey); // Input mit aktuellem Key vorbefüllen
              setShowApiKeyModal(true);
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-pill flex items-center transition-colors ${
              theme === "dark"
                ? "bg-gray-600 hover:bg-gray-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-800"
            }`}
            title="OpenAI API-Key verwalten"
          >
            <KeyRound size={18} className="mr-2" />
            API-Key verwalten
          </button>
          {pdfBereit &&
            generierterTagebuchText &&
            umzugsdatenJSON &&
            !tagebuchLoading &&
            !tagebuchError && (
              <PDFDownloadLink
                document={
                  <TagebuchPDF
                    generierterTagebuchText={generierterTagebuchText}
                    umzugsdatenJSON={umzugsdatenJSON}
                    signedImageUrlsMap={signedImageUrlsMap}
                  />
                }
                fileName="Umzugstagebuch.pdf"
                className={`mt-2 inline-block px-4 py-2 text-sm font-semibold rounded-pill ${
                  theme === "dark"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-green-500 hover:bg-green-600 text-white"
                }`}
              >
                {({ blob, url, loading: pdfLoading, error: pdfError }) =>
                  pdfLoading ? "PDF wird generiert..." : "PDF Herunterladen"
                }
              </PDFDownloadLink>
            )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {eventFilterChips.map((chip) => {
            const count =
              chip.key === "alle"
                ? alleEvents.length
                : eventTypeCounts[chip.key] || 0;
            const isActive = eventFilter === chip.key;

            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setEventFilter(chip.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  isActive
                    ? theme === "dark"
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-orange-500 text-white border-orange-500"
                    : theme === "dark"
                    ? "bg-dark-card-bg text-dark-text-secondary border-dark-border hover:text-dark-text-main"
                    : "bg-light-card-bg text-light-text-secondary border-light-border hover:text-light-text-main"
                }`}
              >
                {chip.label}
                <span className="ml-1 opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </header>
      {angezeigteTimelineElemente.length === 0 && !loading && (
        <div className="text-center py-10 bg-light-card-bg dark:bg-canvas-2 p-6 rounded-card shadow-elevation-2">
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Noch keine Ereignisse vorhanden. Füge Aufgaben, Budgetposten,
            Teilzahlungen, Kisten, Dokumente oder Kontakte hinzu.
          </p>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
            Starte z. B. mit deinen{" "}
            <Link
              to="/todos"
              className="text-light-accent-orange dark:text-dark-accent-orange hover:underline"
            >
              To-Do Listen
            </Link>{" "}
            oder dem{" "}
            <Link
              to="/budget"
              className="text-light-accent-orange dark:text-dark-accent-orange hover:underline"
            >
              Budget
            </Link>
            .
          </p>
        </div>
      )}
      <VerticalTimeline
        lineColor={getTailwindColor("border", theme)}
        layout="2-columns"
      >
        {angezeigteTimelineElemente}
      </VerticalTimeline>
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div
            className={`p-6 rounded-card shadow-elevation-3 w-full max-w-md relative border ${
              theme === "dark"
                ? "dark:bg-canvas-2 border-dark-border"
                : "bg-light-card-bg border-light-border"
            }`}
          >
            <button
              onClick={() => setShowApiKeyModal(false)}
              className={`absolute top-3 right-3 p-1 rounded-full transition-colors ${
                theme === "dark"
                  ? "text-dark-text-secondary hover:bg-dark-border"
                  : "text-light-text-secondary hover:bg-light-border"
              }`}
            >
              <XCircleIcon size={20} />
            </button>
            <h3
              className={`text-lg font-semibold mb-4 ${
                theme === "dark"
                  ? "text-dark-text-main"
                  : "text-light-text-main"
              }`}
            >
              OpenAI API-Key verwalten
            </h3>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="apiKeyInput"
                  className={`block text-sm font-medium mb-1 ${
                    theme === "dark"
                      ? "text-dark-text-secondary"
                      : "text-light-text-secondary"
                  }`}
                >
                  Dein OpenAI API-Key
                </label>
                <input
                  id="apiKeyInput"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    if (apiKeyError) setApiKeyError("");
                  }}
                  placeholder="sk-..."
                  className={`w-full px-3 py-2 border rounded-card-sm text-sm shadow-sm focus:ring-2 focus:ring-secondary-500 ${
                    theme === "dark"
                      ? "bg-dark-input border-dark-border text-dark-text-main focus:border-secondary-500"
                      : "bg-white border-light-border text-light-text-main focus:border-secondary-500"
                  }`}
                />
                {apiKeyError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                    {apiKeyError}
                  </p>
                )}
                <p
                  className={`text-xs mt-2 ${
                    theme === "dark"
                      ? "text-dark-text-disabled"
                      : "text-light-text-disabled"
                  }`}
                >
                  Dein API-Key wird sicher in deinem Benutzerprofil gespeichert
                  und nur für KI-Funktionen verwendet. Du findest deinen Key auf
                  der{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-light-accent-orange dark:text-dark-accent-orange hover:underline"
                  >
                    OpenAI API-Key Seite
                  </a>
                  .
                </p>
              </div>
              <button
                onClick={handleSaveApiKey}
                disabled={apiKeyLoading}
                className={`w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-card-sm shadow-sm text-sm font-medium text-white dark:text-dark-bg transition-colors ${
                  apiKeyLoading
                    ? theme === "dark"
                      ? "bg-gray-500"
                      : "bg-gray-400"
                    : "bg-primary-500 hover:bg-primary-600"
                }`}
              >
                {apiKeyLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save size={18} className="mr-2" />
                    API-Key speichern
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {apiKeyToastMessage.text && (
        <div
          className={`fixed top-5 right-5 p-3 rounded-card-sm shadow-elevation-2 text-sm z-[100] ${
            apiKeyToastMessage.type === "success"
              ? "bg-green-500 text-white"
              : apiKeyToastMessage.type === "error"
              ? "bg-red-500 text-white"
              : "bg-blue-500 text-white"
          }`}
        >
          {apiKeyToastMessage.text}
        </div>
      )}
    </div>
  );
};

export default UmzugsZeitstrahl;
