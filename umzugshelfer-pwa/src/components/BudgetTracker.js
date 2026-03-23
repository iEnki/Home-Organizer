import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom"; // Hinzugefügt
import { supabase } from "../supabaseClient";
import {
  PlusCircle,
  Edit3,
  Trash2,
  XCircle,
  TrendingUp,
  FilePlus,
  DollarSign,
  ShoppingCart,
  Receipt,
  CalendarPlus,
  Download,
} from "lucide-react";
import { formatGermanCurrency } from "../utils/formatUtils";
import { generateIcsData, downloadIcsFile } from "../utils/calendarUtils"; // Hinzugefügt
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren
import useViewport from "../hooks/useViewport";

const budgetKategorieIcons = {
  Transport: {
    icon: <DollarSign size={16} />,
    lightColor: "text-light-accent-purple",
    darkColor: "text-dark-accent-purple",
  },
  Material: {
    icon: <ShoppingCart size={16} />,
    lightColor: "text-primary-500",
    darkColor: "text-primary-400",
  },
  Verpflegung: {
    icon: <Receipt size={16} />,
    lightColor: "text-light-accent-orange",
    darkColor: "text-dark-accent-orange",
  },
  Möbel: {
    icon: <ShoppingCart size={16} />,
    lightColor: "text-purple-600", // Beispiel Light-Mode Farbe
    darkColor: "text-purple-400",
  },
  Geräte: {
    icon: <DollarSign size={16} />,
    lightColor: "text-light-text-secondary",
    darkColor: "text-dark-text-secondary",
  },
  Kaution: {
    icon: <DollarSign size={16} />,
    lightColor: "text-yellow-600", // Beispiel Light-Mode Farbe
    darkColor: "text-yellow-400",
  },
  Makler: {
    icon: <DollarSign size={16} />,
    lightColor: "text-red-600", // Beispiel Light-Mode Farbe
    darkColor: "text-red-400",
  },
  Sonstiges: {
    icon: <DollarSign size={16} />,
    lightColor: "text-light-text-secondary",
    darkColor: "text-dark-text-secondary",
  },
};

const getBudgetKategorieIcon = (kategorie, theme) => {
  const meta =
    budgetKategorieIcons[kategorie] || budgetKategorieIcons.Sonstiges;
  const iconColor = theme === "dark" ? meta.darkColor : meta.lightColor;
  return React.cloneElement(meta.icon, { className: iconColor });
};

const budgetKategorienFürFilter = [
  "Alle",
  ...Object.keys(budgetKategorieIcons),
];

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateInputValue = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return getLocalDateInputValue(parsedDate);
};

const formatDateForDisplay = (value) => {
  const normalizedValue = normalizeDateInputValue(value);
  if (!normalizedValue) return "";

  const [year, month, day] = normalizedValue.split("-").map(Number);
  if (!year || !month || !day) return normalizedValue;

  return new Date(year, month - 1, day).toLocaleDateString("de-DE");
};

