import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LearningDesktopApi } from "../shared/learning-contracts";
import type {
  ReviewDesktopApi,
  ReviewGenerationProgress,
  ReviewPaper
} from "../shared/review-contracts";
import { SpacedReviewWorkspace } from "./SpacedReviewWorkspace";

const ratingOptionsForTest = {
  forgotten: "忘記",
  hard: "困難",
  good: "順利",
  easy: "簡單"
} as const;

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

function learningApi() {
  return {
    listItems: vi.fn(async () => []),
    getItem: vi.fn(async (itemId: string) => ({
      id: itemId,
      title: "bank",
      itemType: "word" as const,
      cefr: "A2" as const,
      sense: "financial institution",
      markdownContent: "## Meaning\n銀行／金融機構",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      trashedAt: null
    })),
    updateItem: vi.fn(),
    trashItem: vi.fn(),
    restoreItem: vi.fn(),
    emptyTrash: vi.fn()
  } satisfies LearningDesktopApi;
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
      "比對詞義與句子語境，並在適用時提供遣詞用句建議。"
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

  it("shows a wording correction in the answer field without expression advice", async () => {
    const api = reviewApi();
    api.gradePaper = vi.fn(async () => ({
      paperId: "paper-1",
      results: [{
        questionId: "q1",
        itemId: "item-1",
        feedback: "核心詞義正確。",
        recommendedAnswer:
          "A bank is a place where people keep and manage their money.",
        rating: "easy" as const,
        expressionFeedback: {
          status: "improvable" as const,
          message: "institution 比 place 更精確。",
          suggestedAnswer:
            "A bank is an institution where people deposit or withdraw money."
        }
      }]
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
    fireEvent.change(await screen.findByLabelText("這個詞在句中的意思"), {
      target: { value: "It is a place that saves people's money." }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));

    const meaning = await screen.findByRole("region", { name: "意思判斷" });
    expect(within(meaning).getByText("核心詞義正確。")).toBeInTheDocument();
    expect(within(meaning).getByText("下次可以這樣回答"))
      .toBeInTheDocument();
    expect(within(meaning).getByText(
      "A bank is a place where people keep and manage their money."
    )).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "表達建議" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("institution 比 place 更精確。"))
      .not.toBeInTheDocument();
    const answerArea = screen.getByText("這個詞在句中的意思").closest("label");
    expect(within(answerArea!).getByText("口語修正 →")).toBeInTheDocument();
    expect(within(answerArea!).getByText(
      "A bank is an institution where people deposit or withdraw money."
    )).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "簡單" })).toBeChecked();
  });

  it.each([
    {
      label: "other-language answer",
      feedback: {
        status: "not-applicable" as const,
        message: null,
        suggestedAnswer: null
      },
      expectedMessage: null
    },
    {
      label: "short target-language answer",
      feedback: {
        status: "natural" as const,
        message: "financial institution 是自然且精確的說法。",
        suggestedAnswer: null
      },
      expectedMessage: "financial institution 是自然且精確的說法。"
    }
  ])("handles $label without inventing a rewrite", async ({
    feedback,
    expectedMessage
  }) => {
    const api = reviewApi();
    api.gradePaper = vi.fn(async () => ({
      paperId: "paper-1",
      results: [{
        questionId: "q1",
        itemId: "item-1",
        feedback: "核心詞義正確。",
        rating: "easy" as const,
        expressionFeedback: feedback
      }]
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
    fireEvent.change(await screen.findByLabelText("這個詞在句中的意思"), {
      target: { value: expectedMessage ? "financial institution" : "金融機構" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));

    expect(await screen.findByRole("region", { name: "意思判斷" }))
      .toHaveTextContent("核心詞義正確。");
    expect(screen.queryByRole("region", { name: "表達建議" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(expectedMessage ?? "不會出現的訊息"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("口語修正 →")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "簡單" })).toBeChecked();
  });

  it("shows the correct contextual meaning when a blank answer is graded forgotten", async () => {
    const api: ReviewDesktopApi = reviewApi();
    api.gradePaper = vi.fn(async () => ({
      paperId: "paper-1",
      results: [{
        questionId: "q1",
        itemId: "item-1",
        feedback: "這題沒有作答。",
        recommendedAnswer: "bank 在這個句子中指銀行或金融機構。",
        rating: "forgotten" as const,
        expressionFeedback: {
          status: "not-applicable" as const,
          message: null,
          suggestedAnswer: null
        }
      }]
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
      name: "提交試卷（1 題未作答）"
    }));

    const meaning = await screen.findByRole("region", { name: "意思判斷" });
    expect(meaning).toHaveTextContent("這題沒有作答。");
    expect(meaning).toHaveTextContent("下次可以這樣回答");
    expect(meaning).toHaveTextContent(
      "bank 在這個句子中指銀行或金融機構。"
    );
    expect(screen.getByRole("radio", { name: "忘記" })).toBeChecked();
    expect(screen.queryByRole("region", { name: "表達建議" }))
      .not.toBeInTheDocument();
  });

  it("colors the current rating and opens a read-only learning item after grading", async () => {
    const api = reviewApi();
    api.getItemDetail = vi.fn(async () => ({
      status: "new" as const,
      lastReviewedAt: null,
      lastFinalRating: null,
      nextDueAt: null,
      reviewCount: 0,
      history: []
    }));
    const learning = learningApi();
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    const answer = await screen.findByLabelText("這個詞在句中的意思");
    expect(screen.queryByRole("button", { name: "打開學習卡" }))
      .not.toBeInTheDocument();
    fireEvent.change(answer, { target: { value: "金融機構" } });
    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));

    const meaning = await screen.findByRole("region", { name: "意思判斷" });
    const feedback = meaning.closest(".review-feedback");
    expect(feedback).toHaveAttribute("data-rating", "easy");
    expect(feedback).toHaveAccessibleName("批改結果：簡單");

    const detailTrigger = screen.getByRole("button", {
      name: "打開學習卡"
    });
    fireEvent.click(detailTrigger);
    expect(learning.getItem).toHaveBeenCalledWith("item-1");
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).getByRole("heading", { name: "Meaning" }))
      .toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "複習排程" }))
      .toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "編輯" }))
      .not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "刪除" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", {
      name: "關閉卡片詳情"
    }));
    await waitFor(() => expect(detailTrigger).toHaveFocus());

    fireEvent.click(detailTrigger);
    expect(await screen.findByRole("dialog", { name: "bank" }))
      .toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "bank" }))
      .not.toBeInTheDocument();
    await waitFor(() => expect(detailTrigger).toHaveFocus());

    fireEvent.click(detailTrigger);
    expect(await screen.findByRole("dialog", { name: "bank" }))
      .toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("learning-detail-backdrop"));
    expect(screen.queryByRole("dialog", { name: "bank" }))
      .not.toBeInTheDocument();
    await waitFor(() => expect(detailTrigger).toHaveFocus());

    fireEvent.click(screen.getByRole("radio", { name: "困難" }));
    expect(feedback).toHaveAttribute("data-rating", "hard");
    expect(feedback).toHaveAccessibleName("批改結果：困難");
    expect(screen.getByText("AI 建議：簡單")).toBeInTheDocument();
    expect(answer).toHaveValue("金融機構");
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(learning.updateItem).not.toHaveBeenCalled();
    expect(learning.trashItem).not.toHaveBeenCalled();
  });

  it("marks all four AI ratings with distinct result states", async () => {
    const api: ReviewDesktopApi = reviewApi();
    const ratings = ["forgotten", "hard", "good", "easy"] as const;
    const questions = ratings.map((rating, index) => ({
      questionId: `q${index + 1}`,
      itemId: `item-${index + 1}`,
      title: `word-${index + 1}`,
      sense: `sense-${index + 1}`,
      cefr: "A2" as const,
      beforeTarget: "A ",
      targetText: `word-${index + 1}`,
      afterTarget: " appears here."
    }));
    api.getSummary = vi.fn(async () => ({
      dueReviewedCount: 0,
      newCount: 4,
      totalAvailable: 4,
      selectedItems: questions.map((question, index) => ({
        id: question.itemId,
        title: question.title,
        itemType: "word" as const,
        cefr: "A2" as const,
        sense: question.sense,
        markdownContent: "## Meaning\nMeaning",
        status: "active" as const,
        createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        trashedAt: null,
        reviewKind: "new" as const,
        dueAt: null
      })),
      nextDueAt: null
    }));
    api.generatePaper = vi.fn(async () => ({
      paperId: "paper-4",
      questions
    }));
    api.gradePaper = vi.fn(async () => ({
      paperId: "paper-4",
      results: ratings.map((rating, index) => ({
        questionId: `q${index + 1}`,
        itemId: `item-${index + 1}`,
        feedback: `feedback-${rating}`,
        rating
      }))
    }));
    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "提交試卷（4 題未作答）"
    }));

    for (const [index, rating] of ratings.entries()) {
      const meaning = await screen.findByText(`feedback-${rating}`);
      expect(meaning.closest(".review-feedback"))
        .toHaveAttribute("data-rating", rating);
      expect(screen.getAllByRole("radio", {
        name: ratingOptionsForTest[rating]
      })[index]).toBeChecked();
    }
  });

  it("keeps the graded paper intact when learning item detail cannot load", async () => {
    const api = reviewApi();
    const learning = learningApi();
    learning.getItem = vi.fn(async () => {
      throw new Error("找不到學習項目");
    });
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    fireEvent.change(await screen.findByLabelText("這個詞在句中的意思"), {
      target: { value: "金融機構" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));
    fireEvent.click(await screen.findByRole("button", {
      name: "打開學習卡"
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到學習項目");
    expect(screen.getByRole("radio", { name: "簡單" })).toBeChecked();
    expect(screen.getByRole("button", { name: "接受評級並更新排程" }))
      .toBeEnabled();
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
