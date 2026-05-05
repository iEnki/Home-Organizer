import json
import os
import base64
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from ipaddress import ip_address, ip_network
from pathlib import Path
from urllib.parse import urlparse

import extruct
import requests
import tldextract
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from faster_whisper import WhisperModel
from w3lib.html import get_base_url

app = Flask(__name__)

TOKEN = os.getenv("RECIPE_PARSER_INTERNAL_TOKEN", "")
TMP_ROOT = Path(os.getenv("RECIPE_PARSER_TMP", "/tmp/recipe-parser"))
TMP_MAX_AGE_SECONDS = int(os.getenv("RECIPE_PARSER_TMP_MAX_AGE_SECONDS", "86400"))
MODEL_DIR = os.getenv("WHISPER_MODEL_DIR", "/models/whisper")
DEFAULT_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
CPU_COMPUTE = os.getenv("WHISPER_CPU_COMPUTE_TYPE", "int8")
GPU_COMPUTE = os.getenv("WHISPER_GPU_COMPUTE_TYPE", "float16")
WHISPER_CPP_FALLBACK = os.getenv("WHISPER_CPP_FALLBACK_ENABLED", "true").lower() == "true"
SOCIAL_DOMAINS = {"youtube.com", "youtu.be", "tiktok.com", "instagram.com"}
PRIVATE_NETS = [
    ip_network("10.0.0.0/8"),
    ip_network("127.0.0.0/8"),
    ip_network("169.254.0.0/16"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
    ip_network("::1/128"),
    ip_network("fc00::/7"),
    ip_network("fe80::/10"),
]

MODELS = {}


def cleanup_stale_tmp_dirs(max_age_seconds=TMP_MAX_AGE_SECONDS):
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - max_age_seconds
    removed = []
    for path in TMP_ROOT.iterdir():
        if not path.is_dir():
            continue
        try:
            if path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                removed.append(path.name)
        except OSError:
            continue
    return removed


cleanup_stale_tmp_dirs()


def require_token():
    if request.path.startswith("/health"):
        return None
    auth = request.headers.get("Authorization", "")
    if not TOKEN or auth != f"Bearer {TOKEN}":
        return jsonify({"error": "unauthorized"}), 401
    return None


app.before_request(require_token)


def run(cmd, cwd=None, timeout=None):
    proc = subprocess.run(cmd, cwd=cwd, timeout=timeout, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"Command failed: {cmd[0]}")
    return proc.stdout


def command_available(name):
    return shutil.which(name) is not None


def cuda_available():
    if os.getenv("CUDA_VISIBLE_DEVICES") == "":
        return False
    try:
        import ctranslate2
        return "cuda" in ctranslate2.get_supported_compute_types("cuda")
    except Exception:
        return command_available("nvidia-smi")


def select_device():
    if WHISPER_DEVICE != "auto":
        return WHISPER_DEVICE, GPU_COMPUTE if WHISPER_DEVICE == "cuda" else CPU_COMPUTE
    if cuda_available():
        return "cuda", GPU_COMPUTE
    return "cpu", CPU_COMPUTE


def get_model(model_name, device, compute_type):
    key = (model_name, device, compute_type)
    if key not in MODELS:
        MODELS[key] = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            download_root=MODEL_DIR,
        )
    return MODELS[key]


def is_private_host(hostname):
    if not hostname:
        return True
    lowered = hostname.lower()
    if lowered in {"localhost", "0.0.0.0"} or lowered.endswith(".local") or "." not in lowered:
        return True
    try:
        addr = ip_address(lowered)
        return any(addr in net for net in PRIVATE_NETS)
    except ValueError:
        pass
    try:
        for result in socket.getaddrinfo(hostname, None):
            addr = ip_address(result[4][0])
            if any(addr in net for net in PRIVATE_NETS):
                return True
    except Exception:
        return True
    return False


def validate_url(raw_url):
    parsed = urlparse(str(raw_url or "").strip())
    if parsed.scheme != "https":
        raise ValueError("Only HTTPS URLs are allowed.")
    if is_private_host(parsed.hostname):
        raise ValueError("Private or internal hosts are blocked.")
    return parsed.geturl()