const BudgetTracker = ({ session }) => {
  const { isMobile } = useViewport();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme(); // Theme aus Context holen

  const [posten, setPosten] = useState([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState("Transport"); // Standard-Kategorie
  const [geplanterBetrag, setGeplanterBetrag] = useState("");
  const [datum, setDatum] = useState(getLocalDateInputValue());
  const [lieferdatum, setLieferdatum] = useState("");
  const [bereitsBezahlt, setBereitsBezahlt] = useState("");
  const [vollBezahlt, setVollBezahlt] = useState(false);
  // const [typ, setTyp] = useState("Ausgabe"); // Entfernt, da nicht mehr verwendet
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPostenId, setEditingPostenId] = useState(null);
  const [gesamtbudget, setGesamtbudget] = useState(0);
  const [neuesGesamtbudget, setNeuesGesamtbudget] = useState("");
  const [budgetAusgegeben, setBudgetAusgegeben] = useState(0);
  const [showPostenModal, setShowPostenModal] = useState(false);
  const [showTeilzahlungModalFor, setShowTeilzahlungModalFor] = useState(null);
  const [teilzahlungBetrag, setTeilzahlungBetrag] = useState("");
  const [teilzahlungDatum, setTeilzahlungDatum] = useState(
    getLocalDateInputValue()
  );
  const [teilzahlungNotiz, setTeilzahlungNotiz] = useState("");
  const userId = session?.user?.id;
  const [filterKategorie, setFilterKategorie] = useState("Alle");

  const resetForm = () => {
    setBeschreibung("");
    setKategorie("Transport");
    setGeplanterBetrag("");
    setDatum(getLocalDateInputValue());
    setLieferdatum("");
    setBereitsBezahlt("");
    setVollBezahlt(false);
    // setTyp("Ausgabe"); // Entfernt
    setEditingPostenId(null);
    setShowPostenModal(false);
  };

  const fetchUserData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setPosten([]);
      setGesamtbudget(0);
      setNeuesGesamtbudget("");
      setBudgetAusgegeben(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: postenData, error: postenError } = await supabase
        .from("budget_posten")
        .select("*, teilzahlungen:budget_teilzahlungen(*)")
        .eq("user_id", userId)
        .order("datum", { ascending: false });
      if (postenError) throw postenError;
      setPosten(postenData || []);

      const { data: profileData, error: profileError } = await supabase
        .from("user_profile")
        .select("gesamtbudget")
        .eq("id", userId)
        .single();

      if (profileData) {
        const budgetValue = profileData.gesamtbudget || 0;
        setGesamtbudget(budgetValue);
        setNeuesGesamtbudget(budgetValue.toString());
      } else if (profileError && profileError.code !== "PGRST116") {
        // Error other than "no rows found"
        console.warn("Fehler User-Profil:", profileError);
        const savedBudget = localStorage.getItem(
          `umzugsBudgetGesamt_${userId}`
        );
        const budgetValue = savedBudget ? parseFloat(savedBudget) : 0;
        setGesamtbudget(budgetValue);
        setNeuesGesamtbudget(budgetValue === 0 ? "" : budgetValue.toString());
      } else {
        // No profile or no budget set, try localStorage
        const savedBudget = localStorage.getItem(
          `umzugsBudgetGesamt_${userId}`
        );
        const budgetValue = savedBudget ? parseFloat(savedBudget) : 0;
        setGesamtbudget(budgetValue);
        setNeuesGesamtbudget(budgetValue === 0 ? "" : budgetValue.toString());
      }

      let totalAusgegeben = 0;
      if (postenData) {
        postenData.forEach((p) => {
          totalAusgegeben += (p.teilzahlungen || []).reduce(
            (s, tz) => s + parseFloat(tz.betrag_teilzahlung || 0),
            0
          );
        });
      }
      setBudgetAusgegeben(totalAusgegeben);
    } catch (err) {
      console.error("Fehler Budget-Daten:", err);
      setError("Budget-Daten nicht geladen.");
    } finally {
      setLoading(false);
    }
  }, [userId]); // neuesGesamtbudget entfernt um Loop zu vermeiden

  useEffect(() => {
    if (userId) fetchUserData();
    else {
      setPosten([]);
      setGesamtbudget(0);
      setNeuesGesamtbudget("");
      setBudgetAusgegeben(0);
      setLoading(false);
    }
  }, [userId, fetchUserData]);

  // NEU: Effekt zum Verarbeiten von übergebenen Budget-Items
  useEffect(() => {
    if (location.state?.neuesBudgetItem) {
      const {
        beschreibung: itemDesc,
        betrag,
        kategorie: itemKat,
        // typ: itemTyp, // 'typ' wird nicht mehr verwendet
        datum: itemDatum,
      } = location.state.neuesBudgetItem;
      setBeschreibung(itemDesc || "");
      setGeplanterBetrag(betrag ? betrag.toString() : "");
      setKategorie(itemKat || "Sonstiges");
      // setTyp(itemTyp || "Ausgabe"); // Entfernt
      setDatum(
        itemDatum ? normalizeDateInputValue(itemDatum) : getLocalDateInputValue()
      );
      setLieferdatum(""); // Lieferdatum ist nicht Teil des übergebenen Objekts
      setBereitsBezahlt("");
      setVollBezahlt(false);
      setEditingPostenId(null); // Sicherstellen, dass es ein neuer Posten ist
      setShowPostenModal(true); // Formular direkt öffnen

      // State zurücksetzen, um erneutes Ausfüllen zu verhindern
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]); // location.pathname hinzugefügt

  const handleGesamtbudgetSpeichern = async (e) => {
    e.preventDefault();
    if (!userId) {
      alert("Bitte einloggen.");
      return;
    }
    const neuesBudgetFloat = parseFloat(neuesGesamtbudget);
    if (!isNaN(neuesBudgetFloat) && neuesBudgetFloat >= 0) {
      try {
        const { error: upsertError } = await supabase
          .from("user_profile")
          .upsert(
            {
              id: userId,
              gesamtbudget: neuesBudgetFloat,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        if (upsertError) throw upsertError;
        setGesamtbudget(neuesBudgetFloat);
        localStorage.setItem(
          `umzugsBudgetGesamt_${userId}`,
          neuesBudgetFloat.toString()
        );
        alert("Gesamtbudget gespeichert!");
      } catch (err) {
        console.error("Fehler Speichern Gesamtbudget:", err);
        alert("Fehler Speichern Gesamtbudget.");
      }
    } else if (neuesGesamtbudget === "") {
      // Allow setting to 0 by clearing input
      try {
        await supabase.from("user_profile").upsert(
          {
            id: userId,
            gesamtbudget: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        setGesamtbudget(0);
        localStorage.setItem(`umzugsBudgetGesamt_${userId}`, "0");
        alert("Gesamtbudget auf 0 gesetzt!");
      } catch (err) {
        console.error("Fehler Setzen Gesamtbudget 0:", err);
        alert("Fehler Setzen Gesamtbudget 0.");
      }
    } else {
      alert("Gültigen Betrag eingeben.");
    }
  };

  const handleEditPostenClick = (item) => {
    const summeBisherGezahlt = (item.teilzahlungen || []).reduce(
      (s, tz) => s + parseFloat(tz.betrag_teilzahlung || 0),
      0
    );
    const geplanterBetragWert = parseFloat(item.betrag || 0);
    setEditingPostenId(item.id);
    setBeschreibung(item.beschreibung);
    setKategorie(item.kategorie);
    setGeplanterBetrag(item.betrag.toString());
    setDatum(normalizeDateInputValue(item.datum) || getLocalDateInputValue());
    setLieferdatum(normalizeDateInputValue(item.lieferdatum));
    setBereitsBezahlt(
      summeBisherGezahlt > 0 ? summeBisherGezahlt.toString() : ""
    );
    setVollBezahlt(summeBisherGezahlt >= geplanterBetragWert);
    // setTyp(item.typ || "Ausgabe"); // Entfernt, da 'typ' nicht mehr im State ist und in 'item' nicht existieren sollte
    setShowPostenModal(true);
  };

  const handleAddNewPostenClick = () => {
    if (!userId) {
      alert("Bitte einloggen.");
      return;
    }
    resetForm();
    setEditingPostenId(null);
    setShowPostenModal(true);
  };

  const handleSubmitPosten = async (e) => {
    e.preventDefault();
    if (!userId) {
      alert("Nicht eingeloggt.");
      return;
    }
    const normalizedDatum = normalizeDateInputValue(datum);
    if (!beschreibung || !geplanterBetrag || !normalizedDatum) {
      alert("Beschreibung, Betrag, Datum Pflicht.");
      return;
    }
    const geplanterBetragWert = parseFloat(geplanterBetrag);
    const bereitsBezahltWert = parseFloat(
      vollBezahlt ? geplanterBetrag : bereitsBezahlt
    );
    const initialBezahlt = isNaN(bereitsBezahltWert) ? 0 : bereitsBezahltWert;

    if (!editingPostenId) {
      if (initialBezahlt < 0) {
        alert("Bereits bezahlt darf nicht negativ sein.");
        return;
      }
      if (initialBezahlt > geplanterBetragWert) {
        alert("Bereits bezahlt darf den geplanten Betrag nicht überschreiten.");
        return;
      }
    }
    // Smarte Budget-Warnung: prüfe ob neuer Posten Budget überschreiten würde
    if (!editingPostenId && gesamtbudget > 0) {
      const aktuelleGesamtplanung = posten.reduce(
        (sum, p) => sum + parseFloat(p.betrag || 0),
        0
      );
      const neueGesamtplanung = aktuelleGesamtplanung + geplanterBetragWert;
      if (neueGesamtplanung > gesamtbudget) {
        const ueberschreitung = neueGesamtplanung - gesamtbudget;
        const bestaetigt = window.confirm(
          `Warnung: Mit diesem Posten (${formatGermanCurrency(geplanterBetragWert)} €) werden die geplanten Gesamtkosten (${formatGermanCurrency(neueGesamtplanung)} €) dein Budget von ${formatGermanCurrency(gesamtbudget)} € um ${formatGermanCurrency(ueberschreitung)} € überschreiten.\n\nTrotzdem hinzufügen?`
        );
        if (!bestaetigt) return;
      } else if (neueGesamtplanung > gesamtbudget * 0.9) {
        window.alert(
          `Hinweis: Nach diesem Posten sind ${Math.round((neueGesamtplanung / gesamtbudget) * 100)}% deines Budgets verplant (${formatGermanCurrency(neueGesamtplanung)} € von ${formatGermanCurrency(gesamtbudget)} €).`
        );
      }
    }

    const postenDaten = {
      beschreibung,
      kategorie,
      betrag: geplanterBetragWert,
      datum: normalizedDatum,
      lieferdatum: normalizeDateInputValue(lieferdatum) || null,
      user_id: userId,
    };
    try {
      if (editingPostenId) {
        const { error } = await supabase
          .from("budget_posten")
          .update(postenDaten)
          .match({ id: editingPostenId, user_id: userId });
        if (error) throw error;
      } else {
        const { data: insertedPosten, error: insertError } = await supabase
          .from("budget_posten")
          .insert([postenDaten])
          .select("id")
          .single();
        if (insertError) throw insertError;

        if (initialBezahlt > 0 && insertedPosten?.id) {
          const { error: teilzahlungError } = await supabase
            .from("budget_teilzahlungen")
            .insert([
                {
                  user_id: userId,
                  posten_id: insertedPosten.id,
                  betrag_teilzahlung: initialBezahlt,
                  datum_teilzahlung: getLocalDateInputValue(),
                  notiz_teilzahlung: "Initialzahlung bei Erstellung",
                },
              ]);

          if (teilzahlungError) {
            await supabase
              .from("budget_posten")
              .delete()
              .match({ id: insertedPosten.id, user_id: userId });
            throw teilzahlungError;
          }
        }
      }
      await fetchUserData();
      resetForm();
    } catch (err) {
      console.error(`Fehler Speichern Posten: ${err.message}`);
      alert(`Fehler Speichern Posten: ${err.message}`);
    }
  };

  const handleDeletePosten = async (id) => {
    if (!userId) return;
    if (!window.confirm("Posten & Teilzahlungen löschen?")) return;
    try {
      await supabase
        .from("budget_teilzahlungen")
        .delete()
        .match({ posten_id: id, user_id: userId });
      const { error } = await supabase
        .from("budget_posten")
        .delete()
        .match({ id, user_id: userId });
      if (error) throw error;
      fetchUserData();
    } catch (err) {
      console.error(`Fehler Löschen Posten: ${err.message}`);
      alert(`Fehler Löschen Posten: ${err.message}`);
    }
  };

  const openTeilzahlungModal = (postId) => {
    if (!userId) return;
    setTeilzahlungBetrag("");
    setTeilzahlungDatum(getLocalDateInputValue());
    setTeilzahlungNotiz("");
    setShowTeilzahlungModalFor(postId);
  };

  const handleAddTeilzahlung = async (e) => {
    e.preventDefault();
    if (!userId) return;
    if (!showTeilzahlungModalFor || !teilzahlungBetrag || !teilzahlungDatum) {
      alert("Betrag & Datum Pflicht.");
      return;
    }
    try {
      const { error } = await supabase.from("budget_teilzahlungen").insert([
        {
          posten_id: showTeilzahlungModalFor,
          betrag_teilzahlung: parseFloat(teilzahlungBetrag),
          datum_teilzahlung: teilzahlungDatum,
          notiz_teilzahlung: teilzahlungNotiz || null,
          user_id: userId,
        },
      ]);
      if (error) throw error;
      fetchUserData();
      setShowTeilzahlungModalFor(null);
    } catch (err) {
      console.error(`Fehler Hinzufügen Teilzahlung: ${err.message}`);
      alert(`Fehler Hinzufügen Teilzahlung: ${err.message}`);
    }
  };

  const handleDeleteTeilzahlung = async (teilzahlungId) => {
    if (!userId) return;
    if (!window.confirm("Teilzahlung löschen?")) return;
    try {
      const { error } = await supabase
        .from("budget_teilzahlungen")
        .delete()
        .match({ id: teilzahlungId, user_id: userId });
      if (error) throw error;
      fetchUserData();
    } catch (err) {
      console.error("Fehler Löschen Teilzahlung:", err);
      alert(`Fehler Löschen Teilzahlung: ${err.message}`);
    }
  };

  const berechneSummeTeilzahlungen = (tzArray) =>
    (tzArray || []).reduce(
      (s, item) => s + parseFloat(item.betrag_teilzahlung || 0),
      0
    );

  const restbudget = gesamtbudget - budgetAusgegeben;
  const budgetNutzungProzent =
    gesamtbudget > 0 ? (budgetAusgegeben / gesamtbudget) * 100 : 0;
  const handleBudgetFilterChange = (kategorie) => setFilterKategorie(kategorie);
  const gefiltertePosten = posten.filter(
    (p) => filterKategorie === "Alle" || p.kategorie === filterKategorie
  );

  // Ansicht-Modus: "karten" (Standard) oder "liste"
  const [ansichtModus, setAnsichtModus] = useState("karten");

  useEffect(() => {
    if (isMobile && ansichtModus !== "karten") {
      setAnsichtModus("karten");
    }
  }, [isMobile, ansichtModus]);

  const handleCsvExport = () => {
    const bom = "\uFEFF";
    const header = ["Beschreibung", "Kategorie", "Geplanter Betrag (€)", "Fälligkeitsdatum", "Lieferdatum", "Teilzahlungen Summe (€)", "Offen (€)"];
    const rows = posten.map((p) => {
      const teilsumme = berechneSummeTeilzahlungen(p.teilzahlungen);
      const offen = parseFloat(p.betrag || 0) - teilsumme;
      return [
        `"${(p.beschreibung || "").replace(/"/g, '""')}"`,
        `"${p.kategorie || ""}"`,
        String(parseFloat(p.betrag || 0).toFixed(2)).replace(".", ","),
        p.datum || "",
        p.lieferdatum || "",
        String(teilsumme.toFixed(2)).replace(".", ","),
        String(offen.toFixed(2)).replace(".", ","),
      ].join(";");
    });
    const csvContent = bom + [header.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `budget_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportLieferterminToIcs = async (item) => {
    if (!item.lieferdatum) {
      alert(
        "Dieser Posten hat kein Lieferdatum und kann nicht exportiert werden."
      );
      return;
    }

    const normalizedLieferdatum = normalizeDateInputValue(item.lieferdatum);
    if (!normalizedLieferdatum) {
      alert("Ungültiges Lieferdatum. Bitte Datum im Budgetposten prüfen.");
      return;
    }
    const dateParts = normalizedLieferdatum.split("-").map(Number); // YYYY-MM-DD

    const eventDetails = {
      title: `Lieferung: ${item.beschreibung}`,
      // Start am Lieferdatum um 00:00 Uhr, Dauer 1 Tag (ganztägig)
      start: [dateParts[0], dateParts[1], dateParts[2], 0, 0],
      duration: { days: 1 },
      description: `Lieferung für Budgetposten: ${
        item.beschreibung
      }\nKategorie: ${item.kategorie}\nGeplanter Betrag: ${formatGermanCurrency(
        item.betrag
      )} €`,
      uid: `budget-lieferung-${item.id}@umzugshelfer.app`,
    };

    const icsData = await generateIcsData(eventDetails);
    if (icsData) {
      downloadIcsFile(icsData, `Lieferung_${item.beschreibung}`);
    } else {
      alert("Fehler beim Erstellen der iCalendar-Datei für den Liefertermin.");
    }
  };

  if (loading && !posten.length && gesamtbudget === 0 && userId)
    return (
      <div className="text-center py-8">
        <p className="text-light-text-secondary dark:text-dark-text-secondary">
          Lade Budget-Tracker...
        </p>
      </div>
    );
  if (error)
    return (
      <div className="text-center py-8">
        <p className="text-danger-color">{error}</p>
      </div>
    );
  if (!userId && !loading)
    return (
      <div className="text-center py-8">
        <p className="text-light-text-secondary dark:text-dark-text-secondary">
          Bitte einloggen.
        </p>
      </div>
    );

  // Neue Summen für Übersicht
  const geplanteGesamtkosten = posten.reduce(
    (sum, p) => sum + parseFloat(p.betrag || 0),
    0
  );
  const gesamtTeilzahlungen = posten.reduce(
    (sum, p) => sum + berechneSummeTeilzahlungen(p.teilzahlungen),
    0
  );
  const gesamtOffen = geplanteGesamtkosten - gesamtTeilzahlungen;

  // Ausgaben-Prognose: durchschnittliche tägliche Ausgaben berechnen
  const berechnePrognose = () => {
    const alleTeilzahlungen = posten.flatMap((p) => p.teilzahlungen || []);
    if (alleTeilzahlungen.length < 2 || gesamtbudget <= 0) return null;
    const datierte = alleTeilzahlungen
      .filter((tz) => tz.datum_teilzahlung)
      .map((tz) => ({ datum: new Date(tz.datum_teilzahlung), betrag: parseFloat(tz.betrag_teilzahlung || 0) }))
      .sort((a, b) => a.datum - b.datum);
    if (datierte.length < 2) return null;
    const ersteDatum = datierte[0].datum;
    const heute = new Date();
    const tage = Math.max(1, Math.ceil((heute - ersteDatum) / (1000 * 60 * 60 * 24)));
    const durchschnittProTag = gesamtTeilzahlungen / tage;
    if (durchschnittProTag <= 0) return null;
    const restBudget = gesamtbudget - gesamtTeilzahlungen;
    if (restBudget <= 0) return { ueberschritten: true };
    const tageVerbleibend = Math.ceil(restBudget / durchschnittProTag);
    const prognoseDatum = new Date(heute);
    prognoseDatum.setDate(prognoseDatum.getDate() + tageVerbleibend);
    return {
      ueberschritten: false,
      durchschnittProTag,
      tageVerbleibend,
      prognoseDatum,
    };
  };
  const prognose = berechnePrognose();

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <h2 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main mb-4">
        Budget-Tracker
      </h2>
      {/* Neue Gesamtzahlen-Übersicht */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-light-card-bg dark:bg-canvas-2 p-3 rounded-card border border-light-border dark:border-dark-border text-center">
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Geplante Gesamtkosten
          </p>
          <p className="text-xl font-bold text-primary-500">
            {formatGermanCurrency(geplanteGesamtkosten)} €
          </p>
        </div>
        <div className="bg-light-card-bg dark:bg-canvas-2 p-3 rounded-card border border-light-border dark:border-dark-border text-center">
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Getätigte Teilzahlungen
          </p>
          <p className="text-xl font-bold text-light-accent-purple dark:text-dark-accent-purple">
            {formatGermanCurrency(gesamtTeilzahlungen)} €
          </p>
        </div>
        <div className="bg-light-card-bg dark:bg-canvas-2 p-3 rounded-card border border-light-border dark:border-dark-border text-center">
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            Noch offene Zahlungen
          </p>
          <p
            className={`text-xl font-bold ${
              gesamtOffen < 0
                ? "text-danger-color"
                : "text-light-accent-orange dark:text-dark-accent-orange"
            }`}
          >
            {formatGermanCurrency(gesamtOffen)} €
          </p>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-1/3 space-y-4">
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-2 border border-light-border dark:border-dark-border">
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-3">
              Gesamtbudget
            </h3>
            <form onSubmit={handleGesamtbudgetSpeichern} className="space-y-3">
              <div>
                <label
                  htmlFor="gesamtbudgetEingabe"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Dein Budget (€)
                </label>
                <input
                  type="number"
                  id="gesamtbudgetEingabe"
                  value={neuesGesamtbudget}
                  onChange={(e) => setNeuesGesamtbudget(e.target.value)}
                  disabled={!userId}
                  step="0.01"
                  placeholder="z.B. 15000"
                  className="w-full px-2.5 py-1.5 border border-light-border dark:border-dark-border rounded-card-sm text-sm shadow-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={!userId}
                className="w-full bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-pill shadow hover:opacity-90 text-sm disabled:opacity-50"
              >
                Speichern
              </button>
            </form>
          </div>
          <button
            onClick={handleAddNewPostenClick}
            disabled={!userId}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-pill shadow hover:opacity-90 flex items-center justify-center space-x-1.5 disabled:opacity-50 text-sm"
          >
            <PlusCircle size={18} /> <span>Neuer Kostenposten</span>
          </button>
          <button
            onClick={handleCsvExport}
            disabled={!userId || posten.length === 0}
            className="w-full bg-light-border dark:bg-dark-border text-light-text-main dark:text-dark-text-main px-3 py-2 rounded-pill shadow hover:opacity-80 flex items-center justify-center space-x-1.5 disabled:opacity-40 text-sm"
            title="Alle Kostenposten als CSV herunterladen"
          >
            <Download size={18} /> <span>CSV exportieren</span>
          </button>
        </div>

        <div className="lg:w-2/3 space-y-4">
          {/* Budget-Übersicht entfernt, stattdessen neue Gesamtbudget-Box */}
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-2 border border-light-border dark:border-dark-border mb-4">
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-2">
              Gesamtbudget
            </h3>
            <div className="flex flex-col items-center mb-2">
              <span className="text-3xl font-extrabold text-primary-500 tracking-tight">
                {formatGermanCurrency(gesamtbudget)} €
              </span>
              <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                (manuell gespeichert)
              </span>
            </div>
            {gesamtbudget > 0 && (
              <div className="w-full mt-2 mb-1 relative">
                {/* Moderner, animierter, farbiger Balken */}
                <div
                  className="w-full h-5 rounded-full bg-gradient-to-r from-light-border via-light-border to-light-border dark:from-dark-border dark:via-dark-border dark:to-dark-border shadow-inner relative overflow-hidden"
                  style={{
                    boxShadow:
                      "0 1px 6px 0 rgba(0,0,0,0.07), 0 1.5px 3px 0 rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    className="h-5 rounded-full absolute left-0 top-0 transition-all duration-700"
                    style={{
                      width: `${Math.min(budgetNutzungProzent, 100)}%`,
                      background:
                        budgetNutzungProzent > 100
                          ? "linear-gradient(90deg, #ef4444 0%, #f87171 100%)"
                          : budgetNutzungProzent > 80
                          ? "linear-gradient(90deg, #f59e42 0%, #f97316 100%)"
                          : "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)",
                      boxShadow:
                        budgetNutzungProzent > 100
                          ? "0 0 8px 2px #ef4444"
                          : budgetNutzungProzent > 80
                          ? "0 0 8px 2px #f59e42"
                          : "0 0 8px 2px #22c55e",
                    }}
                  ></div>
                  {/* Werte als Overlay */}
                  <div
                    className="absolute left-0 top-0 w-full h-5 flex items-center justify-between px-3 pointer-events-none"
                    style={{
                      zIndex: 2,
                      fontWeight: 600,
                      fontSize: "0.95em",
                      color:
                        budgetNutzungProzent > 100
                          ? "#fff"
                          : theme === "dark"
                          ? "#fff"
                          : "#222",
                      textShadow:
                        "0 1px 2px rgba(0,0,0,0.12), 0 0.5px 1px rgba(0,0,0,0.10)",
                    }}
                  >
                    <span>
                      {formatGermanCurrency(budgetAusgegeben)} € verbraucht
                    </span>
                    <span>{Math.round(budgetNutzungProzent)}%</span>
                    <span>{formatGermanCurrency(gesamtbudget)} € gesamt</span>
                  </div>
                </div>
                {/* Kleine Legende darunter */}
                <div className="flex justify-between text-xs mt-1 px-1">
                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                    0 €
                  </span>
                  <span
                    className={`font-semibold ${
                      restbudget < 0
                        ? "text-danger-color"
                        : "text-primary-500"
                    }`}
                  >
                    {formatGermanCurrency(gesamtbudget)} €
                  </span>
                </div>
              </div>
            )}
            {/* Prognose-Abschnitt */}
            {prognose && (
              <div className={`mt-3 p-2.5 rounded-card-sm text-xs ${
                prognose.ueberschritten
                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                  : prognose.tageVerbleibend < 14
                  ? "bg-orange-500/10 border border-orange-500/30 text-orange-400"
                  : "bg-light-border dark:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary"
              }`}>
                {prognose.ueberschritten ? (
                  <span>Budget bereits überschritten.</span>
                ) : (
                  <span>
                    Ø {formatGermanCurrency(prognose.durchschnittProTag)} €/Tag ausgegeben.
                    {" "}Bei aktuellem Tempo läuft das Budget in ca. <strong>{prognose.tageVerbleibend} Tagen</strong> ({prognose.prognoseDatum.toLocaleDateString("de-DE")}) aus.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-2 border border-light-border dark:border-dark-border">
            <div className="flex flex-col sm:flex-row justify-between items-baseline mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main">
                  Kostenaufstellung
                </h3>
                {/* Ansicht-Umschalter */}
                <button
                  className={`ml-2 px-2 py-0.5 text-xs rounded-card-sm font-medium ${
                    ansichtModus === "karten"
                      ? "bg-primary-500 hover:bg-primary-600 text-white"
                      : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary"
                  }`}
                  onClick={() => setAnsichtModus("karten")}
                  title="Kartenansicht"
                >
                  Karten
                </button>
                {!isMobile && (
                  <button
                    className={`px-2 py-0.5 text-xs rounded-card-sm font-medium ${
                      ansichtModus === "liste"
                        ? "bg-primary-500 hover:bg-primary-600 text-white"
                        : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary"
                    }`}
                    onClick={() => setAnsichtModus("liste")}
                    title="Listenansicht"
                  >
                    Liste
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-1 sm:mt-0">
                {budgetKategorienFürFilter.map((kat) => {
                  // Farben für Kategorie-Buttons
                  let bg = "bg-light-border";
                  let text = "text-light-text-secondary";
                  let bgDark = "dark:bg-dark-border";
                  let textDark = "dark:text-dark-text-secondary";
                  if (filterKategorie === kat) {
                    if (kat === "Alle") {
                      bg = "bg-primary-500";
                      text = "text-white";
                      bgDark = "dark:bg-primary-600";
                      textDark = "dark:text-white";
                    } else if (kat === "Transport") {
                      bg = "bg-blue-600";
                      text = "text-white";
                      bgDark = "dark:bg-blue-500";
                      textDark = "dark:text-white";
                    } else if (kat === "Material") {
                      bg = "bg-green-700";
                      text = "text-white";
                      bgDark = "dark:bg-green-500";
                      textDark = "dark:text-white";
                    } else if (kat === "Verpflegung") {
                      bg = "bg-orange-600";
                      text = "text-white";
                      bgDark = "dark:bg-orange-400";
                      textDark = "dark:text-white";
                    } else if (kat === "Neue Möbel" || kat === "Möbel") {
                      bg = "bg-yellow-600";
                      text = "text-white";
                      bgDark = "dark:bg-yellow-400";
                      textDark = "dark:text-gray-900";
                    } else if (kat === "Kaution") {
                      bg = "bg-cyan-700";
                      text = "text-white";
                      bgDark = "dark:bg-cyan-400";
                      textDark = "dark:text-gray-900";
                    } else if (kat === "Makler") {
                      bg = "bg-red-600";
                      text = "text-white";
                      bgDark = "dark:bg-red-400";
                      textDark = "dark:text-white";
                    } else if (kat === "Geräte") {
                      bg = "bg-cyan-800";
                      text = "text-white";
                      bgDark = "dark:bg-cyan-400";
                      textDark = "dark:text-gray-900";
                    } else if (kat === "Sonstiges") {
                      bg = "bg-blue-800";
                      text = "text-white";
                      bgDark = "dark:bg-blue-400";
                      textDark = "dark:text-white";
                    }
                  }
                  return (
                    <button
                      key={kat}
                      onClick={() => handleBudgetFilterChange(kat)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-card-sm shadow-sm transition-colors duration-150
                        ${bg} ${text} ${bgDark} ${textDark}
                        ${
                          filterKategorie === kat
                            ? ""
                            : "hover:bg-gray-200 dark:hover:bg-gray-700"
                        }
                      `}
                      style={
                        filterKategorie === kat
                          ? { boxShadow: "0 1px 4px 0 rgba(0,0,0,0.08)" }
                          : undefined
                      }
                    >
                      {kat}
                    </button>
                  );
                })}
              </div>
            </div>
            {gefiltertePosten.length === 0 && !loading && (
              <p className="text-center text-light-text-secondary dark:text-dark-text-secondary py-6 text-sm">
                {filterKategorie !== "Alle"
                  ? "Keine Posten für Kategorie."
                  : "Keine Kostenposten."}
              </p>
            )}
            {/* Kompakte Listenansicht */}
            {ansichtModus === "liste" ? (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-light-border dark:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary">
                      <th className="px-2 py-1 font-semibold">Beschreibung</th>
                      <th className="px-2 py-1 font-semibold">Kategorie</th>
                      <th className="px-2 py-1 font-semibold">Geplant (€)</th>
                      <th className="px-2 py-1 font-semibold">Bezahlt (€)</th>
                      <th className="px-2 py-1 font-semibold">Offen (€)</th>
                      <th className="px-2 py-1 font-semibold">Fällig</th>
                      <th className="px-2 py-1 font-semibold">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gefiltertePosten.length === 0 && !loading ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-center py-4 text-light-text-secondary dark:text-dark-text-secondary"
                        >
                          {filterKategorie !== "Alle"
                            ? "Keine Posten für Kategorie."
                            : "Keine Kostenposten."}
                        </td>
                      </tr>
                    ) : (
                      gefiltertePosten.map((p) => {
                        const summeBisherGezahlt = berechneSummeTeilzahlungen(
                          p.teilzahlungen
                        );
                        const nochOffen =
                          parseFloat(p.betrag) - summeBisherGezahlt;
                        const istVollBezahlt = nochOffen <= 0.001;
                        return (
                          <tr
                            key={p.id}
                            className="border-b border-light-border dark:border-dark-border hover:bg-light-border/30 dark:hover:bg-dark-border/30"
                          >
                            <td className="px-2 py-1 font-medium text-light-text-main dark:text-dark-text-main">
                              {p.beschreibung}
                            </td>
                            <td
                              className="px-2 py-1 font-semibold"
                              style={{
                                color:
                                  theme === "dark"
                                    ? p.kategorie === "Transport"
                                      ? "#2563eb"
                                      : p.kategorie === "Material"
                                      ? "#16a34a"
                                      : p.kategorie === "Verpflegung"
                                      ? "#ea580c"
                                      : p.kategorie === "Neue Möbel"
                                      ? "#fde047"
                                      : p.kategorie === "Kaution"
                                      ? "#14b8a6"
                                      : p.kategorie === "Makler"
                                      ? "#dc2626"
                                      : "#2563eb"
                                    : p.kategorie === "Transport"
                                    ? "#1d4ed8" // Dunkles Blau
                                    : p.kategorie === "Material"
                                    ? "#15803d" // Dunkles Grün
                                    : p.kategorie === "Verpflegung"
                                    ? "#ea580c" // Kräftiges Orange
                                    : p.kategorie === "Neue Möbel"
                                    ? "#ca8a04" // Dunkles Gelb
                                    : p.kategorie === "Kaution"
                                    ? "#0e7490" // Dunkles Türkis
                                    : p.kategorie === "Makler"
                                    ? "#dc2626" // Kräftiges Rot
                                    : "#0e7490", // Sonstiges: Dunkles Türkis
                              }}
                            >
                              {p.kategorie}
                            </td>
                            <td
                              className="px-2 py-1 text-right font-semibold"
                              style={{ color: "#dc2626" }}
                            >
                              {formatGermanCurrency(p.betrag)}
                            </td>
                            <td
                              className="px-2 py-1 text-right font-semibold"
                              style={{ color: "#16a34a" }}
                            >
                              {formatGermanCurrency(summeBisherGezahlt)}
                            </td>
                            <td
                              className={`px-2 py-1 text-right ${
                                istVollBezahlt
                                  ? "text-primary-500"
                                  : "text-danger-color"
                              }`}
                            >
                              {formatGermanCurrency(nochOffen)}
                            </td>
                            <td
                              className="px-2 py-1"
                              style={{
                                color:
                                  theme === "dark"
                                    ? "#9ca3af" // text-dark-text-secondary
                                    : "#374151", // text-light-text-secondary
                              }}
                            >
                              {formatDateForDisplay(p.datum)}
                              {p.lieferdatum &&
                                ` / ${formatDateForDisplay(p.lieferdatum)}`}
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openTeilzahlungModal(p.id)}
                                  disabled={!userId}
                                  title="Teilzahlung"
                                  className="p-1 text-primary-500 dark:text-primary-400 hover:opacity-80 rounded"
                                >
                                  <FilePlus size={13} />
                                </button>
                                <button
                                  onClick={() => handleEditPostenClick(p)}
                                  disabled={!userId}
                                  title="Bearbeiten"
                                  className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400 rounded"
                                >
                                  <Edit3 size={13} />
                                </button>
                                {p.lieferdatum && (
                                  <button
                                    onClick={() =>
                                      handleExportLieferterminToIcs(p)
                                    }
                                    title="Liefertermin als Kalendereintrag exportieren"
                                    className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 dark:hover:text-blue-400 rounded"
                                  >
                                    <CalendarPlus size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeletePosten(p.id)}
                                  disabled={!userId}
                                  title="Löschen"
                                  className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color rounded"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3">
                {gefiltertePosten.map((p) => {
                  const summeBisherGezahlt = berechneSummeTeilzahlungen(
                    p.teilzahlungen
                  );
                  const nochOffen = parseFloat(p.betrag) - summeBisherGezahlt;
                  const istVollBezahlt = nochOffen <= 0.001;
                  const itemIcon = getBudgetKategorieIcon(p.kategorie, theme);
                  return (
                    <div
                      key={p.id}
                      className="border border-light-border dark:border-dark-border p-3 rounded-card-sm hover:shadow-sm transition-shadow bg-gray-50 dark:bg-canvas-1/30"
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                        <div className="flex items-start space-x-2 flex-grow">
                          <span className="mt-0.5">{itemIcon}</span>
                          <div>
                            <h4 className="text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                              {p.beschreibung}
                            </h4>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              {p.kategorie} - Geplant:{" "}
                              {formatGermanCurrency(p.betrag)} €
                            </p>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              Fällig:{" "}
                              {formatDateForDisplay(p.datum)}
                              {p.lieferdatum &&
                                ` / Lieferung: ${formatDateForDisplay(
                                  p.lieferdatum
                                )}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center space-x-0.5 self-start sm:self-center mt-1 sm:mt-0">
                          <button
                            onClick={() => openTeilzahlungModal(p.id)}
                            disabled={!userId}
                            title="Teilzahlung"
                            className="p-1.5 text-primary-500 dark:text-primary-400 hover:opacity-80 rounded hover:bg-light-border/50 dark:hover:bg-dark-border/50"
                          >
                            <FilePlus size={14} />
                          </button>
                          <button
                            onClick={() => handleEditPostenClick(p)}
                            disabled={!userId}
                            title="Bearbeiten"
                            className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400 rounded hover:bg-light-border/50 dark:hover:bg-dark-border/50"
                          >
                            <Edit3 size={14} />
                          </button>
                          {p.lieferdatum && (
                            <button
                              onClick={() => handleExportLieferterminToIcs(p)}
                              title="Liefertermin als Kalendereintrag exportieren"
                              className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-blue-500 dark:hover:text-blue-400 rounded hover:bg-light-border/50 dark:hover:bg-dark-border/50"
                            >
                              <CalendarPlus size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePosten(p.id)}
                            disabled={!userId}
                            title="Löschen"
                            className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color rounded hover:bg-light-border/50 dark:hover:bg-dark-border/50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-light-border dark:border-dark-border/50">
                        <div className="flex justify-between items-center text-xs mb-0.5">
                          <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">
                            Bezahlt: {formatGermanCurrency(summeBisherGezahlt)}{" "}
                            €
                          </span>
                          {istVollBezahlt ? (
                            <span className="text-primary-500 font-semibold flex items-center">
                              <TrendingUp size={14} className="mr-1" />
                              Voll bezahlt
                            </span>
                          ) : (
                            <span className="text-danger-color font-semibold">
                              Offen: {formatGermanCurrency(nochOffen)} €
                            </span>
                          )}
                        </div>
                        {p.teilzahlungen && p.teilzahlungen.length > 0 && (
                          <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            {p.teilzahlungen.map((tz) => (
                              <li
                                key={tz.id}
                                className="flex justify-between items-center group text-[11px]"
                              >
                                <span>
                                  {formatDateForDisplay(tz.datum_teilzahlung)}
                                  :{" "}
                                  {formatGermanCurrency(tz.betrag_teilzahlung)}€
                                  {tz.notiz_teilzahlung ? (
                                    <span className="italic">
                                      {" "}
                                      - "{tz.notiz_teilzahlung}"
                                    </span>
                                  ) : (
                                    ""
                                  )}
                                </span>
                                <button
                                  onClick={() => handleDeleteTeilzahlung(tz.id)}
                                  disabled={!userId}
                                  title="Löschen"
                                  className="ml-1 p-0.5 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-600 opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPostenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-3 z-50">
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-3 w-full max-w-md relative border border-light-border dark:border-dark-border">
            <button
              onClick={resetForm}
              className="absolute top-2.5 right-2.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-3">
              {editingPostenId ? "Posten bearbeiten" : "Neuer Posten"}
            </h3>
            <form onSubmit={handleSubmitPosten} className="space-y-2.5">
              <div>
                <label
                  htmlFor="postenBeschreibung"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Beschreibung
                </label>
                <input
                  type="text"
                  id="postenBeschreibung"
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="postenKategorie"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Kategorie
                </label>
                <select
                  id="postenKategorie"
                  value={kategorie}
                  onChange={(e) => setKategorie(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                >
                  {Object.keys(budgetKategorieIcons).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="postenBetrag"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Betrag (€)
                </label>
                <input
                  type="number"
                  id="postenBetrag"
                  value={geplanterBetrag}
                  onChange={(e) => setGeplanterBetrag(e.target.value)}
                  step="0.01"
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="postenBetragBezahlt"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Bereits bezahlt (€)
                </label>
                <input
                  type="number"
                  id="postenBetragBezahlt"
                  value={vollBezahlt ? geplanterBetrag : bereitsBezahlt}
                  onChange={(e) => {
                    setBereitsBezahlt(e.target.value);
                    setVollBezahlt(false);
                  }}
                  step="0.01"
                  min="0"
                  placeholder="z.B. 500"
                  disabled={vollBezahlt || !!editingPostenId}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
                <div className="flex items-center mt-1">
                  <input
                    type="checkbox"
                    id="vollBezahlt"
                    checked={vollBezahlt}
                    onChange={(e) => {
                      setVollBezahlt(e.target.checked);
                      if (e.target.checked) setBereitsBezahlt(geplanterBetrag);
                    }}
                    disabled={!!editingPostenId}
                    className="mr-2"
                  />
                  <label
                    htmlFor="vollBezahlt"
                    className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
                  >
                    Voll bezahlt (setzt Betrag auf geplanten Wert)
                  </label>
                </div>
                {editingPostenId && (
                  <p className="text-[11px] mt-1 text-light-text-secondary dark:text-dark-text-secondary">
                    Teilzahlungen bei bestehenden Posten bitte über den
                    Teilzahlung-Button erfassen.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="postenDatum"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Fälligkeit
                </label>
                <input
                  type="date"
                  id="postenDatum"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="postenLieferdatum"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Lieferdatum (opt.)
                </label>
                <input
                  type="date"
                  id="postenLieferdatum"
                  value={lieferdatum}
                  onChange={(e) => setLieferdatum(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-border dark:bg-dark-border hover:bg-gray-200 dark:hover:bg-gray-700 rounded-card-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs text-white bg-primary-500 hover:bg-primary-600 hover:opacity-90 rounded-pill shadow-sm"
                >
                  {editingPostenId ? "Speichern" : "Hinzufügen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showTeilzahlungModalFor && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-3 z-50">
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-3 w-full max-w-sm relative border border-light-border dark:border-dark-border">
            <button
              onClick={() => setShowTeilzahlungModalFor(null)}
              className="absolute top-2.5 right-2.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-md font-semibold text-light-text-main dark:text-dark-text-main mb-3 truncate">
              Teilzahlung für "
              {
                posten.find((p) => p.id === showTeilzahlungModalFor)
                  ?.beschreibung
              }
              "
            </h3>
            <form onSubmit={handleAddTeilzahlung} className="space-y-2.5">
              <div>
                <label
                  htmlFor="teilzahlungBetrag"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Betrag (€)
                </label>
                <input
                  type="number"
                  id="teilzahlungBetrag"
                  value={teilzahlungBetrag}
                  onChange={(e) => setTeilzahlungBetrag(e.target.value)}
                  step="0.01"
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="teilzahlungDatum"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Datum
                </label>
                <input
                  type="date"
                  id="teilzahlungDatum"
                  value={teilzahlungDatum}
                  onChange={(e) => setTeilzahlungDatum(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="teilzahlungNotiz"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Notiz (opt.)
                </label>
                <input
                  type="text"
                  id="teilzahlungNotiz"
                  value={teilzahlungNotiz}
                  onChange={(e) => setTeilzahlungNotiz(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTeilzahlungModalFor(null)}
                  className="px-3 py-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-border dark:bg-dark-border hover:bg-gray-200 dark:hover:bg-gray-700 rounded-card-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs text-white bg-primary-500 hover:bg-primary-600 hover:opacity-90 rounded-pill"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetTracker;
