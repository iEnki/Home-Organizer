FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8090
ENV WHISPER_DEVICE=auto
ENV WHISPER_MODEL=small
ENV WHISPER_CPU_COMPUTE_TYPE=int8
ENV WHISPER_GPU_COMPUTE_TYPE=float16
ENV WHISPER_MODEL_DIR=/models/whisper

EXPOSE 8090

CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:8090", "server:app"]
