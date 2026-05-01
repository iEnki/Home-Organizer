export const normalizeKnowledgeLocale = (locale) => (locale === "en-GB" || locale === "en" ? "en-GB" : "de");

export const isManualKnowledgeEntry = (entry) =>
  entry?.herkunft === "manuell" || entry?.summary?.manual_override === true;

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const unknownMerchantDe = ["einem unbekannten H", String.fromCharCode(228), "ndler"].join("");

const formatKnowledgeDate = (value, locale) => {
  if (!value) return locale === "en-GB" ? "an unknown date" : "einem unbekannten Datum";
  return new Date(value).toLocaleDateString(locale === "en-GB" ? "en-GB" : "de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatKnowledgeCurrency = (value, locale) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return locale === "en-GB" ? "an unknown amount" : "einem unbekannten Betrag";
  return new Intl.NumberFormat(locale === "en-GB" ? "en-GB" : "de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

export const buildInvoiceKnowledgeContent = (summary, locale = "de") => {
  const normalizedLocale = normalizeKnowledgeLocale(locale);
  const items = asArray(summary?.items || summary?.key_items).map((item) => {
    if (typeof item === "string") return { name: item };
    return item || {};
  });
  const positionen = items.map((item) => ({
    name: item.name || item.description || item.beschreibung,
    gesamtpreis: item.amount ?? item.gesamtpreis ?? item.price,
    menge: item.quantity ?? item.menge,
    einheit: item.unit ?? item.einheit,
    einzelpreis: item.unit_price ?? item.einzelpreis,
  }));
  const merchant = summary?.merchant || summary?.merchant_name || summary?.haendler || (normalizedLocale === "en-GB" ? "an unknown merchant" : unknownMerchantDe);
  const dateText = formatKnowledgeDate(summary?.date || summary?.purchase_date || summary?.datum, normalizedLocale);
  const total = formatKnowledgeCurrency(summary?.amount ?? summary?.total_amount ?? summary?.gesamt, normalizedLocale);
  const list = positionen
    .filter((item) => item.name)
    .slice(0, 3)
    .map((item) => `${item.name}${item.gesamtpreis != null ? ` (${formatKnowledgeCurrency(item.gesamtpreis, normalizedLocale)})` : ""}`)
    .join(", ");

  if (list) {
    return normalizedLocale === "en-GB"
      ? `On ${dateText}, you bought from ${merchant}: ${list}. Total amount: ${total}.`
      : `Du hast am ${dateText} bei ${merchant} gekauft: ${list}. Gesamtbetrag: ${total}.`;
  }

  return normalizedLocale === "en-GB"
    ? `On ${dateText}, you shopped at ${merchant} and spent ${total} in total.`
    : `Du hast am ${dateText} bei ${merchant} eingekauft und insgesamt ${total} ausgegeben.`;
};

export const buildLocalizedKnowledgeFallback = (entry, locale = "de") => {
  const normalizedLocale = normalizeKnowledgeLocale(locale);
  const summary = entry?.summary || {};
  const isInvoice =
    summary.kind === "invoice" ||
    summary.documentClass === "rechnung" ||
    summary.documentType === "rechnung" ||
    (entry?.kategorie || "").toLowerCase() === "rechnungen & belege" ||
    (entry?.tags || []).map((tag) => String(tag).toLowerCase()).includes("rechnung");

  if (!isManualKnowledgeEntry(entry) && isInvoice) {
    const content = buildInvoiceKnowledgeContent(summary, normalizedLocale);
    return {
      title: entry?.titel || summary?.merchant || summary?.merchant_name || "",
      content,
      headline: content,
    };
  }

  return {
    title: entry?.titel || "",
    content: entry?.inhalt || "",
    headline: summary?.headline || "",
  };
};

export const resolveLocalizedKnowledge = (entry, locale = "de") => {
  const normalizedLocale = normalizeKnowledgeLocale(locale);
  if (!entry) return { title: "", content: "", headline: "" };

  if (!isManualKnowledgeEntry(entry)) {
    const localized = entry.localized_content?.[normalizedLocale];
    if (localized?.title || localized?.content || localized?.headline) {
      return {
        title: localized.title || entry.titel || "",
        content: localized.content || entry.inhalt || "",
        headline: localized.headline || localized.content || "",
      };
    }
  }

  return buildLocalizedKnowledgeFallback(entry, normalizedLocale);
};

export const hasLocalizedKnowledgeContent = (entry, locale = "de") => {
  const normalizedLocale = normalizeKnowledgeLocale(locale);
  const localized = entry?.localized_content?.[normalizedLocale];
  return Boolean(localized?.title || localized?.content || localized?.headline);
};
