import React, { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import AudioRecorder from "./AudioRecorder";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));

class RecorderMock {
  static isTypeSupported = jest.fn(() => true);
  static instances = [];
  constructor(stream, options) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "audio/mp4";
    this.state = "inactive";
    RecorderMock.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

let streams;
let getUserMedia;
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  streams = [];
  getUserMedia = jest.fn(async () => {
    const stop = jest.fn();
    const stream = { getTracks: () => [{ stop }], stop };
    streams.push(stream);
    return stream;
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  window.MediaRecorder = RecorderMock;
  RecorderMock.instances = [];
  RecorderMock.isTypeSupported.mockImplementation(() => true);
});

afterEach(() => { delete window.MediaRecorder; });

test("idle rendering does not request microphone permission", () => {
  render(<AudioRecorder record={false} />);
  expect(getUserMedia).not.toHaveBeenCalled();
});

test("stopping delivers the existing blob contract exactly once and releases tracks", async () => {
  const onStop = jest.fn();
  const { rerender } = render(<AudioRecorder record onStop={onStop} />);
  await flush();
  expect(RecorderMock.instances[0].state).toBe("recording");
  rerender(<AudioRecorder record={false} onStop={onStop} />);
  expect(onStop).toHaveBeenCalledTimes(1);
  expect(onStop.mock.calls[0][0].blob).toBeInstanceOf(Blob);
  expect(onStop.mock.calls[0][0].blob.type).toBe("audio/webm");
  expect(streams[0].stop).toHaveBeenCalledTimes(1);
});

test("unmount releases microphone without submitting a recording", async () => {
  const onStop = jest.fn();
  const { unmount } = render(<AudioRecorder record onStop={onStop} />);
  await flush();
  unmount();
  expect(streams[0].stop).toHaveBeenCalledTimes(1);
  expect(onStop).not.toHaveBeenCalled();
});

test("permission denied is reported and never produces a blob", async () => {
  const error = new Error("Permission denied");
  getUserMedia.mockRejectedValueOnce(error);
  const onError = jest.fn();
  const onStop = jest.fn();
  render(<AudioRecorder record onError={onError} onStop={onStop} />);
  await flush();
  expect(onError).toHaveBeenCalledWith(error);
  expect(onStop).not.toHaveBeenCalled();
});

test("stopping before permission resolves releases the late stream", async () => {
  let resolve;
  getUserMedia.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const onStop = jest.fn();
  const { rerender } = render(<AudioRecorder record onStop={onStop} />);
  rerender(<AudioRecorder record={false} onStop={onStop} />);
  const stop = jest.fn();
  await act(async () => resolve({ getTracks: () => [{ stop }] }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(RecorderMock.instances).toHaveLength(0);
  expect(onStop).not.toHaveBeenCalled();
});

test("MP4-capable browsers use their supported format", async () => {
  RecorderMock.isTypeSupported.mockImplementation((type) => type === "audio/mp4");
  const onStop = jest.fn();
  const { rerender } = render(<AudioRecorder record onStop={onStop} />);
  await flush();
  rerender(<AudioRecorder record={false} onStop={onStop} />);
  expect(onStop.mock.calls[0][0].blob.type).toBe("audio/mp4");
});

test("recorder errors release tracks and suppress a partial transcription", async () => {
  const onError = jest.fn();
  const onStop = jest.fn();
  const { rerender } = render(<AudioRecorder record onError={onError} onStop={onStop} />);
  await flush();
  act(() => RecorderMock.instances[0].onerror({ error: new Error("Device lost") }));
  rerender(<AudioRecorder record={false} onError={onError} onStop={onStop} />);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onStop).not.toHaveBeenCalled();
  expect(streams[0].stop).toHaveBeenCalledTimes(1);
});

test("StrictMode does not leak its discarded permission request", async () => {
  const onStop = jest.fn();
  const { unmount } = render(<StrictMode><AudioRecorder record onStop={onStop} /></StrictMode>);
  await flush();
  expect(streams[0].stop).toHaveBeenCalledTimes(1);
  unmount();
  streams.forEach((stream) => expect(stream.stop).toHaveBeenCalledTimes(1));
  expect(onStop).not.toHaveBeenCalled();
});

test("updated callback props do not restart the current recording", async () => {
  const oldCallback = jest.fn();
  const nextCallback = jest.fn();
  const { rerender } = render(<AudioRecorder record onStop={oldCallback} />);
  await flush();
  rerender(<AudioRecorder record onStop={nextCallback} />);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  rerender(<AudioRecorder record={false} onStop={nextCallback} />);
  expect(oldCallback).not.toHaveBeenCalled();
  expect(nextCallback).toHaveBeenCalledTimes(1);
});


test("unsupported recording API reports an error before requesting a microphone", async () => {
  delete window.MediaRecorder;
  const onError = jest.fn();
  render(<AudioRecorder record onError={onError} />);
  await flush();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(getUserMedia).not.toHaveBeenCalled();
});

test("waveform resumes and closes its audio context and cancels animation", async () => {
  const drawing = { fillRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn() };
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(drawing);
  const requestFrame = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
  const cancelFrame = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const resume = jest.fn(() => Promise.resolve());
  const close = jest.fn(() => Promise.resolve());
  window.AudioContext = jest.fn(() => ({
    state: "suspended", resume, close,
    createAnalyser: () => ({ fftSize: 256, getByteTimeDomainData: (points) => points.fill(128) }),
    createMediaStreamSource: () => ({ connect: jest.fn() }),
  }));
  try {
    const { rerender } = render(<AudioRecorder record />);
    await flush();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(drawing.stroke).toHaveBeenCalled();
    rerender(<AudioRecorder record={false} />);
    expect(close).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(7);
  } finally {
    delete window.AudioContext;
    getContext.mockRestore(); requestFrame.mockRestore(); cancelFrame.mockRestore();
  }
});
