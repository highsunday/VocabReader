import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatDesktopApi,
  ChatSnapshot
} from "../shared/chat-contracts";
import type {
  LearningDesktopApi,
  LearningItemDraft,
  LearningItemDraftBatch,
  LearningItemLanguage,
  LearningItem
} from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import {
  LearningItemDialog,
  LearningMemoryTip
} from "./LearningLibraryWorkspace";

const languageLabels: Record<LearningItemLanguage, string> = {
  en: "English",
  ja: "Japanese",
  "zh-TW": "Traditional Chinese",
  ko: "Korean",
  other: "Other language"
};

export function LearningItemBatchAction({
  batch,
  onOpen
}: {
  batch: LearningItemDraftBatch;
  onOpen(batchId: string): void;
}) {
  const created = batch.createdItemIds?.length ?? 0;
  const duplicate = batch.existing.length + batch.trashed.length;
  const label = batch.status === "submitted"
    ? `${created} added${duplicate ? `, ${duplicate} already existed` : ""}`
    : batch.status === "abandoned"
      ? `${batch.drafts.length} drafts discarded`
      : `${batch.drafts.length} cards awaiting review`;
  return (
    <button
      className={`learning-item-batch-action ${batch.status}`}
      type="button"
      aria-label={label}
      onClick={() => onOpen(batch.id)}
    >
      <span aria-hidden="true">▤</span>
      <strong>{label}</strong>
      <small>
        {batch.status === "pending" ? "Review and submit" : "View results"}
      </small>
    </button>
  );
}

function DraftPreview({
  batchId,
  draft,
  api,
  onMutate,
  disabled,
  readOnly = false
}: {
  batchId: string;
  draft: LearningItemDraft;
  api: ChatDesktopApi;
  onMutate(operation: () => Promise<ChatSnapshot>): void;
  disabled: boolean;
  readOnly?: boolean;
}) {
  return (
    <article className={`learning-item-draft ${draft.state}`}>
      <div className="learning-item-draft-heading">
        <div>
          <span>{draft.itemType === "word" ? "Word" : "Phrase"} • {languageLabels[draft.language]} • {draft.cefr}</span>
          <strong>{draft.title}</strong>
          <small>{draft.state === "excluded" ? "Excluded from submission" : "Will be submitted"}</small>
        </div>
        {!readOnly ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={draft.state === "included"
              ? `Exclude ${draft.title}`
              : `Restore ${draft.title}`}
            onClick={() => {
              onMutate(() => api.setLearningItemDraftState(
                batchId,
                draft.id,
                draft.state === "included" ? "excluded" : "included"
              ));
            }}
          >
            {draft.state === "included" ? "Exclude" : "Restore"}
          </button>
        ) : null}
      </div>

      <div className="learning-item-draft-preview">
        <span>Preview</span>
        <LearningMemoryTip>{draft.memoryTip}</LearningMemoryTip>
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {draft.markdownContent}
        </ReactMarkdown>
      </div>
    </article>
  );
}

