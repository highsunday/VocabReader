import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import { SpacedReviewWorkspace } from "./SpacedReviewWorkspace";

function reviewApi() {
  const paper = {
    paperId: "paper-1",
    questions: [{
      questionId: "q1",
      itemId: "item-1",
      title: "bank",
      sense: "financial institution",
      cefr: "A2" as const,
      beforeTarget: "She went to the ",
      targetText: "bank",
      afterTarget: " before work."
    }]
  };
  return {
    getSummary: vi.fn(async () => ({
      dueReviewedCount: 0,
      newCount: 1,
      totalAvailable: 1,
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
      }],
      nextDueAt: null
    })),
    generatePaper: vi.fn(async () => paper),
    gradePaper: vi.fn(async () => ({
      paperId: paper.paperId,
      results: [{
        questionId: "q1",
        itemId: "item-1",
        feedback: "答案完整且符合語境。",
        rating: "easy" as const
      }]
    })),
    confirmPaper: vi.fn(async () => ({
      sessionId: paper.paperId,
      reviewedAt: "2026-07-24T08:00:00.000Z",
      remainingAvailable: 0,
      entries: [{
        id: "event-1",
        sessionId: paper.paperId,
        itemId: "item-1",
        reviewedAt: "2026-07-24T08:00:00.000Z",
        aiRating: "easy" as const,
        finalRating: "forgotten" as const,
        intervalSeconds: 60,
        nextDueAt: "2026-07-24T08:01:00.000Z"
      }]
    })),
    discardPaper: vi.fn(async () => undefined),
    getItemDetail: vi.fn(),
    onGenerationProgress: vi.fn(() => () => undefined)
  } satisfies ReviewDesktopApi;
}

describe("SpacedReviewWorkspace", () => {
  it("shows live generation prose while hiding an incomplete paper artifact", async () => {
    const api = reviewApi() as ReviewDesktopApi & {
      onGenerationProgress(
        listener: (progress: { text: string }) => void
      ): () => void;
    };
    let publishProgress: ((progress: { text: string }) => void) | undefined;
    let resolvePaper: ((paper: Awaited<
      ReturnType<ReviewDesktopApi["generatePaper"]>
    >) => void) | undefined;
    const unsubscribeProgress = vi.fn();
    api.onGenerationProgress = vi.fn((listener) => {
      publishProgress = listener;
      return unsubscribeProgress;
    });
    api.generatePaper = vi.fn(() => new Promise<
      Awaited<ReturnType<ReviewDesktopApi["generatePaper"]>>
    >((resolve) => {
      resolvePaper = resolve;
    }));
    const { unmount } = render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    publishProgress?.({
      text: "正在準備 1/1：bank\n```review-paper\n{\"paperId\":"
    });

    expect(await screen.findByText("正在準備 1/1：bank"))
      .toBeInTheDocument();
    expect(screen.queryByText(/paperId/)).not.toBeInTheDocument();

    resolvePaper?.({
      paperId: "paper-1",
      questions: [{
        questionId: "q1",
        itemId: "item-1",
        title: "bank",
        sense: "financial institution",
        cefr: "A2",
        beforeTarget: "She went to the ",
        targetText: "bank",
        afterTarget: "."
      }]
    });
    expect(await screen.findByText("bank", { selector: "u" }))
      .toBeInTheDocument();
    expect(screen.queryByText("正在準備 1/1：bank")).not.toBeInTheDocument();
    unmount();
    expect(unsubscribeProgress).toHaveBeenCalledOnce();
  });

  it("generates, submits blank answers, allows rating overrides and confirms once", async () => {
    const api = reviewApi();
    const { unmount } = render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    expect(await screen.findByText("bank", { selector: "u" }))
      .toBeInTheDocument();
    expect(screen.getByText("1 題未作答，提交後將評為忘記。"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "提交試卷（1 題未作答）"
    }));
    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    expect(api.gradePaper).toHaveBeenCalledWith({
      paperId: "paper-1",
      answers: [{ questionId: "q1", answer: "" }]
    });

    fireEvent.click(screen.getByRole("radio", { name: "忘記" }));
    fireEvent.click(screen.getByRole("button", {
      name: "接受評級並更新排程"
    }));
    await waitFor(() => expect(api.confirmPaper).toHaveBeenCalledWith({
      paperId: "paper-1",
      ratings: [{ questionId: "q1", finalRating: "forgotten" }]
    }));
    expect(await screen.findByRole("heading", { name: "本回合已完成" }))
      .toBeInTheDocument();
    expect(screen.getByText("0 個可複習")).toBeInTheDocument();

    unmount();
    expect(api.discardPaper).toHaveBeenCalled();
  });
});
