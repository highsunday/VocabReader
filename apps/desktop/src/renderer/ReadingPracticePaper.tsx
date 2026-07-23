import { useEffect, useMemo, useState } from "react";
import {
  formatReadingPracticeSubmission,
  readingPracticeArtifacts
} from "./reading-practice-artifact";
import type {
  MultipleChoiceAnswer,
  ReadingPracticeAnswers,
  ReadingPracticeGrade,
  ReadingPracticeQuiz
} from "./reading-practice-artifact";

interface ReadingPracticePaperProps {
  open: boolean;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  onOpen(): void;
  onClose(): void;
  onSubmit(text: string): Promise<boolean> | boolean;
}

const ANSWER_LABELS: MultipleChoiceAnswer[] = ["A", "B", "C", "D"];

export function ReadingPracticePaperAction({
  quiz,
  grade,
  onOpen
}: {
  quiz: ReadingPracticeQuiz;
  grade?: ReadingPracticeGrade;
  onOpen(): void;
}) {
  const questionCount = quiz.multipleChoice.length + quiz.openEnded.length;
  return (
    <button
      className={`reading-practice-paper-action ${grade ? "graded" : "ready"}`}
      type="button"
      aria-label={`開啟試卷：${quiz.title}`}
      aria-expanded="false"
      onClick={onOpen}
    >
      <span className="paper-action-icon" aria-hidden="true">▧</span>
      <span>
        <small>{grade ? "Reading paper · 已批改" : "Reading paper · 已準備"}</small>
        <strong>{quiz.title}</strong>
        <em>
          {questionCount} 題 · {grade
            ? `${grade.summary.score} · 查看紅筆批改`
            : "開始作答"}
        </em>
      </span>
      <span className="paper-action-arrow" aria-hidden="true">→</span>
    </button>
  );
}

