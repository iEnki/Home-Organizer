import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, BookOpen, RefreshCw, ArrowLeftRight } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { logVerlauf } from "../../../utils/homeVerlauf";
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
  assistantFlow = null,
}) {
  const { t } = useTranslation(["books"]);
  const userId = session?.user?.id;

  const [buecher, setBuecher] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState(null);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortierung, setSortierung] = useState("titel_asc");
  const [ansicht, setAnsicht] = useState("liste");

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
        .order("titel", { ascending: true });
      if (error) throw error;
      setBuecher(data ?? []);
    } catch (e) {
      setFehler(e.message ?? t("books:shelf.errLoad"));
    } finally {
      setLaden(false);
    }
  }, [householdId, t]);

  useEffect(() => { ladeBuecher(); }, [ladeBuecher]);

  useEffect(() => {
    if (!assistantFlow?.ui_state) return;
    const startModal = assistantFlow.ui_state.startModal;
    if (startModal === "scanner") {
      setModal({
        typ: "scanner",
        modus: assistantFlow.ui_state.scannerMode || "einzel",
      });
    } else if (startModal === "upload") {
      setModal({ typ: "upload" });
    }
  }, [assistantFlow]);

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
          (b.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
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
    if (!window.confirm(t("books:shelf.deleteConfirm", { title: buch.titel }))) return;
    const { error } = await supabase.from("home_buecher").delete().eq("id", buch.id);
    if (error) { alert(t("books:shelf.errDelete", { message: error.message })); return; }
    await logVerlauf(supabase, userId, "home_buecher", buch.titel, "geloescht");
    ladeBuecher();
  };

  const handleVerleihenOpen = (buch) => {
    if (buch.status === "verliehen") {
      setModal({ typ: "verleih_auswahl", buch });
    } else {
      setModal({ typ: "verleih", buch, modus: "verleihen" });
    }
  };

  const handleScanEinzelFund = (bookResult) => {
    setModal({ typ: "form", buch: null, prefill: bookResult });
  };

  const handleImportBatchErstellt = (importId) => {
    setModal({ typ: "review", importId });
  };

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-light-text-secondary dark:text-dark-text-secondary">
        <Loader2 size={22} className="animate-spin mr-2" /> {t("books:shelf.loading")}
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
              ? t("books:shelf.emptyShelf")
              : t("books:shelf.emptySearch")}
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
              onAktualisiert={ladeBuecher}
              onLoeschen={handleLoeschen}
            />
          ))}
        </div>
      )}

      {/* Statusleiste */}
      <p className="mt-4 text-xs text-light-text-secondary dark:text-dark-text-secondary">
        {t("books:shelf.bookCount", { count: gefilterteSortiert.length })}
        {statusFilter ? ` · Status: ${t(`books:status.${statusFilter}`)}` : ""}
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

      {modal?.typ === "verleih_auswahl" && (
        <div className="fixed app-centered-modal-overlay z-[100] flex items-center justify-center bg-black/60">
          <div
            className="app-centered-modal-dialog bg-light-card dark:bg-canvas-2 rounded-card w-full max-w-xs flex flex-col border border-light-border dark:border-dark-border shadow-elevation-3 overflow-hidden"
          >
            <div className="shrink-0 px-4 py-3 border-b border-light-border dark:border-dark-border">
              <p className="text-sm font-semibold text-light-text-main dark:text-dark-text-main truncate">
                {modal.buch?.titel}
              </p>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                {t("books:loanModal.loanAction")}
              </p>
            </div>
            <div className="mobile-modal-body p-3 flex flex-col gap-2">
              <button
                onClick={() => setModal({ typ: "verleih", buch: modal.buch, modus: "verlaengern" })}
                className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-card-sm border border-light-border dark:border-dark-border text-light-text-main dark:text-dark-text-main hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                <RefreshCw size={14} className="text-light-text-secondary dark:text-dark-text-secondary" />
                {t("books:loanModal.extend")}
              </button>
              <button
                onClick={() => setModal({ typ: "verleih", buch: modal.buch, modus: "zurueckgeben" })}
                className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-card-sm border border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10"
              >
                <ArrowLeftRight size={14} />
                {t("books:loanModal.returnBtn")}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-3 py-2 text-sm rounded-card-sm text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-hover dark:hover:bg-canvas-3"
              >
                {t("books:loanModal.cancel")}
              </button>
            </div>
          </div>
        </div>
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
