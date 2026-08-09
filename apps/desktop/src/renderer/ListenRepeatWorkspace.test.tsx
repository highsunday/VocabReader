import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ListenRepeatDesktopApi,
  ListenRepeatSnapshot
} from "../shared/listen-repeat-contracts";
import { ListenRepeatWorkspace } from "./ListenRepeatWorkspace";

const empty: ListenRepeatSnapshot = {
  practice: null,
  progress: {
    shortCompleted: 0,
    shortTotal: 0,
    longCompleted: 0,
    longTotal: 0,
    complete: false
  },
  hasAiVoice: false
};

function ready(): ListenRepeatSnapshot {
  return {
    hasAiVoice: false,
    progress: {
      shortCompleted: 1,
      shortTotal: 2,
      longCompleted: 0,
      longTotal: 1,
      complete: false
    },
    practice: {
      id: "practice",
      material: "One, two.",
      mode: "progressive",
      phase: "ready",
      error: null,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      longChunks: [{
        id: "long",
        kind: "long",
        text: "One, two.",
        parentId: null,
        recording: null,
        aiAudio: null,
        recordingUnlocked: false,
        shortChunks: [{
          id: "short-1",
          kind: "short",
          text: "One, ",
          parentId: "long",
          recording: {
            mimeType: "audio/webm",
            bytes: 2,
            updatedAt: "2026-08-10T00:00:00.000Z"
          },
          aiAudio: null,
          recordingUnlocked: true,
          shortChunks: []
        }, {
          id: "short-2",
          kind: "short",
          text: "two.",
          parentId: "long",
          recording: null,
          aiAudio: null,
          recordingUnlocked: true,
          shortChunks: []
        }]
      }]
    }
  };
}

function advancedReady(): ListenRepeatSnapshot {
  const snapshot = ready();
  snapshot.progress = {
    shortCompleted: 0,
    shortTotal: 0,
    longCompleted: 0,
    longTotal: 1,
    complete: false
  };
  snapshot.practice = {
    ...snapshot.practice!,
    material: "One complete sentence.",
    mode: "advanced",
    longChunks: [{
      id: "long-advanced",
      kind: "long",
      text: "One complete sentence.",
      parentId: null,
      recording: null,
      aiAudio: null,
      recordingUnlocked: true,
      shortChunks: []
    }]
  };
  return snapshot;
}

function api(snapshot = empty): ListenRepeatDesktopApi {
  return {
    getSnapshot: vi.fn(async () => snapshot),
    saveDraft: vi.fn(async () => snapshot),
    process: vi.fn(async () => snapshot),
    saveRecording: vi.fn(async () => snapshot),
    getRecording: vi.fn(),
    prepareAiAudio: vi.fn(),
    cancelAiAudio: vi.fn(async () => undefined),
    clear: vi.fn(async () => empty)
  };
}

