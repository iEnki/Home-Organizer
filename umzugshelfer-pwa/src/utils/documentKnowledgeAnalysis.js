import { getKiClient, cleanKiJsonResponse } from "./kiClient";
import { extractTextFromFile } from "./rechnungAnalyse";
import { fileToBase64 } from "./imageTools";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;

export const WISSEN_KATEGORIEN = [
  "Versicherungen",
  "Vertraege",
  "Behoerden",
  "Rechnungen & Belege",
  "Anleitungen",
  "Geraete-Info",
  "Kontakte & Dienste",
  "Masse & Abmessungen",
  "Notizen",
  "Sonstiges",
];

export const DOCUMENT_CLASS_TO_KNOWLEDGE_CATEGORY = {
  versicherung: "Versicherungen",
  vertrag: "Vertraege",
  behoerde: "Behoerden",
  rechnung: "Rechnungen & Belege",
  anleitung: "Anleitungen",
  geraet: "Geraete-Info",
  kontakt: "Kontakte & Dienste",
  masse: "Masse & Abmessungen",
  notiz: "Notizen",
  sonstiges: "Sonstiges",
};

const ALLOWED_DOCUMENT_CLASSES = [
  "versicherung",
  "vertrag",
  "rechnung",
  "behoerde",
  "anleitung",
  "geraet",
  "kontakt",
  "masse",
  "notiz",
  "sonstiges",
];

const ALLOWED_DOCUMENT_TYPES = [
  "versicherung",
  "vertrag",
  "rechnung",
  "behoerde",
  "anleitung",
  "garantie",
  "handbuch",
  "gesundheit",
  "sonstiges",
];

const DOCUMENT_KNOWLEDGE_SCHEMA = `{
  "documentClass": "versicherung | vertrag | rechnung | behoerde | anleitung | geraet | kontakt | masse | notiz | sonstiges",
  "documentSubtype": "z.B. haftpflicht, hausrat, mietvertrag, stromvertrag oder null",
  "documentType": "versicherung | vertrag | rechnung | behoerde | anleitung | garantie | handbuch | gesundheit | sonstiges",
  "title": "kurzer sinnvoller Titel fuer den Wissenseintrag",
  "headline": "eine kurze Zusammenfassung fuer die Kartenansicht",
  "category": "Versicherungen | Vertraege | Behoerden | Rechnungen & Belege | Anleitungen | Geraete-Info | Kontakte & Dienste | Masse & Abmessungen | Notizen | Sonstiges",
  "tags": ["3 bis 8 Tags"],
  "highlights": ["2 bis 5 sehr wichtige Punkte auf den ersten Blick"],
  "details": [
    { "label": "Versicherer", "value": "Muster AG" },
    { "label": "Polizzennummer", "value": "123456" }
  ],
  "warnings": ["Fristen, Kuendigungsfristen, Ausschluesse, Selbstbehalt oder wichtige Hinweise"],
  "summaryText": "laengerer Freitext fuer die Detailansicht",
  "confidence": 0.86,
  "requiresReview": false
}`;

const DOCUMENT_ANALYSIS_RULES = `Wichtige Regeln:
- Antworte ausschliesslich mit gueltigem JSON.
- Fasse nur Informationen zusammen, die aus dem Dokument hervorgehen oder sehr naheliegend sind.
- Erfinde keine Vertragsdaten, Betraege, Fristen oder Nummern.
- Wenn ein Wert unklar ist, gib null oder lasse ihn vorsichtig weg.
- "highlights" sind fuer eine kleine Visitenkarte gedacht und muessen sofort hilfreich sein.
- "details" enthalten label/value-Paare fuer die Detailansicht.
- "warnings" enthalten nur echte Risiken, Fristen oder Dinge, die man leicht uebersehen kann.
- "documentType" ist die Dokumentansicht im Archiv. "category" ist die Wissenskategorie.
- "confidence" ist 0 bis 1.
- "requiresReview" ist true, wenn das Dokument unscharf, unvollstaendig oder schwer sicher einzuordnen ist.`;

