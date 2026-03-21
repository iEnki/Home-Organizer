import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useHaushalt } from "../../contexts/HaushaltsContext";
import { CheckCircle, AlertCircle, Loader } from "lucide-react";

const EinladungAnnehmen = ({ session }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { ladeHaushalt } = useHaushalt();

  const [status, setStatus] = useState("laden"); // 'laden' | 'erfolg' | 'fehler'
  const [fehlerText, setFehlerText] = useState("");

  useEffect(() => {
    // Nicht eingeloggt → Code in sessionStorage sichern und zu Login
    if (!session) {
      sessionStorage.setItem("einladungs_code", code);
      navigate(`/login?redirect=/einladung/${code}`, { replace: true });
      return;
    }

    const annehmen = async () => {
      const { error } = await supabase.rpc("einladung_annehmen", {
        p_code: code,
      });

      if (error) {
        setFehlerText(error.message || "Die Einladung ist ungültig oder abgelaufen.");
        setStatus("fehler");
        return;
      }

      await ladeHaushalt();
      setStatus("erfolg");

      // Nach kurzem Delay zur Startseite weiterleiten
      setTimeout(() => navigate("/home", { replace: true }), 2000);
    };

    annehmen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-canvas-1 p-4">
      <div className="w-full max-w-sm text-center">
        {status === "laden" && (
          <>
            <Loader className="w-12 h-12 mx-auto animate-spin text-light-accent-purple dark:text-accent-purple mb-4" />
            <p className="text-light-text-main dark:text-dark-text-main font-medium">
              Einladung wird überprüft…
            </p>
          </>
        )}

        {status === "erfolg" && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-light-text-main dark:text-dark-text-main mb-2">
              Erfolgreich beigetreten!
            </h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Du wirst gleich weitergeleitet…
            </p>
          </>
        )}

        {status === "fehler" && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-light-text-main dark:text-dark-text-main mb-2">
              Einladung ungültig
            </h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
              {fehlerText}
            </p>
            <button
              onClick={() => navigate("/home", { replace: true })}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity"
            >
              Zur Startseite
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EinladungAnnehmen;
