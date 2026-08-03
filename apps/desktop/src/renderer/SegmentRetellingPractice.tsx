import { useEffect, useMemo, useState } from "react";
import {
  formatSegmentRetellingSubmission,
  segmentRetellingAnswers,
  segmentRetellingArtifacts
} from "./segment-retelling-artifact";
import type {
  SegmentRetellingGrade,
  SegmentRetellingTask
} from "./segment-retelling-artifact";

interface SegmentRetellingPracticeProps {
  open: boolean;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  onOpen(): void;
  onClose(): void;
  onSubmit(text: string): Promise<boolean> | boolean;
}

function RetellingAction({
  task,
  grades,
  onOpen
}: {
  task: SegmentRetellingTask;
  grades: SegmentRetellingGrade[];
  onOpen(): void;
}) {
  const latest = grades.at(-1);
  return (
    <button
      className={`reading-practice-paper-action segment-retelling-action ${latest ? "graded" : "ready"}`}
      type="button"
      aria-label={`Open retelling practice: ${task.title}`}
      aria-expanded="false"
      onClick={onOpen}
    >
      <span className="paper-action-icon" aria-hidden="true">↺</span>
      <span>
        <small>{latest ? "Retelling • Graded" : "Retelling • Ready"}</small>
        <strong>{task.title}</strong>
        <em>{latest ? `${latest.scores.total} / 15 • View feedback` : task.answerLanguage}</em>
      </span>
      <span className="paper-action-arrow" aria-hidden="true">→</span>
    </button>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="retelling-feedback-group">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </section>
  );
}