const buildTextPrompt = (dateiname, text) => `Du analysierst ein Dokument fuer eine Haushalts-Wissensdatenbank.
Erkenne Dokumentart, Untertyp, Kerndaten, Tags und die wichtigsten Punkte auf einen Blick.

Dateiname: ${dateiname || "Unbekannt"}

Gib ausschliesslich ein JSON-Objekt im folgenden Schema zurueck:
${DOCUMENT_KNOWLEDGE_SCHEMA}

${DOCUMENT_ANALYSIS_RULES}

Dokumenttext:
${text}`;

const buildVisionPrompt = (dateiname) => `Du analysierst ein Dokument-Bild fuer eine Haushalts-Wissensdatenbank.
Erkenne Dokumentart, Untertyp, Kerndaten, Tags und die wichtigsten Punkte auf einen Blick.

Dateiname: ${dateiname || "Unbekannt"}

Gib ausschliesslich ein JSON-Objekt im folgenden Schema zurueck:
${DOCUMENT_KNOWLEDGE_SCHEMA}

${DOCUMENT_ANALYSIS_RULES}`;

const parseJsonObject = (rawText) => {
  const cleaned = cleanKiJsonResponse(rawText, "object");
  return JSON.parse(cleaned);
};

const normalizeText = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

const normalizeStringArray = (values, fallback = []) => {
  const normalized = Array.isArray(values)
    ? values.map((value) => normalizeText(value)).filter(Boolean)
    : [];
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeDetails = (details) => {
  if (!Array.isArray(details)) return [];
  return details
    .map((detail) => {
      const label = normalizeText(detail?.label);
      const value = normalizeText(detail?.value);
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean);
};

const normalizeConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, num));
};

const normalizeKnowledgeCategory = (value, documentClass) => {
  const normalized = normalizeText(value);
  if (normalized && WISSEN_KATEGORIEN.includes(normalized)) return normalized;
  return DOCUMENT_CLASS_TO_KNOWLEDGE_CATEGORY[documentClass] || "Sonstiges";
};

const normalizeDocumentType = (value, documentClass) => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized && ALLOWED_DOCUMENT_TYPES.includes(normalized)) return normalized;
  if (documentClass === "versicherung") return "versicherung";
  if (documentClass === "vertrag") return "vertrag";
  if (documentClass === "rechnung") return "rechnung";
  if (documentClass === "behoerde") return "behoerde";
  if (documentClass === "anleitung") return "anleitung";
  return "sonstiges";
};

export const mergeUniqueTags = (...tagGroups) => {
  const seen = new Set();
  const merged = [];

  tagGroups.flat().forEach((tag) => {
    const normalized = normalizeText(tag);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });

  return merged;
};

export const deriveKnowledgeTitle = (dok, analysis) => {
  const suggested = normalizeText(analysis?.title);
  if (suggested) return suggested;
  return String(dok?.dateiname || "Dokument").replace(/\.[^.]+$/, "");
};

export const isManualKnowledgeOverride = (entry) =>
  entry?.herkunft === "manuell" || Boolean(entry?.summary?.manual_override);

export const shouldKeepExistingKnowledgeTitle = (entry) => {
  if (!entry?.titel) return false;
  return isManualKnowledgeOverride(entry);
};

export const buildKnowledgeSummaryText = (analysis) => {
  const parts = [];
  if (analysis?.summaryText) parts.push(analysis.summaryText);
  const details = Array.isArray(analysis?.details) ? analysis.details : [];
  if (details.length > 0) {
    parts.push(details.map((detail) => `${detail.label}: ${detail.value}`).join("\n"));
  }
  const warnings = Array.isArray(analysis?.warnings) ? analysis.warnings : [];
  if (warnings.length > 0) {
    parts.push(`Wichtige Hinweise:\n${warnings.map((item) => `- ${item}`).join("\n")}`);
  }
  return parts.filter(Boolean).join("\n\n").trim();
};

