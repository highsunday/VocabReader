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
      aria-label={`Open paper: ${quiz.title}`}
      aria-expanded="false"
      onClick={onOpen}
    >
      <span className="paper-action-icon" aria-hidden="true">▧</span>
      <span>
        <small>{grade ? "Reading paper • Graded" : "Reading paper • Ready"}</small>
        <strong>{quiz.title}</strong>
        <em>
          {questionCount} questions • {grade
            ? `${grade.summary.score} • View grading`
            : "Start answering"}
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
        setSubmissionError("The paper was not submitted. Your answers are saved; please try again later.");
      }
    } catch (submitError) {
      setSubmissionError(
        submitError instanceof Error
          ? submitError.message
          : "The paper was not submitted. Your answers are saved; please try again later."
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
              {grade ? "AI grading" : "Reading paper"}
            </span>
            <span className="paper-question-count">{questionCount} questions</span>
          </div>
          <h2>{quiz.title}</h2>
          <div className="paper-meta">
            <strong>{quiz.cefr}</strong>
            <span>{quiz.multipleChoice.length} multiple choice</span>
            <span>{quiz.openEnded.length} open-ended</span>
          </div>
          <details className="paper-focus">
            <summary>
              <span>Focus</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <p>{quiz.difficultySummary}</p>
          </details>
        </div>
        <button
          className="paper-collapse-button"
          type="button"
          aria-label="Collapse paper"
          aria-expanded="true"
          onClick={onClose}
        >
          <span>Collapse</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </header>

      <div className="paper-progress-overview">
        <div>
          <span>Progress</span>
          <strong>
            {grade
              ? `Graded ${questionCount} / ${questionCount}`
              : `Answered ${answeredCount} / ${questionCount}`}
          </strong>
        </div>
        <progress
          aria-label="Paper progress"
          max={questionCount}
          value={progressValue}
        />
      </div>

      <div className="reading-practice-paper-body">
        {grade ? (
          <details className="reading-practice-summary">
            <summary>
              <span>
                <strong>Grading summary</strong>
                <small>Reading comprehension, written expression, and review focus</small>
              </span>
              <span className="paper-score">
                <small>Score</small>
                <strong>{grade.summary.score}</strong>
              </span>
              <span className="summary-toggle" aria-hidden="true">⌄</span>
            </summary>
            <div className="reading-practice-summary-content">
              <p>
                <strong>Reading comprehension</strong>
                <span>{grade.summary.reading}</span>
              </p>
              <p>
                <strong>Written expression</strong>
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
            <h3 id="multiple-choice-heading">Multiple choice</h3>
            <small>Choose the best answer</small>
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
                  aria-label={`Options for question ${question.number}`}
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
                        ? "✓ Correct"
                        : `✕ Correct answer: ${questionGrade.correctAnswer}`}
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
            <h3 id="open-ended-heading">Open-ended questions</h3>
            <small>Answer fully in your own words</small>
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
                    Answer to question {question.number}
                  </span>
                  <textarea
                    aria-label={`Answer to question ${question.number}`}
                    rows={5}
                    value={answers[question.id] ?? ""}
                    disabled={locked}
                    placeholder="Enter your answer here…"
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
                      <span>Revised answer</span>
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
          <span className="paper-marked-status">Grading complete • Answers locked</span>
        ) : marking || isSubmitting ? (
          <span className="paper-marking-status" role="status">
            AI is grading…
          </span>
        ) : unansweredCount > 0 ? (
          <span>{unansweredCount} questions unanswered</span>
        ) : (
          <span>All questions are answered. You can submit the paper.</span>
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
            {isSubmitting ? "Submitting…" : "Submit paper"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
