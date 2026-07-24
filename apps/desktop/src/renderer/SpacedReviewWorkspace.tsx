import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import type {
  ConfirmReviewSessionResult,
  ReviewDesktopApi,
  ReviewGrade,
  ReviewPaper,
  ReviewRating,
  ReviewSummary
} from "../shared/review-contracts";
import type { ExplanationLanguage } from "../shared/settings-contracts";

const ratingOptions: Array<{ value: ReviewRating; label: string }> = [
  { value: "forgotten", label: "忘記" },
  { value: "hard", label: "困難" },
  { value: "good", label: "順利" },
  { value: "easy", label: "簡單" }
];

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
  explanationLanguage,
  onAvailableCountChange
}: {
  api: ReviewDesktopApi;
  explanationLanguage: ExplanationLanguage;
  onAvailableCountChange?(count: number): void;
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
  const [generationStage, setGenerationStage] = useState<
    "preparing" | "assembling"
  >("preparing");
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const generationAttemptRef = useRef(0);

  async function loadSummary() {
    setPhase("loading");
    setError("");
    setPaper(undefined);
    setGrade(undefined);
    setCompleted(undefined);
    setAnswers({});
    setFinalRatings({});
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
    const unsubscribeProgress = api.onGenerationProgress(({ phase }) => {
      setGenerationStage(phase);
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
    setGenerationStage("preparing");
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
    setGenerationStage("preparing");
    setPhase("ready");
    void api.discardPaper();
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
      setPhase("completed");
    } catch (confirmationError) {
      setError(confirmationError instanceof Error
        ? confirmationError.message
        : "無法更新複習排程。");
      setPhase("reviewing");
    }
  }

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

      {phase === "ready" && summary ? (
        summary.totalAvailable > 0 ? (
          <section className="review-round-summary">
            <span>本回合</span>
            <strong>{summary.selectedItems.length} 題</strong>
            <div>
              <p><b>{selectedDueCount}</b> 個既有到期項目</p>
              <p><b>{selectedNewCount}</b> 個尚未複習的新項目</p>
            </div>
            <small>
              會先取既有到期項目，再以 CEFR 由簡單到困難補入新項目。
            </small>
            <button type="button" onClick={() => void generatePaper()}>
              生成本回合試卷
            </button>
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
            <li className={generationStage === "preparing"
              ? "is-active"
              : "is-complete"}>
              <span aria-hidden="true">
                {generationStage === "assembling"
                  ? <Check size={15} />
                  : <LoaderCircle size={15} />}
              </span>
              <div>
                <strong>產生例句</strong>
                <small>依每個項目的特定語義建立自然例句</small>
              </div>
            </li>
            <li className={generationStage === "assembling"
              ? "is-active"
              : "is-pending"}>
              <span aria-hidden="true">
                {generationStage === "assembling"
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
            {generationStage === "preparing"
              ? "AI 正在為本回合項目產生例句"
              : "例句已完成，正在組裝並檢查試卷"}
          </p>
          <div
            className="review-generation-progress"
            role="progressbar"
            aria-label="AI 生成試卷進度"
            aria-valuetext={generationStage === "preparing"
              ? "正在產生例句"
              : "正在組裝並檢查試卷"}
          >
            <span />
          </div>
          <footer className="review-generation-footer">
            <span>已等待 {generationElapsedSeconds} 秒</span>
            <button type="button" onClick={cancelGeneration}>
              取消生成
            </button>
          </footer>
        </section>
      ) : null}

      {paper && ["answering", "grading", "reviewing", "confirming"].includes(phase) ? (
        <div className="spaced-review-paper">
          <div className="review-paper-progress">
            <strong>{paper.questions.length} 題詞義回想</strong>
            <span>{unansweredCount} 題未作答</span>
          </div>
          {paper.questions.map((question, index) => {
            const result = grade?.results.find(({ questionId }) =>
              questionId === question.questionId
            );
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
                  <textarea
                    value={answers[question.questionId] ?? ""}
                    disabled={phase !== "answering"}
                    onChange={(event) => setAnswers((current) => ({
                      ...current,
                      [question.questionId]: event.target.value
                    }))}
                    placeholder="可以留白，未作答會評為忘記"
                  />
                </label>
                {result ? (
                  <aside className="review-feedback">
                    <p>{result.feedback}</p>
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
            <p className="library-state">AI 正在批改並建議複習評級…</p>
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
            {completed.entries.map((entry) => (
              <li key={entry.id}>
                <strong>{
                  ratingOptions.find(({ value }) =>
                    value === entry.finalRating
                  )?.label
                }</strong>
                <span>下次：{dueLabel(entry.nextDueAt)}</span>
              </li>
            ))}
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
    </section>
  );
}
