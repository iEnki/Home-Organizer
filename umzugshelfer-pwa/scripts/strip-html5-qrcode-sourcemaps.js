const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");
const targetRoot = path.join(packageRoot, "node_modules", "html5-qrcode");
const targetDirs = ["cjs", "esm", "es2015"];
const sourceMapLine = /\r?\n\/\/# sourceMappingURL=.*$/m;

function stripSourceMapReference(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  const cleaned = original.replace(sourceMapLine, "");
  if (cleaned === original) return false;
  fs.writeFileSync(filePath, cleaned, "utf8");
  return true;
}

function walk(dirPath, changedFiles) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, changedFiles);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js") && stripSourceMapReference(fullPath)) {
      changedFiles.push(path.relative(packageRoot, fullPath));
    }
  }
}

function main() {
  if (!fs.existsSync(targetRoot)) {
    console.log("[postinstall] html5-qrcode nicht installiert, Sourcemap-Bereinigung uebersprungen.");
    return;
  }

  const changedFiles = [];
  for (const dirName of targetDirs) {
    const dirPath = path.join(targetRoot, dirName);
    if (fs.existsSync(dirPath)) {
      walk(dirPath, changedFiles);
    }
  }

  if (changedFiles.length === 0) {
    console.log("[postinstall] html5-qrcode enthaelt keine stoerenden sourceMappingURL-Verweise.");
    return;
  }

  console.log(`[postinstall] html5-qrcode Sourcemap-Verweise entfernt: ${changedFiles.length} Datei(en).`);
}

main();
