FROM python:3.15.2-slim-trixie AS dependencies

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-deu \
      tesseract-ocr-eng \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

# The optional test target runs generated-data contracts with real Tesseract.
# The last stage remains the production image used by existing Compose builds.
FROM dependencies AS test
COPY requirements-test.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements-test.txt
COPY server.py test_service_contract.py ./
CMD ["python", "-m", "unittest", "discover", "-s", ".", "-p", "test_service_contract.py", "-v"]

FROM dependencies AS runtime
COPY server.py .

EXPOSE 8091

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8091"]
