// Supabase Edge Function: book-search
// Sucht Buecher ueber Open Library und Google Books API.
// Gibt normierte BookResult[] zurueck. JWT-Auth erforderlich.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
}

function normalizeIsbn(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/[-\s]/g, "").trim() || undefined;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df]/g, " ").replace(/\s+/g, " ").trim();
}

// Open Library Normierung
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
    source: "openlibrary",
    sourceRef: doc.key as string ?? "",
    confidence: isbn13 || isbn10 ? 0.9 : 0.6,
  };
}

// Google Books Normierung
function normalizeGoogleBooks(item: any): BookResult | null {
  const info = item.volumeInfo as any | undefined;
  if (!info?.title) return null;

  const authors: string[] = info.authors ?? [];
  const identifiers: Array<{ type: string; identifier: string }> = info.industryIdentifiers ?? [];
  const isbn13 = normalizeIsbn(identifiers.find((i) => i.type === "ISBN_13")?.identifier);
  const isbn10 = normalizeIsbn(identifiers.find((i) => i.type === "ISBN_10")?.identifier);

  const imageLinks = info.imageLinks ?? {};

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
    coverUrl: imageLinks.large ?? imageLinks.thumbnail,
    thumbnailUrl: imageLinks.thumbnail ?? imageLinks.smallThumbnail,
    source: "google_books",
    sourceRef: item.id as string ?? "",
    // Angeglichen auf 0.9 (wie Open Library) — Google Books hat bei deutschen Büchern
    // oft bessere Metadaten und soll beim Ranking nicht strukturell benachteiligt werden.
    confidence: isbn13 || isbn10 ? 0.9 : 0.55,
  };
}

// Normalisiert Sprachcodes: "de-DE" → "de", "ger"/"deu" → "de", Array → erstes Element
function normalizeLang(lang: string | string[] | undefined): string {
  const raw = Array.isArray(lang) ? lang[0] : lang;
  if (!raw) return "";
  const base = raw.split("-")[0].toLowerCase();
  const map: Record<string, string> = { ger: "de", deu: "de", eng: "en" };
  return map[base] ?? base;
}

// Berechnet einen kombinierten Score für einen Treffer
function scoreResult(r: BookResult, query: string, mode: string, requestedLang?: string): number {
  let score = r.confidence;

  // 1. Exakter ISBN-Match (stärkster Bonus)
  if (mode === "isbn") {
    const normQuery = normalizeIsbn(query) ?? "";
    const exactMatch = normQuery && (r.isbn13 === normQuery || r.isbn10 === normQuery);
    if (exactMatch) {
      score += 0.5;
    } else if (r.isbn13 || r.isbn10) {
      score += 0.1; // Hat irgendeine ISBN, aber nicht exakt die gesuchte
    }
  }

  // 2. Language-Bonus — kein Malus wenn Sprachfeld fehlt
  if (requestedLang && r.language) {
    if (normalizeLang(r.language) === normalizeLang(requestedLang)) {
      score += 0.3;
    }
  }

  // 3. Cover vorhanden (kleiner Qualitätsbonus)
  if (r.thumbnailUrl || r.coverUrl) {
    score += 0.05;
  }

  return score;
}

// Dedup: isbn13 → isbn10 → normalisierter title + first author
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
      key = `title:${normalizeTitle(r.title)}|author:${normalizeTitle(r.authors[0] ?? "")}`;
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
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
    // Plain query works better than intitle: for multilingual/German titles
    q = query;
  }

  // langRestrict must be a separate URL param, not part of q
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

  // JWT-Auth
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

  if (query.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Beide APIs parallel abfragen
  const [olResults, gbResults] = await Promise.all([
    searchOpenLibrary(query, mode, Math.ceil(limit / 2) + 2, language),
    searchGoogleBooks(query, mode, Math.ceil(limit / 2) + 2, language),
  ]);

  // Score → Sort → Dedup → Slice
  // Wichtig: Dedup NACH Sort, damit der bestbewertete Treffer pro ISBN-Key gewinnt
  // (nicht mehr Open Library automatisch bevorzugt durch Array-Reihenfolge).
  const allResults = [...olResults, ...gbResults];
  const scored = allResults
    .map((r) => ({ r, score: scoreResult(r, query, mode, language) }))
    .sort((a, b) => b.score - a.score);
  const sorted = dedup(scored.map((s) => s.r)).slice(0, limit);

  return new Response(JSON.stringify(sorted), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
