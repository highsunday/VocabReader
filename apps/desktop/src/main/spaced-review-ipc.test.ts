import { describe, expect, it, vi } from "vitest";
import { registerSpacedReviewIpc } from "./spaced-review-ipc";
import type { SpacedReviewController } from "./spaced-review-controller";

describe("spaced review IPC", () => {
  it("registers only typed review operations and rejects malformed payloads", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const controller = {
      getSummary: vi.fn(async () => ({ totalAvailable: 0 })),
      generatePaper: vi.fn(async (
        _input: unknown,
        onProgress?: (progress: {
          phase: "preparing" | "assembling";
          completedCount: number;
          totalCount: number;
        }) => void
      ) => {
        onProgress?.({
          phase: "preparing",
          completedCount: 1,
          totalCount: 2
        });
        onProgress?.({
          phase: "assembling",
          completedCount: 2,
          totalCount: 2
        });
        return { paperId: "paper-1", questions: [] };
      }),
      gradePaper: vi.fn(),
      confirmPaper: vi.fn(),
      discardPaper: vi.fn(),
      getItemDetail: vi.fn()
    } as unknown as SpacedReviewController;
    registerSpacedReviewIpc({
      handle: (channel, handler) => handlers.set(channel, handler)
    }, controller);

    expect([...handlers.keys()].sort()).toEqual([
      "review:confirm",
      "review:discard",
      "review:generate",
      "review:grade",
      "review:item-detail",
      "review:summary"
    ]);
    await handlers.get("review:summary")?.({}, "1900-01-01T00:00:00.000Z");
    expect(controller.getSummary).toHaveBeenCalledWith();
    await handlers.get("review:item-detail")?.(
      {},
      "item-1",
      "1900-01-01T00:00:00.000Z"
    );
    expect(controller.getItemDetail).toHaveBeenCalledWith("item-1");
    const send = vi.fn();
    await handlers.get("review:generate")?.({ sender: { send } }, {
      explanationLanguage: "zh-TW"
    });
    expect(controller.generatePaper).toHaveBeenCalledWith({
      explanationLanguage: "zh-TW"
    }, expect.any(Function));
    expect(send.mock.calls).toContainEqual([
      "review:generation-progress",
      { phase: "preparing", completedCount: 1, totalCount: 2 }
    ]);
    expect(send.mock.calls).toContainEqual([
      "review:generation-progress",
      { phase: "assembling", completedCount: 2, totalCount: 2 }
    ]);
    expect(JSON.stringify(send.mock.calls)).not.toContain("paperId");
    expect(() => handlers.get("review:generate")?.({}, {
      explanationLanguage: "arbitrary"
    })).toThrow(/生成格式/);
    expect(() => handlers.get("review:confirm")?.({}, {
      paperId: "paper-1",
      ratings: [{ questionId: "q1", finalRating: "perfect" }]
    })).toThrow(/確認格式/);
  });
});
