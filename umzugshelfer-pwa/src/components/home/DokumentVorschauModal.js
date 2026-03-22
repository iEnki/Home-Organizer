import React, { useState, useEffect } from "react";
import { X, Loader2, Download, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "../../supabaseClient";

const DokumentVorschauModal = ({ storagePfad, dateiname, datei_typ, onSchliessen }) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState(null);

  useEffect(() => {
    let aborted = false;
    const ladeUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("user-dokumente")
          .createSignedUrl(storagePfad, 3600);
        if (aborted) return;
        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (err) {
        if (!aborted) setFehler(err.message);
      } finally {
        if (!aborted) setLaden(false);
      }
    };
    ladeUrl();
    return () => { aborted = true; };
  }, [storagePfad]);

  const istBild = datei_typ?.startsWith("image/");
  const istPdf = datei_typ === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onSchliessen(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-canvas-1 border-b border-canvas-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-primary-500 flex-shrink-0" />
          <span className="text-sm font-medium text-dark-text-main truncate">{dateiname}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {signedUrl && (
            <a
              href={signedUrl}
              download={dateiname}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-card-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
            >
              <Download size={12} /> Herunterladen
            </a>
          )}
          <button
            onClick={onSchliessen}
            className="w-8 h-8 flex items-center justify-center rounded-card-sm hover:bg-canvas-3 text-dark-text-secondary"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Inhalt */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
        {laden && (
          <div className="flex flex-col items-center gap-3 text-dark-text-secondary">
            <Loader2 size={32} className="animate-spin text-primary-500" />
            <span className="text-sm">Dokument wird geladen…</span>
          </div>
        )}

        {fehler && (
          <div className="flex flex-col items-center gap-3 text-dark-text-secondary max-w-sm text-center">
            <AlertTriangle size={32} className="text-accent-danger" />
            <p className="text-sm">Vorschau konnte nicht geladen werden.</p>
            <p className="text-xs text-dark-text-secondary opacity-60">{fehler}</p>
          </div>
        )}

        {!laden && !fehler && signedUrl && (
          <>
            {istBild && (
              <img
                src={signedUrl}
                alt={dateiname}
                className="max-w-full max-h-full object-contain rounded-card shadow-elevation-3"
              />
            )}
            {istPdf && (
              <iframe
                src={signedUrl}
                title={dateiname}
                className="w-full h-full rounded-card shadow-elevation-3 bg-white"
                style={{ minHeight: "60vh" }}
              />
            )}
            {!istBild && !istPdf && (
              <div className="flex flex-col items-center gap-4 text-dark-text-secondary">
                <FileText size={48} className="opacity-40" />
                <p className="text-sm">Dieses Dateiformat kann nicht angezeigt werden.</p>
                <a
                  href={signedUrl}
                  download={dateiname}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-pill text-sm"
                >
                  <Download size={14} /> Herunterladen
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DokumentVorschauModal;