function GradeResult({
  grade,
  originalAnswer
}: {
  grade: SegmentRetellingGrade;
  originalAnswer: string;
}) {
  const scoreCards = [
    ["Accuracy", grade.scores.accuracy],
    ["Completeness", grade.scores.completeness],
    ["Expression", grade.scores.expression]
  ] as const;
  return (
    <div className="retelling-grade-result">
      {originalAnswer ? (
        <section className="retelling-revision-card original-response">
          <h3>Attempt {grade.attempt} — Your original response</h3>
          <p className="retelling-original-text">{originalAnswer}</p>
        </section>
      ) : null}

      <section className="retelling-revision-card">
        <h3>Foundational revision</h3>
        <p className="retelling-revision-text">{grade.foundationalRevision}</p>
        <div className="retelling-change-columns">
          <FeedbackList title="Content changes" items={grade.foundationalChanges.content} />
          <FeedbackList title="Language changes" items={grade.foundationalChanges.language} />
        </div>
      </section>

      <section className="retelling-revision-card next-step">
        <h3>Next-step revision</h3>
        <p className="retelling-revision-text">{grade.nextStepRevision}</p>
        <FeedbackList title="Details added" items={grade.addedDetails} />
      </section>

      <section className="retelling-score-section">
        <div className="retelling-score-heading">
          <h3>Score</h3>
          <strong>{grade.scores.total} / 15</strong>
        </div>
        <div className="retelling-score-grid">
          {scoreCards.map(([label, score]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{score.score} / 5</strong>
              <p>{score.reason}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function SegmentRetellingPractice({
  open,
  messages,
  onOpen,
  onClose,
  onSubmit
}: SegmentRetellingPracticeProps) {
  const { task, grades } = useMemo(
    () => segmentRetellingArtifacts(messages),
    [messages]
  );
  const submittedAnswers = useMemo(
    () => task
      ? segmentRetellingAnswers(messages, task.practiceId)
      : (["", ""] as [string, string]),
    [messages, task]
  );
  const [practiceId, setPracticeId] = useState<string>();
  const [answers, setAnswers] = useState<[string, string]>(["", ""]);
  const [activeAttempt, setActiveAttempt] = useState<1 | 2>(1);
  const [submittedAttempt, setSubmittedAttempt] = useState<1 | 2>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  useEffect(() => {
    if (!task || task.practiceId === practiceId) return;
    setPracticeId(task.practiceId);
    setAnswers(["", ""]);
    setActiveAttempt(1);
    setSubmittedAttempt(undefined);
    setSubmissionError("");
  }, [practiceId, task]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!task) return null;
  if (!open) {
    return <RetellingAction task={task} grades={grades} onOpen={onOpen} />;
  }

  const latestGrade = grades.at(-1);
  const currentGrade = grades.find((grade) => grade.attempt === activeAttempt);
  const answer = answers[activeAttempt - 1];
  const locked = Boolean(
    currentGrade || isSubmitting || submittedAttempt === activeAttempt
  );
  const marking = Boolean(
    !currentGrade && submittedAttempt === activeAttempt
  );
  const showEditor = !currentGrade &&
    (activeAttempt === 1 ? grades.length === 0 : grades.length === 1);

  async function submitRetelling() {
    if (!task || !answer.trim() || locked) return;
    setIsSubmitting(true);
    setSubmissionError("");
    try {
      const sent = await onSubmit(formatSegmentRetellingSubmission(
        task,
        activeAttempt,
        answer
      ));
      if (sent) {
        setSubmittedAttempt(activeAttempt);
      } else {
        setSubmissionError("The retelling was not submitted. Your writing is saved; please try again later.");
      }
    } catch (error) {
      setSubmissionError(error instanceof Error
        ? error.message
        : "The retelling was not submitted. Your writing is saved; please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="reading-practice-paper segment-retelling-practice"
      role="region"
      aria-label={task.title}
    >
      <header className="reading-practice-paper-heading">
        <div className="paper-heading-copy">
          <div className="paper-heading-topline">
            <span className="paper-kicker">
              {latestGrade ? "AI feedback" : "Retelling practice"}
            </span>
            <span className="paper-question-count">
              Attempt {latestGrade?.attempt ?? activeAttempt} of 2
            </span>
          </div>
          <h2>{task.title}</h2>
          <div className="paper-meta">
            <strong>{task.answerLanguage}</strong>
            <span>Freeform response</span>
          </div>
          <p className="retelling-language-instruction">{task.answerInstruction}</p>
        </div>
        <button
          className="paper-collapse-button"
          type="button"
          aria-label="Collapse retelling practice"
          aria-expanded="true"
          onClick={onClose}
        >
          <span>Collapse</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </header>

      <div className="reading-practice-paper-body retelling-paper-body">
        {grades.map((grade) => (
          <GradeResult
            grade={grade}
            originalAnswer={submittedAnswers[grade.attempt - 1] ||
              answers[grade.attempt - 1]}
            key={grade.attempt}
          />
        ))}

        {showEditor ? (
          <section className="retelling-editor-section">
            <div className="paper-section-heading">
              <span>Attempt {activeAttempt}</span>
              <h3>Your retelling</h3>
              <small>Use your own words and write as much or as little as you need.</small>
            </div>
            <article className="paper-question open-ended retelling-answer-card">
              <label>
                <span className="visually-hidden">Retelling attempt {activeAttempt}</span>
                <textarea
                  aria-label={`Retelling attempt ${activeAttempt}`}
                  rows={9}
                  value={answer}
                  disabled={locked}
                  placeholder={`Write in ${task.answerLanguage}…`}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnswers((current) => activeAttempt === 1
                      ? [value, current[1]]
                      : [current[0], value]);
                  }}
                />
              </label>
            </article>
          </section>
        ) : null}

        {grades.length === 2 && grades[1]?.comparison ? (
          <section className="retelling-comparison red-pen-note">
            <h3>Attempt comparison</h3>
            <p>{grades[1].comparison.summary}</p>
            <div>
              <span>{signed(grades[1].comparison.accuracyDelta)} accuracy</span>
              <span>{signed(grades[1].comparison.completenessDelta)} completeness</span>
              <span>{signed(grades[1].comparison.expressionDelta)} expression</span>
              <strong>{signed(grades[1].comparison.totalDelta)} total</strong>
            </div>
          </section>
        ) : null}
      </div>

      <footer className="reading-practice-paper-footer">
        {marking || isSubmitting ? (
          <span className="paper-marking-status" role="status">AI is grading…</span>
        ) : grades.length === 2 ? (
          <span className="paper-marked-status">Two attempts complete</span>
        ) : grades.length === 1 && activeAttempt === 1 ? (
          <span className="paper-marked-status">First feedback complete</span>
        ) : answer.trim() ? (
          <span>Your retelling is ready to submit.</span>
        ) : (
          <span>Write freely in {task.answerLanguage}.</span>
        )}
        {submissionError ? <small role="alert">{submissionError}</small> : null}
        {grades.length === 1 && activeAttempt === 1 ? (
          <button type="button" onClick={() => {
            setActiveAttempt(2);
            setSubmittedAttempt(undefined);
            setSubmissionError("");
          }}>
            Retell again
          </button>
        ) : showEditor ? (
          <button
            type="button"
            onClick={() => void submitRetelling()}
            disabled={!answer.trim() || locked}
          >
            {isSubmitting ? "Submitting…" : "Submit retelling"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
