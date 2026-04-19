// Supabase Edge Function: book-search
// Sucht Buecher ueber Open Library und Google Books API.
// Gibt normierte BookResult[] zurueck. JWT-Auth erforderlich.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CoverCandidate {
  id: string;
  url: string;
  label: string;
  kind: string;
  source: string;
  width?: number;
  height?: number;
}

interface BookResult {
  title: string;
  subtitle?: string;
  authors: string[];
  authorDisplay: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  pageCount?: number;
  language?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
  source: string;
  sourceRef: string;
  confidence: number;
  score?: number;
  matchReasons?: string[];
  fieldMatches?: Record<string, boolean | number>;
  coverCandidates?: CoverCandidate[];
  needsReview?: boolean;
}

interface SearchContext {
  isbn13?: string;
  isbn10?: string;
  title?: string;
  subtitle?: string;
  authors?: string[] | string;
  publisher?: string;
  publishedYear?: number;
  language?: string;
  existingSource?: string;
  existingSourceRef?: string;
  coverUrl?: string;
}

const ALLOWED_EXTERNAL_IMAGE_HOSTS = new Set([
  "books.google.com",
  "books.googleusercontent.com",
  "covers.openlibrary.org",
  "archive.org",
]);

function normalizeIsbn(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/[-\s]/g, "").trim() || undefined;
}

