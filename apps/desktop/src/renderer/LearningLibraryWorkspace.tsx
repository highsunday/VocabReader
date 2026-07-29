import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { Search, Trash2, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  CefrLevel,
  LearningDesktopApi,
  LearningItem,
  LearningItemSort,
  LearningItemStudyStatus,
  LearningLibraryItem,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  LearningItemReviewDetail,
  ReviewDesktopApi,
  ReviewRating
} from "../shared/review-contracts";

const cefrLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const studyStatusLabels: Record<LearningItemStudyStatus, string> = {
  new: "New",
  learning: "Learning",
  due: "Due",
  scheduled: "Scheduled"
};

function daysUntilLocalDate(value: string, now = new Date()) {
  const due = new Date(value);
  const dueDay = Date.UTC(
    due.getFullYear(),
    due.getMonth(),
    due.getDate()
  );
  const today = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  return Math.round((dueDay - today) / 86_400_000);
}

function scheduledReviewLabel(value: string | null) {
  if (!value) return "Not due";
  const days = daysUntilLocalDate(value);
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  if (days < 28) return `in about ${Math.floor(days / 7)} weeks`;
  if (days < 365) {
    return `in about ${Math.max(1, Math.round(days / 30))} months`;
  }
  return `in about ${Math.max(1, Math.round(days / 365))} years`;
}

function cardStudyStatusLabel(item: LearningLibraryItem) {
  return item.studyStatus === "scheduled"
    ? scheduledReviewLabel(item.nextDueAt)
    : studyStatusLabels[item.studyStatus];
}

function MarkdownContent({
  children,
  label
}: {
  children: string;
  label?: string;
}) {
  return (
    <div className="learning-markdown" aria-label={label}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="markdown-table-scroll">
              <table {...props} />
            </div>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function fieldsFor(item: LearningItem): UpdateLearningItemInput {
  return {
    itemId: item.id,
    title: item.title,
    itemType: item.itemType,
    cefr: item.cefr,
    sense: item.sense,
    markdownContent: item.markdownContent
  };
}

const reviewRatingLabels: Record<ReviewRating, string> = {
  forgotten: "Forgotten",
  hard: "Hard",
  good: "Good",
  easy: "Easy"
};

function reviewTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value))
    : "—";
}

