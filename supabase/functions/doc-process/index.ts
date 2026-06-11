// Supabase Edge Function: doc-process
// Universeller Dokumenten-Orchestrator (Multiscanner-Pipeline).
//
// POST /doc-process
// Body: { dokument_id: string, level: "store_only"|"classify_only"|"full", force?: boolean }
// Output: { status: "ok"|"already_done"|"busy"|"failed", doc_type?, wissen_id?, entity_id?, warnings[] }

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(parts.join(""));
}

async function extractScannedPdfText(fileBytes: Uint8Array) {
  const ocrUrl = Deno.env.get("DOCUMENT_OCR_URL")?.replace(/\/$/, "");
  const token = Deno.env.get("DOCUMENT_OCR_INTERNAL_TOKEN");
  if (!ocrUrl || !token) {
    throw new Error("DOCUMENT_OCR_URL oder DOCUMENT_OCR_INTERNAL_TOKEN fehlt.");
  }
  const response = await fetch(`${ocrUrl}/ocr/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      file_base64: bytesToBase64(fileBytes),
      max_pages: 8,
      languages: ["deu", "eng"],
    }),
  });
  const data = await response.json().catch(() => ({})) as {
    text?: string;
    page_count?: number;
    processed_pages?: number;
    truncated?: boolean;
    warnings?: string[];
    detail?: string;
  };
  if (!response.ok) throw new Error(data.detail || `document-ocr-service HTTP ${response.status}`);
  return {
    text: data.text || "",
    pageCount: Number(data.page_count || 0),
    processedPages: Number(data.processed_pages || 0),
    truncated: Boolean(data.truncated),
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Normierungsmaps ───────────────────────────────────────────────────────────

const VERSICHERUNGSART_MAP: Record<string, string> = {
  haftpflicht: "haftpflicht",
  haftpflichtversicherung: "haftpflicht",
  liability: "haftpflicht",
  hausrat: "hausrat",
  hausratversicherung: "hausrat",
  contents: "hausrat",
  kfz: "kfz",
  auto: "kfz",
  car: "kfz",
  vehicle: "kfz",
  kraftfahrzeug: "kfz",
  kranken: "krankenversicherung",
  krankenversicherung: "krankenversicherung",
  health: "krankenversicherung",
  krankenkasse: "krankenversicherung",
  leben: "lebensversicherung",
  lebensversicherung: "lebensversicherung",
  life: "lebensversicherung",
  berufsunfaehigkeit: "berufsunfaehigkeit",
  bu: "berufsunfaehigkeit",
  disability: "berufsunfaehigkeit",
  rechtsschutz: "rechtsschutz",
  rechtsschutzversicherung: "rechtsschutz",
  legal: "rechtsschutz",
  reise: "reisekranken",
  reisekranken: "reisekranken",
  reisekrankenversicherung: "reisekranken",
  travel: "reisekranken",
  gebaeude: "gebaeude",
  gebaeudeversicherung: "gebaeude",
  building: "gebaeude",
  property: "gebaeude",
  unfall: "unfallversicherung",
  unfallversicherung: "unfallversicherung",
  accident: "unfallversicherung",
};

function normalisiereVersicherungsart(raw: string | null | undefined): string {
  if (!raw) return "sonstiges";
  const key = raw.toLowerCase().trim().replace(/\s+/g, "_");
  return VERSICHERUNGSART_MAP[key] ?? "sonstiges";
}

const PRAEMIEN_INTERVALL_MAP: Record<string, string> = {
  monatlich: "monatlich",
  monthly: "monatlich",
  vierteljaehrlich: "vierteljaehrlich",
  quarterly: "vierteljaehrlich",
  "quartalsweise": "vierteljaehrlich",
  halbjaehrlich: "halbjaehrlich",
  "halbjährlich": "halbjaehrlich",
  semiannual: "halbjaehrlich",
  "half-yearly": "halbjaehrlich",
  jaehrlich: "jaehrlich",
  "jährlich": "jaehrlich",
  annually: "jaehrlich",
  annual: "jaehrlich",
  yearly: "jaehrlich",
};

function normalisierePraemienIntervall(raw: string | null | undefined): string {
  if (!raw) return "jaehrlich";
  const key = raw.toLowerCase().trim();
  return PRAEMIEN_INTERVALL_MAP[key] ?? "jaehrlich";
}

// ── Textkürzung für Klassifikation ────────────────────────────────────────────

function smartTruncate(text: string, max = 3500): string {
  if (text.length <= max) return text;
  const firstPart = Math.floor(max * 0.6);
  const lastPart  = max - firstPart;
  return text.slice(0, firstPart) + "\n…\n" + text.slice(-lastPart);
}

// ── JSON-Strip-Fallback (wie cleanKiJsonResponse im Frontend) ─────────────────

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseKiJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(stripJsonFences(raw)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Tag-Normalisierung ────────────────────────────────────────────────────────

function normalisiereTag(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.toLowerCase().trim().replace(/\s+/g, "_");
}

// ── Datumsformatierung für Titel (ISO → DD.MM.YYYY) ──────────────────────────

function formatDateDE(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

type SupportedLocale = "de" | "en-GB";

function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  return locale === "en-GB" || locale === "en" ? "en-GB" : "de";
}

function formatDateForLocale(iso: string | null | undefined, locale: SupportedLocale): string {
  if (!iso) return locale === "en-GB" ? "an unknown date" : "einem unbekannten Datum";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en-GB" ? "en-GB" : "de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrencyForLocale(value: unknown, currency: string | null | undefined, locale: SupportedLocale): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return locale === "en-GB" ? "an unknown amount" : "einem unbekannten Betrag";
  return new Intl.NumberFormat(locale === "en-GB" ? "en-GB" : "de-AT", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

function invoiceContent(summary: Record<string, unknown>, locale: SupportedLocale): string {
  const merchant = String(summary.merchant || summary.merchant_name || summary.haendler || (locale === "en-GB" ? "an unknown merchant" : "einem unbekannten Haendler"));
  const dateText = formatDateForLocale((summary.date || summary.purchase_date || summary.datum) as string | null, locale);
  const total = formatCurrencyForLocale(summary.amount ?? summary.total_amount ?? summary.gesamt, summary.currency as string | null, locale);
  const rawItems = Array.isArray(summary.items) ? summary.items : Array.isArray(summary.key_items) ? summary.key_items : [];
  const items = rawItems.slice(0, 3).map((item) => {
    if (typeof item === "string") return item;
    const row = item as Record<string, unknown>;
    const name = String(row.name || row.description || row.beschreibung || "").trim();
    const amount = row.amount ?? row.total ?? row.gesamtpreis ?? row.price;
    return `${name}${amount != null ? ` (${formatCurrencyForLocale(amount, summary.currency as string | null, locale)})` : ""}`;
  }).filter(Boolean);

  if (items.length > 0) {
    return locale === "en-GB"
      ? `On ${dateText}, you bought from ${merchant}: ${items.join(", ")}. Total amount: ${total}.`
      : `Du hast am ${dateText} bei ${merchant} gekauft: ${items.join(", ")}. Gesamtbetrag: ${total}.`;
  }

  return locale === "en-GB"
    ? `On ${dateText}, you shopped at ${merchant} and spent ${total} in total.`
    : `Du hast am ${dateText} bei ${merchant} eingekauft und insgesamt ${total} ausgegeben.`;
}

function localizedInvoiceContent(title: string, summary: Record<string, unknown>) {
  return {
    de: { title, content: invoiceContent(summary, "de"), headline: invoiceContent(summary, "de") },
    "en-GB": { title, content: invoiceContent(summary, "en-GB"), headline: invoiceContent(summary, "en-GB") },
  };
}

async function translateKnowledgeContent(
  fnHeaders: Record<string, string>,
  functionsUrl: string,
  source: { title: string; content: string; headline?: string },
  targetLocale: SupportedLocale,
): Promise<{ title: string; content: string; headline: string }> {
  const targetLanguage = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  const prompt = `Translate this automatically generated home knowledge entry into ${targetLanguage}.
Keep product names, merchant names, document numbers, dates and amounts unchanged.
Return only valid JSON with keys title, content and headline.

JSON:
${JSON.stringify(source)}`;

  const resp = await fetch(`${functionsUrl}/ki-chat`, {
    method: "POST",
    headers: fnHeaders,
    body: JSON.stringify({
      purpose: "translation",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) return source;
  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseKiJson(raw);
  return {
    title: String(parsed.title || source.title || "").trim(),
    content: String(parsed.content || source.content || "").trim(),
    headline: String(parsed.headline || source.headline || source.content || "").trim(),
  };
}

async function localizedContentFromGerman(
  fnHeaders: Record<string, string>,
  functionsUrl: string,
  title: string,
  content: string,
  headline = content,
) {
  const de = { title, content, headline };
  const en = await translateKnowledgeContent(fnHeaders, functionsUrl, de, "en-GB");
  return { de, "en-GB": en };
}

// ── SAFE UPSERT home_wissen (kapselt manuell-Guard) ──────────────────────────
// Gibt wissen_id zurück oder null bei Fehler.

async function safeUpsertHomeWissen(
  supabaseAdmin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("home_wissen")
    .select("id, herkunft")
    .eq("dokument_id", payload.dokument_id as string)
    .maybeSingle();

  // Guard: manuelle Einträge nicht überschreiben
  if (existing?.herkunft === "manuell") return existing.id as string;

  const writePayload = async (nextPayload: Record<string, unknown>) => {
    if (existing?.id) {
      return await supabaseAdmin
      .from("home_wissen")
        .update(nextPayload)
      .eq("id", existing.id as string);
    }
    return await supabaseAdmin
      .from("home_wissen")
      .insert(nextPayload)
      .select("id")
      .single();
  };

  let { data, error } = await writePayload(payload);
  if (error && /summary|localized_content|source_locale/i.test(error.message || "")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.summary;
    delete fallbackPayload.localized_content;
    delete fallbackPayload.source_locale;
    const fallbackResult = await writePayload(fallbackPayload);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error) throw error;
  if (existing?.id) return existing.id as string;
  return (data as { id: string })?.id ?? null;
}

// ── Hilfsfunktion: processing-State schreiben ─────────────────────────────────

async function updateProcessing(
  supabaseAdmin: SupabaseClient,
  dokumentId: string,
  patch: Record<string, unknown>,
) {
  const { data: dok } = await supabaseAdmin
    .from("dokumente")
    .select("meta")
    .eq("id", dokumentId)
    .single();

  const current = (dok as { meta: Record<string, unknown> } | null)?.meta ?? {};
  const processing = { ...((current.processing as Record<string, unknown>) ?? {}), ...patch };

  await supabaseAdmin
    .from("dokumente")
    .update({ meta: { ...current, processing } })
    .eq("id", dokumentId);
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Nur POST erlaubt." }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Haushalt ermitteln ────────────────────────────────────────────────────
  const { data: membership } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.household_id) {
    return jsonResponse({ error: "Kein aktiver Haushalt vorhanden." }, 409);
  }

  const householdId: string = membership.household_id;

  // ── Input parsen ──────────────────────────────────────────────────────────
  let body: { dokument_id?: string; level?: string; force?: boolean; locale?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültige JSON-Payload." }, 400);
  }

  const { dokument_id, level = "classify_only", force = false } = body;
  const requestLocale = normalizeLocale(body.locale);

  if (!dokument_id) {
    return jsonResponse({ error: "dokument_id fehlt." }, 400);
  }
  if (!["store_only", "classify_only", "full"].includes(level)) {
    return jsonResponse({ error: "level muss store_only|classify_only|full sein." }, 400);
  }

  const warnings: string[] = [];
  const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  const fnHeaders = {
    Authorization: authHeader,
    "Content-Type": "application/json",
    apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
  };

  // ── Schritt 1: Dokument laden ─────────────────────────────────────────────
  const { data: dokument } = await supabaseAdmin
    .from("dokumente")
    .select("id, storage_pfad, datei_typ, dateiname, meta, extrahierter_text")
    .eq("id", dokument_id)
    .maybeSingle();

  if (!dokument) {
    return jsonResponse({ status: "failed", warnings: ["Dokument nicht gefunden."] });
  }

  // ── Schritt 2: Atomarer Lock via claim_doc_processing ────────────────────
  const { data: claim, error: claimErr } = await supabaseAdmin.rpc("claim_doc_processing", {
    p_dokument_id:  dokument_id,
    p_level:        level,
    p_household_id: householdId,
    p_force:        force,
  });

  if (claimErr) {
    return jsonResponse({ status: "failed", warnings: [`claim_doc_processing: ${claimErr.message}`] });
  }

  if (claim === "not_found") {
    return jsonResponse({ status: "failed", warnings: ["Dokument nicht gefunden."] });
  }
  if (claim === "forbidden") {
    return jsonResponse({ error: "Kein Zugriff auf dieses Dokument." }, 403);
  }
  if (claim === "busy") {
    return jsonResponse({ status: "busy", warnings: [] });
  }
  if (claim === "already_done") {
    return jsonResponse({ status: "already_done", warnings: [] });
  }
  // "claimed" → weiter

  // ── Schritt 3: store_only ─────────────────────────────────────────────────
  if (level === "store_only") {
    await updateProcessing(supabaseAdmin, dokument_id, {
      status:      "done",
      finished_at: new Date().toISOString(),
      warnings,
    });
    return jsonResponse({ status: "ok", warnings });
  }

  // ── Schritt 4: Datei aus Storage laden ───────────────────────────────────
  let fileBytes: Uint8Array | null = null;
  const storagePfad = (dokument as { storage_pfad?: string }).storage_pfad;

  if (storagePfad) {
    try {
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from("user-dokumente")
        .download(storagePfad);

      if (dlErr) {
        warnings.push(`Storage-Download: ${dlErr.message}`);
      } else if (fileData) {
        fileBytes = new Uint8Array(await fileData.arrayBuffer());
      }
    } catch (e) {
      warnings.push(`Storage-Download (exception): ${(e as Error).message}`);
    }
  }

  // ── Schritt 5: Format-Sniffer (XML / ZUGFeRD) ────────────────────────────
  // Gibt strukturierte Rechnungsdaten zurück oder null.
  let strukturierteDaten: Record<string, unknown> | null = null;

  if (fileBytes) {
    try {
      const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
      const content = decoder.decode(fileBytes).trimStart();

      if (content.startsWith("<?xml")) {
        // ebInterface / UBL / XRechnung
        if (
          content.includes("http://www.ebinterface.at") ||
          content.includes("urn:oasis:names:specification:ubl") ||
          content.includes("CrossIndustryInvoice")
        ) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "application/xml");
          if (!xmlDoc.querySelector("parsererror")) {
            // Minimale Feldextraktion — reicht für NormierteRechnungsDaten
            const get = (tag: string) => xmlDoc.querySelector(tag)?.textContent?.trim() ?? null;
            strukturierteDaten = {
              lieferant:        { name: get("SellerName") ?? get("RegistrationName") ?? get("Name") },
              rechnungsnummer:  get("ID"),
              rechnungsdatum:   get("IssueDate"),
              brutto:           parseFloat(get("TaxInclusiveAmount") ?? get("PayableAmount") ?? "") || null,
              netto:            parseFloat(get("TaxExclusiveAmount") ?? get("LineExtensionAmount") ?? "") || null,
              confidence:       0.9,
              quelle:           "xml_strukturiert" as const,
            };
          }
        }
      } else {
        // ZUGFeRD heuristic in PDFs
        const latin1 = fileBytes.reduce((s, b) => s + String.fromCharCode(b), "");
        if (/zugferd|factur-x/i.test(latin1)) {
          const xmlStart = latin1.indexOf("<?xml");
          const xmlEnd   = latin1.search(/<\/(?:rsm:)?CrossIndustryInvoice>/);
          if (xmlStart !== -1 && xmlEnd !== -1) {
            const xmlChunk = latin1.slice(xmlStart, xmlEnd + 50);
            const parser   = new DOMParser();
            const xmlDoc   = parser.parseFromString(xmlChunk, "application/xml");
            if (!xmlDoc.querySelector("parsererror")) {
              const get = (tag: string) => xmlDoc.querySelector(tag)?.textContent?.trim() ?? null;
              strukturierteDaten = {
                lieferant:       { name: get("SellerName") ?? get("Name") },
                rechnungsnummer: get("ID"),
                rechnungsdatum:  get("IssueDate"),
                brutto:          parseFloat(get("GrandTotalAmount") ?? get("DuePayableAmount") ?? "") || null,
                confidence:      0.85,
                quelle:          "xml_strukturiert" as const,
              };
            }
          }
        }
      }
    } catch (e) {
      warnings.push(`Format-Sniffer: ${(e as Error).message}`);
    }
  }

  await updateProcessing(supabaseAdmin, dokument_id, { last_step: "format_sniffed" });

  // ── Schritt 6: Text-Extraktion (falls kein strukturiertes Format) ─────────
  let extrahierterText: string = (dokument as { extrahierter_text?: string }).extrahierter_text ?? "";

  if (!strukturierteDaten && fileBytes) {
    await updateProcessing(supabaseAdmin, dokument_id, { last_step: "ocr" });

    const dateiTyp: string = (dokument as { datei_typ?: string }).datei_typ ?? "";

    if (dateiTyp === "application/pdf") {
      try {
        const ocrResult = await extractScannedPdfText(fileBytes);
        extrahierterText = ocrResult.text;
        warnings.push(...ocrResult.warnings);
        await updateProcessing(supabaseAdmin, dokument_id, {
          extractor_used: "document-ocr-service",
          pdf_page_count: ocrResult.pageCount,
          ocr_pages_processed: ocrResult.processedPages,
          ocr_truncated: ocrResult.truncated,
          warnings,
        });

        if (extrahierterText) {
          await supabaseAdmin
            .from("dokumente")
            .update({ extrahierter_text: extrahierterText })
            .eq("id", dokument_id);
        }
      } catch (e) {
        const ocrError = (e as Error).message;
        warnings.push(`document-ocr-service: ${ocrError}`);
        await updateProcessing(supabaseAdmin, dokument_id, {
          extractor_used: "document-ocr-service",
          ocr_error: ocrError,
          warnings,
        });
      }
    } else {
    // Haushalt-Einstellungen laden
    const { data: settings } = await supabaseAdmin
      .from("household_settings")
      .select("bildanalyse_modus")
      .eq("household_id", householdId)
      .maybeSingle();

    const modus: string = (settings as { bildanalyse_modus?: string } | null)?.bildanalyse_modus ?? "chatgpt_vision";

    try {
      // Chunked base64 — verhindert O(n²)-Stringkonkatenation bei grossen Dateien
      const visionResp = await fetch(`${FUNCTIONS_URL}/ki-vision`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          mode:        modus,
          file_base64: bytesToBase64(fileBytes),
          mime_type:   dateiTyp,
          file_name:   (dokument as { dateiname?: string }).dateiname,
          locale:      requestLocale,
          prompt:      "Extrahiere den vollständigen sichtbaren Text dieses Dokuments OCR-genau.\n" +
                       "Wichtig:\n" +
                       "- Keine Bildbeschreibung\n" +
                       "- Keine Zusammenfassung\n" +
                       "- Keine Interpretation\n" +
                       "- Originaltext so vollständig wie möglich\n" +
                       "- Überschriften, Tabellen, Beträge, Daten, Referenzen und Nummern mit übernehmen\n" +
                       "- Falls es sich um eine Rechnung handelt, auch Händler, Datum, Netto, Brutto, MwSt., Summe und Positionen vollständig mit übernehmen\n" +
                       "- Gib nur den extrahierten Text zurück.",
        }),
      });

      if (visionResp.ok) {
        const visionData = await visionResp.json() as {
          text?: string;
          extractor?: string;
          warnings?: string[];
          choices?: Array<{ message?: { content?: string } }>;
        };
        extrahierterText =
          visionData?.text ??
          visionData?.choices?.[0]?.message?.content ??
          "";

        // Warnings aus ki-vision weiterleiten (z.B. leerer OCR-Text, ocr_regeln-Fallback)
        if (Array.isArray(visionData?.warnings)) {
          warnings.push(...(visionData.warnings as string[]));
        }

        // extractor_used immer setzen — auch bei leerem Text, für Debugging
        await updateProcessing(supabaseAdmin, dokument_id, {
          extractor_used: visionData?.extractor ?? modus,
        });

        if (extrahierterText) {
          await supabaseAdmin
            .from("dokumente")
            .update({ extrahierter_text: extrahierterText })
            .eq("id", dokument_id);
        }
      } else {
        // Fehlertext aus ki-vision-Response lesen statt nur HTTP-Status
        const errBody = await visionResp.json().catch(() => ({})) as { error?: string };
        const ocrError = errBody?.error || `HTTP ${visionResp.status}`;
        warnings.push(`ki-vision: ${ocrError}`);
        // Debug-Info ins Dokument: welcher Modus lief + warum gescheitert
        await updateProcessing(supabaseAdmin, dokument_id, {
          extractor_used: modus,
          ocr_error:      ocrError,
        });
      }
    } catch (e) {
      warnings.push(`ki-vision (exception): ${(e as Error).message}`);
    }
    }
  }

  // ── Schritt 7: Klassifikation ─────────────────────────────────────────────
  await updateProcessing(supabaseAdmin, dokument_id, { last_step: "classify" });

  const dateiname: string = (dokument as { dateiname?: string }).dateiname ?? "Dokument";
  const klassiText = strukturierteDaten
    ? `Dateiname: ${dateiname}\n(Strukturiertes XML-Dokument erkannt)`
    : smartTruncate(extrahierterText || dateiname);

  const KLASSIFIKATIONS_PROMPT = `Analysiere dieses Dokument und klassifiziere es.

Antworte AUSSCHLIESSLICH mit validem JSON, ohne Markdown-Formatierung.

Pflichtfelder:
- doc_type: "invoice" | "contract" | "policy" | "other"
- kategorie: passende Kategorie auf Deutsch (z.B. "Rechnungen & Belege", "Verträge", "Versicherungen", "Handbücher", "Sonstiges")
- tags: Array aus 2-5 deutschen Schlagwörtern
- confidence: Zahl zwischen 0.0 und 1.0 (Sicherheit der Klassifikation)

Beispiel: {"doc_type":"invoice","kategorie":"Rechnungen & Belege","tags":["rechnung","einkauf"],"confidence":0.92}

Dokument:
${klassiText}`;

  let docType = "other";
  let kategorie = "Sonstiges";
  let tags: string[] = [];
  let classificationConfidence = 0;

  try {
    const chatResp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
      method:  "POST",
      headers: fnHeaders,
      body:    JSON.stringify({
        messages:    [{ role: "user", content: KLASSIFIKATIONS_PROMPT }],
        temperature: 0.1,
        max_tokens:  400,
      }),
    });

    if (chatResp.ok) {
      const chatData = await chatResp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const rawContent = chatData.choices?.[0]?.message?.content ?? "";

      try {
        // Markdown-Fences entfernen
        const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed  = JSON.parse(cleaned) as Record<string, unknown>;

        const validTypes = ["invoice", "contract", "policy", "other"];
        docType    = validTypes.includes(parsed.doc_type as string) ? (parsed.doc_type as string) : "other";
        kategorie  = (parsed.kategorie as string) || "Sonstiges";
        tags       = Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [];
        const conf = parseFloat(String(parsed.confidence ?? "0"));
        classificationConfidence = isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0;
      } catch {
        warnings.push("Klassifikation: JSON-Parse fehlgeschlagen, Fallback auf 'other'.");
      }
    } else {
      warnings.push(`ki-chat (Klassifikation): HTTP ${chatResp.status}`);
    }
  } catch (e) {
    warnings.push(`ki-chat (Klassifikation, exception): ${(e as Error).message}`);
  }

  // Klassifikation in dokumente speichern
  try {
    await supabaseAdmin
      .from("dokumente")
      .update({ dokument_typ: docType, kategorie, tags })
      .eq("id", dokument_id);
    await updateProcessing(supabaseAdmin, dokument_id, {
      classification_confidence: classificationConfidence,
      doc_type_detected:         docType,
    });
  } catch (e) {
    warnings.push(`dokumente update (Klassifikation): ${(e as Error).message}`);
  }

  // ── Keyword-Heuristik: Invoice-Safety-Net ────────────────────────────────
  // Korrigiert doc_type auf "invoice" wenn starke Signalwörter im OCR-Text vorhanden sind,
  // aber die Klassifikation "other" oder eine niedrige Konfidenz geliefert hat.
  if ((docType === "other" || classificationConfidence < 0.65) && extrahierterText) {
    const lower = extrahierterText.toLowerCase();
    const invoiceSignals = [
      "rechnung", "kundenbeleg", "kassenbon", "quittung",
      "brutto", "netto", "mwst", "ust.", "gesamtbetrag",
      "rechnungsnummer", "bon-nr", "kassennummer",
      "summe", "gesamt", "zahlungsziel", "eur",
      "invoice", "receipt", "tax invoice", "vat", "total amount",
      "subtotal", "grand total", "invoice number", "receipt number",
    ];
    const hits = invoiceSignals.filter((w) => lower.includes(w));
    if (hits.length >= 2) {
      docType = "invoice";
      kategorie = "Rechnungen & Belege";
      if (classificationConfidence < 0.65) classificationConfidence = 0.65;
      warnings.push(`Keyword-Heuristik: invoice erkannt (${hits.slice(0, 3).join(", ")})`);
      try {
        await supabaseAdmin
          .from("dokumente")
          .update({ dokument_typ: docType, kategorie })
          .eq("id", dokument_id);
      } catch (e) {
        warnings.push(`Keyword-Heuristik update: ${(e as Error).message}`);
      }
    }
  }

  // ── Schritt 8: Confidence-Gate (classify_only / Downgrade vor full) ───────
  let effektivesLevel = level;

  if (level === "full" && classificationConfidence < 0.50) {
    effektivesLevel = "classify_only";
    await updateProcessing(supabaseAdmin, dokument_id, { downgraded: true });
    warnings.push(`Klassifikations-Konfidenz zu niedrig (${classificationConfidence.toFixed(2)}), Downgrade auf classify_only.`);
  }

  // ── Schritt 9: classify_only → auto_stub + fertig ─────────────────────────
  let wissenId: string | null = null;

  if (effektivesLevel === "classify_only") {
    try {
      const stubSummary = {
        kind: "document",
        documentClass: docType,
        documentType: docType,
        title: dateiname,
        headline: dateiname,
      };
      const localizedContent = { de: { title: dateiname, content: "", headline: dateiname }, "en-GB": { title: dateiname, content: "", headline: dateiname } };
      wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
        household_id: householdId,
        user_id:      null,
        titel:        dateiname,
        kategorie,
        tags,
        dokument_id,
        herkunft:     "auto_stub",
        summary:      stubSummary,
        localized_content: localizedContent,
        source_locale: requestLocale,
      });
    } catch (e) {
      warnings.push(`home_wissen (auto_stub): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, {
      status:      "done",
      finished_at: new Date().toISOString(),
      warnings,
    });

    return jsonResponse({ status: "ok", doc_type: docType, wissen_id: wissenId, warnings });
  }

  // ── Schritt 10: full-Verarbeitung nach doc_type ───────────────────────────
  await updateProcessing(supabaseAdmin, dokument_id, { last_step: `extract_${docType}` });

  let entityId: string | null = null;
  let summaryData: Record<string, unknown> | null = null;

  // ── 10a: invoice ──────────────────────────────────────────────────────────
  if (docType === "invoice") {
    try {
      let parsed: Record<string, unknown> = {};

      if (strukturierteDaten) {
        // Strukturiertes XML: Felder direkt mappen
        const lieferant = (strukturierteDaten.lieferant as Record<string, unknown> | null)?.name as string | null;
        parsed = {
          merchant_name:  lieferant,
          purchase_date:  strukturierteDaten.rechnungsdatum,
          total_amount:   strukturierteDaten.brutto,
          currency:       "EUR",
          invoice_number: strukturierteDaten.rechnungsnummer,
          purchase_type:  "Sonstiges",
          key_items:      [],
          summary:        lieferant ? `Rechnung von ${lieferant}.` : "Rechnung.",
        };
      } else if (extrahierterText) {
        const INVOICE_SCHEMA = {
          type: "json_schema",
          json_schema: {
            name:   "invoice_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                merchant_name:  { type: "string" },
                purchase_date:  { type: ["string", "null"] },
                total_amount:   { type: ["number", "null"] },
                currency:       { type: "string" },
                invoice_number: { type: ["string", "null"] },
                purchase_type:  { type: "string" },
                key_items:      { type: "array", items: { type: "string" } },
                positionen: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name:        { type: "string" },
                      menge:       { type: ["number", "null"] },
                      einheit:     { type: ["string", "null"] },
                      einzelpreis: { type: ["number", "null"] },
                      gesamtpreis: { type: ["number", "null"] },
                      ust_satz:    { type: ["number", "null"] },
                    },
                    required: ["name", "menge", "einheit", "einzelpreis", "gesamtpreis", "ust_satz"],
                    additionalProperties: false,
                  },
                },
                summary:        { type: "string" },
              },
              required:             ["merchant_name", "purchase_date", "total_amount", "currency", "invoice_number", "purchase_type", "key_items", "positionen", "summary"],
              additionalProperties: false,
            },
          },
        };

        const EXTRAKTION_PROMPT = `Extrahiere die wichtigsten Felder aus dieser Rechnung.

merchant_name: Name des Händlers/Lieferanten (Pflicht).
purchase_date: Rechnungsdatum als ISO-Date (YYYY-MM-DD) oder null.
total_amount: Gesamtbetrag inkl. MwSt. als Zahl oder null.
currency: Währung (Standard "EUR").
invoice_number: Rechnungsnummer oder null.
purchase_type: Kategorie des Einkaufs — einer von: Lebensmittel, Tankstelle, Restaurant, Elektronik, Baumarkt, Apotheke, Kleidung, Sonstiges.
key_items: Array mit 2–4 herausragenden Produkten oder Posten (kurze Namen, kein Preis). Leeres Array wenn nichts erkennbar.
summary: 1 vollständiger Satz auf Deutsch, der beschreibt was gekauft/geleistet wurde — gerne mit Produktnamen wenn erkennbar.

positionen: Alle erkennbaren Rechnungspositionen. name ist Pflicht; Preise als Zahlen, unbekannte Werte null.

Text:
${smartTruncate(extrahierterText)}`;

        const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
          method:  "POST",
          headers: fnHeaders,
          body:    JSON.stringify({
            messages:        [{ role: "user", content: EXTRAKTION_PROMPT }],
            temperature:     0.1,
            max_tokens:      1200,
            response_format: INVOICE_SCHEMA,
          }),
        });

        if (resp.ok) {
          const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          const raw  = data.choices?.[0]?.message?.content ?? "";
          parsed = parseKiJson(raw);
          if (!parsed.merchant_name) warnings.push("invoice Extraktion: merchant_name fehlt.");
        } else {
          warnings.push(`ki-chat (invoice Extraktion): HTTP ${resp.status}`);
        }
      }

      const merchantName   = (parsed.merchant_name as string) || dateiname;
      const purchaseDate   = (parsed.purchase_date as string) || null;
      const totalAmount    = (parsed.total_amount as number) || null;
      const currency       = (parsed.currency as string) || "EUR";
      const invoiceNumber  = (parsed.invoice_number as string) || null;
      const purchaseType   = (parsed.purchase_type as string) || "Sonstiges";
      const rawPositionen  = Array.isArray(parsed.positionen) ? (parsed.positionen as Record<string, unknown>[]) : [];
      const positionen = rawPositionen
        .map((pos) => ({
          name: String(pos.name || "").trim(),
          menge: typeof pos.menge === "number" ? pos.menge : null,
          einheit: typeof pos.einheit === "string" ? pos.einheit : null,
          einzelpreis: typeof pos.einzelpreis === "number" ? pos.einzelpreis : null,
          gesamtpreis: typeof pos.gesamtpreis === "number" ? pos.gesamtpreis : null,
          ust_satz: typeof pos.ust_satz === "number" ? pos.ust_satz : null,
        }))
        .filter((pos) => pos.name);
      const keyItems       = Array.isArray(parsed.key_items) && (parsed.key_items as string[]).length > 0
        ? (parsed.key_items as string[])
        : positionen.slice(0, 4).map((pos) => pos.name);
      const summary        = (parsed.summary as string) || `Rechnung von ${merchantName}.`;

      // Titelregel: {merchant_name} – {DD.MM.YYYY} | Fallback: {merchant_name} – Rechnung
      const dateFormatted = formatDateDE(purchaseDate);
      const titel = dateFormatted
        ? `${merchantName} – ${dateFormatted}`
        : `${merchantName} – Rechnung`;

      // summary_data für Frontend (Budget-Import etc.)
      summaryData = {
        merchant:      merchantName,
        amount:        totalAmount,
        currency,
        purchase_type: purchaseType,
      };

      const invoiceSummary = {
        kind: "invoice",
        documentClass: "rechnung",
        documentType: "rechnung",
        merchant: merchantName,
        date: purchaseDate,
        amount: totalAmount,
        currency,
        invoice_number: invoiceNumber,
        purchase_type: purchaseType,
        items: positionen.length > 0 ? positionen.map((pos) => ({
          name: pos.name,
          amount: pos.gesamtpreis,
          quantity: pos.menge,
          unit: pos.einheit,
        })) : keyItems.map((name) => ({ name })),
        key_items: keyItems,
        headline: summary,
      };

      // Strukturierter home_wissen-Inhalt
      const inhaltZeilen = [
        summary,
        "",
        `Händler: ${merchantName}`,
        ...(dateFormatted ? [`Datum: ${dateFormatted}`] : []),
        ...(totalAmount != null ? [`Betrag: ${totalAmount} ${currency}`] : []),
        `Art: ${purchaseType}`,
        ...(invoiceNumber ? [`Rechnungsnummer: ${invoiceNumber}`] : []),
        ...(keyItems.length > 0 ? [`Enthält: ${keyItems.join(", ")}`] : []),
      ];
      const inhalt = inhaltZeilen.join("\n");
      const localizedContent = localizedInvoiceContent(titel, invoiceSummary);

      // Kategorie auf Dokument setzen
      await supabaseAdmin.from("dokumente").update({ kategorie: "Rechnung" }).eq("id", dokument_id);

      // rechnungen upsert (keine Positionen)
      try {
        const { data: rechnungData, error: rechnungErr } = await supabaseAdmin
          .from("rechnungen")
          .upsert({
            household_id:    householdId,
            dokument_id,
            lieferant_name:  merchantName,
            rechnungsnummer: invoiceNumber,
            rechnungsdatum:  purchaseDate,
            waehrung:        currency,
            brutto:          totalAmount,
            extraktion:      parsed,
            raw_text:        extrahierterText || null,
          }, { onConflict: "household_id,dokument_id" })
          .select("id")
          .single();

        if (rechnungErr) {
          warnings.push(`rechnungen upsert: ${rechnungErr.message}`);
        } else {
          entityId = (rechnungData as { id: string })?.id ?? null;
        }
      } catch (e) {
        warnings.push(`rechnungen (exception): ${(e as Error).message}`);
      }

      if (entityId) {
        try {
          await supabaseAdmin
            .from("rechnungs_positionen")
            .delete()
            .eq("rechnung_id", entityId);

          if (positionen.length > 0) {
            const { error: posErr } = await supabaseAdmin
              .from("rechnungs_positionen")
              .insert(positionen.map((pos, index) => ({
                household_id: householdId,
                rechnung_id: entityId,
                pos_nr: index + 1,
                beschreibung: pos.name,
                menge: pos.menge,
                einheit: pos.einheit,
                einzelpreis: pos.einzelpreis,
                gesamtpreis: pos.gesamtpreis,
                ust_satz: pos.ust_satz,
                klassifikation: {},
              })));
            if (posErr) warnings.push(`rechnungs_positionen: ${posErr.message}`);
          }
        } catch (e) {
          warnings.push(`rechnungs_positionen (exception): ${(e as Error).message}`);
        }
      }

      // home_wissen
      const merchantTag = normalisiereTag(merchantName);
      wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
        household_id: householdId,
        user_id:      null,
        titel,
        inhalt,
        kategorie:    "Rechnungen & Belege",
        tags:         ["rechnung", ...(merchantTag ? [merchantTag] : []), ...tags].filter(Boolean),
        dokument_id,
        herkunft:     "auto_full",
        summary:      invoiceSummary,
        localized_content: localizedContent,
        source_locale: requestLocale,
      });

      // dokument_links
      const links = [];
      if (entityId) links.push({ household_id: householdId, dokument_id, entity_type: "rechnung", entity_id: entityId, role: "original" });
      if (wissenId) links.push({ household_id: householdId, dokument_id, entity_type: "home_wissen", entity_id: wissenId, role: "quelle" });
      if (links.length > 0) {
        await supabaseAdmin.from("dokument_links").upsert(links, {
          onConflict:      "household_id,dokument_id,entity_type,entity_id,role",
          ignoreDuplicates: true,
        });
      }
    } catch (e) {
      warnings.push(`invoice (exception): ${(e as Error).message}`);
    }
  }

  // ── 10b: contract ─────────────────────────────────────────────────────────
  else if (docType === "contract") {
    let extractionConfidence = 0;

    try {
      const CONTRACT_SCHEMA = {
        type: "json_schema",
        json_schema: {
          name:   "contract_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              counterparty_name:  { type: "string" },
              subject_or_product: { type: "string" },
              contract_type:      { type: "string" },
              start_date:         { type: ["string", "null"] },
              end_date:           { type: ["string", "null"] },
              duration_text:      { type: ["string", "null"] },
              monthly_amount:     { type: ["number", "null"] },
              notice_period_days: { type: ["number", "null"] },
              key_points:         { type: "array", items: { type: "string" } },
              confidence:         { type: "number" },
              summary:            { type: "string" },
            },
            required:             ["counterparty_name", "subject_or_product", "contract_type", "start_date", "end_date", "duration_text", "monthly_amount", "notice_period_days", "key_points", "confidence", "summary"],
            additionalProperties: false,
          },
        },
      };

      const EXTRAKTION_PROMPT = `Extrahiere die wichtigsten Felder aus diesem Vertrag.

counterparty_name: Name des Vertragspartners (Pflicht).
subject_or_product: Vertragsgegenstand, z.B. "Mobilfunkvertrag", "Mietvertrag", "Strom" (Pflicht).
contract_type: Normalisierter Vertragstyp — einer von: Mobilfunkvertrag, Internetvertrag, Strom, Gas, Mietvertrag, KFZ, Finanzierung, Sonstiges.
start_date: Vertragsbeginn als ISO-Date oder null.
end_date: Vertragsende als ISO-Date oder null.
duration_text: Laufzeit als Text oder null.
monthly_amount: Monatlicher Betrag als Zahl (nur Zahl) oder null.
notice_period_days: Kündigungsfrist in Tagen als Zahl oder null.
key_points: 2–4 kurze Stichpunkte zu den wichtigsten Vertragsinhalten.
confidence: Extraktionssicherheit 0.0–1.0.
summary: 1–2 Sätze auf Deutsch, die den Vertrag verständlich zusammenfassen (Vertragspartner, Gegenstand, Laufzeit).

Text:
${smartTruncate(extrahierterText)}`;

      const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          messages:        [{ role: "user", content: EXTRAKTION_PROMPT }],
          temperature:     0.1,
          max_tokens:      500,
          response_format: CONTRACT_SCHEMA,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw  = data.choices?.[0]?.message?.content ?? "";
        const parsed = parseKiJson(raw);

        const conf = parseFloat(String(parsed.confidence ?? "0"));
        extractionConfidence = isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0;

        const counterparty      = (parsed.counterparty_name as string) || dateiname;
        const subject           = (parsed.subject_or_product as string) || "Vertrag";
        const contractType      = (parsed.contract_type as string) || "Sonstiges";
        const monthlyAmount     = typeof parsed.monthly_amount === "number" ? parsed.monthly_amount as number : null;
        const noticePeriodDays  = typeof parsed.notice_period_days === "number" ? parsed.notice_period_days as number : null;
        const keyPoints         = Array.isArray(parsed.key_points) ? (parsed.key_points as string[]) : [];
        const summary           = (parsed.summary as string) || `Vertrag mit ${counterparty}.`;
        const counterpartyTag   = normalisiereTag(counterparty);

        // Titelregel: {contract_type || subject || "Vertrag"} – {counterparty || dateiname}
        const titel = `${contractType || subject || "Vertrag"} – ${counterparty || dateiname}`;

        // Strukturierter home_wissen-Inhalt
        const startStr     = formatDateDE(parsed.start_date as string | null);
        const endStr       = formatDateDE(parsed.end_date as string | null);
        const durationText = (parsed.duration_text as string) || null;
        const inhaltZeilen: string[] = [
          summary,
          "",
          `Vertragspartner: ${counterparty}`,
          `Vertragsart: ${contractType}`,
          ...(startStr ? [`Beginn: ${startStr}`] : []),
          ...(endStr ? [`Ende: ${endStr}`] : []),
          ...(durationText ? [`Laufzeit: ${durationText}`] : []),
          ...(monthlyAmount != null ? [`Monatlicher Betrag: ${monthlyAmount} EUR`] : []),
          ...(noticePeriodDays != null ? [`Kündigungsfrist: ${noticePeriodDays} Tage`] : []),
        ];
        if (keyPoints.length > 0) {
          inhaltZeilen.push("", "Wichtige Punkte:");
          keyPoints.forEach((p: string) => inhaltZeilen.push(`• ${p}`));
        }
        const inhalt = inhaltZeilen.join("\n");
        const contractSummary = {
          kind: "contract",
          documentClass: "vertrag",
          documentType: "vertrag",
          counterparty,
          subject,
          contract_type: contractType,
          start_date: parsed.start_date,
          end_date: parsed.end_date,
          monthly_amount: monthlyAmount,
          notice_period_days: noticePeriodDays,
          highlights: keyPoints,
          headline: summary,
        };
        const localizedContent = await localizedContentFromGerman(fnHeaders, FUNCTIONS_URL, titel, inhalt, summary);

        if (extractionConfidence >= 0.50) {
          // Reprocess-Schutz: reviewed_at gesetzt → manuell korrigiert
          const { data: vorhandenerVertrag } = await supabaseAdmin
            .from("vertraege")
            .select("id, reviewed_at")
            .eq("household_id", householdId)
            .eq("dokument_id", dokument_id)
            .maybeSingle();

          if (vorhandenerVertrag?.reviewed_at) {
            warnings.push("Vertrag wurde bereits manuell geprüft, Auto-Update übersprungen.");
            entityId = (vorhandenerVertrag as { id: string }).id;
          } else {
            const reviewRequired = extractionConfidence < 0.75;
            const herkunft = reviewRequired ? "auto_low_confidence" : "auto_full";

            const { data: upsertData, error: upsertErr } = await supabaseAdmin
              .from("vertraege")
              .upsert({
                household_id:              householdId,
                dokument_id,
                partner:                   counterparty,
                vertragstitel:             subject,
                start_date:                (parsed.start_date as string) || null,
                end_date:                  (parsed.end_date as string) || null,
                kuendigungsfrist_raw:      (parsed.duration_text as string) || null,
                kuendigungsfrist_tage:     noticePeriodDays,
                review_required:           reviewRequired,
                classification_confidence: classificationConfidence,
                extraction_confidence:     extractionConfidence,
                extraktion:                parsed,
              }, { onConflict: "household_id,dokument_id" })
              .select("id")
              .single();

            if (upsertErr) {
              warnings.push(`vertraege upsert: ${upsertErr.message}`);
            } else {
              entityId = (upsertData as { id: string })?.id ?? null;
            }

            wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
              household_id: householdId,
              user_id:      null,
              titel,
              inhalt,
              kategorie:    "Verträge",
              tags:         ["vertrag", ...(counterpartyTag ? [counterpartyTag] : []), ...tags].filter(Boolean),
              dokument_id,
              herkunft,
              summary:      contractSummary,
              localized_content: localizedContent,
              source_locale: requestLocale,
            });

            if (entityId) {
              await supabaseAdmin.from("dokument_links").upsert([
                { household_id: householdId, dokument_id, entity_type: "vertrag", entity_id: entityId, role: "original" },
                ...(wissenId ? [{ household_id: householdId, dokument_id, entity_type: "home_wissen", entity_id: wissenId, role: "quelle" }] : []),
              ], { onConflict: "household_id,dokument_id,entity_type,entity_id,role", ignoreDuplicates: true });
            }
          }
        } else {
          warnings.push(`Extraktions-Konfidenz zu niedrig (${extractionConfidence.toFixed(2)}), kein Vertrag-Eintrag.`);
          await updateProcessing(supabaseAdmin, dokument_id, { downgraded: true });

          wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
            household_id: householdId,
            user_id:      null,
            titel,
            inhalt,
            kategorie:    "Verträge",
            tags:         ["vertrag", ...(counterpartyTag ? [counterpartyTag] : []), ...tags].filter(Boolean),
            dokument_id,
            herkunft:     "auto_stub",
            summary:      contractSummary,
            localized_content: localizedContent,
            source_locale: requestLocale,
          });
        }
      } else {
        warnings.push(`ki-chat (contract Extraktion): HTTP ${resp.status}`);
      }
    } catch (e) {
      warnings.push(`contract (exception): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, { extraction_confidence: extractionConfidence });
  }

  // ── 10c: policy ───────────────────────────────────────────────────────────
  else if (docType === "policy") {
    let extractionConfidence = 0;

    try {
      const POLICY_SCHEMA = {
        type: "json_schema",
        json_schema: {
          name:   "policy_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              insurer_name:     { type: "string" },
              policy_type:      { type: "string" },
              policy_number:    { type: ["string", "null"] },
              start_date:       { type: ["string", "null"] },
              end_date:         { type: ["string", "null"] },
              coverage_sum:     { type: ["number", "null"] },
              premium:          { type: ["number", "null"] },
              premium_interval: { type: ["string", "null"] },
              deductible:       { type: ["number", "null"] },
              coverage_summary: { type: "string" },
              confidence:       { type: "number" },
              summary:          { type: "string" },
            },
            required:             ["insurer_name", "policy_type", "policy_number", "start_date", "end_date", "coverage_sum", "premium", "premium_interval", "deductible", "coverage_summary", "confidence", "summary"],
            additionalProperties: false,
          },
        },
      };

      const EXTRAKTION_PROMPT = `Extrahiere die wichtigsten Felder aus dieser Versicherungspolizze.

insurer_name: Name des Versicherers (Pflicht).
policy_type: Art der Versicherung, z.B. "Haushaltsversicherung", "Kfz-Haftpflicht", "Lebensversicherung" (Pflicht).
policy_number: Versicherungsnummer oder Polizzennummer als Text oder null.
start_date: Versicherungsbeginn als ISO-Date oder null.
end_date: Versicherungsende als ISO-Date oder null.
coverage_sum: Deckungssumme als Zahl oder null.
premium: Prämie als Zahl oder null.
premium_interval: Prämienintervall (monatlich/vierteljaehrlich/halbjaehrlich/jaehrlich) oder null.
deductible: Selbstbehalt als Zahl oder null.
coverage_summary: 1 Satz auf Deutsch — was ist konkret versichert (z.B. "Haushaltsinhalt inkl. Einbruch und Wasserschäden").
confidence: Extraktionssicherheit 0.0–1.0.
summary: 1–2 Sätze auf Deutsch mit allen relevanten Infos: Versicherer, Art, Laufzeit, Deckungssumme, Prämie, Selbstbehalt.

Text:
${smartTruncate(extrahierterText)}`;

      const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          messages:        [{ role: "user", content: EXTRAKTION_PROMPT }],
          temperature:     0.1,
          max_tokens:      500,
          response_format: POLICY_SCHEMA,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw  = data.choices?.[0]?.message?.content ?? "";
        const parsed = parseKiJson(raw);

        const conf = parseFloat(String(parsed.confidence ?? "0"));
        extractionConfidence = isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0;

        const insurer          = (parsed.insurer_name as string) || dateiname;
        const policyType       = (parsed.policy_type as string) || "Versicherung";
        const polizzenNummer   = (parsed.policy_number as string) ?? (parsed.polizzen_nummer as string) ?? null;
        const coverageSummary  = (parsed.coverage_summary as string) || null;
        const summary          = (parsed.summary as string) || `Versicherung bei ${insurer}.`;
        const insurerTag       = normalisiereTag(insurer);

        // Titelregel: {insurer} – {policyType} | Fallback: {insurer} – Versicherung
        const titel = policyType ? `${insurer} – ${policyType}` : `${insurer} – Versicherung`;

        // Strukturierter home_wissen-Inhalt
        const pStartStr = formatDateDE(parsed.start_date as string | null);
        const pEndStr   = formatDateDE(parsed.end_date as string | null);
        const praemie   = typeof parsed.premium === "number" ? parsed.premium as number : null;
        const deckung   = typeof parsed.coverage_sum === "number" ? parsed.coverage_sum as number : null;
        const selbst    = typeof parsed.deductible === "number" ? parsed.deductible as number : null;
        const intervall = normalisierePraemienIntervall(parsed.premium_interval as string);
        const pInhaltZeilen: string[] = [
          summary,
          "",
          `Versicherer: ${insurer}`,
          `Versicherungstyp: ${policyType}`,
          ...(polizzenNummer ? [`Versicherungsnummer: ${polizzenNummer}`] : []),
          ...((pStartStr || pEndStr) ? [`Laufzeit: ${pStartStr ?? "?"} – ${pEndStr ?? "?"}`] : []),
          ...(praemie != null ? [`Prämie: ${praemie} EUR / ${intervall}`] : []),
          ...(deckung != null ? [`Deckungssumme: ${deckung} EUR`] : []),
          ...(selbst != null ? [`Selbstbehalt: ${selbst} EUR`] : []),
          ...(coverageSummary ? ["", `Deckung: ${coverageSummary}`] : []),
        ];
        const inhalt = pInhaltZeilen.join("\n");
        const policySummary = {
          kind: "policy",
          documentClass: "versicherung",
          documentType: "versicherung",
          insurer,
          policy_type: policyType,
          policy_number: polizzenNummer,
          start_date: parsed.start_date,
          end_date: parsed.end_date,
          premium: praemie,
          coverage_sum: deckung,
          deductible: selbst,
          coverage_summary: coverageSummary,
          headline: summary,
        };
        const localizedContent = await localizedContentFromGerman(fnHeaders, FUNCTIONS_URL, titel, inhalt, summary);

        const rawVersicherungsart = policyType;
        const normiertArt = normalisiereVersicherungsart(rawVersicherungsart);

        if (extractionConfidence >= 0.50) {
          // Reprocess-Schutz
          const { data: vorhandenePolizze } = await supabaseAdmin
            .from("versicherungs_polizzen")
            .select("id, reviewed_at")
            .eq("household_id", householdId)
            .eq("dokument_id", dokument_id)
            .maybeSingle();

          if (vorhandenePolizze?.reviewed_at) {
            warnings.push("Polizze wurde bereits manuell geprüft, Auto-Update übersprungen.");
            entityId = (vorhandenePolizze as { id: string }).id;
          } else {
            const reviewRequired = extractionConfidence < 0.75;
            const herkunft = reviewRequired ? "auto_low_confidence" : "auto_full";

            const { data: upsertData, error: upsertErr } = await supabaseAdmin
              .from("versicherungs_polizzen")
              .upsert({
                household_id:              householdId,
                dokument_id,
                versicherer:               insurer,
                versicherungsart:          normiertArt,
                polizzen_nummer:           polizzenNummer,
                deckung:                   coverageSummary || summary,
                praemie:                   (parsed.premium as number) || null,
                praemien_intervall:        normalisierePraemienIntervall(parsed.premium_interval as string),
                start_date:                (parsed.start_date as string) || null,
                end_date:                  (parsed.end_date as string) || null,
                waehrung:                  "EUR",
                review_required:           reviewRequired,
                classification_confidence: classificationConfidence,
                extraction_confidence:     extractionConfidence,
                extraktion:                { ...parsed, raw_policy_type: rawVersicherungsart !== normiertArt ? rawVersicherungsart : undefined },
              }, { onConflict: "household_id,dokument_id" })
              .select("id")
              .single();

            if (upsertErr) {
              warnings.push(`versicherungs_polizzen upsert: ${upsertErr.message}`);
            } else {
              entityId = (upsertData as { id: string })?.id ?? null;
            }

            wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
              household_id: householdId,
              user_id:      null,
              titel,
              inhalt,
              kategorie:    "Versicherungen",
              tags:         ["versicherung", ...(insurerTag ? [insurerTag] : []), normiertArt, ...tags].filter(Boolean),
              dokument_id,
              herkunft,
              summary:      policySummary,
              localized_content: localizedContent,
              source_locale: requestLocale,
            });

            if (entityId) {
              await supabaseAdmin.from("dokument_links").upsert([
                { household_id: householdId, dokument_id, entity_type: "polizze", entity_id: entityId, role: "original" },
                ...(wissenId ? [{ household_id: householdId, dokument_id, entity_type: "home_wissen", entity_id: wissenId, role: "quelle" }] : []),
              ], { onConflict: "household_id,dokument_id,entity_type,entity_id,role", ignoreDuplicates: true });
            }
          }
        } else {
          warnings.push(`Extraktions-Konfidenz zu niedrig (${extractionConfidence.toFixed(2)}), kein Polizze-Eintrag.`);
          await updateProcessing(supabaseAdmin, dokument_id, { downgraded: true });

          wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
            household_id: householdId,
            user_id:      null,
            titel,
            inhalt,
            kategorie:    "Versicherungen",
            tags:         ["versicherung", ...(insurerTag ? [insurerTag] : []), ...tags].filter(Boolean),
            dokument_id,
            herkunft:     "auto_stub",
            summary:      policySummary,
            localized_content: localizedContent,
            source_locale: requestLocale,
          });
        }
      } else {
        warnings.push(`ki-chat (policy Extraktion): HTTP ${resp.status}`);
      }
    } catch (e) {
      warnings.push(`policy (exception): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, { extraction_confidence: extractionConfidence });
  }

  // ── 10d: other ────────────────────────────────────────────────────────────
  else {
    try {
      const ZUSAMMENFASSUNG_PROMPT = `Erstelle einen kurzen Titel und eine Zusammenfassung für dieses Dokument.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.

Felder: titel (max 80 Zeichen), inhalt (max 400 Zeichen Zusammenfassung).

Dokument:
${smartTruncate(extrahierterText || dateiname, 2000)}`;

      const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          messages:    [{ role: "user", content: ZUSAMMENFASSUNG_PROMPT }],
          temperature: 0.3,
          max_tokens:  300,
        }),
      });

      let titel  = dateiname;
      let inhalt = "";

      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw  = data.choices?.[0]?.message?.content ?? "";
        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          const parsed  = JSON.parse(cleaned) as Record<string, unknown>;
          titel  = (parsed.titel as string) || dateiname;
          inhalt = (parsed.inhalt as string) || "";
        } catch {
          warnings.push("other Zusammenfassung: JSON-Parse fehlgeschlagen.");
        }
      } else {
        warnings.push(`ki-chat (other): HTTP ${resp.status}`);
      }
      const otherSummary = {
        kind: "document",
        documentClass: "sonstiges",
        documentType: "sonstiges",
        title: titel,
        headline: inhalt,
      };
      const localizedContent = await localizedContentFromGerman(fnHeaders, FUNCTIONS_URL, titel, inhalt, inhalt);

      wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
        household_id: householdId,
        user_id:      null,
        titel,
        inhalt,
        kategorie,
        tags,
        dokument_id,
        herkunft:     "auto_full",
        summary:      otherSummary,
        localized_content: localizedContent,
        source_locale: requestLocale,
      });
    } catch (e) {
      warnings.push(`other (exception): ${(e as Error).message}`);
    }
  }

  // ── Abschluss ─────────────────────────────────────────────────────────────
  await updateProcessing(supabaseAdmin, dokument_id, {
    status:      "done",
    finished_at: new Date().toISOString(),
    warnings,
  });

  return jsonResponse({
    status:       "ok",
    doc_type:     docType,
    wissen_id:    wissenId,
    entity_id:    entityId,
    summary_data: summaryData,
    warnings,
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ status: "failed", error: msg, warnings: [msg] }, 500);
  }
});