function normalizeTitle(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthors(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => entry?.trim()).filter(Boolean);
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function sanitizeExternalUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const candidate = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const url = new URL(candidate);
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return undefined;
    if (!ALLOWED_EXTERNAL_IMAGE_HOSTS.has(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function uniqueBy<T>(items: T[], toKey: (entry: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = toKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeLang(lang: string | string[] | undefined): string {
  const raw = Array.isArray(lang) ? lang[0] : lang;
  if (!raw) return "";
  const base = raw.split("-")[0].toLowerCase();
  const map: Record<string, string> = { ger: "de", deu: "de", eng: "en" };
  return map[base] ?? base;
}

function tokenSimilarity(leftRaw: string | undefined, rightRaw: string | undefined): number {
  const left = normalizeTitle(leftRaw ?? "");
  const right = normalizeTitle(rightRaw ?? "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function getAuthorSimilarity(candidateAuthors: string[], requestedAuthors: string[]): number {
  if (!candidateAuthors.length || !requestedAuthors.length) return 0;
  return tokenSimilarity(candidateAuthors.join(" "), requestedAuthors.join(" "));
}

function buildOpenLibraryCoverCandidates(coverId?: number): CoverCandidate[] {
  if (!coverId) return [];
  return [
    {
      id: `openlibrary-s-${coverId}`,
      url: `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`,
      label: "Open Library S",
      kind: "thumbnail",
      source: "openlibrary",
      width: 80,
      height: 120,
    },
    {
      id: `openlibrary-m-${coverId}`,
      url: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
      label: "Open Library M",
      kind: "thumbnail",
      source: "openlibrary",
      width: 180,
      height: 260,
    },
    {
      id: `openlibrary-l-${coverId}`,
      url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
      label: "Open Library L",
      kind: "cover",
      source: "openlibrary",
      width: 500,
      height: 800,
    },
  ];
}

function buildGoogleCoverCandidates(imageLinks: Record<string, string> | undefined): CoverCandidate[] {
  if (!imageLinks) return [];
  const entries = [
    ["smallThumbnail", imageLinks.smallThumbnail, "thumbnail", 80, 120],
    ["thumbnail", imageLinks.thumbnail, "thumbnail", 128, 190],
    ["small", (imageLinks as any).small, "cover", 200, 300],
    ["medium", (imageLinks as any).medium, "cover", 300, 450],
    ["large", imageLinks.large, "cover", 500, 800],
    ["extraLarge", (imageLinks as any).extraLarge, "cover", 800, 1200],
  ].filter(([, url]) => !!url);

  return uniqueBy(
    entries.map(([key, url, kind, width, height]) => ({
      id: `google-${key}`,
      url: sanitizeExternalUrl(url as string) as string,
      label: `Google ${key}`,
      kind: kind as string,
      source: "google_books",
      width: width as number,
      height: height as number,
    })),
    (entry) => entry.url,
  ).filter((entry) => !!entry.url);
}

function buildGoogleCoverCandidatesByVolumeId(volumeId: string): CoverCandidate[] {
  if (!volumeId) return [];
  const base = `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1`;
  return [
    { id: `google-vol-zoom1`, url: `${base}&zoom=1`, label: "Google Cover (M)", kind: "cover", source: "google_books", width: 128, height: 190 },
    { id: `google-vol-zoom0`, url: `${base}&zoom=0`, label: "Google Cover (L)", kind: "cover", source: "google_books", width: 500, height: 750 },
    { id: `google-vol-zoom2`, url: `${base}&zoom=2`, label: "Google Cover (S)", kind: "thumbnail", source: "google_books", width: 80, height: 120 },
  ];
}

function normalizeOpenLibrary(doc: any): BookResult | null {
  const title = doc.title as string | undefined;
  if (!title) return null;

  const authors: string[] = (doc.author_name as string[] | undefined) ?? [];
  const isbn13s: string[] = (doc.isbn as string[] | undefined ?? [])
    .map(normalizeIsbn).filter((v): v is string => !!v && v.length === 13);
  const isbn10s: string[] = (doc.isbn as string[] | undefined ?? [])
    .map(normalizeIsbn).filter((v): v is string => !!v && v.length === 10);

  const isbn13 = isbn13s[0];
  const isbn10 = isbn10s[0];
  const coverId = doc.cover_i as number | undefined;

  return {
    title,
    authors,
    authorDisplay: authors.join(", "),
    isbn13,
    isbn10,
    publisher: (doc.publisher as string[] | undefined)?.[0],
    publishedYear: doc.first_publish_year as number | undefined,
    pageCount: doc.number_of_pages_median as number | undefined,
    language: (doc.language as string[] | undefined)?.[0],
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
    thumbnailUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
    coverCandidates: buildOpenLibraryCoverCandidates(coverId),
    source: "openlibrary",
    sourceRef: doc.key as string ?? "",
    confidence: isbn13 || isbn10 ? 0.9 : 0.6,
  };
}

function normalizeGoogleBooks(item: any): BookResult | null {
  const info = item.volumeInfo as any | undefined;
  if (!info?.title) return null;

  const authors: string[] = info.authors ?? [];
  const identifiers: Array<{ type: string; identifier: string }> = info.industryIdentifiers ?? [];
  const isbn13 = normalizeIsbn(identifiers.find((i) => i.type === "ISBN_13")?.identifier);
  const isbn10 = normalizeIsbn(identifiers.find((i) => i.type === "ISBN_10")?.identifier);
  const imageLinks = info.imageLinks ?? {};
  const volumeId = (item.id as string) ?? "";

  const directCandidates = buildGoogleCoverCandidates(imageLinks);
  const coverCandidates = directCandidates.length > 0
    ? directCandidates
    : buildGoogleCoverCandidatesByVolumeId(volumeId);

  const coverUrl = sanitizeExternalUrl(imageLinks.large ?? imageLinks.thumbnail)
    ?? (volumeId ? `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=1` : undefined);
  const thumbnailUrl = sanitizeExternalUrl(imageLinks.thumbnail ?? imageLinks.smallThumbnail)
    ?? (volumeId ? `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=2` : undefined);

  return {
    title: info.title,
    subtitle: info.subtitle,
    authors,
    authorDisplay: authors.join(", "),
    isbn13,
    isbn10,
    publisher: info.publisher,
    publishedYear: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4)) : undefined,
    description: info.description,
    pageCount: info.pageCount,
    language: info.language,
    coverUrl,
    thumbnailUrl,
    coverCandidates,
    source: "google_books",
    sourceRef: volumeId,
    confidence: isbn13 || isbn10 ? 0.9 : 0.55,
  };
}

function scoreResult(
  r: BookResult,
  query: string,
  mode: string,
  requestedLang?: string,
  context?: SearchContext,
): { score: number; matchReasons: string[]; fieldMatches: Record<string, boolean | number> } {
  let score = r.confidence;
  const matchReasons: string[] = [];
  const fieldMatches: Record<string, boolean | number> = {};
  const requestedAuthors = normalizeAuthors(context?.authors);
  const candidateAuthors = normalizeAuthors(r.authors);

  if (mode === "isbn") {
    const normQuery = normalizeIsbn(query) ?? "";
    const exactMatch = normQuery && (r.isbn13 === normQuery || r.isbn10 === normQuery);
    if (exactMatch) {
      score += 0.9;
      matchReasons.push("Exakte ISBN");
      fieldMatches.isbnExact = true;
    } else if (r.isbn13 || r.isbn10) {
      score += 0.1;
      fieldMatches.isbnExact = false;
    }
  }

  if (requestedLang && r.language && normalizeLang(r.language) === normalizeLang(requestedLang)) {
    score += 0.3;
    matchReasons.push("Passende Sprache");
    fieldMatches.language = true;
  }

  const contextTitle = context?.title?.trim() || (mode === "title" ? query : "");
  if (contextTitle) {
    const titleSimilarity = tokenSimilarity(r.title, contextTitle);
    fieldMatches.titleSimilarity = Number(titleSimilarity.toFixed(3));
    if (titleSimilarity >= 0.98) {
      score += 0.7;
      matchReasons.push("Titel exakt");
    } else if (titleSimilarity >= 0.8) {
      score += 0.45;
      matchReasons.push("Titel sehr ähnlich");
    } else if (titleSimilarity >= 0.55) {
      score += 0.2;
    }
  }

  if (context?.subtitle && r.subtitle) {
    const subtitleSimilarity = tokenSimilarity(r.subtitle, context.subtitle);
    fieldMatches.subtitleSimilarity = Number(subtitleSimilarity.toFixed(3));
    if (subtitleSimilarity >= 0.8) {
      score += 0.18;
      matchReasons.push("Untertitel ähnlich");
    }
  }

  if (requestedAuthors.length) {
    const authorSimilarity = getAuthorSimilarity(candidateAuthors, requestedAuthors);
    fieldMatches.authorSimilarity = Number(authorSimilarity.toFixed(3));
    if (authorSimilarity >= 0.98) {
      score += 0.45;
      matchReasons.push("Autor exakt");
    } else if (authorSimilarity >= 0.7) {
      score += 0.25;
      matchReasons.push("Autor ähnlich");
    }
  }

  if (context?.publisher && r.publisher) {
    const publisherSimilarity = tokenSimilarity(r.publisher, context.publisher);
    fieldMatches.publisherSimilarity = Number(publisherSimilarity.toFixed(3));
    if (publisherSimilarity >= 0.95) {
      score += 0.2;
      matchReasons.push("Verlag passt");
    } else if (publisherSimilarity >= 0.7) {
      score += 0.1;
    }
  }

  if (context?.publishedYear && r.publishedYear) {
    const delta = Math.abs(Number(context.publishedYear) - Number(r.publishedYear));
    fieldMatches.yearDelta = delta;
    if (delta === 0) {
      score += 0.16;
      matchReasons.push("Jahr passt");
    } else if (delta === 1) {
      score += 0.05;
    }
  }

  if (context?.existingSource && context.existingSource === r.source) {
    score += 0.08;
    matchReasons.push("Bekannte Quelle");
    fieldMatches.source = true;
  }
  if (context?.existingSourceRef && context.existingSourceRef === r.sourceRef) {
    score += 0.45;
    matchReasons.push("Gleiche API-Referenz");
    fieldMatches.sourceRef = true;
  }

  if (r.thumbnailUrl || r.coverUrl || r.coverCandidates?.length) {
    score += 0.05;
    fieldMatches.cover = true;
  }

  return { score, matchReasons, fieldMatches };
}

function dedup(results: BookResult[]): BookResult[] {
  const seen = new Set<string>();
  const out: BookResult[] = [];
  for (const r of results) {
    let key: string;
    if (r.isbn13) {
      key = `isbn13:${r.isbn13}`;
    } else if (r.isbn10) {
      key = `isbn10:${r.isbn10}`;
    } else {
      key = `title:${normalizeTitle(r.title)}|author:${normalizeTitle(r.authors[0] ?? "")}|publisher:${normalizeTitle(r.publisher ?? "")}|year:${r.publishedYear ?? ""}`;
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchOpenLibrary(query: string, mode: string, limit: number, language?: string): Promise<BookResult[]> {
  let param: string;
  if (mode === "isbn") {
    param = `isbn=${encodeURIComponent(query)}`;
  } else if (mode === "author") {
    param = `author=${encodeURIComponent(query)}`;
  } else {
    param = `q=${encodeURIComponent(query)}`;
  }

  const langParam = language ? `&language=${encodeURIComponent(language)}` : "";

  try {
    const res = await fetchWithTimeout(
      `https://openlibrary.org/search.json?${param}&limit=${limit}&fields=key,title,author_name,isbn,publisher,first_publish_year,number_of_pages_median,language,cover_i${langParam}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs as any[] ?? [])
      .map(normalizeOpenLibrary)
      .filter((r): r is BookResult => r !== null);
  } catch {
    return [];
  }
}

async function searchGoogleBooks(query: string, mode: string, limit: number, language?: string): Promise<BookResult[]> {
  let q: string;
  if (mode === "isbn") {
    q = `isbn:${query}`;
  } else if (mode === "author") {
    q = `inauthor:${query}`;
  } else {
    q = query;
  }

  const langParam = language ? `&langRestrict=${encodeURIComponent(language)}` : "";

  try {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${limit}&printType=books${langParam}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items as any[] ?? [])
      .map(normalizeGoogleBooks)
      .filter((r): r is BookResult => r !== null);
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Ungültiger Token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ungültiger Body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const query: string = (body.query ?? "").trim();
  const mode: string = body.mode ?? "title";
  const limit: number = Math.min(body.limit ?? 10, 20);
  const language: string | undefined = body.language;
  const context: SearchContext | undefined = body.context;

  if (query.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const perSource = Math.ceil(limit / 2) + 2;

  async function runSearch(q: string): Promise<BookResult[]> {
    const [ol, gb] = await Promise.all([
      searchOpenLibrary(q, mode, perSource, language),
      searchGoogleBooks(q, mode, perSource, language),
    ]);
    return [...ol, ...gb];
  }

  function buildFallbackQueries(): string[] {
    const fallbacks: string[] = [];
    if (!context) return fallbacks;
    const ctxTitle = (context.title ?? "").trim();
    const ctxAuthors = normalizeAuthors(context.authors);
    const ctxAuthor = ctxAuthors[0] ?? "";
    if (ctxTitle && ctxAuthor) {
      const candidate = `${ctxTitle} ${ctxAuthor}`.trim();
      if (candidate.toLowerCase() !== query.toLowerCase()) fallbacks.push(candidate);
    }
    if (ctxTitle && ctxTitle.toLowerCase() !== query.toLowerCase()) {
      fallbacks.push(ctxTitle);
    }
    return fallbacks;
  }

  let allResults = await runSearch(query);

  if (allResults.length === 0 && mode !== "isbn") {
    for (const fallback of buildFallbackQueries()) {
      allResults = await runSearch(fallback);
      if (allResults.length > 0) break;
    }
  }

  const scored = allResults
    .map((r) => {
      const meta = scoreResult(r, query, mode, language, context);
      return {
        r: {
          ...r,
          score: Number(meta.score.toFixed(3)),
          matchReasons: meta.matchReasons,
          fieldMatches: meta.fieldMatches,
        },
        score: meta.score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const deduped = dedup(scored.map((s) => s.r)).slice(0, limit);
  const topScore = deduped[0]?.score ?? 0;
  const secondScore = deduped[1]?.score ?? 0;
  const topGap = topScore - secondScore;
  const contextAuthors = normalizeAuthors(context?.authors);

  const sorted = deduped.map((entry, index) => {
    const titleConflict = Boolean(context?.title && tokenSimilarity(context.title, entry.title) < 0.55);
    const authorConflict = Boolean(contextAuthors.length && getAuthorSimilarity(entry.authors, contextAuthors) < 0.45);
    return {
      ...entry,
      needsReview: index === 0
        ? titleConflict || authorConflict || (deduped.length > 1 && topGap < 0.35)
        : false,
    };
  });

  return new Response(JSON.stringify(sorted), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
