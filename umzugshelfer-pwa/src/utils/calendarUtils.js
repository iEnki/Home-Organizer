import { createEvents } from "ics";

/**
 * Generiert die Daten für eine .ics-Datei aus einem einzelnen Termin.
 * @param {object} eventDetails - Die Details des Termins.
 * @param {string} eventDetails.title - Titel des Termins.
 * @param {Array<number>} eventDetails.start - Startzeit als Array: [Jahr, Monat, Tag, Stunde, Minute].
 * @param {Array<number>} [eventDetails.end] - Endzeit als Array: [Jahr, Monat, Tag, Stunde, Minute]. Entweder end oder duration angeben.
 * @param {{hours?: number, minutes?: number, seconds?: number}} [eventDetails.duration] - Dauer des Termins. Entweder end oder duration angeben.
 * @param {string} [eventDetails.description] - Beschreibung des Termins.
 * @param {string} [eventDetails.location] - Ort des Termins.
 * @param {string} [eventDetails.uid] - Eindeutige ID für den Termin (optional, wird generiert falls nicht vorhanden).
 * @param {string} [eventDetails.calName] - Name des Kalenders (optional).
 * @returns {Promise<string|null>} - Ein Promise, das zu den .ics-Daten als String oder null bei einem Fehler auflöst.
 */
export const generateIcsData = async (eventDetails) => {
  if (!eventDetails || !eventDetails.title || !eventDetails.start) {
    console.error("Ungültige Termindetails für iCalendar-Export.");
    return null;
  }

  const event = {
    title: eventDetails.title,
    start: eventDetails.start,
    end: eventDetails.end,
    duration: eventDetails.duration,
    description: eventDetails.description,
    location: eventDetails.location,
    uid: eventDetails.uid || `${Date.now()}@umzugsplaner.app`, // Eindeutige ID generieren
    calName: eventDetails.calName || "Umzugsplaner Termine",
    // Weitere Optionen könnten hier hinzugefügt werden, z.B. Alarme, Wiederholungen etc.
  };

  // Sicherstellen, dass entweder end oder duration vorhanden ist, wenn beide fehlen, Standarddauer setzen
  if (!event.end && !event.duration) {
    event.duration = { hours: 1 }; // Standarddauer von 1 Stunde
  }

  try {
    const { error, value } = createEvents([event]);
    if (error) {
      console.error(
        "Fehler beim Erstellen der iCalendar-Daten (createEvents):",
        error
      ); // Logge das error Objekt
      // Um mehr Details zu sehen, falls error ein Objekt ist:
      // if (typeof error === 'object' && error !== null) {
      //   for (const key in error) {
      //     console.error(`Error Detail (${key}):`, error[key]);
      //   }
      // }
      return null;
    }
    return value;
  } catch (err) {
    console.error(
      "Unerwarteter Fehler beim Erstellen der iCalendar-Daten:",
      err
    );
    return null;
  }
};

/**
 * Löst den Download einer .ics-Datei im Browser aus.
 * @param {string} icsData - Die .ics-Daten als String.
 * @param {string} filename - Der gewünschte Dateiname (ohne .ics Endung).
 */
export const downloadIcsFile = (icsData, filename = "termin") => {
  if (!icsData) {
    console.error("Keine iCalendar-Daten zum Herunterladen vorhanden.");
    return;
  }

  const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename.replace(/[^a-z0-9_.-]/gi, "_")}.ics`; // Dateinamen bereinigen
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

// Beispiel für die Verwendung:
// import { generateIcsData, downloadIcsFile } from './calendarUtils';
//
// const myEvent = {
//   title: 'Umzugstag',
//   start: [2025, 12, 24, 10, 0], // Jahr, Monat (1-12), Tag, Stunde, Minute
//   duration: { hours: 8 },
//   description: 'Der große Tag!',
//   location: 'Neue Adresse 1, 12345 Stadt'
// };
//
// const handleExportClick = async () => {
//   const icsData = await generateIcsData(myEvent);
//   if (icsData) {
//     downloadIcsFile(icsData, 'Umzugstag_Export');
//   }
// };
