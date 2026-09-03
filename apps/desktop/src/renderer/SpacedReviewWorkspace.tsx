import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Clock3,
  LoaderCircle,
  Sparkles
} from "lucide-react";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemCounts
} from "../shared/learning-contracts";
import type {
  ConfirmReviewSessionResult,
  ReviewActivity,
  ReviewDesktopApi,
  ReviewGenerationProgress,
  ReviewGrade,
  ReviewLearningProgress,
  ReviewPaper,
  ReviewRating,
  ReviewSummary
} from "../shared/review-contracts";
import type { ExplanationLanguage } from "../shared/settings-contracts";
import type { VoiceTranscriptionDesktopApi } from "../shared/voice-transcription-contracts";
import { LearningItemDialog } from "./LearningLibraryWorkspace";
import { ReviewVoiceAnswer } from "./ReviewVoiceAnswer";

const ratingOptions: Array<{ value: ReviewRating; label: string }> = [
  { value: "forgotten", label: "Forgotten" },
  { value: "hard", label: "Hard" },
  { value: "good", label: "Good" },
  { value: "easy", label: "Easy" }
];

export type ReviewWorkspaceStatus = "idle" | "generating" | "resumable";

function dueLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const due = new Date(value);
  const milliseconds = due.getTime() - Date.now();
  if (milliseconds > 0 && milliseconds < 60 * 60 * 1000) {
    return `in ${Math.max(1, Math.ceil(milliseconds / 60_000))} minutes`;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(due);
}