export function LearningItemDialog({
  item,
  api,
  reviewApi,
  readOnly = false,
  onClose,
  onChanged
}: {
  item: LearningItem;
  api: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: (item: LearningItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState<UpdateLearningItemInput>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [pronunciationError, setPronunciationError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [reviewDetail, setReviewDetail] = useState<LearningItemReviewDetail>();
  const [reviewDetailError, setReviewDetailError] = useState("");
  const speechRequestRef = useRef(0);

  useLayoutEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isSaving) return;
      if (isDeleteConfirming) {
        setIsDeleteConfirming(false);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDeleteConfirming, isSaving, onClose]);

  useEffect(() => () => {
    speechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!reviewApi) return;
    let active = true;
    void reviewApi.getItemDetail(item.id)
      .then((detail) => {
        if (active) setReviewDetail(detail);
      })
      .catch(() => {
        if (active) setReviewDetailError("Unable to load review history.");
      });
    return () => {
      active = false;
    };
  }, [item.id, reviewApi]);

  function pronounceTitle() {
    setPronunciationError("");
    if (
      typeof window.speechSynthesis === "undefined" ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setPronunciationError("Speech playback is not supported on this device.");
      return;
    }

    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(item.title);
      const englishVoice = window.speechSynthesis.getVoices().find((voice) =>
        voice.lang.toLowerCase().startsWith("en")
      );
      utterance.lang = englishVoice?.lang ?? "en-US";
      utterance.voice = englishVoice ?? null;
      utterance.rate = 0.85;
      utterance.pitch = 1;
      utterance.onend = () => {
        if (speechRequestRef.current === requestId) setIsSpeaking(false);
      };
      utterance.onerror = () => {
        if (speechRequestRef.current !== requestId) return;
        setIsSpeaking(false);
        setPronunciationError("Unable to play pronunciation. Please try again later.");
      };
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      speechRequestRef.current += 1;
      setIsSpeaking(false);
      setPronunciationError("Unable to play pronunciation. Please try again later.");
    }
  }

  function updateDraft(update: Partial<UpdateLearningItemInput>) {
    setDraft((current) => current ? { ...current, ...update } : current);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || isSaving || readOnly || !onChanged) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await api.updateItem(draft);
      await onChanged(updated);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the learning item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveToTrash() {
    if (isSaving || readOnly || !onChanged) return;
    setIsSaving(true);
    setError("");
    try {
      await api.trashItem(item.id);
      await onChanged({ ...item, status: "trashed" });
      onClose();
    } catch (cause) {
      setIsDeleteConfirming(false);
      setError(cause instanceof Error ? cause.message : "Unable to delete the learning item.");
    } finally {
      setIsSaving(false);
    }
  }

  function ignoreInnerMouseDown(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div
      className="learning-dialog-backdrop"
      data-testid="learning-detail-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="learning-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-item-dialog-title"
        aria-hidden={isDeleteConfirming}
        onMouseDown={ignoreInnerMouseDown}
      >
        <div className="learning-dialog-heading">
          <div>
            <span className="learning-card-badges">
              <em>{item.itemType === "word" ? "Word" : "Phrase"}</em>
              <em>{item.cefr}</em>
            </span>
            <div className="learning-dialog-title-row">
              <h2 id="learning-item-dialog-title">{item.title}</h2>
              <button
                type="button"
                className={`learning-pronunciation-button${isSpeaking ? " is-speaking" : ""}`}
                aria-label={`Play pronunciation of ${item.title}`}
                title={isSpeaking ? "Playing; click to replay" : "Play English pronunciation"}
                onClick={pronounceTitle}
              >
                <Volume2 aria-hidden="true" strokeWidth={1.9} />
              </button>
            </div>
            <p>{item.sense}</p>
            {pronunciationError ? (
              <p className="learning-pronunciation-error" role="status">
                {pronunciationError}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="learning-dialog-close"
            aria-label="Close card details"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </div>

        {error ? <p className="library-error" role="alert">{error}</p> : null}

        {draft ? (
          <form className="learning-edit-form" onSubmit={save}>
            <div className="learning-edit-fields">
              <label>
                Title
                <input
                  required
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
              </label>
              <label>
                Type
                <select
                  value={draft.itemType}
                  onChange={(event) => updateDraft({
                    itemType: event.target.value as LearningItemType
                  })}
                >
                  <option value="word">Word</option>
                  <option value="phrase">Phrase</option>
                </select>
              </label>
              <label>
                CEFR
                <select
                  value={draft.cefr}
                  onChange={(event) => updateDraft({
                    cefr: event.target.value as CefrLevel
                  })}
                >
                  {cefrLevels.map((level) => (
                    <option value={level} key={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label>
                Sense
                <input
                  required
                  value={draft.sense}
                  onChange={(event) => updateDraft({ sense: event.target.value })}
                />
              </label>
            </div>
            <div className="learning-markdown-editor">
              <label>
                Markdown content
                <textarea
                  required
                  value={draft.markdownContent}
                  onChange={(event) => updateDraft({
                    markdownContent: event.target.value
                  })}
                />
              </label>
              <section className="learning-markdown-preview">
                <span>Preview</span>
                <MarkdownContent label="Markdown preview">
                  {draft.markdownContent}
                </MarkdownContent>
              </section>
            </div>
            <div className="learning-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setDraft(undefined)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-action" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="learning-dialog-content">
              <MarkdownContent>{item.markdownContent}</MarkdownContent>
            </div>
            {reviewApi ? (
              <section className="learning-review-detail" aria-label="Review schedule">
                <div className="learning-review-detail-heading">
                  <strong>Review schedule</strong>
                  <span>{
                    reviewDetail?.status === "due"
                      ? "Due"
                      : reviewDetail?.status === "scheduled"
                        ? "Scheduled"
                        : "New item"
                  }</span>
                </div>
                {reviewDetailError ? (
                  <p className="library-error" role="status">{reviewDetailError}</p>
                ) : reviewDetail ? (
                  <>
                    <dl>
                      <div>
                        <dt>Last reviewed</dt>
                        <dd>{reviewTime(reviewDetail.lastReviewedAt)}</dd>
                      </div>
                      <div>
                        <dt>Last rating</dt>
                        <dd>{reviewDetail.lastFinalRating
                          ? reviewRatingLabels[reviewDetail.lastFinalRating]
                          : "—"}</dd>
                      </div>
                      <div>
                        <dt>Next due</dt>
                        <dd>{reviewTime(reviewDetail.nextDueAt)}</dd>
                      </div>
                      <div>
                        <dt>Total reviews</dt>
                        <dd>{reviewDetail.reviewCount}</dd>
                      </div>
                    </dl>
                    {reviewDetail.history.length ? (
                      <details>
                        <summary>View review history</summary>
                        <ol>
                          {reviewDetail.history.map((entry) => {
                            const answerState = entry.answer === null
                              ? "unavailable"
                              : entry.answer.trim()
                                ? "saved"
                                : "empty";
                            const answer = answerState === "unavailable"
                              ? "Answer wasn't saved"
                              : answerState === "empty"
                                ? "Not answered"
                                : entry.answer;
                            const rating = reviewRatingLabels[entry.finalRating];

                            return (
                              <li key={entry.id}>
                                <div className="learning-review-history-heading">
                                  <div className="learning-review-history-time">
                                    <time dateTime={entry.reviewedAt}>
                                      {reviewTime(entry.reviewedAt)}
                                    </time>
                                    <small className="learning-review-next">
                                      Next review
                                      <time dateTime={entry.nextDueAt}>
                                        {reviewTime(entry.nextDueAt)}
                                      </time>
                                    </small>
                                  </div>
                                  <span
                                    className="learning-review-rating"
                                    data-rating={entry.finalRating}
                                    aria-label={`Final result: ${rating}`}
                                  >
                                    {rating}
                                  </span>
                                </div>
                                <div
                                  className="learning-review-answer"
                                  data-answer-state={answerState}
                                >
                                  <div className="learning-review-answer-label">
                                    <strong>Your answer</strong>
                                  </div>
                                  <p>{answer}</p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </details>
                    ) : null}
                  </>
                ) : <p>Loading schedule…</p>}
              </section>
            ) : null}
            {!readOnly ? (
              <div className="learning-dialog-actions">
                <button
                  type="button"
                  className="danger-outline-action"
                  onClick={() => setIsDeleteConfirming(true)}
                  disabled={isSaving}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setDraft(fieldsFor(item))}
                  disabled={isSaving}
                >
                  Edit
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {isDeleteConfirming && !readOnly ? (
        <div
          className="dialog-backdrop learning-delete-confirm-backdrop"
          onMouseDown={ignoreInnerMouseDown}
        >
          <section
            className="delete-dialog learning-delete-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-learning-item-title"
            aria-describedby="delete-learning-item-description"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="delete-learning-item-title">Delete “{item.title}”?</h2>
            <p id="delete-learning-item-description">
              This learning item will be moved to Trash and can be restored later.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setIsDeleteConfirming(false)}
                disabled={isSaving}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void moveToTrash()}
                disabled={isSaving}
              >
                {isSaving ? "Moving…" : "Move to Trash"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function LearningLibraryWorkspace({
  api,
  reviewApi,
  onCountsChange
}: {
  api: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  onCountsChange?: (counts: { active: number; trashed: number }) => void;
}) {
  const [view, setView] = useState<"active" | "trashed">("active");
  const [items, setItems] = useState<LearningLibraryItem[]>([]);
  const [counts, setCounts] = useState({ active: 0, trashed: 0 });
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<LearningItemType | "all">("all");
  const [cefr, setCefr] = useState<CefrLevel | "all">("all");
  const [studyStatus, setStudyStatus] =
    useState<LearningItemStudyStatus | "all">("all");
  const [sort, setSort] = useState<LearningItemSort>("recent");
  const [selectedItem, setSelectedItem] = useState<LearningItem>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEmptyTrashConfirming, setIsEmptyTrashConfirming] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const loadCounts = useCallback(async () => {
    const [active, trashed] = await Promise.all([
      api.listItems({ status: "active", sort: "recent" }),
      api.listItems({ status: "trashed", sort: "recent" })
    ]);
    const next = { active: active.length, trashed: trashed.length };
    setCounts(next);
    onCountsChange?.(next);
  }, [api, onCountsChange]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const next = await api.listItems(view === "active"
        ? {
            status: "active",
            search,
            ...(itemType === "all" ? {} : { itemType }),
            ...(cefr === "all" ? {} : { cefr }),
            ...(studyStatus === "all" ? {} : { studyStatus }),
            sort
          }
        : { status: "trashed", sort: "recent" });
      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the Learning Library.");
    } finally {
      setIsLoading(false);
    }
  }, [api, cefr, itemType, search, sort, studyStatus, view]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void loadCounts().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Unable to get Learning Library counts.");
    });
  }, [loadCounts]);

  function closeDetail() {
    setSelectedItem(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function openDetail(item: LearningItem, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setError("");
    try {
      setSelectedItem(await api.getItem(item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open the learning item.");
    }
  }

  async function refreshAfterChange(item?: LearningItem) {
    if (item?.status === "active") setSelectedItem(item);
    await Promise.all([loadItems(), loadCounts()]);
  }

  async function restore(itemId: string) {
    if (isMutating) return;
    setIsMutating(true);
    setError("");
    try {
      await api.restoreItem(itemId);
      await Promise.all([loadItems(), loadCounts()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restore the learning item.");
    } finally {
      setIsMutating(false);
    }
  }

  async function emptyTrash() {
    if (isMutating) return;
    setIsMutating(true);
    setError("");
    try {
      await api.emptyTrash();
      setIsEmptyTrashConfirming(false);
      await Promise.all([loadItems(), loadCounts()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to empty Trash.");
    } finally {
      setIsMutating(false);
    }
  }

  const filtersActive = Boolean(
    search ||
    itemType !== "all" ||
    cefr !== "all" ||
    studyStatus !== "all" ||
    sort !== "recent"
  );

  function clearFilters() {
    setSearch("");
    setItemType("all");
    setCefr("all");
    setStudyStatus("all");
    setSort("recent");
  }

  return (
    <section className="learning-library-panel" aria-labelledby="learning-library-title">
      <div className="learning-library-sticky">
        <div className="learning-library-toolbar-inner">
          <header className="learning-library-header">
            <div>
              <span className="eyebrow">Learning library</span>
              <h1 id="learning-library-title">
                {view === "active" ? "Learning Library" : "Trash"}
              </h1>
              <p>
                {view === "active"
                  ? "Organize, search, and build a collection of English worth remembering."
                  : "Items stay here until you permanently empty Trash."}
              </p>
            </div>
            {view === "active" ? (
              <button
                type="button"
                className="trash-entry-button"
                onClick={() => setView("trashed")}
              >
                <Trash2
                  className="trash-entry-icon"
                  aria-hidden="true"
                  strokeWidth={1.8}
                />
                Trash
                <span className="trash-entry-count">{counts.trashed}</span>
              </button>
            ) : (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setView("active")}
              >
                ← Back to Learning Library
              </button>
            )}
          </header>

          {view === "active" ? (
            <div className="learning-library-controls" aria-label="Learning Library search and filters">
              <label className="learning-search">
                <span>Search titles</span>
                <span className="learning-search-field">
                  <Search aria-hidden="true" strokeWidth={1.8} />
                  <input
                    type="search"
                    aria-label="Search card titles"
                    placeholder="Enter a word or phrase"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </span>
              </label>
              <label>
                Type
                <select
                  value={itemType}
                  onChange={(event) => setItemType(
                    event.target.value as LearningItemType | "all"
                  )}
                >
                  <option value="all">All</option>
                  <option value="word">Words</option>
                  <option value="phrase">Phrases</option>
                </select>
              </label>
              <label>
                CEFR
                <select
                  value={cefr}
                  onChange={(event) => setCefr(
                    event.target.value as CefrLevel | "all"
                  )}
                >
                  <option value="all">All</option>
                  {cefrLevels.map((level) => (
                    <option value={level} key={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label>
                Study status
                <select
                  value={studyStatus}
                  onChange={(event) => setStudyStatus(
                    event.target.value as LearningItemStudyStatus | "all"
                  )}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="learning">Learning</option>
                  <option value="due">Due</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </label>
              <label>
                Sort
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as LearningItemSort)}
                >
                  <option value="recent">Recently added</option>
                  <option value="study-status">Study priority</option>
                  <option value="next-due">Next review</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="learning-trash-toolbar">
              <strong>{counts.trashed} items</strong>
              <button
                type="button"
                className="danger-outline-action"
                onClick={() => setIsEmptyTrashConfirming(true)}
                disabled={!counts.trashed || isMutating}
              >
                Empty Trash
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="learning-library-scroll-region" data-testid="learning-library-scroll-region">
        <div className="learning-library-results">
          {error ? <p className="library-error" role="alert">{error}</p> : null}

          {view === "active" && !isLoading ? (
            <div className="learning-results-meta" aria-live="polite">
              <span>
                Showing <strong>{items.length}</strong> learning items
              </span>
              {filtersActive ? (
                <button type="button" onClick={clearFilters}>Clear filters</button>
              ) : null}
            </div>
          ) : null}

          {isLoading ? (
            <p className="learning-loading" role="status">Loading Learning Library…</p>
          ) : null}

          {!isLoading && !items.length ? (
            <div className="learning-library-empty">
              <span className="learning-empty-icon" aria-hidden="true">
                {view === "trashed"
                  ? <Trash2 strokeWidth={1.7} />
                  : <Search strokeWidth={1.7} />}
              </span>
              <strong>
                {view === "trashed"
                  ? "Trash is empty"
                  : filtersActive
                    ? "No cards match these filters"
                    : "The Learning Library has no cards yet"}
              </strong>
              {view === "active" && filtersActive ? (
                <button type="button" onClick={clearFilters}>Clear filters</button>
              ) : null}
            </div>
          ) : null}

          {!isLoading && items.length ? (
            <div
              className={view === "active" ? "learning-card-grid" : "learning-trash-list"}
              aria-label={view === "active" ? "Learning item list" : "Trash items"}
            >
              {items.map((item) => view === "active" ? (
                <button
                  type="button"
                  className="learning-item-card"
                  data-study-status={item.studyStatus}
                  key={item.id}
                  aria-label={`${item.title}, ${item.studyStatus === "scheduled" ? `scheduled, ${cardStudyStatusLabel(item)}` : cardStudyStatusLabel(item)}, ${item.itemType === "word" ? "word" : "phrase"}, ${item.cefr}, ${item.sense}`}
                  onClick={(event) => void openDetail(item, event.currentTarget)}
                >
                  <span className="learning-card-badges">
                    <em
                      className="learning-card-study-status"
                      data-study-status={item.studyStatus}
                      title={item.studyStatus === "scheduled"
                        ? `Scheduled; next review ${cardStudyStatusLabel(item)}`
                        : undefined}
                    >
                      {cardStudyStatusLabel(item)}
                    </em>
                    <em className="learning-card-type">
                      {item.itemType === "word" ? "Word" : "Phrase"}
                    </em>
                    <em className="learning-card-cefr">{item.cefr}</em>
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.sense}</small>
                  <span className="learning-card-open">
                    View details <span aria-hidden="true">→</span>
                  </span>
                </button>
              ) : (
                <article className="learning-trash-item" key={item.id}>
                  <div>
                    <span>{item.itemType === "word" ? "Word" : "Phrase"} • {item.cefr}</span>
                    <strong>{item.title}</strong>
                    <small>{item.sense}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(item.id)}
                    disabled={isMutating}
                    aria-label={`Restore ${item.title}`}
                  >
                    Restore
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {selectedItem ? (
        <LearningItemDialog
          item={selectedItem}
          api={api}
          reviewApi={reviewApi}
          onClose={closeDetail}
          onChanged={refreshAfterChange}
        />
      ) : null}

      {isEmptyTrashConfirming ? (
        <div className="dialog-backdrop">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="empty-learning-trash-title"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="empty-learning-trash-title">Permanently empty Trash?</h2>
            <p>All learning items in Trash will be permanently deleted and cannot be recovered.</p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setIsEmptyTrashConfirming(false)}
                disabled={isMutating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void emptyTrash()}
                disabled={isMutating}
              >
                {isMutating ? "Emptying…" : "Empty permanently"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