def platform_from_url(raw_url):
    ext = tldextract.extract(raw_url)
    domain = ".".join(part for part in [ext.domain, ext.suffix] if part)
    if domain in {"youtube.com", "youtu.be"}:
        return "youtube"
    if domain == "tiktok.com":
        return "tiktok"
    if domain == "instagram.com":
        return "instagram"
    return "web"


def update_job(job_id, **fields):
    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key or not job_id:
        return
    try:
        requests.patch(
            f"{supabase_url.rstrip('/')}/rest/v1/home_rezept_import_jobs",
            params={"id": f"eq.{job_id}"},
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=fields,
            timeout=10,
        )
    except Exception:
        pass


def extract_web(raw_url):
    url = validate_url(raw_url)
    res = requests.get(url, timeout=20, headers={"User-Agent": "HomeOrganizerRecipeBot/1.0"})
    res.raise_for_status()
    final_url = validate_url(res.url)
    html = res.text
    base_url = get_base_url(html, final_url)
    soup = BeautifulSoup(html, "html.parser")
    data = extruct.extract(html, base_url=base_url, syntaxes=["json-ld", "microdata", "opengraph"], uniform=True)
    recipes = []
    for item in data.get("json-ld", []) + data.get("microdata", []):
        item_type = item.get("@type") or item.get("type")
        if isinstance(item_type, list):
            is_recipe = any(str(t).lower() == "recipe" for t in item_type)
        else:
            is_recipe = str(item_type).lower() == "recipe"
        if is_recipe:
            recipes.append(item)
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    meta_desc = ""
    tag = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if tag:
        meta_desc = tag.get("content", "")
    text = soup.get_text("\n", strip=True)
    return {
        "url": final_url,
        "title": title,
        "description": meta_desc,
        "recipes": recipes,
        "opengraph": data.get("opengraph", []),
        "text": text[:20000],
    }


def extract_metadata(raw_url):
    url = validate_url(raw_url)
    out = run([
        "yt-dlp",
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
        url,
    ], timeout=60)
    info = json.loads(out)
    return {
        "url": url,
        "platform": platform_from_url(url),
        "title": info.get("title"),
        "description": info.get("description"),
        "uploader": info.get("uploader") or info.get("channel"),
        "thumbnail_url": info.get("thumbnail"),
        "duration_seconds": info.get("duration"),
        "webpage_url": info.get("webpage_url"),
    }


def parse_subtitle_file(path):
    lines = []
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.isdigit() or "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        line = BeautifulSoup(line, "html.parser").get_text(" ", strip=True)
        if line:
            lines.append(line)
    deduped = []
    for line in lines:
        if not deduped or deduped[-1] != line:
            deduped.append(line)
    return " ".join(deduped).strip()


def extract_subtitles(raw_url, job_dir):
    url = validate_url(raw_url)
    output_template = str(job_dir / "subtitle.%(ext)s")
    try:
        run([
            "yt-dlp",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "de,en.*,en",
            "--convert-subs", "srt",
            "--no-playlist",
            "-o", output_template,
            url,
        ], timeout=90)
    except Exception as exc:
        return {"transcript": "", "warnings": [f"subtitles: {exc}"]}

    subtitle_files = sorted(list(job_dir.glob("subtitle*.srt")) + list(job_dir.glob("subtitle*.vtt")))
    parts = []
    for path in subtitle_files[:3]:
        text = parse_subtitle_file(path)
        if text:
            parts.append(text)
    return {
        "transcript": " ".join(parts).strip(),
        "files": [path.name for path in subtitle_files],
        "warnings": [] if parts else ["subtitles: no usable subtitle text found"],
    }


