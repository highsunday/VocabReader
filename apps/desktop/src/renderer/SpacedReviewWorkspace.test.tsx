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
import type {
  ReviewDesktopApi,
  ReviewGenerationProgress,
  ReviewPaper
} from "../shared/review-contracts";
import { SpacedReviewWorkspace } from "./SpacedReviewWorkspace";

const ratingOptionsForTest = {
  forgotten: "Forgotten",
  hard: "Hard",
  good: "Good",
  easy: "Easy"
} as const;

function reviewApi(): ReviewDesktopApi {
  let reviewConfirmed = false;
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
      newCount: reviewConfirmed ? 0 : 1,
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      newLearningCount: 0,
      dueLearningCount: 0,
      newCompletionLimit: 10,
      dueReviewCompletionLimit: 50,
      reviewPaperSize: 10,
      newRemainingCapacity: reviewConfirmed ? 9 : 10,
      dueRemainingCapacity: 50,
      backlogTotal: reviewConfirmed ? 0 : 1,
      totalAvailable: reviewConfirmed ? 0 : 1,
      selectedItems: reviewConfirmed ? [] : [{
        id: "item-1",
        title: "bank",
        itemType: "word" as const,
      language: "en" as const,
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
    confirmPaper: vi.fn(async () => {
      reviewConfirmed = true;
      return {
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
          answer: "",
          intervalSeconds: 60,
          nextDueAt: "2026-07-24T08:01:00.000Z"
        }]
      };
    }),
    discardPaper: vi.fn(async () => undefined),
    getItemDetail: vi.fn(async () => ({
      status: "new" as const,
      lastReviewedAt: null,
      lastFinalRating: null,
      nextDueAt: null,
      reviewCount: 0,
      history: []
    })),
    onGenerationProgress: vi.fn(() => () => undefined)
  } satisfies ReviewDesktopApi;
}

