import type { HermesAudioMetrics } from "@/lib/types";

type MonitorCleanup = () => Promise<void>;

const MIN_DECIBELS = -60;

export async function startAudioMonitor(
  deviceId: string | undefined,
  onMetrics: (metrics: HermesAudioMetrics) => void,
): Promise<MonitorCleanup> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  });

  const AudioContextRef = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextRef();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let frame = 0;

  const update = () => {
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    let peak = 0;

    for (const sample of buffer) {
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const db = rms > 0 ? Math.max(MIN_DECIBELS, 20 * Math.log10(rms)) : MIN_DECIBELS;

    onMetrics({
      rms,
      peak,
      db,
      clipping: peak >= 0.98,
      source: "webAudio",
      updatedAt: new Date().toISOString(),
    });

    frame = window.requestAnimationFrame(update);
  };

  frame = window.requestAnimationFrame(update);

  return async () => {
    window.cancelAnimationFrame(frame);
    source.disconnect();
    analyser.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
  };
}
