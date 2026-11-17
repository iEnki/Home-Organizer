"""Generated/offline parser contracts; actual native libraries, no model download."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import server

class RuntimeContracts(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()
        self.token = patch.object(server, "TOKEN", "generated-token")
        self.token.start()
        self.addCleanup(self.token.stop)

    def test_health_and_auth_contract(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json["status"], "ok")
        self.assertTrue(health.json["recipe_images"])
        self.assertEqual(self.client.get("/jobs/generated").status_code, 401)
        response = self.client.get("/jobs/generated", headers={"Authorization": "Bearer generated-token"})
        self.assertEqual(response.json, {"job_id": "generated", "status": "delegated_to_supabase"})

    @patch.object(server.threading, "Thread")
    def test_job_validation_and_queue_keep_payload(self, thread):
        headers = {"Authorization": "Bearer generated-token"}
        self.assertEqual(self.client.post("/jobs", json={}, headers=headers).status_code, 400)
        payload = {"job_id": "generated", "url": "https://recipe.example.test/one", "callback_url": "https://api.example.test/finalize"}
        response = self.client.post("/jobs", json=payload, headers=headers)
        self.assertEqual(response.json, {"status": "queued", "job_id": "generated"})
        self.assertEqual(thread.call_args.kwargs["args"], (payload,))
        thread.return_value.start.assert_called_once()

    @patch.object(server, "validate_url", side_effect=lambda value: value)
    @patch.object(server.requests, "get")
    def test_actual_web_parsing_preserves_recipe_metadata(self, get, _validate):
        html = '<html><head><title>Generated recipe</title><meta name="description" content="Generated description"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Generated Soup","recipeIngredient":["2 carrots"]}</script></head><body>Generated instructions</body></html>'
        get.return_value = SimpleNamespace(url="https://recipe.example.test/one", text=html, raise_for_status=lambda: None)
        result = server.extract_web("https://recipe.example.test/one")
        self.assertEqual(result["title"], "Generated recipe")
        self.assertEqual(result["description"], "Generated description")
        self.assertEqual(result["recipes"][0]["name"], "Generated Soup")
        self.assertEqual(result["recipes"][0]["recipeIngredient"], ["2 carrots"])
        if os.environ.get("RECIPE_CONTRACT_OUTPUT"):
            Path(os.environ["RECIPE_CONTRACT_OUTPUT"]).write_text(json.dumps(result, sort_keys=True), encoding="utf-8")

    def test_private_urls_remain_rejected(self):
        for url in ["file:///generated", "http://127.0.0.1/generated", "http://localhost/generated"]:
            with self.subTest(url=url), self.assertRaises(Exception):
                server.validate_url(url)

    @patch.object(server, "cuda_available", return_value=False)
    def test_cpu_selection(self, _cuda):
        with patch.object(server, "WHISPER_DEVICE", "auto"):
            self.assertEqual(server.select_device(), ("cpu", server.CPU_COMPUTE))

    def test_cuda_selection_requires_a_visible_device(self):
        import ctranslate2
        with patch.dict(os.environ, {"CUDA_VISIBLE_DEVICES": "0"}), patch.object(ctranslate2, "get_cuda_device_count", return_value=1):
            self.assertTrue(server.cuda_available())

    def test_cpu_host_stays_cpu_despite_cached_cuda_compute_types(self):
        import ctranslate2
        # On a CPU-only host the capability API may first throw, then return
        # {'float32'}. A nonempty compute-type set does not prove a device exists.
        with patch.dict(os.environ, {"CUDA_VISIBLE_DEVICES": "0"}), \
                patch.object(ctranslate2, "get_cuda_device_count", return_value=0), \
                patch.object(ctranslate2, "get_supported_compute_types", side_effect=[RuntimeError("no CUDA driver"), {"float32"}, {"float32"}]) as capabilities, \
                patch.object(server, "command_available", return_value=True) as commands, \
                patch.object(server, "WHISPER_DEVICE", "auto"):
            for _ in range(3):
                response = self.client.get("/health?deep=1")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["selected_device"], "cpu")
                self.assertFalse(response.json["cuda_available"])
                self.assertEqual(server.select_device(), ("cpu", server.CPU_COMPUTE))
            capabilities.assert_not_called()
            self.assertNotIn(unittest.mock.call("nvidia-smi"), commands.call_args_list)

    def test_device_query_exception_preserves_legacy_probe(self):
        import ctranslate2
        with patch.dict(os.environ, {"CUDA_VISIBLE_DEVICES": "0"}), \
                patch.object(ctranslate2, "get_cuda_device_count", side_effect=RuntimeError("query unavailable")):
            for probe in [False, True]:
                with patch.object(server, "command_available", return_value=probe) as available:
                    self.assertEqual(server.cuda_available(), probe)
                    available.assert_called_once_with("nvidia-smi")

    def test_explicit_gpu_disable_remains_cpu(self):
        with patch.dict(os.environ, {"CUDA_VISIBLE_DEVICES": ""}):
            self.assertFalse(server.cuda_available())

    @patch.object(server, "cuda_available", return_value=True)
    @patch.object(server, "get_model")
    def test_gpu_failure_retains_cpu_fallback_and_transcript(self, get_model, _cuda):
        model = Mock()
        model.transcribe.return_value = (iter([SimpleNamespace(start=0.0, end=1.0, text=" Generated speech ")]), SimpleNamespace(language="en", duration=1.0))
        get_model.side_effect = [RuntimeError("generated GPU failure"), model]
        with patch.object(server, "WHISPER_DEVICE", "auto"), patch.object(server, "cuda_compute_types", return_value=None):
            result = server.transcribe_audio(Path("generated.wav"), {"whisper_model": "tiny"})
        self.assertEqual(result["transcript"], "Generated speech")
        self.assertEqual(result["segments"], [{"start": 0.0, "end": 1.0, "text": "Generated speech"}])
        self.assertEqual(result["device"], "cpu")
        self.assertTrue(result["transcription_fallback_used"])
        self.assertEqual(get_model.call_args_list[0].args[1], "cuda")
        self.assertEqual(get_model.call_args_list[1].args[1], "cpu")

    # HOME-31: GPU compute type follows the card's capabilities.
    PASCAL_TYPES = {"float32", "int8", "int8_float32"}

    def _generated_model(self):
        model = Mock()
        model.transcribe.return_value = (iter([SimpleNamespace(start=0.0, end=1.0, text=" Generated speech ")]), SimpleNamespace(language="en", duration=1.0))
        return model

    @patch.object(server, "cuda_available", return_value=True)
    def test_auto_gpu_compute_uses_int8_float32_on_pascal(self, _cuda):
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "auto"),                 patch.object(server, "cuda_compute_types", return_value=self.PASCAL_TYPES):
            self.assertEqual(server.select_device(), ("cuda", "int8_float32"))
            self.assertEqual(server.transcription_attempts(), ([("cuda", "int8_float32"), ("cpu", server.CPU_COMPUTE)], []))

    @patch.object(server, "cuda_available", return_value=True)
    def test_auto_gpu_compute_prefers_float16_when_supported(self, _cuda):
        supported = {"float16", "float32", "int8", "int8_float16", "int8_float32", "bfloat16"}
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "auto"),                 patch.object(server, "cuda_compute_types", return_value=supported):
            self.assertEqual(server.select_device(), ("cuda", "float16"))
        self.assertEqual(server.auto_gpu_compute({"int8_float16", "int8"}), "int8_float16")
        self.assertEqual(server.auto_gpu_compute({"float32"}), "float32")
        self.assertEqual(server.auto_gpu_compute(None), "float16")

    def test_explicit_cuda_device_uses_auto_compute_type(self):
        with patch.object(server, "WHISPER_DEVICE", "cuda"),                 patch.object(server, "GPU_COMPUTE", "AUTO"),                 patch.object(server, "cuda_compute_types", return_value=self.PASCAL_TYPES):
            self.assertEqual(server.select_device(), ("cuda", "int8_float32"))

    @patch.object(server, "cuda_available", return_value=True)
    def test_explicit_supported_gpu_compute_is_respected(self, _cuda):
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "int8"),                 patch.object(server, "cuda_compute_types", return_value=self.PASCAL_TYPES):
            self.assertEqual(server.transcription_attempts(), ([("cuda", "int8"), ("cpu", server.CPU_COMPUTE)], []))

    @patch.object(server, "cuda_available", return_value=True)
    @patch.object(server, "get_model")
    def test_explicit_unsupported_gpu_compute_is_tried_reported_and_stays_on_gpu(self, get_model, _cuda):
        get_model.side_effect = [ValueError("generated: float16 unsupported"), self._generated_model()]
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "float16"),                 patch.object(server, "cuda_compute_types", return_value=self.PASCAL_TYPES):
            result = server.transcribe_audio(Path("generated.wav"), {"whisper_model": "tiny"})
        self.assertEqual([c.args[1:] for c in get_model.call_args_list], [("cuda", "float16"), ("cuda", "int8_float32")])
        self.assertEqual((result["device"], result["compute_type"]), ("cuda", "int8_float32"))
        self.assertTrue(result["transcription_fallback_used"])
        self.assertIn("WHISPER_GPU_COMPUTE_TYPE=float16 is not supported by this GPU", result["warnings"][0])
        self.assertIn("int8_float32", result["warnings"][0])
        self.assertTrue(result["warnings"][1].startswith("faster-whisper cuda/float16:"))

    @patch.object(server, "cuda_available", return_value=True)
    @patch.object(server, "get_model")
    def test_unknown_gpu_capabilities_keep_previous_attempts(self, get_model, _cuda):
        get_model.side_effect = [RuntimeError("generated GPU failure"), self._generated_model()]
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "float16"),                 patch.object(server, "cuda_compute_types", return_value=None):
            result = server.transcribe_audio(Path("generated.wav"), {"whisper_model": "tiny"})
        self.assertEqual([c.args[1:] for c in get_model.call_args_list], [("cuda", "float16"), ("cpu", server.CPU_COMPUTE)])
        self.assertEqual(result["device"], "cpu")

    @patch.object(server, "cuda_available", return_value=False)
    def test_cpu_result_reports_no_fallback(self, _cuda):
        with patch.object(server, "WHISPER_DEVICE", "auto"), patch.object(server, "get_model", return_value=self._generated_model()):
            result = server.transcribe_audio(Path("generated.wav"), {"whisper_model": "tiny"})
        self.assertEqual((result["device"], result["compute_type"]), ("cpu", server.CPU_COMPUTE))
        self.assertFalse(result["transcription_fallback_used"])

    @patch.object(server, "cuda_available", return_value=True)
    def test_deep_health_lists_supported_gpu_compute_types(self, _cuda):
        with patch.object(server, "WHISPER_DEVICE", "auto"),                 patch.object(server, "GPU_COMPUTE", "auto"),                 patch.object(server, "cuda_compute_types", return_value=self.PASCAL_TYPES):
            response = self.client.get("/health?deep=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["selected_device"], "cuda")
        self.assertEqual(response.json["selected_compute_type"], "int8_float32")
        self.assertEqual(response.json["gpu_compute_type_setting"], "auto")
        self.assertEqual(response.json["cuda_compute_types"], ["float32", "int8", "int8_float32"])


    def test_real_audio_decode_keeps_whisper_pyav_contract(self):
        import io
        import wave
        from faster_whisper.audio import decode_audio
        audio = io.BytesIO()
        with wave.open(audio, "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(16000)
            stream.writeframes(b"\0\0" * 16000)
        audio.seek(0)
        decoded = decode_audio(audio)
        self.assertEqual(len(decoded), 16000)
        self.assertFalse(decoded.any())

    @unittest.skipUnless(os.environ.get("RECIPE_REAL_WHISPER") == "1", "enable real public-model CPU inference explicitly")
    def test_real_cpu_model_on_generated_audio(self):
        import wave
        with tempfile.TemporaryDirectory(prefix="generated-whisper-") as folder:
            audio = Path(folder) / "silence.wav"
            with wave.open(str(audio), "wb") as stream:
                stream.setnchannels(1)
                stream.setsampwidth(2)
                stream.setframerate(16000)
                stream.writeframes(b"\0\0" * 16000)
            with patch.object(server, "WHISPER_DEVICE", "cpu"):
                result = server.transcribe_audio(audio, {"whisper_model": "tiny"})
            self.assertEqual(result["device"], "cpu")
            self.assertEqual(result["engine"], "faster-whisper")
            self.assertTrue(0.9 <= result["duration_seconds"] <= 1.1)
            if os.environ.get("RECIPE_INFERENCE_OUTPUT"):
                Path(os.environ["RECIPE_INFERENCE_OUTPUT"]).write_text(json.dumps(result, indent=2), encoding="utf-8")

    @unittest.skipIf(os.name == "nt", "Gunicorn production startup requires Linux")
    def test_gunicorn_serves_existing_health_endpoint(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen([sys.executable, "-m", "gunicorn", "-w", "1", "--threads", "4", "-b", "127.0.0.1:%d" % port, "server:app"], cwd=Path(__file__).parent, stdout=log, stderr=log)
            try:
                ready = False
                for _ in range(200):
                    if process.poll() is not None:
                        break
                    try:
                        with urllib.request.urlopen("http://127.0.0.1:%d/health" % port, timeout=0.2) as response:
                            self.assertEqual(json.load(response)["status"], "ok")
                        ready = True
                        break
                    except OSError:
                        time.sleep(0.1)
                log.seek(0)
                self.assertTrue(ready, log.read().decode(errors="replace"))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
