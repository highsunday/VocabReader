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
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  LearningItemReviewDetail,
  ReviewDesktopApi,
  ReviewRating
} from "../shared/review-contracts";

const cefrLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

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
  forgotten: "忘記",
  hard: "困難",
  good: "順利",
  easy: "簡單"
};

function reviewTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value))
    : "—";
}

function LearningItemDialog({
  item,
  api,
  reviewApi,
  onClose,
  onChanged
}: {
  item: LearningItem;
  api: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  onClose: () => void;
  onChanged: (item: LearningItem) => Promise<void>;
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
        if (active) setReviewDetailError("無法讀取複習歷史。");
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
      setPronunciationError("此裝置目前不支援語音播放。");
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
        setPronunciationError("目前無法播放發音，請稍後再試。");
      };
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      speechRequestRef.current += 1;
      setIsSpeaking(false);
      setPronunciationError("目前無法播放發音，請稍後再試。");
    }
  }

  function updateDraft(update: Partial<UpdateLearningItemInput>) {
    setDraft((current) => current ? { ...current, ...update } : current);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await api.updateItem(draft);
      await onChanged(updated);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存學習項目。");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveToTrash() {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await api.trashItem(item.id);
      await onChanged({ ...item, status: "trashed" });
      onClose();
    } catch (cause) {
      setIsDeleteConfirming(false);
      setError(cause instanceof Error ? cause.message : "無法刪除學習項目。");
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
              <em>{item.itemType === "word" ? "單字" : "片語"}</em>
              <em>{item.cefr}</em>
            </span>
            <div className="learning-dialog-title-row">
              <h2 id="learning-item-dialog-title">{item.title}</h2>
              <button
                type="button"
                className={`learning-pronunciation-button${isSpeaking ? " is-speaking" : ""}`}
                aria-label={`播放 ${item.title} 發音`}
                title={isSpeaking ? "播放中；點擊可重新播放" : "播放英文發音"}
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
            aria-label="關閉卡片詳情"
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
                標題
                <input
                  required
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
              </label>
              <label>
                類型
                <select
                  value={draft.itemType}
                  onChange={(event) => updateDraft({
                    itemType: event.target.value as LearningItemType
                  })}
                >
                  <option value="word">單字</option>
                  <option value="phrase">片語</option>
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
                語義
                <input
                  required
                  value={draft.sense}
                  onChange={(event) => updateDraft({ sense: event.target.value })}
                />
              </label>
            </div>
            <div className="learning-markdown-editor">
              <label>
                Markdown 內容
                <textarea
                  required
                  value={draft.markdownContent}
                  onChange={(event) => updateDraft({
                    markdownContent: event.target.value
                  })}
                />
              </label>
              <section className="learning-markdown-preview">
                <span>預覽</span>
                <MarkdownContent label="Markdown 預覽">
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
                取消
              </button>
              <button type="submit" className="primary-action" disabled={isSaving}>
                {isSaving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="learning-dialog-content">
              <MarkdownContent>{item.markdownContent}</MarkdownContent>
            </div>
            {reviewApi ? (
              <section className="learning-review-detail" aria-label="複習排程">
                <div className="learning-review-detail-heading">
                  <strong>複習排程</strong>
                  <span>{
                    reviewDetail?.status === "due"
                      ? "已到期"
                      : reviewDetail?.status === "scheduled"
                        ? "未到期"
                        : "新項目"
                  }</span>
                </div>
                {reviewDetailError ? (
                  <p className="library-error" role="status">{reviewDetailError}</p>
                ) : reviewDetail ? (
                  <>
                    <dl>
                      <div>
                        <dt>上次複習</dt>
                        <dd>{reviewTime(reviewDetail.lastReviewedAt)}</dd>
                      </div>
                      <div>
                        <dt>上次評級</dt>
                        <dd>{reviewDetail.lastFinalRating
                          ? reviewRatingLabels[reviewDetail.lastFinalRating]
                          : "—"}</dd>
                      </div>
                      <div>
                        <dt>下次到期</dt>
                        <dd>{reviewTime(reviewDetail.nextDueAt)}</dd>
                      </div>
                      <div>
                        <dt>累計次數</dt>
                        <dd>{reviewDetail.reviewCount}</dd>
                      </div>
                    </dl>
                    {reviewDetail.history.length ? (
                      <details>
                        <summary>查看精簡複習歷史</summary>
                        <ol>
                          {reviewDetail.history.map((entry) => (
                            <li key={entry.id}>
                              <time>{reviewTime(entry.reviewedAt)}</time>
                              <span>
                                AI {reviewRatingLabels[entry.aiRating]} ·
                                最終 {reviewRatingLabels[entry.finalRating]}
                              </span>
                              <small>下次 {reviewTime(entry.nextDueAt)}</small>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </>
                ) : <p>讀取排程中…</p>}
              </section>
            ) : null}
            <div className="learning-dialog-actions">
              <button
                type="button"
                className="danger-outline-action"
                onClick={() => setIsDeleteConfirming(true)}
                disabled={isSaving}
              >
                刪除
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => setDraft(fieldsFor(item))}
                disabled={isSaving}
              >
                編輯
              </button>
            </div>
          </>
        )}
      </section>

      {isDeleteConfirming ? (
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
            <h2 id="delete-learning-item-title">刪除「{item.title}」？</h2>
            <p id="delete-learning-item-description">
              這個學習項目會移到垃圾桶，之後仍可還原。
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setIsDeleteConfirming(false)}
                disabled={isSaving}
                autoFocus
              >
                取消
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void moveToTrash()}
                disabled={isSaving}
              >
                {isSaving ? "移動中…" : "移到垃圾桶"}
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
  const [items, setItems] = useState<LearningItem[]>([]);
  const [counts, setCounts] = useState({ active: 0, trashed: 0 });
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<LearningItemType | "all">("all");
  const [cefr, setCefr] = useState<CefrLevel | "all">("all");
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
            sort
          }
        : { status: "trashed", sort: "recent" });
      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入生詞庫。");
    } finally {
      setIsLoading(false);
    }
  }, [api, cefr, itemType, search, sort, view]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void loadCounts().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "無法取得生詞庫數量。");
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
      setError(cause instanceof Error ? cause.message : "無法開啟學習項目。");
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
      setError(cause instanceof Error ? cause.message : "無法還原學習項目。");
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
      setError(cause instanceof Error ? cause.message : "無法清空垃圾桶。");
    } finally {
      setIsMutating(false);
    }
  }

  const filtersActive = Boolean(
    search || itemType !== "all" || cefr !== "all" || sort !== "recent"
  );

  function clearFilters() {
    setSearch("");
    setItemType("all");
    setCefr("all");
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
                {view === "active" ? "生詞庫" : "垃圾桶"}
              </h1>
              <p>
                {view === "active"
                  ? "整理、搜尋並持續累積值得記住的英文。"
                  : "項目會保留到你選擇永久清空為止。"}
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
                垃圾桶
                <span className="trash-entry-count">{counts.trashed}</span>
              </button>
            ) : (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setView("active")}
              >
                ← 返回生詞庫
              </button>
            )}
          </header>

          {view === "active" ? (
            <div className="learning-library-controls" aria-label="生詞庫查詢與篩選">
              <label className="learning-search">
                <span>搜尋標題</span>
                <span className="learning-search-field">
                  <Search aria-hidden="true" strokeWidth={1.8} />
                  <input
                    type="search"
                    aria-label="搜尋卡片標題"
                    placeholder="輸入單字或片語"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </span>
              </label>
              <label>
                類型
                <select
                  value={itemType}
                  onChange={(event) => setItemType(
                    event.target.value as LearningItemType | "all"
                  )}
                >
                  <option value="all">全部</option>
                  <option value="word">單字</option>
                  <option value="phrase">片語</option>
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
                  <option value="all">全部</option>
                  {cefrLevels.map((level) => (
                    <option value={level} key={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label>
                排序
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as LearningItemSort)}
                >
                  <option value="recent">最近新增</option>
                  <option value="alphabetical">字母順序</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="learning-trash-toolbar">
              <strong>{counts.trashed} 筆項目</strong>
              <button
                type="button"
                className="danger-outline-action"
                onClick={() => setIsEmptyTrashConfirming(true)}
                disabled={!counts.trashed || isMutating}
              >
                清空垃圾桶
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
                顯示 <strong>{items.length}</strong> 筆學習項目
              </span>
              {filtersActive ? (
                <button type="button" onClick={clearFilters}>清除篩選</button>
              ) : null}
            </div>
          ) : null}

          {isLoading ? (
            <p className="learning-loading" role="status">生詞庫載入中…</p>
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
                  ? "垃圾桶是空的"
                  : filtersActive
                    ? "找不到符合條件的卡片"
                    : "生詞庫目前沒有卡片"}
              </strong>
              {view === "active" && filtersActive ? (
                <button type="button" onClick={clearFilters}>清除篩選</button>
              ) : null}
            </div>
          ) : null}

          {!isLoading && items.length ? (
            <div
              className={view === "active" ? "learning-card-grid" : "learning-trash-list"}
              aria-label={view === "active" ? "學習項目清單" : "垃圾桶項目"}
            >
              {items.map((item) => view === "active" ? (
                <button
                  type="button"
                  className="learning-item-card"
                  key={item.id}
                  aria-label={`${item.title}，${item.itemType === "word" ? "單字" : "片語"}，${item.cefr}，${item.sense}`}
                  onClick={(event) => void openDetail(item, event.currentTarget)}
                >
                  <span className="learning-card-badges">
                    <em>{item.itemType === "word" ? "單字" : "片語"}</em>
                    <em>{item.cefr}</em>
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.sense}</small>
                  <span className="learning-card-open">
                    查看詳情 <span aria-hidden="true">→</span>
                  </span>
                </button>
              ) : (
                <article className="learning-trash-item" key={item.id}>
                  <div>
                    <span>{item.itemType === "word" ? "單字" : "片語"} · {item.cefr}</span>
                    <strong>{item.title}</strong>
                    <small>{item.sense}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(item.id)}
                    disabled={isMutating}
                    aria-label={`還原 ${item.title}`}
                  >
                    還原
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
            <h2 id="empty-learning-trash-title">永久清空垃圾桶？</h2>
            <p>垃圾桶內的所有學習項目都會永久刪除，且無法復原。</p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setIsEmptyTrashConfirming(false)}
                disabled={isMutating}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void emptyTrash()}
                disabled={isMutating}
              >
                {isMutating ? "清空中…" : "永久清空"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
