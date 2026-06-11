import base64
import io
import os
from typing import List

import pypdfium2 as pdfium
import pytesseract
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="Document OCR Service")


class PdfOcrRequest(BaseModel):
    file_base64: str
    max_pages: int = Field(default=5, ge=1, le=20)
    languages: List[str] = Field(default_factory=lambda: ["deu", "eng"])


def require_internal_token(auth_header: str | None) -> None:
    expected = os.environ.get("DOCUMENT_OCR_INTERNAL_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="DOCUMENT_OCR_INTERNAL_TOKEN is not configured.")
    if not auth_header or auth_header != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr/pdf")
def ocr_pdf(payload: PdfOcrRequest, authorization: str | None = Header(default=None)):
    require_internal_token(authorization)

    try:
        pdf_bytes = base64.b64decode(payload.file_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 PDF: {exc}") from exc

    warnings: list[str] = []
    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"PDF could not be opened: {exc}") from exc

    page_count = len(pdf)
    processed_pages = min(page_count, payload.max_pages)
    truncated = page_count > processed_pages
    lang = "+".join(payload.languages or ["deu", "eng"])
    pages = []

    for index in range(processed_pages):
        try:
            page = pdf[index]
            bitmap = page.render(scale=2.0).to_pil()
            if bitmap.mode != "RGB":
                bitmap = bitmap.convert("RGB")
            text = pytesseract.image_to_string(bitmap, lang=lang, config="--psm 6")
            pages.append({"page": index + 1, "text": text.strip()})
        except Exception as exc:
            warnings.append(f"Seite {index + 1}: {exc}")

    combined = "\n\n".join(
        f"--- Seite {entry['page']} ---\n{entry['text']}"
        for entry in pages
        if entry.get("text")
    ).strip()

    if not combined:
        warnings.append("OCR hat keinen Text erkannt.")
    if truncated:
        warnings.append(f"PDF hat {page_count} Seiten; verarbeitet wurden die ersten {processed_pages}.")

    return {
        "text": combined,
        "page_count": page_count,
        "processed_pages": processed_pages,
        "truncated": truncated,
        "pages": pages,
        "warnings": warnings,
    }
