# Document OCR service

Internal PDF-to-text service used by the existing document and invoice flows.
The HTTP routes, bearer token, request limits, language order and response fields
remain unchanged. No AI/provider call, database access or new storage destination
is introduced by the dependency update.

## Runtime

The production image uses `python:3.15.2-slim-trixie`, with the distribution's
Tesseract and German/English language data. Direct Python versions are recorded
in `requirements.in`. `requirements.txt` also pins transitive dependencies with
SHA256 hashes. Its universal resolution preserves platform markers, including
uvloop's exclusion on Windows. Runtime installation requires the hashes.

The original endpoints remain:

- `GET /health`: public health response.
- `POST /ocr/pdf`: existing `Authorization: Bearer ...` using
  `DOCUMENT_OCR_INTERNAL_TOKEN`; JSON fields `file_base64`, `max_pages`
  (default5, range1–20) and `languages` (defaultGerman/English).
- Results retain `text`, `page_count`, `processed_pages`, `truncated`, `pages`
  and `warnings`. Page rendering remains at2x and Tesseract uses `--psm 6`.

## Build and check

From the repository root, the existing fullstack service builds normally:

```sh
docker compose -f docker-compose.full.yml build document-ocr-service
```

The default final Docker stage is `runtime`; it excludes test-only dependencies
and fixtures. An optional `test` target checks generated PDFs, real PDFium/Pillow
rasterization, authentication, validation, language selection, partial failures,
page limits and an actual Uvicorn HTTP startup. Enable the additional real
Tesseract test in the isolated test image:

```sh
docker build --target test -t home-ocr-contract-test services/document-ocr-service
docker run --rm --network none -e OCR_REAL_TESSERACT=1 home-ocr-contract-test
```

All13 checks should pass in that Linux image. Without the environment flag,
12 pass and the real OCR check is explicitly skipped. No personal files, API
keys or external network access are used by these tests. The HTTP test binds
only to loopback and terminates its own child process.

For local checks, use a separate Python3.15 environment:

```sh
python -m pip install --require-hashes -r services/document-ocr-service/requirements-test.txt
python -m unittest discover -s services/document-ocr-service -p test_service_contract.py -v
```

The current Starlette test helper warns that its httpx adapter is deprecated;
this is confined to the test image. The actual Uvicorn HTTP check also runs.

## Maintain pinned dependencies

Edit the `.in` files, then regenerate both locks together (reviewed tool:uv0.13.8):

```sh
uv pip compile services/document-ocr-service/requirements.in --universal --python-version 3.15 --generate-hashes --no-emit-index-url --output-file services/document-ocr-service/requirements.txt
uv pip compile services/document-ocr-service/requirements-test.in --universal --python-version 3.15 --generate-hashes --no-emit-index-url --output-file services/document-ocr-service/requirements-test.txt
```

Re-run the contracts and real Docker/OCR checks. Record actual image digests,
Python/Tesseract/language-package versions and image rollback in the release
acceptance. Save the previous service image and matching source/configuration
before replacing it. Existing data and token values must be retained.

A service source update requires its image to be rebuilt; `compose up` alone
can reuse the existing image. Update menu options [1], [4] and [5] now build the
app and configured local service images before replacing containers, using the
normal Docker cache. Local service activation waits for their healthchecks.
Option [2] remains an app-only rebuild. HOME-24 records the separate real
management-flow acceptance; the targeted build above remains useful for an
isolated service check. Save previous images and matching configuration before
updates; runtime startup failures are reported but are not automatically rolled back.


The fullstack Compose definition checks the local `/health` endpoint using the
image's existing Python interpreter. It requires HTTP200 and JSON `status: ok`,
with a30-second startup grace period. Merely starting a container is not proof
of readiness; an immediate exit/restart loop must fail the management update.
Adding this healthcheck changes the container configuration once, so the first
activation recreates it even when the image itself is unchanged.
