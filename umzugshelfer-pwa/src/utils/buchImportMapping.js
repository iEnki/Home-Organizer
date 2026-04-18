/**
 * Mapping-Hilfsfunktionen für den Buch-Stapelimport.
 *
 * BookResult (von book-search, direkt als Array — kein .items-Wrapper!) → Kandidat → home_buecher
 * ort_id / lagerort_id werden stets aus dem Parent-Import (home_buch_importe) bezogen.
 */

/**
 * Wandelt ein BookResult in ein home_buch_import_kandidaten-INSERT-Payload um.
 * roh_daten = KI-Erkennungsdaten (bei Scan: { isbn }; bei Foto: { titel, autor, isbn, confidence })
 * api_match = das BookResult wie von book-search zurückgegeben
 * vorschlag = zusammengeführte Daten als vorausgefüllter Buchvorschlag
 */
export const buchResultZuKandidat = (bookResult, importId, householdId, rohDaten = {}) => {
  const vorschlag = {
    titel:            bookResult.title,
    untertitel:       bookResult.subtitle ?? null,
    autoren:          bookResult.authors ?? [],
    autor_anzeige:    bookResult.authorDisplay ?? null,
    isbn_13:          bookResult.isbn13 ?? null,
    isbn_10:          bookResult.isbn10 ?? null,
    verlag:           bookResult.publisher ?? null,
    erscheinungsjahr: bookResult.publishedYear ?? null,
    seitenzahl:       bookResult.pageCount ?? null,
    beschreibung:     bookResult.description ?? null,
    cover_url:        bookResult.coverUrl ?? null,
    thumbnail_url:    bookResult.thumbnailUrl ?? null,
    sprache:          bookResult.language ?? "de",
    api_quelle:       bookResult.source ?? null,
    api_ref:          bookResult.sourceRef ?? null,
  };

  return {
    household_id:  householdId,
    import_id:     importId,
    roh_daten:     rohDaten,
    api_match:     bookResult,
    confidence:    bookResult.confidence ?? null,
    vorschlag,
    review_status: "ausstehend",
  };
};

/**
 * Wandelt einen home_buch_import_kandidaten (vorschlag-JSONB + Parent-Import-Daten)
 * in ein home_buecher-INSERT-Payload um.
 *
 * ortId / lagerortId kommen aus dem Parent-Import-Datensatz — nie aus lokalem State.
 */
export const kandidatZuBuch = (kandidat, householdId, userId, ortId, lagerortId) => {
  const v = kandidat.vorschlag ?? {};
  return {
    household_id:     householdId,
    user_id:          userId,
    created_by_user_id: userId,
    titel:            v.titel,
    untertitel:       v.untertitel ?? null,
    autoren:          v.autoren ?? [],
    autor_anzeige:    v.autor_anzeige ?? null,
    isbn_13:          v.isbn_13 ?? null,
    isbn_10:          v.isbn_10 ?? null,
    verlag:           v.verlag ?? null,
    erscheinungsjahr: v.erscheinungsjahr ?? null,
    seitenzahl:       v.seitenzahl ?? null,
    beschreibung:     v.beschreibung ?? null,
    cover_url:        v.cover_url ?? null,
    thumbnail_url:    v.thumbnail_url ?? null,
    sprache:          v.sprache ?? "de",
    api_quelle:       v.api_quelle ?? null,
    api_ref:          v.api_ref ?? null,
    api_payload:      {
      selectedMatch: kandidat.api_match ?? null,
      coverCandidates: kandidat.api_match?.coverCandidates ?? [],
      selectedCover: kandidat.api_match?.coverCandidates?.[0] ?? null,
    },
    scan_quelle:      "import",
    scan_confidence:  kandidat.confidence ?? null,
    ort_id:           ortId ?? null,
    lagerort_id:      lagerortId ?? null,
    status:           "im_regal",
    anzahl:           1,
  };
};

/**
 * Legt einen Import-Batch an:
 * 1. home_buch_importe INSERT → status = "in_bearbeitung"
 * 2. N home_buch_import_kandidaten INSERT
 * Gibt die importId zurück.
 *
 * kandidaten: Array von { bookResult, rohDaten? }
 */
export const erstelleImportBatch = async (
  supabase,
  householdId,
  userId,
  kandidaten,
  ortId,
  lagerortId,
  quelle = "regal_scan",
) => {
  // 1. Parent-Import anlegen
  const { data: importData, error: importError } = await supabase
    .from("home_buch_importe")
    .insert({
      household_id: householdId,
      user_id:      userId,
      quelle,
      status:       "in_bearbeitung",
      ort_id:       ortId ?? null,
      lagerort_id:  lagerortId ?? null,
    })
    .select("id")
    .single();

  if (importError) throw importError;
  const importId = importData.id;

  // 2. Kandidaten anlegen
  const kandidatenPayload = kandidaten.map(({ bookResult, rohDaten = {} }) =>
    buchResultZuKandidat(bookResult, importId, householdId, rohDaten)
  );

  const { error: kandidatenError } = await supabase
    .from("home_buch_import_kandidaten")
    .insert(kandidatenPayload);

  if (kandidatenError) throw kandidatenError;

  return importId;
};
