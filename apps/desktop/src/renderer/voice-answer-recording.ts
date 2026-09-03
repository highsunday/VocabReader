import {
  VOICE_TRANSCRIPTION_MAX_DURATION_MS,
  VOICE_TRANSCRIPTION_NO_SPEECH_MS,
  VOICE_TRANSCRIPTION_SILENCE_MS,
  voiceTranscriptionMimeTypes
} from "../shared/voice-transcription-contracts";

const VOICE_THRESHOLD = 0.08;

export interface VoiceAnswerActivity {
  startedAt: number;
  speechStarted: boolean;
  lastVoiceAt: number | null;
  outcome: "listening" | "complete" | "no-speech";
}

export interface VoiceAnswerRecordingSession {
  stop(save: boolean): void;
}

export interface CapturedVoiceAnswer {
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
}

export function createVoiceAnswerActivity(now: number): VoiceAnswerActivity {
  return {
    startedAt: now,
    speechStarted: false,
    lastVoiceAt: null,
    outcome: "listening"
  };
}

export function advanceVoiceAnswerActivity(
  previous: VoiceAnswerActivity,
  sample: { now: number; level: number }
): VoiceAnswerActivity {
  if (previous.outcome !== "listening") return previous;
  const voice = sample.level >= VOICE_THRESHOLD;
  const speechStarted = previous.speechStarted || voice;
  const lastVoiceAt = voice ? sample.now : previous.lastVoiceAt;
  let outcome: VoiceAnswerActivity["outcome"] = "listening";
  if (!speechStarted &&
    sample.now - previous.startedAt >= VOICE_TRANSCRIPTION_NO_SPEECH_MS) {
    outcome = "no-speech";
  } else if (speechStarted && (
    (lastVoiceAt !== null &&
      sample.now - lastVoiceAt >= VOICE_TRANSCRIPTION_SILENCE_MS) ||
    sample.now - previous.startedAt >= VOICE_TRANSCRIPTION_MAX_DURATION_MS
  )) {
    outcome = "complete";
  }
  return { ...previous, speechStarted, lastVoiceAt, outcome };
}

export function supportedVoiceAnswerMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return voiceTranscriptionMimeTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  );
}

export async function captureVoiceAnswer(
  onSession: (session: VoiceAnswerRecordingSession | undefined) => void
): Promise<CapturedVoiceAnswer> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone recording is unavailable on this device.");
  }
  const mimeType = supportedVoiceAnswerMime();
  if (!mimeType) throw new Error("This device has no supported recording format.");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const pieces: Blob[] = [];
  let activity = createVoiceAnswerActivity(performance.now());
  let saveRequested = true;
  let frame = 0;
  let hardStopTimer = 0;

  const clean = () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(hardStopTimer);
    stream.getTracks().forEach((track) => track.stop());
    source.disconnect();
    void context.close();
    onSession(undefined);
  };

  return new Promise((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) pieces.push(event.data);
    });
    recorder.addEventListener("error", () => {
      clean();
      reject(new Error("Microphone recording failed. Check permission and retry."));
    }, { once: true });
    recorder.addEventListener("stop", () => {
      const stoppedAt = performance.now();
      clean();
      if (!saveRequested) {
        reject(new DOMException("Recording cancelled", "AbortError"));
        return;
      }
      if (!activity.speechStarted) {
        reject(new Error("No voice was detected. Check your microphone and retry."));
        return;
      }
      const blob = new Blob(pieces, { type: mimeType });
      void blob.arrayBuffer().then((buffer) => resolve({
        mimeType,
        audio: new Uint8Array(buffer),
        durationMs: Math.min(
          VOICE_TRANSCRIPTION_MAX_DURATION_MS,
          Math.max(1, Math.ceil(stoppedAt - activity.startedAt))
        )
      }), reject);
    }, { once: true });

    const sample = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        energy += normalized * normalized;
      }
      activity = advanceVoiceAnswerActivity(activity, {
        now: performance.now(),
        level: Math.sqrt(energy / samples.length)
      });
      if (activity.outcome === "listening") {
        frame = requestAnimationFrame(sample);
      } else if (recorder.state !== "inactive") {
        recorder.stop();
      }
    };

    onSession({
      stop(save) {
        saveRequested = save;
        if (recorder.state !== "inactive") recorder.stop();
      }
    });
    recorder.start(250);
    hardStopTimer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, VOICE_TRANSCRIPTION_MAX_DURATION_MS);
    frame = requestAnimationFrame(sample);
  });
}
