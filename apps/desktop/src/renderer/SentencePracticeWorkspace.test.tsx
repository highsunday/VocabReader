import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LearningDesktopApi } from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import type {
  SentencePracticeDesktopApi,
  SentencePracticeSession,
  SentencePracticeSnapshot
} from "../shared/sentence-practice-contracts";
import { SentencePracticeWorkspace } from "./SentencePracticeWorkspace";

const items = [{
  id: "item-1",
  title: "create",
  itemType: "word" as const,
  cefr: "A2" as const,
  sense: "make something",
  meaning: "創造；製作。"
}, {
  id: "item-2",
  title: "on the verge of",
  itemType: "phrase" as const,
  cefr: "C1" as const,
  sense: "very close to happening",
  meaning: "瀕臨；即將發生。"
}];

function session(
  update: Partial<SentencePracticeSession> = {}
): SentencePracticeSession {
  return {
    sessionId: "session-1",
    itemCount: 2,
    items,
    draft: "",
    phase: "writing",
    issues: [],
    feedback: null,
    error: null,
    exampleGeneration: {
      phase: "idle",
      examples: [],
      error: null
    },
    ...update
  };
}

function sentencePracticeApi(): SentencePracticeDesktopApi {
  let snapshot: SentencePracticeSnapshot = { eligibleCount: 3, session: null };
  let submission = 0;
  return {
    getSnapshot: vi.fn(async () => snapshot),
    startSession: vi.fn(async () => {
      snapshot = { eligibleCount: 3, session: session() };
      return snapshot;
    }),
    submit: vi.fn(async (input) => {
      submission += 1;
      snapshot = submission === 1
        ? {
            eligibleCount: 3,
            session: session({
              draft: input.draft,
              phase: "needs-revision",
              issues: [{
                itemId: "item-2",
                title: "on the verge of",
                kind: "missing",
                message: "請在故事中自然使用這個片語。"
              }]
            })
          }
        : {
            eligibleCount: 3,
            session: session({
              draft: input.draft,
              phase: "completed",
              feedback: {
                revisedText:
                  "We created a raft when the town was on the verge of flooding.",
                changes: [{
                  original: "We create a raft.",
                  revised: "We created a raft.",
                  explanation: "已完成的事件使用過去式。"
                }],
                conversationalSuggestions: [{
                  original: "made it very fast",
                  suggested: "put it together quickly",
                  explanation: "這個說法在日常對話中更自然。"
                }],
                usages: items.map((item) => ({
                  itemId: item.id,
                  title: item.title,
                  usage: item.id === "item-1"
                    ? "created a raft"
                    : "on the verge of flooding"
                }))
              }
            })
          };
      return snapshot;
    }),
    generateExamples: vi.fn(async () => snapshot)
  };
}

function learningApi(): LearningDesktopApi {
  return {
    listItems: vi.fn(async () => ({ items: [], nextCursor: null })),
    countItems: vi.fn(async () => ({ active: 2, trashed: 0 })),
    getItem: vi.fn(async (itemId) => ({
      id: itemId,
      title: itemId === "item-1" ? "create" : "on the verge of",
      itemType: itemId === "item-1" ? "word" as const : "phrase" as const,
      language: "en" as const,
      cefr: itemId === "item-1" ? "A2" as const : "C1" as const,
      sense: itemId === "item-1" ? "make something" : "very close to happening",
      markdownContent: "## Meaning\n完整解釋。\n\n## Examples\n1. An example.",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      trashedAt: null
    })),
    updateItem: vi.fn(),
    trashItem: vi.fn(),
    restoreItem: vi.fn(),
    emptyTrash: vi.fn()
  };
}

function reviewApi(): ReviewDesktopApi {
  return {
    getSummary: vi.fn(),
    generatePaper: vi.fn(),
    gradePaper: vi.fn(),
    confirmPaper: vi.fn(),
    discardPaper: vi.fn(),
    getItemDetail: vi.fn(async () => ({
      status: "scheduled" as const,
      lastReviewedAt: "2026-08-01T00:00:00.000Z",
      lastFinalRating: "good" as const,
      nextDueAt: "2026-08-08T00:00:00.000Z",
      reviewCount: 2,
      history: []
    })),
    onGenerationProgress: vi.fn(() => () => undefined)
  };
}