function learningApi() {
  return {
    listItems: vi.fn(async () => ({ items: [], nextCursor: null })),
    countItems: vi.fn(async () => ({ active: 0, trashed: 0 })),
    getItem: vi.fn(async (itemId: string) => ({
      id: itemId,
      title: "bank",
      itemType: "word" as const,
      language: "en" as const,
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

async function completeCurrentReview() {
  fireEvent.click(await screen.findByRole("button", {
    name: /Start a \d+-question review/
  }));
  fireEvent.click(await screen.findByRole("button", {
    name: /Submit paper/
  }));
  fireEvent.click(await screen.findByRole("button", {
    name: "Accept ratings and update schedule"
  }));
  await screen.findByRole("heading", { name: "Session complete" });
}

describe("SpacedReviewWorkspace", () => {
  it("shows completed cards against the configured daily limits", async () => {
    const api = reviewApi();
    api.getSummary = vi.fn(async () => ({
      dueReviewedCount: 0,
      newCount: 0,
      reviewedNewTodayCount: 2,
      reviewedDueTodayCount: 4,
      newLearningCount: 1,
      dueLearningCount: 3,
      newCompletionLimit: 10,
      dueReviewCompletionLimit: 50,
      reviewPaperSize: 10,
      newRemainingCapacity: 7,
      dueRemainingCapacity: 43,
      backlogTotal: 0,
      totalAvailable: 0,
      selectedItems: [],
      nextDueAt: "2026-07-29T08:00:00.000Z"
    }));

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    expect(await screen.findByText("No cards are ready to practice"))
      .toBeInTheDocument();
    const status = screen.getByRole("region", {
      name: "Today's review status"
    });
    expect(status).toHaveTextContent(
      "Today's progressCompleted / daily limitNew items2/10Due reviews4/50"
    );
    expect(screen.queryByText("今日安排")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ 50/)).not.toBeInTheDocument();
    expect(screen.queryByText(/名額/)).not.toBeInTheDocument();
  });

  it("shows the next due time instead of claiming a waiting backlog is completed", async () => {
    const api = reviewApi();
    const baseSummary = await api.getSummary();
    api.getSummary = vi.fn(async () => ({
      ...baseSummary,
      newCount: 50,
      reviewedNewTodayCount: 20,
      newLearningCount: 6,
      newCompletionLimit: 20,
      newRemainingCapacity: 0,
      backlogTotal: 50,
      totalAvailable: 0,
      selectedItems: [],
      nextDueAt: new Date(Date.now() + 60_000).toISOString()
    }));

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    expect(await screen.findByText(/The next card is due in 1 minutes./))
      .toBeInTheDocument();
    expect(screen.queryByText(
      "Today's review is complete. Adjust daily limits in Settings if needed."
    )).not.toBeInTheDocument();
  });

  it("refreshes the review summary when the next learning item becomes due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T03:51:00.000Z"));
    const api = reviewApi();
    const baseSummary = await api.getSummary();
    const waitingSummary = {
      ...baseSummary,
      newCount: 50,
      reviewedNewTodayCount: 20,
      newLearningCount: 6,
      newCompletionLimit: 20,
      newRemainingCapacity: 0,
      backlogTotal: 50,
      totalAvailable: 0,
      selectedItems: [],
      nextDueAt: "2026-07-29T03:52:00.000Z"
    };
    const availableSummary = {
      ...waitingSummary,
      totalAvailable: 1,
      availableLearningCount: 1,
      selectedItems: baseSummary.selectedItems,
      nextDueAt: null
    };
    api.getSummary = vi.fn()
      .mockResolvedValueOnce(waitingSummary)
      .mockResolvedValueOnce(availableSummary);
    const onAvailableCountChange = vi.fn();
    let unmount: () => void = () => undefined;

    try {
      await act(async () => {
        ({ unmount } = render(
          <SpacedReviewWorkspace
            api={api}
            explanationLanguage="zh-TW"
            onAvailableCountChange={onAvailableCountChange}
          />
        ));
      });
      expect(api.getSummary).toHaveBeenCalledTimes(1);
      expect(onAvailableCountChange).toHaveBeenLastCalledWith(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(api.getSummary).toHaveBeenCalledTimes(2);
      expect(onAvailableCountChange).toHaveBeenLastCalledWith(1);
      expect(screen.getByRole("button", {
        name: "Start a 1-question review"
      })).toBeInTheDocument();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("keeps new-card and review-card progress separate", async () => {
    const api = reviewApi();
    const baseSummary = await api.getSummary();
    api.getSummary = vi.fn(async () => ({
      ...baseSummary,
      reviewedNewTodayCount: 3,
      reviewedDueTodayCount: 5,
      newCompletionLimit: 12,
      dueReviewCompletionLimit: 30
    }));

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    const status = await screen.findByRole("region", {
      name: "Today's review status"
    });
    expect(status).toHaveTextContent(
      "New items3/12Due reviews5/30"
    );
    const primaryAction = screen.getByRole("region", {
      name: "Complete 1 questions to keep your memory moving"
    });
    expect(
      status.compareDocumentPosition(primaryAction) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows a simple, accessible 90-day solid-recall outcome", async () => {
    const api = reviewApi();
    const baseSummary = await api.getSummary();
    const daily = Array.from({ length: 90 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 1 + index))
        .toISOString().slice(0, 10),
      solidItemCount: 100 + Math.floor(index * 28 / 89)
    }));
    api.getSummary = vi.fn(async () => ({
      ...baseSummary,
      learningProgress: {
        periodDays: 90,
        solidItemCount: 128,
        solidItemCountDelta30Days: 14,
        buildingItemCount: 42,
        recallRate30Days: 88,
        recallReviewCount30Days: 34,
        daily
      },
      reviewActivity: {
        periodDays: 30,
        completedReviewCount: 5,
        daily: Array.from({ length: 30 }, (_, index) => ({
          date: `2026-07-${String(index + 1).padStart(2, "0")}`,
          newCompletedCount: index === 28 ? 2 : 0,
          dueCompletedCount: index === 29 ? 3 : 0
        }))
      }
    }));

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    const growth = await screen.findByRole("region", {
      name: "Learning growth"
    });
    const primaryAction = screen.getByRole("region", {
      name: "Complete 1 questions to keep your memory moving"
    });
    expect(primaryAction).toHaveTextContent("Start today's review");
    expect(
      primaryAction.compareDocumentPosition(growth) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(growth).toHaveTextContent("Solid recall128words & phrases");
    expect(growth).toHaveTextContent("+14 in the last 30 days");
    expect(growth).toHaveTextContent("Building42");
    expect(growth).toHaveTextContent("30-day recall88%");
    expect(growth).toHaveTextContent("Based on 34 follow-up reviews");
    expect(within(growth).getByRole("img", {
      name: /90-day solid recall trend from 100 to 128/
    })).toBeInTheDocument();
    expect(growth.querySelector("svg path")).toBeInTheDocument();
    expect(growth.querySelector(".review-growth-days")).not.toBeInTheDocument();
    expect(growth).not.toHaveTextContent("Daily average");
    expect(growth).not.toHaveTextContent("Active days");
    const activity = screen.getByRole("region", {
      name: "Review activity"
    });
    expect(activity).toHaveTextContent("30-day review activity");
    expect(activity).toHaveTextContent("5 reviews · 2 active days");
    expect(within(activity).getByRole("list", {
      name: /Review activity over the past 30 days/
    })).toBeInTheDocument();
    expect(within(activity).getAllByRole("listitem")).toHaveLength(30);
  });

  it("renders a safe empty solid-recall outcome", async () => {
    const api = reviewApi();
    const baseSummary = await api.getSummary();
    api.getSummary = vi.fn(async () => ({
      ...baseSummary,
      learningProgress: {
        periodDays: 90,
        solidItemCount: 0,
        solidItemCountDelta30Days: 0,
        buildingItemCount: 0,
        recallRate30Days: null,
        recallReviewCount30Days: 0,
        daily: Array.from({ length: 90 }, (_, index) => ({
          date: new Date(Date.UTC(2026, 4, 1 + index))
            .toISOString().slice(0, 10),
          solidItemCount: 0
        }))
      },
      reviewActivity: {
        periodDays: 30,
        completedReviewCount: 0,
        daily: Array.from({ length: 30 }, (_, index) => ({
          date: `2026-07-${String(index + 1).padStart(2, "0")}`,
          newCompletedCount: 0,
          dueCompletedCount: 0
        }))
      }
    }));

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    const growth = await screen.findByRole("region", {
      name: "Learning growth"
    });
    expect(growth).toHaveTextContent("Solid recall0words & phrases");
    expect(growth).toHaveTextContent("No change in the last 30 days");
    expect(growth).toHaveTextContent("Building0");
    expect(growth).toHaveTextContent("30-day recall—");
    expect(within(growth).getByRole("img", {
      name: /90-day solid recall trend from 0 to 0/
    })).toBeInTheDocument();
    expect(screen.getByRole("region", {
      name: "Review activity"
    })).toHaveTextContent("0 reviews · 0 active days");
  });

  it("refreshes the simplified plan after confirming a review paper", async () => {
    const api = reviewApi();
    api.getSummary = vi.fn()
      .mockResolvedValueOnce({
        dueReviewedCount: 0,
        newCount: 1,
        reviewedNewTodayCount: 0,
        reviewedDueTodayCount: 0,
        newLearningCount: 0,
        dueLearningCount: 0,
        newCompletionLimit: 10,
        dueReviewCompletionLimit: 50,
        reviewPaperSize: 10,
        newRemainingCapacity: 10,
        dueRemainingCapacity: 50,
        backlogTotal: 1,
        totalAvailable: 1,
        learningProgress: {
          periodDays: 90,
          solidItemCount: 0,
          solidItemCountDelta30Days: 0,
          buildingItemCount: 0,
          recallRate30Days: null,
          recallReviewCount30Days: 0,
          daily: Array.from({ length: 90 }, (_, index) => ({
            date: new Date(Date.UTC(2026, 4, 1 + index))
              .toISOString().slice(0, 10),
            solidItemCount: 0
          }))
        },
        selectedItems: [{
          id: "item-1",
          title: "bank",
          itemType: "word" as const,
      language: "en" as const,
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
      })
      .mockResolvedValue({
        dueReviewedCount: 0,
        newCount: 0,
        reviewedNewTodayCount: 1,
        reviewedDueTodayCount: 0,
        newLearningCount: 0,
        dueLearningCount: 0,
        newCompletionLimit: 10,
        dueReviewCompletionLimit: 50,
        reviewPaperSize: 10,
        newRemainingCapacity: 9,
        dueRemainingCapacity: 50,
        backlogTotal: 0,
        totalAvailable: 0,
        learningProgress: {
          periodDays: 90,
          solidItemCount: 1,
          solidItemCountDelta30Days: 1,
          buildingItemCount: 0,
          recallRate30Days: 100,
          recallReviewCount30Days: 1,
          daily: Array.from({ length: 90 }, (_, index) => ({
            date: new Date(Date.UTC(2026, 4, 1 + index))
              .toISOString().slice(0, 10),
            solidItemCount: index < 89 ? 0 : 1
          }))
        },
        selectedItems: [],
        nextDueAt: "2026-07-25T08:00:00.000Z"
      });

    render(
      <SpacedReviewWorkspace api={api} explanationLanguage="zh-TW" />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Submit paper (1 unanswered)"
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Accept ratings and update schedule"
    }));

    expect(await screen.findByRole("heading", { name: "Session complete" }))
      .toBeInTheDocument();
    await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("region", {
      name: "Today's review status"
    })).toHaveTextContent(
      "New items1/10Due reviews0/50"
    );
    expect(screen.getByRole("region", {
      name: "Learning growth"
    })).toHaveTextContent("Solid recall1words & phrases");
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", {
      name: "Back to review overview"
    }));
    expect(await screen.findByText("No cards are ready to practice"))
      .toBeInTheDocument();
    expect(screen.queryByText("今日安排")).not.toBeInTheDocument();
  });

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
      name: /Start a \d+-question review/
    }));
    const generationCard = await screen.findByRole("region", {
      name: "AI paper generation"
    });
    expect(generationCard).toHaveAttribute("aria-busy", "true");
    expect(within(generationCard).getByText("Preparing a 1-question review paper"))
      .toBeInTheDocument();
    expect(within(generationCard).getByRole("progressbar", {
      name: "AI paper generation progress"
    })).toBeInTheDocument();
    expect(within(generationCard).getByText("Waiting for 0 seconds"))
      .toBeInTheDocument();
    expect(screen.queryByText("AI 正在依本回合項目生成例句…"))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole("region", {
      name: "AI paper generation"
    })).toHaveLength(1);

    publishProgress?.({
      phase: "preparing",
      completedCount: 1,
      totalCount: 4
    });
    const progressbar = within(generationCard).getByRole("progressbar", {
      name: "AI paper generation progress"
    });
    expect(await screen.findByText("1/4 example sentences complete"))
      .toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuenow", "1");
    expect(progressbar).toHaveAttribute("aria-valuemax", "4");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "25%" });

    publishProgress?.({
      phase: "assembling",
      completedCount: 4,
      totalCount: 4
    });
    expect(await screen.findByText("Example sentences complete; assembling and validating the paper"))
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
    expect(screen.queryByRole("region", { name: "AI paper generation" }))
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
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Cancel generation"
    }));

    expect(api.discardPaper).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", {
      name: /Start a \d+-question review/
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
      name: /Start a \d+-question review/
    }));
    await screen.findByText("bank", { selector: "u" });
    fireEvent.click(screen.getByRole("button", {
      name: "Submit paper (1 unanswered)"
    }));

    const gradingStatus = await screen.findByRole("status", {
      name: "AI is grading the paper"
    });
    expect(gradingStatus).toHaveAttribute("aria-busy", "true");
    expect(within(gradingStatus).getByRole("heading", {
      name: "Analyzing your answers"
    })).toBeInTheDocument();
    expect(within(gradingStatus).getByText(
      "Comparing meaning with sentence context and offering expression feedback when useful."
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
      name: "AI is grading the paper"
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
      name: /Start a \d+-question review/
    }));
    fireEvent.change(await screen.findByLabelText("Meaning of this word in the sentence"), {
      target: { value: "It is a place that saves people's money." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));

    const meaning = await screen.findByRole("region", { name: "Meaning assessment" });
    expect(within(meaning).getByText("核心詞義正確。")).toBeInTheDocument();
    expect(within(meaning).getByText("A better answer for next time"))
      .toBeInTheDocument();
    expect(within(meaning).getByText(
      "A bank is a place where people keep and manage their money."
    )).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Expression feedback" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("institution 比 place 更精確。"))
      .not.toBeInTheDocument();
    const answerArea = screen.getByText("Meaning of this word in the sentence").closest("label");
    expect(within(answerArea!).getByText("Expression feedback →")).toBeInTheDocument();
    expect(within(answerArea!).getByText(
      "A bank is an institution where people deposit or withdraw money."
    )).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
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
      name: /Start a \d+-question review/
    }));
    fireEvent.change(await screen.findByLabelText("Meaning of this word in the sentence"), {
      target: { value: expectedMessage ? "financial institution" : "金融機構" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));

    expect(await screen.findByRole("region", { name: "Meaning assessment" }))
      .toHaveTextContent("核心詞義正確。");
    expect(screen.queryByRole("region", { name: "Expression feedback" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(expectedMessage ?? "不會出現的訊息"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Expression feedback →")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
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
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Submit paper (1 unanswered)"
    }));

    const meaning = await screen.findByRole("region", { name: "Meaning assessment" });
    expect(meaning).toHaveTextContent("這題沒有作答。");
    expect(meaning).toHaveTextContent("A better answer for next time");
    expect(meaning).toHaveTextContent(
      "bank 在這個句子中指銀行或金融機構。"
    );
    expect(screen.getByRole("radio", { name: "Forgotten" })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Expression feedback" }))
      .not.toBeInTheDocument();
  });

  it("colors the current rating and allows editing but not Trash after grading", async () => {
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
    learning.updateItem = vi.fn(async (input) => ({
      id: input.itemId,
      title: input.title,
      itemType: input.itemType,
      language: input.language,
      cefr: input.cefr,
      sense: input.sense,
      markdownContent: input.markdownContent,
      cautionNote: input.cautionNote,
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-09T08:00:00.000Z",
      trashedAt: null
    }));
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    const answer = await screen.findByLabelText("Meaning of this word in the sentence");
    expect(screen.queryByRole("button", { name: "Open learning card" }))
      .not.toBeInTheDocument();
    fireEvent.change(answer, { target: { value: "金融機構" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));

    const meaning = await screen.findByRole("region", { name: "Meaning assessment" });
    const feedback = meaning.closest(".review-feedback");
    expect(feedback).toHaveAttribute("data-rating", "easy");
    expect(feedback).toHaveAccessibleName("Grading result: Easy");

    const detailTrigger = screen.getByRole("button", {
      name: "Open learning card"
    });
    fireEvent.click(detailTrigger);
    expect(learning.getItem).toHaveBeenCalledWith("item-1");
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).getByRole("heading", { name: "Meaning" }))
      .toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "Review schedule" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Sense" }), {
      target: { value: "a bank or other financial institution" }
    });
    fireEvent.change(within(dialog).getByRole("textbox", {
      name: "Markdown content"
    }), { target: { value: "## Meaning\nUpdated financial meaning" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(learning.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        sense: "a bank or other financial institution",
        markdownContent: "## Meaning\nUpdated financial meaning"
      })
    ));
    expect(await within(dialog).findByText("Updated financial meaning"))
      .toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Delete" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", {
      name: "Close card details"
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

    fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
    expect(feedback).toHaveAttribute("data-rating", "hard");
    expect(feedback).toHaveAccessibleName("Grading result: Hard");
    expect(screen.getByText("AI suggestion: Easy")).toBeInTheDocument();
    expect(answer).toHaveValue("金融機構");
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(learning.updateItem).toHaveBeenCalledTimes(1);
    expect(learning.trashItem).not.toHaveBeenCalled();
    expect(api.confirmPaper).not.toHaveBeenCalled();
  });

  it("applies an AI edit after grading without changing the graded paper", async () => {
    const api = reviewApi();
    const learning = learningApi();
    const aiEdit = {
      start: vi.fn(async () => ({
        sessionId: "edit-reviewing-1",
        itemId: "item-1",
        phase: "ready" as const,
        draft: {
          markdownContent: "## Meaning\n銀行／金融機構",
          cautionNote: ""
        },
        hasChanges: false,
        status: "Ready"
      })),
      send: vi.fn(async () => ({
        sessionId: "edit-reviewing-1",
        itemId: "item-1",
        phase: "ready" as const,
        draft: {
          markdownContent: "## Meaning\n銀行／金融機構\n\nNot a river bank.",
          cautionNote: "Distinguish the financial sense from the river edge."
        },
        hasChanges: true,
        status: "Draft ready"
      })),
      stop: vi.fn(),
      apply: vi.fn(async () => ({
        id: "item-1",
        title: "bank",
        itemType: "word" as const,
        language: "en" as const,
        cefr: "A2" as const,
        sense: "financial institution",
        markdownContent: "## Meaning\n銀行／金融機構\n\nNot a river bank.",
        cautionNote: "Distinguish the financial sense from the river edge.",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-08-09T08:05:00.000Z",
        trashedAt: null
      })),
      discard: vi.fn()
    };
    Object.assign(learning, { aiEdit });

    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    const answer = await screen.findByLabelText("Meaning of this word in the sentence");
    fireEvent.change(answer, { target: { value: "金融機構" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));
    await screen.findByRole("region", { name: "Meaning assessment" });
    fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
    fireEvent.click(screen.getByRole("button", { name: "Open learning card" }));

    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).queryByRole("button", { name: "Delete" }))
      .not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit with AI" }));
    await waitFor(() => expect(aiEdit.start).toHaveBeenCalledWith("item-1"));
    fireEvent.change(within(dialog).getByRole("textbox", {
      name: "AI editing request"
    }), { target: { value: "Add the river-bank distinction." } });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Send AI edit request"
    }));
    await waitFor(() => expect(aiEdit.send).toHaveBeenCalledWith(
      "edit-reviewing-1",
      "Add the river-bank distinction."
    ));
    fireEvent.click(await within(dialog).findByRole("button", {
      name: "Apply AI edit"
    }));

    await waitFor(() => expect(aiEdit.apply).toHaveBeenCalledWith("edit-reviewing-1"));
    expect(await within(dialog).findByText("Not a river bank."))
      .toBeInTheDocument();
    expect(answer).toHaveValue("金融機構");
    expect(screen.getByText("答案完整且符合語境。")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Hard" })).toBeChecked();
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(api.confirmPaper).not.toHaveBeenCalled();
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
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      newLearningCount: 0,
      dueLearningCount: 0,
      newCompletionLimit: 10,
      dueReviewCompletionLimit: 50,
      reviewPaperSize: 10,
      newRemainingCapacity: 6,
      dueRemainingCapacity: 50,
      backlogTotal: 4,
      totalAvailable: 4,
      selectedItems: questions.map((question, index) => ({
        id: question.itemId,
        title: question.title,
        itemType: "word" as const,
      language: "en" as const,
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
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Submit paper (4 unanswered)"
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
      throw new Error("Learning item not found");
    });
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    fireEvent.change(await screen.findByLabelText("Meaning of this word in the sentence"), {
      target: { value: "金融機構" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Open learning card"
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Learning item not found");
    expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Accept ratings and update schedule" }))
      .toBeEnabled();
  });

  it("keeps only the current paper visible when leaving and viewing", async () => {
    const api = reviewApi();
    render(
      <SpacedReviewWorkspace
        api={api}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    const answer = await screen.findByLabelText("Meaning of this word in the sentence");
    fireEvent.change(answer, { target: { value: "銀行" } });
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

    expect(screen.queryByText("bank", { selector: "u" }))
      .not.toBeInTheDocument();
    const currentPaper = screen.getByRole("region", { name: "Current paper" });
    expect(screen.queryByRole("heading", {
      name: /Complete \d+ questions to keep your memory moving/
    }))
      .not.toBeInTheDocument();
    expect(within(currentPaper).getByText(/1\/1 answered/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start a \d+-question review/ }))
      .not.toBeInTheDocument();
    expect(api.discardPaper).not.toHaveBeenCalled();

    fireEvent.click(within(currentPaper).getByRole("button", {
      name: "View paper"
    }));
    expect(screen.getByText("1 meaning-recall questions")).toBeInTheDocument();
    expect(await screen.findByLabelText("Meaning of this word in the sentence"))
      .toHaveValue("銀行");

    fireEvent.click(screen.getByRole("button", { name: "Submit paper" }));
    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Forgotten" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));
    expect(screen.getByRole("region", { name: "Current paper" }))
      .toHaveTextContent("ratings awaiting confirmation");
    fireEvent.click(screen.getByRole("button", { name: "View paper" }));

    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    expect(screen.getByText("1 meaning-recall questions")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Forgotten" })).toBeChecked();
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
      name: /Start a \d+-question review/
    }));
    await screen.findByText("bank", { selector: "u" });
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "resumable"
    ));

    fireEvent.click(screen.getByRole("button", { name: "Discard paper" }));
    const firstConfirmation = screen.getByRole("alertdialog", {
      name: "Discard the current paper?"
    });
    expect(firstConfirmation).toHaveTextContent(
      "Questions, answers, AI feedback, and unconfirmed ratings will be cleared"
    );
    expect(firstConfirmation).toHaveTextContent("cannot be recovered");
    fireEvent.click(within(firstConfirmation).getByRole("button", {
      name: "Cancel"
    }));

    expect(screen.queryByRole("alertdialog", {
      name: "Discard the current paper?"
    })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View paper" }))
      .toBeInTheDocument();
    expect(api.discardPaper).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard paper" }));
    const secondConfirmation = screen.getByRole("alertdialog", {
      name: "Discard the current paper?"
    });
    fireEvent.click(within(secondConfirmation).getByRole("button", {
      name: "Confirm discard"
    }));

    await waitFor(() => expect(api.discardPaper).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View paper" }))
      .not.toBeInTheDocument();
    expect(api.confirmPaper).not.toHaveBeenCalled();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "idle"
    ));
  });

  it("generates, submits blank answers, allows rating overrides and confirms once", async () => {
    const api = reviewApi();
    const learning = learningApi();
    const onStatusChange = vi.fn();
    const { unmount } = render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    expect(await screen.findByText("bank", { selector: "u" }))
      .toBeInTheDocument();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "resumable"
    ));
    expect(screen.getByText("1 unanswered; they will be rated Forgotten after submission."))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Submit paper (1 unanswered)"
    }));
    expect(await screen.findByText("答案完整且符合語境。"))
      .toBeInTheDocument();
    expect(api.gradePaper).toHaveBeenCalledWith({
      paperId: "paper-1",
      answers: [{ questionId: "q1", answer: "" }]
    });

    fireEvent.click(screen.getByRole("radio", { name: "Forgotten" }));
    fireEvent.click(screen.getByRole("button", {
      name: "Accept ratings and update schedule"
    }));
    await waitFor(() => expect(api.confirmPaper).toHaveBeenCalledWith({
      paperId: "paper-1",
      ratings: [{ questionId: "q1", finalRating: "forgotten" }]
    }));
    expect(await screen.findByRole("heading", { name: "Session complete" }))
      .toBeInTheDocument();
    const completedItem = screen.getByRole("button", {
      name: /bank.*Forgotten.*next review/i
    });
    expect(completedItem).toBeInTheDocument();

    fireEvent.click(completedItem);
    expect(learning.getItem).toHaveBeenCalledWith("item-1");
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).getByRole("button", { name: "Edit" }))
      .toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Close card details"
    }));
    await waitFor(() => expect(completedItem).toHaveFocus());

    expect(screen.getByText("bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to review overview" }))
      .toBeEnabled();
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(
      "idle"
    ));
    fireEvent.click(screen.getByRole("button", {
      name: "Back to review overview"
    }));
    expect(await screen.findByText("No cards are ready to practice"))
      .toBeInTheDocument();
    expect(screen.queryByText("Ready to practice")).not.toBeInTheDocument();

    unmount();
    expect(api.discardPaper).toHaveBeenCalled();
  });

  it("maps every completed result to its learning item", async () => {
    const api: ReviewDesktopApi = reviewApi();
    const learning: LearningDesktopApi = learningApi();
    const questions = [
      {
        questionId: "q1",
        itemId: "item-1",
        title: "bank",
        sense: "financial institution",
        cefr: "A2" as const,
        beforeTarget: "The ",
        targetText: "bank",
        afterTarget: " opens at nine."
      },
      {
        questionId: "q2",
        itemId: "item-2",
        title: "in advance",
        sense: "before a particular time",
        cefr: "B1" as const,
        beforeTarget: "Book ",
        targetText: "in advance",
        afterTarget: " to save money."
      }
    ];
    api.generatePaper = vi.fn(async () => ({
      paperId: "paper-2",
      questions
    }));
    api.gradePaper = vi.fn(async () => ({
      paperId: "paper-2",
      results: [
        {
          questionId: "q1",
          itemId: "item-1",
          feedback: "需要再複習。",
          rating: "hard" as const
        },
        {
          questionId: "q2",
          itemId: "item-2",
          feedback: "回答很Good。",
          rating: "easy" as const
        }
      ]
    }));
    api.confirmPaper = vi.fn(async () => ({
      sessionId: "paper-2",
      reviewedAt: "2026-07-27T02:00:00.000Z",
      remainingAvailable: 0,
      entries: [
        {
          id: "event-1",
          sessionId: "paper-2",
          itemId: "item-1",
          reviewedAt: "2026-07-27T02:00:00.000Z",
          aiRating: "hard" as const,
          finalRating: "hard" as const,
          answer: "河岸",
          intervalSeconds: 360,
          nextDueAt: "2026-07-27T02:06:00.000Z"
        },
        {
          id: "event-2",
          sessionId: "paper-2",
          itemId: "item-2",
          reviewedAt: "2026-07-27T02:00:00.000Z",
          aiRating: "easy" as const,
          finalRating: "easy" as const,
          answer: "事先",
          intervalSeconds: 86_400,
          nextDueAt: "2026-07-28T02:00:00.000Z"
        }
      ]
    }));
    learning.getItem = vi.fn(async (itemId: string) => ({
      id: itemId,
      title: itemId === "item-1" ? "bank" : "in advance",
      itemType: itemId === "item-1" ? "word" as const : "phrase" as const,
      language: "en" as const,
      cefr: itemId === "item-1" ? "A2" as const : "B1" as const,
      sense: itemId === "item-1"
        ? "financial institution"
        : "before a particular time",
      markdownContent: "## Meaning\nMeaning",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      trashedAt: null
    }));
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Submit paper (2 unanswered)"
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Accept ratings and update schedule"
    }));

    const bank = await screen.findByRole("button", {
      name: /bank.*Hard.*next review/i
    });
    const phrase = screen.getByRole("button", {
      name: /in advance.*Easy.*next review/i
    });
    fireEvent.click(bank);
    expect(learning.getItem).toHaveBeenLastCalledWith("item-1");
    fireEvent.click((await screen.findByRole("dialog", { name: "bank" }))
      .querySelector<HTMLButtonElement>("[aria-label='Close card details']")!);
    fireEvent.click(phrase);
    expect(learning.getItem).toHaveBeenLastCalledWith("item-2");
    expect(await screen.findByRole("dialog", { name: "in advance" }))
      .toBeInTheDocument();
  });

  it("manually edits and moves a learning item to Trash from the completed review", async () => {
    const api = reviewApi();
    const learning = learningApi();
    const onLearningCountsChange = vi.fn();
    learning.updateItem = vi.fn(async (input) => ({
      id: input.itemId,
      title: input.title,
      itemType: input.itemType,
      language: input.language,
      cefr: input.cefr,
      sense: input.sense,
      markdownContent: input.markdownContent,
      cautionNote: input.cautionNote,
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-08T09:30:00.000Z",
      trashedAt: null
    }));
    learning.trashItem = vi.fn(async (itemId) => ({
      id: itemId,
      title: "bank",
      itemType: "word" as const,
      language: "en" as const,
      cefr: "A2" as const,
      sense: "a financial institution with a caution",
      markdownContent: "## Meaning\nUpdated meaning",
      cautionNote: "Do not confuse it with a river bank.",
      status: "trashed" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-08T09:31:00.000Z",
      trashedAt: "2026-08-08T09:31:00.000Z"
    }));
    learning.countItems = vi.fn(async () => ({ active: 0, trashed: 1 }));

    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
        onLearningCountsChange={onLearningCountsChange}
      />
    );

    await completeCurrentReview();
    const completedItem = screen.getByRole("button", {
      name: /bank.*Forgotten.*next review/i
    });
    fireEvent.click(completedItem);
    const dialog = await screen.findByRole("dialog", { name: "bank" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Sense" }), {
      target: { value: "a financial institution with a caution" }
    });
    fireEvent.change(within(dialog).getByRole("textbox", {
      name: "Markdown content"
    }), { target: { value: "## Meaning\nUpdated meaning" } });
    fireEvent.change(within(dialog).getByRole("textbox", {
      name: "Learning caution"
    }), { target: { value: "Do not confuse it with a river bank." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(learning.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        sense: "a financial institution with a caution",
        markdownContent: "## Meaning\nUpdated meaning",
        cautionNote: "Do not confuse it with a river bank."
      })
    ));
    expect(await within(dialog).findByText("Updated meaning"))
      .toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Delete “bank”?"
    });
    fireEvent.click(within(confirmation).getByRole("button", {
      name: "Move to Trash"
    }));

    await waitFor(() => expect(learning.trashItem).toHaveBeenCalledOnce());
    expect(learning.trashItem).toHaveBeenCalledWith("item-1");
    await waitFor(() => expect(onLearningCountsChange).toHaveBeenCalledWith({
      active: 0,
      trashed: 1
    }));
    expect(screen.queryByRole("dialog", { name: "bank" }))
      .not.toBeInTheDocument();
    expect(completedItem).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to review overview" }))
      .toBeEnabled();
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
  });

  it("applies an AI edit from the completed review without reconfirming it", async () => {
    const api = reviewApi();
    const learning = learningApi();
    const aiEdit = {
      start: vi.fn(async () => ({
        sessionId: "edit-review-1",
        itemId: "item-1",
        phase: "ready" as const,
        draft: {
          markdownContent: "## Meaning\n銀行／金融機構",
          cautionNote: ""
        },
        hasChanges: false,
        status: "Ready"
      })),
      send: vi.fn(async () => ({
        sessionId: "edit-review-1",
        itemId: "item-1",
        phase: "ready" as const,
        draft: {
          markdownContent: "## Meaning\n銀行／金融機構\n\n## Common mistake\nNot a river bank.",
          cautionNote: "Distinguish the financial sense from the river edge."
        },
        hasChanges: true,
        status: "Draft ready"
      })),
      stop: vi.fn(),
      apply: vi.fn(async () => ({
        id: "item-1",
        title: "bank",
        itemType: "word" as const,
        language: "en" as const,
        cefr: "A2" as const,
        sense: "financial institution",
        markdownContent: "## Meaning\n銀行／金融機構\n\n## Common mistake\nNot a river bank.",
        cautionNote: "Distinguish the financial sense from the river edge.",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-08-08T09:32:00.000Z",
        trashedAt: null
      })),
      discard: vi.fn()
    };
    Object.assign(learning, { aiEdit });

    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    await completeCurrentReview();
    fireEvent.click(screen.getByRole("button", {
      name: /bank.*Forgotten.*next review/i
    }));
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit with AI" }));
    await waitFor(() => expect(aiEdit.start).toHaveBeenCalledWith("item-1"));
    fireEvent.change(within(dialog).getByRole("textbox", {
      name: "AI editing request"
    }), { target: { value: "Add the easy-to-confuse river-bank distinction." } });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Send AI edit request"
    }));
    await waitFor(() => expect(aiEdit.send).toHaveBeenCalledWith(
      "edit-review-1",
      "Add the easy-to-confuse river-bank distinction."
    ));
    fireEvent.click(await within(dialog).findByRole("button", {
      name: "Apply AI edit"
    }));

    await waitFor(() => expect(aiEdit.apply).toHaveBeenCalledWith("edit-review-1"));
    expect(await within(dialog).findByText("Not a river bank."))
      .toBeInTheDocument();
    expect(api.generatePaper).toHaveBeenCalledTimes(1);
    expect(api.gradePaper).toHaveBeenCalledTimes(1);
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
  });

  it("keeps the completed review and detail open when moving to Trash fails", async () => {
    const api = reviewApi();
    const learning = learningApi();
    learning.trashItem = vi.fn(async () => {
      throw new Error("Unable to move to Trash temporarily");
    });

    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    await completeCurrentReview();
    const completedItem = screen.getByRole("button", {
      name: /bank.*Forgotten.*next review/i
    });
    fireEvent.click(completedItem);
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("alertdialog", {
      name: "Delete “bank”?"
    })).getByRole("button", { name: "Move to Trash" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Unable to move to Trash temporarily"
    );
    expect(dialog).toBeInTheDocument();
    expect(completedItem).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to review overview" }))
      .toBeEnabled();
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
  });

  it("keeps completed results usable when item detail cannot load", async () => {
    const api = reviewApi();
    const learning = learningApi();
    learning.getItem = vi.fn(async () => {
      throw new Error("Learning item not found");
    });
    render(
      <SpacedReviewWorkspace
        api={api}
        learningApi={learning}
        explanationLanguage="zh-TW"
      />
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /Start a \d+-question review/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Submit paper (1 unanswered)"
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "Accept ratings and update schedule"
    }));
    const completedItem = await screen.findByRole("button", {
      name: /bank.*Forgotten.*next review/i
    });
    fireEvent.click(completedItem);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Learning item not found"
    );
    expect(completedItem).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to review overview" }))
      .toBeEnabled();
    expect(api.confirmPaper).toHaveBeenCalledTimes(1);
  });
});
