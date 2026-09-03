import { useEffect, useRef, useState } from "react";
import { AudioWaveform, LoaderCircle, Mic, Square } from "lucide-react";
import type { VoiceTranscriptionDesktopApi } from "../shared/voice-transcription-contracts";
import {
  captureVoiceAnswer,
  type CapturedVoiceAnswer,
  type VoiceAnswerRecordingSession
} from "./voice-answer-recording";

type CaptureVoiceAnswer = (
  onSession: (session: VoiceAnswerRecordingSession | undefined) => void
) => Promise<CapturedVoiceAnswer>;

export function ReviewVoiceAnswer({
  api,
  hasApiKey,
  disabled,
  busy,
  onBusyChange,
  onTranscribed,
  onOpenSettings,
  capture = captureVoiceAnswer
}: {
  api: VoiceTranscriptionDesktopApi;
  hasApiKey: boolean;
  disabled: boolean;
  busy: boolean;
  onBusyChange(busy: boolean): void;
  onTranscribed(text: string): void;
  onOpenSettings(): void;
  capture?: CaptureVoiceAnswer;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const sessionRef = useRef<VoiceAnswerRecordingSession | undefined>(undefined);
  const requestRef = useRef(0);

  useEffect(() => () => {
    requestRef.current += 1;
    sessionRef.current?.stop(false);
    sessionRef.current = undefined;
    void api.cancel();
    onBusyChange(false);
  }, [api]);

  async function start() {
    if (!hasApiKey) {
      setShowSetup(true);
      return;
    }
    if (disabled || busy || phase !== "idle") return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setError("");
    setTranscribed(false);
    setPhase("recording");
    onBusyChange(true);
    try {
      const recording = await capture((session) => {
        if (requestRef.current !== request) session?.stop(false);
        else sessionRef.current = session;
      });
      if (requestRef.current !== request) return;
      setPhase("transcribing");
      const result = await api.transcribe(recording);
      if (requestRef.current !== request) return;
      onTranscribed(result.text);
      setTranscribed(true);
    } catch (caught) {
      if (requestRef.current === request && (caught as Error).name !== "AbortError") {
        setError(caught instanceof Error
          ? caught.message
          : "Voice answer failed. Record again, or keep typing.");
      }
    } finally {
      if (requestRef.current === request) {
        sessionRef.current = undefined;
        setPhase("idle");
        onBusyChange(false);
      }
    }
  }

  function stop() {
    sessionRef.current?.stop(true);
  }

  const buttonLabel = phase === "recording"
    ? "Stop voice recording"
    : phase === "transcribing"
      ? "Converting speech to text"
      : "Answer by voice";

  return (
    <div className="review-voice-answer">
      <button
        className="review-voice-trigger"
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        disabled={disabled || phase === "transcribing" || (busy && phase === "idle")}
        data-phase={phase}
        onClick={() => phase === "recording" ? stop() : void start()}
      >
        {phase === "recording" ? (
          <Square aria-hidden="true" />
        ) : phase === "transcribing" ? (
          <LoaderCircle aria-hidden="true" />
        ) : (
          <Mic aria-hidden="true" />
        )}
      </button>

      <div className="review-voice-status" aria-live="polite" aria-atomic="true">
        {phase === "recording" ? (
          <span className="is-listening">
            <AudioWaveform aria-hidden="true" />
            Listening… Stops after silence
          </span>
        ) : phase === "transcribing" ? (
          <span>Converting speech to text…</span>
        ) : error ? (
          <span className="is-error" role="alert">{error}</span>
        ) : transcribed ? (
          <span className="is-success">
            Transcribed with OpenAI · Edit before submitting
          </span>
        ) : null}
      </div>

      {showSetup ? (
        <div
          className="review-voice-setup"
          role="dialog"
          aria-modal="false"
          aria-label="Set up voice answers"
        >
          <strong>Set up voice answers</strong>
          <p>
            Voice answering uses your OpenAI API key. Review generation and
            grading continue to use Codex, and you can always keep typing.
          </p>
          <div>
            <button
              type="button"
              className="review-voice-keep-typing"
              onClick={() => setShowSetup(false)}
            >
              Keep typing
            </button>
            <button
              type="button"
              className="review-voice-open-settings"
              onClick={() => {
                setShowSetup(false);
                onOpenSettings();
              }}
            >
              Open Voice &amp; Speech settings
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
