import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ReviewDesktopApi,
  ReviewGenerationProgress,
  ReviewPaper
} from "../shared/review-contracts";
import { SpacedReviewWorkspace } from "./SpacedReviewWorkspace";

function reviewApi() {
  const paper: ReviewPaper = {
    paperId: "paper-1",
    questions: [{
      questionId: "q1",
      itemId: "item-1",
      title: "bank",
      sense: "financial institution",
      cefr: "A2",
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
  it("keeps AI generation feedback inside one staged status card", async () => {
    const api = reviewApi() as ReviewDesktopApi & {
      onGenerationProgress(
        listener: (progress: ReviewGenerationProgress) => void
      ): () => void;
    };
    let publishProgress:
      ((progress: ReviewGenerationProgress) => void) | undefined;
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
    const generationCard = await screen.findByRole("region", {
      name: "AI 生成試卷"
    });
    expect(generationCard).toHaveAttribute("aria-busy", "true");
    expect(within(generationCard).getByText("正在準備 1 題複習試卷"))
      .toBeInTheDocument();
    expect(within(generationCard).getByRole("progressbar", {
      name: "AI 生成試卷進度"
    })).toBeInTheDocument();
    expect(within(generationCard).getByText("已等待 0 秒"))
      .toBeInTheDocument();
    expect(screen.queryByText("AI 正在依本回合項目生成例句…"))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/Preparing/)).not.toBeInTheDocument();

    publishProgress?.({
      phase: "preparing",
      completedCount: 1,
      totalCount: 4
    });
    const progressbar = within(generationCard).getByRole("progressbar", {
      name: "AI 生成試卷進度"
    });
    expect(await screen.findByText("已完成 1／4 題例句"))
      .toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuenow", "1");
    expect(progressbar).toHaveAttribute("aria-valuemax", "4");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "25%" });

    publishProgress?.({
      phase: "assembling",
      completedCount: 4,
      totalCount: 4
    });
    expect(await screen.findByText("例句已完成，正在組裝並檢查試卷"))
      .toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuenow", "4");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "100%" });
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
    expect(screen.queryByRole("region", { name: "AI 生成試卷" }))
      .not.toBeInTheDocument();
    unmount();
    expect(unsubscribeProgress).toHaveBeenCalledOnce();
  });

  it("cancels generation and ignores a late paper result", async () => {
    const api = reviewApi();
    let resolvePaper: ((paper: Awaited<
      ReturnType<ReviewDesktopApi["generatePaper"]>
    >) => void) | undefined;
    api.generatePaper = vi.fn(() => new Promise<
      Awaited<ReturnType<ReviewDesktopApi["generatePaper"]>>
    >((resolve) => {
      resolvePaper = resolve;
    }));
    render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "取消生成"
    }));

    expect(api.discardPaper).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", {
      name: "生成本回合試卷"
    })).toBeInTheDocument();

    resolvePaper?.({
      paperId: "late-paper",
      questions: [{
        questionId: "late-q1",
        itemId: "item-1",
        title: "bank",
        sense: "financial institution",
        cefr: "A2",
        beforeTarget: "She visited the ",
        targetText: "bank",
        afterTarget: "."
      }]
    });
    await waitFor(() => {
      expect(screen.queryByText("bank", { selector: "u" }))
        .not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an accessible status card while AI grades the paper", async () => {
    const api: ReviewDesktopApi = reviewApi();
    let resolveGrade: ((grade: Awaited<
      ReturnType<ReviewDesktopApi["gradePaper"]>
    >) => void) | undefined;
    api.gradePaper = vi.fn(() => new Promise<
      Awaited<ReturnType<ReviewDesktopApi["gradePaper"]>>
    >((resolve) => {
      resolveGrade = resolve;
    }));
    render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    await screen.findByText("bank", { selector: "u" });
    fireEvent.click(screen.getByRole("button", {
      name: "提交試卷（1 題未作答）"
    }));

    const gradingStatus = await screen.findByRole("status", {
      name: "AI 正在批改試卷"
    });
    expect(gradingStatus).toHaveAttribute("aria-busy", "true");
    expect(within(gradingStatus).getByRole("heading", {
      name: "正在分析你的答案"
    })).toBeInTheDocument();
    expect(within(gradingStatus).getByText(
      "比對詞義與句子語境，完成後會逐題提供回饋與複習評級建議。"
    )).toBeInTheDocument();

    resolveGrade?.({
      paperId: "paper-1",
      results: [{
        questionId: "q1",
        itemId: "item-1",
        feedback: "答案完整且符合語境。",
        rating: "easy"
      }]
    });
    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    expect(screen.queryByRole("status", {
      name: "AI 正在批改試卷"
    })).not.toBeInTheDocument();
  });

  it("keeps the round summary and current paper together when leaving and viewing", async () => {
    const api = reviewApi();
    render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    const answer = await screen.findByLabelText("這個詞在句中的意思");
    fireEvent.change(answer, { target: { value: "銀行" } });
    fireEvent.click(screen.getByRole("button", { name: "先離開" }));

    expect(screen.queryByText("bank", { selector: "u" }))
      .not.toBeInTheDocument();
    const roundSummary = screen.getByText("本回合").closest("section");
    const currentPaper = screen.getByRole("region", { name: "當前試卷" });
    expect(roundSummary).toBeInTheDocument();
    expect(roundSummary?.nextElementSibling).toBe(currentPaper);
    expect(within(currentPaper).getByText(/已作答 1／1 題/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成本回合試卷" }))
      .not.toBeInTheDocument();
    expect(api.discardPaper).not.toHaveBeenCalled();

    fireEvent.click(within(currentPaper).getByRole("button", {
      name: "查看試卷"
    }));
    expect(screen.getByText("本回合")).toBeInTheDocument();
    expect(await screen.findByLabelText("這個詞在句中的意思"))
      .toHaveValue("銀行");

    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));
    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "忘記" }));
    fireEvent.click(screen.getByRole("button", { name: "先離開" }));
    expect(screen.getByRole("region", { name: "當前試卷" }))
      .toHaveTextContent("等待確認評級");
    fireEvent.click(screen.getByRole("button", { name: "查看試卷" }));

    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    expect(screen.getByText("本回合")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "忘記" })).toBeChecked();
    expect(api.generatePaper).toHaveBeenCalledOnce();
    expect(api.gradePaper).toHaveBeenCalledOnce();
    expect(api.discardPaper).not.toHaveBeenCalled();
  });

  it("confirms before abandoning the current paper without updating schedules", async () => {
    const api = reviewApi();
    const onStatusChange = vi.fn();
    render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    await screen.findByText("bank", { selector: "u" });
    fireEvent.click(screen.getByRole("button", { name: "先離開" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "resumable"
    ));

    fireEvent.click(screen.getByRole("button", { name: "放棄試卷" }));
    const firstConfirmation = screen.getByRole("alertdialog", {
      name: "放棄目前試卷？"
    });
    expect(firstConfirmation).toHaveTextContent(
      "題目、答案、AI 回饋與未確認評級都會清除"
    );
    expect(firstConfirmation).toHaveTextContent("無法復原");
    fireEvent.click(within(firstConfirmation).getByRole("button", {
      name: "取消"
    }));

    expect(screen.queryByRole("alertdialog", {
      name: "放棄目前試卷？"
    })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看試卷" }))
      .toBeInTheDocument();
    expect(api.discardPaper).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "放棄試卷" }));
    const secondConfirmation = screen.getByRole("alertdialog", {
      name: "放棄目前試卷？"
    });
    fireEvent.click(within(secondConfirmation).getByRole("button", {
      name: "確認放棄"
    }));

    await waitFor(() => expect(api.discardPaper).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", {
      name: "生成本回合試卷"
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看試卷" }))
      .not.toBeInTheDocument();
    expect(api.confirmPaper).not.toHaveBeenCalled();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "idle"
    ));
  });

  it("generates, submits blank answers, allows rating overrides and confirms once", async () => {
    const api = reviewApi();
    const onStatusChange = vi.fn();
    const { unmount } = render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    expect(await screen.findByText("bank", { selector: "u" }))
      .toBeInTheDocument();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "resumable"
    ));
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
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "idle"
    ));
    expect(screen.getByText("0 個可複習")).toBeInTheDocument();

    unmount();
    expect(api.discardPaper).toHaveBeenCalled();
  });
});