export function LearningItemDraftDialog({
  batch,
  api,
  learningApi,
  reviewApi,
  onClose,
  onSnapshot
}: {
  batch: LearningItemDraftBatch;
  api: ChatDesktopApi;
  learningApi: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  onClose(): void;
  onSnapshot(snapshot: ChatSnapshot): void;
}) {
  const [busy, setBusy] = useState(false);
  const [loadingExistingItemId, setLoadingExistingItemId] = useState<string>();
  const [selectedExistingItem, setSelectedExistingItem] = useState<LearningItem>();
  const existingItemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState("");
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const submitted = batch.status === "submitted";
  const abandoned = batch.status === "abandoned";
  const includedCount = batch.drafts.filter(
    (draft) => draft.state === "included"
  ).length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !selectedExistingItem) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, selectedExistingItem]);

  async function openExistingItem(
    itemId: string,
    trigger: HTMLButtonElement
  ) {
    if (loadingExistingItemId) return;
    existingItemTriggerRef.current = trigger;
    setLoadingExistingItemId(itemId);
    setError("");
    try {
      setSelectedExistingItem(await learningApi.getItem(itemId));
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : "Unable to load the existing learning item.");
    } finally {
      setLoadingExistingItemId(undefined);
    }
  }

  function closeExistingItem() {
    setSelectedExistingItem(undefined);
    requestAnimationFrame(() => existingItemTriggerRef.current?.focus());
  }

  async function mutate(operation: () => Promise<ChatSnapshot>) {
    setBusy(true);
    setError("");
    try {
      onSnapshot(await operation());
    } catch (mutationError) {
      setError(mutationError instanceof Error
        ? mutationError.message
        : "Card operation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop learning-item-draft-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="learning-item-draft-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-item-draft-dialog-title"
        aria-hidden={Boolean(selectedExistingItem)}
      >
        <header>
          <div>
            <span className="eyebrow">Cards</span>
            <h2 id="learning-item-draft-dialog-title">Review cards</h2>
            <p>
              {submitted
                ? `${batch.createdItemIds?.length ?? 0} cards added.`
                : abandoned
                  ? "This draft batch was discarded and will not be added to the Learning Library."
                  : `${includedCount} will be submitted; ${batch.drafts.length - includedCount} excluded.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close card review"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="learning-item-draft-scroll">
          {batch.existing.length > 0 ? (
            <section className="learning-item-match-list">
              <h3>Already exists</h3>
              {batch.existing.map((match) => (
                <button
                  key={match.itemId}
                  type="button"
                  className="learning-item-match-open"
                  aria-label={`Open ${match.title} details`}
                  disabled={Boolean(loadingExistingItemId)}
                  onClick={(event) => void openExistingItem(
                    match.itemId,
                    event.currentTarget
                  )}
                >
                  <span>
                    <strong>{match.title}</strong>
                    <small>{match.sense}</small>
                  </span>
                  <em aria-hidden="true">
                    {loadingExistingItemId === match.itemId ? "Loading…" : "Open →"}
                  </em>
                </button>
              ))}
            </section>
          ) : null}
          {batch.trashed.length > 0 ? (
            <section className="learning-item-match-list trashed">
              <h3>In Trash</h3>
              {batch.trashed.map((match) => (
                <div key={match.itemId}>
                  <p>
                    <strong>{match.title}</strong>
                    <span>{match.sense}</span>
                  </p>
                  {!abandoned ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Restore ${match.title}`}
                      onClick={() => void mutate(() =>
                        api.restoreLearningItemMatch(batch.id, match.itemId))}
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          {batch.drafts.map((draft) => (
            <DraftPreview
              key={draft.id}
              batchId={batch.id}
              draft={draft}
              api={api}
              onMutate={(operation) => void mutate(operation)}
              disabled={busy || submitted}
              readOnly={abandoned}
            />
          ))}
        </div>

        <footer>
          {error ? <p role="alert">{error}</p> : confirmAbandon ? (
            <p>This draft batch cannot be submitted after it is discarded.</p>
          ) : <span />}
          {confirmAbandon && !submitted && !abandoned ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmAbandon(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(() =>
                  api.abandonLearningItemBatch(batch.id))}
              >
                Confirm discard
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy}>
                Close
              </button>
              {!submitted && !abandoned ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmAbandon(true)}
                  >
                    Discard draft batch
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy || includedCount === 0}
                    onClick={() => void mutate(() =>
                      api.submitLearningItemBatch(batch.id))}
                  >
                    {busy ? "Submitting…" : "Submit cards"}
                  </button>
                </>
              ) : null}
            </>
          )}
        </footer>
      </section>

      {selectedExistingItem ? (
        <LearningItemDialog
          item={selectedExistingItem}
          api={learningApi}
          reviewApi={reviewApi}
          readOnly
          onClose={closeExistingItem}
        />
      ) : null}
    </div>
  );
}
