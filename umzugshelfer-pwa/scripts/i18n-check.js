const fs = require("fs");
const path = require("path");

const localesDir = path.join(__dirname, "..", "src", "i18n", "locales");
const baseLocale = "de";
const targetLocales = ["en-GB"];
const strictLiterals = process.env.I18N_STRICT_LITERALS === "1";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

let failed = false;
const namespaces = fs
  .readdirSync(path.join(localesDir, baseLocale))
  .filter((name) => name.endsWith(".json"))
  .map((name) => path.basename(name, ".json"));

for (const namespace of namespaces) {
  const basePath = path.join(localesDir, baseLocale, `${namespace}.json`);
  const baseKeys = new Set(flattenKeys(readJson(basePath)));

  for (const locale of targetLocales) {
    const targetPath = path.join(localesDir, locale, `${namespace}.json`);
    if (!fs.existsSync(targetPath)) {
      console.error(`[i18n] Missing namespace ${locale}/${namespace}.json`);
      failed = true;
      continue;
    }

    const targetKeys = new Set(flattenKeys(readJson(targetPath)));
    const missing = [...baseKeys].filter((key) => !targetKeys.has(key));
    const extra = [...targetKeys].filter((key) => !baseKeys.has(key));

    if (missing.length) {
      console.error(`[i18n] Missing keys in ${locale}/${namespace}.json:\n  ${missing.join("\n  ")}`);
      failed = true;
    }
    if (extra.length) {
      console.warn(`[i18n] Extra keys in ${locale}/${namespace}.json:\n  ${extra.join("\n  ")}`);
    }
  }
}

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "i18n" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const literalPatterns = [
  /["'`][^"'`]*(?:[\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]|\\u00(?:c4|d6|dc|e4|f6|fc|df))[^"'`]*["'`]/,
  /["'`][^"'`]*\b(?:Umzug|Haushalt|Rechnung|Dokument|Kosten|Konto|Speichern|Abbrechen|L\u00f6schen|Loeschen|Bearbeiten|Hinzuf\u00fcgen|Hinzufuegen|Suchen|Kategorie|Betrag|Datum|Beschreibung|Einstellungen|Profil|Einladung|Passwort|Anmelden|Registrieren|Erinnerung)\b[^"'`]*["'`]/
];
const autoTranslatePath = path.join(__dirname, "..", "src", "i18n", "uiAutoTranslate.js");
const autoTranslatedLiterals = new Set();
if (fs.existsSync(autoTranslatePath)) {
  const autoTranslateSource = fs.readFileSync(autoTranslatePath, "utf8");
  const keyPattern = /["']((?:\\.|[^"'\\])+)["']\s*:/g;
  let match;
  while ((match = keyPattern.exec(autoTranslateSource))) {
    try {
      autoTranslatedLiterals.add(JSON.parse(`"${match[1].replace(/"/g, '\\"')}"`));
    } catch {
      autoTranslatedLiterals.add(match[1]);
    }
  }
}

const literalIgnore = [
  "src\\i18n\\uiAutoTranslate.js",
  "src/i18n/uiAutoTranslate.js",
  "src\\utils\\rechnungAnalyse.js",
  "src/utils/rechnungAnalyse.js",
  "src\\utils\\einkaufslisteUtils.js",
  "src/utils/einkaufslisteUtils.js",
  "src\\utils\\assistantDomains.js",
  "src/utils/assistantDomains.js",
  "src\\utils\\mojibake.js",
  "src/utils/mojibake.js",
  "src\\utils\\localizedRecipeShopping.js",
  "src/utils/localizedRecipeShopping.js",
  "src\\utils\\buecher.js",
  "src/utils/buecher.js",
  "src\\utils\\homeBudgetCategories.js",
  "src/utils/homeBudgetCategories.js",
  "src\\components\\PacklisteManager.js",
  "src/components/PacklisteManager.js"
];

const strictNoAutoTranslateFiles = new Set([
  "src\\components\\UmzugsplanerSeite.js",
  "src/components/UmzugsplanerSeite.js",
  "src\\components\\BedarfsrechnerPage.js",
  "src/components/BedarfsrechnerPage.js",
  "src\\components\\BedarfsrechnerVolumen.js",
  "src/components/BedarfsrechnerVolumen.js",
  "src\\components\\BedarfsrechnerTransportkosten.js",
  "src/components/BedarfsrechnerTransportkosten.js",
  "src\\components\\BedarfsrechnerKisten.js",
  "src/components/BedarfsrechnerKisten.js",
  "src\\components\\BedarfsrechnerFarbe.js",
  "src/components/BedarfsrechnerFarbe.js",
  "src\\components\\BedarfsrechnerBoden.js",
  "src/components/BedarfsrechnerBoden.js",
  "src\\components\\BedarfsrechnerTapete.js",
  "src/components/BedarfsrechnerTapete.js",
  "src\\components\\BedarfsrechnerDaemmstoff.js",
  "src/components/BedarfsrechnerDaemmstoff.js",
  "src\\components\\RechnerSzenarienManager.js",
  "src/components/RechnerSzenarienManager.js"
]);

