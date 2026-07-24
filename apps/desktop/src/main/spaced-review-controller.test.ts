import { describe, expect, it, vi } from "vitest";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";
import { SpacedReviewController } from "./spaced-review-controller";

function fakeClient(): CodexAppServerClient {
  let listener: ((notification: CodexNotification) => void) | undefined;
  return {
    initialize: vi.fn(async () => undefined),
    readAccount: vi.fn(async () => ({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: false
    })),
    request: vi.fn(async (method, params) => {
      if (method === "thread/start") return { thread: { id: "thread-1" } };
      if (method === "turn/start") {
        const input = params?.input as Array<{ type: string; text?: string }>;
        const prompt = input.find(({ type }) => type === "text")?.text ?? "";
        const generationPayload = prompt.match(/Paper payload: (.+)\n/)?.[1];
        const gradingPayload = prompt.match(/Validated paper: (.+)\n/)?.[1];
        const response = generationPayload
          ? (() => {
              const payload = JSON.parse(generationPayload);
              const item = payload.items[0];
              return `\`\`\`review-paper
${JSON.stringify({
  paperId: payload.paperId,
  questions: [{
    questionId: "q1",
    itemId: item.itemId,
    title: item.title,
    sense: item.sense,
    cefr: item.cefr,
    beforeTarget: "She visited the ",
    targetText: "bank",
    afterTarget: "."
  }]
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
    rating: "easy"
  }]
})}
\`\`\``;
            })();
        setTimeout(() => {
          listener?.({
            method: "item/agentMessage/delta",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              itemId: "message-1",
              delta: "正在準備 1/1：bank\n"
            }
          });
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

describe("SpacedReviewController", () => {
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

    const progress: string[] = [];
    const generateWithProgress = controller.generatePaper.bind(controller) as
      unknown as (
        input: { explanationLanguage: "zh-TW" },
        onProgress: (text: string) => void
      ) => ReturnType<SpacedReviewController["generatePaper"]>;
    const paper = await generateWithProgress({
      explanationLanguage: "zh-TW"
    }, (text) => progress.push(text));
    const grade = await controller.gradePaper({
      paperId: paper.paperId,
      answers: [{ questionId: "q1", answer: "銀行" }]
    });
    await controller.confirmPaper({
      paperId: paper.paperId,
      ratings: [{ questionId: "q1", finalRating: "hard" }]
    });

    expect(grade.results[0].rating).toBe("easy");
    expect(progress).toEqual(["正在準備 1/1：bank\n"]);
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
