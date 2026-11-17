"""Generated-data HTTP contracts; PDF rasterization is real, OCR is deterministic.
Set OCR_REAL_TESSERACT=1 inside the service image for the additional real OCR check.
"""
import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import server


def make_pdf(pages=1):
    """Small valid text PDF; no files, fonts or personal documents required."""
    font_id = 3 + 2 * pages
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>",
               ("<< /Type /Pages /Count %d /Kids [%s] >>" %
                (pages, " ".join("%d 0 R" % (3 + 2 * n) for n in range(pages)))).encode()]
    for n in range(pages):
        contents_id = 4 + 2 * n
        objects.append(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] "
                        "/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" %
                        (font_id, contents_id)).encode())
        stream = b"BT /F1 18 Tf 24 120 Td (GENERATED INVOICE TOTAL 42.50 EUR) Tj ET"
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(str(index).encode() + b" 0 obj\n" + obj + b"\nendobj\n")
    start = len(result)
    result.extend(("xref\n0 %d\n0000000000 65535 f \n" % len(offsets)).encode())
    for offset in offsets[1:]:
        result.extend(("%010d 00000 n \n" % offset).encode())
    result.extend(("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(offsets), start)).encode())
    return bytes(result)


class OcrContractTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"DOCUMENT_OCR_INTERNAL_TOKEN": "generated-test-token"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(server.app)
        self.addCleanup(self.client.close)

    def payload(self, pages=1, **overrides):
        return {"file_base64": base64.b64encode(make_pdf(pages)).decode(), **overrides}

    def post(self, payload, token="generated-test-token"):
        headers = {} if token is None else {"Authorization": "Bearer " + token}
        return self.client.post("/ocr/pdf", json=payload, headers=headers)

    def test_health_does_not_require_authentication(self):
        response = self.client.get("/health")
        self.assertEqual((response.status_code, response.json()), (200, {"status": "ok"}))

    def test_missing_and_incorrect_tokens_are_unauthorized(self):
        for token in [None, "incorrect"]:
            with self.subTest(token=token):
                response = self.post(self.payload(), token)
                self.assertEqual((response.status_code, response.json()), (401, {"detail": "Unauthorized"}))

    def test_unconfigured_token_remains_server_error(self):
        with patch.dict(os.environ, {"DOCUMENT_OCR_INTERNAL_TOKEN": ""}):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "DOCUMENT_OCR_INTERNAL_TOKEN is not configured."})

    def test_invalid_base64_remains_bad_request(self):
        response = self.post({"file_base64": "!invalid!"})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()["detail"].startswith("Invalid base64 PDF:"))

    def test_invalid_pdf_remains_bad_request(self):
        response = self.post({"file_base64": base64.b64encode(b"generated-invalid-pdf").decode()})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()["detail"].startswith("PDF could not be opened:"))

    def test_required_payload_and_page_bounds(self):
        for payload in [{}, self.payload(max_pages=0), self.payload(max_pages=21)]:
            with self.subTest(payload_keys=list(payload)):
                self.assertEqual(self.post(payload).status_code, 422)

    @patch.object(server.pytesseract, "image_to_string", return_value="  Generated total 42.50 EUR  ")
    def test_real_pdf_raster_and_default_ocr_contract(self, ocr):
        response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        expected = {"text": "--- Seite 1 ---\nGenerated total 42.50 EUR", "page_count": 1,
                    "processed_pages": 1, "truncated": False,
                    "pages": [{"page": 1, "text": "Generated total 42.50 EUR"}], "warnings": []}
        self.assertEqual(response.json(), expected)
        image = ocr.call_args.args[0]
        self.assertEqual((image.mode, image.size), ("RGB", (800, 400)))
        self.assertEqual(ocr.call_args.kwargs, {"lang": "deu+eng", "config": "--psm 6"})
        if os.environ.get("OCR_CONTRACT_OUTPUT"):
            Path(os.environ["OCR_CONTRACT_OUTPUT"]).write_text(json.dumps(expected, ensure_ascii=False, sort_keys=True), encoding="utf-8")

    @patch.object(server.pytesseract, "image_to_string", return_value="Generated")
    def test_explicit_language_order_and_empty_list_fallback(self, ocr):
        for languages, expected in [(["eng", "deu"], "eng+deu"), ([], "deu+eng")]:
            with self.subTest(languages=languages):
                self.assertEqual(self.post(self.payload(languages=languages)).status_code, 200)
                self.assertEqual(ocr.call_args.kwargs["lang"], expected)

    @patch.object(server.pytesseract, "image_to_string", side_effect=["First", "Second"])
    def test_page_limit_keeps_order_and_truncation_warning(self, ocr):
        response = self.post(self.payload(pages=3, max_pages=2))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "--- Seite 1 ---\nFirst\n\n--- Seite 2 ---\nSecond",
                         "page_count": 3, "processed_pages": 2, "truncated": True,
                         "pages": [{"page": 1, "text": "First"}, {"page": 2, "text": "Second"}],
                         "warnings": ["PDF hat 3 Seiten; verarbeitet wurden die ersten 2."]})
        self.assertEqual(ocr.call_count, 2)

    @patch.object(server.pytesseract, "image_to_string", side_effect=[RuntimeError("generated failure"), "Second"])
    def test_partial_ocr_failure_keeps_other_pages(self, _ocr):
        response = self.post(self.payload(pages=2))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["pages"], [{"page": 2, "text": "Second"}])
        self.assertEqual(response.json()["warnings"], ["Seite 1: generated failure"])
        self.assertEqual(response.json()["processed_pages"], 2)

    @patch.object(server.pytesseract, "image_to_string", return_value="  ")
    def test_empty_recognition_is_a_warning(self, _ocr):
        response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "")
        self.assertEqual(response.json()["warnings"], ["OCR hat keinen Text erkannt."])

    def test_uvicorn_serves_existing_routes(self):
        # Actual ASGI server and HTTP transport; no external network or OCR binary.
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(port)],
                cwd=Path(__file__).parent, stdout=log, stderr=log,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                url = "http://127.0.0.1:%d" % port
                ready = False
                for _ in range(150):
                    if process.poll() is not None:
                        break
                    try:
                        with urllib.request.urlopen(url + "/health", timeout=0.2) as response:
                            self.assertEqual(json.load(response), {"status": "ok"})
                        ready = True
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.1)
                log.seek(0)
                self.assertTrue(ready, log.read().decode(errors="replace"))
                for token, expected in [(None, 401), ("generated-test-token", 400)]:
                    headers = {"Content-Type": "application/json"}
                    if token:
                        headers["Authorization"] = "Bearer " + token
                    req = urllib.request.Request(url + "/ocr/pdf", data=b'{"file_base64":"invalid"}', headers=headers)
                    with self.assertRaises(urllib.error.HTTPError) as failure:
                        urllib.request.urlopen(req, timeout=5)
                    self.assertEqual(failure.exception.code, expected)
                    failure.exception.close()
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

    @unittest.skipUnless(os.environ.get("OCR_REAL_TESSERACT") == "1", "enable real OCR inside the service image")
    def test_real_german_english_tesseract(self):
        response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        self.assertIn("42.50", response.json()["text"])
        self.assertIn("INVOICE", response.json()["text"].upper())
        self.assertEqual(response.json()["warnings"], [])


if __name__ == "__main__":
    unittest.main()
