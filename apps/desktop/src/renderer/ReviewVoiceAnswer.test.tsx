import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VoiceTranscriptionDesktopApi } from "../shared/voice-transcription-contracts";
import { ReviewVoiceAnswer } from "./ReviewVoiceAnswer";

function api(): VoiceTranscriptionDesktopApi {
  return {
    transcribe: vi.fn(async () => ({ text: "a financial institution" })),
    cancel: vi.fn(async () => undefined)
  };
}

describe("ReviewVoiceAnswer", () => {
  it("explains separate voice setup while leaving typing available", () => {
    const onOpenSettings = vi.fn();
    render(
      <ReviewVoiceAnswer
        api={api()}
        hasApiKey={false}
        disabled={false}
        busy={false}
        onBusyChange={vi.fn()}
        onTranscribed={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Answer by voice" }));
    expect(screen.getByRole("dialog", { name: "Set up voice answers" }))
      .toHaveTextContent(/uses your OpenAI API key.*Codex/s);
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));
    expect(screen.queryByRole("dialog", { name: "Set up voice answers" }))
      .not.toBeInTheDocument();
  });

  it("fills a transcript without submitting after an explicit recording", async () => {
    const transcriptionApi = api();
    const onTranscribed = vi.fn();
    const capture = vi.fn(async () => ({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 1_500
    }));
    render(
      <ReviewVoiceAnswer
        api={transcriptionApi}
        hasApiKey
        disabled={false}
        busy={false}
        onBusyChange={vi.fn()}
        onTranscribed={onTranscribed}
        onOpenSettings={vi.fn()}
        capture={capture}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Answer by voice" }));

    await waitFor(() => expect(transcriptionApi.transcribe).toHaveBeenCalledWith({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 1_500
    }));
    expect(onTranscribed).toHaveBeenCalledWith("a financial institution");
    expect(await screen.findByText("Transcribed with OpenAI · Edit before submitting"))
      .toBeInTheDocument();
  });

  it("cancels recording and transcription when removed", async () => {
    let session: { stop(save: boolean): void } | undefined;
    const stop = vi.fn();
    const capture = vi.fn((onSession: (value: typeof session) => void) => {
      session = { stop };
      onSession(session);
      return new Promise<never>(() => undefined);
    });
    const transcriptionApi = api();
    const { unmount } = render(
      <ReviewVoiceAnswer
        api={transcriptionApi}
        hasApiKey
        disabled={false}
        busy={false}
        onBusyChange={vi.fn()}
        onTranscribed={vi.fn()}
        onOpenSettings={vi.fn()}
        capture={capture}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Answer by voice" }));
    await waitFor(() => expect(capture).toHaveBeenCalled());

    unmount();

    expect(stop).toHaveBeenCalledWith(false);
    expect(transcriptionApi.cancel).toHaveBeenCalledOnce();
  });
});
