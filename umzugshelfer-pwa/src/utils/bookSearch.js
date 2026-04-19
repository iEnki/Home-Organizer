import { supabase } from "../supabaseClient";
import { cleanKiJsonResponse, getKiClient } from "./kiClient";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL?.replace(/\/$/, "");
const DEFAULT_LANGUAGE = "de";
const HIGH_CONFIDENCE_SCORE = 2.2;
const CLEAR_GAP_SCORE = 0.35;
const AI_RERANK_DISABLED_KEY = "__book_ai_rerank_disabled";
const ALLOWED_EXTERNAL_IMAGE_HOSTS = [
  "books.google.com",
  "books.googleusercontent.com",
  "covers.openlibrary.org",
  "archive.org",
];
const SUPABASE_HOST = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : null;

let aiRerankCapabilityPromise = null;

function normalizeText(value) {
  return (value ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueBy(items, toKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = toKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toAuthors(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function getSessionFlagStore() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return window.sessionStorage;
}

function isAiRerankDisabledForSession() {
  const store = getSessionFlagStore();
  return store?.getItem(AI_RERANK_DISABLED_KEY) === "1";
}

function disableAiRerankForSession() {
  const store = getSessionFlagStore();
  store?.setItem(AI_RERANK_DISABLED_KEY, "1");
}

export function sanitizeExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const url = new URL(candidate);
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return null;
    const currentHost = typeof window !== "undefined" ? window.location.hostname : null;
    const allowedHost =
      ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(url.hostname) ||
      (SUPABASE_HOST && url.hostname === SUPABASE_HOST) ||
      (currentHost && url.hostname === currentHost);
    if (!allowedHost) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isSameOriginOrManagedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const currentHost = typeof window !== "undefined" ? window.location.hostname : null;
    return Boolean(
      (SUPABASE_HOST && url.hostname === SUPABASE_HOST) ||
      (currentHost && url.hostname === currentHost),
    );
  } catch {
    return false;
  }
}

function buildCoverCandidates(result) {
  const raw = Array.isArray(result?.coverCandidates) ? result.coverCandidates : [];
  const fallback = [
    sanitizeExternalUrl(result?.thumbnailUrl)
      ? { url: sanitizeExternalUrl(result?.thumbnailUrl), label: "Vorschaubild", kind: "thumbnail", source: result?.source ?? "unknown" }
      : null,
    sanitizeExternalUrl(result?.coverUrl)
      ? { url: sanitizeExternalUrl(result?.coverUrl), label: "Cover", kind: "cover", source: result?.source ?? "unknown" }
      : null,
  ].filter(Boolean);

  return uniqueBy([...raw, ...fallback], (entry) => sanitizeExternalUrl(entry?.url)).map((entry, index) => ({
    id: entry.id ?? `${entry.source ?? "cover"}-${entry.kind ?? "img"}-${index}`,
    url: sanitizeExternalUrl(entry.url),
    label: entry.label ?? entry.kind ?? "Cover",
    source: entry.source ?? result?.source ?? "unknown",
    kind: entry.kind ?? "cover",
    width: entry.width ?? null,
    height: entry.height ?? null,
    storedUrl: entry.storedUrl ?? null,
  })).filter((entry) => !!entry.url);
}

export function getBookSearchContext(source = {}) {
  return {
    isbn13: source.isbn_13 ?? source.isbn13 ?? null,
    isbn10: source.isbn_10 ?? source.isbn10 ?? null,
    title: source.titel ?? source.title ?? null,
    subtitle: source.untertitel ?? source.subtitle ?? null,
    authors: toAuthors(source.autoren ?? source.authors ?? source.autor_anzeige ?? source.authorDisplay),
    publisher: source.verlag ?? source.publisher ?? null,
    publishedYear: source.erscheinungsjahr ?? source.publishedYear ?? null,
    language: source.sprache ?? source.language ?? null,
    existingSource: source.api_quelle ?? source.source ?? null,
    existingSourceRef: source.api_ref ?? source.sourceRef ?? null,
    coverUrl: sanitizeExternalUrl(source.cover_url ?? source.coverUrl ?? null),
  };
}

export function getBookSearchQuery(source = {}) {
  const isbn = source.isbn13 ?? source.isbn_13 ?? source.isbn10 ?? source.isbn_10;
  if (isbn) {
    return { mode: "isbn", query: isbn };
  }

  const title = source.title ?? source.titel ?? "";
  const authors = toAuthors(source.authors ?? source.autoren ?? source.authorDisplay ?? source.autor_anzeige).join(" ");
  const publisher = source.publisher ?? source.verlag ?? "";
  const query = [title, authors, publisher].filter(Boolean).join(" ").trim();
  return { mode: "title", query };
}

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function searchBooks({
  query,
  mode = "title",
  limit = 8,
  language = DEFAULT_LANGUAGE,
  context,
  token,
}) {
  if (!SUPABASE_URL) {
    throw new Error("REACT_APP_SUPABASE_URL fehlt.");
  }

  const authToken = token ?? await getAccessToken();
  if (!authToken) {
    throw new Error("Nicht eingeloggt.");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ query, mode, limit, language, context }),
  });

  if (!res.ok) {
    throw new Error(`Buchsuche fehlgeschlagen (${res.status}).`);
  }

  const data = await res.json();
  return Array.isArray(data)
    ? data.map((entry) => ({
        ...entry,
        coverUrl: sanitizeExternalUrl(entry?.coverUrl),
        thumbnailUrl: sanitizeExternalUrl(entry?.thumbnailUrl),
        coverCandidates: buildCoverCandidates(entry),
      }))
    : [];
}

