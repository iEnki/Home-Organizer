import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useDropzone } from "react-dropzone";
import { XCircle, UploadCloud, FileText, ImageIcon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const DokumentenZuordnungModal = ({
  session,
  aufgabe,
  onClose,
  onDokumenteAktualisiert,
}) => {
  const { theme } = useTheme();
  const [alleDokumente, setAlleDokumente] = useState([]);
  const [zugeordneteDokumentIds, setZugeordneteDokumentIds] = useState(
    new Set(aufgabe.angehaengte_dokument_ids || [])
  );
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [beschreibung, setBeschreibung] = useState("");

  const userId = session?.user?.id;

  const fetchAlleDokumente = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("dokumente")
        .select("*")
        .eq("user_id", userId)
        .order("erstellt_am", { ascending: false });
      if (dbError) throw dbError;
      setAlleDokumente(data || []);
    } catch (err) {
      console.error("Fehler beim Laden aller Dokumente:", err);
      setError("Dokumente konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAlleDokumente();
  }, [fetchAlleDokumente]);

  const handleCheckboxChange = (dokumentId) => {
    setZugeordneteDokumentIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dokumentId)) {
        newSet.delete(dokumentId);
      } else {
        newSet.add(dokumentId);
      }
      return newSet;
    });
  };

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setError("");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  const handleUploadAndAssign = async () => {
    if (!selectedFile || !userId) {
      setError("Bitte wählen Sie eine Datei aus.");
      return;
    }
    setUploading(true);
    setError("");

    const fileName = `${Date.now()}_${selectedFile.name.replace(/\s/g, "_")}`;
    const filePath = `${userId}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("user-dokumente")
        .upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const newDokument = {
        user_id: userId,
        dateiname: selectedFile.name,
        datei_typ: selectedFile.type,
        storage_pfad: filePath,
        beschreibung: beschreibung,
        groesse_kb: Math.round(selectedFile.size / 1024),
        todo_aufgabe_id: aufgabe.id, // Direkt der Aufgabe zuordnen
      };

      const { data: insertedDoc, error: dbError } = await supabase
        .from("dokumente")
        .insert(newDokument)
        .select()
        .single();
      if (dbError) throw dbError;

      if (insertedDoc) {
        setZugeordneteDokumentIds((prev) => new Set(prev).add(insertedDoc.id));
      }

      await fetchAlleDokumente(); // Um die Liste zu aktualisieren
      setSelectedFile(null);
      setBeschreibung("");
    } catch (err) {
      console.error("Upload & Assign Fehler:", err);
      setError(`Upload fehlgeschlagen: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveZuordnung = async () => {
    try {
      const { error: updateError } = await supabase
        .from("todo_aufgaben")
        .update({
          angehaengte_dokument_ids: Array.from(zugeordneteDokumentIds),
        })
        .eq("id", aufgabe.id);
      if (updateError) throw updateError;
      onDokumenteAktualisiert(); // Callback um TodoListenManager zu informieren
      onClose();
    } catch (err) {
      console.error("Fehler beim Speichern der Zuordnung:", err);
      setError("Zuordnung konnte nicht gespeichert werden.");
    }
  };

  const getFileIcon = (dateiTyp) => {
    if (dateiTyp?.startsWith("image/"))
      return <ImageIcon className="w-5 h-5 text-blue-500 mr-2" />;
    if (dateiTyp === "application/pdf")
      return <FileText className="w-5 h-5 text-red-500 mr-2" />;
    return <FileText className="w-5 h-5 text-gray-500 mr-2" />;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div
        className={`relative w-full max-w-2xl p-6 rounded-lg shadow-xl border ${
          theme === "dark"
            ? "bg-dark-card-bg border-dark-border text-dark-text-main"
            : "bg-light-card-bg border-light-border text-light-text-main"
        }`}
      >
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 p-1 rounded-full hover:bg-opacity-20 ${
            theme === "dark"
              ? "text-dark-text-secondary hover:bg-dark-border"
              : "text-light-text-secondary hover:bg-light-border"
          }`}
        >
          <XCircle size={24} />
        </button>
        <h3 className="text-xl font-semibold mb-4">
          Dokumente für "{aufgabe.beschreibung}"
        </h3>

        {/* Upload Section */}
        <div
          className={`mb-6 p-4 rounded-md border ${
            theme === "dark"
              ? "border-dark-border bg-dark-bg"
              : "border-light-border bg-gray-50"
          }`}
        >
          <h4 className="text-md font-semibold mb-2">
            Neues Dokument hochladen & zuordnen
          </h4>
          <div
            {...getRootProps()}
            className={`p-6 border-2 border-dashed rounded-md cursor-pointer text-center transition-colors
            ${
              isDragActive
                ? theme === "dark"
                  ? "border-dark-accent-blue bg-dark-bg-hover"
                  : "border-light-accent-blue bg-light-bg-hover"
                : theme === "dark"
                ? "border-dark-border hover:border-dark-accent-blue"
                : "border-light-border hover:border-light-accent-blue"
            }
          `}
          >
            <input {...getInputProps()} />
            <UploadCloud
              className={`w-10 h-10 mx-auto mb-2 ${
                theme === "dark"
                  ? "text-dark-text-secondary"
                  : "text-light-text-secondary"
              }`}
            />
            {isDragActive ? (
              <p className="text-sm">Datei hier fallen lassen...</p>
            ) : (
              <p className="text-sm">Datei hierher ziehen oder klicken.</p>
            )}
          </div>
          {selectedFile && (
            <div className="mt-3">
              <p className="text-xs">
                Ausgewählt: {selectedFile.name} (
                {Math.round(selectedFile.size / 1024)} KB)
              </p>
              <input
                type="text"
                placeholder="Optionale Beschreibung..."
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                className={`mt-1 w-full p-1.5 border rounded-md text-xs ${
                  theme === "dark"
                    ? "bg-dark-input border-dark-border"
                    : "bg-light-input border-light-border"
                }`}
              />
            </div>
          )}
          <button
            onClick={handleUploadAndAssign}
            disabled={!selectedFile || uploading}
            className={`mt-3 px-3 py-1.5 text-xs rounded-md font-semibold transition-colors
              ${
                !selectedFile || uploading
                  ? theme === "dark"
                    ? "bg-dark-border text-dark-text-disabled"
                    : "bg-light-border text-light-text-disabled"
                  : theme === "dark"
                  ? "bg-dark-accent-green hover:bg-green-700 text-white"
                  : "bg-light-accent-green hover:bg-green-600 text-white"
              }
            `}
          >
            {uploading ? "Lädt hoch..." : "Hochladen & Zuordnen"}
          </button>
        </div>

        {/* Auswahl vorhandener Dokumente */}
        <div className="mb-4">
          <h4 className="text-md font-semibold mb-2">
            Vorhandene Dokumente zuordnen
          </h4>
          {loading && <p className="text-xs">Lade Dokumentenliste...</p>}
          {!loading && alleDokumente.length === 0 && (
            <p className="text-xs">Keine weiteren Dokumente vorhanden.</p>
          )}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-2">
            {alleDokumente.map((doc) => (
              <label
                key={doc.id}
                className={`flex items-center p-2 rounded-md cursor-pointer text-sm transition-colors ${
                  theme === "dark"
                    ? "hover:bg-dark-bg-hover"
                    : "hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={zugeordneteDokumentIds.has(doc.id)}
                  onChange={() => handleCheckboxChange(doc.id)}
                  className="mr-2 h-4 w-4 rounded text-light-accent-green dark:text-dark-accent-green focus:ring-light-accent-green/50 dark:focus:ring-dark-accent-green/50 bg-transparent border-light-border dark:border-dark-border"
                />
                {getFileIcon(doc.datei_typ)}
                <span className="truncate" title={doc.dateiname}>
                  {doc.dateiname}
                </span>
                {doc.beschreibung && (
                  <span
                    className={`ml-2 text-xs truncate ${
                      theme === "dark"
                        ? "text-dark-text-secondary"
                        : "text-light-text-secondary"
                    }`}
                  >
                    ({doc.beschreibung})
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mt-2 mb-2">{error}</p>}

        <div
          className={`flex justify-end space-x-3 pt-4 border-t mt-4 ${
            theme === "dark" ? "border-dark-border" : "border-light-border"
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm rounded-md ${
              theme === "dark"
                ? "bg-dark-border hover:bg-gray-700"
                : "bg-light-border hover:bg-gray-200"
            }`}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSaveZuordnung}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-md ${
              theme === "dark"
                ? "bg-dark-accent-green hover:bg-green-700"
                : "bg-light-accent-green hover:bg-green-600"
            }`}
          >
            Zuordnung speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export default DokumentenZuordnungModal;
