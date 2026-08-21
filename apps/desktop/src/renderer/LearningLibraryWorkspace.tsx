import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import {
  Check,
  Image as ImageIcon,
  Link,
  LoaderCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Volume2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  CefrLevel,
  LearningDesktopApi,
  LearningItemCounts,
  LearningItemEditSnapshot,
  LearningItem,
  LearningItemLanguage,
  LearningItemListInput,
  LearningItemProgressStatus,
  LearningItemSummary,
  LearningItemSort,
  LearningItemStudyStatus,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  LearningItemReviewDetail,
  ReviewDesktopApi,
  ReviewRating
} from "../shared/review-contracts";

const cefrLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const languageLabels: Record<LearningItemLanguage, string> = {
  en: "English",
  ja: "Japanese",
  "zh-TW": "Traditional Chinese",
  other: "Other language"
};
const speechLocales: Record<LearningItemLanguage, string | undefined> = {
  en: "en-US",
  ja: "ja-JP",
  "zh-TW": "zh-TW",
  other: undefined
};
const studyStatusLabels: Record<LearningItemStudyStatus, string> = {
  new: "New",
  learning: "Learning",
  due: "Due",
  scheduled: "Scheduled"
};
const progressStatusLabels: Record<LearningItemProgressStatus, string> = {
  new: "New",
  studying: "Studying",
  familiar: "Familiar",
  strong: "Strong"
};
const progressStatusOrder: LearningItemProgressStatus[] = [
  "new",
  "studying",
  "familiar",
  "strong"
];

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

function cardStudyStatusLabel(item: LearningItemSummary) {
  return item.studyStatus === "scheduled"
    ? scheduledReviewLabel(item.nextDueAt)
    : studyStatusLabels[item.studyStatus];
}

