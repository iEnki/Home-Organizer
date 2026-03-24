import React, { useState, useCallback, useMemo } from "react";
import {
  X, Check, AlertTriangle, ChevronDown, ChevronUp,
  Package, Box, Cpu, Wallet, FileText, Info,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useToast } from "../../hooks/useToast";

// ============================================================
// Konstanten
// ============================================================

const MODUL_CONFIG = {
  budget: {
    label: "Budget",
    icon: <Wallet size={16} />,
    farbe: "text-accent-warm",
    pflicht: false,
    defaultAktiv: true,
  },
  dokumente: {
    label: "Dokumente",
    icon: <FileText size={16} />,
    farbe: "text-secondary-500",
    pflicht: true,
    defaultAktiv: true,
  },
  geraete: {
    label: "Geraete & Wartung",
    icon: <Cpu size={16} />,
    farbe: "text-accent-info",
    pflicht: false,
    defaultAktiv: false,
  },
  vorraete: {
    label: "Vorraete",
    icon: <Package size={16} />,
    farbe: "text-accent-success",
    pflicht: false,
    defaultAktiv: false,
  },
  inventar: {
    label: "Inventar",
    icon: <Box size={16} />,
    farbe: "text-accent-yellow",
    pflicht: false,
    defaultAktiv: false,
  },
};

const MODUL_OPTIONEN = ["vorraete", "inventar", "geraete", "keine_zuordnung"];

const BUDGET_KATEGORIEN = [
  "Lebensmittel", "Haushalt", "Elektronik", "Moebel & Einrichtung",
  "Kleidung", "Gesundheit", "Freizeit", "Sonstiges",
];

// ============================================================
// Hilfsfunktionen
// ============================================================