def download_audio(raw_url, job_dir, max_minutes):
    url = validate_url(raw_url)
    output_template = str(job_dir / "source.%(ext)s")
    run([
        "yt-dlp",
        "-f", "bestaudio/best",
        "--no-playlist",
        "--max-filesize", "500M",
        "-o", output_template,
        url,
    ], timeout=max(180, int(max_minutes) * 20))
    files = [p for p in job_dir.iterdir() if p.name.startswith("source.")]
    if not files:
        raise RuntimeError("yt-dlp did not produce a source file.")
    src = files[0]
    wav = job_dir / "audio.wav"
    run([
        "ffmpeg",
        "-y",
        "-i", str(src),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-t", str(int(max_minutes) * 60),
        str(wav),
    ], timeout=max(180, int(max_minutes) * 20))
    return wav


def transcribe_audio(audio_path, settings):
    model_name = settings.get("whisper_model") or DEFAULT_MODEL
    preferred_device, preferred_compute = select_device()
    attempts = [(preferred_device, preferred_compute)]
    if preferred_device == "cuda":
        attempts.append(("cpu", CPU_COMPUTE))
    warnings = []
    last_error = None
    for device, compute_type in attempts:
        try:
            model = get_model(model_name, device, compute_type)
            segments_iter, info = model.transcribe(str(audio_path), vad_filter=True, beam_size=5)
            segments = []
            transcript_parts = []
            for segment in segments_iter:
                text = segment.text.strip()
                if text:
                    transcript_parts.append(text)
                segments.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": text,
                })
            return {
                "transcript": " ".join(transcript_parts).strip(),
                "segments": segments,
                "detected_language": getattr(info, "language", None),
                "duration_seconds": getattr(info, "duration", None),
                "model": model_name,
                "device": device,
                "compute_type": compute_type,
                "engine": "faster-whisper",
                "transcription_fallback_used": device != preferred_device,
                "warnings": warnings,
            }
        except Exception as exc:
            last_error = exc
            warnings.append(f"faster-whisper {device}/{compute_type}: {exc}")
    if WHISPER_CPP_FALLBACK and command_available("whisper-cli"):
        # Placeholder for optional host-installed whisper.cpp support. We keep it
        # explicit so deployments can mount a prepared binary and model later.
        warnings.append("whisper.cpp fallback is enabled but no model command was configured.")
    raise RuntimeError("; ".join(warnings) or str(last_error))


def call_finalize(callback_url, payload):
    res = requests.post(
        callback_url,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=180,
    )
    if not res.ok:
        raise RuntimeError(res.text or f"Finalize HTTP {res.status_code}")


def call_openai_transcription_fallback(callback_url, job_id, audio_path, settings):
    if not settings.get("openai_transcription_fallback_enabled", True):
        raise RuntimeError("OpenAI transcription fallback is disabled.")
    fallback_url = callback_url.rsplit("/", 1)[0] + "/recipe-transcribe-fallback"
    mp3_path = Path(audio_path).with_suffix(".fallback.mp3")
    run([
        "ffmpeg",
        "-y",
        "-i", str(audio_path),
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "48k",
        str(mp3_path),
    ], timeout=180)
    raw = mp3_path.read_bytes()
    if len(raw) > 24 * 1024 * 1024:
        raise RuntimeError("Compressed fallback audio is larger than 24 MB.")
    res = requests.post(
        fallback_url,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        json={
            "job_id": job_id,
            "filename": "audio.mp3",
            "content_type": "audio/mpeg",
            "audio_base64": base64.b64encode(raw).decode("ascii"),
        },
        timeout=120,
    )
    if not res.ok:
        raise RuntimeError(res.text or f"Transcription fallback HTTP {res.status_code}")
    data = res.json()
    return {
        "transcript": data.get("transcript", ""),
        "segments": [],
        "detected_language": data.get("detected_language"),
        "duration_seconds": None,
        "model": data.get("model"),
        "device": "cloud",
        "compute_type": None,
        "engine": "openai",
        "transcription_fallback_used": True,
        "warnings": ["Lokaler Whisper-Fallback fehlgeschlagen; OpenAI Audio Transcription wurde genutzt."],
    }


