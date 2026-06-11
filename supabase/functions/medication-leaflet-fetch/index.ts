// Supabase Edge Function: medication-leaflet-fetch
// Sucht und spiegelt Beipackzettel für die Heimapotheke in den privaten Storage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const BASG_API_ROOT = "https://medikamente.basg.gv.at/api/api/v1/medication";
const BASG_DOCUMENT_ROOT = "https://medikamente.basg.gv.at/documents";
const BASG_API_TOKEN =
  "YXy/c2LDk28vDsNqrukqoBfvNmNFOEoEnt-rA/FoCgBv5K?GRn4mec2xc!mzs6VnUWmCFI338l0G0vTGSeZcMFUZYBFclIx?5iu!CgQcujZygafyoj0D?hkWxx-6PqRVyOz6zM?MIIVyo?2CRZq8ViA-AoVFKJZe0H5iYamMzXS8pZ5BUp0HPM1DM7YkoInFZIT-AkNoEhbr9oXisGrlEI45sV43drXBqGxVGFjuobYkty?Pd4tgTyFOWWOYQKy=";
const USER_AGENT =
  "Home-Organizer-Heimapotheke/1.0 (+private medication leaflet archive)";

type Candidate = {
  url: string;
  source: string;
  official: boolean;
  depth?: number;
  label?: string;
  scoreHint?: number;
  metadata?: Record<string, unknown>;
};

type LeafletResult = {
  ok: boolean;
  reason?: string;
  dokument_id?: string;
  storage_pfad?: string;
  source_url?: string;
  source?: string;
  content_type?: string;
  size?: number;
  metadata?: Record<string, unknown>;
  warnings?: string[];
};

type DownloadedLeaflet = {
  bytes: Uint8Array;
  contentType: string;
  url: string;
  source: string;
  official: boolean;
  score: number;
  originalContentType?: string;
  metadata?: Record<string, unknown>;
};

