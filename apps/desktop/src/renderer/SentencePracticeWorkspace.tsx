import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, CircleCheck, Lightbulb, X } from "lucide-react";
import type {
  LearningDesktopApi,
  LearningItem
} from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import {
  SENTENCE_PRACTICE_ITEM_COUNT,
  type SentencePracticeDesktopApi,
  type SentencePracticeSnapshot
} from "../shared/sentence-practice-contracts";
import type { ExplanationLanguage } from "../shared/settings-contracts";
import { LearningItemDialog } from "./LearningLibraryWorkspace";

function highlightExampleUsages(
  text: string,
  usages: readonly { usage: string }[]
): ReactNode[] {
  const normalizedText = text.toLowerCase();
  const ranges = usages.flatMap(({ usage }) => {
    const target = usage.trim();
    if (!target) return [];
    const normalizedTarget = target.toLowerCase();
    const matches: { start: number; end: number }[] = [];
    let start = normalizedText.indexOf(normalizedTarget);
    while (start >= 0) {
      const before = text[start - 1] ?? "";
      const after = text[start + target.length] ?? "";
      if (!/[\p{L}\p{N}_]/u.test(before) &&
        !/[\p{L}\p{N}_]/u.test(after)) {
        matches.push({ start, end: start + target.length });
      }
      start = normalizedText.indexOf(normalizedTarget, start + target.length);
    }
    return matches;
  }).sort((left, right) =>
    left.start - right.start || right.end - left.end
  );
  const visibleRanges = ranges.reduce<{ start: number; end: number }[]>(
    (selected, range) => {
      if (!selected.length || range.start >= selected[selected.length - 1].end) {
        selected.push(range);
      }
      return selected;
    },
    []
  );
  const parts: ReactNode[] = [];
  let offset = 0;
  visibleRanges.forEach((range, index) => {
    if (range.start > offset) parts.push(text.slice(offset, range.start));
    parts.push(
      <mark
        className="reader-annotation-highlight"
        key={`${range.start}-${range.end}-${index}`}
      >
        {text.slice(range.start, range.end)}
      </mark>
    );
    offset = range.end;
  });
  if (offset < text.length) parts.push(text.slice(offset));
  return parts;
}

