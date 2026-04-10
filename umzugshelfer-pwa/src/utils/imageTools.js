/**
 * Gemeinsame Bild-Hilfsfunktionen für Rechnungs- und Bücheranalyse.
 */

/**
 * Konvertiert eine Datei zu Base64-String (ohne data-URL-Prefix).
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

/**
 * Komprimiert ein Bild auf maxPx Pixel (längste Seite) via Canvas.
 * PDFs und nicht-Bild-Dateien werden unverändert zurückgegeben.
 * HEIC-Unterstützung ist browserabhängig (Safari/iOS: nativ; Chrome/Firefox: nicht garantiert).
 */
export async function compressImage(file, maxPx = 1200) {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxPx && height <= maxPx) { resolve(file); return; }
      const ratio = Math.min(maxPx / width, maxPx / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
