/**
 * Gibt die beste verfügbare Cover-URL zurück.
 * Unterstützt camelCase (API/BookResult) und snake_case (DB/Supabase).
 */
export function getBuchCoverUrl(buch) {
  return (
    buch?.thumbnail_url ?? buch?.thumbnailUrl ??
    buch?.cover_url    ?? buch?.coverUrl      ?? null
  );
}