describe("SentencePracticeWorkspace", () => {
  it("blocks setup below two eligible items", async () => {
    const api: SentencePracticeDesktopApi = {
      getSnapshot: vi.fn(async () => ({ eligibleCount: 1, session: null })),
      startSession: vi.fn(),
      submit: vi.fn(),
      generateExamples: vi.fn()
    };
    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    expect(await screen.findByText(
      /Complete spaced review for at least two English learning items/
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start practice" }))
      .not.toBeInTheDocument();
  });

  it("keeps the draft across workspace changes and confirms a new round", async () => {
    const api = sentencePracticeApi();
    const props = {
      api,
      learningApi: learningApi(),
      explanationLanguage: "en" as const
    };
    const { rerender } = render(
      <SentencePracticeWorkspace {...props} active />
    );
    await screen.findByRole("heading", { name: "Sentence Practice" });
    fireEvent.change(screen.getByRole("spinbutton", {
      name: "Number of learning items"
    }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));
    const draft = await screen.findByRole("textbox", {
      name: "Your story or passage"
    });
    expect(screen.getByRole("button", { name: "Check my writing" }))
      .toBeDisabled();
    fireEvent.change(draft, { target: { value: "My unfinished story." } });

    rerender(<SentencePracticeWorkspace {...props} active={false} />);
    expect(screen.queryByRole("heading", { name: "Sentence Practice" }))
      .not.toBeInTheDocument();
    rerender(<SentencePracticeWorkspace {...props} active />);
    expect(screen.getByRole("textbox", { name: "Your story or passage" }))
      .toHaveValue("My unfinished story.");

    fireEvent.click(screen.getByRole("button", { name: "New round" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "Start a new round?"
    });
    expect(confirmation).toHaveClass("sentence-practice-new-round-dialog");
    expect(confirmation.querySelector(
      ".sentence-practice-new-round-dialog-body"
    )).not.toBeNull();
    expect(confirmation.querySelector(
      ".sentence-practice-new-round-dialog-actions"
    )).not.toBeNull();
    expect(within(confirmation).getByRole("spinbutton", {
      name: "Number of items for the new round"
    })).toHaveValue(2);
    fireEvent.click(within(confirmation).getByRole("button", {
      name: "Keep current round"
    }));
    expect(screen.getByRole("textbox", { name: "Your story or passage" }))
      .toHaveValue("My unfinished story.");

    fireEvent.click(screen.getByRole("button", { name: "New round" }));
    fireEvent.click(screen.getByRole("button", { name: "Start new round" }));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("textbox", { name: "Your story or passage" }))
      .toHaveValue("");
  });

  it("returns to the Sentence Practice home and resumes the current round", async () => {
    const api = sentencePracticeApi();
    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    await screen.findByRole("heading", { name: "Sentence Practice" });
    fireEvent.change(screen.getByRole("spinbutton", {
      name: "Number of learning items"
    }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));

    const draft = await screen.findByRole("textbox", {
      name: "Your story or passage"
    });
    fireEvent.change(draft, { target: { value: "My unfinished story." } });
    fireEvent.click(screen.getByRole("button", {
      name: "Back to Sentence Practice"
    }));

    expect(screen.getByRole("region", { name: "Current practice" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your story or passage" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue practice" }));
    expect(screen.getByRole("textbox", { name: "Your story or passage" }))
      .toHaveValue("My unfinished story.");
  });

  it("opens a card with exactly three AI examples without changing the draft", async () => {
    let resolveGeneration!: (snapshot: SentencePracticeSnapshot) => void;
    const generation = new Promise<SentencePracticeSnapshot>((resolve) => {
      resolveGeneration = resolve;
    });
    const api: SentencePracticeDesktopApi = {
      getSnapshot: vi.fn(async () => ({
        eligibleCount: 3,
        session: session()
      })),
      startSession: vi.fn(),
      submit: vi.fn(),
      generateExamples: vi.fn(async () => generation)
    };
    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    const draft = await screen.findByRole("textbox", {
      name: "Your story or passage"
    });
    fireEvent.change(draft, { target: { value: "My unfinished story." } });
    fireEvent.click(screen.getByRole("button", { name: "Show 3 examples" }));

    const card = screen.getByRole("dialog", { name: "Writing examples" });
    expect(within(card).getByText("Generating 3 examples…"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check my writing" }))
      .toBeDisabled();

    await act(async () => resolveGeneration({
      eligibleCount: 3,
      session: session({
        exampleGeneration: {
          phase: "ready",
          error: null,
          examples: [
            "We created a plan while the team was on the verge of giving up.",
            "Mina created a shelter when the village was on the verge of flooding.",
            "They created a route as the bridge was on the verge of closing."
          ].map((text) => ({
            text,
            usages: [{
              itemId: "item-1",
              title: "create",
              usage: "created"
            }, {
              itemId: "item-2",
              title: "on the verge of",
              usage: "on the verge of"
            }]
          }))
        }
      })
    }));

    expect(await within(card).findAllByRole("article")).toHaveLength(3);
    expect(within(card).getAllByText("created", { selector: "mark" }))
      .toHaveLength(3);
    expect(within(card).getAllByText("on the verge of", { selector: "mark" }))
      .toHaveLength(3);
    expect(within(card).getAllByText("created", { selector: "mark" })[0])
      .toHaveClass("reader-annotation-highlight");
    expect(draft).toHaveValue("My unfinished story.");
    fireEvent.click(card);
    expect(screen.getByRole("dialog", { name: "Writing examples" }))
      .toBeInTheDocument();
    fireEvent.click(card.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Writing examples" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 3 examples" }));
    expect(screen.getByRole("dialog", { name: "Writing examples" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close examples" }));
    expect(screen.queryByRole("dialog", { name: "Writing examples" }))
      .not.toBeInTheDocument();
    expect(api.generateExamples).toHaveBeenCalledTimes(1);
  });

  it("places the examples action on the left of the writing footer without a word count", async () => {
    const api: SentencePracticeDesktopApi = {
      getSnapshot: vi.fn(async () => ({
        eligibleCount: 3,
        session: session()
      })),
      startSession: vi.fn(),
      submit: vi.fn(),
      generateExamples: vi.fn()
    };
    const { container } = render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    await screen.findByRole("textbox", { name: "Your story or passage" });
    const footer = container.querySelector(".sentence-practice-editor-footer");
    expect(footer).not.toBeNull();
    const footerView = within(footer as HTMLElement);
    expect(footerView.getByRole("button", { name: "Show 3 examples" }))
      .toBeInTheDocument();
    expect(footerView.getByRole("button", { name: "Check my writing" }))
      .toBeInTheDocument();
    expect(footerView.queryByText(/^\d+ words$/)).not.toBeInTheDocument();
    expect(container.querySelector(
      ".sentence-practice-heading-actions .sentence-practice-examples-trigger"
    )).not.toBeInTheDocument();
  });

  it("shows an example-generation error in the card and retries", async () => {
    const readySession = session({
      exampleGeneration: {
        phase: "ready",
        error: null,
        examples: ["First example.", "Second example.", "Third example."].map(
          (text) => ({
            text,
            usages: items.map((item) => ({
              itemId: item.id,
              title: item.title,
              usage: item.title
            }))
          })
        )
      }
    });
    const api: SentencePracticeDesktopApi = {
      getSnapshot: vi.fn(async () => ({
        eligibleCount: 3,
        session: session({
          exampleGeneration: {
            phase: "error",
            examples: [],
            error: "AI returned malformed examples."
          }
        })
      })),
      startSession: vi.fn(),
      submit: vi.fn(),
      generateExamples: vi.fn(async () => ({
        eligibleCount: 3,
        session: readySession
      }))
    };
    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    await screen.findByRole("textbox", { name: "Your story or passage" });
    fireEvent.click(screen.getByRole("button", { name: "Show 3 examples" }));
    const card = screen.getByRole("dialog", { name: "Writing examples" });
    expect(within(card).getByRole("alert"))
      .toHaveTextContent("AI returned malformed examples.");
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await within(card).findAllByRole("article")).toHaveLength(3);
    expect(api.generateExamples).toHaveBeenCalledTimes(1);
  });

  it("shows a prominent success notice when no writing changes are needed", async () => {
    const completedSession = session({
      draft: "She likes to hum while doing chores.",
      phase: "completed",
      feedback: {
        revisedText: "She likes to hum while doing chores.",
        changes: [],
        conversationalSuggestions: [],
        usages: items.map((item) => ({
          itemId: item.id,
          title: item.title,
          usage: item.title
        }))
      }
    });
    const api: SentencePracticeDesktopApi = {
      getSnapshot: vi.fn(async () => ({
        eligibleCount: 3,
        session: completedSession
      })),
      startSession: vi.fn(),
      submit: vi.fn(),
      generateExamples: vi.fn()
    };

    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        explanationLanguage="en"
      />
    );

    const notice = await screen.findByRole("status", {
      name: "Everything looks good"
    });
    expect(notice).toHaveClass("sentence-practice-success-notice");
    expect(notice).toHaveTextContent(
      "All required items are used correctly, and no grammar or wording changes are needed."
    );
  });

  it("runs one multi-sentence revision flow and opens read-only item details", async () => {
    const api = sentencePracticeApi();
    render(
      <SentencePracticeWorkspace
        api={api}
        learningApi={learningApi()}
        reviewApi={reviewApi()}
        explanationLanguage="zh-TW"
      />
    );

    expect(await screen.findByRole("heading", { name: "Sentence Practice" }))
      .toBeInTheDocument();
    expect(screen.getByText("3 reviewed English items available"))
      .toBeInTheDocument();
    const count = screen.getByRole("spinbutton", {
      name: "Number of learning items"
    });
    expect(count).toHaveValue(3);
    fireEvent.change(count, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));

    expect(await screen.findByText("創造；製作。"))
      .toBeInTheDocument();
    expect(screen.getByText("瀕臨；即將發生。"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "View create details"
    }));
    const detail = await screen.findByRole("dialog", { name: "create" });
    expect(detail).toHaveTextContent("完整解釋");
    expect(within(detail).queryByRole("button", { name: "Edit" }))
      .not.toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", {
      name: "Close card details"
    }));

    const draft = screen.getByRole("textbox", { name: "Your story or passage" });
    fireEvent.change(draft, {
      target: { value: "We create a raft before the flood." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Check my writing" }));
    expect(await screen.findByRole("heading", { name: "Revise these items" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("請在故事中自然使用這個片語。"))
      .toHaveLength(2);
    expect(draft).toHaveValue("We create a raft before the flood.");

    fireEvent.change(draft, {
      target: {
        value: "We create a raft when the town was on the verge of flooding."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Check my writing" }));
    const revisedVersionHeading = await screen.findByRole("heading", {
      name: "Revised version"
    });
    expect(revisedVersionHeading).toBeInTheDocument();
    expect(screen.getByText(
      "We created a raft when the town was on the verge of flooding."
    )).toBeInTheDocument();
    const changesHeading = screen.getByRole("heading", {
      name: "Why these changes help"
    });
    expect(changesHeading).toBeInTheDocument();
    expect(revisedVersionHeading.closest("section"))
      .toBe(changesHeading.closest("section"));
    expect(revisedVersionHeading.closest("section"))
      .toHaveClass("sentence-practice-correction-card");
    expect(screen.getByRole("heading", { name: "More conversational options" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Required-item usage" }))
      .toBeInTheDocument();
    await waitFor(() => expect(api.submit).toHaveBeenCalledTimes(2));
  });
});
