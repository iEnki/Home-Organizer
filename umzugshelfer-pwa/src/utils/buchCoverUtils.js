import { sanitizeExternalUrl } from "./bookSearch";

/**
 * Gibt die beste verfuegbare und sichere Cover-URL zurueck.
 * Unterstuetzt camelCase (API/BookResult) und snake_case (DB/Supabase).
 */
export function getBuchCoverUrl(buch) {
  return [
    buch?.api_payload?.selectedCover?.storedUrl,
    buch?.api_payload?.selectedCover?.url,
    buch?.thumbnail_url,
    buch?.thumbnailUrl,
    buch?.cover_url,
    buch?.coverUrl,
  ].map(sanitizeExternalUrl).find(Boolean) ?? null;
}