def process_job(payload):
    job_id = payload["job_id"]
    mode = payload.get("mode", "combined")
    url = payload["url"]
    settings = payload.get("settings") or {}
    max_minutes = int(settings.get("max_video_minutes") or 30)
    job_dir = TMP_ROOT / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "job_id": job_id,
        "source": {},
        "web_extract": None,
        "transcript": "",
        "transcription_warnings": [],
    }
    try:
        platform = platform_from_url(url)
        if mode in {"web", "combined"} and platform == "web":
            update_job(job_id, status="web_extract", progress=18, progress_message="Rezeptseite wird gelesen.")
            result["web_extract"] = extract_web(url)

        if platform != "web" or mode in {"metadata", "transcript", "combined"}:
            update_job(job_id, status="metadata", progress=25, progress_message="Metadaten werden gelesen.")
            try:
                result["source"] = extract_metadata(url)
                duration = result["source"].get("duration_seconds") or 0
                if duration and duration > max_minutes * 60:
                    raise RuntimeError(f"Video is longer than the configured limit of {max_minutes} minutes.")
            except Exception as exc:
                if platform == "web":
                    result["transcription_warnings"].append(f"metadata: {exc}")
                else:
                    raise

        if mode in {"transcript", "combined"} and platform != "web":
            update_job(job_id, status="metadata", progress=32, progress_message="Untertitel werden gelesen.")
            subtitles = extract_subtitles(url, job_dir)
            result["caption_transcript"] = subtitles.get("transcript", "")
            result["caption_files"] = subtitles.get("files", [])
            result["transcription_warnings"].extend(subtitles.get("warnings", []))

        if mode in {"transcript", "combined"} and platform != "web":
            update_job(job_id, status="download", progress=38, progress_message="Audio wird heruntergeladen.")
            audio = download_audio(url, job_dir, max_minutes)
            update_job(job_id, status="transcribe", progress=58, progress_message="Lokale Transkription wird ausgefuehrt.")
            try:
                transcription = transcribe_audio(audio, settings)
            except Exception as local_exc:
                update_job(job_id, status="fallback_transcribe", progress=64, progress_message="Cloud-Transkriptionsfallback wird ausgefuehrt.")
                transcription = call_openai_transcription_fallback(payload["callback_url"], job_id, audio, settings)
                transcription["warnings"].insert(0, f"Lokale Transkription fehlgeschlagen: {local_exc}")
            result.update({
                "transcript": transcription["transcript"],
                "segments": transcription["segments"],
                "detected_language": transcription["detected_language"],
                "duration_seconds": transcription["duration_seconds"],
                "transcription_engine": transcription["engine"],
                "transcription_model": transcription["model"],
                "transcription_device": transcription["device"],
                "transcription_compute_type": transcription["compute_type"],
                "transcription_fallback_used": transcription["transcription_fallback_used"],
                "transcription_warnings": transcription["warnings"],
            })

        update_job(job_id, status="ai_extract", progress=78, progress_message="Rezeptanalyse wird vorbereitet.")
        call_finalize(payload["callback_url"], result)
    except Exception as exc:
        update_job(
            job_id,
            status="failed",
            progress=100,
            progress_message="Import fehlgeschlagen.",
            error_message=str(exc),
        )
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


@app.get("/health")
def health():
    deep = request.args.get("deep") == "1"
    data = {
        "status": "ok",
        "service": "recipe-source-parser",
        "ffmpeg": command_available("ffmpeg"),
        "yt_dlp": command_available("yt-dlp"),
    }
    if deep:
        device, compute_type = select_device()
        data.update({
            "cuda_available": cuda_available(),
            "selected_device": device,
            "selected_compute_type": compute_type,
            "whisper_model": DEFAULT_MODEL,
            "whisper_cpp_available": command_available("whisper-cli"),
        })
    return jsonify(data)


@app.post("/jobs")
def jobs():
    payload = request.get_json(force=True, silent=True) or {}
    if not payload.get("job_id") or not payload.get("url") or not payload.get("callback_url"):
        return jsonify({"error": "job_id, url and callback_url are required"}), 400
    thread = threading.Thread(target=process_job, args=(payload,), daemon=True)
    thread.start()
    return jsonify({"status": "queued", "job_id": payload["job_id"]})


@app.get("/jobs/<job_id>")
def job_status(job_id):
    return jsonify({"job_id": job_id, "status": "delegated_to_supabase"})
