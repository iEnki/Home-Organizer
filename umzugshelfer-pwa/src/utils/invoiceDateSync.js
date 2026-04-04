import { getKiClient } from "./kiClient";
import { generiereZusammenfassung } from "./rechnungAnalyse";

export function normalizeInvoiceDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatInvoiceDateLabel(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildInvoiceKnowledgeTitle({ haendler, datum }) {
  const parts = ["Rechnung"];
  if (haendler) parts.push(haendler);
  const datumLabel = formatInvoiceDateLabel(datum);
  if (datumLabel) parts.push(datumLabel);
  return parts.join(" - ");
}

function mapPositionenForSummary(positionen = []) {
  return positionen.map((pos) => ({
    name: pos.beschreibung || pos.name || "",
    menge: pos.menge ?? null,
    einheit: pos.einheit || null,
    einzelpreis: pos.einzelpreis ?? null,
    gesamtpreis: pos.gesamtpreis ?? null,
  }));
}

function isAutoKnowledgeEntry(entry) {
  const herkunft = String(entry?.herkunft || "").trim().toLowerCase();
  return Boolean(entry?.rechnung_id) || (herkunft && herkunft !== "manuell");
}

function extractMessageText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

async function rewriteKnowledgeTextWithKi({
  userId,
  existingContent,
  fallbackContent,
  haendler,
  datum,
  gesamt,
  positionen,
}) {
  if (!existingContent?.trim()) return fallbackContent;

  try {
    const { client, model } = await getKiClient(userId);
    if (!client) return fallbackContent;

    const datumLabel = formatInvoiceDateLabel(datum) || "unbekannt";
    const positionsText = positionen.length
      ? positionen
          .map((pos) => {
            const preis = pos.gesamtpreis != null ? `${Number(pos.gesamtpreis).toFixed(2)} EUR` : "ohne Preis";
            return `${pos.beschreibung || "Position"} (${preis})`;
          })
          .join(", ")
      : "keine erkannten Positionen";

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Du aktualisierst automatisch erzeugte Rechnungstexte. Behalte Stil und Fakten bei, korrigiere aber Datumsangaben und datumsabhaengige Formulierungen. Gib nur den finalen Text ohne Markdown zurueck.",
        },
        {
          role: "user",
          content: [
            `Bisheriger Text:\n${existingContent.trim()}`,
            `Korrigiertes Rechnungsdatum: ${datumLabel}`,
            `Haendler: ${haendler || "unbekannt"}`,
            `Gesamtbetrag: ${gesamt != null ? `${Number(gesamt).toFixed(2)} EUR` : "unbekannt"}`,
            `Positionen: ${positionsText}`,
            "Falls der bisherige Text unstimmig ist, formuliere ihn sauber und knapp neu.",
          ].join("\n\n"),
        },
      ],
    });

    const rewritten = extractMessageText(response).trim();
    return rewritten || fallbackContent;
  } catch {
    return fallbackContent;
  }
}

async function loadInvoiceSyncContext(supabase, rechnungId, wissenId) {
  const { data: rechnung, error: rechnungErr } = await supabase
    .from("rechnungen")
    .select("id, dokument_id, lieferant_name, brutto, rechnungsdatum")
    .eq("id", rechnungId)
    .single();
  if (rechnungErr) throw rechnungErr;

  const positionenPromise = supabase
    .from("rechnungs_positionen")
    .select("id, pos_nr, beschreibung, menge, einheit, einzelpreis, gesamtpreis")
    .eq("rechnung_id", rechnungId)
    .order("pos_nr", { ascending: true });

  const wissenPromise = wissenId
    ? supabase
        .from("home_wissen")
        .select("id, titel, inhalt, herkunft, rechnung_id, dokument_id")
        .eq("id", wissenId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [{ data: positionen, error: posErr }, { data: wissen, error: wissenErr }] =
    await Promise.all([positionenPromise, wissenPromise]);

  if (posErr) throw posErr;
  if (wissenErr) throw wissenErr;

  return {
    rechnung,
    positionen: positionen || [],
    wissen: wissen || null,
  };
}

export async function syncInvoiceDate({ supabase, rechnungId, neuesDatum, userId }) {
  if (!rechnungId) {
    throw new Error("Rechnungs-ID fehlt.");
  }

  const normalizedDate = normalizeInvoiceDate(neuesDatum);
  const { data: rpcData, error: rpcError } = await supabase.rpc("sync_invoice_date", {
    p_rechnung_id: rechnungId,
    p_neues_datum: normalizedDate,
  });

  if (rpcError) {
    throw new Error(rpcError.message || "Rechnungsdatum konnte nicht synchronisiert werden.");
  }

  const syncMeta = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!syncMeta?.rechnung_id) {
    throw new Error("Synchronisationsdaten fuer die Rechnung fehlen.");
  }

  try {
    const context = await loadInvoiceSyncContext(supabase, syncMeta.rechnung_id, syncMeta.wissen_id);
    const wissen = context.wissen;

    if (!wissen || !isAutoKnowledgeEntry(wissen)) {
      return {
        syncMeta,
        rechnung: context.rechnung,
        wissenAktualisiert: false,
      };
    }

    const summaryPositionen = mapPositionenForSummary(context.positionen);
    const fallbackContent = generiereZusammenfassung(
      context.rechnung.lieferant_name,
      context.rechnung.rechnungsdatum,
      context.rechnung.brutto != null ? Number(context.rechnung.brutto) : null,
      summaryPositionen,
    );

    const inhalt = await rewriteKnowledgeTextWithKi({
      userId,
      existingContent: wissen.inhalt,
      fallbackContent,
      haendler: context.rechnung.lieferant_name,
      datum: context.rechnung.rechnungsdatum,
      gesamt: context.rechnung.brutto,
      positionen: context.positionen,
    });

    const updatePayload = {
      titel: buildInvoiceKnowledgeTitle({
        haendler: context.rechnung.lieferant_name,
        datum: context.rechnung.rechnungsdatum,
      }),
      inhalt,
      herkunft: wissen.herkunft && wissen.herkunft !== "manuell" ? wissen.herkunft : "auto_full",
    };

    const { error: wissenUpdateErr } = await supabase
      .from("home_wissen")
      .update(updatePayload)
      .eq("id", wissen.id);

    if (wissenUpdateErr) {
      throw wissenUpdateErr;
    }

    return {
      syncMeta,
      rechnung: context.rechnung,
      wissenAktualisiert: true,
    };
  } catch (err) {
    return {
      syncMeta,
      rechnung: null,
      wissenAktualisiert: false,
      wissenFehler: err?.message || "Wissenseintrag konnte nicht aktualisiert werden.",
    };
  }
}