export function ReadingPracticePaper({
  open,
  messages,
  onOpen,
  onClose,
  onSubmit
}: ReadingPracticePaperProps) {
  const { quiz, grade } = useMemo(
    () => readingPracticeArtifacts(messages),
    [messages]
  );
  const [answers, setAnswers] = useState<ReadingPracticeAnswers>({});
  const [answerQuizId, setAnswerQuizId] = useState<string>();
  const [submittedQuizId, setSubmittedQuizId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  useEffect(() => {
    if (!quiz || quiz.quizId === answerQuizId) return;
    setAnswerQuizId(quiz.quizId);
    setAnswers({});
    setSubmittedQuizId(undefined);
    setSubmissionError("");
  }, [answerQuizId, quiz]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!quiz) return null;

  if (!open) {
    return (
      <ReadingPracticePaperAction
        quiz={quiz}
        grade={grade}
        onOpen={onOpen}
      />
    );
  }

  const questions = [...quiz.multipleChoice, ...quiz.openEnded];
  const questionCount = questions.length;
  const unansweredCount = questions.filter(
    (question) => !answers[question.id]?.trim()
  ).length;
  const answeredCount = questionCount - unansweredCount;
  const progressValue = grade ? questionCount : answeredCount;
  const locked = Boolean(
    grade || isSubmitting || submittedQuizId === quiz.quizId
  );
  const marking = Boolean(!grade && submittedQuizId === quiz.quizId);

  async function submitPaper() {
    if (!quiz || unansweredCount > 0 || locked) return;
    setIsSubmitting(true);
    setSubmissionError("");
    try {
      const sent = await onSubmit(formatReadingPracticeSubmission(quiz, answers));
      if (sent) {
        setSubmittedQuizId(quiz.quizId);
      } else {
        setSubmissionError("試卷未送出，答案已保留，請稍後再試。");
      }
    } catch (submitError) {
      setSubmissionError(
        submitError instanceof Error
          ? submitError.message
          : "試卷未送出，答案已保留，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="reading-practice-paper"
      role="region"
      aria-label={quiz.title}
    >
      <header className="reading-practice-paper-heading">
        <div className="paper-heading-copy">
          <div className="paper-heading-topline">
            <span className="paper-kicker">
              {grade ? "AI 紅筆批改" : "Reading paper"}
            </span>
            <span className="paper-question-count">{questionCount} 題</span>
          </div>
          <h2>{quiz.title}</h2>
          <div className="paper-meta">
            <strong>{quiz.cefr}</strong>
            <span>{quiz.multipleChoice.length} 選擇題</span>
            <span>{quiz.openEnded.length} 問答題</span>
          </div>
          <details className="paper-focus">
            <summary>
              <span>本卷重點</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <p>{quiz.difficultySummary}</p>
          </details>
        </div>
        <button
          className="paper-collapse-button"
          type="button"
          aria-label="收起試卷"
          aria-expanded="true"
          onClick={onClose}
        >
          <span>收起</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </header>

      <div className="paper-progress-overview">
        <div>
          <span>作答進度</span>
          <strong>
            {grade
              ? `已批改 ${questionCount} / ${questionCount}`
              : `已完成 ${answeredCount} / ${questionCount}`}
          </strong>
        </div>
        <progress
          aria-label="試卷作答進度"
          max={questionCount}
          value={progressValue}
        />
      </div>

      <div className="reading-practice-paper-body">
        {grade ? (
          <details className="reading-practice-summary">
            <summary>
              <span>
                <strong>批改總結</strong>
                <small>閱讀理解、書面表達與複習重點</small>
              </span>
              <span className="paper-score">
                <small>Score</small>
                <strong>{grade.summary.score}</strong>
              </span>
              <span className="summary-toggle" aria-hidden="true">⌄</span>
            </summary>
            <div className="reading-practice-summary-content">
              <p>
                <strong>閱讀理解</strong>
                <span>{grade.summary.reading}</span>
              </p>
              <p>
                <strong>書面表達</strong>
                <span>{grade.summary.writing}</span>
              </p>
              <div className="paper-review-points">
                {grade.summary.reviewPoints.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
            </div>
          </details>
        ) : null}

        <section aria-labelledby="multiple-choice-heading">
          <div className="paper-section-heading">
            <span>Part A</span>
            <h3 id="multiple-choice-heading">選擇題</h3>
            <small>選出一個最合適的答案</small>
          </div>
          {quiz.multipleChoice.map((question) => {
            const questionGrade = grade?.multipleChoice.find(
              (item) => item.id === question.id
            );
            const answered = Boolean(
              grade || answers[question.id]?.trim()
            );
            return (
              <article
                className="paper-question"
                data-answered={answered}
                key={question.id}
              >
                <div className="paper-question-prompt">
                  <span>{question.number}</span>
                  <p>{question.prompt}</p>
                </div>
                <div
                  className="paper-options"
                  role="group"
                  aria-label={`第 ${question.number} 題選項`}
                >
                  {ANSWER_LABELS.map((label) => (
                    <label
                      className={answers[question.id] === label
                        ? "paper-option selected"
                        : "paper-option"}
                      key={label}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        aria-label={`${label} ${question.options[label]}`}
                        checked={answers[question.id] === label}
                        disabled={locked}
                        onChange={() => setAnswers((current) => ({
                          ...current,
                          [question.id]: label
                        }))}
                      />
                      <span>{label}</span>
                      <em>{question.options[label]}</em>
                    </label>
                  ))}
                </div>
                {questionGrade ? (
                  <aside className="red-pen-note">
                    <strong className={questionGrade.correct
                      ? "correct"
                      : "incorrect"}
                    >
                      {questionGrade.correct
                        ? "✓ 答對"
                        : `✕ 正解 ${questionGrade.correctAnswer}`}
                    </strong>
                    <p>{questionGrade.feedback}</p>
                  </aside>
                ) : null}
              </article>
            );
          })}
        </section>

        <section aria-labelledby="open-ended-heading">
          <div className="paper-section-heading">
            <span>Part B</span>
            <h3 id="open-ended-heading">問答題</h3>
            <small>用自己的話完整回答</small>
          </div>
          {quiz.openEnded.map((question) => {
            const questionGrade = grade?.openEnded.find(
              (item) => item.id === question.id
            );
            const answered = Boolean(
              grade || answers[question.id]?.trim()
            );
            return (
              <article
                className="paper-question open-ended"
                data-answered={answered}
                key={question.id}
              >
                <div className="paper-question-prompt">
                  <span>{question.number}</span>
                  <p>{question.prompt}</p>
                </div>
                <label>
                  <span className="visually-hidden">
                    第 {question.number} 題回答
                  </span>
                  <textarea
                    aria-label={`第 ${question.number} 題回答`}
                    rows={5}
                    value={answers[question.id] ?? ""}
                    disabled={locked}
                    placeholder="在這裡輸入你的回答…"
                    onChange={(event) => setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))}
                  />
                </label>
                {questionGrade ? (
                  <aside className="red-pen-note open-ended-note">
                    <strong className={questionGrade.correct
                      ? "correct"
                      : "incorrect"}
                    >
                      {questionGrade.assessment}
                    </strong>
                    <p>{questionGrade.feedback}</p>
                    <div>
                      <span>修正版</span>
                      <p>{questionGrade.correctedAnswer}</p>
                    </div>
                  </aside>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>

      <footer className="reading-practice-paper-footer">
        {grade ? (
          <span className="paper-marked-status">批改完成 · 答案已鎖定</span>
        ) : marking || isSubmitting ? (
          <span className="paper-marking-status" role="status">
            AI 正在紅筆批改…
          </span>
        ) : unansweredCount > 0 ? (
          <span>還有 {unansweredCount} 題未作答</span>
        ) : (
          <span>所有題目已完成，可以交卷。</span>
        )}
        {submissionError ? (
          <small role="alert">{submissionError}</small>
        ) : null}
        {!grade ? (
          <button
            type="button"
            onClick={() => void submitPaper()}
            disabled={unansweredCount > 0 || locked}
          >
            {isSubmitting ? "提交中…" : "提交試卷"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
