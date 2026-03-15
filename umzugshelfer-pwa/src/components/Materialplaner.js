import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  PlusCircle,
  Edit3,
  Trash2,
  XCircle,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  Loader,
  Wrench,
  List,
  LayoutGrid,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext"; // ThemeContext importieren

const raumOptionsList = [
  "Wohnzimmer",
  "Schlafzimmer",
  "Kinderzimmer",
  "Küche",
  "Bad",
  "Gäste-WC",
  "Flur",
  "Diele",
  "Kellerraum",
  "Dachboden",
  "Abstellraum",
  "Balkon",
  "Terrasse",
  "Garage",
  "Hobbyraum",
  "Büro (Einzel)",
  "Büro (Großraum)",
  "Besprechungsraum",
  "Empfang",
  "Teeküche",
  "Serverraum",
  "Archiv",
  "Lager",
  "Werkstatt",
  "Außenbereich",
  "Garten",
  "Sonstiges",
];

const kategorieOptionsList = [
  "Alle Kategorien", // Für Filter
  "Baumaterial",
  "Verpackungsmaterial",
  "Werkzeug & Zubehör",
  "Reinigungsmaterial",
  "Sanitär",
  "Elektroinstallation",
  "Garten/Außenbereich",
  "Sonstiges",
  "Ohne Kategorie",
];
const formKategorieOptions = kategorieOptionsList.filter(
  (k) => k !== "Alle Kategorien"
); // Für Formular

const statusOptionsList = [
  "Alle Status",
  "Geplant",
  "Material besorgt",
  "In Arbeit",
  "Erledigt",
]; // Für Filter
const formStatusOptions = statusOptionsList.filter((s) => s !== "Alle Status"); // Für Formular

const parseMengeEinheitValue = (rawValue) => {
  if (!rawValue || typeof rawValue !== "string") {
    return { menge: 1, einheit: "" };
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return { menge: 1, einheit: "" };
  }

  const match = trimmedValue.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) {
    return { menge: 1, einheit: trimmedValue };
  }

  const parsedMenge = parseFloat(match[1].replace(",", "."));
  const einheit = (match[2] || "").trim();

  return {
    menge: Number.isFinite(parsedMenge) && parsedMenge > 0 ? parsedMenge : 1,
    einheit,
  };
};

const formatMengeEinheitValue = (menge, einheit) => {
  const normalizedMenge =
    Number.isFinite(menge) && menge > 0 ? menge : parseFloat(menge);
  const safeMenge =
    Number.isFinite(normalizedMenge) && normalizedMenge > 0 ? normalizedMenge : 1;

  const mengeText = Number.isInteger(safeMenge)
    ? String(safeMenge)
    : String(safeMenge).replace(/\.0+$/, "");
  const einheitText = (einheit || "").trim();

  return `${mengeText}${einheitText ? ` ${einheitText}` : ""}`.trim();
};

