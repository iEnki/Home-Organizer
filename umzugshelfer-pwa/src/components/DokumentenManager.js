import React, { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "../supabaseClient";
import OpenAI from "openai";
import { useTheme } from "../contexts/ThemeContext";
import { Link, useLocation } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  ImageIcon,
  Trash2,
  Download,
  Link2,
  Sparkles,
  Check,
  X,
} from "lucide-react";

const DokumentenManager = ({ session }) => {
  const { theme } = useTheme();
  const location = useLocation();

  const [dokumente, setDokumente] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [zugehoerigeAufgabeId, setZugehoerigeAufgabeId] = useState("");
  const [kiVorschlag, setKiVorschlag] = useState(null); // {dokumentId, beschreibung, hinweis}
  const [kiLaed, setKiLaed] = useState(false);

  const userId = session?.user?.id;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const aufgabeIdFromUrl = params.get("aufgabeId");
    if (aufgabeIdFromUrl) {
      setZugehoerigeAufgabeId(aufgabeIdFromUrl);
    }
  }, [location.search]);

  const fetchDokumente = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("dokumente")
        .select("*, todo_aufgaben(beschreibung)")
        .eq("user_id", userId)
        .order("erstellt_am", { ascending: false });
      if (dbError) throw dbError;
      setDokumente(data || []);
    } catch (err) {
      console.error("Fehler beim Laden der Dokumente:", err);
      setError("Dokumente konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDokumente();
  }, [fetchDokumente]);

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

  const analyzeDocumentWithAI = async (dokumentId, dateiname, dateiTyp) => {
    try {
      const { data: profile } = await supabase
        .from("user_profile")
        .select("openai_api_key")
        .eq("id", userId)
        .single();
      if (!profile?.openai_api_key) return;

      setKiLaed(true);
      const openai = new OpenAI({ apiKey: profile.openai_api_key, dangerouslyAllowBrowser: true });
      const prompt = `Du hilfst beim Kategorisieren von Umzugsdokumenten. Analysiere den Dateinamen und den Dateityp und gib eine kurze Beschreibung und einen Kategoriehinweis zurück.

Dateiname: "${dateiname}"
Dateityp: "${dateiTyp || "unbekannt"}"

Antworte als JSON: {"beschreibung": "kurze Beschreibung was das Dokument wahrscheinlich ist (max 60 Zeichen)", "kategorie_hinweis": "z.B. Mietvertrag, Rechnung, Versicherung, Behörde, Gesundheit, Sonstiges"}

Antworte nur mit dem JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });

      const raw = response.choices[0].message.content;
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setKiVorschlag({ dokumentId, ...parsed });
      }
    } catch (err) {
      // silent fail — KI-Funktion ist optional
    } finally {
      setKiLaed(false);
    }
  };

  const applyKiVorschlag = async () => {
    if (!kiVorschlag) return;
    try {
      await supabase
        .from("dokumente")
        .update({ beschreibung: `${kiVorschlag.beschreibung} [${kiVorschlag.kategorie_hinweis}]` })
        .eq("id", kiVorschlag.dokumentId)
        .eq("user_id", userId);
      fetchDokumente();
    } catch (err) {
      // ignore
    } finally {
      setKiVorschlag(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !userId) {
      setError("Bitte wählen Sie eine Datei aus.");
      return;
    }
    setUploading(true);
    setError("");
    setKiVorschlag(null);

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
        todo_aufgabe_id: zugehoerigeAufgabeId || null,
      };

      const { data: inserted, error: dbError } = await supabase
        .from("dokumente")
        .insert(newDokument)
        .select()
        .single();
      if (dbError) throw dbError;

      fetchDokumente();
      setSelectedFile(null);
      setBeschreibung("");

      // KI-Analyse starten, wenn noch keine Beschreibung eingegeben wurde
      if (!beschreibung && inserted?.id) {
        analyzeDocumentWithAI(inserted.id, selectedFile.name, selectedFile.type);
      }
    } catch (err) {
      console.error("Upload Fehler:", err);
      setError(`Upload fehlgeschlagen: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (dokumentId, storagePfad) => {
    if (!window.confirm("Möchten Sie dieses Dokument wirklich löschen?"))
      return;
    try {
      const { error: storageError } = await supabase.storage
        .from("user-dokumente")
        .remove([storagePfad]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("dokumente")
        .delete()
        .eq("id", dokumentId)
        .eq("user_id", userId);
      if (dbError) throw dbError;
      fetchDokumente();
    } catch (err) {
      console.error("Löschfehler:", err);
      setError(`Löschen fehlgeschlagen: ${err.message}`);
    }
  };

  const getFileIcon = (dateiTyp) => {
    if (dateiTyp?.startsWith("image/"))
      return <ImageIcon className="w-8 h-8 text-blue-500" />;
    if (dateiTyp === "application/pdf")
      return <FileText className="w-8 h-8 text-red-500" />;
    return <FileText className="w-8 h-8 text-gray-500" />;
  };

  const handleDownload = async (storagePfad, dateiname) => {
    try {
      const { data, error } = await supabase.storage
        .from("user-dokumente")
        .download(storagePfad);
      if (error) throw error;
      const blob = new Blob([data]);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = dateiname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Download Fehler:", err);
      setError(`Download fehlgeschlagen: ${err.message}`);
    }
  };

  return (
    <div
      className={`max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4 min-h-screen ${
        theme === "dark"
          ? "bg-dark-bg text-dark-text-main"
          : "bg-light-bg text-light-text-main"
      }`}
    >
      <h1 className="text-2xl font-bold mb-6">Meine Dokumente</h1>
      {zugehoerigeAufgabeId && (
        <p
          className={`mb-4 p-3 rounded-card-sm text-sm ${
            theme === "dark"
              ? "bg-secondary-500/20 text-secondary-500"
              : "bg-light-accent-blue/20 text-light-accent-blue"
          }`}
        >
          Dokumente werden der Aufgabe mit ID zugeordnet: {zugehoerigeAufgabeId}
          (
          <Link
            to={`/todos?edit=${zugehoerigeAufgabeId}`}
            className="underline hover:opacity-80"
          >
            Zur Aufgabe
          </Link>
          )
        </p>
      )}

      <div
        className={`mb-8 p-6 rounded-card shadow-elevation-2 ${
          theme === "dark" ? "bg-dark-card-bg" : "bg-light-card-bg"
        }`}
      >
        <h2 className="text-xl font-semibold mb-4">Neues Dokument hochladen</h2>
        <div
          {...getRootProps()}
          className={`p-8 border-2 border-dashed rounded-card-sm cursor-pointer text-center transition-colors
          ${
            isDragActive
              ? theme === "dark"
                ? "border-secondary-500 bg-dark-bg-hover"
                : "border-light-accent-blue bg-light-bg-hover"
              : theme === "dark"
              ? "border-dark-border hover:border-secondary-500"
              : "border-light-border hover:border-light-accent-blue"
          }
        `}
        >
          <input {...getInputProps()} />
          <UploadCloud
            className={`w-12 h-12 mx-auto mb-3 ${
              theme === "dark"
                ? "text-dark-text-secondary"
                : "text-light-text-secondary"
            }`}
          />
          {isDragActive ? (
            <p>Datei hier fallen lassen...</p>
          ) : (
            <p>Datei hierher ziehen oder klicken, um auszuwählen.</p>
          )}
        </div>
        {selectedFile && (
          <div className="mt-4">
            <p className="text-sm">
              Ausgewählt: {selectedFile.name} (
              {Math.round(selectedFile.size / 1024)} KB)
            </p>
            <input
              type="text"
              placeholder="Optionale Beschreibung..."
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              className={`mt-2 w-full p-2 border rounded-card-sm ${
                theme === "dark"
                  ? "bg-dark-input text-dark-text-main border-dark-border"
                  : "bg-light-input text-light-text-main border-light-border"
              }`}
            />
            {!location.search.includes("aufgabeId=") && (
              <input
                type="text"
                placeholder="Aufgaben-ID (optional)"
                value={zugehoerigeAufgabeId}
                onChange={(e) => setZugehoerigeAufgabeId(e.target.value)}
                className={`mt-2 w-full p-2 border rounded-card-sm ${
                  theme === "dark"
                    ? "bg-dark-input text-dark-text-main border-dark-border"
                    : "bg-light-input text-light-text-main border-light-border"
                }`}
              />
            )}
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className={`mt-4 px-4 py-2 rounded-pill font-semibold transition-colors ${
            !selectedFile || uploading
              ? theme === "dark"
                ? "bg-dark-border text-dark-text-secondary"
                : "bg-light-border text-light-text-secondary"
              : theme === "dark"
              ? "bg-primary-500 hover:bg-primary-600 text-white"
              : "bg-primary-500 hover:bg-primary-600 text-white"
          }`}
        >
          {uploading ? "Lädt hoch..." : "Hochladen"}
        </button>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>

      {/* KI-Vorschlag Banner */}
      {(kiLaed || kiVorschlag) && (
        <div className={`mb-6 p-4 rounded-card border flex items-start gap-3 ${
          theme === "dark"
            ? "bg-dark-card-bg border-primary-500/40"
            : "bg-light-card-bg border-primary-500/40"
        }`}>
          <Sparkles size={18} className="text-primary-500 dark:text-primary-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {kiLaed ? (
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                KI analysiert das Dokument...
              </p>
            ) : kiVorschlag ? (
              <>
                <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main mb-0.5">
                  KI-Vorschlag: <span className="font-normal">{kiVorschlag.beschreibung}</span>
                </p>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Kategorie: {kiVorschlag.kategorie_hinweis}
                </p>
              </>
            ) : null}
          </div>
          {kiVorschlag && !kiLaed && (
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              <button
                onClick={applyKiVorschlag}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-card-sm bg-primary-500 hover:bg-primary-600 text-white hover:opacity-90"
                title="Vorschlag übernehmen"
              >
                <Check size={13} /> Übernehmen
              </button>
              <button
                onClick={() => setKiVorschlag(null)}
                className="p-1.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-500"
                title="Vorschlag ablehnen"
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Hochgeladene Dokumente</h2>
        {dokumente.length === 0 && !loading && (
          <p
            className={`${
              theme === "dark"
                ? "text-dark-text-secondary"
                : "text-light-text-secondary"
            }`}
          >
            Noch keine Dokumente hochgeladen.
          </p>
        )}
        {loading && dokumente.length === 0 && (
          <p
            className={`${
              theme === "dark"
                ? "text-dark-text-secondary"
                : "text-light-text-secondary"
            }`}
          >
            Lade Dokumente...
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dokumente.map((doc) => (
            <div
              key={doc.id}
              className={`p-4 rounded-card shadow-elevation-2 ${
                theme === "dark" ? "bg-dark-card-bg" : "bg-light-card-bg"
              }`}
            >
              <div className="flex items-center mb-2">
                {getFileIcon(doc.datei_typ)}
                <span
                  className="ml-3 font-semibold truncate"
                  title={doc.dateiname}
                >
                  {doc.dateiname}
                </span>
              </div>
              {doc.beschreibung && (
                <p
                  className={`text-xs mb-1 ${
                    theme === "dark"
                      ? "text-dark-text-secondary"
                      : "text-light-text-secondary"
                  }`}
                >
                  {doc.beschreibung}
                </p>
              )}
              <p
                className={`text-xs mb-2 ${
                  theme === "dark"
                    ? "text-dark-text-disabled"
                    : "text-light-text-disabled"
                }`}
              >
                Typ: {doc.datei_typ || "Unbekannt"}, Größe:{" "}
                {doc.groesse_kb || "?"} KB
              </p>
              {doc.todo_aufgabe_id && doc.todo_aufgaben && (
                <Link
                  to={`/todos?edit=${doc.todo_aufgabe_id}`}
                  className={`text-xs mb-1 flex items-center hover:underline ${
                    theme === "dark"
                      ? "text-dark-accent-purple"
                      : "text-light-accent-purple"
                  }`}
                  title={doc.todo_aufgaben.beschreibung}
                >
                  <Link2 size={12} className="mr-1 flex-shrink-0" />
                  <span className="truncate">
                    Aufg:{" "}
                    {doc.todo_aufgaben.beschreibung || doc.todo_aufgabe_id}
                  </span>
                </Link>
              )}
              <p
                className={`text-xs mb-3 ${
                  theme === "dark"
                    ? "text-dark-text-disabled"
                    : "text-light-text-disabled"
                }`}
              >
                Hochgeladen:{" "}
                {new Date(doc.erstellt_am).toLocaleDateString("de-DE")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    handleDownload(doc.storage_pfad, doc.dateiname)
                  }
                  className={`p-1.5 rounded hover:opacity-80 transition-colors ${
                    theme === "dark"
                      ? "bg-secondary-500 text-white"
                      : "bg-light-accent-blue text-white"
                  }`}
                  title="Herunterladen"
                >
                  {" "}
                  <Download size={16} />
                </button>
                <button
                  onClick={() => handleDelete(doc.id, doc.storage_pfad)}
                  className={`p-1.5 rounded hover:opacity-80 transition-colors ${
                    theme === "dark"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-red-500 hover:bg-red-600 text-white"
                  }`}
                  title="Löschen"
                >
                  {" "}
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DokumentenManager;
