import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatDesktopApi,
  ChatSnapshot
} from "../shared/chat-contracts";
import type {
  LearningItemDraft,
  LearningItemDraftBatch
} from "../shared/learning-contracts";

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
    ? `已新增 ${created} 張${duplicate ? `，已存在 ${duplicate} 張` : ""}`
    : `${batch.drafts.length} 張卡片待確認`;
  return (
    <button
      className={`learning-item-batch-action ${batch.status}`}
      type="button"
      aria-label={label}
      onClick={() => onOpen(batch.id)}
    >
      <span aria-hidden="true">▤</span>
      <strong>{label}</strong>
      <small>{batch.status === "submitted" ? "查看結果" : "檢視與提交"}</small>
    </button>
  );
}

function DraftPreview({
  batchId,
  draft,
  api,
  onMutate,
  disabled
}: {
  batchId: string;
  draft: LearningItemDraft;
  api: ChatDesktopApi;
  onMutate(operation: () => Promise<ChatSnapshot>): void;
  disabled: boolean;
}) {
  return (
    <article className={`learning-item-draft ${draft.state}`}>
      <div className="learning-item-draft-heading">
        <div>
          <span>{draft.itemType === "word" ? "單字" : "片語"} · {draft.cefr}</span>
          <strong>{draft.title}</strong>
          <small>{draft.state === "excluded" ? "已排除，不會提交" : "將會提交"}</small>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-label={draft.state === "included"
            ? `排除 ${draft.title}`
            : `恢復 ${draft.title}`}
          onClick={() => {
            onMutate(() => api.setLearningItemDraftState(
              batchId,
              draft.id,
              draft.state === "included" ? "excluded" : "included"
            ));
          }}
        >
          {draft.state === "included" ? "排除" : "恢復"}
        </button>
      </div>

      <div className="learning-item-draft-preview">
        <span>預覽</span>
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
  onClose,
  onSnapshot
}: {
  batch: LearningItemDraftBatch;
  api: ChatDesktopApi;
  onClose(): void;
  onSnapshot(snapshot: ChatSnapshot): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = batch.status === "submitted";
  const includedCount = batch.drafts.filter(
    (draft) => draft.state === "included"
  ).length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  async function mutate(operation: () => Promise<ChatSnapshot>) {
    setBusy(true);
    setError("");
    try {
      onSnapshot(await operation());
    } catch (mutationError) {
      setError(mutationError instanceof Error
        ? mutationError.message
        : "卡片操作失敗。");
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
      >
        <header>
          <div>
            <span className="eyebrow">Cards</span>
            <h2 id="learning-item-draft-dialog-title">確認卡片</h2>
            <p>
              {submitted
                ? `已新增 ${batch.createdItemIds?.length ?? 0} 張卡片。`
                : `${includedCount} 張將會提交，${batch.drafts.length - includedCount} 張已排除。`}
            </p>
          </div>
          <button
            type="button"
            aria-label="關閉確認卡片"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="learning-item-draft-scroll">
          {batch.existing.length > 0 ? (
            <section className="learning-item-match-list">
              <h3>已存在</h3>
              {batch.existing.map((match) => (
                <p key={match.itemId}>
                  <strong>{match.title}</strong>
                  <span>{match.sense}</span>
                </p>
              ))}
            </section>
          ) : null}
          {batch.trashed.length > 0 ? (
            <section className="learning-item-match-list trashed">
              <h3>已在垃圾桶</h3>
              {batch.trashed.map((match) => (
                <div key={match.itemId}>
                  <p>
                    <strong>{match.title}</strong>
                    <span>{match.sense}</span>
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`還原 ${match.title}`}
                    onClick={() => void mutate(() =>
                      api.restoreLearningItemMatch(batch.id, match.itemId))}
                  >
                    還原
                  </button>
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
            />
          ))}
        </div>

        <footer>
          {error ? <p role="alert">{error}</p> : <span />}
          <button type="button" onClick={onClose} disabled={busy}>關閉</button>
          {!submitted ? (
            <button
              type="button"
              className="primary-action"
              disabled={busy || includedCount === 0}
              onClick={() => void mutate(() =>
                api.submitLearningItemBatch(batch.id))}
            >
              {busy ? "提交中…" : "提交卡片"}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