const allowedLiteralFindings = [
  { file: "src\\components\\home\\documents\\DokumentFilterBar.js", text: "Januar" },
  { file: "src/components/home/documents/DokumentFilterBar.js", text: "Januar" },
  { file: "src\\components\\home\\KiHomeAssistent.js", text: "Reifenwechsel beauftragen" },
  { file: "src/components/home/KiHomeAssistent.js", text: "Reifenwechsel beauftragen" },
  { file: "src\\components\\home\\UmzugAbschlussModal.js", text: "Die Migration konnte nicht abgeschlossen werden." },
  { file: "src/components/home/UmzugAbschlussModal.js", text: "Die Migration konnte nicht abgeschlossen werden." },
  { file: "src\\utils\\budgetSplits.js", text: "Bitte Zahler wählen." },
  { file: "src/utils/budgetSplits.js", text: "Bitte Zahler wählen." },
  { file: "src\\utils\\bookSearch.js", text: "Wähle den plausibelsten Kandidaten" },
  { file: "src/utils/bookSearch.js", text: "Wähle den plausibelsten Kandidaten" },
  { file: "src\\utils\\budgetLimits.js", text: "Überschritten" },
  { file: "src/utils/budgetLimits.js", text: "Überschritten" },  { file: "src\\components\\home\\RechnungReviewModal.js", text: "getr" },
  { file: "src/components/home/RechnungReviewModal.js", text: "getr" },
  { file: "src\\components\\home\\RecipeImportModal.js", text: "Supabase-Konfiguration oder Sitzung fehlt" },
  { file: "src/components/home/RecipeImportModal.js", text: "Supabase-Konfiguration oder Sitzung fehlt" },
  { file: "src\\components\\home\\RecipeImportModal.js", text: "OpenAI API-Key ist im Haushalt nicht konfiguriert" },
  { file: "src/components/home/RecipeImportModal.js", text: "OpenAI API-Key ist im Haushalt nicht konfiguriert" },
  { file: "src\\components\\home\\RecipeImportModal.js", text: "Kein aktiver Haushalt vorhanden" },
  { file: "src/components/home/RecipeImportModal.js", text: "Kein aktiver Haushalt vorhanden" },
  { file: "src\\components\\home\\RecipeImportModal.js", text: "Ollama-Analyse wartet auf OpenAI" },
  { file: "src/components/home/RecipeImportModal.js", text: "Ollama-Analyse wartet auf OpenAI" },
  { file: "src\\components\\home\\HomeHeimapotheke.js", text: "darreichungsform" },
  { file: "src/components/home/HomeHeimapotheke.js", text: "darreichungsform" },
  { file: "src\\components\\home\\HomeHeimapotheke.js", text: "packungsgroesse" },
  { file: "src/components/home/HomeHeimapotheke.js", text: "packungsgroesse" },
  { file: "src\\components\\home\\documents\\DokumentFilterBar.js", text: "Garantie" },
  { file: "src/components/home/documents/DokumentFilterBar.js", text: "Garantie" },
  { file: "src\\utils\\heimapotheke.js", text: "Erk" },
  { file: "src/utils/heimapotheke.js", text: "Erk" },
  { file: "src\\utils\\heimapotheke.js", text: "pfchen" },
  { file: "src/utils/heimapotheke.js", text: "pfchen" },
];

function isAllowedLiteralFinding(line, relativeFile) {
  return allowedLiteralFindings.some((entry) => entry.file === relativeFile && line.includes(entry.text));
}