function speechVoiceFor(
  voices: SpeechSynthesisVoice[],
  language: LearningItemLanguage
) {
  const locale = speechLocales[language];
  if (!locale) return null;

  const normalizedLocale = locale.toLowerCase();
  const exactVoice = voices.find(
    (voice) => voice.lang.toLowerCase() === normalizedLocale
  );
  if (exactVoice) return exactVoice;

  if (language === "zh-TW") {
    return voices.find((voice) =>
      /^(zh-(hant|tw|hk|mo))(?:-|$)/i.test(voice.lang)
    ) ?? null;
  }

  const baseLanguage = normalizedLocale.split("-")[0];
  return voices.find((voice) => {
    const voiceLanguage = voice.lang.toLowerCase();
    return voiceLanguage === baseLanguage ||
      voiceLanguage.startsWith(`${baseLanguage}-`);
  }) ?? null;
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
    language: item.language,
    cefr: item.cefr,
    sense: item.sense,
    markdownContent: item.markdownContent,
    cautionNote: item.cautionNote ?? ""
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
  allowMoveToTrash = !readOnly,
  onClose,
  onChanged
}: {
  item: LearningItem;
  api: LearningDesktopApi;
  reviewApi?: ReviewDesktopApi;
  readOnly?: boolean;
  allowMoveToTrash?: boolean;
  onClose: () => void;
  onChanged?: (item: LearningItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState<UpdateLearningItemInput>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isImageRemoveConfirming, setIsImageRemoveConfirming] = useState(false);
  const [isImageUrlOpen, setIsImageUrlOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageOperation, setImageOperation] = useState<
    "device" | "url" | "remove"
  >();
  const [pronunciationError, setPronunciationError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [reviewDetail, setReviewDetail] = useState<LearningItemReviewDetail>();
  const [reviewDetailError, setReviewDetailError] = useState("");
  const [aiEdit, setAiEdit] = useState<LearningItemEditSnapshot>();
  const [aiRequest, setAiRequest] = useState("");
  const [aiDiscardTarget, setAiDiscardTarget] = useState<"editor" | "dialog">();
  const speechRequestRef = useRef(0);
  const aiSendRequestRef = useRef(0);

  const shownMarkdown = aiEdit?.draft.markdownContent ?? item.markdownContent;
  const shownCaution = aiEdit?.draft.cautionNote ?? item.cautionNote ?? "";

  useLayoutEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isSaving) return;
      if (aiDiscardTarget) {
        setAiDiscardTarget(undefined);
        return;
      }
      if (isImageRemoveConfirming) {
        setIsImageRemoveConfirming(false);
        return;
      }
      if (isDeleteConfirming) {
        setIsDeleteConfirming(false);
        return;
      }
      void requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    aiDiscardTarget,
    aiEdit,
    isDeleteConfirming,
    isImageRemoveConfirming,
    isSaving,
    onClose
  ]);

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
      const locale = speechLocales[item.language];
      const voice = speechVoiceFor(
        window.speechSynthesis.getVoices(),
        item.language
      );
      utterance.lang = voice?.lang ?? locale ?? "";
      utterance.voice = voice;
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

  async function selectRepresentativeImage() {
    if (
      readOnly || isSaving || !draft || aiEdit || !onChanged ||
      !api.selectRepresentativeImage
    ) return;
    setImageOperation("device");
    setIsSaving(true);
    setImageError("");
    try {
      const result = await api.selectRepresentativeImage(item.id);
      if (result.status === "updated") await onChanged(result.item);
    } catch (cause) {
      setImageError(
        cause instanceof Error ? cause.message : "Unable to update the image."
      );
    } finally {
      setImageOperation(undefined);
      setIsSaving(false);
    }
  }

  async function setRepresentativeImageFromUrl() {
    if (
      readOnly || isSaving || !draft || aiEdit || !onChanged ||
      !api.setRepresentativeImageFromUrl || !imageUrl.trim()
    ) return;
    setImageOperation("url");
    setIsSaving(true);
    setImageError("");
    try {
      const updated = await api.setRepresentativeImageFromUrl(
        item.id,
        imageUrl.trim()
      );
      setImageUrl("");
      setIsImageUrlOpen(false);
      await onChanged(updated);
    } catch (cause) {
      setImageError(
        cause instanceof Error ? cause.message : "Unable to import the image."
      );
    } finally {
      setImageOperation(undefined);
      setIsSaving(false);
    }
  }

  async function removeRepresentativeImage() {
    if (
      readOnly || isSaving || !draft || aiEdit || !onChanged ||
      !api.removeRepresentativeImage
    ) return;
    setImageOperation("remove");
    setIsSaving(true);
    setImageError("");
    try {
      const updated = await api.removeRepresentativeImage(item.id);
      setIsImageRemoveConfirming(false);
      await onChanged(updated);
    } catch (cause) {
      setIsImageRemoveConfirming(false);
      setImageError(
        cause instanceof Error ? cause.message : "Unable to remove the image."
      );
    } finally {
      setImageOperation(undefined);
      setIsSaving(false);
    }
  }

  async function startAiEdit() {
    if (!api.aiEdit || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      setAiEdit(await api.aiEdit.start(item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start AI editing.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendAiEdit(event: FormEvent) {
    event.preventDefault();
    if (!api.aiEdit || !aiEdit || !aiRequest.trim() ||
      aiEdit.phase === "responding") return;
    const request = aiRequest;
    const requestId = aiSendRequestRef.current + 1;
    aiSendRequestRef.current = requestId;
    setAiEdit({ ...aiEdit, phase: "responding", status: "Updating draft…" });
    setError("");
    try {
      const updatedDraft = await api.aiEdit.send(aiEdit.sessionId, request);
      if (aiSendRequestRef.current !== requestId) return;
      setAiEdit(updatedDraft);
      setAiRequest("");
    } catch (cause) {
      if (aiSendRequestRef.current !== requestId) return;
      setAiEdit((current) => current ? {
        ...current,
        phase: "error",
        status: "AI could not update the draft. Try again."
      } : current);
      setError(cause instanceof Error ? cause.message : "Unable to update the AI draft.");
    }
  }

  async function applyAiEdit() {
    if (!api.aiEdit || !aiEdit || !aiEdit.hasChanges ||
      aiEdit.phase === "responding" || !onChanged) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await api.aiEdit.apply(aiEdit.sessionId);
      setAiEdit(undefined);
      setAiRequest("");
      await onChanged(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to apply the AI edit.");
    } finally {
      setIsSaving(false);
    }
  }

  async function discardAiEdit() {
    if (!api.aiEdit || !aiEdit) return;
    aiSendRequestRef.current += 1;
    try {
      await api.aiEdit.discard(aiEdit.sessionId);
    } finally {
      setAiEdit(undefined);
      setAiRequest("");
    }
  }

  async function stopAiEdit() {
    if (!api.aiEdit || !aiEdit || aiEdit.phase !== "responding") return;
    aiSendRequestRef.current += 1;
    setError("");
    try {
      setAiEdit(await api.aiEdit.stop(aiEdit.sessionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to stop AI editing.");
    }
  }

  function requestAiDiscard(target: "editor" | "dialog") {
    if (!aiEdit) {
      if (target === "dialog") onClose();
      return;
    }
    if (aiEdit.hasChanges) {
      setAiDiscardTarget(target);
      return;
    }
    void discardAiEdit().then(() => {
      if (target === "dialog") onClose();
    });
  }

  async function confirmAiDiscard() {
    const target = aiDiscardTarget;
    setAiDiscardTarget(undefined);
    await discardAiEdit();
    if (target === "dialog") onClose();
  }

  async function requestClose() {
    if (isSaving || aiEdit?.phase === "responding") return;
    if (aiEdit) {
      requestAiDiscard("dialog");
      return;
    }
    onClose();
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
    if (isSaving || readOnly || !allowMoveToTrash || !onChanged) return;
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
      onMouseDown={() => void requestClose()}
    >
      <section
        className="learning-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-item-dialog-title"
        aria-hidden={
          isDeleteConfirming || isImageRemoveConfirming || Boolean(aiDiscardTarget)
        }
        onMouseDown={ignoreInnerMouseDown}
      >
        <div className="learning-dialog-heading">
          <div>
            <span className="learning-card-badges">
              <em>{item.itemType === "word" ? "Word" : "Phrase"}</em>
              <em>{languageLabels[item.language]}</em>
              <em>{item.cefr}</em>
            </span>
            <div className="learning-dialog-title-row">
              <h2 id="learning-item-dialog-title">{item.title}</h2>
              <button
                type="button"
                className={`learning-pronunciation-button${isSpeaking ? " is-speaking" : ""}`}
                aria-label={`Play pronunciation of ${item.title}`}
                title={isSpeaking ? "Playing; click to replay" : "Play pronunciation"}
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
            onClick={() => void requestClose()}
            disabled={isSaving || aiEdit?.phase === "responding"}
            autoFocus
          >
            ×
          </button>
        </div>

        {error ? <p className="library-error" role="alert">{error}</p> : null}

        {draft && !readOnly ? (
          <form className="learning-edit-form" onSubmit={save}>
            <div className="learning-edit-scroll">
              <div className="learning-edit-overview">
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
                Language
                <select
                  value={draft.language}
                  onChange={(event) => updateDraft({
                    language: event.target.value as LearningItemLanguage
                  })}
                >
                  {Object.entries(languageLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
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
              <label className="learning-sense-editor">
                Sense
                <input
                  required
                  value={draft.sense}
                  onChange={(event) => updateDraft({ sense: event.target.value })}
                />
              </label>
              <label className="learning-caution-editor">
                Learning caution
                <textarea
                  value={draft.cautionNote}
                  onChange={(event) => updateDraft({ cautionNote: event.target.value })}
                  placeholder="Optional reminder about an easy mistake or confusing distinction"
                />
              </label>
                </div>
                <section
                  className="learning-image-editor"
                  aria-labelledby="learning-image-editor-title"
                >
                  <div className="learning-image-editor-heading">
                    <strong id="learning-image-editor-title">
                      Image
                    </strong>
                    <div className="learning-image-source-actions">
                      {api.selectRepresentativeImage ? (
                        <button
                          type="button"
                          className="learning-image-source-button is-primary"
                          onClick={() => void selectRepresentativeImage()}
                          disabled={isSaving}
                        >
                          <Upload aria-hidden="true" />
                          {imageOperation === "device"
                            ? "Processing…"
                            : item.representativeImageDataUrl
                              ? "Replace"
                              : "Upload"}
                        </button>
                      ) : null}
                      {api.setRepresentativeImageFromUrl ? (
                        <button
                          type="button"
                          className="learning-image-source-button"
                          aria-expanded={isImageUrlOpen}
                          aria-controls="learning-image-url-fields"
                          onClick={() => {
                            setImageError("");
                            setIsImageUrlOpen((current) => !current);
                          }}
                          disabled={isSaving}
                        >
                          <Link aria-hidden="true" />
                          <span aria-hidden="true">URL</span>
                          <span className="visually-hidden">From URL</span>
                        </button>
                      ) : null}
                      {item.representativeImageDataUrl &&
                      api.removeRepresentativeImage ? (
                        <button
                          type="button"
                          className="learning-image-remove-button"
                          onClick={() => setIsImageRemoveConfirming(true)}
                          disabled={isSaving}
                          title="Remove image"
                        >
                          <Trash2 aria-hidden="true" />
                          <span className="visually-hidden">Remove</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="learning-image-editor-body">
                    <button
                      type="button"
                      className="learning-image-editor-preview"
                      aria-label={item.representativeImageDataUrl
                        ? "Replace representative image from device"
                        : "Upload representative image from device"}
                      onClick={() => void selectRepresentativeImage()}
                      disabled={isSaving || !api.selectRepresentativeImage}
                    >
                      {item.representativeImageDataUrl ? (
                        <img
                          src={item.representativeImageDataUrl}
                          alt={`Representative image for ${item.title}: ${item.sense}`}
                          width={256}
                          height={256}
                        />
                      ) : (
                        <div className="learning-image-empty-state">
                          <ImageIcon aria-hidden="true" strokeWidth={1.5} />
                          <span>Add image</span>
                        </div>
                      )}
                      {imageOperation ? (
                        <div className="learning-image-processing" role="status">
                          <LoaderCircle aria-hidden="true" />
                          <span>{imageOperation === "remove"
                            ? "Removing…"
                            : "Processing…"}</span>
                        </div>
                      ) : null}
                      {!imageOperation && item.representativeImageDataUrl ? (
                        <span className="learning-image-preview-affordance">
                          <Upload aria-hidden="true" />
                          Change
                        </span>
                      ) : null}
                    </button>
                  </div>
                  {imageError ? (
                    <p className="learning-image-error" role="alert">{imageError}</p>
                  ) : null}
                  {isImageUrlOpen ? (
                    <div
                      className="learning-image-url-fields"
                      id="learning-image-url-fields"
                    >
                      <label htmlFor="learning-image-url">Image URL</label>
                      <div className="learning-image-url-input-row">
                        <input
                          id="learning-image-url"
                          type="url"
                          inputMode="url"
                          placeholder="https://example.com/image.jpg"
                          value={imageUrl}
                          onChange={(event) => setImageUrl(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void setRepresentativeImageFromUrl();
                            }
                          }}
                          disabled={isSaving}
                          autoFocus
                        />
                      </div>
                      <div className="learning-image-url-footer">
                        <small>Copied into your library, not linked.</small>
                        <div>
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                              setImageUrl("");
                              setImageError("");
                              setIsImageUrlOpen(false);
                            }}
                            disabled={isSaving}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() => void setRepresentativeImageFromUrl()}
                            disabled={isSaving || !imageUrl.trim()}
                          >
                            {imageOperation === "url" ? "Importing…" : "Import"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <p className="learning-image-meta">
                    <span><Check aria-hidden="true" /> Saves instantly</span>
                    <span>256 × 256 · JPG, PNG, WebP · 10 MB max</span>
                  </p>
                </section>
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
                {draft.cautionNote ? (
                  <p
                    className="learning-caution"
                    aria-label="Learning caution preview"
                  >
                    <strong>Note:</strong> {draft.cautionNote}
                  </p>
                ) : null}
                <MarkdownContent label="Markdown preview">
                  {draft.markdownContent}
                </MarkdownContent>
              </section>
              </div>
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
                {isSaving && !imageOperation ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="learning-dialog-scroll">
              <div className="learning-dialog-content">
                {item.representativeImageDataUrl ? (
                  <section
                    className="learning-representative-image-panel"
                    aria-label="Representative image"
                  >
                    {item.representativeImageDataUrl ? (
                      <img
                        className="learning-representative-image"
                        src={item.representativeImageDataUrl}
                        alt={`Representative image for ${item.title}: ${item.sense}`}
                        width={256}
                        height={256}
                      />
                    ) : null}
                  </section>
                ) : null}
                {shownCaution ? (
                  <p className="learning-caution" aria-label="Learning caution">
                    <strong>Note:</strong> {shownCaution}
                  </p>
                ) : null}
                <MarkdownContent>{shownMarkdown}</MarkdownContent>
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
            </div>
            {aiEdit ? (
              <form
                className="learning-ai-editor"
                data-phase={aiEdit.phase}
                onSubmit={sendAiEdit}
              >
                {aiEdit.phase === "responding" ? (
                  <span className="learning-ai-progress" aria-hidden="true" />
                ) : null}
                <div className="learning-ai-toolbar">
                  <div className="learning-ai-identity">
                    <Sparkles aria-hidden="true" />
                    <strong>AI edit</strong>
                    {aiEdit.phase === "responding" ? (
                      <span className="learning-ai-inline-status" role="status">
                        <LoaderCircle
                          className="learning-ai-spinner"
                          aria-hidden="true"
                        />
                        <span aria-label="AI edit in progress">Updating…</span>
                      </span>
                    ) : aiEdit.hasChanges ? (
                      <span className="learning-ai-inline-status" role="status">
                        <Check aria-hidden="true" />
                        Draft ready
                      </span>
                    ) : aiEdit.phase === "error" ? (
                      <span
                        className="learning-ai-inline-status"
                        data-phase="error"
                        role="status"
                      >
                        {aiEdit.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="learning-ai-toolbar-actions">
                    <button
                      type="button"
                      className="learning-ai-cancel-action"
                      onClick={() => requestAiDiscard("editor")}
                      disabled={aiEdit.phase === "responding" || isSaving}
                    >
                      Cancel
                    </button>
                    {aiEdit.hasChanges && aiEdit.phase !== "responding" ? (
                      <button
                        type="button"
                        className="learning-ai-apply-action"
                        aria-label="Apply AI edit"
                        onClick={() => void applyAiEdit()}
                        disabled={isSaving}
                      >
                        <Check aria-hidden="true" />
                        Apply
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="learning-ai-input-row">
                  <textarea
                    rows={1}
                    aria-label="AI editing request"
                    value={aiRequest}
                    onChange={(event) => setAiRequest(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="What should AI add or change?"
                    disabled={aiEdit.phase === "responding"}
                    autoFocus
                  />
                  {aiEdit.phase === "responding" ? (
                    <button
                      type="button"
                      className="learning-ai-stop-action"
                      aria-label="Stop AI edit"
                      onClick={() => void stopAiEdit()}
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="learning-ai-send-action"
                      aria-label="Send AI edit request"
                      disabled={!aiRequest.trim()}
                    >
                      <Send aria-hidden="true" />
                      Send
                    </button>
                  )}
                </div>
              </form>
            ) : null}
            {!readOnly && !aiEdit ? (
              <div className="learning-dialog-actions">
                {allowMoveToTrash ? (
                  <button
                    type="button"
                    className="danger-outline-action"
                    onClick={() => setIsDeleteConfirming(true)}
                    disabled={isSaving}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    setDraft(fieldsFor(item));
                    setIsImageUrlOpen(false);
                    setImageUrl("");
                  }}
                  disabled={isSaving}
                >
                  Edit
                </button>
                {api.aiEdit ? (
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void startAiEdit()}
                    disabled={isSaving}
                  >
                    <Sparkles aria-hidden="true" /> Edit with AI
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      {isDeleteConfirming && !readOnly && allowMoveToTrash ? (
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

      {isImageRemoveConfirming && !readOnly && item.representativeImageDataUrl ? (
        <div
          className="dialog-backdrop learning-delete-confirm-backdrop"
          onMouseDown={ignoreInnerMouseDown}
        >
          <section
            className="delete-dialog learning-delete-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-learning-item-image-title"
            aria-describedby="remove-learning-item-image-description"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="remove-learning-item-image-title">Remove image?</h2>
            <p id="remove-learning-item-image-description">
              This representative image will be permanently removed from the learning item.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setIsImageRemoveConfirming(false)}
                disabled={isSaving}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void removeRepresentativeImage()}
                disabled={isSaving}
              >
                {imageOperation === "remove" ? "Removing…" : "Remove image"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {aiDiscardTarget ? (
        <div
          className="dialog-backdrop learning-delete-confirm-backdrop"
          onMouseDown={ignoreInnerMouseDown}
        >
          <section
            className="delete-dialog learning-delete-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-ai-edit-title"
            aria-describedby="discard-ai-edit-description"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="discard-ai-edit-title">Discard AI edit?</h2>
            <p id="discard-ai-edit-description">
              Your AI changes have not been applied to this learning item.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setAiDiscardTarget(undefined)}
                autoFocus
              >
                Keep editing
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void confirmAiDiscard()}
              >
                Discard changes
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
  const [items, setItems] = useState<LearningItemSummary[]>([]);
  const [counts, setCounts] = useState<LearningItemCounts>({
    active: 0,
    trashed: 0,
    progress: { new: 0, studying: 0, familiar: 0, strong: 0 }
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemType, setItemType] = useState<LearningItemType | "all">("all");
  const [cefr, setCefr] = useState<CefrLevel | "all">("all");
  const [progressStatus, setProgressStatus] =
    useState<LearningItemProgressStatus | "all">("all");
  const [sort, setSort] = useState<LearningItemSort>("recent");
  const [selectedItem, setSelectedItem] = useState<LearningItem>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [error, setError] = useState("");
  const [isEmptyTrashConfirming, setIsEmptyTrashConfirming] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const queryGenerationRef = useRef(0);
  const [scrollMetrics, setScrollMetrics] = useState({
    top: 0,
    height: 720,
    width: 900
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadCounts = useCallback(async () => {
    const next = await api.countItems();
    setCounts(next);
    onCountsChange?.(next);
  }, [api, onCountsChange]);

  const listInput = useCallback((cursor?: string): LearningItemListInput =>
    view === "active"
      ? {
          status: "active",
          search: debouncedSearch,
          ...(itemType === "all" ? {} : { itemType }),
          ...(cefr === "all" ? {} : { cefr }),
          ...(progressStatus === "all" ? {} : { progressStatus }),
          sort,
          ...(cursor ? { cursor } : {})
        }
      : {
          status: "trashed",
          sort: "recent",
          ...(cursor ? { cursor } : {})
        }, [cefr, debouncedSearch, itemType, progressStatus, sort, view]);

  useEffect(() => {
    const generation = ++queryGenerationRef.current;
    setIsLoading(true);
    setIsLoadingMore(false);
    setNextCursor(null);
    setLoadMoreError("");
    setError("");
    setItems([]);
    const scrollRegion = scrollRegionRef.current;
    if (scrollRegion) scrollRegion.scrollTop = 0;
    setScrollMetrics((current) => ({ ...current, top: 0 }));
    void api.listItems(listInput()).then((page) => {
      if (generation !== queryGenerationRef.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    }).catch((cause) => {
      if (generation !== queryGenerationRef.current) return;
      setError(cause instanceof Error
        ? cause.message
        : "Unable to load the Learning Library.");
    }).finally(() => {
      if (generation === queryGenerationRef.current) setIsLoading(false);
    });
    return () => {
      if (generation === queryGenerationRef.current) {
        queryGenerationRef.current += 1;
      }
    };
  }, [api, listInput]);

  useEffect(() => {
    void loadCounts().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Unable to get Learning Library counts.");
    });
  }, [loadCounts]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    const generation = queryGenerationRef.current;
    const cursor = nextCursor;
    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const page = await api.listItems(listInput(cursor));
      if (generation !== queryGenerationRef.current) return;
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !existing.has(item.id))
        ];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (generation !== queryGenerationRef.current) return;
      setLoadMoreError(cause instanceof Error
        ? cause.message
        : "Unable to load more learning items.");
    } finally {
      if (generation === queryGenerationRef.current) setIsLoadingMore(false);
    }
  }, [api, isLoadingMore, listInput, nextCursor]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollRegionRef.current;
    if (!sentinel || !root || !nextCursor || loadMoreError ||
      typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, {
      root,
      rootMargin: "0px 0px 420px 0px"
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loadMoreError, nextCursor]);

  useLayoutEffect(() => {
    const region = scrollRegionRef.current;
    if (!region) return;
    const update = () => setScrollMetrics({
      top: region.scrollTop,
      height: region.clientHeight || 720,
      width: region.clientWidth || 900
    });
    update();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(update);
    observer?.observe(region);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  function closeDetail() {
    setSelectedItem(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function openDetail(item: LearningItemSummary, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setError("");
    try {
      setSelectedItem(await api.getItem(item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open the learning item.");
    }
  }

  async function reloadLoadedItemsPreservingPosition() {
    const generation = ++queryGenerationRef.current;
    const scrollTop = scrollRegionRef.current?.scrollTop ?? 0;
    const targetCount = Math.max(50, items.length);
    const refreshed: LearningItemSummary[] = [];
    let cursor: string | undefined;
    setIsLoadingMore(false);
    setError("");
    setLoadMoreError("");
    try {
      do {
        const page = await api.listItems(listInput(cursor));
        if (generation !== queryGenerationRef.current) return;
        refreshed.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && refreshed.length < targetCount);
      setItems(refreshed);
      setNextCursor(cursor ?? null);
      requestAnimationFrame(() => {
        if (scrollRegionRef.current) scrollRegionRef.current.scrollTop = scrollTop;
        setScrollMetrics((current) => ({ ...current, top: scrollTop }));
      });
    } catch (cause) {
      if (generation !== queryGenerationRef.current) return;
      setError(cause instanceof Error
        ? cause.message
        : "Unable to refresh the Learning Library.");
    }
  }

  async function refreshAfterChange(item?: LearningItem) {
    if (item?.status === "active") setSelectedItem(item);
    await Promise.all([reloadLoadedItemsPreservingPosition(), loadCounts()]);
  }

  async function restore(itemId: string) {
    if (isMutating) return;
    setIsMutating(true);
    setError("");
    try {
      await api.restoreItem(itemId);
      await Promise.all([reloadLoadedItemsPreservingPosition(), loadCounts()]);
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
      await Promise.all([reloadLoadedItemsPreservingPosition(), loadCounts()]);
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
    progressStatus !== "all" ||
    sort !== "recent"
  );

  function clearFilters() {
    setSearch("");
    setItemType("all");
    setCefr("all");
    setProgressStatus("all");
    setSort("recent");
  }

  const columns = view === "active"
    ? Math.max(1, Math.floor((scrollMetrics.width - 64 + 14) / (218 + 14)))
    : 1;
  const rowHeight = view === "active" ? 186 : 86;
  const totalRows = Math.ceil(items.length / columns);
  const overscanRows = 3;
  const startRow = Math.max(
    0,
    Math.floor(scrollMetrics.top / rowHeight) - overscanRows
  );
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollMetrics.top + scrollMetrics.height) / rowHeight) +
      overscanRows
  );
  const startIndex = startRow * columns;
  const endIndex = Math.min(items.length, endRow * columns);
  const visibleItems = items.slice(startIndex, endIndex);
  const virtualHeight = totalRows * rowHeight;
  const focusedIndex = focusedItemId
    ? items.findIndex((item) => item.id === focusedItemId)
    : -1;
  const focusedItem = focusedIndex >= 0 &&
    (focusedIndex < startIndex || focusedIndex >= endIndex)
    ? items[focusedIndex]
    : null;
  const focusedRow = focusedIndex >= 0
    ? Math.floor(focusedIndex / columns)
    : 0;
  const focusedColumn = focusedIndex >= 0
    ? focusedIndex % columns
    : 0;

  useLayoutEffect(() => {
    if (!focusedItemId || document.activeElement !== document.body) return;
    const container = scrollRegionRef.current;
    const holder = Array.from(
      container?.querySelectorAll<HTMLElement>("[data-learning-item-id]") ?? []
    ).find((element) => element.dataset.learningItemId === focusedItemId);
    const target = holder instanceof HTMLButtonElement
      ? holder
      : holder?.querySelector<HTMLButtonElement>("button");
    target?.focus({ preventScroll: true });
  }, [endIndex, focusedItemId, startIndex, view]);

  function renderSummary(item: LearningItemSummary) {
    return view === "active" ? (
      <button
        type="button"
        className="learning-item-card"
        data-learning-item-id={item.id}
        data-study-status={item.studyStatus}
        key={item.id}
        aria-label={`${item.title}, ${item.studyStatus === "scheduled" ? `scheduled, ${cardStudyStatusLabel(item)}` : cardStudyStatusLabel(item)}, ${item.itemType === "word" ? "word" : "phrase"}, ${languageLabels[item.language]}, ${item.cefr}, ${item.sense}`}
        onFocus={() => setFocusedItemId(item.id)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusedItemId((current) => current === item.id ? null : current);
          }
        }}
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
          <em className="learning-card-language">{languageLabels[item.language]}</em>
          <em className="learning-card-cefr">{item.cefr}</em>
        </span>
        <strong>{item.title}</strong>
        <small>{item.sense}</small>
        <span className="learning-card-open">
          View details <span aria-hidden="true">→</span>
        </span>
      </button>
    ) : (
      <article
        className="learning-trash-item"
        data-learning-item-id={item.id}
        key={item.id}
        onFocus={() => setFocusedItemId(item.id)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusedItemId((current) => current === item.id ? null : current);
          }
        }}
      >
        <div>
          <span>{item.itemType === "word" ? "Word" : "Phrase"} • {languageLabels[item.language]} • {item.cefr}</span>
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
    );
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
                  ? "Organize, search, and build a collection of words and phrases worth remembering."
                  : "Items stay here until you permanently empty Trash."}
              </p>
            </div>
            {view === "active" ? (
              <div className="learning-library-header-actions">
                <div
                  className="learning-status-overview"
                  role="group"
                  aria-label="Learning item progress counts"
                >
                  {progressStatusOrder.map((status) => {
                    const count = counts.progress[status];
                    const selected = progressStatus === status;
                    return (
                      <button
                        type="button"
                        key={status}
                        data-progress-status={status}
                        aria-pressed={selected}
                        aria-label={`${progressStatusLabels[status]}, ${count} learning ${count === 1 ? "item" : "items"}`}
                        onClick={() => setProgressStatus(selected ? "all" : status)}
                      >
                        <span>{progressStatusLabels[status]}</span>
                        <strong>{count}</strong>
                      </button>
                    );
                  })}
                </div>
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
                  <span className="trash-entry-label">Trash</span>
                  <span className="trash-entry-count">{counts.trashed}</span>
                </button>
              </div>
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

      <div
        className="learning-library-scroll-region"
        data-testid="learning-library-scroll-region"
        ref={scrollRegionRef}
        aria-busy={isLoading || isLoadingMore}
        onScroll={(event) => {
          const {
            scrollTop,
            clientHeight,
            clientWidth
          } = event.currentTarget;
          setScrollMetrics((current) => ({
            ...current,
            top: scrollTop,
            height: clientHeight || current.height,
            width: clientWidth || current.width
          }));
        }}
      >
        <div className="learning-library-results">
          {error ? <p className="library-error" role="alert">{error}</p> : null}

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
              className="learning-virtual-space"
              style={{ height: virtualHeight }}
              data-testid="learning-virtual-space"
            >
              <div
                className={[
                  view === "active" ? "learning-card-grid" : "learning-trash-list",
                  "learning-virtual-window"
                ].join(" ")}
                data-testid="learning-virtual-window"
                aria-label={view === "active" ? "Learning item list" : "Trash items"}
                style={{
                  top: startRow * rowHeight,
                  ...(view === "active"
                    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
                    : {})
                }}
              >
                {visibleItems.map(renderSummary)}
              </div>
              {focusedItem ? (
                <div
                  className={[
                    view === "active" ? "learning-card-grid" : "learning-trash-list",
                    "learning-virtual-window",
                    "learning-focus-keeper"
                  ].join(" ")}
                  style={{
                    top: focusedRow * rowHeight,
                    ...(view === "active"
                      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
                      : {})
                  }}
                >
                  {view === "active"
                    ? Array.from({ length: focusedColumn }, (_, index) => (
                        <span aria-hidden="true" key={`focus-spacer-${index}`} />
                      ))
                    : null}
                  {renderSummary(focusedItem)}
                </div>
              ) : null}
            </div>
          ) : null}

          {!isLoading && nextCursor ? (
            <div
              className="learning-load-more-sentinel"
              data-testid="learning-load-more-sentinel"
              ref={loadMoreSentinelRef}
              aria-hidden="true"
            />
          ) : null}
          {isLoadingMore ? (
            <p className="learning-load-more-status" role="status">
              Loading more learning items…
            </p>
          ) : null}
          {loadMoreError ? (
            <div className="learning-load-more-error" role="alert">
              <span>Couldn’t load more learning items.</span>
              <button type="button" onClick={() => void loadMore()}>Retry</button>
            </div>
          ) : null}
        </div>
      </div>

      {selectedItem ? (
        <LearningItemDialog
          item={selectedItem}
          api={api}
          reviewApi={reviewApi}
          readOnly={selectedItem.status !== "active"}
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
