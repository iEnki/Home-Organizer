const INVOICE_TYPES = new Set(["rechnung", "invoice"]);

const uniqueIds = (values = []) =>
  Array.from(
    new Set(
      values
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter(Boolean),
    ),
  );

const isInvoiceDocument = (doc) => {
  const kategorie = (doc?.kategorie || "").trim().toLowerCase();
  const dokumentTyp = (doc?.dokument_typ || "").trim().toLowerCase();
  return kategorie === "rechnung" || INVOICE_TYPES.has(dokumentTyp);
};

const isAllocationSchemaError = (error) => {
  const message = String(error?.message || error?.details || error?.hint || "");
  return (
    /budget_settlement_allocations/i.test(message) ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST201" ||
    /relationship.*schema cache/i.test(message)
  );
};

const deleteByIds = async (supabase, table, ids) => {
  if (!ids?.length) return null;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(`${table} konnte nicht geloescht werden: ${error.message}`);
  return ids.length;
};

const archiveBudgetByIds = async (supabase, ids, archivedByUserId = null) => {
  if (!ids?.length) return null;
  const { error } = await supabase
    .from("budget_posten")
    .update({
      archived_at: new Date().toISOString(),
      archived_reason: "invoice_cascade_allocated_delete",
      archived_by_user_id: archivedByUserId || null,
      wiederholen: false,
      naechstes_datum: null,
    })
    .in("id", ids);
  if (error) throw new Error(`budget_posten konnte nicht archiviert werden: ${error.message}`);
  return ids.length;
};

const findAllocatedBudgetIds = async (supabase, budgetIds = []) => {
  if (!budgetIds.length) return [];

  const { data, error } = await supabase
    .from("budget_split_groups")
    .select("budget_posten_id, budget_split_shares(id, budget_settlement_allocations(id))")
    .in("budget_posten_id", budgetIds);

  if (error) {
    if (isAllocationSchemaError(error)) {
      throw new Error(
        "Ausgleich-Schema unvollstaendig: budget_settlement_allocations fehlt oder ist nicht korrekt mit budget_split_shares verknuepft. Die Kaskadenloeschung wurde gestoppt, damit keine allokierten Ausgleiche verloren gehen.",
      );
    }
    throw new Error(`Split-Status konnte nicht geprueft werden: ${error.message}`);
  }

  return (data || [])
    .filter((group) =>
      (group.budget_split_shares || []).some(
        (share) => Array.isArray(share.budget_settlement_allocations) && share.budget_settlement_allocations.length > 0,
      ),
    )
    .map((group) => group.budget_posten_id);
};

export async function deleteInvoiceCascade({ supabase, dokumentId, fallbackStoragePfad = null, archivedByUserId = null }) {
  if (!dokumentId) {
    throw new Error("Dokument-ID fehlt.");
  }

  const { data: dokument, error: dokError } = await supabase
    .from("dokumente")
    .select("id, dateiname, storage_pfad, kategorie, dokument_typ")
    .eq("id", dokumentId)
    .single();

  if (dokError || !dokument) {
    throw new Error("Dokument konnte nicht geladen werden.");
  }

  const storagePfad = dokument.storage_pfad || fallbackStoragePfad || null;
  const invoiceByType = isInvoiceDocument(dokument);

  let links = [];
  const { data: linkRows, error: linkErr } = await supabase
    .from("dokument_links")
    .select("id, entity_type, entity_id")
    .eq("dokument_id", dokumentId);
  if (!linkErr && Array.isArray(linkRows)) {
    links = linkRows;
  }

  const budgetIds = uniqueIds(
    links
      .filter((l) => l.entity_type === "budget_posten")
      .map((l) => l.entity_id),
  );

  const wissenIdsFromLinks = uniqueIds(
    links
      .filter((l) => l.entity_type === "home_wissen")
      .map((l) => l.entity_id),
  );

  const rechnungIdsFromLinks = uniqueIds(
    links
      .filter((l) => l.entity_type === "rechnung")
      .map((l) => l.entity_id),
  );

  const { data: wissenRows } = await supabase
    .from("home_wissen")
    .select("id")
    .eq("dokument_id", dokumentId);
  const wissenIdsFallback = uniqueIds((wissenRows || []).map((r) => r.id));

  const { data: rechnungRows } = await supabase
    .from("rechnungen")
    .select("id")
    .eq("dokument_id", dokumentId);
  const rechnungIdsFallback = uniqueIds((rechnungRows || []).map((r) => r.id));

  const wissenIds = uniqueIds([...wissenIdsFromLinks, ...wissenIdsFallback]);
  const rechnungIds = uniqueIds([...rechnungIdsFromLinks, ...rechnungIdsFallback]);
  const invoiceDoc = invoiceByType || rechnungIds.length > 0 || rechnungIdsFromLinks.length > 0;

  const allocatedBudgetIds = invoiceDoc ? await findAllocatedBudgetIds(supabase, budgetIds) : [];
  const allocatedBudgetIdSet = new Set(allocatedBudgetIds);
  const deletableBudgetIds = budgetIds.filter((budgetId) => !allocatedBudgetIdSet.has(budgetId));

  if (storagePfad) {
    const { error: storageErr } = await supabase.storage
      .from("user-dokumente")
      .remove([storagePfad]);
    if (storageErr) {
      throw new Error(`Datei konnte nicht geloescht werden: ${storageErr.message}`);
    }
  }

  if (invoiceDoc) {
    await archiveBudgetByIds(supabase, allocatedBudgetIds, archivedByUserId);
    await deleteByIds(supabase, "budget_posten", deletableBudgetIds);
    await deleteByIds(supabase, "home_wissen", wissenIds);
    await deleteByIds(supabase, "rechnungen", rechnungIds);
  }

  const { error: linkDeleteErr } = await supabase
    .from("dokument_links")
    .delete()
    .eq("dokument_id", dokumentId);
  if (linkDeleteErr && linkDeleteErr.code !== "PGRST116") {
    throw new Error(`Dokument-Links konnten nicht geloescht werden: ${linkDeleteErr.message}`);
  }

  const { error: deleteDocErr } = await supabase
    .from("dokumente")
    .delete()
    .eq("id", dokumentId);
  if (deleteDocErr) {
    throw new Error(`Dokument konnte nicht geloescht werden: ${deleteDocErr.message}`);
  }

  return {
    dokument: dokument.dateiname || "Dokument",
    invoiceDoc,
    deletedBudget: deletableBudgetIds.length,
    archivedBudget: allocatedBudgetIds.length,
    deletedWissen: wissenIds.length,
    deletedRechnungen: rechnungIds.length,
  };
}