function isTechnicalLiteral(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("import ") ||
    trimmed.startsWith("export ") ||
    trimmed.startsWith("console.") ||
    trimmed.includes(" console.") ||
    trimmed.startsWith("debugLog(") ||
    trimmed.includes("\"–\"") ||
    trimmed.includes("format(weekStart") ||
    trimmed.startsWith("const prompt =") ||
    trimmed.startsWith("const systemPrompt =") ||
    trimmed.startsWith("const userPrompt =") ||
    trimmed.startsWith("const MONATE =") ||
    trimmed.startsWith("const RECHNER_TYPEN =") ||
    trimmed.includes(".includes(") ||
    (trimmed.includes("`") && trimmed.includes("${")) ||
    trimmed.includes("{\" \"}") ||
    trimmed.startsWith("<option ") ||
    trimmed.includes("<strong>") ||
    trimmed.includes("requiresReview") ||
    trimmed.includes("assistantDomains") ||
    trimmed.includes("Antworte ") ||
    trimmed.includes("Beispiel-Input") ||
    trimmed.includes("Format: {") ||
    trimmed.includes("JSON") ||
    trimmed.includes("\"aktion\"") ||
    trimmed.startsWith("Gliedere ") ||
    trimmed.startsWith("\"Du bist ") ||
    trimmed.includes("className={`") ||
    trimmed.includes("className=\"") ||
    trimmed.includes("style={{") ||
    trimmed.includes(".localeCompare(") ||
    trimmed.includes("to=\"/") ||
    trimmed.includes("url: \"/") ||
    trimmed.includes("path: \"/") ||
    trimmed.includes("pfad: \"/") ||
    trimmed.includes("navigate(\"/") ||
    trimmed.includes("navigate(`/") ||
    trimmed.includes("window.location") ||
    trimmed.includes("http://") ||
    trimmed.includes("https://") ||
    trimmed.includes("google.com/search") ||
    trimmed.includes("aria-hidden") ||
    /^case\s+["'`]/.test(trimmed) ||
    /^default:/.test(trimmed) ||
    /^["'][a-zäöüß\s-]+["'],?$/.test(trimmed)
  );
}

function extractQuotedLiterals(line) {
  const literals = [];
  const pattern = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  let match;
  while ((match = pattern.exec(line))) {
    if (!match[2]) continue;
    if (match[2].includes("${")) {
      const nestedPattern = /["']((?:\\.|[^"'\\])+)["']/g;
      let nested;
      while ((nested = nestedPattern.exec(match[2]))) {
        literals.push(decodeLiteral(nested[1]));
      }
      match[2]
        .split(/\$\{[^}]*\}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => literals.push(decodeLiteral(part)));
      continue;
    }
    literals.push(decodeLiteral(match[2]));
  }
  return literals;
}

function decodeLiteral(literal) {
  try {
    return JSON.parse(`"${literal.replace(/"/g, '\\"')}"`);
  } catch {
    return literal;
  }
}

function isCoveredByAutoTranslation(literal, relativeFile) {
  if (strictNoAutoTranslateFiles.has(relativeFile)) return false;
  const normalized = literal.trim().replace(/^["'„“”]+|["'„“”.,:;!?]+$/g, "").trim();
  if (!normalized) return true;
  if (autoTranslatedLiterals.has(normalized) || autoTranslatedLiterals.has(literal.trim())) return true;
  for (const translated of autoTranslatedLiterals) {
    if (
      normalized.startsWith(translated) ||
      normalized.endsWith(translated) ||
      translated.startsWith(normalized)
    ) {
      return true;
    }
  }
  return false;
}

function hasUncoveredGermanLiteral(line, relativeFile) {
  const literals = extractQuotedLiterals(line).filter((literal) =>
    literalPatterns.some((pattern) => pattern.test(`"${literal}"`))
  );
  if (!literals.length) return literalPatterns.some((pattern) => pattern.test(line));
  return literals.some((literal) => !isCoveredByAutoTranslation(literal, relativeFile));
}

const srcDir = path.join(__dirname, "..", "src");
const literalFindings = [];
for (const file of walkFiles(srcDir)) {
  const relative = path.relative(path.join(__dirname, ".."), file);
  if (literalIgnore.includes(relative)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (isTechnicalLiteral(line)) return;
    if (isAllowedLiteralFinding(line, relative)) return;
    if (hasUncoveredGermanLiteral(line, relative)) {
      literalFindings.push(`${relative}:${index + 1}: ${trimmed.slice(0, 180)}`);
    }
  });
}

if (literalFindings.length) {
  const preview = literalFindings.join("\n  ");
  const message = `[i18n] German-looking UI literals remain (${literalFindings.length}). ` +
    `Run with I18N_STRICT_LITERALS=1 to fail on these.\n  ${preview}`;
  if (strictLiterals) {
    console.error(message);
    failed = true;
  } else {
    console.warn(message);
  }
}

if (failed) process.exit(1);
console.log("[i18n] Locale key check passed.");