describe("ListenRepeatWorkspace", () => {
  it("processes an independent arbitrary-language material with a grapheme counter", async () => {
    const desktopApi = api();
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Listen & Repeat Practice" }))
      .toBeInTheDocument();
    const material = screen.getByLabelText("Practice material");
    fireEvent.change(material, { target: { value: "Hello. 你好。" } });
    expect(screen.getByText("10 / 2,000 characters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    fireEvent.click(screen.getByRole("button", { name: "Process with AI" }));

    await waitFor(() => expect(desktopApi.process).toHaveBeenCalledWith({
      material: "Hello. 你好。",
      mode: "advanced",
      replaceConfirmed: false
    }));
    expect(screen.queryByRole("button", { name: /Play All/i }))
      .not.toBeInTheDocument();
  });

  it("blocks 2,001 graphemes without truncating the textarea", async () => {
    render(<ListenRepeatWorkspace api={api()} active onOpenAiVoice={vi.fn()} />);
    await screen.findByRole("heading", { name: "Listen & Repeat Practice" });
    const value = "語".repeat(2_001);
    const material = screen.getByLabelText("Practice material");
    fireEvent.change(material, { target: { value } });

    expect(material).toHaveValue(value);
    expect(screen.getByRole("button", { name: "Process with AI" }))
      .toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/2,000/);
  });

  it("shows Progressive hierarchy, progress and locked long recording", async () => {
    render(<ListenRepeatWorkspace api={api(ready())} active onOpenAiVoice={vi.fn()} />);

    expect(await screen.findByText("Short 1/2")).toBeInTheDocument();
    expect(screen.getByText("Long 0/1")).toBeInTheDocument();
    expect(screen.getAllByText("One, two.")).toHaveLength(2);
    expect(screen.getByText("One,")).toBeInTheDocument();
    expect(screen.getByText("two.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record long chunk 1" }))
      .toBeDisabled();
    expect(screen.getByText(/Complete every short chunk to unlock recording/))
      .toBeInTheDocument();
  });

  it("shows only practice after processing and returns to the material on request", async () => {
    render(<ListenRepeatWorkspace api={api(ready())} active onOpenAiVoice={vi.fn()} />);

    expect(await screen.findByText("Build the rhythm, one chunk at a time"))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your source material" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Practice material")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to material" }));

    expect(screen.getByLabelText("Practice material")).toHaveValue("One, two.");
    expect(screen.queryByText("Build the rhythm, one chunk at a time"))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to practice" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Process with AI" })).toBeEnabled();
  });

  it("renders each Advanced sentence once without a duplicate group header", async () => {
    render(<ListenRepeatWorkspace api={api(advancedReady())} active onOpenAiVoice={vi.fn()} />);

    expect(await screen.findByText("One complete sentence.")).toBeInTheDocument();
    expect(screen.getAllByText("One complete sentence.")).toHaveLength(1);
    expect(screen.getByText("Sentence 1")).toBeInTheDocument();
    expect(screen.queryByText("Full sentence")).not.toBeInTheDocument();
  });

  it("opens AI Voice settings instead of using device speech", async () => {
    const desktopApi = api(ready());
    const open = vi.fn();
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={open} />);
    await screen.findByText("Short 1/2");

    fireEvent.click(screen.getByRole("button", { name: "Play AI for short chunk 1" }));

    expect(open).toHaveBeenCalledOnce();
    expect(desktopApi.prepareAiAudio).not.toHaveBeenCalled();
  });

  it("keeps the practice intact and reports an actionable microphone error", async () => {
    const desktopApi = api(ready());
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);
    await screen.findByText("Short 1/2");

    fireEvent.click(screen.getByRole("button", { name: "Record short chunk 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone recording is unavailable on this device."
    );
    expect(desktopApi.saveRecording).not.toHaveBeenCalled();
    expect(screen.getByText("Short 1/2")).toBeInTheDocument();
  });

  it("confirms continuous overwrites once before starting from a recorded chunk", async () => {
    const snapshot = ready();
    snapshot.hasAiVoice = true;
    render(<ListenRepeatWorkspace api={api(snapshot)} active onOpenAiVoice={vi.fn()} />);
    await screen.findByText("Short 1/2");

    const startButtons = screen.getAllByRole("button", { name: "Start here" });
    fireEvent.click(startButtons[0]);

    expect(screen.getByRole("heading", {
      name: "Replace recordings as you continue?"
    })).toBeInTheDocument();
    expect(screen.getByText(/Only chunks reached and fully saved/)).toBeInTheDocument();
  });

  it("permanently clears only after explicit confirmation", async () => {
    const desktopApi = api(ready());
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);
    await screen.findByText("Short 1/2");

    fireEvent.click(screen.getByRole("button", { name: "Clear current practice" }));
    expect(screen.getByRole("heading", { name: "Permanently clear this practice?" }))
      .toBeInTheDocument();
    expect(desktopApi.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear permanently" }));

    await waitFor(() => expect(desktopApi.clear).toHaveBeenCalledOnce());
    expect(screen.queryByText("Short 1/2")).not.toBeInTheDocument();
  });
});
