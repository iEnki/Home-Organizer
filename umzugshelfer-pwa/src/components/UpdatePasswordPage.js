import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom"; // useLocation entfernt
import { KeyRound, ShieldCheck } from "lucide-react"; // AlertCircle entfernt

const UpdatePasswordPage = () => {
  const navigate = useNavigate();
  // const location = useLocation(); // Entfernt
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // const [isTokenValid, setIsTokenValid] = useState(false); // Entfernt
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    // Supabase behandelt den Token aus der URL (Fragment-Identifier #access_token=...)
    // automatisch, wenn onAuthStateChange getriggert wird.
    // Wir müssen hier eigentlich nur prüfen, ob ein User-Update möglich ist.
    // Ein direkter Check des Tokens ist clientseitig nicht trivial und oft nicht nötig,
    // da Supabase dies beim `updateUser` Call serverseitig validiert.

    // Wir können versuchen, die Session zu bekommen. Wenn ein Recovery-Token in der URL ist,
    // wird Supabase versuchen, eine Session damit zu erstellen oder den Nutzerstatus zu ändern.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // Dieser Event signalisiert, dass der Nutzer dem Recovery-Link gefolgt ist.
          // Die Session hier könnte temporär sein und nur für das Passwort-Update gültig.
          // setIsTokenValid(true); // Entfernt
        } else if (session) {
          // Wenn bereits eine volle Session besteht, ist der Nutzer vielleicht schon eingeloggt.
          // Für den Passwort-Reset-Flow ist das aber nicht unbedingt relevant,
          // solange der Recovery-Token gültig ist.
        }
        setCheckingToken(false);
      }
    );

    // Fallback, falls onAuthStateChange nicht sofort feuert oder der Event nicht kommt
    // Manchmal ist es besser, einfach das Formular anzuzeigen und Supabase die Token-Validierung
    // beim Absenden des neuen Passworts machen zu lassen.
    // Für eine bessere UX könnte man hier noch verfeinern.
    const timer = setTimeout(() => {
      if (checkingToken) {
        // Wenn nach kurzer Zeit immer noch kein Event kam
        setCheckingToken(false);
        // Wir nehmen an, der Nutzer ist auf der Seite, weil er einen Link geklickt hat.
        // Die eigentliche Token-Validierung passiert serverseitig bei updateUser.
        // setIsTokenValid(true); // Entfernt
      }
    }, 1500);

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [checkingToken]);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage("");

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }
      setMessage(
        "Dein Passwort wurde erfolgreich aktualisiert. Du wirst in Kürze zum Login weitergeleitet."
      );
      setTimeout(() => {
        navigate("/"); // Zurück zur HomePage (ehemals LoginPage)
      }, 3000);
    } catch (err) {
      console.error("Fehler beim Aktualisieren des Passworts:", err);
      setError(
        err.message ||
          "Ein Fehler ist beim Aktualisieren des Passworts aufgetreten."
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-dark-text-main">Überprüfe Token...</p>
      </div>
    );
  }

  // Wenn kein gültiger Recovery Flow aktiv ist (z.B. direkter Aufruf der Seite ohne Token)
  // Dies ist eine vereinfachte Annahme. Supabase validiert den Token serverseitig.
  // if (!isTokenValid && !location.hash.includes('access_token')) { // Striktere Prüfung, falls gewünscht
  //   return (
  //     <div className="min-h-screen flex items-center justify-center text-center p-4">
  //       <div className="bg-dark-card-bg p-8 rounded-lg shadow-xl border border-dark-border">
  //         <AlertCircle className="mx-auto h-12 w-auto text-danger-color mb-4" />
  //         <h2 className="text-2xl font-bold text-dark-text-main mb-2">Ungültiger Link</h2>
  //         <p className="text-dark-text-secondary mb-6">
  //           Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.
  //         </p>
  //         <button
  //           onClick={() => navigate("/")}
  //           className="bg-dark-accent-green text-dark-bg font-semibold py-2 px-4 rounded-md hover:opacity-90"
  //         >
  //           Zur Startseite
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-dark-card-bg p-10 rounded-xl shadow-2xl border border-dark-border">
        <div>
          <ShieldCheck className="mx-auto h-12 w-auto text-dark-accent-green" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-dark-text-main">
            Neues Passwort festlegen
          </h2>
        </div>

        {message && (
          <div className="mt-4 p-3 bg-dark-accent-green/20 text-dark-accent-green text-sm rounded-md">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 bg-danger-color/20 text-danger-color text-sm rounded-md">
            {error}
          </div>
        )}

        {!message && ( // Formular nur anzeigen, wenn keine Erfolgsmeldung da ist
          <form className="mt-8 space-y-6" onSubmit={handlePasswordReset}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound
                    className="h-5 w-5 text-dark-text-secondary"
                    aria-hidden="true"
                  />
                </div>
                <input
                  id="new-password"
                  name="new-password"
                  type="password"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-dark-border placeholder-dark-text-secondary text-dark-text-main bg-dark-border focus:outline-none focus:ring-dark-accent-green focus:border-dark-accent-green sm:text-sm"
                  placeholder="Neues Passwort"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound
                    className="h-5 w-5 text-dark-text-secondary"
                    aria-hidden="true"
                  />
                </div>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-dark-border placeholder-dark-text-secondary text-dark-text-main bg-dark-border focus:outline-none focus:ring-dark-accent-green focus:border-dark-accent-green sm:text-sm"
                  placeholder="Neues Passwort bestätigen"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-dark-bg bg-dark-accent-green hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dark-accent-green focus:ring-offset-dark-card-bg disabled:opacity-50"
              >
                {loading ? "Speichere..." : "Passwort aktualisieren"}
              </button>
            </div>
          </form>
        )}
        <div className="text-sm text-center mt-4">
          <button
            onClick={() => navigate("/")}
            className="font-medium text-dark-accent-green hover:opacity-80"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePasswordPage;