const Materialplaner = ({ session }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [posten, setPosten] = useState([]);
  const [filteredAndGroupedPosten, setFilteredAndGroupedPosten] = useState({});

  const [beschreibung, setBeschreibung] = useState("");
  const [raum, setRaum] = useState("Sonstiges");
  const [kategorie, setKategorie] = useState(formKategorieOptions[0]);
  const [mengeEinheit, setMengeEinheit] = useState("");
  const [geschaetzterPreis, setGeschaetzterPreis] = useState("");
  const [baumarktLink, setBaumarktLink] = useState("");
  const [status, setStatus] = useState(formStatusOptions[0]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPostenId, setEditingPostenId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [viewMode, setViewMode] = useState("kacheln");

  const [alleMaterialien, setAlleMaterialien] = useState([]);
  const [materialKategorien, setMaterialKategorien] = useState([]);
  const [gewaehlteMaterialKategorie, setGewaehlteMaterialKategorie] =
    useState("");
  const [
    gefilterteMaterialienFuerAuswahl,
    setGefilterteMaterialienFuerAuswahl,
  ] = useState([]);
  const [ausgewaehltesMaterialId, setAusgewaehltesMaterialId] = useState("");
  const [formMenge, setFormMenge] = useState(1);

  const [filterText, setFilterText] = useState("");
  const [filterKategorie, setFilterKategorie] = useState("Alle Kategorien");
  const [filterStatus, setFilterStatus] = useState("Alle Status");
  const { theme } = useTheme(); // Theme aus Context holen

  useEffect(() => {
    setUserId(session?.user?.id || null);
  }, [session]);

  const fetchMaterialienDB = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("materialien")
        .select("*")
        .order("kategorie")
        .order("name");
      if (error) throw error;
      setAlleMaterialien(data || []);
      const kategorien = [...new Set(data.map((m) => m.kategorie))].sort();
      setMaterialKategorien(kategorien);
    } catch (err) {
      console.error("Fehler beim Laden der Materialien-Liste:", err);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchMaterialienDB();
    }
  }, [userId, fetchMaterialienDB]);

  useEffect(() => {
    if (gewaehlteMaterialKategorie === "") {
      setGefilterteMaterialienFuerAuswahl(alleMaterialien);
    } else {
      setGefilterteMaterialienFuerAuswahl(
        alleMaterialien.filter(
          (m) => m.kategorie === gewaehlteMaterialKategorie
        )
      );
    }
    setAusgewaehltesMaterialId("");
  }, [gewaehlteMaterialKategorie, alleMaterialien]);

  useEffect(() => {
    if (ausgewaehltesMaterialId) {
      const material = alleMaterialien.find(
        (m) => m.id === ausgewaehltesMaterialId
      );
      if (material) {
        setBeschreibung(material.name);
        setMengeEinheit(material.einheit || "");
        setFormMenge(1);
        setGeschaetzterPreis(
          material.standardpreis ? material.standardpreis.toString() : ""
        );
      }
    }
  }, [ausgewaehltesMaterialId, alleMaterialien]);

  const fetchRenovierungsposten = useCallback(async () => {
    if (!userId) {
      setPosten([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("renovierungs_posten")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (dbError) throw dbError;
      setPosten(data || []);
    } catch (err) {
      setError("Materialposten nicht geladen.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchRenovierungsposten();
    else {
      setPosten([]);
      setLoading(false);
    }
  }, [userId, fetchRenovierungsposten]);

  useEffect(() => {
    let aktuellGefiltertePosten = [...posten];
    if (filterText) {
      aktuellGefiltertePosten = aktuellGefiltertePosten.filter((p) =>
        p.beschreibung.toLowerCase().includes(filterText.toLowerCase())
      );
    }
    if (filterKategorie !== "Alle Kategorien") {
      if (filterKategorie === "Ohne Kategorie") {
        aktuellGefiltertePosten = aktuellGefiltertePosten.filter(
          (p) => !p.kategorie
        );
      } else {
        aktuellGefiltertePosten = aktuellGefiltertePosten.filter(
          (p) => p.kategorie === filterKategorie
        );
      }
    }
    if (filterStatus !== "Alle Status") {
      aktuellGefiltertePosten = aktuellGefiltertePosten.filter(
        (p) => p.status === filterStatus
      );
    }

    if (aktuellGefiltertePosten.length > 0) {
      const groups = aktuellGefiltertePosten.reduce((acc, currentPosten) => {
        const groupKey = currentPosten.raum || "Ohne Raum/Bereich";
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(currentPosten);
        return acc;
      }, {});
      const sortedGroupKeys = Object.keys(groups).sort((a, b) =>
        a.localeCompare(b)
      );
      const sortedGroups = {};
      sortedGroupKeys.forEach((key) => {
        sortedGroups[key] = groups[key];
      });
      setFilteredAndGroupedPosten(sortedGroups);
    } else {
      setFilteredAndGroupedPosten({});
    }
  }, [posten, filterText, filterKategorie, filterStatus]);

  useEffect(() => {
    if (location.state?.neuerPosten) {
      const {
        beschreibung: desc,
        menge_einheit,
        geschaetzter_preis,
        status: statVorschlag,
        raum: raumVorschlag,
        kategorie: katVorschlag,
      } = location.state.neuerPosten;
      const parsedMengeEinheit = parseMengeEinheitValue(menge_einheit);

      setBeschreibung(desc || "");
      setFormMenge(parsedMengeEinheit.menge);
      setMengeEinheit(parsedMengeEinheit.einheit);
      setGeschaetzterPreis(
        geschaetzter_preis ? geschaetzter_preis.toString() : ""
      );
      setStatus(
        statVorschlag && formStatusOptions.includes(statVorschlag)
          ? statVorschlag
          : formStatusOptions[0]
      );
      setRaum(
        raumVorschlag && raumOptionsList.includes(raumVorschlag)
          ? raumVorschlag
          : raumOptionsList[0]
      );
      setKategorie(
        katVorschlag && formKategorieOptions.includes(katVorschlag)
          ? katVorschlag
          : formKategorieOptions[0]
      );
      setEditingPostenId(null);
      setShowFormModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const resetForm = () => {
    setBeschreibung("");
    setRaum("Sonstiges");
    setKategorie(formKategorieOptions[0]);
    setMengeEinheit("");
    setGeschaetzterPreis("");
    setBaumarktLink("");
    setStatus(formStatusOptions[0]);
    setEditingPostenId(null);
    setShowFormModal(false);
    setGewaehlteMaterialKategorie("");
    setAusgewaehltesMaterialId("");
    setFormMenge(1);
  };

  const handleEditClick = (item) => {
    const parsedMengeEinheit = parseMengeEinheitValue(item.menge_einheit);

    setEditingPostenId(item.id);
    setBeschreibung(item.beschreibung);
    setRaum(
      item.raum && raumOptionsList.includes(item.raum) ? item.raum : "Sonstiges"
    );
    setKategorie(
      formKategorieOptions.includes(item.kategorie)
        ? item.kategorie
        : "Ohne Kategorie"
    );
    setFormMenge(parsedMengeEinheit.menge);
    setMengeEinheit(parsedMengeEinheit.einheit);
    setGeschaetzterPreis(
      item.geschaetzter_preis ? item.geschaetzter_preis.toString() : ""
    );
    setBaumarktLink(item.baumarkt_link || "");
    setStatus(
      formStatusOptions.includes(item.status)
        ? item.status
        : formStatusOptions[0]
    );
    setShowFormModal(true);
  };

  const handleAddNewClick = () => {
    resetForm();
    setEditingPostenId(null);
    setShowFormModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !beschreibung) {
      alert(!userId ? "Bitte einloggen." : "Beschreibung ist ein Pflichtfeld.");
      return;
    }

    const parsedFormMenge = parseFloat(formMenge);
    if (!Number.isFinite(parsedFormMenge) || parsedFormMenge <= 0) {
      alert("Bitte eine gültige Menge größer 0 eingeben.");
      return;
    }

    const postenDaten = {
      user_id: userId,
      beschreibung,
      raum: raum,
      kategorie: kategorie === "Ohne Kategorie" ? null : kategorie,
      menge_einheit: formatMengeEinheitValue(parsedFormMenge, mengeEinheit),
      geschaetzter_preis: geschaetzterPreis
        ? parseFloat(geschaetzterPreis)
        : null,
      baumarkt_link: baumarktLink || null,
      status,
    };
    try {
      let opError;
      if (editingPostenId) {
        ({ error: opError } = await supabase
          .from("renovierungs_posten")
          .update(postenDaten)
          .match({ id: editingPostenId, user_id: userId }));
      } else {
        ({ error: opError } = await supabase
          .from("renovierungs_posten")
          .insert([postenDaten]));
      }
      if (opError) throw opError;
      fetchRenovierungsposten();
      resetForm();
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  const handleDeletePosten = async (id) => {
    if (!userId || !window.confirm("Posten löschen?")) return;
    try {
      const { error } = await supabase
        .from("renovierungs_posten")
        .delete()
        .match({ id, user_id: userId });
      if (error) throw error;
      setPosten(posten.filter((p) => p.id !== id));
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };
  const handleUpdateStatus = async (id, neuerStatus) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from("renovierungs_posten")
        .update({ status: neuerStatus })
        .match({ id, user_id: userId });
      if (error) throw error;
      setPosten(
        posten.map((p) => (p.id === id ? { ...p, status: neuerStatus } : p))
      );
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  const getStatusIcon = (currentStatus) => {
    const iconSize = 16;
    const geplantColor =
      theme === "dark"
        ? "text-dark-text-secondary"
        : "text-light-text-secondary";
    const besorgtColor =
      theme === "dark" ? "text-dark-accent-purple" : "text-light-accent-purple";
    const inArbeitColor =
      theme === "dark" ? "text-dark-accent-orange" : "text-light-accent-orange";
    const erledigtColor =
      theme === "dark" ? "dark:text-primary-400" : "text-primary-500";

    switch (currentStatus) {
      case "Geplant":
        return <Square size={iconSize} className={geplantColor} />;
      case "Material besorgt":
        return (
          <Loader
            size={iconSize}
            className={`${besorgtColor} animate-spin-slow`}
          />
        );
      case "In Arbeit":
        return <Wrench size={iconSize} className={inArbeitColor} />;
      case "Erledigt":
        return <CheckSquare size={iconSize} className={erledigtColor} />;
      default:
        return <Square size={iconSize} className={geplantColor} />;
    }
  };

  if (loading)
    return (
      <div className="text-center py-8">
        <p className="text-light-text-secondary dark:text-dark-text-secondary">
          Lade Materialplaner...
        </p>
      </div>
    );
  if (error)
    return (
      <div className="text-center py-8">
        <p className="text-danger-color">{error}</p>{" "}
        {/* Fehlerfarbe bleibt spezifisch */}
      </div>
    );

  const renderKachelAnsicht = () =>
    Object.entries(filteredAndGroupedPosten).map(([raumName, postenInRaum]) => (
      <section key={raumName} className="mb-6">
        <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main border-b border-light-border dark:border-dark-border pb-2 mb-3">
          {raumName}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {postenInRaum.map((p) => (
            <div
              key={p.id}
              className="bg-light-card-bg dark:bg-canvas-2 p-3 rounded-card shadow-elevation-2 flex flex-col justify-between self-start border border-light-border dark:border-dark-border"
            >
              <div>
                <div className="flex justify-between items-start mb-1.5">
                  <h4 className="text-md font-semibold text-light-text-main dark:text-dark-text-main flex-grow pr-2">
                    {p.beschreibung}
                  </h4>
                  <div
                    className="flex-shrink-0 p-1 rounded-full bg-light-border dark:bg-dark-border"
                    title={p.status}
                  >
                    {getStatusIcon(p.status)}
                  </div>
                </div>
                {p.kategorie && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Kategorie: {p.kategorie}
                  </p>
                )}
                {p.menge_einheit && (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Menge: {p.menge_einheit}
                  </p>
                )}
                {p.geschaetzter_preis && (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Preis: ca. {parseFloat(p.geschaetzter_preis).toFixed(2)} €
                  </p>
                )}
                {p.baumarkt_link && (
                  <a
                    href={p.baumarkt_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Zum Produkt"
                    className="text-xs text-primary-500 dark:text-primary-400 hover:opacity-80 flex items-center mt-0.5"
                  >
                    <ExternalLink size={12} className="mr-1" /> Produktlink
                  </a>
                )}
              </div>
              <div className="flex justify-end space-x-1 border-t border-light-border dark:border-dark-border/50 pt-2 mt-2">
                <select
                  value={p.status}
                  onChange={(e) => handleUpdateStatus(p.id, e.target.value)}
                  className="text-xs p-1 border border-light-border dark:border-dark-border rounded-card-sm focus:ring-2 focus:ring-secondary-500 bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main"
                >
                  {formStatusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleEditClick(p)}
                  title="Bearbeiten"
                  className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400 rounded hover:bg-gray-200 dark:hover:bg-dark-border/50"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDeletePosten(p.id)}
                  title="Löschen"
                  className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color rounded hover:bg-gray-200 dark:hover:bg-dark-border/50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    ));

  const renderListenAnsicht = () =>
    Object.entries(filteredAndGroupedPosten).map(([raumName, postenInRaum]) => (
      <section key={raumName} className="mb-6">
        <h3 className="text-xl font-semibold text-light-text-main dark:text-dark-text-main border-b border-light-border dark:border-dark-border pb-2 mb-3">
          {raumName}
        </h3>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="min-w-full text-sm text-left text-light-text-secondary dark:text-dark-text-secondary">
            <thead className="text-xs text-light-text-main dark:text-dark-text-main uppercase bg-gray-50 dark:bg-canvas-1 border-b border-light-border dark:border-dark-border">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Beschreibung
                </th>
                <th scope="col" className="px-4 py-2">
                  Kategorie
                </th>
                <th scope="col" className="px-4 py-2">
                  Menge
                </th>
                <th scope="col" className="px-4 py-2">
                  Preis (ca.)
                </th>
                <th scope="col" className="px-4 py-2">
                  Status
                </th>
                <th scope="col" className="px-4 py-2">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {postenInRaum.map((p) => (
                <tr
                  key={p.id}
                  className="bg-light-card-bg dark:bg-canvas-2 border-b border-light-border dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-border/30"
                >
                  <td className="px-4 py-2 font-medium text-light-text-main dark:text-dark-text-main whitespace-nowrap">
                    {p.beschreibung}
                  </td>
                  <td className="px-4 py-2">{p.kategorie || "-"}</td>
                  <td className="px-4 py-2">{p.menge_einheit || "-"}</td>
                  <td className="px-4 py-2">
                    {p.geschaetzter_preis
                      ? `${parseFloat(p.geschaetzter_preis).toFixed(2)} €`
                      : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={p.status}
                      onChange={(e) => handleUpdateStatus(p.id, e.target.value)}
                      className="text-xs p-1 border border-light-border dark:border-dark-border rounded-card-sm focus:ring-2 focus:ring-secondary-500 bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main w-full"
                    >
                      {formStatusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 flex items-center space-x-1">
                    {p.baumarkt_link && (
                      <a
                        href={p.baumarkt_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Zum Produkt"
                        className="p-1.5 text-primary-500 dark:text-primary-400 hover:opacity-80"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => handleEditClick(p)}
                      title="Bearbeiten"
                      className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400 rounded hover:bg-gray-200 dark:hover:bg-dark-border/50"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeletePosten(p.id)}
                      title="Löschen"
                      className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color rounded hover:bg-gray-200 dark:hover:bg-dark-border/50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ));

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
          Material-Planer
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setViewMode("kacheln")}
            className={`p-1.5 rounded-card-sm ${
              viewMode === "kacheln"
                ? "bg-primary-500 text-white dark:bg-primary-600 dark:text-dark-bg"
                : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title="Kachelansicht"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode("liste")}
            className={`p-1.5 rounded-card-sm ${
              viewMode === "liste"
                ? "bg-primary-500 text-white dark:bg-primary-600 dark:text-dark-bg"
                : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title="Listenansicht"
          >
            <List size={18} />
          </button>
          <button
            onClick={handleAddNewClick}
            className="bg-primary-500 hover:bg-primary-600 text-white dark:text-dark-bg px-3 py-1.5 rounded-pill shadow-elevation-2 hover:opacity-90 flex items-center space-x-1.5 text-sm"
          >
            <PlusCircle size={18} /> <span>Neuer Posten</span>
          </button>
        </div>
      </div>

      {/* Filter Sektion */}
      <div className="p-4 bg-light-card-bg dark:bg-canvas-1 border border-light-border dark:border-dark-border rounded-card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
          <div>
            <label
              htmlFor="filterText"
              className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
            >
              Suche Beschreibung
            </label>
            <div className="relative">
              <input
                type="text"
                id="filterText"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Suchen..."
                className="w-full pl-8 pr-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
              />
              <Search
                size={16}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="filterKategorie"
              className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
            >
              Filter Kategorie
            </label>
            <select
              id="filterKategorie"
              value={filterKategorie}
              onChange={(e) => setFilterKategorie(e.target.value)}
              className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
            >
              {kategorieOptionsList.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="filterStatus"
              className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
            >
              Filter Status
            </label>
            <select
              id="filterStatus"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
            >
              {statusOptionsList.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-3 z-50">
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-3 w-full max-w-md relative border border-light-border dark:border-dark-border">
            <button
              onClick={resetForm}
              className="absolute top-2.5 right-2.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-3">
              {editingPostenId ? "Posten bearbeiten" : "Neues Material/Aufgabe"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Materialauswahl Sektion */}
              <div className="p-3 border border-light-border dark:border-dark-border/50 rounded-card-sm space-y-2 bg-gray-50 dark:bg-canvas-1/30">
                <h4 className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                  Vordefiniertes Material auswählen (optional)
                </h4>
                <div>
                  <label
                    htmlFor="materialKategorieAuswahl"
                    className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                  >
                    Material-Kategorie
                  </label>
                  <select
                    id="materialKategorieAuswahl"
                    value={gewaehlteMaterialKategorie}
                    onChange={(e) =>
                      setGewaehlteMaterialKategorie(e.target.value)
                    }
                    className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                  >
                    <option value="">Alle Kategorien anzeigen</option>
                    {materialKategorien.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>
                {gefilterteMaterialienFuerAuswahl.length > 0 && (
                  <div>
                    <label
                      htmlFor="materialAuswahl"
                      className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                    >
                      Material auswählen
                    </label>
                    <select
                      id="materialAuswahl"
                      value={ausgewaehltesMaterialId}
                      onChange={(e) =>
                        setAusgewaehltesMaterialId(e.target.value)
                      }
                      className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                    >
                      <option value="">
                        -- Material wählen oder manuell eingeben --
                      </option>
                      {gefilterteMaterialienFuerAuswahl.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.name} ({mat.einheit}, ca. {mat.standardpreis}€)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Manuelle Eingabe / Überschreiben */}
              <div>
                <label
                  htmlFor="renoBeschreibung"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Beschreibung*
                </label>
                <input
                  type="text"
                  id="renoBeschreibung"
                  value={beschreibung}
                  onChange={(e) => {
                    setBeschreibung(e.target.value);
                    if (ausgewaehltesMaterialId) setAusgewaehltesMaterialId("");
                  }}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="renoKategorie"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Kategorie
                </label>
                <select
                  id="renoKategorie"
                  value={kategorie}
                  onChange={(e) => setKategorie(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                >
                  {formKategorieOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="renoRaum"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Raum/Bereich
                </label>
                <select
                  id="renoRaum"
                  value={raum}
                  onChange={(e) => setRaum(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                >
                  {raumOptionsList.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="renoMenge"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Benötigte Menge*
                </label>
                <input
                  type="number"
                  id="renoFormMenge"
                  value={formMenge}
                  onChange={(e) => {
                    const parsedValue = parseFloat(
                      e.target.value.replace(",", ".")
                    );
                    setFormMenge(
                      Number.isFinite(parsedValue) && parsedValue > 0
                        ? parsedValue
                        : 1
                    );
                  }}
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="renoEinheit"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Einheit (opt.)
                </label>
                <input
                  type="text"
                  id="renoEinheit"
                  value={mengeEinheit}
                  onChange={(e) => {
                    setMengeEinheit(e.target.value);
                    if (ausgewaehltesMaterialId) setAusgewaehltesMaterialId("");
                  }}
                  placeholder="z.B. Liter, qm, Stück"
                  readOnly={
                    !!ausgewaehltesMaterialId &&
                    !!alleMaterialien.find(
                      (m) => m.id === ausgewaehltesMaterialId
                    )?.einheit
                  }
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="renoPreis"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Preis (€, opt.)
                </label>
                <input
                  type="number"
                  id="renoPreis"
                  value={geschaetzterPreis}
                  onChange={(e) => setGeschaetzterPreis(e.target.value)}
                  step="0.01"
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="renoBaumarktLink"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Link (opt.)
                </label>
                <input
                  type="url"
                  id="renoBaumarktLink"
                  value={baumarktLink}
                  onChange={(e) => setBaumarktLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="renoStatus"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Status
                </label>
                <select
                  id="renoStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500"
                >
                  {formStatusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-border dark:bg-dark-border hover:bg-gray-200 dark:hover:bg-gray-700 rounded-pill"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs text-white dark:text-dark-bg bg-primary-500 hover:bg-primary-600 hover:opacity-90 rounded-pill"
                >
                  {editingPostenId ? "Speichern" : "Hinzufügen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {Object.keys(filteredAndGroupedPosten).length === 0 &&
        !loading &&
        !showFormModal && (
          <p className="text-center text-light-text-secondary dark:text-dark-text-secondary py-6 text-sm">
            Keine Materialposten für die aktuellen Filter gefunden.
          </p>
        )}

      {Object.keys(filteredAndGroupedPosten).length > 0 &&
        !loading &&
        !showFormModal && (
          <div className="space-y-6">
            {viewMode === "kacheln"
              ? renderKachelAnsicht()
              : renderListenAnsicht()}
          </div>
        )}
    </div>
  );
};

export default Materialplaner;
