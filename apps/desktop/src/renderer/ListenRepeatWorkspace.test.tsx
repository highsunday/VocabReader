import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ListenRepeatAudioResult,
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
  statistics: {
    todayCompletedLongChunkCount: 0,
    totalCompletedLongChunkCount: 0,
    completedLongChunkCount30Days: 0,
    dailyActivity: []
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
    statistics: empty.statistics,
    practice: {
      id: "practice",
      material: "One, two.",
      mode: "progressive",
      shortChunkLength: "short",
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

function draft(): ListenRepeatSnapshot {
  const snapshot = advancedReady();
  snapshot.progress = empty.progress;
  snapshot.practice = {
    ...snapshot.practice!,
    mode: "progressive",
    shortChunkLength: "medium",
    phase: "draft",
    longChunks: []
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
  it("reports today's completed long chunks whenever the snapshot changes", async () => {
    const snapshot = ready();
    snapshot.statistics = {
      ...empty.statistics,
      todayCompletedLongChunkCount: 4
    };
    const onTodayCompletedLongChunkCountChange = vi.fn();

    render(
      <ListenRepeatWorkspace
        api={api(snapshot)}
        active
        onOpenAiVoice={vi.fn()}
        onTodayCompletedLongChunkCountChange={
          onTodayCompletedLongChunkCountChange
        }
      />
    );

    await waitFor(() => expect(onTodayCompletedLongChunkCountChange)
      .toHaveBeenLastCalledWith(4));
  });

  it("shows the daily goal, all-time total, and accessible 30-day activity", async () => {
    const snapshot = ready();
    snapshot.statistics = {
      todayCompletedLongChunkCount: 7,
      totalCompletedLongChunkCount: 42,
      completedLongChunkCount30Days: 12,
      dailyActivity: [{ date: "2026-08-19", completedLongChunkCount: 5 }, {
        date: "2026-08-20",
        completedLongChunkCount: 7
      }]
    };

    render(
      <ListenRepeatWorkspace
        api={api(snapshot)}
        active
        dailyGoal={10}
        onOpenAiVoice={vi.fn()}
      />
    );

    expect(await screen.findByText("7 / 10")).toBeInTheDocument();
    const summary = screen.getByRole("region", {
      name: "Listen and repeat progress summary"
    });
    expect(within(summary).getByLabelText("Today's listen and repeat practice"))
      .toBeInTheDocument();
    expect(within(summary).getByLabelText("All-time listen and repeat practice"))
      .toBeInTheDocument();
    expect(within(summary).getByLabelText("30-day speaking activity"))
      .toBeInTheDocument();
    expect(screen.getByText("3 left today")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", {
      name: "Daily listen and repeat goal"
    })).toHaveAttribute("aria-valuenow", "7");
    expect(screen.getByLabelText("All-time listen and repeat practice"))
      .toHaveTextContent("42");
    expect(screen.getByLabelText("30-day speaking activity"))
      .toHaveTextContent("12 long chunks");
    expect(screen.getByLabelText("2026-08-20: 7 long chunks completed"))
      .toBeInTheDocument();
  });

  it("continues showing activity without goal UI when the goal is zero", async () => {
    const snapshot = ready();
    snapshot.statistics = {
      ...empty.statistics,
      todayCompletedLongChunkCount: 3,
      totalCompletedLongChunkCount: 3,
      completedLongChunkCount30Days: 3
    };
    render(
      <ListenRepeatWorkspace
        api={api(snapshot)}
        active
        dailyGoal={0}
        onOpenAiVoice={vi.fn()}
      />
    );

    expect(await screen.findByText("3 long chunks completed today"))
      .toBeInTheDocument();
    expect(screen.queryByRole("progressbar", {
      name: "Daily listen and repeat goal"
    })).not.toBeInTheDocument();
  });

  it("shows the recommended Short phrase-length slider for Progressive material", async () => {
    render(<ListenRepeatWorkspace api={api()} active onOpenAiVoice={vi.fn()} />);

    await screen.findByRole("heading", { name: "Listen & Repeat Practice" });
    const slider = screen.getByRole("slider", {
      name: "Progressive phrase length"
    });
    const progressive = screen.getByRole("radio", { name: /Progressive/ });
    const progressiveCard = progressive.closest(".listen-repeat-mode-card");

    expect(slider).toHaveValue("0");
    expect(progressiveCard).not.toBeNull();
    expect(progressiveCard).toContainElement(slider);
    expect(progressive.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(slider).toHaveAttribute("aria-valuetext", "Short, about 0.75–1.5 seconds");
    expect(screen.getByText("Phrase length")).toBeInTheDocument();
    expect(screen.getByLabelText("Advanced practice unit"))
      .toHaveTextContent(/Full sentence.*No phrase splitting/);
    expect(screen.getAllByText("Recommended").length).toBeGreaterThan(0);
    expect(screen.getByText("About 0.75–1.5 sec")).toBeInTheDocument();
  });

  it("sends a selected Medium phrase length and preserves Long across mode changes", async () => {
    const desktopApi = api();
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);
    await screen.findByRole("heading", { name: "Listen & Repeat Practice" });
    const slider = screen.getByRole("slider", { name: "Progressive phrase length" });

    fireEvent.change(slider, { target: { value: "2" } });
    expect(slider).toHaveAttribute("aria-valuetext", "Long, about 2.5–4 seconds");
    fireEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    expect(screen.getByRole("slider", { name: "Progressive phrase length" })).toHaveValue("2");

    fireEvent.pointerDown(screen.getByRole("slider", { name: "Progressive phrase length" }));
    expect(screen.getByRole("radio", { name: /Progressive/ })).toBeChecked();

    fireEvent.change(screen.getByRole("slider", {
      name: "Progressive phrase length"
    }), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Practice material"), {
      target: { value: "A natural phrase to practise." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Process with AI" }));

    await waitFor(() => expect(desktopApi.process).toHaveBeenCalledWith({
      material: "A natural phrase to practise.",
      mode: "progressive",
      shortChunkLength: "medium",
      replaceConfirmed: false
    }));
  });

  it("keeps a long AI segmentation visibly alive with elapsed feedback", async () => {
    let finishProcessing: ((snapshot: ListenRepeatSnapshot) => void) | undefined;
    const desktopApi = api(draft());
    desktopApi.process = vi.fn(() => new Promise<ListenRepeatSnapshot>((resolve) => {
      finishProcessing = resolve;
    }));
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);
    await screen.findByRole("heading", { name: "Listen & Repeat Practice" });
    vi.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole("button", { name: "Process with AI" }));

      expect(screen.getByRole("status")).toHaveTextContent("Sending your material to AI");
      expect(screen.getByLabelText("Practice material")).toBeDisabled();
      expect(screen.getByRole("radio", { name: /Advanced/ })).toBeDisabled();
      expect(screen.getByRole("slider", { name: "Progressive phrase length" }))
        .toBeDisabled();

      act(() => vi.advanceTimersByTime(30_000));

      expect(screen.getByRole("status")).toHaveTextContent(
        "Still working—your practice is being prepared"
      );
      expect(screen.getByRole("status")).toHaveTextContent("0:30");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Some passages can take around 1–2 minutes. This is normal."
      );
    } finally {
      finishProcessing?.(ready());
      vi.useRealTimers();
    }
  });

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
      shortChunkLength: "short",
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
    expect(screen.getAllByText("One, two.")).toHaveLength(1);
    expect(screen.getByText("One,")).toBeInTheDocument();
    expect(screen.getByText("two.")).toBeInTheDocument();
    expect(screen.getByText("Hear the whole sentence")).toBeInTheDocument();
    expect(screen.getByText("Build it in short phrases")).toBeInTheDocument();
    const parent = screen.getByText("Full sentence").closest("article");
    const firstChild = screen.getAllByText("Short phrase")[0].closest("article");
    expect(parent).not.toBeNull();
    expect(firstChild).not.toBeNull();
    expect(parent!.compareDocumentPosition(firstChild!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
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

  it("shows one parent-level preparation state while a phrase take is aligned", async () => {
    const snapshot = ready();
    snapshot.hasAiVoice = true;
    const desktopApi = api(snapshot);
    desktopApi.prepareAiAudio = vi.fn(() =>
      new Promise<ListenRepeatAudioResult>(() => undefined)
    );
    render(<ListenRepeatWorkspace api={desktopApi} active onOpenAiVoice={vi.fn()} />);
    await screen.findByText("Short 1/2");

    fireEvent.click(screen.getByRole("button", { name: "Play AI for short chunk 1" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Preparing the full sentence and aligning every short phrase"
    );
    expect(screen.getByRole("button", { name: "Play AI for long chunk 1" }))
      .toBeDisabled();
    expect(screen.getByRole("button", { name: "Play AI for short chunk 2" }))
      .toBeDisabled();
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
    fireEvent.click(startButtons.find((button) => !button.hasAttribute("disabled"))!);

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