export const normalizeDocumentKnowledgeAnalysis = (raw, dok, source) => {
  const documentClassRaw = normalizeText(raw?.documentClass)?.toLowerCase();
  const documentClass = ALLOWED_DOCUMENT_CLASSES.includes(documentClassRaw)
    ? documentClassRaw
    : "sonstiges";
  const headline = normalizeText(raw?.headline) || normalizeText(raw?.title) || deriveKnowledgeTitle(dok, raw);
  const details = normalizeDetails(raw?.details);
  const highlights = normalizeStringArray(raw?.highlights, details.slice(0, 3).map((detail) => `${detail.label}: ${detail.value}`));
  const warnings = normalizeStringArray(raw?.warnings, []);
  const confidence = normalizeConfidence(raw?.confidence);
  const requiresReview = Boolean(raw?.requiresReview) || confidence == null || confidence < 0.55;
  const summaryText = normalizeText(raw?.summaryText) || buildKnowledgeSummaryText({ details, warnings });

  return {
    title: deriveKnowledgeTitle(dok, raw),
    headline,
    category: normalizeKnowledgeCategory(raw?.category, documentClass),
    documentClass,
    documentSubtype: normalizeText(raw?.documentSubtype),
    documentType: normalizeDocumentType(raw?.documentType, documentClass),
    tags: mergeUniqueTags(raw?.tags, [
      normalizeText(raw?.documentSubtype),
      normalizeText(raw?.documentClass),
      normalizeText(dok?.kategorie),
    ]).slice(0, 10),
    details,
    highlights: highlights.slice(0, 5),
    warnings: warnings.slice(0, 5),
    confidence,
    requiresReview,
    summaryText,
    source,
  };
};

const callVisionAnalysis = async ({ base64, mimeType, session, dateiname }) => {
  if (!SUPABASE_URL) {
    throw new Error("REACT_APP_SUPABASE_URL fehlt.");
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ki-vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      mode: "chatgpt_vision",
      file_base64: base64,
      mime_type: mimeType,
      prompt: buildVisionPrompt(dateiname),
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Bildanalyse fehlgeschlagen (${response.status})`);
  }
  return parseJsonObject(json?.text || "");
};

const callTextAnalysis = async ({ text, dateiname, userId }) => {
  const kiClient = await getKiClient(userId);
  const response = await kiClient.client.chat.completions.create({
    messages: [{ role: "user", content: buildTextPrompt(dateiname, text) }],
    temperature: 0.1,
  });
  const rawText = response?.choices?.[0]?.message?.content ?? "";
  return parseJsonObject(rawText);
};

export const analyzeDocumentForKnowledge = async ({ file, dok, session, userId }) => {
  const mimeType = file?.type || dok?.datei_typ || "";
  const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(dok?.dateiname || "");
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(dok?.dateiname || "");

  if (isPdf) {
    const extracted = await extractTextFromFile(file);
    if (!extracted?.hasText || !String(extracted?.text || "").trim()) {
      return {
        ok: false,
        code: "scan_pdf_not_supported",
        message: "Text im PDF nicht extrahierbar. Bitte dieses Dokument als Bild oder Scan-Foto analysieren.",
        extractedText: null,
      };
    }

    const raw = await callTextAnalysis({
      text: extracted.text,
      dateiname: dok?.dateiname,
      userId,
    });

    return {
      ok: true,
      source: "pdf_text",
      extractedText: extracted.text,
      analysis: normalizeDocumentKnowledgeAnalysis(raw, dok, "pdf_text"),
    };
  }

  if (isImage) {
    const base64 = await fileToBase64(file);
    const raw = await callVisionAnalysis({
      base64,
      mimeType,
      session,
      dateiname: dok?.dateiname,
    });

    return {
      ok: true,
      source: "image_vision",
      extractedText: null,
      analysis: normalizeDocumentKnowledgeAnalysis(raw, dok, "image_vision"),
    };
  }

  return {
    ok: false,
    code: "unsupported_type",
    message: "Dieser Dateityp wird fuer die Wissensanalyse aktuell nicht unterstuetzt.",
    extractedText: null,
  };
};
