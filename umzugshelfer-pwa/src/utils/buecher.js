// Single Source of Truth fuer Buch-Konstanten und Hilfsfunktionen

export const BUCH_STATUS = {
  im_regal:   "Im Regal",
  verliehen:  "Verliehen",
  vermisst:   "Vermisst",
  verschenkt: "Verschenkt",
  entsorgt:   "Entsorgt",
};

export const BUCH_STATUS_FARBEN = {
  im_regal:   "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  verliehen:  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  vermisst:   "bg-red-500/10 text-red-700 dark:text-red-300",
  verschenkt: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  entsorgt:   "bg-gray-500/10 text-gray-500",
};

export const BUCH_ZUSTAND = {
  sehr_gut:   "Sehr gut",
  gut:        "Gut",
  akzeptabel: "Akzeptabel",
  schlecht:   "Schlecht",
};

export const BUCH_SORTIERUNGEN = [
  { value: "titel_asc",      label: "Titel A–Z" },
  { value: "titel_desc",     label: "Titel Z–A" },
  { value: "autor_asc",      label: "Autor A–Z" },
  { value: "jahr_desc",      label: "Jahr (neu zuerst)" },
  { value: "created_desc",   label: "Zuletzt hinzugefügt" },
];

export const formatAutoren = (autoren) => {
  if (!autoren || autoren.length === 0) return "";
  return autoren.join(", ");
};

// Normiert einen Open-Library-Treffer in das interne BookResult-Format
export const normalizeBuchFromOpenLibrary = (doc) => {
  if (!doc?.title) return null;
  const autoren = doc.author_name ?? [];
  const isbns = doc.isbn ?? [];
  const isbn13 = isbns.find((i) => i.replace(/[-\s]/g, "").length === 13)?.replace(/[-\s]/g, "");
  const isbn10 = isbns.find((i) => i.replace(/[-\s]/g, "").length === 10)?.replace(/[-\s]/g, "");
  const coverId = doc.cover_i;
  return {
    title: doc.title,
    authors: autoren,
    authorDisplay: autoren.join(", "),
    isbn13,
    isbn10,
    publisher: doc.publisher?.[0],
    publishedYear: doc.first_publish_year,
    pageCount: doc.number_of_pages_median,
    language: doc.language?.[0],
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
    thumbnailUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
    source: "openlibrary",
    sourceRef: doc.key ?? "",
    confidence: isbn13 || isbn10 ? 0.9 : 0.6,
  };
};

// Normiert einen Google-Books-Treffer in das interne BookResult-Format
export const normalizeBuchFromGoogleBooks = (item) => {
  const info = item?.volumeInfo;
  if (!info?.title) return null;
  const identifiers = info.industryIdentifiers ?? [];
  const isbn13 = identifiers.find((i) => i.type === "ISBN_13")?.identifier?.replace(/[-\s]/g, "");
  const isbn10 = identifiers.find((i) => i.type === "ISBN_10")?.identifier?.replace(/[-\s]/g, "");
  const autoren = info.authors ?? [];
  const images = info.imageLinks ?? {};
  return {
    title: info.title,
    subtitle: info.subtitle,
    authors: autoren,
    authorDisplay: autoren.join(", "),
    isbn13,
    isbn10,
    publisher: info.publisher,
    publishedYear: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4)) : undefined,
    description: info.description,
    pageCount: info.pageCount,
    language: info.language,
    coverUrl: images.large ?? images.thumbnail,
    thumbnailUrl: images.thumbnail ?? images.smallThumbnail,
    source: "google_books",
    sourceRef: item.id ?? "",
    confidence: isbn13 || isbn10 ? 0.85 : 0.55,
  };
};
