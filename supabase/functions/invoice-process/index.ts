// Supabase Edge Function: invoice-process
// Orchestriert die serverseitige Rechnungspipeline nach dem Pflicht-Review.
//
// Input (POST-Body):
//   {
//     dokument_id:    uuid           -- bereits in dokumente gespeichert
//     analyseergebnis: object        -- Rueckgabe von starteAnalyse() im Client
//   }
//
// Ablauf:
//   1. Auth-Check (JWT erforderlich)
//   2. household_id des Users ermitteln
//   3. Upsert rechnungen (idempotent via UNIQUE household_id+dokument_id)
//   4. Delete + Insert rechnungs_positionen
//   5. Upsert home_wissen (automatischer Eintrag)
//   6. Insert dokument_links (doc<->rechnung, doc<->wissen)
//
// Output:
//   { rechnung_id, wissen_id, status: 'ok', warnings: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Betragsbereich fuer Tags (z.B. "bis50" | "50-200" | "200-500" | "ueber500")
function betragRange(brutto: number | null): string {
  if (!brutto || brutto <= 0) return "unbekannt";
  if (brutto < 50) return "bis50";
  if (brutto < 200) return "50-200";
  if (brutto < 500) return "200-500";
  return "ueber500";
}

// Datum → Jahr als String
function jahrAusDate(datum: string | null): string | null {
  if (!datum) return null;
  return datum.slice(0, 4);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Nur POST erlaubt." }, 405);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // User-Client (JWT-basiert, respektiert RLS)
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Service-Role-Client fuer direkten DB-Zugriff (Household-Lookup, Inserts ohne RLS-Overhead)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Haushalt des Users ermitteln ─────────────────────────────────────────
  const { data: membership } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.household_id) {
    return jsonResponse({ error: "Kein aktiver Haushalt vorhanden." }, 409);
  }

  const householdId: string = membership.household_id;

  // ── Input parsen ─────────────────────────────────────────────────────────
  let body: { dokument_id?: string; analyseergebnis?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungueltige JSON-Payload." }, 400);
  }

  const { dokument_id, analyseergebnis } = body;

  if (!dokument_id) {
    return jsonResponse({ error: "dokument_id fehlt." }, 400);
  }

  // Sicherstellen, dass das Dokument zum Haushalt gehoert
  const { data: dokument } = await supabaseAdmin
    .from("dokumente")
    .select("id, user_id, household_id")
    .eq("id", dokument_id)
    .maybeSingle();

  if (!dokument) {
    return jsonResponse({ error: "Dokument nicht gefunden." }, 404);
  }

  const istEigeneRow = dokument.user_id === user.id;
  const istHaushaltsRow = dokument.household_id === householdId;
  if (!istEigeneRow && !istHaushaltsRow) {
    return jsonResponse({ error: "Kein Zugriff auf dieses Dokument." }, 403);
  }

  const warnings: string[] = [];
  const ergebnis = (analyseergebnis || {}) as Record<string, unknown>;

  // Felder normalisieren
  const lieferantName =
    (ergebnis.lieferant as Record<string, unknown>)?.name as string ||
    (ergebnis.haendler as string) ||
    null;
  const rechnungsdatum = (ergebnis.rechnungsdatum as string) || (ergebnis.datum as string) || null;
  const brutto = (ergebnis.brutto as number) || (ergebnis.gesamt as number) || null;
  const confidence = (ergebnis.confidence as number) || null;

  // ── 1. rechnungen upsert ─────────────────────────────────────────────────
  let rechnungId: string | null = null;

  try {
    const { data: rechnungData, error: rechnungErr } = await supabaseAdmin
      .from("rechnungen")
      .upsert(
        {
          household_id:      householdId,
          dokument_id,
          lieferant_name:    lieferantName,
          rechnungsnummer:   (ergebnis.rechnungsnummer as string) || null,
          rechnungsdatum:    rechnungsdatum,
          leistungsdatum:    (ergebnis.leistungsdatum as string) || null,
          faellig_am:        (ergebnis.faellig_am as string) || null,
          waehrung:          (ergebnis.waehrung as string) || "EUR",
          netto:             (ergebnis.netto as number) || null,
          ust:               (ergebnis.ust as number) || null,
          brutto,
          zahlungsziel_text: (ergebnis.zahlungsziel_text as string) || null,
          confidence,
          extraktion:        ergebnis,
          raw_text:          (ergebnis.roher_text as string) || null,
        },
        { onConflict: "household_id,dokument_id" },
      )
      .select("id")
      .single();

    if (rechnungErr) {
      warnings.push(`rechnungen: ${rechnungErr.message}`);
    } else {
      rechnungId = rechnungData?.id ?? null;
    }
  } catch (e) {
    warnings.push(`rechnungen (exception): ${(e as Error).message}`);
  }

  // Dokument-Kategorie setzen damit Filter in HomeDokumente greift
  await supabaseAdmin
    .from("dokumente")
    .update({ kategorie: "Rechnung" })
    .eq("id", dokument_id);

  // ── 2. rechnungs_positionen (delete + insert, idempotent) ────────────────
  if (rechnungId) {
    try {
      await supabaseAdmin
        .from("rechnungs_positionen")
        .delete()
        .eq("rechnung_id", rechnungId);

      const positionen = (ergebnis.positionen as unknown[]) || [];
      if (positionen.length > 0) {
        const posRows = positionen.map((p: unknown, idx: number) => {
          const pos = p as Record<string, unknown>;
          return {
            household_id:  householdId,
            rechnung_id:   rechnungId,
            pos_nr:        (pos.pos_nr as number) || idx + 1,
            beschreibung:  (pos.name as string) || null,
            menge:         (pos.menge as number) || null,
            einheit:       (pos.einheit as string) || null,
            einzelpreis:   (pos.einzelpreis as number) || null,
            gesamtpreis:   (pos.gesamtpreis as number) || null,
            ust_satz:      (pos.ust_satz as number) || null,
            klassifikation: {
              obergruppe:  pos.obergruppe,
              modul:       pos.modul_vorschlag,
              confidence:  pos.confidence,
            },
          };
        });

        const { error: posErr } = await supabaseAdmin
          .from("rechnungs_positionen")
          .insert(posRows);

        if (posErr) {
          warnings.push(`rechnungs_positionen: ${posErr.message}`);
        }
      }
    } catch (e) {
      warnings.push(`rechnungs_positionen (exception): ${(e as Error).message}`);
    }
  }

  // ── 3. home_wissen upsert ────────────────────────────────────────────────
  let wissenId: string | null = null;

  try {
    const datum = rechnungsdatum || new Date().toISOString().slice(0, 10);
    const titel = [
      "Rechnung:",
      lieferantName || "Unbekannt",
      datum ? `– ${datum}` : "",
      brutto != null ? `– ${Number(brutto).toFixed(2)} EUR` : "",
    ].filter(Boolean).join(" ");

    const inhalt = [
      lieferantName ? `Lieferant: ${lieferantName}` : null,
      ergebnis.rechnungsnummer ? `Rechnungs-Nr.: ${ergebnis.rechnungsnummer}` : null,
      rechnungsdatum ? `Rechnungsdatum: ${rechnungsdatum}` : null,
      ergebnis.faellig_am ? `Zahlbar bis: ${ergebnis.faellig_am}` : null,
      ergebnis.netto != null ? `Netto: ${Number(ergebnis.netto).toFixed(2)} EUR` : null,
      ergebnis.ust != null ? `MwSt: ${Number(ergebnis.ust).toFixed(2)} EUR` : null,
      brutto != null ? `Brutto: ${Number(brutto).toFixed(2)} EUR` : null,
    ].filter(Boolean).join("\n");

    const jahr = jahrAusDate(rechnungsdatum);
    const tags = [
      "rechnung",
      lieferantName?.toLowerCase().replace(/\s+/g, "_") || null,
      jahr,
      `betrag:${betragRange(brutto as number)}`,
    ].filter(Boolean) as string[];

    // Bestehendes wissen fuer dieses Dokument suchen (idempotent)
    const { data: vorhandenes } = await supabaseAdmin
      .from("home_wissen")
      .select("id")
      .eq("dokument_id", dokument_id)
      .maybeSingle();

    let wissenErr: unknown = null;
    if (vorhandenes?.id) {
      // Update
      const { error } = await supabaseAdmin
        .from("home_wissen")
        .update({
          titel,
          inhalt,
          tags,
          kategorie:   "Rechnungen & Belege",
          dokument_id,
          rechnung_id: rechnungId,
          herkunft:    "auto_full",
        })
        .eq("id", vorhandenes.id);
      wissenErr = error;
      wissenId = vorhandenes.id;
    } else {
      // Insert
      const { data: wissenData, error } = await supabaseAdmin
        .from("home_wissen")
        .insert({
          household_id: householdId,
          user_id:      user.id,
          titel,
          inhalt,
          kategorie:    "Rechnungen & Belege",
          tags,
          dokument_id,
          rechnung_id:  rechnungId,
          herkunft:     "auto_full",
        })
        .select("id")
        .single();
      wissenErr = error;
      wissenId = wissenData?.id ?? null;
    }

    if (wissenErr) {
      warnings.push(`home_wissen: ${(wissenErr as Error).message}`);
    }
  } catch (e) {
    warnings.push(`home_wissen (exception): ${(e as Error).message}`);
  }

  // ── 4. dokument_links ────────────────────────────────────────────────────
  try {
    const links: Array<Record<string, unknown>> = [];

    if (rechnungId) {
      links.push({
        household_id: householdId,
        dokument_id,
        entity_type:  "rechnung",
        entity_id:    rechnungId,
        role:         "original",
      });
    }

    if (wissenId) {
      links.push({
        household_id: householdId,
        dokument_id,
        entity_type:  "home_wissen",
        entity_id:    wissenId,
        role:         "quelle",
      });
    }

    if (links.length > 0) {
      const { error: linkErr } = await supabaseAdmin
        .from("dokument_links")
        .upsert(links, {
          onConflict: "household_id,dokument_id,entity_type,entity_id,role",
          ignoreDuplicates: true,
        });

      if (linkErr) {
        warnings.push(`dokument_links: ${linkErr.message}`);
      }
    }
  } catch (e) {
    warnings.push(`dokument_links (exception): ${(e as Error).message}`);
  }

  // ── Response ─────────────────────────────────────────────────────────────
  return jsonResponse({
    status:      "ok",
    rechnung_id: rechnungId,
    wissen_id:   wissenId,
    warnings,
  });
});
