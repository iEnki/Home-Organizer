import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { ImageIcon } from "lucide-react"; // Für den Ladezustand oder Fehler

const BildVorschau = ({ storagePfad, altText, onClick, theme }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ladeSignierteUrl = async () => {
      if (!storagePfad) {
        setLoading(false);
        setError(true);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const { data, error: urlError } = await supabase.storage
          .from("user-dokumente")
          .createSignedUrl(storagePfad, 3600); // URL für 1 Stunde gültig

        if (urlError) {
          throw urlError;
        }
        setImageUrl(data.signedUrl);
      } catch (err) {
        console.error(
          "Fehler beim Erstellen der signierten URL für Bildvorschau:",
          storagePfad,
          err
        );
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    ladeSignierteUrl();
  }, [storagePfad]);

  if (loading) {
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded mr-1 mb-1">
        <ImageIcon
          size={18}
          className="animate-pulse text-gray-400 dark:text-gray-500"
        />
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className="w-10 h-10 flex items-center justify-center bg-red-100 dark:bg-red-800/30 rounded mr-1 mb-1 cursor-pointer border border-red-300 dark:border-red-600"
        onClick={(e) => onClick(e, null)} // Auch bei Fehler den Klick weiterleiten, aber mit null als URL
        title={altText || "Bild konnte nicht geladen werden"}
      >
        <ImageIcon size={18} className="text-red-500 dark:text-red-400" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={altText || "Vorschau"}
      className="w-10 h-10 object-cover rounded mr-1 mb-1 cursor-pointer border border-gray-300 dark:border-gray-600"
      onClick={(e) => onClick(e, imageUrl)} // Übergibt das Event-Objekt und die geladene imageUrl
      title={altText}
    />
  );
};

export default BildVorschau;
