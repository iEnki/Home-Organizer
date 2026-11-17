# Recipe parser and local transcription service

The existing health, job, image-persistence and callback endpoints, token,
limits and storage/model volumes remain unchanged. CPU int8 and CUDA float16,
model selection, subtitle-first extraction and the existing CPU/provider
fallback flow remain available.

## Runtime and dependencies

The image retains the accepted CUDA12.4.1/cuDNN9 Ubuntu22.04 family so the GPU
driver requirement is not silently raised. Python3.14.10 is built in a separate
stage from its SHA256-checked official source. ONNX Runtime's current wheels do
not support Python3.15 yet. The final image excludes compiler/source files.
FFmpeg and native OS libraries receive the distribution's supported updates;
this is not a claim to use a different FFmpeg/CUDA major version.

`requirements.in` records the reviewed direct versions; the generated universal
`requirements.txt` pins the complete Python graph with distribution hashes.
PyAV18.1.0 is explicitly retained: PyAV19 removed the metadata_errors argument
used by current faster-whisper. A real generated-audio decode and CPU model
test verified the compatible version. This is a tested API constraint, not an
unexplained stale version.

No model weights or personal data are embedded in the image. First use of an
uncached public Whisper model can still download it to the existing model volume.

The previous GPU capability check incorrectly looked for the device name
`cuda` in the set of supported compute types. Checking that set for nonemptiness
also proved unreliable on CPU hosts because capability results can be cached.
It now queries `get_cuda_device_count() > 0`; only exceptions use the existing
legacy probe. Repeated deep-health/device checks with no visible device remain
on CPU. CPU fallback and explicit device settings are preserved. Physical
GPU execution must be verified separately when suitable hardware is available.

GPU compute type: `WHISPER_GPU_COMPUTE_TYPE=auto` (default) picks the first type the
CUDA device supports from `float16`, `int8_float16`, `int8_float32`, `int8`.
Pascal cards (GTX 10xx) offer no `float16` and therefore run on the GPU with
`int8_float32` instead of falling back to the CPU. An explicitly configured
type is still tried first; if the device does not support it, a warning names
the supported types and the auto-selected GPU type is tried before the CPU.
`/health?deep=1` reports the setting, the selected type and the device's
supported types. Verified on a GTX 1080 (CTranslate2 4.9.0) in HOME-30/HOME-31.

## Build and offline generated-data checks

```sh
docker compose -f docker-compose.full.yml build recipe-source-parser
docker build --target test -t recipe-contract-test services/recipe-source-parser
docker run --rm --network none recipe-contract-test
```

The test image exercises the actual parser libraries, HTTP/auth/job contracts,
image helpers and GPU-selection/CPU-fallback logic with generated data. Linux
also starts the real Gunicorn server; only that test is skipped on Windows.
The social-thumbnail fixture mocks DNS as well as the downloader so this suite
does not depend on external DNS. Model-based inference is skipped by default. Enable
RECIPE_REAL_WHISPER=1 with a public tiny model cached in the existing model
directory to run the additional real CPU test. Local Windows execution skips
only Gunicorn and that opt-in model test (16 passed/2 skipped); Linux can run
all18 tests when the model test is enabled. Acceptance must also
include real FFmpeg/audio loading and CPU inference with a public cached model,
plus GPU execution or an explicit open hardware limitation.

The CPython standard-library test suite is removed from the copied interpreter;
runtime modules and the optional application test stage remain available.
The default final stage remains `runtime`. Production keeps one Gunicorn worker
and four threads, port8090, existing environment names and the existing volumes.
Update menus [1]/[4]/[5] rebuild local images with Docker's normal cache.

To change Python packages, regenerate using reviewed uv0.13.8:

```sh
uv pip compile services/recipe-source-parser/requirements.in --universal --python-version 3.14 --generate-hashes --no-emit-index-url -o services/recipe-source-parser/requirements.txt
```

Save the previous service image, matching configuration, code and data before
updates. Return to those exact images/configuration without rebuilding for rollback.