export function SentencePracticeWorkspace({
  api,
  learningApi,
  reviewApi,
  explanationLanguage,
  dailyGoal = 10,
  onDailyCompletedItemCountChange,
  active = true
}: {
  api: SentencePracticeDesktopApi;
  learningApi: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  explanationLanguage: ExplanationLanguage;
  dailyGoal?: number;
  onDailyCompletedItemCountChange?(count: number): void;
  active?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<SentencePracticeSnapshot>();
  const [itemCount, setItemCount] = useState<number>(
    SENTENCE_PRACTICE_ITEM_COUNT.default
  );
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHome, setShowHome] = useState(false);
  const [isExamplesOpen, setIsExamplesOpen] = useState(false);
  const [isGeneratingExamples, setIsGeneratingExamples] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LearningItem>();
  const [isNewRoundConfirmationOpen, setIsNewRoundConfirmationOpen] =
    useState(false);

  useEffect(() => {
    let mounted = true;
    void api.getSnapshot()
      .then((next) => {
        if (!mounted) return;
        setSnapshot(next);
        setDraft(next.session?.draft ?? "");
        setItemCount(Math.max(
          SENTENCE_PRACTICE_ITEM_COUNT.minimum,
          Math.min(
            SENTENCE_PRACTICE_ITEM_COUNT.default,
            next.eligibleCount,
            SENTENCE_PRACTICE_ITEM_COUNT.maximum
          )
        ));
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error
          ? cause.message
          : "Unable to load sentence practice.");
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  useEffect(() => {
    if (snapshot) {
      onDailyCompletedItemCountChange?.(
        snapshot.statistics?.todayCompletedItemCount ??
          snapshot.dailyCompletedItemCount
      );
    }
  }, [
    onDailyCompletedItemCountChange,
    snapshot?.dailyCompletedItemCount,
    snapshot?.statistics?.todayCompletedItemCount
  ]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextLocalDay = () => {
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0);
      timer = setTimeout(() => {
        void api.getSnapshot()
          .then((next) => {
            if (mounted) setSnapshot(next);
          })
          .catch(() => {
            // Keep the last known count and retry at the next local day.
          })
          .finally(() => {
            if (mounted) scheduleNextLocalDay();
          });
      }, Math.max(1, nextDay.getTime() - now.getTime() + 50));
    };
    scheduleNextLocalDay();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [api]);

  const eligibleCount = snapshot?.eligibleCount ?? 0;
  const maximumCount = Math.min(
    eligibleCount,
    SENTENCE_PRACTICE_ITEM_COUNT.maximum
  );
  const canStart = eligibleCount >= SENTENCE_PRACTICE_ITEM_COUNT.minimum;
  const session = snapshot?.session;
  const todayCompletedItemCount = snapshot?.statistics
    ?.todayCompletedItemCount ?? snapshot?.dailyCompletedItemCount ?? 0;
  const totalCompletedItemCount = snapshot?.statistics
    ?.totalCompletedItemCount ?? todayCompletedItemCount;
  const completedItemCount30Days = snapshot?.statistics
    ?.completedItemCount30Days ?? todayCompletedItemCount;
  const dailyActivity = snapshot?.statistics?.dailyActivity ?? [];
  const isDailyGoalComplete = dailyGoal > 0 &&
    todayCompletedItemCount >= dailyGoal;
  const dailyProgressValue = dailyGoal > 0
    ? Math.min(todayCompletedItemCount, dailyGoal)
    : 0;
  const maximumDailyActivity = Math.max(
    1,
    ...dailyActivity.map(({ completedItemCount }) => completedItemCount)
  );

  async function startSession() {
    if (isBusy || !canStart) return;
    setIsBusy(true);
    setError("");
    try {
      const next = await api.startSession({ itemCount });
      setSnapshot(next);
      setDraft("");
      setShowHome(false);
      setIsExamplesOpen(false);
      setIsNewRoundConfirmationOpen(false);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Unable to start sentence practice.");
    } finally {
      setIsBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || !draft.trim() || isBusy || isGeneratingExamples) return;
    setIsBusy(true);
    setError("");
    try {
      const next = await api.submit({
        sessionId: session.sessionId,
        draft,
        explanationLanguage
      });
      setSnapshot(next);
      setDraft(next.session?.draft ?? draft);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Unable to check your writing.");
    } finally {
      setIsBusy(false);
    }
  }

  async function openItem(itemId: string) {
    setError("");
    try {
      setSelectedItem(await learningApi.getItem(itemId));
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Unable to open this learning item.");
    }
  }

  async function generateExamples() {
    if (!session || isBusy || isGeneratingExamples) return;
    setIsGeneratingExamples(true);
    setError("");
    try {
      setSnapshot(await api.generateExamples({
        sessionId: session.sessionId,
        explanationLanguage
      }));
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Unable to generate writing examples.");
    } finally {
      setIsGeneratingExamples(false);
    }
  }

  function openExamples() {
    if (!session) return;
    setIsExamplesOpen(true);
    if (session.exampleGeneration.phase === "idle") {
      void generateExamples();
    }
  }

  const isAiBusy = isBusy || isGeneratingExamples ||
    session?.phase === "checking" ||
    session?.exampleGeneration.phase === "generating";

  if (!active) return null;

  return (
    <section
      className="sentence-practice-workspace"
      aria-labelledby="sentence-practice-title"
    >
      <header className="sentence-practice-heading">
        <div>
          <span className="eyebrow">Active English writing</span>
          <h1 id="sentence-practice-title">Sentence Practice</h1>
          <p>
            Write one story or short passage with multiple sentences. Use every
            selected word and phrase naturally.
          </p>
        </div>
        {session && !showHome ? (
          <div className="sentence-practice-heading-actions">
            <span
              className="sentence-practice-compact-progress"
              data-complete={isDailyGoalComplete}
            >
              {isDailyGoalComplete ? <CircleCheck aria-hidden="true" /> : null}
              Today {todayCompletedItemCount}
              {dailyGoal > 0 ? ` / ${dailyGoal}` : ""}
            </span>
            <button
              type="button"
              className="secondary-action"
              onClick={() => setShowHome(true)}
              disabled={isAiBusy}
            >
              <ArrowLeft aria-hidden="true" />
              Back to Sentence Practice
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => setIsNewRoundConfirmationOpen(true)}
              disabled={isAiBusy}
            >
              New round
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="library-error" role="alert">{error}</p> : null}

      {!snapshot ? (
        <p className="sentence-practice-loading" role="status">
          Loading reviewed English items…
        </p>
      ) : !session || showHome ? (
        <>
          <section
            className="sentence-practice-today-card"
            aria-label="Today's sentence practice"
          >
            <div>
              <span className="eyebrow">Today's practice</span>
              {dailyGoal > 0 ? (
                <strong>{todayCompletedItemCount} / {dailyGoal}</strong>
              ) : (
                <strong>{todayCompletedItemCount} successful uses today</strong>
              )}
              <p>
                {dailyGoal > 0
                  ? isDailyGoalComplete
                    ? "Today's goal complete"
                    : `${dailyGoal - todayCompletedItemCount} left today`
                  : "Daily goal is off. Successful practice still counts."}
              </p>
            </div>
            {dailyGoal > 0 ? (
              <div
                className="sentence-practice-daily-progress"
                role="progressbar"
                aria-label="Daily sentence practice goal"
                aria-valuemin={0}
                aria-valuemax={dailyGoal}
                aria-valuenow={dailyProgressValue}
                aria-valuetext={`${todayCompletedItemCount} of ${dailyGoal} successful uses`}
                data-complete={isDailyGoalComplete}
              >
                <span style={{
                  width: `${Math.min(
                    100,
                    dailyGoal ? todayCompletedItemCount / dailyGoal * 100 : 0
                  )}%`
                }} />
              </div>
            ) : null}
          </section>

          <section className="sentence-practice-setup" aria-label="Practice setup">
            <div>
              <strong>{eligibleCount} reviewed English items available</strong>
              <p>
                Only active English items with at least one confirmed review are
                included. This practice does not change review scheduling.
              </p>
            </div>
            {session ? (
              <section
                className="sentence-practice-current-round"
                aria-label="Current practice"
              >
                <div>
                  <span className="eyebrow">Current round</span>
                  <strong>Practice in progress</strong>
                  <p>
                    {session.items.length} required items. Your draft and feedback
                    are kept while you visit this page.
                  </p>
                </div>
                <div className="sentence-practice-current-round-actions">
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => setShowHome(false)}
                  >
                    Continue practice
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setIsNewRoundConfirmationOpen(true)}
                    disabled={isBusy}
                  >
                    New round
                  </button>
                </div>
              </section>
            ) : canStart ? (
              <div className="sentence-practice-count-control">
                <label htmlFor="sentence-practice-count">
                  Number of learning items
                </label>
                <input
                  id="sentence-practice-count"
                  type="number"
                  min={SENTENCE_PRACTICE_ITEM_COUNT.minimum}
                  max={maximumCount}
                  value={itemCount}
                  onChange={(event) => setItemCount(Math.max(
                    SENTENCE_PRACTICE_ITEM_COUNT.minimum,
                    Math.min(maximumCount, Number(event.target.value))
                  ))}
                />
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => void startSession()}
                  disabled={isBusy}
                >
                  {isBusy ? "Preparing…" : "Start practice"}
                </button>
              </div>
            ) : (
              <p className="sentence-practice-empty" role="status">
                Complete spaced review for at least two English learning items to
                start a writing practice.
              </p>
            )}
          </section>

          <div className="sentence-practice-statistics">
            <section
              className="sentence-practice-lifetime-card"
              aria-label="All-time sentence practice"
            >
              <span className="eyebrow">All-time practice</span>
              <strong>{totalCompletedItemCount}</strong>
              <p>successful learning-item uses</p>
            </section>
            <section
              className="sentence-practice-activity-card"
              aria-label="30-day writing activity"
            >
              <header>
                <div>
                  <span className="eyebrow">Recent activity</span>
                  <h2>Last 30 days</h2>
                </div>
                <strong>{completedItemCount30Days} successful uses</strong>
              </header>
              <ol className="sentence-practice-activity-days">
                {dailyActivity.map(({ date, completedItemCount }) => (
                  <li
                    key={date}
                    aria-label={`${date}: ${completedItemCount} successful uses`}
                    title={`${date}: ${completedItemCount} successful uses`}
                    data-level={completedItemCount === 0
                      ? 0
                      : Math.max(1, Math.ceil(
                          completedItemCount / maximumDailyActivity * 4
                        ))}
                  >
                    <span aria-hidden="true">{Number(date.slice(-2))}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      ) : (
        <div className="sentence-practice-session">
          <section className="sentence-practice-targets" aria-label="Required items">
            <div className="sentence-practice-section-heading">
              <div>
                <span className="eyebrow">Required items</span>
                <h2>Use all {session.items.length} in one passage</h2>
              </div>
              <span>{session.items.filter((item) =>
                session.issues.some((issue) => issue.itemId === item.id)
              ).length || "All"} {session.issues.length ? "to revise" : "in scope"}</span>
            </div>
            <ul>
              {session.items.map((item) => {
                const issue = session.issues.find(({ itemId }) =>
                  itemId === item.id
                );
                return (
                  <li key={item.id} data-issue={issue?.kind ?? "none"}>
                    <button
                      type="button"
                      aria-label={`View ${item.title} details`}
                      onClick={() => void openItem(item.id)}
                    >
                      <span>
                        <em>{item.itemType === "word" ? "Word" : "Phrase"}</em>
                        <em>{item.cefr}</em>
                      </span>
                      <strong>{item.title}</strong>
                      <p>{item.meaning}</p>
                    </button>
                    {issue ? <small>{issue.message}</small> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <form className="sentence-practice-editor" onSubmit={submit}>
            <div className="sentence-practice-section-heading">
              <div>
                <span className="eyebrow">Your writing</span>
                <h2>Build a story or short passage</h2>
              </div>
              <span>Multiple sentences are welcome</span>
            </div>
            <label htmlFor="sentence-practice-draft">Your story or passage</label>
            <textarea
              id="sentence-practice-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a short story or passage that naturally uses every required item…"
              disabled={isAiBusy}
            />
            <div className="sentence-practice-editor-footer">
              <button
                type="button"
                className="secondary-action sentence-practice-examples-trigger"
                onClick={openExamples}
                disabled={isAiBusy}
              >
                <Lightbulb aria-hidden="true" />
                {isGeneratingExamples
                  ? "Generating examples…"
                  : "Show 3 examples"}
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={!draft.trim() || isAiBusy}
              >
                {isBusy || session.phase === "checking"
                  ? "Checking…"
                  : "Check my writing"}
              </button>
            </div>
          </form>

          {session.phase === "needs-revision" ? (
            <section className="sentence-practice-revision" role="region">
              <span className="eyebrow">Required-item check</span>
              <h2>Revise these items</h2>
              <p>
                Your draft is still here. Update the highlighted items and
                submit again for full feedback.
              </p>
              <ul>
                {session.issues.map((issue) => (
                  <li key={issue.itemId}>
                    <strong>{issue.title}</strong>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {session.phase === "error" ? (
            <p className="library-error" role="alert">
              {session.error} Your draft is safe; try submitting again.
            </p>
          ) : null}

          {session.feedback ? (
            <section className="sentence-practice-feedback" aria-label="AI writing feedback">
              <section className="sentence-practice-correction-card">
                <div className="sentence-practice-correction-revised">
                  <span className="eyebrow">Corrected passage</span>
                  <h2>Revised version</h2>
                  <p className="sentence-practice-revised-text">
                    {session.feedback.revisedText}
                  </p>
                </div>

                <div className="sentence-practice-correction-changes">
                  {session.feedback.changes.length ? (
                    <>
                      <h2>Why these changes help</h2>
                      <ol className="sentence-practice-feedback-list">
                        {session.feedback.changes.map((change, index) => (
                          <li key={`${change.original}-${index}`}>
                            <del>{change.original}</del>
                            <ins>{change.revised}</ins>
                            <p>{change.explanation}</p>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <div
                      className="sentence-practice-success-notice"
                      role="status"
                      aria-label="Everything looks good"
                    >
                      <CircleCheck aria-hidden="true" />
                      <div>
                        <strong>Everything looks good</strong>
                        <p>
                          All required items are used correctly, and no grammar
                          or wording changes are needed.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {session.feedback.conversationalSuggestions.length ? (
                <section>
                  <h2>More conversational options</h2>
                  <ol className="sentence-practice-feedback-list">
                    {session.feedback.conversationalSuggestions.map(
                      (suggestion, index) => (
                        <li key={`${suggestion.original}-${index}`}>
                          <span>{suggestion.original}</span>
                          <ins>{suggestion.suggested}</ins>
                          <p>{suggestion.explanation}</p>
                        </li>
                      )
                    )}
                  </ol>
                </section>
              ) : null}

              <section>
                <h2>Required-item usage</h2>
                <ul className="sentence-practice-usages">
                  {session.feedback.usages.map((usage) => (
                    <li key={usage.itemId}>
                      <strong>{usage.title}</strong>
                      <span>{usage.usage}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </section>
          ) : null}
        </div>
      )}

      {selectedItem ? (
        <LearningItemDialog
          item={selectedItem}
          api={learningApi}
          reviewApi={reviewApi}
          readOnly
          onClose={() => setSelectedItem(undefined)}
        />
      ) : null}

      {isExamplesOpen && session ? (
        <div
          className="learning-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsExamplesOpen(false);
            }
          }}
        >
          <section
            className="sentence-practice-examples-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sentence-practice-examples-title"
          >
            <header>
              <div>
                <span className="eyebrow">AI usage guide</span>
                <h2 id="sentence-practice-examples-title">Writing examples</h2>
                <p>
                  Each example naturally uses all {session.items.length}{" "}
                  required items. Use them for inspiration, not as a fixed answer.
                </p>
              </div>
              <button
                type="button"
                className="sentence-practice-examples-close"
                aria-label="Close examples"
                onClick={() => setIsExamplesOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="sentence-practice-examples-body">
              {isGeneratingExamples ||
              session.exampleGeneration.phase === "generating" ? (
                <div className="sentence-practice-examples-loading" role="status">
                  <span aria-hidden="true" />
                  <strong>Generating 3 examples…</strong>
                  <p>
                    AI is building three different contexts with every required
                    item.
                  </p>
                </div>
              ) : session.exampleGeneration.phase === "error" ? (
                <div className="sentence-practice-examples-error" role="alert">
                  <strong>Examples could not be generated</strong>
                  <p>{session.exampleGeneration.error}</p>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void generateExamples()}
                  >
                    Try again
                  </button>
                </div>
              ) : session.exampleGeneration.examples.length ? (
                <ol className="sentence-practice-examples-list">
                  {session.exampleGeneration.examples.map((example, index) => (
                    <li key={`${example.text}-${index}`}>
                      <article>
                        <span>Example {index + 1}</span>
                        <p>
                          {highlightExampleUsages(example.text, example.usages)}
                        </p>
                      </article>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>

            {session.exampleGeneration.phase === "ready" ? (
              <footer>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void generateExamples()}
                  disabled={isGeneratingExamples}
                >
                  Generate 3 new examples
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setIsExamplesOpen(false)}
                >
                  Close
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}

      {isNewRoundConfirmationOpen ? (
        <div className="learning-dialog-backdrop">
          <section
            className="sentence-practice-new-round-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sentence-practice-new-round-title"
          >
            <div className="sentence-practice-new-round-dialog-body">
              <span className="eyebrow">Start over</span>
              <h2 id="sentence-practice-new-round-title">Start a new round?</h2>
              <p>
                The current items, draft and feedback will be replaced and cannot
                be recovered.
              </p>
              <label className="sentence-practice-new-round-count">
                Number of items for the new round
                <input
                  type="number"
                  min={SENTENCE_PRACTICE_ITEM_COUNT.minimum}
                  max={maximumCount}
                  value={itemCount}
                  onChange={(event) => setItemCount(Math.max(
                    SENTENCE_PRACTICE_ITEM_COUNT.minimum,
                    Math.min(maximumCount, Number(event.target.value))
                  ))}
                />
              </label>
            </div>
            <div className="sentence-practice-new-round-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsNewRoundConfirmationOpen(false)}
              >
                Keep current round
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => void startSession()}
              >
                Start new round
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
