import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

function microphoneStream(t) {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  if (legacy) return new Promise((resolve, reject) => legacy.call(navigator, { audio: true }, resolve, reject));
  return Promise.reject(new Error(t("audioRecorder.unsupportedMicrophone")));
}

/** Local replacement for the React-16-only recorder; existing blob callback stays. */
export default function AudioRecorder({
  record = false,
  onStop,
  onError,
  className,
  mimeType = "audio/webm",
  strokeColor = "#60A5FA",
  backgroundColor = "#374151",
}) {
  const { t } = useTranslation("assistant");
  const canvasRef = useRef(null);
  const callbacks = useRef({ onStop, onError, t });
  const mounted = useRef(false);
  const generation = useRef(0);
  callbacks.current = { onStop, onError, t };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!record) return undefined;
    const current = ++generation.current;
    let cancelled = false;
    let stream;
    let recorder;
    let context;
    let frame;
    let released = false;
    let failed = false;
    const chunks = [];
    const startTime = Date.now();
    const reportError = (error) => {
      if (mounted.current && current === generation.current && !cancelled) callbacks.current.onError?.(error);
    };
    const release = () => {
      if (released) return;
      released = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") context.close().catch(() => {});
    };
    const start = async () => {
      try {
        if (!window.MediaRecorder) throw new Error(callbacks.current.t("audioRecorder.unsupportedRecording"));
        stream = await microphoneStream(callbacks.current.t);
        if (cancelled || !mounted.current || current !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const options = [mimeType, "audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
        const selected = options.find((type) => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(type));
        try {
          recorder = new MediaRecorder(stream, selected ? { mimeType: selected } : undefined);
        } catch {
          recorder = new MediaRecorder(stream);
        }
        recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
        recorder.onerror = (event) => { failed = true; reportError(event.error || new Error(callbacks.current.t("audioRecorder.recordingFailed"))); release(); };
        recorder.onstop = () => {
          release();
          if (failed || !mounted.current || current !== generation.current) return;
          const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || selected || "audio/webm" });
          if (!blob.size) return;
          callbacks.current.onStop?.({ blob, startTime, stopTime: Date.now(), options: { mimeType: blob.type } });
        };
        recorder.start();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          // Waveform failure must not discard an otherwise usable recording.
          try {
            context = new AudioContext();
            if (context.state === "suspended") context.resume().catch(() => {});
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            context.createMediaStreamSource(stream).connect(analyser);
            const points = new Uint8Array(analyser.fftSize);
            const canvas = canvasRef.current;
            const drawing = canvas?.getContext("2d");
            const paint = () => {
              if (cancelled || !drawing || !canvas) return;
              analyser.getByteTimeDomainData(points);
              drawing.fillStyle = backgroundColor;
              drawing.fillRect(0, 0, canvas.width, canvas.height);
              drawing.strokeStyle = strokeColor;
              drawing.lineWidth = 2;
              drawing.beginPath();
              points.forEach((value, index) => {
                const x = (index / (points.length - 1)) * canvas.width;
                const y = (value / 255) * canvas.height;
                if (index === 0) drawing.moveTo(x, y); else drawing.lineTo(x, y);
              });
              drawing.stroke();
              frame = requestAnimationFrame(paint);
            };
            paint();
          } catch { /* Recording continues without the optional canvas. */ }
        }
      } catch (error) {
        reportError(error);
        release();
      }
    };
    start();
    return () => {
      cancelled = true;
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* Track cleanup below is still required. */ }
      }
      release();
    };
  }, [record, mimeType, strokeColor, backgroundColor]);

  return <canvas ref={canvasRef} width={640} height={80} className={className} aria-hidden="true" />;
}