type BasgSearchItem = {
  id?: string;
  authNumber?: string;
  name?: string;
  substances?: string[];
  approvalHolder?: string;
  requiresPrescription?: string;
  atcCodes?: string[];
  supplyStatus?: string;
  containsNarcotic?: string;
  containsPsycho?: string;
  authDate?: string;
  categoryName?: string;
  batchApprMandatory?: string;
  excBatchControl?: string | null;
  approvedLi?: string | null;
  domain?: string;
  marketingAvailability?: string | null;
  euDatabases?: string | null;
  prescriptionStatus?: string;
  strength?: string;
  strengthUnit?: string;
  allergen?: string | null;
  vaccine?: string | null;
  additionalMonitoring?: string | null;
  dosageForm?: string;
  mrpDcpNumber?: string | null;
  packageLeaflet?: {
    type?: string;
    validityDate?: string;
  } | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFilename(value: string): string {
  return String(value || "beipackzettel")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function medicationTokens(input: Record<string, unknown>): string[] {
  const raw = [
    input.name,
    input.wirkstoff,
    input.darreichungsform,
    input.packungsgroesse,
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeText(raw)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !["mg", "ml", "stk", "stueck", "tabletten", "kapseln", "filmtabletten"].includes(token));
}

function looksLikeSearchPage(text: string, url: string): boolean {
  const hay = normalizeText(`${url} ${text.slice(0, 5000)}`);
  return (
    hay.includes("suchergebnisse") ||
    hay.includes("geben sie im suchfeld") ||
    hay.includes("search results") ||
    /[?&](q|query|search|term)=/i.test(url)
  );
}

function scoreContent({ text, url, tokens, explicitUrl }: { text: string; url: string; tokens: string[]; explicitUrl: boolean }): number {
  const hay = normalizeText(`${url} ${text.slice(0, 12000)}`);
  const matched = tokens.filter((token) => hay.includes(token)).length;
  let score = matched * 20;
  if (/\.pdf(?:$|[?#])/i.test(url)) score += 25;
  if (hay.includes("beipackzettel") || hay.includes("gebrauchsinformation") || hay.includes("packungsbeilage")) score += 25;
  if (hay.includes("arzneimittel") || hay.includes("wirkstoff")) score += 10;
  if (explicitUrl) score += 10;
  if (looksLikeSearchPage(text, url) && !/\.pdf(?:$|[?#])/i.test(url)) score -= 35;
  return score;
}

function scoreLabel(label: string, tokens: string[]): number {
  const hay = normalizeText(label);
  if (!hay || !tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 25;
  }
  if (hay.includes("salbe") || hay.includes("tabletten") || hay.includes("kapseln") || hay.includes("tropfen")) score += 5;
  return score;
}

function extractLinks(html: string, baseUrl: string, source: string, official: boolean, depth: number): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html))) {
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hay = normalizeText(`${url} ${label}`);
    if (
      /\.pdf(?:$|[?#])/i.test(url) ||
      hay.includes("beipackzettel") ||
      hay.includes("gebrauchsinformation") ||
      hay.includes("packungsbeilage") ||
      hay.includes("anzeigen")
    ) {
      candidates.push({ url, source, official, depth, label });
    }
  }
  return candidates.slice(0, 12);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,application/pdf,text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBasgJson(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Language": "DE",
        Authorization: `Bearer ${BASG_API_TOKEN}`,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(response: Response): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) throw new Error("Datei ist zu gross.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error("Datei ist zu gross.");
  return buffer;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&shy;/gi, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : " ";
    });
}

function extractLeafletText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Beipackzettel";
  const main =
    html.match(/<div[^>]+class=["'][^"']*package-leaflet[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div class=["']sticky-buttons/i)?.[1] ||
    html.match(/<div[^>]+id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<footer/i)?.[1] ||
    html;
  const cleaned = main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(h[1-6]|p|li|br|tr|div)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(`${title}\n\n${cleaned}`)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pdfSafeText(value: string): string {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[\\()]/g, "\\$&");
}

function wrapText(text: string, maxChars = 92): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if ((line ? `${line} ${word}` : word).length > maxChars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  return lines;
}

function buildPdfBytes({ title, sourceUrl, source, text }: { title: string; sourceUrl: string; source: string; text: string }): Uint8Array {
  const headerLines = [
    title,
    `Quelle: ${source}`,
    `Original: ${sourceUrl}`,
    `Archiviert: ${new Date().toISOString()}`,
    "",
    "Automatisch erzeugtes PDF aus der Online-Beipackzettelquelle. Keine medizinische Beratung.",
    "",
  ];
  const allLines = wrapText([...headerLines, text].join("\n")).slice(0, 900);
  const linesPerPage = 54;
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) pages.push(allLines.slice(i, i + linesPerPage));
  if (!pages.length) pages.push(["Kein Text extrahiert. Bitte Originalquelle prüfen.", sourceUrl]);

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  void catalogId;
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const streamLines = [
      "BT",
      "/F1 10 Tf",
      "50 790 Td",
      "12 TL",
      ...pageLines.map((line) => `(${pdfSafeText(line)}) Tj T*`),
      "ET",
    ];
    const stream = streamLines.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function extensionFor(contentType: string): string {
  if (contentType.includes("pdf")) return "pdf";
  return "bin";
}

function isBasgDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return (
      parsed.hostname.endsWith("basg.gv.at") &&
      (pathname.startsWith("/documents/") || pathname.includes("/document/")) &&
      pathname.includes("gebr_info") &&
      pathname.endsWith(".pdf")
    );
  } catch {
    return false;
  }
}

function basgDocumentUrl(item: BasgSearchItem): string | null {
  if (!item.authNumber || !item.packageLeaflet?.type) return null;
  const authNumber = String(item.authNumber).replaceAll("/", "_");
  const type = String(item.packageLeaflet.type).trim();
  if (!type.toLowerCase().includes("gebr_info")) return null;
  if (!authNumber || !type) return null;
  return `${BASG_DOCUMENT_ROOT}/${encodeURIComponent(authNumber)}__${encodeURIComponent(type)}.pdf`;
}

function inferDosageForm(productName: string): string | null {
  const hay = normalizeText(productName);
  const forms = [
    ["filmtabletten", "Tabletten"],
    ["tabletten", "Tabletten"],
    ["kapseln", "Kapseln"],
    ["tropfen", "Tropfen"],
    ["saft", "Saft"],
    ["spray", "Spray"],
    ["salbe", "Salbe"],
    ["creme", "Creme"],
    ["gel", "Gel"],
    ["zaepfchen", "Zäpfchen"],
    ["suppositorien", "Zäpfchen"],
    ["pflaster", "Pflaster"],
    ["injektion", "Injektion"],
  ];
  return forms.find(([needle]) => hay.includes(needle))?.[1] || null;
}

function inferPackageSize(productName: string): string | null {
  const match = productName.match(/\b\d+(?:[,.]\d+)?\s*(?:mg|g|µg|mcg|ml|l|%|i\.?e\.?)\b/i);
  return match?.[0]?.replace(/\s+/g, " ").trim() || null;
}

function basgMetadata(item: BasgSearchItem, url: string): Record<string, unknown> {
  const strength = [item.strength, item.strengthUnit].filter(Boolean).join(" ") || inferPackageSize(item.name || "");
  return {
    provider: "basg",
    id: item.id || null,
    product_name: item.name || null,
    auth_number: item.authNumber || null,
    substances: item.substances || [],
    wirkstoff: (item.substances || []).join(", ") || null,
    darreichungsform: item.dosageForm || inferDosageForm(item.name || ""),
    packungsgroesse: strength || null,
    approval_holder: item.approvalHolder || null,
    requires_prescription: item.requiresPrescription || null,
    prescription_status: item.prescriptionStatus || item.requiresPrescription || null,
    supply_status: item.supplyStatus || null,
    atc_codes: item.atcCodes || [],
    auth_date: item.authDate || null,
    category_name: item.categoryName || null,
    dosage_form: item.dosageForm || inferDosageForm(item.name || ""),
    strength: strength || null,
    domain: item.domain || null,
    contains_narcotic: item.containsNarcotic || null,
    contains_psycho: item.containsPsycho || null,
    allergen: item.allergen || null,
    vaccine: item.vaccine || null,
    batch_approval_mandatory: item.batchApprMandatory || null,
    exc_batch_control: item.excBatchControl || null,
    additional_monitoring: item.additionalMonitoring || null,
    approved_liechtenstein: item.approvedLi || null,
    marketing_availability: item.marketingAvailability || null,
    eu_databases: item.euDatabases || null,
    mrp_dcp_number: item.mrpDcpNumber || null,
    package_leaflet_type: item.packageLeaflet?.type || null,
    package_leaflet_validity_date: item.packageLeaflet?.validityDate || null,
    package_leaflet_url: url,
  };
}

async function fetchBasgDetail(item: BasgSearchItem): Promise<BasgSearchItem> {
  if (!item.id) return item;
  const response = await fetchBasgJson(`${BASG_API_ROOT}/${encodeURIComponent(item.id)}`, {
    method: "GET",
  });
  if (!response.ok) return item;
  const detail = await response.json() as BasgSearchItem;
  return { ...item, ...detail };
}

async function searchBasgLeafletCandidates(medication: Record<string, unknown>, tokens: string[]): Promise<Candidate[]> {
  const name = String(medication.name || "").trim();
  const substance = String(medication.wirkstoff || "").trim();
  const requestBodies = [
    name ? { nameAuthNumber: name } : null,
    name && substance ? { nameAuthNumber: name, substance } : null,
    !name && substance ? { substance } : null,
  ].filter(Boolean) as Array<Record<string, string>>;
  const seenUrls = new Set<string>();
  const candidates: Candidate[] = [];

  const seenRequests = new Set<string>();
  for (const body of requestBodies) {
    const requestKey = JSON.stringify(body);
    if (seenRequests.has(requestKey)) continue;
    seenRequests.add(requestKey);

    const response = await fetchBasgJson(`${BASG_API_ROOT}/search?page=1&size=12`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`BASG Suche HTTP ${response.status}`);
    const payload = await response.json() as { items?: BasgSearchItem[] };
    for (const searchItem of payload.items || []) {
      const item = await fetchBasgDetail(searchItem);
      const url = basgDocumentUrl(item);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      const metadata = basgMetadata(item, url);
      const label = [
        item.name,
        item.authNumber,
        ...(item.substances || []),
        item.packageLeaflet?.type,
        item.packageLeaflet?.validityDate,
      ].filter(Boolean).join(" ");
      candidates.push({
        url,
        source: "BASG Medikamenten-Informationssystem",
        official: true,
        depth: 0,
        label,
        scoreHint: scoreLabel(label, tokens),
        metadata,
      });
    }
  }

  return candidates
    .filter((candidate) => (candidate.scoreHint || 0) >= Math.min(25, Math.max(15, tokens.length * 8)))
    .sort((a, b) => (b.scoreHint || 0) - (a.scoreHint || 0))
    .slice(0, 10);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildCandidates(body: Record<string, unknown>, tokens: string[], warnings: string[]): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const explicit = safeHttpsUrl(String(body.beipackzettel_url || body.source_url || ""));
  if (explicit && isBasgDocumentUrl(explicit)) {
    candidates.push({
      url: explicit,
      source: String(body.offizielle_quelle || "BASG Medikamenten-Informationssystem"),
      official: true,
      depth: 0,
    });
  } else if (explicit) {
    warnings.push("Angegebene Quelle ist kein direkter BASG-PDF-Link und wurde nicht gespiegelt.");
  }

  try {
    candidates.push(...await searchBasgLeafletCandidates(body, tokens));
  } catch (error) {
    warnings.push(`BASG Suche: ${error instanceof Error ? error.message : "fehlgeschlagen"}`);
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Nicht autorisiert" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Ungueltiger Token" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungueltiger Body" }, 400);
  }

  const medicationId = String(body.medikament_id || "").trim();
  const name = String(body.name || "").trim();
  if (!name && !medicationId) return jsonResponse({ ok: false, reason: "missing_name" } satisfies LeafletResult);

  let medication: Record<string, unknown> = { ...body, user_id: user.id };
  if (medicationId) {
    const { data, error } = await userClient
      .from("home_medikamente")
      .select("*")
      .eq("id", medicationId)
      .maybeSingle();
    if (error) return jsonResponse({ ok: false, reason: error.message } satisfies LeafletResult, 400);
    if (!data) return jsonResponse({ ok: false, reason: "medication_not_found" } satisfies LeafletResult, 404);
    medication = data as Record<string, unknown>;
  } else if (body.household_id) {
    const { data: member, error } = await userClient
      .from("household_members")
      .select("household_id")
      .eq("household_id", String(body.household_id))
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !member) return jsonResponse({ ok: false, reason: "household_not_allowed" } satisfies LeafletResult, 403);
  }

  const force = body.force === true;

  if (medication.beipackzettel_dokument_id && !force) {
    return jsonResponse({
      ok: true,
      reason: "already_has_document",
      dokument_id: String(medication.beipackzettel_dokument_id),
    } satisfies LeafletResult);
  }

  const seen = new Set<string>();
  const warnings: string[] = [];
  const tokens = medicationTokens(medication);
  const queue = await buildCandidates(medication, tokens, warnings);
  let best: DownloadedLeaflet | null = null;

  while (queue.length && !best) {
    const candidate = queue.shift()!;
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    try {
      const response = await fetchWithTimeout(candidate.url);
      if (!response.ok) {
        warnings.push(`${candidate.source}: HTTP ${response.status}`);
        continue;
      }
      const bytes = await readLimited(response);
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const finalUrl = response.url || candidate.url;
      const isPdf = contentType.includes("pdf") || /\.pdf(?:$|[?#])/i.test(finalUrl);
      const text = isPdf ? `${candidate.label || ""} ${finalUrl}` : `${candidate.label || ""} ${bytesToText(bytes)}`;
      const score = scoreContent({
        text,
        url: finalUrl,
        tokens,
        explicitUrl: candidate.depth === 0 && (String(medication.beipackzettel_url || "") === candidate.url),
      }) + (candidate.scoreHint || 0);

      if (isPdf && score >= 35) {
        best = {
          bytes,
          contentType: "application/pdf",
          url: finalUrl,
          source: candidate.source,
          official: candidate.official,
          score,
          metadata: candidate.metadata || {},
        };
        break;
      }

      if (contentType.includes("html") || /<\/html>|<a\b/i.test(text)) {
        if ((candidate.depth || 0) < 2) {
          queue.push(...extractLinks(text, finalUrl, candidate.source, candidate.official, (candidate.depth || 0) + 1).filter((entry) => isBasgDocumentUrl(entry.url)));
        }
      }
    } catch (error) {
      warnings.push(`${candidate.source}: ${error instanceof Error ? error.message : "Download fehlgeschlagen"}`);
    }
  }

  if (!best) {
    return jsonResponse({ ok: false, reason: "not_found", warnings } satisfies LeafletResult);
  }

  const householdId = String(medication.household_id || body.household_id || "");
  const basgMeta = best.metadata || {};
  const medicationUpdate = {
    beipackzettel_url: best.url,
    offizielle_quelle: best.source,
    wirkstoff: basgMeta.wirkstoff || medication.wirkstoff || null,
    darreichungsform: basgMeta.darreichungsform || medication.darreichungsform || null,
    packungsgroesse: basgMeta.packungsgroesse || medication.packungsgroesse || null,
    source_payload: {
      ...((medication.source_payload && typeof medication.source_payload === "object") ? (medication.source_payload as Record<string, unknown>) : {}),
      basg: basgMeta,
    },
  };
  const hash = await sha256Hex(best.bytes);
  if (householdId) {
    const { data: duplicate } = await admin
      .from("dokumente")
      .select("id, storage_pfad")
      .eq("household_id", householdId)
      .eq("datei_hash", hash)
      .maybeSingle();
    if (duplicate?.id) {
      await admin
        .from("dokumente")
        .update({
          kategorie: "Medikamente",
          dokument_typ: "beipackzettel",
          app_modus: "home",
          tags: ["heimapotheke", "beipackzettel"],
          meta: {
            source_url: best.url,
            source: best.source,
            official: best.official,
            confidence_score: best.score,
            original_content_type: best.originalContentType || best.contentType,
            basg: basgMeta,
            mirrored_at: new Date().toISOString(),
          },
        })
        .eq("id", duplicate.id);
      if (medicationId) {
        await admin
          .from("home_medikamente")
          .update({
            ...medicationUpdate,
            beipackzettel_dokument_id: duplicate.id,
          })
          .eq("id", medicationId);
        if (householdId) {
          await admin.from("dokument_links").insert({
            household_id: householdId,
            dokument_id: duplicate.id,
            entity_type: "medikament",
            entity_id: medicationId,
            relation_type: "beipackzettel",
          });
        }
      }
      return jsonResponse({
        ok: true,
        reason: "duplicate_reused",
        dokument_id: duplicate.id,
        storage_pfad: duplicate.storage_pfad,
        source_url: best.url,
        source: best.source,
        content_type: best.contentType,
        size: best.bytes.byteLength,
        metadata: basgMeta,
        warnings,
      } satisfies LeafletResult);
    }
  }

  const ext = extensionFor(best.contentType);
  const safeName = normalizeFilename(String(medication.name || body.name || "medikament"));
  const storagePath = `${user.id}/heimapotheke/${Date.now()}-${safeName}-beipackzettel.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("user-dokumente")
    .upload(storagePath, new Blob([best.bytes], { type: best.contentType }), {
      contentType: best.contentType,
      upsert: false,
    });
  if (uploadError) return jsonResponse({ ok: false, reason: uploadError.message, warnings } satisfies LeafletResult, 500);

  const { data: doc, error: docError } = await admin
    .from("dokumente")
    .insert({
      user_id: user.id,
      household_id: householdId || null,
      dateiname: `${safeName}-beipackzettel.${ext}`,
      datei_typ: best.contentType,
      storage_pfad: storagePath,
      groesse_kb: Math.ceil(best.bytes.byteLength / 1024),
      kategorie: "Medikamente",
      dokument_typ: "beipackzettel",
      app_modus: "home",
      beschreibung: `Automatisch gespeicherter Beipackzettel für ${String(medication.name || body.name || "Medikament")}`,
      tags: ["heimapotheke", "beipackzettel"],
      meta: {
        source_url: best.url,
        source: best.source,
        official: best.official,
        confidence_score: best.score,
        mirrored_format: ext,
        original_content_type: best.originalContentType || best.contentType,
        basg: basgMeta,
        mirrored_at: new Date().toISOString(),
      },
      datei_hash: hash,
    })
    .select("id, storage_pfad")
    .single();
  if (docError) return jsonResponse({ ok: false, reason: docError.message, warnings } satisfies LeafletResult, 500);

  if (medicationId) {
    await admin
      .from("home_medikamente")
      .update({
        ...medicationUpdate,
        beipackzettel_dokument_id: doc.id,
      })
      .eq("id", medicationId);

    if (householdId) {
      await admin.from("dokument_links").insert({
        household_id: householdId,
        dokument_id: doc.id,
        entity_type: "medikament",
        entity_id: medicationId,
        relation_type: "beipackzettel",
      });
    }
  }

  return jsonResponse({
    ok: true,
    dokument_id: doc.id,
    storage_pfad: doc.storage_pfad,
    source_url: best.url,
    source: best.source,
    content_type: best.contentType,
    size: best.bytes.byteLength,
    metadata: basgMeta,
    warnings,
  } satisfies LeafletResult);
});
