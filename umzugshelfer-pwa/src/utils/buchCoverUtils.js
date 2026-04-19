import { sanitizeExternalUrl } from "./bookSearch";

function httpsUrl(u) {
  if (!u || typeof u !== "string") return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getBuchCoverUrl(buch) {
  const fromApi = [
    buch?.api_payload?.selectedCover?.storedUrl,
    buch?.api_payload?.selectedCover?.url,
  ].map(sanitizeExternalUrl).find(Boolean);

  if (fromApi) return fromApi;

  for (const raw of [buch?.thumbnail_url, buch?.thumbnailUrl, buch?.cover_url, buch?.coverUrl]) {
    const safe = sanitizeExternalUrl(raw) ?? httpsUrl(raw);
    if (safe) return safe;
  }
  return null;
}
