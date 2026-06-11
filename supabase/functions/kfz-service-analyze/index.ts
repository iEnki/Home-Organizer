import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const cleanJson = (value: string) => value
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();

const normalizeIdentifier = (value: unknown) => String(value || "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

const normalizeDate = (value: unknown) => {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
};

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
};

const category = (value: unknown) => {
  const normalized = String(value || "").toLowerCase();
  const allowed = ["arbeit", "ersatzteil", "fluessigkeit", "reifen", "pruefung", "entsorgung", "sonstiges"];
  return allowed.includes(normalized) ? normalized : "sonstiges";
};

const schema = {
  type: "json_schema",
  json_schema: {
    name: "kfz_service_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        document_type: { type: "string" },
        workshop: { type: ["string", "null"] },
        invoice_number: { type: ["string", "null"] },
        invoice_date: { type: ["string", "null"] },
        service_date: { type: ["string", "null"] },
        payment_method: { type: ["string", "null"] },
        vehicle: {
          type: "object",
          properties: {
            make: { type: ["string", "null"] },
            model: { type: ["string", "null"] },
            plate: { type: ["string", "null"] },
            vin: { type: ["string", "null"] },
            mileage: { type: ["number", "null"] },
          },
          required: ["make", "model", "plate", "vin", "mileage"],
          additionalProperties: false,
        },
        totals: {
          type: "object",
          properties: {
            net: { type: ["number", "null"] },
            tax: { type: ["number", "null"] },
            gross: { type: ["number", "null"] },
            currency: { type: "string" },
          },
          required: ["net", "tax", "gross", "currency"],
          additionalProperties: false,
        },
        positions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              original_text: { type: ["string", "null"] },
              description: { type: "string" },
              category: { type: "string", enum: ["arbeit", "ersatzteil", "fluessigkeit", "reifen", "pruefung", "entsorgung", "sonstiges"] },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              unit_price: { type: ["number", "null"] },
              total_price: { type: ["number", "null"] },
              tax_rate: { type: ["number", "null"] },
              discount_amount: { type: ["number", "null"] },
              free_of_charge: { type: "boolean" },
              part_number: { type: ["string", "null"] },
              confidence: { type: "number" },
            },
            required: ["original_text", "description", "category", "quantity", "unit", "unit_price", "total_price", "tax_rate", "discount_amount", "free_of_charge", "part_number", "confidence"],
            additionalProperties: false,
          },
        },
        work_summary: { type: "string" },
        warranty_notes: { type: "array", items: { type: "string" } },
        safety_notes: { type: "array", items: { type: "string" } },
        reminders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: ["string", "null"] },
              due_date: { type: ["string", "null"] },
              due_mileage: { type: ["number", "null"] },
              reason: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["title", "description", "due_date", "due_mileage", "reason", "confidence"],
            additionalProperties: false,
          },
        },
        field_confidence: {
          type: "object",
          properties: {
            workshop: { type: "number" },
            invoice_number: { type: "number" },
            invoice_date: { type: "number" },
            service_date: { type: "number" },
            payment_method: { type: "number" },
            plate: { type: "number" },
            vin: { type: "number" },
            mileage: { type: "number" },
            gross: { type: "number" },
          },
          required: ["workshop", "invoice_number", "invoice_date", "service_date", "payment_method", "plate", "vin", "mileage", "gross"],
          additionalProperties: false,
        },
        overall_confidence: { type: "number" },
      },
      required: ["document_type", "workshop", "invoice_number", "invoice_date", "service_date", "payment_method", "vehicle", "totals", "positions", "work_summary", "warranty_notes", "safety_notes", "reminders", "field_confidence", "overall_confidence"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Nur POST erlaubt." }, 405);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return json({ error: "Nicht authentifiziert." }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Nicht authentifiziert." }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: membership } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership?.household_id) return json({ error: "Kein Haushalt vorhanden." }, 409);

  const payload = await request.json().catch(() => ({}));
  const documentId = String(payload?.dokument_id || "");
  const locale = payload?.locale === "en-GB" || payload?.locale === "en" ? "en-GB" : "de";
  if (!documentId) return json({ error: "dokument_id fehlt." }, 400);

  const { data: document } = await admin
    .from("dokumente")
    .select("id, household_id, storage_pfad, datei_typ, dateiname, extrahierter_text, meta")
    .eq("id", documentId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!document) return json({ error: "Dokument nicht gefunden." }, 404);

  const warnings: string[] = [];
  let extractedText = document.extrahierter_text || "";
  let extractor = extractedText ? "cached_text" : "";

  if (!extractedText) {
    const { data: file, error: downloadError } = await admin.storage
      .from("user-dokumente")
      .download(document.storage_pfad);
    if (downloadError || !file) return json({ error: downloadError?.message || "Datei konnte nicht geladen werden." }, 500);
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (document.datei_typ === "application/pdf") {
      try {
        const result = await extractScannedPdfText(bytes);
        extractedText = result.text;
        extractor = "document-ocr-service";
        warnings.push(...result.warnings);
        if (result.truncated) warnings.push("Das PDF wurde nur teilweise verarbeitet.");
      } catch (error) {
        return json({ error: (error as Error).message, warnings }, 502);
      }
    } else if (String(document.datei_typ || "").startsWith("image/")) {
      const { data: settings } = await admin
        .from("household_settings")
        .select("bildanalyse_modus")
        .eq("household_id", membership.household_id)
        .maybeSingle();
      const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
      const visionResponse = await fetch(`${functionsUrl}/ki-vision`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: settings?.bildanalyse_modus || "chatgpt_vision",
          file_base64: bytesToBase64(bytes),
          mime_type: document.datei_typ,
          file_name: document.dateiname,
          locale,
          prompt: "Extrahiere den vollstaendigen sichtbaren Text dieses Fahrzeugdokuments OCR-genau. Keine Zusammenfassung und keine Interpretation. Gib nur den Dokumenttext zurueck.",
        }),
      });
      const visionData = await visionResponse.json().catch(() => ({}));
      if (!visionResponse.ok) return json({ error: visionData?.error || `Bildanalyse HTTP ${visionResponse.status}` }, 502);
      extractedText = visionData?.text || visionData?.choices?.[0]?.message?.content || "";
      extractor = visionData?.extractor || settings?.bildanalyse_modus || "vision";
      warnings.push(...(Array.isArray(visionData?.warnings) ? visionData.warnings : []));
    } else {
      return json({ error: "Unterstuetzt werden PDF-, JPEG-, PNG- und WebP-Dateien." }, 415);
    }
  }

  if (!extractedText.trim()) return json({ error: "Im Dokument wurde kein auswertbarer Text erkannt.", warnings }, 422);
  await admin.from("dokumente").update({
    extrahierter_text: extractedText,
    dokument_typ: "kfz_servicebeleg",
    kategorie: "Kfz-Service",
    meta: {
      ...(document.meta || {}),
      kfz_service_analysis: { status: "text_extracted", extractor, analyzed_at: new Date().toISOString() },
    },
  }).eq("id", documentId);

  const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  const language = locale === "en-GB" ? "English (United Kingdom)" : "German";
  const prompt = `You analyse vehicle service invoices, workshop receipts and inspection reports.
Return only JSON matching the supplied schema. Natural-language fields must be in ${language}.
Do not invent missing values. Keep free or discounted lines even when their total is zero.
Categorise every line as arbeit, ersatzteil, fluessigkeit, reifen, pruefung, entsorgung or sonstiges.
Dates must be YYYY-MM-DD. Amounts are decimal numbers without currency symbols.
Reminder suggestions must be grounded in an explicit performed action or stated next due date.
Typical grounded suggestions include oil service, seasonal tyre change, wheel-nut retorque and Austrian §57a/Pickerl inspection.

Document text:
${extractedText.slice(0, 18000)}`;
  const aiResponse = await fetch(`${functionsUrl}/ki-chat`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 3500,
      response_format: schema,
    }),
  });
  const aiData = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) return json({ error: aiData?.message || aiData?.error || `KI HTTP ${aiResponse.status}`, warnings }, 502);

  let result: Record<string, any>;
  try {
    result = JSON.parse(cleanJson(aiData?.choices?.[0]?.message?.content || ""));
  } catch {
    return json({ error: "Die KI-Antwort war kein gueltiges JSON.", warnings }, 502);
  }

  const { data: vehicles } = await admin
    .from("home_fahrzeuge")
    .select("id, name, marke, modell, kennzeichen, vin, kilometerstand")
    .eq("household_id", membership.household_id);
  const plate = normalizeIdentifier(result?.vehicle?.plate);
  const vin = normalizeIdentifier(result?.vehicle?.vin);
  const matches = (vehicles || []).filter((vehicle) =>
    (vin && normalizeIdentifier(vehicle.vin) === vin) ||
    (plate && normalizeIdentifier(vehicle.kennzeichen) === plate)
  );
  const vehicleMatch = matches.length === 1
    ? { status: "matched", vehicle_id: matches[0].id, confidence: vin ? 1 : 0.95 }
    : { status: matches.length > 1 ? "ambiguous" : "unmatched", vehicle_id: null, confidence: 0 };

  const positions = (Array.isArray(result.positions) ? result.positions : []).map((position: Record<string, unknown>, index: number) => ({
    sortierung: index + 1,
    originaltext: position.original_text || null,
    beschreibung: String(position.description || "").trim() || "Position",
    kategorie: category(position.category),
    menge: numberOrNull(position.quantity),
    einheit: position.unit || null,
    einzelpreis: numberOrNull(position.unit_price),
    gesamtpreis: numberOrNull(position.total_price),
    ust_satz: numberOrNull(position.tax_rate),
    rabatt_betrag: numberOrNull(position.discount_amount),
    kostenlos: Boolean(position.free_of_charge) || numberOrNull(position.total_price) === 0,
    teilenummer: position.part_number || null,
    confidence: Math.max(0, Math.min(1, numberOrNull(position.confidence) ?? 0)),
    notizen: null,
  }));
  const reminders = (Array.isArray(result.reminders) ? result.reminders : []).map((reminder: Record<string, unknown>) => ({
    titel: String(reminder.title || "").trim() || "Service-Erinnerung",
    beschreibung: reminder.description || reminder.reason || null,
    faellig_am: normalizeDate(reminder.due_date),
    kilometerstand_faellig: numberOrNull(reminder.due_mileage),
    confidence: Math.max(0, Math.min(1, numberOrNull(reminder.confidence) ?? 0)),
    selected: false,
  }));
  const positionTotal = positions.reduce((sum: number, position: Record<string, any>) => sum + (position.gesamtpreis || 0), 0);
  const gross = numberOrNull(result?.totals?.gross);
  if (gross !== null && Math.abs(positionTotal - gross) > 0.05) {
    warnings.push(`Positionssumme (${positionTotal.toFixed(2)}) weicht vom Gesamtbetrag (${gross.toFixed(2)}) ab.`);
  }

  const response = {
    status: "ok",
    document: { id: document.id, name: document.dateiname, mime_type: document.datei_typ },
    service: {
      fahrzeug_id: vehicleMatch.vehicle_id,
      typ: result.document_type === "inspection" ? "Pickerl" : "Service",
      datum: normalizeDate(result.invoice_date) || normalizeDate(result.service_date),
      leistungsdatum: normalizeDate(result.service_date),
      kilometerstand: numberOrNull(result?.vehicle?.mileage),
      kosten: gross,
      werkstatt: result.workshop || null,
      beschreibung: result.work_summary || "",
      rechnungsnummer: result.invoice_number || null,
      zahlungsart: result.payment_method || null,
      netto: numberOrNull(result?.totals?.net),
      steuer: numberOrNull(result?.totals?.tax),
      waehrung: result?.totals?.currency || "EUR",
      naechste_faelligkeit_datum: reminders.find((item: any) => item.faellig_am)?.faellig_am || null,
      naechste_faelligkeit_km: reminders.find((item: any) => item.kilometerstand_faellig)?.kilometerstand_faellig || null,
    },
    positions,
    reminders,
    vehicle_match: vehicleMatch,
    warranty_notes: Array.isArray(result.warranty_notes) ? result.warranty_notes : [],
    safety_notes: Array.isArray(result.safety_notes) ? result.safety_notes : [],
    field_confidence: result.field_confidence || {},
    overall_confidence: numberOrNull(result.overall_confidence) ?? 0,
    raw_text: extractedText,
    extractor,
    warnings,
  };

  await admin.from("dokumente").update({
    meta: {
      ...(document.meta || {}),
      kfz_service_analysis: {
        status: "review",
        extractor,
        analyzed_at: new Date().toISOString(),
        overall_confidence: response.overall_confidence,
        warnings,
      },
    },
  }).eq("id", documentId);
  return json(response);
});
