import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  PlusCircle,
  Edit3,
  Trash2,
  XCircle,
  ExternalLink,
  CheckSquare,
  Square,
  Loader,
  Wrench,
} from "lucide-react";

const RenovierungsPlaner = ({ session }) => {
  const [userId, setUserId] = useState(null);
  const [posten, setPosten] = useState([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [raum, setRaum] = useState("");
  const [mengeEinheit, setMengeEinheit] = useState("");
  const [geschaetzterPreis, setGeschaetzterPreis] = useState("");
  const [baumarktLink, setBaumarktLink] = useState("");
  const [status, setStatus] = useState("Geplant");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPostenId, setEditingPostenId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  useEffect(() => {
    setUserId(session?.user?.id || null);
  }, [session]);

  const fetchRenovierungsposten = useCallback(async () => {
    /* ... (Logik bleibt gleich) ... */ if (!userId) {
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
      setError("Renovierungsposten nicht geladen.");
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
  const resetForm = () => {
    setBeschreibung("");
    setRaum("");
    setMengeEinheit("");
    setGeschaetzterPreis("");
    setBaumarktLink("");
    setStatus("Geplant");
    setEditingPostenId(null);
    setShowFormModal(false);
  };
  const handleEditClick = (item) => {
    setEditingPostenId(item.id);
    setBeschreibung(item.beschreibung);
    setRaum(item.raum);
    setMengeEinheit(item.menge_einheit || "");
    setGeschaetzterPreis(
      item.geschaetzter_preis ? item.geschaetzter_preis.toString() : ""
    );
    setBaumarktLink(item.baumarkt_link || "");
    setStatus(item.status);
    setShowFormModal(true);
  };
  const handleAddNewClick = () => {
    resetForm();
    setEditingPostenId(null);
    setShowFormModal(true);
  };
  const handleSubmit = async (e) => {
    /* ... (Logik bleibt gleich) ... */ e.preventDefault();
    if (!userId || !beschreibung || !raum) {
      alert(
        !userId ? "Bitte einloggen." : "Beschreibung und Raum sind Pflicht."
      );
      return;
    }
    const postenDaten = {
      user_id: userId,
      beschreibung,
      raum,
      menge_einheit: mengeEinheit || null,
      geschaetzter_preis: geschaetzterPreis
        ? parseFloat(geschaetzterPreis)
        : null,
      baumarkt_link: baumarktLink || null,
      status,
    };
    try {
      let opError;
      if (editingPostenId) {
        const { error } = await supabase
          .from("renovierungs_posten")
          .update(postenDaten)
          .match({ id: editingPostenId, user_id: userId });
        opError = error;
      } else {
        const { error } = await supabase
          .from("renovierungs_posten")
          .insert([postenDaten]);
        opError = error;
      }
      if (opError) throw opError;
      fetchRenovierungsposten();
      resetForm();
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };
  const handleDeletePosten = async (id) => {
    /* ... (Logik bleibt gleich) ... */ if (
      !userId ||
      !window.confirm("Posten löschen?")
    )
      return;
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
    /* ... (Logik bleibt gleich) ... */ if (!userId) return;
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
    // Dark Theme Anpassung
    const iconSize = 16;
    switch (currentStatus) {
      case "Geplant":
        return <Square size={iconSize} className="text-dark-text-secondary" />;
      case "Material besorgt":
        return (
          <Loader
            size={iconSize}
            className="text-dark-accent-purple animate-spin-slow"
          />
        );
      case "In Arbeit":
        return <Wrench size={iconSize} className="text-dark-accent-orange" />;
      case "Erledigt":
        return (
          <CheckSquare size={iconSize} className="text-dark-accent-green" />
        );
      default:
        return <Square size={iconSize} className="text-dark-text-secondary" />;
    }
  };
  const statusOptions = [
    "Geplant",
    "Material besorgt",
    "In Arbeit",
    "Erledigt",
  ];

  if (loading)
    return (
      <div className="text-center py-8">
        <p className="text-dark-text-secondary">Lade Renovierungsplaner...</p>
      </div>
    );
  if (error)
    return (
      <div className="text-center py-8">
        <p className="text-danger-color">{error}</p>
      </div>
    );

  return (
    <div className="space-y-4 p-3 md:p-4 lg:p-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-2xl font-bold text-dark-text-main">
          Renovierungs-Planer
        </h2>
        <button
          onClick={handleAddNewClick}
          className="bg-dark-accent-green text-dark-bg px-3 py-1.5 rounded-md shadow hover:opacity-90 flex items-center space-x-1.5 text-sm self-start sm:self-center"
        >
          <PlusCircle size={18} /> <span>Neuer Posten</span>
        </button>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-3 z-50">
          <div className="bg-dark-card-bg p-4 rounded-lg shadow-xl w-full max-w-md relative border border-dark-border">
            <button
              onClick={resetForm}
              className="absolute top-2.5 right-2.5 text-dark-text-secondary hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-lg font-semibold text-dark-text-main mb-3">
              {editingPostenId ? "Posten bearbeiten" : "Neues Material/Aufgabe"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="renoBeschreibung"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Beschreibung
                </label>
                <input
                  type="text"
                  id="renoBeschreibung"
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
                />
              </div>
              <div>
                <label
                  htmlFor="renoRaum"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Raum
                </label>
                <input
                  type="text"
                  id="renoRaum"
                  value={raum}
                  onChange={(e) => setRaum(e.target.value)}
                  placeholder="z.B. Wohnzimmer"
                  required
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
                />
              </div>
              <div>
                <label
                  htmlFor="renoMenge"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Menge/Einheit (opt.)
                </label>
                <input
                  type="text"
                  id="renoMenge"
                  value={mengeEinheit}
                  onChange={(e) => setMengeEinheit(e.target.value)}
                  placeholder="z.B. 10 Liter"
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
                />
              </div>
              <div>
                <label
                  htmlFor="renoPreis"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Preis (€, opt.)
                </label>
                <input
                  type="number"
                  id="renoPreis"
                  value={geschaetzterPreis}
                  onChange={(e) => setGeschaetzterPreis(e.target.value)}
                  step="0.01"
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
                />
              </div>
              <div>
                <label
                  htmlFor="renoBaumarktLink"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Link (opt.)
                </label>
                <input
                  type="url"
                  id="renoBaumarktLink"
                  value={baumarktLink}
                  onChange={(e) => setBaumarktLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main placeholder-dark-text-secondary focus:ring-dark-accent-green focus:border-dark-accent-green"
                />
              </div>
              <div>
                <label
                  htmlFor="renoStatus"
                  className="block text-xs font-medium text-dark-text-secondary mb-0.5"
                >
                  Status
                </label>
                <select
                  id="renoStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 border-dark-border rounded-md text-sm bg-dark-border text-dark-text-main focus:ring-dark-accent-green focus:border-dark-accent-green"
                >
                  {statusOptions.map((opt) => (
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
                  className="px-3 py-1.5 text-xs text-dark-text-secondary bg-dark-border hover:bg-gray-700 rounded-md"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs text-dark-bg bg-dark-accent-green hover:opacity-90 rounded-md"
                >
                  {editingPostenId ? "Speichern" : "Hinzufügen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {posten.length === 0 && !loading && !showFormModal && (
        <p className="text-center text-dark-text-secondary py-6 text-sm">
          Keine Renovierungsarbeiten geplant.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posten.map((p) => (
          <div
            key={p.id}
            className="bg-dark-card-bg p-3 rounded-lg shadow-md flex flex-col justify-between self-start border border-dark-border"
          >
            <div>
              <div className="flex justify-between items-start mb-1.5">
                <h4 className="text-md font-semibold text-dark-text-main flex-grow pr-2">
                  {p.beschreibung}
                </h4>
                <div
                  className="flex-shrink-0 p-1 rounded-full bg-dark-border"
                  title={p.status}
                >
                  {getStatusIcon(p.status)}
                </div>
              </div>
              <p className="text-xs text-dark-accent-purple font-medium mb-1">
                {p.raum}
              </p>
              {p.menge_einheit && (
                <p className="text-xs text-dark-text-secondary">
                  Menge: {p.menge_einheit}
                </p>
              )}
              {p.geschaetzter_preis && (
                <p className="text-xs text-dark-text-secondary">
                  Preis: ca. {parseFloat(p.geschaetzter_preis).toFixed(2)} €
                </p>
              )}
              {p.baumarkt_link && (
                <a
                  href={p.baumarkt_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Zum Produkt"
                  className="text-xs text-dark-accent-green hover:opacity-80 flex items-center mt-0.5"
                >
                  <ExternalLink size={12} className="mr-1" /> Produktlink
                </a>
              )}
            </div>
            <div className="flex justify-end space-x-1 border-t border-dark-border/50 pt-2 mt-2">
              <select
                value={p.status}
                onChange={(e) => handleUpdateStatus(p.id, e.target.value)}
                className="text-xs p-1 border border-dark-border rounded-md focus:ring-1 focus:ring-dark-accent-green bg-dark-border text-dark-text-main"
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleEditClick(p)}
                title="Bearbeiten"
                className="p-1.5 text-dark-text-secondary hover:text-dark-accent-green rounded hover:bg-dark-border/50"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => handleDeletePosten(p.id)}
                title="Löschen"
                className="p-1.5 text-dark-text-secondary hover:text-danger-color rounded hover:bg-dark-border/50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RenovierungsPlaner;