function getTopGap(results) {
  if (!Array.isArray(results) || results.length < 2) return 1;
  return (results[0]?.score ?? results[0]?.confidence ?? 0) - (results[1]?.score ?? results[1]?.confidence ?? 0);
}

export function getCoreFieldConflicts(current = {}, candidate = {}) {
  const conflicts = [];

  const checks = [
    ["titel", current.titel ?? current.title, candidate.title],
    ["untertitel", current.untertitel ?? current.subtitle, candidate.subtitle],
    ["isbn_13", current.isbn_13 ?? current.isbn13, candidate.isbn13],
    ["isbn_10", current.isbn_10 ?? current.isbn10, candidate.isbn10],
  ];

  checks.forEach(([field, existing, incoming]) => {
    if (!existing || !incoming) return;
    if (normalizeText(existing) !== normalizeText(incoming)) {
      conflicts.push(field);
    }
  });

  const currentAuthors = toAuthors(current.autoren ?? current.authors ?? current.autor_anzeige ?? current.authorDisplay).join(", ");
  const nextAuthors = toAuthors(candidate.authors ?? candidate.authorDisplay).join(", ");
  if (currentAuthors && nextAuthors && normalizeText(currentAuthors) !== normalizeText(nextAuthors)) {
    conflicts.push("autoren");
  }

  return conflicts;
}

function shouldUseAiRerank(results, context = {}) {
  if (!Array.isArray(results) || results.length < 2) return false;
  const topScore = results[0]?.score ?? results[0]?.confidence ?? 0;
  if (topScore >= HIGH_CONFIDENCE_SCORE && getTopGap(results) >= CLEAR_GAP_SCORE) {
    return false;
  }
  const conflicts = getCoreFieldConflicts(context, results[0]);
  const gap = getTopGap(results);
  return conflicts.length > 0 || gap < CLEAR_GAP_SCORE;
}

async function canUseAiRerank() {
  if (isAiRerankDisabledForSession()) return false;
  if (aiRerankCapabilityPromise) return aiRerankCapabilityPromise;

  aiRerankCapabilityPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("household_settings")
        .select("ki_provider, openai_api_key, ollama_base_url, ollama_model")
        .maybeSingle();
      if (error || !data) return false;

      if (data.ki_provider === "ollama") {
        return !!data.ollama_base_url && !!data.ollama_model;
      }
      return !!data.openai_api_key;
    } catch {
      return false;
    }
  })();

  return aiRerankCapabilityPromise;
}

async function maybeRerankWithKi(results, context) {
  if (!shouldUseAiRerank(results, context)) {
    return { results, usedAi: false };
  }
  if (!(await canUseAiRerank())) {
    return { results, usedAi: false };
  }

  try {
    const { client, model } = await getKiClient();
    if (!client?.chat?.completions?.create) {
      return { results, usedAi: false };
    }

    const compactResults = results.slice(0, 4).map((entry, index) => ({
      index,
      title: entry.title,
      subtitle: entry.subtitle ?? null,
      authors: entry.authors ?? [],
      authorDisplay: entry.authorDisplay ?? null,
      isbn13: entry.isbn13 ?? null,
      isbn10: entry.isbn10 ?? null,
      publisher: entry.publisher ?? null,
      publishedYear: entry.publishedYear ?? null,
      language: entry.language ?? null,
      source: entry.source ?? null,
      score: entry.score ?? entry.confidence ?? null,
      matchReasons: entry.matchReasons ?? [],
    }));

    const messages = [
      {
        role: "system",
        content:
          "Du bist ein strenger Buch-Metadaten-Reranker. Wähle nur unter den vorhandenen Kandidaten. Antworte ausschließlich als JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Waehle den plausibelsten Kandidaten fuer genau dieses Buch. Wenn kein Kandidat klar passt, markiere review=true.",
          currentBook: context,
          candidates: compactResults,
          responseShape: {
            selectedIndex: 0,
            review: false,
            reason: "kurz",
          },
        }),
      },
    ];

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0,
    });
    const rawText = response?.choices?.[0]?.message?.content ?? "";
    const cleaned = cleanKiJsonResponse(rawText, "object");
    const parsed = JSON.parse(cleaned);
    const selectedIndex = Number(parsed?.selectedIndex);
    if (!Number.isInteger(selectedIndex) || !results[selectedIndex]) {
      return { results, usedAi: false };
    }

    const reordered = [...results];
    const [selected] = reordered.splice(selectedIndex, 1);
    reordered.unshift({
      ...selected,
      matchReasons: uniqueBy([...(selected.matchReasons ?? []), parsed?.reason].filter(Boolean), (entry) => entry),
      needsReview: !!parsed?.review,
    });

    return { results: reordered, usedAi: true };
  } catch {
    disableAiRerankForSession();
    return { results, usedAi: false };
  }
}

