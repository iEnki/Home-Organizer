# Keep the accepted CUDA12/cuDNN9 driver family; upgrade Python independently.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS python-build
ARG PYTHON_VERSION=3.14.10
ARG PYTHON_SOURCE_SHA256=de414a57119abef52784d8993e341d53aed635fc2b05c2607d9f98a2c5b72032
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl ca-certificates xz-utils libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev uuid-dev \
    && curl -fsSLo /tmp/python.tar.xz "https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tar.xz" \
    && echo "${PYTHON_SOURCE_SHA256}  /tmp/python.tar.xz" | sha256sum -c - \
    && mkdir /tmp/python-source && tar -xJf /tmp/python.tar.xz -C /tmp/python-source --strip-components=1 \
    && cd /tmp/python-source && ./configure --prefix=/opt/python --with-ensurepip=install \
    && make -j2 && make install \
    && rm -rf /opt/python/lib/python3.14/test

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates libssl3 zlib1g libbz2-1.0 libreadline8 libsqlite3-0 libffi8 liblzma5 libuuid1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=python-build /opt/python /opt/python
ENV PATH="/opt/python/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir --require-hashes -r requirements.txt
ENV PORT=8090 WHISPER_DEVICE=auto WHISPER_MODEL=small WHISPER_CPU_COMPUTE_TYPE=int8 WHISPER_GPU_COMPUTE_TYPE=auto WHISPER_MODEL_DIR=/models/whisper

FROM dependencies AS test
COPY server.py test_recipe_images.py test_runtime_contract.py ./
CMD ["python3", "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py", "-v"]

FROM dependencies AS runtime
COPY server.py .
EXPOSE 8090
CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:8090", "server:app"]