function ReviewLearningGrowth({
  progress
}: {
  progress: ReviewLearningProgress;
}) {
  const chartWidth = 640;
  const chartHeight = 190;
  const insetX = 10;
  const insetY = 14;
  const values = progress.daily.map(({ solidItemCount }) => solidItemCount);
  const observedMinimum = values.length > 0 ? Math.min(...values) : 0;
  const observedMaximum = values.length > 0 ? Math.max(...values) : 0;
  const minimum = observedMinimum === observedMaximum
    ? Math.max(0, observedMinimum - 1)
    : observedMinimum;
  const maximum = observedMinimum === observedMaximum
    ? Math.max(1, observedMaximum)
    : observedMaximum;
  const range = Math.max(1, maximum - minimum);
  const points = progress.daily.map((day, index) => {
    const x = progress.daily.length <= 1
      ? insetX
      : insetX + index / (progress.daily.length - 1) *
        (chartWidth - insetX * 2);
    const y = chartHeight - insetY -
      (day.solidItemCount - minimum) / range *
      (chartHeight - insetY * 2);
    return { ...day, x, y };
  });
  const linePath = points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(" ");
  const areaPath = points.length > 0
    ? `M ${points[0].x.toFixed(2)} ${(chartHeight - insetY).toFixed(2)} ` +
      `${linePath.replace(/^M /, "L ")} ` +
      `L ${points.at(-1)!.x.toFixed(2)} ${(chartHeight - insetY).toFixed(2)} Z`
    : "";
  const first = progress.daily[0];
  const last = progress.daily.at(-1);
  const delta = progress.solidItemCountDelta30Days;
  const deltaLabel = delta > 0
    ? `+${delta} in the last 30 days`
    : delta < 0
      ? `−${Math.abs(delta)} in the last 30 days`
      : "No change in the last 30 days";

  return (
    <section className="review-growth-card" aria-label="Learning growth">
      <header className="review-growth-heading">
        <div>
          <span className="review-growth-kicker">Your vocabulary growth</span>
          <h2>Results that reflect what you can recall</h2>
        </div>
        <span>{progress.periodDays} days</span>
      </header>

      <div className="review-growth-outcomes">
        <div className="review-growth-primary">
          <span>Solid recall</span>
          <strong>{progress.solidItemCount}</strong>
          <small>words &amp; phrases</small>
          <p data-direction={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
            {deltaLabel}
          </p>
        </div>
        <dl className="review-growth-secondary">
          <div>
            <dt>Building</dt>
            <dd>{progress.buildingItemCount}</dd>
            <small>still strengthening</small>
          </div>
          <div>
            <dt>30-day recall</dt>
            <dd>{progress.recallRate30Days === null
              ? "—"
              : `${progress.recallRate30Days}%`}</dd>
            <small>{progress.recallReviewCount30Days > 0
              ? `Based on ${progress.recallReviewCount30Days} follow-up reviews`
              : "No follow-up reviews yet"}</small>
          </div>
        </dl>
      </div>

      <div className="review-growth-chart">
        <div className="review-growth-chart-heading">
          <strong>Solid recall over time</strong>
          <small>Items can move down when they need reinforcement.</small>
        </div>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label={`${progress.periodDays}-day solid recall trend from ${first?.solidItemCount ?? 0} to ${last?.solidItemCount ?? 0}`}
          preserveAspectRatio="none"
        >
          <title>
            {`${progress.periodDays}-day solid recall trend from ${first?.solidItemCount ?? 0} to ${last?.solidItemCount ?? 0}`}
          </title>
          <line x1={insetX} x2={chartWidth - insetX}
            y1={chartHeight / 2} y2={chartHeight / 2} />
          <line x1={insetX} x2={chartWidth - insetX}
            y1={chartHeight - insetY} y2={chartHeight - insetY} />
          <path className="review-growth-area" d={areaPath} />
          <path className="review-growth-line" d={linePath} />
          {last ? (
            <circle cx={points.at(-1)!.x} cy={points.at(-1)!.y} r="4" />
          ) : null}
        </svg>
        <div className="review-growth-axis" aria-hidden="true">
          <span>{first?.date ?? ""}</span>
          <span>{last?.date ?? ""}</span>
        </div>
      </div>
    </section>
  );
}

function ReviewActivityCard({
  activity
}: {
  activity: ReviewActivity;
}) {
  const completedByDay = activity.daily.map((day) =>
    day.newCompletedCount + day.dueCompletedCount
  );
  const maximumCompleted = Math.max(1, ...completedByDay);
  const activeDays = completedByDay.filter((count) => count > 0).length;

  return (
    <section className="review-activity-card" aria-label="Review activity">
      <header>
        <div>
          <h2>{activity.periodDays}-day review activity</h2>
          <p>Practice completed, separate from memory results.</p>
        </div>
        <strong>
          {activity.completedReviewCount} reviews · {activeDays} active days
        </strong>
      </header>
      <ol
        className="review-activity-days"
        aria-label={`Review activity over the past ${activity.periodDays} days; ${activity.completedReviewCount} completed reviews`}
      >
        {activity.daily.map((day) => {
          const completed = day.newCompletedCount + day.dueCompletedCount;
          const level = completed === 0
            ? 0
            : Math.max(1, Math.ceil(completed / maximumCompleted * 4));
          return (
            <li
              data-level={level}
              aria-label={`${day.date}: ${completed} completed reviews`}
              title={`${day.date} • ${completed} completed reviews`}
              key={day.date}
            >
              <span aria-hidden="true">{Number(day.date.slice(-2))}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SpacedReviewWorkspace({
  api,
  learningApi,
  voiceApi,
  hasVoiceApiKey = false,
  explanationLanguage,
  settingsRevision = 0,
  active = true,
  onAvailableCountChange,
  onNewCountChange,
  onLearningCountsChange,
  onStatusChange,
  onOpenVoiceSettings
}: {
  api: ReviewDesktopApi;
  learningApi?: LearningDesktopApi;
  voiceApi?: VoiceTranscriptionDesktopApi;
  hasVoiceApiKey?: boolean;
  explanationLanguage: ExplanationLanguage;
  settingsRevision?: number;
  active?: boolean;
  onAvailableCountChange?(count: number): void;
  onNewCountChange?(count: number): void;
  onLearningCountsChange?(counts: LearningItemCounts): void;
  onStatusChange?(status: ReviewWorkspaceStatus): void;
  onOpenVoiceSettings?(): void;
}) {
  const [summary, setSummary] = useState<ReviewSummary>();
  const [paper, setPaper] = useState<ReviewPaper>();
  const [grade, setGrade] = useState<ReviewGrade>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finalRatings, setFinalRatings] = useState<
    Record<string, ReviewRating>
  >({});
  const [completed, setCompleted] = useState<ConfirmReviewSessionResult>();
  const [phase, setPhase] = useState<
    "loading" | "ready" | "generating" | "answering" | "grading" |
    "reviewing" | "confirming" | "completed"
  >("loading");
  const [error, setError] = useState("");
  const [generationProgress, setGenerationProgress] =
    useState<ReviewGenerationProgress>({
      phase: "preparing",
      completedCount: 0,
      totalCount: 0
    });
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [isPaperViewPaused, setIsPaperViewPaused] = useState(false);
  const [isAbandonConfirmationOpen, setIsAbandonConfirmationOpen] =
    useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LearningItem>();
  const [reviewItemsById, setReviewItemsById] = useState<
    Record<string, LearningItem>
  >({});
  const [voiceBusyQuestionId, setVoiceBusyQuestionId] = useState<string>();
  const generationAttemptRef = useRef(0);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsRevisionRef = useRef(settingsRevision);

  async function loadSummary() {
    setPhase("loading");
    setError("");
    setPaper(undefined);
    setGrade(undefined);
    setCompleted(undefined);
    setAnswers({});
    setFinalRatings({});
    setIsPaperViewPaused(false);
    setIsAbandonConfirmationOpen(false);
    setSelectedItem(undefined);
    setReviewItemsById({});
    setVoiceBusyQuestionId(undefined);
    try {
      const next = await api.getSummary();
      setSummary(next);
      onAvailableCountChange?.(next.totalAvailable);
      onNewCountChange?.(next.newCount);
      setPhase("ready");
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : "Unable to load spaced-review data.");
      setPhase("ready");
    }
  }

  useEffect(() => {
    const unsubscribeProgress = api.onGenerationProgress((progress) => {
      setGenerationProgress(progress);
    });
    void loadSummary();
    return () => {
      generationAttemptRef.current += 1;
      unsubscribeProgress();
      void api.discardPaper();
    };
  }, [api]);

  useEffect(() => {
    if (phase !== "generating") return;
    const startedAt = Date.now();
    setGenerationElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setGenerationElapsedSeconds(Math.floor(
        (Date.now() - startedAt) / 1_000
      ));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "reviewing" || !paper || !learningApi) return;
    let cancelled = false;
    for (const { itemId } of paper.questions) {
      void learningApi.getItem(itemId).then((item) => {
        if (cancelled) return;
        setReviewItemsById((current) => current[itemId]
          ? current
          : {
              ...current,
              [itemId]: item
            });
      }).catch(() => {
        // A missing image must not block feedback or schedule confirmation.
      });
    }
    return () => {
      cancelled = true;
    };
  }, [learningApi, paper, phase]);

  useEffect(() => {
    if (
      phase !== "ready" ||
      !summary?.nextDueAt ||
      summary.totalAvailable > 0
    ) return;
    const millisecondsUntilDue =
      new Date(summary.nextDueAt).getTime() - Date.now();
    if (!Number.isFinite(millisecondsUntilDue)) return;
    const timer = window.setTimeout(() => {
      void api.getSummary().then((next) => {
        setSummary(next);
        onAvailableCountChange?.(next.totalAvailable);
        onNewCountChange?.(next.newCount);
      }).catch(() => {
        // A later settings change or explicit review action will retry.
      });
    }, Math.min(
      Math.max(0, millisecondsUntilDue),
      2_147_483_647
    ));
    return () => window.clearTimeout(timer);
  }, [
    api,
    onAvailableCountChange,
    onNewCountChange,
    phase,
    summary?.nextDueAt,
    summary?.totalAvailable
  ]);

  const hasActivePaper = Boolean(
    paper && ["answering", "grading", "reviewing", "confirming"].includes(phase)
  );
  const workspaceStatus: ReviewWorkspaceStatus = phase === "generating"
    ? "generating"
    : hasActivePaper
      ? "resumable"
      : "idle";

  useEffect(() => {
    if (settingsRevisionRef.current === settingsRevision) return;
    settingsRevisionRef.current = settingsRevision;
    void api.getSummary().then((next) => {
      setSummary((current) => hasActivePaper && current
        ? { ...next, selectedItems: current.selectedItems }
        : next);
      onAvailableCountChange?.(next.totalAvailable);
      onNewCountChange?.(next.newCount);
    }).catch(() => {
      // The saved settings remain valid; the next normal refresh retries.
    });
  }, [
    api,
    hasActivePaper,
    onAvailableCountChange,
    onNewCountChange,
    settingsRevision
  ]);

  useEffect(() => {
    onStatusChange?.(workspaceStatus);
  }, [onStatusChange, workspaceStatus]);

  const unansweredCount = useMemo(
    () => paper?.questions.filter(({ questionId }) =>
      !answers[questionId]?.trim()
    ).length ?? 0,
    [answers, paper]
  );
  async function generatePaper() {
    const attempt = generationAttemptRef.current + 1;
    generationAttemptRef.current = attempt;
    setPhase("generating");
    setError("");
    setPaper(undefined);
    setReviewItemsById({});
    setIsPaperViewPaused(false);
    setGenerationProgress({
      phase: "preparing",
      completedCount: 0,
      totalCount: summary?.selectedItems.length ?? 0
    });
    try {
      const nextPaper = await api.generatePaper({ explanationLanguage });
      if (generationAttemptRef.current !== attempt) return;
      setPaper(nextPaper);
      setAnswers({});
      setPhase("answering");
    } catch (generationError) {
      if (generationAttemptRef.current !== attempt) return;
      setError(generationError instanceof Error
        ? generationError.message
        : "AI could not generate this review paper.");
      setPhase("ready");
    }
  }

  function cancelGeneration() {
    generationAttemptRef.current += 1;
    setGenerationProgress({
      phase: "preparing",
      completedCount: 0,
      totalCount: 0
    });
    setPhase("ready");
    setIsPaperViewPaused(false);
    void api.discardPaper();
  }

  async function abandonCurrentPaper() {
    if (!paper || isAbandoning) return;
    setIsAbandoning(true);
    setError("");
    try {
      await api.discardPaper();
      setIsAbandonConfirmationOpen(false);
      await loadSummary();
    } catch (abandonError) {
      setError(abandonError instanceof Error
        ? abandonError.message
        : "Unable to discard the current paper.");
    } finally {
      setIsAbandoning(false);
    }
  }

  async function submitAnswers() {
    if (!paper) return;
    setPhase("grading");
    setError("");
    try {
      const nextGrade = await api.gradePaper({
        paperId: paper.paperId,
        answers: paper.questions.map(({ questionId }) => ({
          questionId,
          answer: answers[questionId] ?? ""
        }))
      });
      setGrade(nextGrade);
      setFinalRatings(Object.fromEntries(nextGrade.results.map((result) => [
        result.questionId,
        result.rating
      ])));
      setPhase("reviewing");
    } catch (gradingError) {
      setError(gradingError instanceof Error
        ? gradingError.message
        : "AI could not grade this review paper.");
      setPhase("answering");
    }
  }

  async function confirmRatings() {
    if (!paper || !grade) return;
    setPhase("confirming");
    setError("");
    try {
      const result = await api.confirmPaper({
        paperId: paper.paperId,
        ratings: grade.results.map(({ questionId, rating }) => ({
          questionId,
          finalRating: finalRatings[questionId] ?? rating
        }))
      });
      setCompleted(result);
      setSummary((current) => current
        ? { ...current, totalAvailable: result.remainingAvailable }
        : current);
      onAvailableCountChange?.(result.remainingAvailable);
      setIsPaperViewPaused(false);
      setPhase("completed");
      try {
        const nextSummary = await api.getSummary();
        setSummary(nextSummary);
        onAvailableCountChange?.(nextSummary.totalAvailable);
        onNewCountChange?.(nextSummary.newCount);
      } catch {
        // Confirmation already succeeded; keep the completion result and the
        // best-known remaining count if the non-critical refresh fails.
      }
    } catch (confirmationError) {
      setError(confirmationError instanceof Error
        ? confirmationError.message
        : "Unable to update the review schedule.");
      setPhase("reviewing");
    }
  }

  async function openItemDetail(
    itemId: string,
    trigger: HTMLButtonElement
  ) {
    if (!learningApi) return;
    detailTriggerRef.current = trigger;
    setError("");
    try {
      setSelectedItem(await learningApi.getItem(itemId));
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Unable to open the learning item.");
    }
  }

  function closeItemDetail() {
    setSelectedItem(undefined);
    requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

  async function handleItemChanged(item: LearningItem) {
    setSelectedItem(item);
    setReviewItemsById((current) => ({
      ...current,
      [item.id]: item
    }));
    if (item.status !== "trashed" || !learningApi) return;
    try {
      onLearningCountsChange?.(await learningApi.countItems());
    } catch {
      setError(
        "The learning item was moved to Trash, but Library counts could not be refreshed."
      );
    }
  }

  if (!active) return null;

  return (
    <section className="spaced-review-workspace" aria-labelledby="review-title">
      <header className="spaced-review-heading">
        <div>
          <span className="eyebrow">Spaced review</span>
          <h1 id="review-title">Spaced Review</h1>
          <p>Start a session and the system will handle card order and scheduling.</p>
        </div>
      </header>

      {error ? <p className="library-error" role="alert">{error}</p> : null}

      {phase === "loading" ? <p className="library-state">Loading review schedule…</p> : null}

      {summary && (phase === "ready" || phase === "completed") ? (
        <section className="review-status-strip" aria-label="Today's review status">
          <div className="review-status-heading">
            <strong>Today&apos;s progress</strong>
            <small>Completed / daily limit</small>
          </div>
          <dl>
            <div>
              <dt>New items</dt>
              <dd>
                <strong>{summary.reviewedNewTodayCount}</strong>
                <span>/{summary.newCompletionLimit}</span>
              </dd>
            </div>
            <div>
              <dt>Due reviews</dt>
              <dd>
                <strong>{summary.reviewedDueTodayCount}</strong>
                <span>/{summary.dueReviewCompletionLimit}</span>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {summary && phase === "ready" ? (
        summary.totalAvailable > 0 ? (
          <section
            className="review-focus-card"
            aria-labelledby="review-focus-title"
          >
            <div className="review-focus-icon" aria-hidden="true">
              <BookOpen size={25} strokeWidth={1.8} />
            </div>
            <div className="review-focus-copy">
              <span className="review-focus-status">
                <i aria-hidden="true" />
                Today&apos;s focus
              </span>
              <h2 id="review-focus-title">
                Complete {summary.selectedItems.length} questions to keep your memory moving
              </h2>
              <p>
                {summary.selectedItems.filter(({ reviewKind }) =>
                  reviewKind === "new"
                ).length} new items •
                {" "}{summary.selectedItems.filter(({ reviewKind }) =>
                  reviewKind === "due"
                ).length} due reviews, already arranged for you.
              </p>
            </div>
            <div className="review-focus-action">
              <button
                type="button"
                aria-label={`Start a ${summary.selectedItems.length}-question review`}
                onClick={() => void generatePaper()}
              >
                Start today&apos;s review
              </button>
              <span>The next review is scheduled automatically</span>
            </div>
          </section>
        ) : (
          <section className="review-empty-state">
            <div className="review-empty-icon" aria-hidden="true">
              <Clock3 size={25} strokeWidth={1.8} />
            </div>
            <div className="review-empty-copy">
              <strong>No cards are ready to practice</strong>
              <p>
                {summary.nextDueAt &&
                summary.newLearningCount + summary.dueLearningCount > 0
                  ? `The next card is due ${dueLabel(summary.nextDueAt)}.`
                  : summary.backlogTotal > 0
                  ? "Today's review is complete. Adjust daily limits in Settings if needed."
                  : summary.nextDueAt
                  ? `The next card is due ${dueLabel(summary.nextDueAt)}.`
                  : "Create learning cards from your reading, then return to start reviewing."}
              </p>
            </div>
          </section>
        )
      ) : null}

      {summary?.learningProgress &&
        (phase === "ready" || phase === "completed") ? (
          <ReviewLearningGrowth progress={summary.learningProgress} />
        ) : null}

      {summary?.reviewActivity &&
        (phase === "ready" || phase === "completed") ? (
          <ReviewActivityCard activity={summary.reviewActivity} />
        ) : null}

      {phase === "generating" ? (
        <section
          className="review-generation-state"
          aria-label="AI paper generation"
          aria-busy="true"
        >
          <header className="review-generation-heading">
            <span className="review-generation-mark" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <span>AI is generating</span>
              <h2>
                Preparing a {summary?.selectedItems.length ?? 0}-question review paper
              </h2>
            </div>
          </header>

          <ol className="review-generation-stages" aria-label="Generation stages">
            <li className={generationProgress.phase === "preparing"
              ? "is-active"
              : "is-complete"}>
              <span aria-hidden="true">
                {generationProgress.phase === "assembling"
                  ? <Check size={15} />
                  : <LoaderCircle size={15} />}
              </span>
              <div>
                <strong>Generate example sentences</strong>
                <small>Create a natural sentence for each item&apos;s target sense</small>
              </div>
            </li>
            <li className={generationProgress.phase === "assembling"
              ? "is-active"
              : "is-pending"}>
              <span aria-hidden="true">
                {generationProgress.phase === "assembling"
                  ? <LoaderCircle size={15} />
                  : "2"}
              </span>
              <div>
                <strong>Assemble and validate the paper</strong>
                <small>Check that every question is complete and safe to display</small>
              </div>
            </li>
          </ol>

          <p
            className="review-generation-message"
            role="status"
            aria-live="polite"
          >
            {generationProgress.phase === "preparing"
              ? `${generationProgress.completedCount}/${generationProgress.totalCount} example sentences complete`
              : "Example sentences complete; assembling and validating the paper"}
          </p>
          <div
            className="review-generation-progress"
            role="progressbar"
            aria-label="AI paper generation progress"
            aria-valuemin={0}
            aria-valuemax={generationProgress.totalCount}
            aria-valuenow={generationProgress.completedCount}
            aria-valuetext={generationProgress.phase === "preparing"
              ? `${generationProgress.completedCount}/${generationProgress.totalCount} example sentences complete`
              : "Assembling and validating the paper"}
          >
            <span style={{
              width: generationProgress.totalCount > 0
                ? `${Math.round(
                    generationProgress.completedCount /
                    generationProgress.totalCount * 100
                  )}%`
                : "0%"
            }} />
          </div>
          <footer className="review-generation-footer">
            <span>Waiting for {generationElapsedSeconds} seconds</span>
            <button type="button" onClick={cancelGeneration}>
              Cancel generation
            </button>
          </footer>
        </section>
      ) : null}

      {paper && isPaperViewPaused &&
        ["answering", "reviewing"].includes(phase) ? (
          <section
            className="review-resume-state"
            aria-label="Current paper"
          >
            <span aria-hidden="true"><Check size={20} /></span>
            <div>
              <h2>Current paper</h2>
              <p>
                {phase === "reviewing"
                  ? `${paper.questions.length} meaning-recall questions • Answers complete; ratings awaiting confirmation.`
                  : `${paper.questions.length} meaning-recall questions • ${
                      paper.questions.length - unansweredCount
                    }/${paper.questions.length} answered`}
              </p>
            </div>
            <div className="review-resume-actions">
              <button
                className="review-abandon-action"
                type="button"
                onClick={() => setIsAbandonConfirmationOpen(true)}
              >
                Discard paper
              </button>
              <button
                className="review-resume-action"
                type="button"
                onClick={() => setIsPaperViewPaused(false)}
              >
                View paper
              </button>
            </div>
          </section>
        ) : null}

      {paper && !isPaperViewPaused &&
        ["answering", "grading", "reviewing", "confirming"].includes(phase) ? (
        <div className="spaced-review-paper">
          <div className="review-paper-progress">
            <strong>{paper.questions.length} meaning-recall questions</strong>
            <div>
              <span>{unansweredCount} unanswered</span>
              {phase === "answering" || phase === "reviewing" ? (
                <button
                  type="button"
                  onClick={() => setIsPaperViewPaused(true)}
                >
                  Leave for now
                </button>
              ) : null}
            </div>
          </div>
          {paper.questions.map((question, index) => {
            const result = grade?.results.find(({ questionId }) =>
              questionId === question.questionId
            );
            const currentRating = result
              ? finalRatings[question.questionId] ?? result.rating
              : undefined;
            const currentRatingLabel = currentRating
              ? ratingOptions.find(({ value }) => value === currentRating)?.label
              : undefined;
            const reviewItem = reviewItemsById[question.itemId];
            return (
              <article className="review-question-card" key={question.questionId}>
                <header>
                  <span>{index + 1}</span>
                  <em>{question.cefr}</em>
                </header>
                <p className="review-example">
                  {question.beforeTarget}
                  <u>{question.targetText}</u>
                  {question.afterTarget}
                </p>
                <label>
                  <span>Meaning of this word in the sentence</span>
                  <div className={`review-answer-field${
                    result?.expressionFeedback?.status === "improvable"
                      ? " has-correction"
                      : ""
                  }`}>
                    <textarea
                      value={answers[question.questionId] ?? ""}
                      disabled={phase !== "answering"}
                      onChange={(event) => setAnswers((current) => ({
                        ...current,
                        [question.questionId]: event.target.value
                      }))}
                      placeholder="You may leave this blank; unanswered items are rated Forgotten"
                    />
                    {voiceApi && onOpenVoiceSettings ? (
                      <ReviewVoiceAnswer
                        api={voiceApi}
                        hasApiKey={hasVoiceApiKey}
                        disabled={phase !== "answering"}
                        busy={Boolean(voiceBusyQuestionId)}
                        onBusyChange={(busy) => setVoiceBusyQuestionId((current) =>
                          busy
                            ? question.questionId
                            : current === question.questionId
                              ? undefined
                              : current
                        )}
                        onTranscribed={(text) => setAnswers((current) => ({
                          ...current,
                          [question.questionId]: text
                        }))}
                        onOpenSettings={onOpenVoiceSettings}
                      />
                    ) : null}
                    {result?.expressionFeedback?.status === "improvable" ? (
                      <div className="review-answer-correction">
                        <span>Expression feedback →</span>
                        <strong>
                          {result.expressionFeedback.suggestedAnswer}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                </label>
                {result ? (
                  <aside
                    className="review-feedback"
                    data-rating={currentRating}
                    aria-label={`Grading result: ${currentRatingLabel}`}
                  >
                    <div className="review-feedback-summary">
                      <section
                        className="review-meaning-feedback"
                        aria-label="Meaning assessment"
                      >
                        <strong>Meaning assessment</strong>
                        <p>{result.feedback}</p>
                        {result.recommendedAnswer ? (
                          <div className="review-recommended-answer">
                            <span>A better answer for next time</span>
                            <p>{result.recommendedAnswer}</p>
                          </div>
                        ) : null}
                      </section>
                      {reviewItem?.representativeImageDataUrl ? (
                        <img
                          className="review-feedback-image"
                          src={reviewItem.representativeImageDataUrl}
                          alt={`Representative image for ${reviewItem.title}: ${reviewItem.sense}`}
                          width={84}
                          height={84}
                        />
                      ) : null}
                    </div>
                    {learningApi ? (
                      <button
                        type="button"
                        className="review-item-detail-action"
                        onClick={(event) => void openItemDetail(
                          question.itemId,
                          event.currentTarget
                        )}
                      >
                        <BookOpen aria-hidden="true" size={16} strokeWidth={1.9} />
                        Open learning card
                      </button>
                    ) : null}
                    <fieldset>
                      <legend>AI suggestion: {
                        ratingOptions.find(({ value }) => value === result.rating)?.label
                      }</legend>
                      {ratingOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="radio"
                            name={`rating-${question.questionId}`}
                            value={option.value}
                            checked={
                              (finalRatings[question.questionId] ?? result.rating) ===
                              option.value
                            }
                            disabled={phase === "confirming"}
                            onChange={() => setFinalRatings((current) => ({
                              ...current,
                              [question.questionId]: option.value
                            }))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </fieldset>
                  </aside>
                ) : null}
              </article>
            );
          })}
          {phase === "answering" ? (
            <footer className="review-paper-actions">
              {unansweredCount > 0 ? (
                <p>{unansweredCount} unanswered; they will be rated Forgotten after submission.</p>
              ) : <p>All questions are answered.</p>}
              <button type="button" onClick={() => void submitAnswers()}>
                Submit paper{unansweredCount ? ` (${unansweredCount} unanswered)` : ""}
              </button>
            </footer>
          ) : null}
          {phase === "grading" ? (
            <aside
              className="review-grading-state"
              role="status"
              aria-label="AI is grading the paper"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="review-grading-visual" aria-hidden="true">
                <span className="review-grading-ring">
                  <LoaderCircle size={26} />
                </span>
                <span className="review-grading-spark">
                  <Sparkles size={14} />
                </span>
              </div>
              <div className="review-grading-copy">
                <span>AI is grading</span>
                <h2>Analyzing your answers</h2>
                <p>
                  Comparing meaning with sentence context and offering expression feedback when useful.
                </p>
                <div className="review-grading-progress" aria-hidden="true">
                  <span />
                </div>
              </div>
            </aside>
          ) : null}
          {phase === "reviewing" || phase === "confirming" ? (
            <footer className="review-paper-actions">
              <p>Accept all AI suggestions or adjust individual ratings.</p>
              <button
                type="button"
                disabled={phase === "confirming"}
                onClick={() => void confirmRatings()}
              >
                {phase === "confirming"
                  ? "Updating schedule…"
                  : "Accept ratings and update schedule"}
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}

      {phase === "completed" && completed ? (
        <section className="review-completed">
          <span aria-hidden="true">✓</span>
          <h2>Session complete</h2>
          <p>Next review times updated for {completed.entries.length} learning items.</p>
          <ul>
            {completed.entries.map((entry) => {
              const title = paper?.questions.find(
                ({ itemId }) => itemId === entry.itemId
              )?.title ?? "Learning item";
              const ratingLabel = ratingOptions.find(
                ({ value }) => value === entry.finalRating
              )?.label ?? entry.finalRating;
              const nextDueLabel = dueLabel(entry.nextDueAt);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="review-completed-item"
                    aria-label={
                      `${title}, ${ratingLabel}, next review: ${nextDueLabel}`
                    }
                    disabled={!learningApi}
                    onClick={(event) => void openItemDetail(
                      entry.itemId,
                      event.currentTarget
                    )}
                  >
                    <span className="review-completed-item-main">
                      <strong>{title}</strong>
                      <span
                        className="review-completed-rating"
                        data-rating={entry.finalRating}
                      >
                        {ratingLabel}
                      </span>
                    </span>
                    <span className="review-completed-schedule">
                      <span>
                        <small>Next review</small>
                        <time dateTime={entry.nextDueAt}>{nextDueLabel}</time>
                      </span>
                      <BookOpen
                        aria-hidden="true"
                        size={18}
                        strokeWidth={1.8}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {completed.remainingAvailable > 0 ? (
            <button type="button" onClick={() => void loadSummary()}>
              Continue to next session ({completed.remainingAvailable} remaining)
            </button>
          ) : (
            <button type="button" onClick={() => void loadSummary()}>
              Back to review overview
            </button>
          )}
        </section>
      ) : null}

      {isAbandonConfirmationOpen ? (
        <div
          className="dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !isAbandoning) {
              setIsAbandonConfirmationOpen(false);
            }
          }}
        >
          <section
            className="delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="review-abandon-title"
            aria-describedby="review-abandon-description"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="review-abandon-title">Discard the current paper?</h2>
            <p id="review-abandon-description">
              Questions, answers, AI feedback, and unconfirmed ratings will be
              cleared and cannot be recovered. The review schedule will not change.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                disabled={isAbandoning}
                onClick={() => setIsAbandonConfirmationOpen(false)}
              >
                Cancel
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={isAbandoning}
                onClick={() => void abandonCurrentPaper()}
              >
                {isAbandoning ? "Discarding…" : "Confirm discard"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedItem && learningApi ? (
        <LearningItemDialog
          item={selectedItem}
          api={learningApi}
          reviewApi={api}
          readOnly={phase !== "reviewing" && phase !== "completed"}
          allowMoveToTrash={phase === "completed"}
          onClose={closeItemDetail}
          onChanged={phase === "reviewing" || phase === "completed"
            ? handleItemChanged
            : undefined}
        />
      ) : null}
    </section>
  );
}
