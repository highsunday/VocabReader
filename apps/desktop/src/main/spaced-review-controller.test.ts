import { describe, expect, it, vi } from "vitest";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";
import { SpacedReviewController } from "./spaced-review-controller";

interface RecordedRequest {
  method: string;
  params?: Record<string, unknown>;
}

interface FakeClientOptions {
  modelListResponse?: unknown;
  modelPages?: Array<{
    data: unknown[];
    nextCursor: string | null;
  }>;
  modelListError?: string;
  requests?: RecordedRequest[];
  generationDeltas?: string[];
}

function fakeClient(options: FakeClientOptions = {}): CodexAppServerClient {
  let listener: ((notification: CodexNotification) => void) | undefined;
  return {
    initialize: vi.fn(async (clientInfo) => {
      options.requests?.push({ method: "initialize", params: clientInfo });
    }),
    readAccount: vi.fn(async () => ({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: false
    })),
    request: vi.fn(async (method, params) => {
      options.requests?.push({ method, params });
      if (method === "model/list") {
        if (options.modelListError) throw new Error(options.modelListError);
        if ("modelListResponse" in options) return options.modelListResponse;
        const pageIndex = params?.cursor === "page-2" ? 1 : 0;
        return options.modelPages?.[pageIndex] ?? {
          data: [],
          nextCursor: null
        };
      }
      if (method === "thread/start") return { thread: { id: "thread-1" } };
      if (method === "turn/start") {
        const input = params?.input as Array<{ type: string; text?: string }>;
        const prompt = input.find(({ type }) => type === "text")?.text ?? "";
        const generationPayload = prompt.match(/Paper payload: (.+)\n/)?.[1];
        const gradingPayload = prompt.match(/Validated paper: (.+)\n/)?.[1];
        const response = generationPayload
          ? (() => {
              const payload = JSON.parse(generationPayload);
              return `\`\`\`review-paper
${JSON.stringify({
  paperId: payload.paperId,
  questions: payload.items.map((
    item: {
      itemId: string;
      title: string;
      sense: string;
      cefr: string;
    },
    index: number
  ) => ({
    questionId: `q${index + 1}`,
    itemId: item.itemId,
    title: item.title,
    sense: item.sense,
    cefr: item.cefr,
    beforeTarget: "She visited the ",
    targetText: item.title,
    afterTarget: "."
  }))
})}
\`\`\``;
            })()
          : (() => {
              const paper = JSON.parse(gradingPayload!);
              return `\`\`\`review-grade
${JSON.stringify({
  paperId: paper.paperId,
  results: [{
    questionId: "q1",
    itemId: "item-1",
    feedback: "答案正確。",
    rating: "easy",
    expressionFeedback: {
      status: "not-applicable",
      message: null,
      suggestedAnswer: null
    }
  }]
})}
\`\`\``;
            })();
        setTimeout(() => {
          for (const delta of options.generationDeltas ??
            ["正在準備 1/1：bank\n"]) {
            listener?.({
              method: "item/agentMessage/delta",
              params: {
                threadId: "thread-1",
                turnId: "turn-1",
                itemId: "message-1",
                delta
              }
            });
          }
          listener?.({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: { type: "agentMessage", text: response }
            }
          });
          listener?.({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-1", status: "completed" }
            }
          });
        }, 0);
        return { turn: { id: "turn-1" } };
      }
      return {};
    }),
    onNotification: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    onExit: () => () => undefined,
    close: vi.fn()
  };
}

const defaultReviewItem = {
  id: "item-1",
  title: "bank",
  itemType: "word" as const,
  cefr: "A2" as const,
  sense: "financial institution",
  markdownContent: "## Meaning\n銀行",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null,
  reviewKind: "new" as const,
  dueAt: null
};

const defaultReviewProgress = {
  newLearningCount: 0,
  dueLearningCount: 0,
  newCompletionLimit: 10,
  dueReviewCompletionLimit: 50,
  reviewPaperSize: 10,
  newRemainingCapacity: 10,
  dueRemainingCapacity: 50,
  backlogTotal: 1
};

function reviewLibrary(selectedItems = [defaultReviewItem]) {
  return {
    getReviewSummary: vi.fn(async () => ({
      dueReviewedCount: 0,
      newCount: selectedItems.length,
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      ...defaultReviewProgress,
      totalAvailable: selectedItems.length,
      nextDueAt: null,
      selectedItems
    })),
    getItemReviewDetail: vi.fn(),
    confirmReviewSession: vi.fn(async (input) => ({
      sessionId: input.sessionId,
      reviewedAt: input.reviewedAt,
      entries: [],
      remainingAvailable: 0
    }))
  };
}