function addJahre(datumIso, jahre) {
  if (!datumIso) return "";
  try {
    const d = new Date(datumIso);
    d.setFullYear(d.getFullYear() + jahre);
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function initModulAktiv(erkannteModule) {
  const aktiv = {};
  for (const [key, cfg] of Object.entries(MODUL_CONFIG)) {
    aktiv[key] = cfg.pflicht || cfg.defaultAktiv || erkannteModule.includes(key);
  }
  return aktiv;
}

// ============================================================
// Sub-Komponenten
// ============================================================

function AkkordeonSektion({ title, icon, kinder, defaultOffen = false }) {
  const [offen, setOffen] = useState(defaultOffen);
  return (
    <div className="border border-canvas-3 rounded-card-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-canvas-2 hover:bg-canvas-3 transition-colors text-left"
        onClick={() => setOffen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-dark-text-main">
          {icon}{title}
        </span>
        {offen ? <ChevronUp size={16} className="text-dark-text-secondary" /> : <ChevronDown size={16} className="text-dark-text-secondary" />}
      </button>
      {offen && <div className="p-4 space-y-3 bg-canvas-1">{kinder}</div>}
    </div>
  );
}

function InputFeld({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div>
      <label className="block text-xs text-dark-text-secondary mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                   text-sm text-dark-text-main placeholder-dark-text-secondary
                   focus:outline-none focus:border-primary-500 transition-colors"
      />
    </div>
  );
}

function SelectFeld({ label, value, onChange, optionen }) {
  return (
    <div>
      <label className="block text-xs text-dark-text-secondary mb-1">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                   text-sm text-dark-text-main focus:outline-none focus:border-primary-500 transition-colors"
      >
        {optionen.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// Haupt-Komponente
// ============================================================

export default function RechnungReviewModal({ ergebnis, datei, session, onAbbrechen, onGespeichert }) {
  const { success, error: toastError } = useToast();

  const [haendler, setHaendler] = useState(ergebnis.haendler || "");
  const [datum, setDatum] = useState(ergebnis.datum || "");
  const [gesamt, setGesamt] = useState(ergebnis.gesamt != null ? String(ergebnis.gesamt) : "");
  const [positionen, setPositionen] = useState(ergebnis.positionen || []);
  const [modulAktiv, setModulAktiv] = useState(() => initModulAktiv(ergebnis.erkannte_module || []));
  const [speichern, setSpeichern] = useState(false);
  const [zusammenfassung, setZusammenfassung] = useState(ergebnis.summary_text || "");

  // Budget-Felder
  const [budgetKategorie, setBudgetKategorie] = useState("Haushalt");
  const [budgetBeschreibung, setBudgetBeschreibung] = useState(
    ergebnis.haendler ? `Einkauf bei ${ergebnis.haendler}` : "Einkauf"
  );

  // Geraete-Felder (erstes erkanntes Geraet)
  const erstesGeraet = useMemo(
    () => positionen.find((p) => p.modul_vorschlag === "geraete") || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [geraetName, setGeraetName] = useState(erstesGeraet?.name || "");
  const [geraetHersteller, setGeraetHersteller] = useState("");
  const [gewaehrleistungBis, setGewaehrleistungBis] = useState(() => addJahre(ergebnis.datum, 2));
  const [garantieBis, setGarantieBis] = useState("");
  const [naechsteWartung, setNaechsteWartung] = useState("");

  // Dokument-Felder
  const [dokDateiname, setDokDateiname] = useState(datei?.name || "rechnung.pdf");
  const [dokBeschreibung, setDokBeschreibung] = useState(
    `Rechnung ${ergebnis.haendler ? "von " + ergebnis.haendler : ""} ${ergebnis.datum || ""}`.trim()
  );

  const hatPflichffehler = useMemo(() => {
    const gesamtNum = parseFloat(gesamt.replace(",", "."));
    return !datum || isNaN(gesamtNum) || gesamtNum <= 0;
  }, [datum, gesamt]);

  // Positionen-Aenderung
  const updatePosition = useCallback((idx, feld, wert) => {
    setPositionen((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [feld]: wert } : p))
    );
  }, []);

  // Modul-Toggle (pflicht-Module koennen nicht deaktiviert werden)
  const toggleModul = useCallback((key) => {
    if (MODUL_CONFIG[key]?.pflicht) return;
    setModulAktiv((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ============================================================
  // Speicher-Logik
  // ============================================================

  const handleSpeichern = useCallback(async () => {
    if (hatPflichffehler) return;
    if (!session?.user?.id) { toastError("Keine gueltige Sitzung vorhanden."); return; }
    setSpeichern(true);

    const userId = session.user.id;

    try {
      const gesamtNum = parseFloat(gesamt.replace(",", "."));

      // 1. Datei hochladen (immer)
      let dokumentPfad = null;
      if (datei) {
        const ts = Date.now();
        const pfad = `${userId}/${ts}_${dokDateiname || datei.name}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("user-dokumente")
          .upload(pfad, datei, { upsert: false, contentType: datei.type });
        if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`);
        dokumentPfad = uploadData?.path;
      }

      // 2. Dokument-Eintrag (user_id ergaenzt) + id fuer Rueckverlinkung
      const { data: dokData, error: dokErr } = await supabase
        .from("dokumente")
        .insert({
          user_id:      userId,
          dateiname:    dokDateiname,
          beschreibung: dokBeschreibung,
          storage_pfad: dokumentPfad,
          datei_typ:    datei?.type || null,
        })
        .select("id")
        .single();

      if (dokErr) {
        if (dokumentPfad) {
          try {
            await supabase.storage.from("user-dokumente").remove([dokumentPfad]);
          } catch (e) { console.warn("Storage-Rollback fehlgeschlagen:", e); }
        }
        throw new Error(`Dokument-Speicherung fehlgeschlagen: ${dokErr.message}`);
      }
      const dokDatenbankId = dokData?.id ?? null;

      const warnings = [];

      // 3. home_wissen INSERT
      if (zusammenfassung.trim()) {
        try {
          const titelTeile = [
            "Rechnung",
            haendler || null,
            datum
              ? new Date(datum).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })
              : null,
          ].filter(Boolean);
          const { error: wissenErr } = await supabase.from("home_wissen").insert({
            user_id:     userId,
            titel:       titelTeile.join(" \u2013 "),
            inhalt:      zusammenfassung.trim(),
            kategorie:   "Rechnungen & Belege",
            tags:        ["rechnung", ...(haendler ? [haendler.toLowerCase().split(" ")[0]] : [])],
            dokument_id: dokDatenbankId,
          });
          if (wissenErr) warnings.push("Wissens-Eintrag konnte nicht gespeichert werden.");
        } catch { warnings.push("Wissens-Eintrag fehlgeschlagen."); }
      }

      // 4. Budget (wenn aktiv)
      if (modulAktiv.budget) {
        try {
          const { error: budgetErr } = await supabase.from("budget_posten").insert({
            beschreibung: budgetBeschreibung || `Einkauf ${haendler}`,
            betrag:       gesamtNum,
            datum:        datum || null,
            kategorie:    budgetKategorie,
            app_modus:    "home",
          });
          if (budgetErr) warnings.push("Budget konnte nicht gespeichert werden.");
        } catch { warnings.push("Budget fehlgeschlagen."); }
      }

      // 5. Geraete (wenn aktiv)
      if (modulAktiv.geraete && geraetName) {
        try {
          const { data: geraetData, error: geraetErr } = await supabase
            .from("home_geraete")
            .insert({
              name:        geraetName,
              hersteller:  geraetHersteller || null,
              kaufdatum:   datum || null,
              kaufpreis:   gesamtNum,
              garantie_bis: garantieBis || null,
            })
            .select("id")
            .single();

          if (geraetErr) {
            warnings.push("Geraet konnte nicht gespeichert werden.");
          } else if (naechsteWartung && geraetData?.id) {
            try {
              await supabase.from("home_wartungen").insert({
                geraet_id:           geraetData.id,
                naechste_faelligkeit: naechsteWartung,
                beschreibung:        "Wartung",
              });
            } catch { warnings.push("Wartung konnte nicht gespeichert werden."); }
          }
        } catch { warnings.push("Geraet fehlgeschlagen."); }
      }

      // 6. Vorraete (wenn aktiv)
      if (modulAktiv.vorraete) {
        try {
          const vorraetePositionen = positionen.filter((p) => p.modul_vorschlag === "vorraete");
          for (const pos of vorraetePositionen) {
            const { error: vErr } = await supabase.from("home_vorraete").insert({
              name:         pos.name,
              bestand:      pos.menge || 1,
              einheit:      "Stueck",
              kategorie:    pos.obergruppe || "keine_zuordnung",
              mindestmenge: 1,
            });
            if (vErr) { warnings.push("Vorrat konnte nicht gespeichert werden."); break; }
          }
        } catch { warnings.push("Vorraete fehlgeschlagen."); }
      }

      // 7. Inventar (wenn aktiv)
      if (modulAktiv.inventar) {
        try {
          const inventarPositionen = positionen.filter((p) => p.modul_vorschlag === "inventar");
          for (const pos of inventarPositionen) {
            const { error: iErr } = await supabase.from("home_objekte").insert({
              name:      pos.name,
              kategorie: pos.obergruppe || "keine_zuordnung",
              status:    "vorhanden",
              kaufpreis: pos.gesamtpreis || null,
              kaufdatum: datum || null,
            });
            if (iErr) { warnings.push("Inventar konnte nicht gespeichert werden."); break; }
          }
        } catch { warnings.push("Inventar fehlgeschlagen."); }
      }

      if (warnings.length > 0) {
        toastError("Rechnung gespeichert, aber: " + warnings.join("; "));
      } else {
        success("Rechnung gespeichert.");
      }
      onGespeichert();
    } catch (err) {
      console.error("Speicher-Fehler:", err);
      toastError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSpeichern(false);
    }
  }, [
    hatPflichffehler, gesamt, datei, session, dokDateiname, dokBeschreibung,
    datum, modulAktiv, budgetBeschreibung, haendler, budgetKategorie,
    geraetName, geraetHersteller, garantieBis, naechsteWartung,
    positionen, zusammenfassung, success, toastError, onGespeichert,
  ]);

  // ============================================================
  // Render
  // ============================================================

  const niedrigeConfidence = ergebnis.confidence < 0.4;
  const reviewNoetigCount = positionen.filter((p) => p.review_noetig).length;

  return (
    <div className="fixed inset-0 z-50 bg-canvas-0 overflow-y-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-canvas-1 border-b border-canvas-3 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onAbbrechen}
          className="p-1.5 rounded-lg hover:bg-canvas-2 text-dark-text-main transition-colors"
          aria-label="Abbrechen"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold text-dark-text-main flex-1">Rechnung pruefen</h2>
        <button
          onClick={handleSpeichern}
          disabled={hatPflichffehler || speichern}
          className="flex items-center gap-1.5 px-4 py-2 rounded-card-sm bg-primary-500
                     hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold
                     transition-colors shadow-sm"
        >
          {speichern ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Speichern
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Warnungen */}
        {niedrigeConfidence && (
          <div className="flex items-start gap-3 p-3 rounded-card-sm bg-accent-danger/10 border border-accent-danger/30">
            <AlertTriangle size={18} className="text-accent-danger mt-0.5 shrink-0" />
            <p className="text-sm text-dark-text-main">
              Die Bildqualitaet oder Erkennungsgenauigkeit ist niedrig. Bitte alle Felder sorgfaeltig pruefen.
            </p>
          </div>
        )}
        {reviewNoetigCount > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-card-sm bg-accent-warm/10 border border-accent-warm/30">
            <Info size={18} className="text-accent-warm mt-0.5 shrink-0" />
            <p className="text-sm text-dark-text-main">
              {reviewNoetigCount} Position{reviewNoetigCount > 1 ? "en" : ""} mit unsicherer Klassifizierung. Bitte unten pruefen.
            </p>
          </div>
        )}

        {/* Stammdaten */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">Rechnungsdaten</h3>
          <InputFeld label="Haendler / Lieferant" value={haendler} onChange={setHaendler} placeholder="z.B. REWE, MediaMarkt" />
          <div className="grid grid-cols-2 gap-3">
            <InputFeld label="Datum *" value={datum} onChange={setDatum} type="date" />
            <InputFeld label="Gesamtbetrag (EUR) *" value={gesamt} onChange={setGesamt} type="number" placeholder="0.00" />
          </div>
          {hatPflichffehler && (
            <p className="text-xs text-accent-danger">Datum und Betrag sind Pflichtfelder.</p>
          )}
        </div>

        {/* Zusammenfassung */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">Zusammenfassung</h3>
          <p className="text-xs text-dark-text-secondary">
            Wird in deiner Wissensdatenbank gespeichert. Du kannst den Text anpassen.
          </p>
          <textarea
            value={zusammenfassung}
            onChange={(e) => setZusammenfassung(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-card-sm bg-canvas-2 border border-canvas-3
                       text-sm text-dark-text-main focus:outline-none focus:border-primary-500
                       transition-colors resize-none"
            placeholder="Automatisch generierte Zusammenfassung..."
          />
        </div>

        {/* Modul-Auswahl */}
        <div className="bg-canvas-1 rounded-card border border-canvas-3 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-dark-text-main">In welche Module speichern?</h3>
          <div className="space-y-2">
            {Object.entries(MODUL_CONFIG).map(([key, cfg]) => (
              <label
                key={key}
                className={`flex items-center gap-3 p-2.5 rounded-card-sm cursor-pointer transition-colors
                  ${modulAktiv[key] ? "bg-canvas-2" : "bg-canvas-1 opacity-60"}
                  ${cfg.pflicht ? "cursor-not-allowed" : "hover:bg-canvas-2"}`}
              >
                <input
                  type="checkbox"
                  checked={modulAktiv[key]}
                  onChange={() => toggleModul(key)}
                  disabled={cfg.pflicht}
                  className="w-4 h-4 accent-primary-500"
                />
                <span className={`${cfg.farbe} flex items-center gap-1.5 text-sm font-medium`}>
                  {cfg.icon}{cfg.label}
                </span>
                {cfg.pflicht && (
                  <span className="ml-auto text-xs text-dark-text-secondary">immer</span>
                )}
                {key === "budget" && !modulAktiv.budget && (
                  <span className="ml-auto text-xs text-dark-text-secondary">kein Budgeteintrag</span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Positionen */}
        {positionen.length > 0 && (
          <AkkordeonSektion
            title={`Positionen (${positionen.length})`}
            icon={<Package size={16} />}
            defaultOffen={reviewNoetigCount > 0}
            kinder={positionen.map((pos, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-card-sm border ${
                  pos.review_noetig
                    ? "border-accent-warm/50 bg-accent-warm/5"
                    : "border-canvas-3 bg-canvas-2"
                } space-y-2`}
              >
                {pos.review_noetig && (
                  <span className="inline-flex items-center gap-1 text-xs text-accent-warm font-medium">
                    <AlertTriangle size={12} /> Bitte pruefen
                  </span>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs text-dark-text-secondary">Name</label>
                    <input
                      type="text"
                      value={pos.name || ""}
                      onChange={(e) => updatePosition(idx, "name", e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-text-secondary">Menge</label>
                    <input
                      type="number"
                      value={pos.menge || 1}
                      onChange={(e) => updatePosition(idx, "menge", Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-text-secondary">Preis (EUR)</label>
                    <input
                      type="number"
                      value={pos.gesamtpreis || 0}
                      onChange={(e) => updatePosition(idx, "gesamtpreis", Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                                 text-sm text-dark-text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-dark-text-secondary">Modul</label>
                  <select
                    value={pos.modul_vorschlag || "keine_zuordnung"}
                    onChange={(e) => updatePosition(idx, "modul_vorschlag", e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 rounded bg-canvas-1 border border-canvas-3
                               text-xs text-dark-text-main focus:outline-none focus:border-primary-500"
                  >
                    {MODUL_OPTIONEN.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          />
        )}

        {/* Budget-Details */}
        {modulAktiv.budget && (
          <AkkordeonSektion
            title="Budget-Details"
            icon={<Wallet size={16} />}
            defaultOffen={true}
            kinder={
              <>
                <InputFeld label="Beschreibung" value={budgetBeschreibung} onChange={setBudgetBeschreibung} />
                <SelectFeld
                  label="Kategorie"
                  value={budgetKategorie}
                  onChange={setBudgetKategorie}
                  optionen={BUDGET_KATEGORIEN}
                />
              </>
            }
          />
        )}

        {/* Geraete-Details */}
        {modulAktiv.geraete && (
          <AkkordeonSektion
            title="Geraet & Wartung"
            icon={<Cpu size={16} />}
            defaultOffen={true}
            kinder={
              <>
                <InputFeld label="Geraetename *" value={geraetName} onChange={setGeraetName} placeholder="z.B. Waschmaschine XY" />
                <InputFeld label="Hersteller" value={geraetHersteller} onChange={setGeraetHersteller} placeholder="z.B. Bosch" />
                <div className="grid grid-cols-2 gap-3">
                  <InputFeld
                    label="Gewaehrleistung bis"
                    value={gewaehrleistungBis}
                    onChange={setGewaehrleistungBis}
                    type="date"
                  />
                  <InputFeld
                    label="Herstellergarantie bis (optional)"
                    value={garantieBis}
                    onChange={setGarantieBis}
                    type="date"
                  />
                </div>
                <InputFeld
                  label="Naechste Wartung (optional)"
                  value={naechsteWartung}
                  onChange={setNaechsteWartung}
                  type="date"
                />
              </>
            }
          />
        )}

        {/* Dokument-Details */}
        <AkkordeonSektion
          title="Dokument"
          icon={<FileText size={16} />}
          defaultOffen={false}
          kinder={
            <>
              <InputFeld label="Dateiname" value={dokDateiname} onChange={setDokDateiname} />
              <InputFeld label="Beschreibung" value={dokBeschreibung} onChange={setDokBeschreibung} />
            </>
          }
        />

        {/* Spacer fuer Sticky Footer */}
        <div className="h-4" />
      </div>

      {/* Sticky Footer (mobil) */}
      <div className="sticky bottom-0 bg-canvas-1 border-t border-canvas-3 px-4 py-3 flex gap-3">
        <button
          onClick={onAbbrechen}
          className="flex-1 py-3 rounded-card-sm bg-canvas-2 hover:bg-canvas-3
                     text-sm font-medium text-dark-text-main transition-colors border border-canvas-3"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSpeichern}
          disabled={hatPflichffehler || speichern}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-card-sm
                     bg-primary-500 hover:bg-primary-600 disabled:opacity-50
                     text-white text-sm font-semibold transition-colors shadow-sm"
        >
          {speichern ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Speichern
        </button>
      </div>
    </div>
  );
}
