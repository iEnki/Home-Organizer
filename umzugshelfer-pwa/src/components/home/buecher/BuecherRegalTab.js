import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, AlertCircle, BookOpen } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { logVerlauf } from "../../../utils/homeVerlauf";
import { BUCH_STATUS } from "../../../utils/buecher";
import BuecherFilterBar from "./BuecherFilterBar";
import BuchZeile from "./BuchZeile";
import BuchKarte from "./BuchKarte";
import BuchFormModal from "./BuchFormModal";
import BuchVerleihModal from "./BuchVerleihModal";
import BuchScannerModal from "./BuchScannerModal";
import BuchScanUploadModal from "./BuchScanUploadModal";
import BuchImportReviewModal from "./BuchImportReviewModal";

export default function BuecherRegalTab({
  householdId,
  session,
  orte = [],
  lagerorte = [],
  kontakte = [],
}) {
  const userId = session?.user?.id;

  const [buecher, setBuecher] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState(null);

  // Filter/Sortier-State
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortierung, setSortierung] = useState("titel_asc");
  const [ansicht, setAnsicht] = useState("liste");

  // Modal-State
  // null | { typ: "form"|"verleih"|"scanner"|"upload"|"review", ...extra }
  const [modal, setModal] = useState(null);

  const ladeBuecher = useCallback(async () => {
    if (!householdId) return;
    setLaden(true);
    setFehler(null);
    try {
      const { data, error } = await supabase
        .from("home_buecher")
        .select("*")
        .eq("household_id", householdId)
        .neq("status", "entsorgt")
        .order("titel", { ascending: true });
      if (error) throw error;
      setBuecher(data ?? []);
    } catch (e) {
      setFehler(e.message ?? "Fehler beim Laden.");
    } finally {
      setLaden(false);
    }
  }, [householdId]);

  useEffect(() => { ladeBuecher(); }, [ladeBuecher]);

  // Gefilterte + sortierte Liste
  const gefilterteSortiert = useMemo(() => {
    let liste = buecher;

    if (statusFilter) {
      liste = liste.filter((b) => b.status === statusFilter);
    }
    if (suche.trim()) {
      const q = suche.toLowerCase();
      liste = liste.filter(
        (b) =>
          b.titel?.toLowerCase().includes(q) ||
          b.autor_anzeige?.toLowerCase().includes(q) ||
          b.isbn_13?.includes(q) ||
          b.isbn_10?.includes(q) ||
          (b.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }

    const sortierer = (a, b) => {
      switch (sortierung) {
        case "titel_desc":     return (b.titel ?? "").localeCompare(a.titel ?? "");
        case "autor_asc":      return (a.autor_anzeige ?? "").localeCompare(b.autor_anzeige ?? "");
        case "jahr_desc":      return (b.erscheinungsjahr ?? 0) - (a.erscheinungsjahr ?? 0);
        case "created_desc":   return new Date(b.created_at) - new Date(a.created_at);
        default:               return (a.titel ?? "").localeCompare(b.titel ?? "");
      }
    };
    return [...liste].sort(sortierer);
  }, [buecher, suche, statusFilter, sortierung]);

  const handleLoeschen = async (buch) => {
    if (!window.confirm(`„${buch.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from("home_buecher").delete().eq("id", buch.id);
    if (error) { alert("Fehler: " + error.message); return; }
    await logVerlauf(supabase, userId, "home_buecher", buch.titel, "geloescht");
    ladeBuecher();
  };

  const handleVerleihenOpen = (buch) => {
    let modus = "verleihen";
    if (buch.status === "verliehen") modus = "verlaengern";
    setModal({ typ: "verleih", buch, modus });
  };

  // Einzel-Scan: Scanner öffnet, bei Fund → Formular vorausfüllen
  const handleScanEinzelFund = (bookResult) => {
    setModal({ typ: "form", buch: null, prefill: bookResult });
  };

  // Stapel-Scan / Foto-Analyse → Review-Modal
  const handleImportBatchErstellt = (importId) => {
    setModal({ typ: "review", importId });
  };

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
        <Loader2 size={22} className="animate-spin mr-2" /> Bücher werden geladen…
      </div>
    );
  }

  if (fehler) {
    return (
      <div className="flex items-center gap-2 text-accent-danger text-sm py-8">
        <AlertCircle size={16} /> {fehler}
      </div>
    );
  }

  return (
    <div>
      <BuecherFilterBar
        suche={suche}
        onSucheChange={setSuche}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortierung={sortierung}
        onSortierungChange={setSortierung}
        onNeu={() => setModal({ typ: "form", buch: null })}
        ansicht={ansicht}
        onAnsichtChange={setAnsicht}
        onScanEinzel={() => setModal({ typ: "scanner", modus: "einzel" })}
        onScanStapel={() => setModal({ typ: "scanner", modus: "stapel" })}
        onFotoAnalyse={() => setModal({ typ: "upload" })}
      />

      {gefilterteSortiert.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-light-text-secondary dark:text-dark-text-secondary gap-3">
          <BookOpen size={32} className="opacity-30" />
          <p className="text-sm">
            {buecher.length === 0
              ? "Noch keine Bücher vorhanden. Füge dein erstes Buch hinzu!"
              : "Keine Bücher für die aktuelle Suche gefunden."}
          </p>
        </div>
      ) : ansicht === "karten" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {gefilterteSortiert.map((buch) => (
            <BuchKarte
              key={buch.id}
              buch={buch}
              onBearbeiten={(b) => setModal({ typ: "form", buch: b })}
              onVerleihen={handleVerleihenOpen}
              onLoeschen={handleLoeschen}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterteSortiert.map((buch) => (
            <BuchZeile
              key={buch.id}
              buch={buch}
              onBearbeiten={(b) => setModal({ typ: "form", buch: b })}
              onVerleihen={handleVerleihenOpen}
              onLoeschen={handleLoeschen}
            />
          ))}
        </div>
      )}

      {/* Statusleiste */}
      <p className="mt-4 text-xs text-light-text-secondary dark:text-dark-text-secondary">
        {gefilterteSortiert.length} {gefilterteSortiert.length === 1 ? "Buch" : "Bücher"}
        {statusFilter ? ` · Status: ${BUCH_STATUS[statusFilter]}` : ""}
      </p>

      {/* Modals */}
      {modal?.typ === "form" && (
        <BuchFormModal
          buch={modal.buch}
          prefill={modal.prefill}
          householdId={householdId}
          session={session}
          orte={orte}
          lagerorte={lagerorte}
          onSpeichern={async () => {
            await logVerlauf(
              supabase, userId, "home_buecher",
              modal.buch?.titel ?? "Neues Buch",
              modal.buch ? "geaendert" : "erstellt",
            );
            setModal(null);
            ladeBuecher();
          }}
          onAbbrechen={() => setModal(null)}
        />
      )}

      {modal?.typ === "verleih" && (
        <BuchVerleihModal
          buch={modal.buch}
          modus={modal.modus}
          session={session}
          kontakte={kontakte}
          onErledigt={() => { setModal(null); ladeBuecher(); }}
          onAbbrechen={() => setModal(null)}
        />
      )}

      {modal?.typ === "scanner" && (
        <BuchScannerModal
          modus={modal.modus}
          householdId={householdId}
          session={session}
          orte={orte}
          lagerorte={lagerorte}
          onBuchGefunden={handleScanEinzelFund}
          onImportBatchErstellt={handleImportBatchErstellt}
          onAbbrechen={() => setModal(null)}
        />
      )}

      {modal?.typ === "upload" && (
        <BuchScanUploadModal
          householdId={householdId}
          session={session}
          orte={orte}
          lagerorte={lagerorte}
          onImportBatchErstellt={handleImportBatchErstellt}
          onAbbrechen={() => setModal(null)}
        />
      )}

      {modal?.typ === "review" && (
        <BuchImportReviewModal
          importId={modal.importId}
          householdId={householdId}
          session={session}
          onErledigt={() => { setModal(null); ladeBuecher(); }}
          onAbbrechen={() => setModal(null)}
        />
      )}
    </div>
  );
}
