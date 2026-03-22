// Supabase Edge Function: doc-process
// Universeller Dokumenten-Orchestrator (Multiscanner-Pipeline).
//
// POST /doc-process
// Body: { dokument_id: string, level: "store_only"|"classify_only"|"full", force?: boolean }
// Output: { status: "ok"|"already_done"|"busy"|"failed", doc_type?, wissen_id?, entity_id?, warnings[] }

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("home_wissen")
      .update(payload)
      .eq("id", existing.id as string);
    if (error) throw error;
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from("home_wissen")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
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
  let body: { dokument_id?: string; level?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültige JSON-Payload." }, 400);
  }

  const { dokument_id, level = "classify_only", force = false } = body;

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

    // Haushalt-Einstellungen laden
    const { data: settings } = await supabaseAdmin
      .from("household_settings")
      .select("bildanalyse_modus")
      .eq("household_id", householdId)
      .maybeSingle();

    const modus: string = (settings as { bildanalyse_modus?: string } | null)?.bildanalyse_modus ?? "chatgpt_vision";
    const dateiTyp: string = (dokument as { datei_typ?: string }).datei_typ ?? "";

    if (dateiTyp === "application/pdf" && modus === "chatgpt_vision") {
      warnings.push("chatgpt_vision_single_page_limit: nur erste Seite wird analysiert.");
    }

    try {
      const base64 = btoa(fileBytes.reduce((s, b) => s + String.fromCharCode(b), ""));
      const visionResp = await fetch(`${FUNCTIONS_URL}/ki-vision`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({ base64, mimeType: dateiTyp, modus }),
      });

      if (visionResp.ok) {
        const visionData = await visionResp.json() as { text?: string };
        extrahierterText = visionData.text ?? "";

        if (extrahierterText) {
          await supabaseAdmin
            .from("dokumente")
            .update({ extrahierter_text: extrahierterText })
            .eq("id", dokument_id);
          await updateProcessing(supabaseAdmin, dokument_id, { extractor_used: modus });
        }
      } else {
        warnings.push(`ki-vision: HTTP ${visionResp.status}`);
      }
    } catch (e) {
      warnings.push(`ki-vision (exception): ${(e as Error).message}`);
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
      wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
        household_id: householdId,
        user_id:      null,
        titel:        dateiname,
        kategorie,
        tags,
        dokument_id,
        herkunft:     "auto_stub",
      });
    } catch (e) {
      warnings.push(`home_wissen (auto_stub): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, {
      status:      "done",
      finished_at: new Date().toISOString(),
    });

    return jsonResponse({ status: "ok", doc_type: docType, wissen_id: wissenId, warnings });
  }

  // ── Schritt 10: full-Verarbeitung nach doc_type ───────────────────────────
  await updateProcessing(supabaseAdmin, dokument_id, { last_step: `extract_${docType}` });

  let entityId: string | null = null;

  // ── 10a: invoice ──────────────────────────────────────────────────────────
  if (docType === "invoice") {
    try {
      let analyseergebnis: Record<string, unknown> = strukturierteDaten ?? {};

      // Falls kein strukturiertes Format: KI-Extraktion
      if (!strukturierteDaten && extrahierterText) {
        const EXTRAKTION_PROMPT = `Extrahiere alle Rechnungsfelder aus diesem Text.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.

Felder: lieferant.name, rechnungsnummer, rechnungsdatum (ISO date), leistungsdatum, faellig_am,
waehrung, netto, ust, brutto, positionen (Array: name, menge, einheit, einzelpreis, gesamtpreis),
confidence (0.0-1.0).

Text:
${smartTruncate(extrahierterText)}`;

        const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
          method:  "POST",
          headers: fnHeaders,
          body:    JSON.stringify({
            messages:    [{ role: "user", content: EXTRAKTION_PROMPT }],
            temperature: 0.1,
            max_tokens:  1500,
          }),
        });

        if (resp.ok) {
          const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          const raw  = data.choices?.[0]?.message?.content ?? "";
          try {
            const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            analyseergebnis = JSON.parse(cleaned) as Record<string, unknown>;
          } catch {
            warnings.push("invoice Extraktion: JSON-Parse fehlgeschlagen.");
          }
        } else {
          warnings.push(`ki-chat (invoice Extraktion): HTTP ${resp.status}`);
        }
      }

      // invoice-process aufrufen (idempotent, erstellt auch home_wissen)
      const invResp = await fetch(`${FUNCTIONS_URL}/invoice-process`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({ dokument_id, analyseergebnis }),
      });

      if (invResp.ok) {
        const invData = await invResp.json() as { rechnung_id?: string; warnings?: string[] };
        entityId = invData.rechnung_id ?? null;
        if (invData.warnings?.length) warnings.push(...invData.warnings);
      } else {
        warnings.push(`invoice-process: HTTP ${invResp.status}`);
      }
    } catch (e) {
      warnings.push(`invoice (exception): ${(e as Error).message}`);
    }

    // home_wissen wird von invoice-process verwaltet — kein safeUpsertHomeWissen hier
  }

  // ── 10b: contract ─────────────────────────────────────────────────────────
  else if (docType === "contract") {
    let extractionConfidence = 0;

    try {
      const EXTRAKTION_PROMPT = `Extrahiere alle Vertragsfelder aus diesem Text.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.

Felder: partner (Vertragspartner), vertragstitel, start_date (ISO date), end_date (ISO date),
kuendigungsfrist_raw (Originaltext), kuendigungsfrist_tage (Integer), kuendigbar_ab (ISO date),
confidence (0.0-1.0, Extraktionssicherheit).

Text:
${smartTruncate(extrahierterText)}`;

      const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          messages:    [{ role: "user", content: EXTRAKTION_PROMPT }],
          temperature: 0.1,
          max_tokens:  600,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw  = data.choices?.[0]?.message?.content ?? "";
        let parsed: Record<string, unknown> = {};

        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          parsed = JSON.parse(cleaned) as Record<string, unknown>;
        } catch {
          warnings.push("contract Extraktion: JSON-Parse fehlgeschlagen.");
        }

        const conf = parseFloat(String(parsed.confidence ?? "0"));
        extractionConfidence = isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0;

        if (extractionConfidence >= 0.50) {
          // Reprocess-Schutz: reviewed_at gesetzt → manuell korrigiert, nicht überschreiben
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

            const vertragPayload = {
              household_id:             householdId,
              dokument_id,
              partner:                  (parsed.partner as string) || null,
              vertragstitel:            (parsed.vertragstitel as string) || null,
              start_date:               (parsed.start_date as string) || null,
              end_date:                 (parsed.end_date as string) || null,
              kuendigungsfrist_raw:     (parsed.kuendigungsfrist_raw as string) || null,
              kuendigungsfrist_tage:    (parsed.kuendigungsfrist_tage as number) || null,
              kuendigbar_ab:            (parsed.kuendigbar_ab as string) || null,
              review_required:          reviewRequired,
              classification_confidence: classificationConfidence,
              extraction_confidence:    extractionConfidence,
              extraktion:               parsed,
            };

            const { data: upsertData, error: upsertErr } = await supabaseAdmin
              .from("vertraege")
              .upsert(vertragPayload, { onConflict: "household_id,dokument_id" })
              .select("id")
              .single();

            if (upsertErr) {
              warnings.push(`vertraege upsert: ${upsertErr.message}`);
            } else {
              entityId = (upsertData as { id: string })?.id ?? null;
            }

            // home_wissen
            const partner = (parsed.partner as string) || dateiname;
            wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
              household_id: householdId,
              user_id:      null,
              titel:        `Vertrag: ${partner}`,
              kategorie:    "Verträge",
              tags:         ["vertrag", ...tags],
              dokument_id,
              herkunft,
            });

            // dokument_links
            if (entityId) {
              await supabaseAdmin.from("dokument_links").upsert([
                { household_id: householdId, dokument_id, entity_type: "vertrag", entity_id: entityId, role: "original" },
                ...(wissenId ? [{ household_id: householdId, dokument_id, entity_type: "home_wissen", entity_id: wissenId, role: "quelle" }] : []),
              ], { onConflict: "household_id,dokument_id,entity_type,entity_id,role", ignoreDuplicates: true });
            }
          }
        } else {
          // Extraktion zu unsicher: nur auto_stub
          warnings.push(`Extraktions-Konfidenz zu niedrig (${extractionConfidence.toFixed(2)}), kein Vertrag-Eintrag.`);
          await updateProcessing(supabaseAdmin, dokument_id, { downgraded: true });

          wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
            household_id: householdId,
            user_id:      null,
            titel:        dateiname,
            kategorie:    "Verträge",
            tags:         ["vertrag", ...tags],
            dokument_id,
            herkunft:     "auto_stub",
          });
        }
      } else {
        warnings.push(`ki-chat (contract Extraktion): HTTP ${resp.status}`);
      }
    } catch (e) {
      warnings.push(`contract (exception): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, {
      extraction_confidence: extractionConfidence,
    });
  }

  // ── 10c: policy ───────────────────────────────────────────────────────────
  else if (docType === "policy") {
    let extractionConfidence = 0;

    try {
      const EXTRAKTION_PROMPT = `Extrahiere alle Felder aus dieser Versicherungspolizze.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.

Felder: versicherer, polizzen_nummer, versicherungsart (z.B. haftpflicht/hausrat/kfz/kranken),
deckung (kurze Beschreibung), praemie (Zahl), praemien_intervall (monatlich/vierteljaehrlich/halbjaehrlich/jaehrlich),
naechste_faelligkeit (ISO date), start_date (ISO date), end_date (ISO date), waehrung,
confidence (0.0-1.0, Extraktionssicherheit).

Text:
${smartTruncate(extrahierterText)}`;

      const resp = await fetch(`${FUNCTIONS_URL}/ki-chat`, {
        method:  "POST",
        headers: fnHeaders,
        body:    JSON.stringify({
          messages:    [{ role: "user", content: EXTRAKTION_PROMPT }],
          temperature: 0.1,
          max_tokens:  600,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw  = data.choices?.[0]?.message?.content ?? "";
        let parsed: Record<string, unknown> = {};

        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          parsed = JSON.parse(cleaned) as Record<string, unknown>;
        } catch {
          warnings.push("policy Extraktion: JSON-Parse fehlgeschlagen.");
        }

        const conf = parseFloat(String(parsed.confidence ?? "0"));
        extractionConfidence = isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0;

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

            const rawVersicherungsart = (parsed.versicherungsart as string) || null;
            const normiertArt = normalisiereVersicherungsart(rawVersicherungsart);

            const polizzePayload = {
              household_id:              householdId,
              dokument_id,
              versicherer:               (parsed.versicherer as string) || null,
              polizzen_nummer:           (parsed.polizzen_nummer as string) || null,
              versicherungsart:          normiertArt,
              deckung:                   (parsed.deckung as string) || null,
              praemie:                   (parsed.praemie as number) || null,
              praemien_intervall:        normalisierePraemienIntervall(parsed.praemien_intervall as string),
              naechste_faelligkeit:      (parsed.naechste_faelligkeit as string) || null,
              start_date:                (parsed.start_date as string) || null,
              end_date:                  (parsed.end_date as string) || null,
              waehrung:                  (parsed.waehrung as string) || "EUR",
              review_required:           reviewRequired,
              classification_confidence: classificationConfidence,
              extraction_confidence:     extractionConfidence,
              extraktion:                {
                ...parsed,
                raw_versicherungsart: rawVersicherungsart !== normiertArt ? rawVersicherungsart : undefined,
              },
            };

            const { data: upsertData, error: upsertErr } = await supabaseAdmin
              .from("versicherungs_polizzen")
              .upsert(polizzePayload, { onConflict: "household_id,dokument_id" })
              .select("id")
              .single();

            if (upsertErr) {
              warnings.push(`versicherungs_polizzen upsert: ${upsertErr.message}`);
            } else {
              entityId = (upsertData as { id: string })?.id ?? null;
            }

            // home_wissen
            const versicherer = (parsed.versicherer as string) || dateiname;
            wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
              household_id: householdId,
              user_id:      null,
              titel:        `Versicherung: ${versicherer}`,
              kategorie:    "Versicherungen",
              tags:         ["versicherung", normiertArt, ...tags].filter(Boolean),
              dokument_id,
              herkunft,
            });

            // dokument_links
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
            titel:        dateiname,
            kategorie:    "Versicherungen",
            tags:         ["versicherung", ...tags],
            dokument_id,
            herkunft:     "auto_stub",
          });
        }
      } else {
        warnings.push(`ki-chat (policy Extraktion): HTTP ${resp.status}`);
      }
    } catch (e) {
      warnings.push(`policy (exception): ${(e as Error).message}`);
    }

    await updateProcessing(supabaseAdmin, dokument_id, {
      extraction_confidence: extractionConfidence,
    });
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

      wissenId = await safeUpsertHomeWissen(supabaseAdmin, {
        household_id: householdId,
        user_id:      null,
        titel,
        inhalt,
        kategorie,
        tags,
        dokument_id,
        herkunft:     "auto_full",
      });
    } catch (e) {
      warnings.push(`other (exception): ${(e as Error).message}`);
    }
  }

  // ── Abschluss ─────────────────────────────────────────────────────────────
  await updateProcessing(supabaseAdmin, dokument_id, {
    status:      "done",
    finished_at: new Date().toISOString(),
  });

  return jsonResponse({
    status:    "ok",
    doc_type:  docType,
    wissen_id: wissenId,
    entity_id: entityId,
    warnings,
  });
});