function controllerWithClient(createClient: () => CodexAppServerClient) {
  return new SpacedReviewController({
    createClient,
    workingDirectory: "/tmp/review-runtime",
    skillPath: "/tmp/review-runtime/.agents/skills/practice-spaced-review/SKILL.md",
    skillInstructions: "bounded review instructions",
    now: () => new Date("2026-07-24T08:00:00.000Z"),
    library: reviewLibrary()
  });
}

describe("SpacedReviewController", () => {
  it("reports only fully streamed review questions as completed", async () => {
    const secondItem = {
      ...defaultReviewItem,
      id: "item-2",
      title: "brace",
      sense: "support",
      createdAt: "2026-01-02T00:00:00.000Z"
    };
    const firstQuestion =
      '{"questionId":"q1","beforeTarget":"A {literal} brace","afterTarget":"."}';
    const partialSecond =
      '{"questionId":"q2","beforeTarget":"Still streaming';
    const controller = new SpacedReviewController({
      createClient: () => fakeClient({
        generationDeltas: [
          '```review-paper\n{"paperId":"paper","questions":[',
          firstQuestion.slice(0, -1),
          `${firstQuestion.slice(-1)},${partialSecond}`,
          '","afterTarget":"."}]}'
        ]
      }),
      workingDirectory: "/tmp/review-runtime",
      skillPath: "/tmp/review-runtime/.agents/skills/practice-spaced-review/SKILL.md",
      skillInstructions: "bounded review instructions",
      now: () => new Date("2026-07-24T08:00:00.000Z"),
      library: reviewLibrary([defaultReviewItem, secondItem])
    });
    const progress: Array<{
      phase: "preparing" | "assembling";
      completedCount: number;
      totalCount: number;
    }> = [];
    const generateWithProgress = controller.generatePaper.bind(controller) as
      unknown as (
        input: { explanationLanguage: "zh-TW" },
        onProgress: (value: typeof progress[number]) => void
      ) => ReturnType<SpacedReviewController["generatePaper"]>;

    await generateWithProgress({ explanationLanguage: "zh-TW" }, (value) => {
      progress.push(value);
    });

    expect(progress).toEqual([
      { phase: "preparing", completedCount: 0, totalCount: 2 },
      { phase: "preparing", completedCount: 1, totalCount: 2 },
      { phase: "assembling", completedCount: 2, totalCount: 2 }
    ]);
  });

  it("prefers Luna low across paginated models for generation and grading", async () => {
    const requests: RecordedRequest[] = [];
    const createClient = () => fakeClient({
      requests,
      modelPages: [{
        data: [{
          id: "gpt-5.6-terra",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "low" }]
        }],
        nextCursor: "page-2"
      }, {
        data: [{
          id: "gpt-5.6-luna",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "low" }]
        }],
        nextCursor: null
      }]
    });
    const controller = controllerWithClient(createClient);

    const paper = await controller.generatePaper({
      explanationLanguage: "zh-TW"
    });
    await controller.gradePaper({
      paperId: paper.paperId,
      answers: [{ questionId: "q1", answer: "銀行" }]
    });

    expect(requests.filter(({ method }) => method === "initialize").map(
      ({ params }) => params
    )).toEqual([
      {
        name: "vocabreader-spaced-review",
        title: "VocabReader Spaced Review",
        version: "0.1.0"
      },
      {
        name: "vocabreader-spaced-review",
        title: "VocabReader Spaced Review",
        version: "0.1.0"
      }
    ]);
    expect(requests.filter(({ method }) => method === "model/list").map(
      ({ params }) => params?.cursor
    )).toEqual([null, "page-2", null, "page-2"]);
    expect(requests.filter(({ method }) => method === "thread/start").map(
      ({ params }) => params?.model
    )).toEqual(["gpt-5.6-luna", "gpt-5.6-luna"]);
    expect(requests.filter(({ method }) => method === "turn/start").map(
      ({ params }) => ({ model: params?.model, effort: params?.effort })
    )).toEqual([
      { model: "gpt-5.6-luna", effort: "low" },
      { model: "gpt-5.6-luna", effort: "low" }
    ]);
  });

  it("uses Terra low when Luna cannot serve low-effort review turns", async () => {
    const requests: RecordedRequest[] = [];
    const controller = controllerWithClient(() => fakeClient({
      requests,
      modelPages: [{
        data: [{
          id: "gpt-5.6-luna",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }]
        }, {
          id: "gpt-5.6-terra",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "low" }]
        }],
        nextCursor: null
      }]
    }));

    await controller.generatePaper({ explanationLanguage: "zh-TW" });

    expect(requests.find(({ method }) => method === "thread/start")?.params)
      .toMatchObject({ model: "gpt-5.6-terra" });
    expect(requests.find(({ method }) => method === "turn/start")?.params)
      .toMatchObject({ model: "gpt-5.6-terra", effort: "low" });
  });

  it.each([
    {
      label: "no fast model",
      options: {
        modelPages: [{
          data: [{
            id: "gpt-default",
            hidden: false,
            supportedReasoningEfforts: [{ reasoningEffort: "medium" }]
          }],
          nextCursor: null
        }]
      }
    },
    {
      label: "model catalog failure",
      options: { modelListError: "catalog unavailable" }
    },
    {
      label: "malformed model catalog",
      options: { modelListResponse: { data: "not-an-array" } }
    }
  ])("falls back to Codex defaults on $label", async ({ options }) => {
    const requests: RecordedRequest[] = [];
    const controller = controllerWithClient(() => fakeClient({
      ...options,
      requests
    }));

    await expect(controller.generatePaper({
      explanationLanguage: "zh-TW"
    })).resolves.toMatchObject({ questions: expect.any(Array) });

    const threadStart = requests.find(({ method }) => method === "thread/start");
    const turnStart = requests.find(({ method }) => method === "turn/start");
    expect(threadStart?.params?.model).toBeUndefined();
    expect(turnStart?.params?.model).toBeUndefined();
    expect(turnStart?.params?.effort).toBeUndefined();
  });

  it("keeps AI paper data ephemeral and commits only trusted confirmed ratings", async () => {
    const confirmReviewSession = vi.fn(async (input) => ({
      sessionId: input.sessionId,
      reviewedAt: input.reviewedAt,
      entries: [],
      remainingAvailable: 0
    }));
    const controller = new SpacedReviewController({
      createClient: fakeClient,
      workingDirectory: "/tmp/review-runtime",
      skillPath: "/tmp/review-runtime/.agents/skills/practice-spaced-review/SKILL.md",
      skillInstructions: "bounded review instructions",
      now: () => new Date("2026-07-24T08:00:00.000Z"),
      library: {
        getReviewSummary: vi.fn(async () => ({
          dueReviewedCount: 0,
          newCount: 1,
          reviewedNewTodayCount: 0,
          reviewedDueTodayCount: 0,
          ...defaultReviewProgress,
          totalAvailable: 1,
          nextDueAt: null,
          selectedItems: [{
            id: "item-1",
            title: "bank",
            itemType: "word" as const,
            cefr: "A2" as const,
            sense: "financial institution",
            markdownContent: "## Meaning\n銀行",
            status: "active" as const,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            trashedAt: null,
            reviewKind: "new" as const,
            dueAt: null
          }]
        })),
        getItemReviewDetail: vi.fn(),
        confirmReviewSession
      }
    });

    const progress: Array<{
      phase: "preparing" | "assembling";
      completedCount: number;
      totalCount: number;
    }> = [];
    const generateWithProgress = controller.generatePaper.bind(controller) as
      unknown as (
        input: { explanationLanguage: "zh-TW" },
        onProgress: (value: typeof progress[number]) => void
      ) => ReturnType<SpacedReviewController["generatePaper"]>;
    const paper = await generateWithProgress({
      explanationLanguage: "zh-TW"
    }, (value) => progress.push(value));
    const grade = await controller.gradePaper({
      paperId: paper.paperId,
      answers: [{ questionId: "q1", answer: "銀行" }]
    });
    await controller.confirmPaper({
      paperId: paper.paperId,
      ratings: [{ questionId: "q1", finalRating: "hard" }]
    });

    expect(grade.results[0].rating).toBe("easy");
    expect(grade.results[0].expressionFeedback).toEqual({
      status: "not-applicable",
      message: null,
      suggestedAnswer: null
    });
    expect(progress).toEqual([
      { phase: "preparing", completedCount: 0, totalCount: 1 }
    ]);
    expect(confirmReviewSession).toHaveBeenCalledWith({
      sessionId: paper.paperId,
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: [{
        itemId: "item-1",
        aiRating: "easy",
        finalRating: "hard"
      }]
    });
    await expect(controller.gradePaper({
      paperId: paper.paperId,
      answers: [{ questionId: "q1", answer: "銀行" }]
    })).rejects.toThrow(/格式/);
  });
});
