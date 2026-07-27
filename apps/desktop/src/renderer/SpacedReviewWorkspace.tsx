import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, LoaderCircle, Sparkles } from "lucide-react";
import type {
  LearningDesktopApi,
  LearningItem
} from "../shared/learning-contracts";
import type {
  ConfirmReviewSessionResult,
  ReviewDesktopApi,
  ReviewGenerationProgress,
  ReviewGrade,
  ReviewPaper,
  ReviewRating,
  ReviewSummary
} from "../shared/review-contracts";
import type { ExplanationLanguage } from "../shared/settings-contracts";
import { LearningItemDialog } from "./LearningLibraryWorkspace";

const ratingOptions: Array<{ value: ReviewRating; label: string }> = [
  { value: "forgotten", label: "忘記" },
  { value: "hard", label: "困難" },
  { value: "good", label: "順利" },
  { value: "easy", label: "簡單" }
];

export type ReviewWorkspaceStatus = "idle" | "generating" | "resumable";

function dueLabel(value: string | null) {
  if (!value) return "尚無排程";
  const due = new Date(value);
  const milliseconds = due.getTime() - Date.now();
  if (milliseconds > 0 && milliseconds < 60 * 60 * 1000) {
    return `${Math.max(1, Math.ceil(milliseconds / 60_000))} 分鐘後`;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(due);
}

export function SpacedReviewWorkspace({
  api,
  learningApi,
  explanationLanguage,
  active = true,
  onAvailableCountChange,
  onStatusChange
}: {
  api: ReviewDesktopApi;
  learningApi?: LearningDesktopApi;
  explanationLanguage: ExplanationLanguage;
  active?: boolean;
  onAvailableCountChange?(count: number): void;
  onStatusChange?(status: ReviewWorkspaceStatus): void;
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
  const generationAttemptRef = useRef(0);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);

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
    try {
      const next = await api.getSummary();
      setSummary(next);
      onAvailableCountChange?.(next.totalAvailable);
      setPhase("ready");
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : "無法讀取間隔複習資料。");
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

  const hasActivePaper = Boolean(
    paper && ["answering", "grading", "reviewing", "confirming"].includes(phase)
  );
  const workspaceStatus: ReviewWorkspaceStatus = phase === "generating"
    ? "generating"
    : hasActivePaper
      ? "resumable"
      : "idle";

  useEffect(() => {
    onStatusChange?.(workspaceStatus);
  }, [onStatusChange, workspaceStatus]);

  const unansweredCount = useMemo(
    () => paper?.questions.filter(({ questionId }) =>
      !answers[questionId]?.trim()
    ).length ?? 0,
    [answers, paper]
  );
  const selectedDueCount = summary?.selectedItems.filter(
    ({ reviewKind }) => reviewKind === "due"
  ).length ?? 0;
  const selectedNewCount = summary?.selectedItems.length
    ? summary.selectedItems.length - selectedDueCount
    : 0;
  async function generatePaper() {
    const attempt = generationAttemptRef.current + 1;
    generationAttemptRef.current = attempt;
    setPhase("generating");
    setError("");
    setPaper(undefined);
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
        : "AI 無法生成本回合試卷。");
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
        : "無法放棄目前試卷。");
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
        : "AI 無法批改本回合試卷。");
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
    } catch (confirmationError) {
      setError(confirmationError instanceof Error
        ? confirmationError.message
        : "無法更新複習排程。");
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
        : "無法開啟學習項目。");
    }
  }

  function closeItemDetail() {
    setSelectedItem(undefined);
    requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

  if (!active) return null;

  return (
    <section className="spaced-review-workspace" aria-labelledby="review-title">
      <header className="spaced-review-heading">
        <div>
          <span className="eyebrow">Spaced review</span>
          <h1 id="review-title">間隔複習</h1>
          <p>用例句回想詞義，AI 批改後再確認本回合排程。</p>
        </div>
        {summary ? (
          <span className="review-available-count">
            {summary.totalAvailable} 個可複習
          </span>
        ) : null}
      </header>

      {error ? <p className="library-error" role="alert">{error}</p> : null}

      {phase === "loading" ? <p className="library-state">載入複習排程中…</p> : null}

      {summary && (phase === "ready" || hasActivePaper) ? (
        summary.totalAvailable > 0 ? (
          <section className={`review-round-summary${
            hasActivePaper ? " has-active-paper" : ""
          }`}>
            <span>本回合</span>
            <strong>{summary.selectedItems.length} 題</strong>
            <div>
              <p><b>{selectedDueCount}</b> 個既有到期項目</p>
              <p><b>{selectedNewCount}</b> 個尚未複習的新項目</p>
            </div>
            <small>
              會先取既有到期項目，再以 CEFR 由簡單到困難補入新項目。
            </small>
            {!hasActivePaper ? (
              <button type="button" onClick={() => void generatePaper()}>
                生成本回合試卷
              </button>
            ) : null}
          </section>
        ) : (
          <section className="review-empty-state">
            <strong>目前沒有可複習的項目</strong>
            <p>
              {summary.nextDueAt
                ? `下一個項目預計於 ${dueLabel(summary.nextDueAt)} 到期。`
                : "先從閱讀內容建立學習項目，再回來開始複習。"}
            </p>
          </section>
        )
      ) : null}

      {phase === "generating" ? (
        <section
          className="review-generation-state"
          aria-label="AI 生成試卷"
          aria-busy="true"
        >
          <header className="review-generation-heading">
            <span className="review-generation-mark" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <span>AI 生成中</span>
              <h2>
                正在準備 {summary?.selectedItems.length ?? 0} 題複習試卷
              </h2>
            </div>
          </header>

          <ol className="review-generation-stages" aria-label="生成階段">
            <li className={generationProgress.phase === "preparing"
              ? "is-active"
              : "is-complete"}>
              <span aria-hidden="true">
                {generationProgress.phase === "assembling"
                  ? <Check size={15} />
                  : <LoaderCircle size={15} />}
              </span>
              <div>
                <strong>產生例句</strong>
                <small>依每個項目的特定語義建立自然例句</small>
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
                <strong>組裝並檢查試卷</strong>
                <small>確認題目完整且可以安全顯示</small>
              </div>
            </li>
          </ol>

          <p
            className="review-generation-message"
            role="status"
            aria-live="polite"
          >
            {generationProgress.phase === "preparing"
              ? `已完成 ${generationProgress.completedCount}／${generationProgress.totalCount} 題例句`
              : "例句已完成，正在組裝並檢查試卷"}
          </p>
          <div
            className="review-generation-progress"
            role="progressbar"
            aria-label="AI 生成試卷進度"
            aria-valuemin={0}
            aria-valuemax={generationProgress.totalCount}
            aria-valuenow={generationProgress.completedCount}
            aria-valuetext={generationProgress.phase === "preparing"
              ? `已完成 ${generationProgress.completedCount}／${generationProgress.totalCount} 題例句`
              : "正在組裝並檢查試卷"}
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
            <span>已等待 {generationElapsedSeconds} 秒</span>
            <button type="button" onClick={cancelGeneration}>
              取消生成
            </button>
          </footer>
        </section>
      ) : null}

      {paper && isPaperViewPaused &&
        ["answering", "reviewing"].includes(phase) ? (
          <section
            className="review-resume-state"
            aria-label="當前試卷"
          >
            <span aria-hidden="true"><Check size={20} /></span>
            <div>
              <h2>當前試卷</h2>
              <p>
                {phase === "reviewing"
                  ? `${paper.questions.length} 題詞義回想 · 已完成作答，等待確認評級。`
                  : `${paper.questions.length} 題詞義回想 · 已作答 ${
                      paper.questions.length - unansweredCount
                    }／${paper.questions.length} 題`}
              </p>
            </div>
            <div className="review-resume-actions">
              <button
                className="review-abandon-action"
                type="button"
                onClick={() => setIsAbandonConfirmationOpen(true)}
              >
                放棄試卷
              </button>
              <button
                className="review-resume-action"
                type="button"
                onClick={() => setIsPaperViewPaused(false)}
              >
                查看試卷
              </button>
            </div>
          </section>
        ) : null}

      {paper && !isPaperViewPaused &&
        ["answering", "grading", "reviewing", "confirming"].includes(phase) ? (
        <div className="spaced-review-paper">
          <div className="review-paper-progress">
            <strong>{paper.questions.length} 題詞義回想</strong>
            <div>
              <span>{unansweredCount} 題未作答</span>
              {phase === "answering" || phase === "reviewing" ? (
                <button
                  type="button"
                  onClick={() => setIsPaperViewPaused(true)}
                >
                  先離開
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
                  <span>這個詞在句中的意思</span>
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
                      placeholder="可以留白，未作答會評為忘記"
                    />
                    {result?.expressionFeedback?.status === "improvable" ? (
                      <div className="review-answer-correction">
                        <span>口語修正 →</span>
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
                    aria-label={`批改結果：${currentRatingLabel}`}
                  >
                    <section
                      className="review-meaning-feedback"
                      aria-label="意思判斷"
                    >
                      <strong>意思判斷</strong>
                      <p>{result.feedback}</p>
                      {result.recommendedAnswer ? (
                        <div className="review-recommended-answer">
                          <span>下次可以這樣回答</span>
                          <p>{result.recommendedAnswer}</p>
                        </div>
                      ) : null}
                    </section>
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
                        打開學習卡
                      </button>
                    ) : null}
                    <fieldset>
                      <legend>AI 建議：{
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
                <p>{unansweredCount} 題未作答，提交後將評為忘記。</p>
              ) : <p>所有題目都已作答。</p>}
              <button type="button" onClick={() => void submitAnswers()}>
                提交試卷{unansweredCount ? `（${unansweredCount} 題未作答）` : ""}
              </button>
            </footer>
          ) : null}
          {phase === "grading" ? (
            <aside
              className="review-grading-state"
              role="status"
              aria-label="AI 正在批改試卷"
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
                <span>AI 批改中</span>
                <h2>正在分析你的答案</h2>
                <p>
                  比對詞義與句子語境，並在適用時提供遣詞用句建議。
                </p>
                <div className="review-grading-progress" aria-hidden="true">
                  <span />
                </div>
              </div>
            </aside>
          ) : null}
          {phase === "reviewing" || phase === "confirming" ? (
            <footer className="review-paper-actions">
              <p>可直接接受全部 AI 建議，或調整個別評級。</p>
              <button
                type="button"
                disabled={phase === "confirming"}
                onClick={() => void confirmRatings()}
              >
                {phase === "confirming"
                  ? "更新排程中…"
                  : "接受評級並更新排程"}
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}

      {phase === "completed" && completed ? (
        <section className="review-completed">
          <span aria-hidden="true">✓</span>
          <h2>本回合已完成</h2>
          <p>已更新 {completed.entries.length} 個學習項目的下次複習時間。</p>
          <ul>
            {completed.entries.map((entry) => {
              const title = paper?.questions.find(
                ({ itemId }) => itemId === entry.itemId
              )?.title ?? "學習項目";
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
                      `${title}，${ratingLabel}，下次複習：${nextDueLabel}`
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
                        <small>下次複習</small>
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
              繼續下一回合（剩餘 {completed.remainingAvailable} 個）
            </button>
          ) : (
            <button type="button" onClick={() => void loadSummary()}>
              返回複習總覽
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
            <h2 id="review-abandon-title">放棄目前試卷？</h2>
            <p id="review-abandon-description">
              題目、答案、AI 回饋與未確認評級都會清除，且無法復原；
              複習排程不會更新。
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                disabled={isAbandoning}
                onClick={() => setIsAbandonConfirmationOpen(false)}
              >
                取消
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={isAbandoning}
                onClick={() => void abandonCurrentPaper()}
              >
                {isAbandoning ? "放棄中…" : "確認放棄"}
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
          readOnly
          onClose={closeItemDetail}
        />
      ) : null}
    </section>
  );
}
