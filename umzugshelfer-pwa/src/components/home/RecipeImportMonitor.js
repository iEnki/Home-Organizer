import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import ModalShell from "../ui/ModalShell";
import { useAppMode } from "../../contexts/AppModeContext";
import { fetchRecipeImportJobs, isOpenReviewImport, markRecipeImportNotified } from "../../utils/recipeImportService";

export default function RecipeImportMonitor({ session, householdContext }) {
  const navigate = useNavigate();
  const { appMode, modusGeladen } = useAppMode();
  const userId = session?.user?.id;
  const householdId = householdContext?.household_id;
  const [job, setJob] = useState(null);
  const [seen, setSeen] = useState(() => new Set());

  const active = useMemo(
    () => Boolean(userId && householdId && modusGeladen && appMode === "home"),
    [appMode, householdId, modusGeladen, userId],
  );

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const jobs = await fetchRecipeImportJobs({ limit: 20 });
        const next = jobs.find((item) => isOpenReviewImport(item) && !item.notified_at && !seen.has(item.id));
        if (!next || cancelled) return;
        setSeen((current) => new Set(current).add(next.id));
        setJob(next);
        try {
          await markRecipeImportNotified(next.id);
        } catch (err) {
          console.warn("Rezeptimport-Benachrichtigung konnte nicht markiert werden", err);
        }
      } catch (err) {
        console.warn("Rezeptimporte konnten nicht ueberwacht werden", err);
      }
    };
    tick();
    const timer = setInterval(tick, 12000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, seen]);

  if (!job) return null;

  const openImport = () => {
    const jobId = job.id;
    setJob(null);
    navigate("/home/kochbuch", { state: { recipeImportJobId: jobId } });
  };

  return (
    <ModalShell
      open
      title="Rezeptimport ist bereit"
      onClose={() => setJob(null)}
      maxWidthClass="max-w-md"
      footer={(
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setJob(null)}
            className="rounded-pill border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main"
          >
            Spaeter
          </button>
          <button
            type="button"
            onClick={openImport}
            className="rounded-pill bg-primary-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Ansehen
          </button>
        </div>
      )}
    >
      <div className="flex gap-3">
        <div className="mt-0.5 rounded-full bg-primary-500/10 p-2 text-primary-500">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
            Ein importiertes Rezept wartet auf deine Pruefung.
          </p>
          <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Du kannst die Importnotizen ansehen, Zutaten und Schritte pruefen und das Rezept danach speichern.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