export async function resolveBookMatches({
  query,
  mode = "title",
  limit = 8,
  language = DEFAULT_LANGUAGE,
  context,
  enableAi = false,
  token,
}) {
  const rawResults = await searchBooks({ query, mode, limit, language, context, token });
  if (!rawResults.length) {
    return {
      results: [],
      selected: null,
      needsReview: false,
      topGap: 0,
      coreConflicts: [],
      usedAi: false,
    };
  }

  const reranked = enableAi ? await maybeRerankWithKi(rawResults, context) : { results: rawResults, usedAi: false };
  const results = reranked.results;
  const selected = results[0] ?? null;
  const coreConflicts = getCoreFieldConflicts(context, selected);
  const topGap = getTopGap(results);
  const needsReview =
    !!selected?.needsReview ||
    coreConflicts.length > 0 ||
    topGap < CLEAR_GAP_SCORE ||
    (results.length > 1 && (selected?.score ?? selected?.confidence ?? 0) < HIGH_CONFIDENCE_SCORE);

  return {
    results,
    selected,
    needsReview,
    topGap,
    coreConflicts,
    usedAi: reranked.usedAi,
  };
}

export function buildBookMetadataUpdate(currentBook, selectedResult, selectedCoverUrl) {
  const currentPayload = currentBook?.api_payload && typeof currentBook.api_payload === "object"
    ? currentBook.api_payload
    : {};
  const safeCoverUrl = sanitizeExternalUrl(selectedCoverUrl ?? selectedResult?.coverUrl ?? selectedResult?.thumbnailUrl);
  const chosenCover = selectedResult?.coverCandidates?.find((entry) => entry.url === safeCoverUrl) ?? null;

  const update = {};
  const maybeAssign = (field, value) => {
    if (value == null || value === "") return;
    update[field] = value;
  };

  maybeAssign("beschreibung", selectedResult?.description);
  maybeAssign("verlag", selectedResult?.publisher);
  maybeAssign("seitenzahl", selectedResult?.pageCount);
  maybeAssign("erscheinungsjahr", selectedResult?.publishedYear);
  maybeAssign("sprache", selectedResult?.language);
  maybeAssign("cover_url", safeCoverUrl);
  maybeAssign("thumbnail_url", safeCoverUrl ?? sanitizeExternalUrl(selectedResult?.thumbnailUrl));
  maybeAssign("api_quelle", selectedResult?.source);
  maybeAssign("api_ref", selectedResult?.sourceRef);

  update.api_payload = {
    ...currentPayload,
    selectedMatch: selectedResult
      ? {
          title: selectedResult.title,
          subtitle: selectedResult.subtitle ?? null,
          authors: selectedResult.authors ?? [],
          authorDisplay: selectedResult.authorDisplay ?? null,
          isbn13: selectedResult.isbn13 ?? null,
          isbn10: selectedResult.isbn10 ?? null,
          publisher: selectedResult.publisher ?? null,
          publishedYear: selectedResult.publishedYear ?? null,
          language: selectedResult.language ?? null,
          source: selectedResult.source ?? null,
          sourceRef: selectedResult.sourceRef ?? null,
          score: selectedResult.score ?? selectedResult.confidence ?? null,
          matchReasons: selectedResult.matchReasons ?? [],
        }
      : null,
    coverCandidates: selectedResult?.coverCandidates ?? [],
    selectedCover: chosenCover ? { ...chosenCover, url: sanitizeExternalUrl(chosenCover.url) } : null,
  };

  return update;
}

export async function persistSelectedBookCover({
  householdId,
  bookId,
  selectedCoverUrl,
}) {
  const safeCoverUrl = sanitizeExternalUrl(selectedCoverUrl);
  if (!householdId || !bookId || !safeCoverUrl) return null;
  if (!isSameOriginOrManagedUrl(safeCoverUrl)) return null;

  try {
    const imageRes = await fetch(safeCoverUrl);
    if (!imageRes.ok) return null;
    const blob = await imageRes.blob();
    const ext = blob.type?.split("/")[1] || "jpg";
    const path = `${householdId}/${bookId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("book-covers").upload(path, blob, {
      upsert: true,
      contentType: blob.type || "image/jpeg",
    });
    if (error) return null;
    const { data } = supabase.storage.from("book-covers").getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return {
      publicUrl: data.publicUrl,
      storagePath: path,
    };
  } catch {
    return null;
  }
}

export async function removePersistedBookCover(selectedCover = null) {
  const storagePath = selectedCover?.storagePath ?? null;
  if (!storagePath) return;
  try {
    await supabase.storage.from("book-covers").remove([storagePath]);
  } catch {
    // Bildentfernung ist best effort; DB-Clearing darf daran nicht scheitern.
  }
}
