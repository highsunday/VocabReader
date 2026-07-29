import {
  FormEvent,
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";
import {
  Brain,
  CircleCheck,
  LibraryBig,
  LoaderCircle,
  Settings as SettingsIcon
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatDesktopApi,
  ChatConversationSummary,
  ChatSnapshot,
  ConnectionPhase,
  SendChatMessageInput
} from "../shared/chat-contracts";
import type {
  DataBackupDesktopApi,
  DataBackupPreview
} from "../shared/data-backup-contracts";
import type {
  Annotation,
  BookView,
  ChapterContent,
  LibraryBook,
  LibraryDesktopApi,
  ReadingRange
} from "../shared/library-contracts";
import type { LearningDesktopApi } from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import {
  AI_CONVERSATION_FONT_SIZE,
  DAILY_DUE_REVIEW_COMPLETION_LIMIT,
  DAILY_NEW_ITEM_COMPLETION_LIMIT,
  EBOOK_CONTENT_FONT_SIZE,
  EBOOK_LINE_HEIGHT,
  READING_PAPER_WIDTH,
  REVIEW_PAPER_SIZE,
  type AppSettings,
  type ExplanationLanguage,
  type SettingsDesktopApi
} from "../shared/settings-contracts";
import {
  advanceReadingRange,
  annotatedReadingSegment,
  annotationRangeFromSelection,
  annotationRevision,
  extractReadingSegment,
  hasAnnotationOverlap,
  initialReadingRange,
  markerTopForTextOffset,
  renderAnnotationHighlights,
  textOffsetAtPoint
} from "./reading-range";
import { LearningLibraryWorkspace } from "./LearningLibraryWorkspace";
import {
  LearningItemBatchAction,
  LearningItemDraftDialog
} from "./LearningItemDraftDialog";
import { ReadingPracticePaper } from "./ReadingPracticePaper";
import {
  SpacedReviewWorkspace,
  type ReviewWorkspaceStatus
} from "./SpacedReviewWorkspace";
import { readingPracticeArtifacts } from "./reading-practice-artifact";

type WorkspaceMode = "overview" | "reader" | "learning-library" | "spaced-review";
type SettingsSection = "general" | "review" | "account";

const DEFAULT_ASSISTANT_PANEL_WIDTH = 360;
const COLLAPSED_PANEL_WIDTH = 48;
const MIN_ASSISTANT_PANEL_WIDTH = 320;
const MAX_ASSISTANT_PANEL_WIDTH = 640;
const MIN_READING_AREA_WIDTH = 520;
const EXPANDED_LEFT_SIDEBAR_WIDTH = 220;
const COLLAPSED_LEFT_SIDEBAR_WIDTH = 48;
const ASSISTANT_PANEL_RESIZE_STEP = 16;

const initialChatSnapshot: ChatSnapshot = {
  connection: "disconnected",
  connectionDetail: "Codex is not connected.",
  account: null,
  allowance: {
    phase: "unavailable",
    fiveHour: null,
    weekly: null,
    detail: "AI usage allowance is not available yet."
  },
  messages: [],
  threadId: null,
  activeTurnId: null,
  conversations: [],
  activeConversationId: null,
  managementBusy: false,
  conversationError: null,
  models: [],
  selectedModelId: null,
  modelCatalogDetail: "Available models have not been loaded.",
  stopRequested: false
};

function desktopBridge(): {
  library?: LibraryDesktopApi;
  learning?: LearningDesktopApi;
  review?: ReviewDesktopApi;
  settings?: SettingsDesktopApi;
  dataBackup?: DataBackupDesktopApi;
  chat?: ChatDesktopApi;
} | undefined {
  return (
    window as unknown as {
      readerDesktop?: {
        library?: LibraryDesktopApi;
        learning?: LearningDesktopApi;
        review?: ReviewDesktopApi;
        settings?: SettingsDesktopApi;
        dataBackup?: DataBackupDesktopApi;
        chat?: ChatDesktopApi;
      };
    }
  ).readerDesktop;
}

function desktopLibrary(): LibraryDesktopApi | undefined {
  return desktopBridge()?.library;
}

function desktopChat(): ChatDesktopApi | undefined {
  return desktopBridge()?.chat;
}

function desktopLearning(): LearningDesktopApi | undefined {
  return desktopBridge()?.learning;
}

function desktopReview(): ReviewDesktopApi | undefined {
  return desktopBridge()?.review;
}

function desktopSettings(): SettingsDesktopApi | undefined {
  return desktopBridge()?.settings;
}

function desktopDataBackup(): DataBackupDesktopApi | undefined {
  return desktopBridge()?.dataBackup;
}

function connectionLabel(phase: ConnectionPhase) {
  return {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    ready: "Connected",
    "auth-required": "Sign-in required",
    error: "Connection failed"
  }[phase];
}

function resetLabel(timestamp: number | undefined) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date((timestamp ?? 0) * 1000).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ChatMessageContent({ text }: { text: string }) {
  const intentMarker = "```learning-item-intent";
  const trimmedText = text.trimStart();
  const routingOnly = Boolean(trimmedText) && (
    intentMarker.startsWith(trimmedText) ||
    trimmedText.startsWith(intentMarker)
  );
  const visibleText = (routingOnly ? "" : text)
    .replace(/```reading-practice-(?:quiz|grade)\s*\n[\s\S]*?\n```/g, "")
    .replace(/```learning-item-intent\s*\n[\s\S]*?(?:\n```|$)/g, "")
    .trim();
  return (
    <div className="message-content">
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
        {visibleText || (text ? "The paper is displayed in the center." : "…")}
      </ReactMarkdown>
    </div>
  );
}

const ChapterArticle = memo(forwardRef<HTMLElement, {
  content: ChapterContent;
}>(function ChapterArticle({ content }, ref) {
  return (
    <article
      ref={ref}
      className="chapter-content"
      aria-label={`${content.title} chapter content`}
      dangerouslySetInnerHTML={{ __html: content.contentHtml }}
    />
  );
}));

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>("overview");
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(
    DEFAULT_ASSISTANT_PANEL_WIDTH
  );
  const [isAssistantPanelResizing, setIsAssistantPanelResizing] = useState(false);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [activeChapterId, setActiveChapterId] = useState<string>();
  const [libraryError, setLibraryError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [bookPendingDeletion, setBookPendingDeletion] = useState<LibraryBook>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [chapterContent, setChapterContent] = useState<ChapterContent>();
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [readingRange, setReadingRange] = useState<ReadingRange>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [rangeMenu, setRangeMenu] = useState<{
    x: number;
    y: number;
    offset: number;
    selection?: { start: number; end: number; text: string };
    annotationId?: string;
  }>();
  const [markerTops, setMarkerTops] = useState({ start: 0, end: 0 });
  const [draft, setDraft] = useState("");
  const [chatSnapshot, setChatSnapshot] = useState(initialChatSnapshot);
  const [chatError, setChatError] = useState("");
  const [chatView, setChatView] = useState<"conversation" | "history">(
    "conversation"
  );
  const [isConversationActionPending, setIsConversationActionPending] =
    useState(false);
  const [isModelActionPending, setIsModelActionPending] = useState(false);
  const [isStopPending, setIsStopPending] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    explanationLanguage: "source",
    aiConversationFontSize: AI_CONVERSATION_FONT_SIZE.default,
    ebookContentFontSize: EBOOK_CONTENT_FONT_SIZE.default,
    readingPaperWidth: READING_PAPER_WIDTH.default,
    ebookLineHeight: EBOOK_LINE_HEIGHT.default,
    dailyNewItemCompletionLimit: DAILY_NEW_ITEM_COMPLETION_LIMIT.default,
    dailyDueReviewCompletionLimit: DAILY_DUE_REVIEW_COMPLETION_LIMIT.default,
    reviewPaperSize: REVIEW_PAPER_SIZE.default
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("general");
  const [isReadingLayoutOpen, setIsReadingLayoutOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [dataBackupOperation, setDataBackupOperation] = useState<
    "exporting" | "selecting" | "cancelling" | "restoring" | null
  >(null);
  const [dataBackupMessage, setDataBackupMessage] = useState("");
  const [dataBackupError, setDataBackupError] = useState("");
  const [dataRestorePreview, setDataRestorePreview] =
    useState<DataBackupPreview>();
  const [learningCounts, setLearningCounts] = useState({ active: 0, trashed: 0 });
  const [reviewAvailableCount, setReviewAvailableCount] = useState(0);
  const [reviewSettingsRevision, setReviewSettingsRevision] = useState(0);
  const [reviewWorkspaceStatus, setReviewWorkspaceStatus] =
    useState<ReviewWorkspaceStatus>("idle");
  const [openLearningItemBatchId, setOpenLearningItemBatchId] =
    useState<string>();
  const [expandedReadingPracticeQuizId, setExpandedReadingPracticeQuizId] =
    useState<string>();
  const [learningLibraryRevision, setLearningLibraryRevision] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const pendingChatScrollUserCountRef = useRef<number | null>(null);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const readingLayoutRef = useRef<HTMLDivElement>(null);
  const dataRestoreCancelRef = useRef<HTMLButtonElement>(null);
  const initializedRangeRef = useRef<string | undefined>(undefined);
  const lastProvidedReadingSegmentRef = useRef<string | undefined>(undefined);
  const annotationCounterRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsSaveTimerRef =
    useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsSaveRevisionRef = useRef(0);
  const chapterStartRef = useRef<{
    bookId: string;
    chapterId: string;
    useFragment: boolean;
  } | undefined>(undefined);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0],
    [books, selectedBookId]
  );
  const openLearningItemBatch = useMemo(
    () => chatSnapshot.messages
      .map((message) => message.learningItemBatch)
      .find((batch) => batch?.id === openLearningItemBatchId),
    [chatSnapshot.messages, openLearningItemBatchId]
  );
  const readingPractice = useMemo(
    () => readingPracticeArtifacts(chatSnapshot.messages),
    [chatSnapshot.messages]
  );
  const rangeBoundariesOverlap = readingRange
    ? Math.abs(markerTops.start - markerTops.end) < 28
    : false;
  const activeChapter = selectedBook?.chapters.find(
    (chapter) => chapter.id === activeChapterId
  );
  const activeChapterIndex = selectedBook?.chapters.findIndex(
    (chapter) => chapter.id === activeChapterId
  ) ?? -1;
  const previousChapter = adjacentChapter(-1);
  const nextChapter = adjacentChapter(1);

  function adjacentChapter(direction: -1 | 1) {
    if (!selectedBook || !activeChapterId || activeChapterIndex < 0) {
      return undefined;
    }
    for (
      let index = activeChapterIndex + direction;
      index >= 0 && index < selectedBook.chapters.length;
      index += direction
    ) {
      const chapter = selectedBook.chapters[index];
      if (chapter.id !== activeChapterId) return chapter;
    }
    return undefined;
  }

  function restoreBook(book: LibraryBook) {
    const state = book.readingState;
    const canResumeReader =
      state?.view === "reader" &&
      Boolean(state.chapterId) &&
      book.chapters.some((chapter) => chapter.id === state.chapterId);
    setSelectedBookId(book.id);
    setActiveChapterId(canResumeReader ? state.chapterId ?? undefined : undefined);
    if (canResumeReader && state.chapterId) {
      chapterStartRef.current = {
        bookId: book.id,
        chapterId: state.chapterId,
        useFragment: true
      };
    }
    setMode(canResumeReader ? "reader" : "overview");
  }

  useEffect(() => {
    const library = desktopLibrary();
    if (!library) {
      return;
    }

    void library
      .listBooks()
      .then((storedBooks) => {
        setBooks(storedBooks);
        if (storedBooks[0]) restoreBook(storedBooks[0]);
      })
      .catch(() => setLibraryError("Unable to load the local Book Library. Please reopen the app."));
  }, []);

  useEffect(() => {
    const review = desktopReview();
    if (!review) return;
    let active = true;
    void review.getSummary()
      .then((summary) => {
        if (active) setReviewAvailableCount(summary.totalAvailable);
      })
      .catch(() => {
        // The review workspace provides a retryable error when opened.
      });
    return () => {
      active = false;
    };
  }, [learningLibraryRevision]);

  useEffect(() => {
    const learning = desktopLearning();
    if (!learning) return;

    let active = true;
    void Promise.all([
      learning.listItems({ status: "active", sort: "recent" }),
      learning.listItems({ status: "trashed", sort: "recent" })
    ])
      .then(([activeItems, trashedItems]) => {
        if (active) {
          setLearningCounts({
            active: activeItems.length,
            trashed: trashedItems.length
          });
        }
      })
      .catch(() => {
        // The learning workspace presents actionable loading errors when opened.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const chat = desktopChat();
    if (!chat) return;
    let active = true;
    const update = (snapshot: ChatSnapshot) => {
      if (active) setChatSnapshot(snapshot);
    };
    const unsubscribe = chat.onStateChanged(update);
    void chat.getState()
      .then(update)
      .then(() => chat.connect())
      .then(update)
      .catch((error: unknown) => {
        if (!active) return;
        setChatError(
          error instanceof Error ? error.message : "Unable to connect to Codex."
        );
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const previousUserCount = pendingChatScrollUserCountRef.current;
    if (previousUserCount === null) return;
    const currentUserCount = chatSnapshot.messages.reduce(
      (count, message) => count + (message.role === "user" ? 1 : 0),
      0
    );
    if (currentUserCount <= previousUserCount || !chatMessagesRef.current) {
      return;
    }
    chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    pendingChatScrollUserCountRef.current = null;
  }, [chatSnapshot.messages]);

  useEffect(() => {
    const api = desktopSettings();
    if (!api) return;
    let active = true;
    void api.get()
      .then((stored) => {
        if (active) setSettings(stored);
      })
      .catch(() => {
        if (active) setSettingsError("Unable to load settings. Source language is being used.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const library = desktopLibrary();
    if (mode !== "reader" || !selectedBookId || !activeChapterId || !library) {
      setChapterContent(undefined);
      setChapterError("");
      return;
    }

    let cancelled = false;
    setChapterContent(undefined);
    setReadingRange(undefined);
    setAnnotations([]);
    setIsAnnotationMode(false);
    setRangeMenu(undefined);
    setChapterError("");
    setIsLoadingChapter(true);
    void library
      .getChapterContent(selectedBookId, activeChapterId)
      .then((content) => {
        if (!cancelled) setChapterContent(content);
      })
      .catch(() => {
        if (!cancelled) {
          setChapterError("Unable to load this chapter. Return to the overview and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChapter(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedBookId, activeChapterId]);

  useEffect(() => {
    if (!chapterContent || !selectedBook) return;
    setAnnotations(
      selectedBook.chapterAnnotations?.[chapterContent.chapterId] ?? []
    );
  }, [chapterContent, selectedBook]);

  useEffect(() => {
    const article = articleRef.current;
    if (!chapterContent || !selectedBook || !article) return;
    const key = `${chapterContent.bookId}:${chapterContent.chapterId}`;
    if (initializedRangeRef.current === key && readingRange) return;
    initializedRangeRef.current = key;
    const text = article.textContent ?? "";
    const saved = selectedBook.chapterRanges?.[chapterContent.chapterId];
    const range = saved && saved.start <= saved.end && saved.end <= text.length
      ? saved
      : initialReadingRange(text);
    setReadingRange(range);
    if (!saved) persistReadingRange(range);
  }, [chapterContent, selectedBook]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !readingRange) return;
    const updateMarkerTops = () => setMarkerTops({
      start: markerTopForTextOffset(article, readingRange.start),
      end: markerTopForTextOffset(article, readingRange.end, "after")
    });
    updateMarkerTops();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateMarkerTops);
    resizeObserver?.observe(article);
    window.addEventListener("resize", updateMarkerTops);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMarkerTops);
    };
  }, [
    chapterContent,
    readingRange,
    settings.ebookContentFontSize,
    settings.readingPaperWidth,
    settings.ebookLineHeight
  ]);

  useEffect(() => {
    if (!isReadingLayoutOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !readingLayoutRef.current?.contains(event.target)
      ) {
        setIsReadingLayoutOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsReadingLayoutOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isReadingLayoutOpen]);

  useEffect(() => {
    if (mode !== "reader") setIsReadingLayoutOpen(false);
  }, [mode]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !chapterContent) return;
    renderAnnotationHighlights(article, annotations);
  }, [chapterContent, annotations]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !chapterContent || !isAnnotationMode) return;
    const handleMouseUp = () => {
      const selected = annotationRangeFromSelection(
        article,
        article.ownerDocument.getSelection()
      );
      if (!selected || hasAnnotationOverlap(annotations, selected)) return;
      createAnnotation(selected);
    };
    article.addEventListener("mouseup", handleMouseUp);
    return () => article.removeEventListener("mouseup", handleMouseUp);
  }, [chapterContent, isAnnotationMode, annotations]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !chapterContent) return;
    const handleContextMenu = (event: MouseEvent) => {
      const offset = textOffsetAtPoint(
        article,
        event.clientX,
        event.clientY,
        event.target
      );
      if (offset === null) return;
      event.preventDefault();
      const target = event.target instanceof Element ? event.target : null;
      const annotationId = target
        ?.closest<HTMLElement>("[data-annotation-id]")
        ?.dataset.annotationId;
      const selection = annotationRangeFromSelection(
        article,
        article.ownerDocument.getSelection()
      );
      setRangeMenu({
        x: event.clientX,
        y: event.clientY,
        offset,
        ...(selection ? { selection } : {}),
        ...(annotationId ? { annotationId } : {})
      });
    };
    article.addEventListener("contextmenu", handleContextMenu);
    return () => article.removeEventListener("contextmenu", handleContextMenu);
  }, [chapterContent, annotations]);

  useEffect(() => {
    if (!rangeMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rangeMenuRef.current?.contains(event.target as Node)) return;
      setRangeMenu(undefined);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [rangeMenu]);

  useEffect(() => {
    if (!chapterContent || !selectedBook || !contentRef.current) return;
    const maximum = Math.max(
      0,
      contentRef.current.scrollHeight - contentRef.current.clientHeight
    );
    const progress = selectedBook.readingState.chapterId === chapterContent.chapterId
      ? selectedBook.readingState.scrollProgress
      : 0;
    const startPreference = chapterStartRef.current;
    const useFragment =
      !startPreference ||
      startPreference.bookId !== chapterContent.bookId ||
      startPreference.chapterId !== chapterContent.chapterId ||
      startPreference.useFragment;
    if (progress === 0 && useFragment && chapterContent.fragment) {
      const target = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>("[id]")
      ).find((element) => element.id === chapterContent.fragment);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    contentRef.current.scrollTop = maximum * progress;
  }, [chapterContent, selectedBookId]);

  useEffect(() => {
    if (mode !== "reader" && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [mode, selectedBookId]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  function assistantPanelMaximumWidth(): number {
    const measuredWorkspaceWidth = workspaceRef.current
      ?.getBoundingClientRect().width;
    const workspaceWidth = measuredWorkspaceWidth && measuredWorkspaceWidth > 0
      ? measuredWorkspaceWidth
      : window.innerWidth;
    const leftSidebarWidth = isLeftSidebarCollapsed
      ? COLLAPSED_LEFT_SIDEBAR_WIDTH
      : EXPANDED_LEFT_SIDEBAR_WIDTH;
    const availableWidth = workspaceWidth - leftSidebarWidth - MIN_READING_AREA_WIDTH;
    return Math.max(
      MIN_ASSISTANT_PANEL_WIDTH,
      Math.min(MAX_ASSISTANT_PANEL_WIDTH, availableWidth)
    );
  }

  function boundedAssistantPanelWidth(width: number): number {
    return Math.round(Math.max(
      MIN_ASSISTANT_PANEL_WIDTH,
      Math.min(assistantPanelMaximumWidth(), width)
    ));
  }

  function startAssistantPanelResize(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    const initialPointerX = event.clientX;
    const initialWidth = assistantPanelWidth;
    setIsAssistantPanelResizing(true);

    const stopListening = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      setIsAssistantPanelResizing(false);
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const delta = initialPointerX - pointerEvent.clientX;
      setAssistantPanelWidth(boundedAssistantPanelWidth(initialWidth + delta));
    };
    const handlePointerUp = () => {
      stopListening();
    };
    const handlePointerCancel = () => {
      stopListening();
      setAssistantPanelWidth(initialWidth);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function handleAssistantPanelResizeKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowLeft"
      ? ASSISTANT_PANEL_RESIZE_STEP
      : -ASSISTANT_PANEL_RESIZE_STEP;
    setAssistantPanelWidth((current) => boundedAssistantPanelWidth(current + change));
  }

  useEffect(() => {
    const handleWindowResize = () => {
      setAssistantPanelWidth((current) => boundedAssistantPanelWidth(current));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [isLeftSidebarCollapsed]);

  function currentScrollProgress(): number {
    const scroller = contentRef.current;
    if (!scroller) return 0;
    const maximum = scroller.scrollHeight - scroller.clientHeight;
    return maximum > 0
      ? Math.min(1, Math.max(0, scroller.scrollTop / maximum))
      : 0;
  }

  function persistReadingState(
    book: LibraryBook,
    view: BookView,
    chapterId: string | null,
    scrollProgress: number
  ) {
    const state = { bookId: book.id, view, chapterId, scrollProgress };
    setBooks((current) => current.map((candidate) =>
      candidate.id === book.id
        ? {
            ...candidate,
            lastChapterId: chapterId ?? candidate.lastChapterId,
            readingState: { view, chapterId, scrollProgress }
          }
        : candidate
    ));
    void desktopLibrary()?.saveReadingState(state).then((savedBook) => {
      setBooks((current) => current.map((candidate) =>
        candidate.id === savedBook.id
          ? {
              ...savedBook,
              chapterRanges: savedBook.chapterRanges ?? candidate.chapterRanges
            }
          : candidate
      ));
    }).catch(() => {
      setLibraryError("Unable to save the reading position. You can continue this session.");
    });
  }

  function persistReadingRange(range: ReadingRange) {
    const book = selectedBook;
    const chapterId = chapterContent?.chapterId ?? activeChapterId;
    if (!book || !chapterId) return;
    setReadingRange(range);
    setBooks((current) => current.map((candidate) =>
      candidate.id === book.id
        ? {
            ...candidate,
            chapterRanges: {
              ...candidate.chapterRanges,
              [chapterId]: range
            }
          }
        : candidate
    ));
    void desktopLibrary()?.saveReadingRange({
      bookId: book.id,
      chapterId,
      range
    }).then((savedBook) => {
      setBooks((current) => current.map((candidate) =>
        candidate.id === savedBook.id
          ? {
              ...candidate,
              chapterRanges: savedBook.chapterRanges ?? candidate.chapterRanges
            }
          : candidate
      ));
    }).catch(() => {
      setLibraryError("Unable to save the reading segment. This adjustment remains available for this session.");
    });
  }

  function persistAnnotations(next: Annotation[]) {
    const book = selectedBook;
    const chapterId = chapterContent?.chapterId ?? activeChapterId;
    if (!book || !chapterId) return;
    setAnnotations(next);
    setBooks((current) => current.map((candidate) =>
      candidate.id === book.id
        ? {
            ...candidate,
            chapterAnnotations: {
              ...candidate.chapterAnnotations,
              [chapterId]: next
            }
          }
        : candidate
    ));
    void desktopLibrary()?.saveAnnotations({
      bookId: book.id,
      chapterId,
      annotations: next
    }).then((savedBook) => {
      setBooks((current) => current.map((candidate) =>
        candidate.id === savedBook.id
          ? {
              ...candidate,
              chapterAnnotations:
                savedBook.chapterAnnotations ?? candidate.chapterAnnotations
            }
          : candidate
      ));
    }).catch(() => {
      setLibraryError("Unable to save the annotation. It remains available for this session.");
    });
  }

  function createAnnotation(selected: { start: number; end: number; text: string }) {
    if (hasAnnotationOverlap(annotations, selected)) {
      setRangeMenu(undefined);
      return;
    }
    annotationCounterRef.current += 1;
    persistAnnotations([
      ...annotations,
      {
        id: `annotation-${Date.now()}-${annotationCounterRef.current}`,
        ...selected
      }
    ].sort((left, right) => left.start - right.start || left.end - right.end));
    articleRef.current?.ownerDocument.getSelection()?.removeAllRanges();
    setRangeMenu(undefined);
  }

  function removeAnnotation(annotationId: string) {
    persistAnnotations(annotations.filter(
      (annotation) => annotation.id !== annotationId
    ));
    setRangeMenu(undefined);
  }

  async function persistSettings(next: AppSettings) {
    const api = desktopSettings();
    const revision = ++settingsSaveRevisionRef.current;
    setIsSettingsSaving(true);
    setSettingsError("");
    try {
      const saved = api ? await api.save(next) : next;
      if (revision === settingsSaveRevisionRef.current) {
        setSettings(saved);
        setReviewSettingsRevision((current) => current + 1);
      }
    } catch {
      if (revision === settingsSaveRevisionRef.current) {
        setSettingsError("Unable to save settings. Please try again.");
      }
    } finally {
      if (revision === settingsSaveRevisionRef.current) {
        setIsSettingsSaving(false);
      }
    }
  }

  function saveExplanationLanguage(value: ExplanationLanguage) {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = undefined;
    }
    const next = { ...settings, explanationLanguage: value };
    setSettings(next);
    void persistSettings(next);
  }

  function previewSetting(
    field:
      | "aiConversationFontSize"
      | "ebookContentFontSize"
      | "readingPaperWidth"
      | "ebookLineHeight"
      | "dailyNewItemCompletionLimit"
      | "dailyDueReviewCompletionLimit"
      | "reviewPaperSize",
    value: number
  ) {
    const next = { ...settings, [field]: value };
    settingsSaveRevisionRef.current += 1;
    setSettings(next);
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(() => {
      settingsSaveTimerRef.current = undefined;
      void persistSettings(next);
    }, 180);
  }

  function resetReadingLayout() {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = undefined;
    }
    const next = {
      ...settings,
      ebookContentFontSize: EBOOK_CONTENT_FONT_SIZE.default,
      readingPaperWidth: READING_PAPER_WIDTH.default,
      ebookLineHeight: EBOOK_LINE_HEIGHT.default
    };
    setSettings(next);
    void persistSettings(next);
  }

  async function exportDataBackup() {
    const api = desktopDataBackup();
    if (!api || dataBackupOperation) return;
    setDataBackupOperation("exporting");
    setDataBackupMessage("");
    setDataBackupError("");
    try {
      const result = await api.exportBackup();
      if (result.status === "exported") {
        setDataBackupMessage(`Exported ${result.fileName}`);
      }
    } catch (error) {
      setDataBackupError(
        error instanceof Error ? error.message : "Unable to export the data backup."
      );
    } finally {
      setDataBackupOperation(null);
    }
  }

  async function selectDataBackup() {
    const api = desktopDataBackup();
    if (!api || dataBackupOperation) return;
    setDataBackupOperation("selecting");
    setDataBackupMessage("");
    setDataBackupError("");
    try {
      const result = await api.selectBackup();
      if (result.status === "ready") {
        setDataRestorePreview(result.preview);
      }
    } catch (error) {
      setDataBackupError(
        error instanceof Error ? error.message : "Unable to validate the data backup."
      );
    } finally {
      setDataBackupOperation(null);
    }
  }

  async function cancelDataRestore() {
    const api = desktopDataBackup();
    const preview = dataRestorePreview;
    if (!preview || dataBackupOperation === "restoring") return;
    setDataBackupOperation("cancelling");
    setDataBackupError("");
    try {
      await api?.cancelRestore(preview.token);
      setDataRestorePreview(undefined);
    } catch (error) {
      setDataBackupError(
        error instanceof Error ? error.message : "Unable to cancel data restore."
      );
    } finally {
      setDataBackupOperation(null);
    }
  }

  async function confirmDataRestore() {
    const api = desktopDataBackup();
    const preview = dataRestorePreview;
    if (!api || !preview || dataBackupOperation) return;
    setDataBackupOperation("restoring");
    setDataBackupError("");
    setDataBackupMessage("");
    try {
      await api.restoreBackup(preview.token);
      setDataRestorePreview(undefined);
      setDataBackupMessage("Data restored. Restarting VocabReader…");
    } catch (error) {
      setDataRestorePreview(undefined);
      setDataBackupError(
        error instanceof Error ? error.message : "Unable to restore the data backup."
      );
    } finally {
      setDataBackupOperation(null);
    }
  }

  useEffect(() => {
    if (!dataRestorePreview || dataBackupOperation) return;
    dataRestoreCancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void cancelDataRestore();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dataRestorePreview, dataBackupOperation]);

  function rangeWithOffset(
    marker: "start" | "end",
    offset: number,
    sourceRange = readingRange
  ): ReadingRange | undefined {
    if (!sourceRange) return undefined;
    const textLength = articleRef.current?.textContent?.length ?? 0;
    const bounded = Math.min(textLength, Math.max(0, Math.trunc(offset)));
    if (marker === "start") {
      return bounded > sourceRange.end
        ? { start: bounded, end: bounded }
        : { ...sourceRange, start: bounded };
    }
    return bounded < sourceRange.start
      ? { start: bounded, end: bounded }
      : { ...sourceRange, end: bounded };
  }

  function moveRangeMarker(marker: "start" | "end", offset: number) {
    const next = rangeWithOffset(marker, offset);
    if (next) persistReadingRange(next);
    setRangeMenu(undefined);
  }

  function startDraggingRangeMarker(
    marker: "start" | "end",
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    if (!readingRange) return;
    event.preventDefault();
    const initialRange = readingRange;
    let lastValidRange = initialRange;
    let hasMoved = false;

    const updateFromPoint = (event: PointerEvent) => {
      const article = articleRef.current;
      if (!article) return;
      const offset = textOffsetAtPoint(article, event.clientX, event.clientY);
      if (offset === null) return;
      const next = rangeWithOffset(marker, offset, initialRange);
      if (!next) return;
      lastValidRange = next;
      hasMoved = next.start !== initialRange.start || next.end !== initialRange.end;
      setReadingRange(next);
    };
    const stopListening = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    const handlePointerMove = (event: PointerEvent) => {
      updateFromPoint(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      stopListening();
      updateFromPoint(event);
      if (hasMoved) persistReadingRange(lastValidRange);
      setRangeMenu(undefined);
    };
    const handlePointerCancel = () => {
      stopListening();
      setReadingRange(initialRange);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function advanceToNextReadingRange() {
    const article = articleRef.current;
    if (!article || !readingRange) return;
    const text = article.textContent ?? "";
    if (readingRange.end >= text.length) return;
    persistReadingRange(advanceReadingRange(text, readingRange));
  }

  function scrollToReadingRangeMarker(marker: "start" | "end") {
    contentRef.current
      ?.querySelector<HTMLElement>(`[data-range-boundary="${marker}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  function saveCurrentReaderPosition() {
    if (mode === "reader" && selectedBook && activeChapterId) {
      persistReadingState(
        selectedBook,
        "reader",
        activeChapterId,
        currentScrollProgress()
      );
    }
  }

  function handleContentScroll() {
    if (mode !== "reader" || !selectedBook || !activeChapterId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistReadingState(
        selectedBook,
        "reader",
        activeChapterId,
        currentScrollProgress()
      );
    }, 300);
  }

  async function handleImport() {
    const library = desktopLibrary();
    if (!library || isImporting) {
      return;
    }

    setIsImporting(true);
    setLibraryError("");
    try {
      const result = await library.importBook();
      if (result.status === "cancelled") {
        return;
      }

      setBooks((current) => {
        const index = current.findIndex((book) => book.id === result.book.id);
        if (index < 0) {
          return [...current, result.book];
        }
        return current.map((book) =>
          book.id === result.book.id ? result.book : book
        );
      });
      restoreBook(result.book);
    } catch (error) {
      setLibraryError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to import this EPUB. Make sure the file is not corrupted or DRM-protected."
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDelete() {
    const library = desktopLibrary();
    const target = bookPendingDeletion;
    if (!library || !target || isDeleting) return;

    setIsDeleting(true);
    setLibraryError("");
    try {
      await library.deleteBook(target.id);
      const deletedIndex = books.findIndex((book) => book.id === target.id);
      const remainingBooks = books.filter((book) => book.id !== target.id);
      const replacement =
        remainingBooks[deletedIndex] ?? remainingBooks[deletedIndex - 1];
      setBooks(remainingBooks);
      setChapterContent(undefined);
      setBookPendingDeletion(undefined);
      if (replacement) {
        restoreBook(replacement);
      } else {
        setSelectedBookId(undefined);
        setActiveChapterId(undefined);
        setMode("overview");
      }
    } catch {
      setLibraryError("Unable to delete this book. Please try again later.");
      setBookPendingDeletion(undefined);
    } finally {
      setIsDeleting(false);
    }
  }

  function selectBook(bookId: string) {
    saveCurrentReaderPosition();
    const book = books.find((candidate) => candidate.id === bookId);
    if (book) restoreBook(book);
  }

  function openChapter(chapterId: string, useFragment = true) {
    if (!selectedBook) return;
    chapterStartRef.current = {
      bookId: selectedBook.id,
      chapterId,
      useFragment
    };
    if (!useFragment && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    persistReadingState(selectedBook, "reader", chapterId, 0);
    setActiveChapterId(chapterId);
    setMode("reader");
  }

  function returnToOverview() {
    if (selectedBook) {
      persistReadingState(
        selectedBook,
        "overview",
        activeChapterId ?? selectedBook.readingState.chapterId,
        currentScrollProgress()
      );
    }
    setMode("overview");
  }

  function openPreviousChapter() {
    if (previousChapter) openChapter(previousChapter.id, false);
  }

  function openNextChapter() {
    if (nextChapter) openChapter(nextChapter.id, false);
  }

  function startOrContinueReading() {
    if (!selectedBook) {
      return;
    }
    const chapterId =
      selectedBook.lastChapterId ?? selectedBook.chapters[0]?.id;
    if (chapterId) {
      openChapter(chapterId);
    }
  }

  async function sendChatMessage(
    text: string,
    extras: Pick<
      SendChatMessageInput,
      "intent" | "explanationLanguage" | "learningItemTargets"
    > = {}
  ) {
    const chat = desktopChat();
    if (!text || !chat || chatSnapshot.connection !== "ready" ||
      chatSnapshot.activeTurnId || chatSnapshot.managementBusy) return false;

    const chapterText = articleRef.current?.textContent ?? "";
    const segment = mode === "reader" && readingRange && articleRef.current
      ? annotatedReadingSegment(chapterText, readingRange, annotations)
      : "";
    const readingSegmentKey = segment && selectedBook && activeChapter && readingRange
      ? JSON.stringify([
          selectedBook.id,
          activeChapter.id,
          readingRange.start,
          readingRange.end,
          annotationRevision(annotations),
          segment
        ])
      : undefined;
    const shouldProvideReadingSegment = Boolean(
      readingSegmentKey &&
      (extras.intent === "explainAnnotations" ||
        extras.intent === "practiceReading" ||
        extras.intent === "createLearningItems" ||
        readingSegmentKey !== lastProvidedReadingSegmentRef.current)
    );
    const context = segment
      ? (shouldProvideReadingSegment
          ? {
              bookTitle: selectedBook?.title,
              chapterTitle: activeChapter?.title,
              readingSegment: segment
            }
          : {})
      : {
          ...(selectedBook?.title ? { bookTitle: selectedBook.title } : {}),
          ...(mode === "reader" && activeChapter?.title
            ? { chapterTitle: activeChapter.title }
            : {})
        };
    const input: SendChatMessageInput = {
      text,
      ...extras,
      ...(Object.keys(context).length ? { context } : {})
    };
    const previousUserCount = chatSnapshot.messages.reduce(
      (count, message) => count + (message.role === "user" ? 1 : 0),
      0
    );
    pendingChatScrollUserCountRef.current = previousUserCount;
    setChatError("");
    try {
      const snapshot = await chat.sendMessage(input);
      if (shouldProvideReadingSegment && readingSegmentKey) {
        lastProvidedReadingSegmentRef.current = readingSegmentKey;
      }
      setChatSnapshot(snapshot);
      return true;
    } catch (error) {
      if (pendingChatScrollUserCountRef.current === previousUserCount) {
        pendingChatScrollUserCountRef.current = null;
      }
      setChatError(error instanceof Error ? error.message : "Unable to send the message.");
      return false;
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendChatMessage(text, {
      explanationLanguage: settings.explanationLanguage
    });
  }

  async function explainAnnotations() {
    await sendChatMessage("Explain annotations", {
      intent: "explainAnnotations",
      explanationLanguage: settings.explanationLanguage
    });
  }

  async function practiceReading() {
    setExpandedReadingPracticeQuizId(undefined);
    return sendChatMessage("Start reading quiz", {
      intent: "practiceReading",
      explanationLanguage: settings.explanationLanguage
    });
  }

  function learningItemTargetsFromText(text: string) {
    const seen = new Set<string>();
    return text
      .split(/[\n,，]+/)
      .map((title) => title.trim())
      .filter((title) => {
        const key = title.toLocaleLowerCase();
        if (!title || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((title) => ({ title }));
  }

  async function createLearningItems(
    targets = learningItemTargetsFromText(draft)
  ) {
    const titles = targets.map((target) => target.title);
    if (draft.trim()) setDraft("");
    await sendChatMessage(
      titles.length ? `Add cards: ${titles.join(", ")}` : "Add cards",
      {
        intent: "createLearningItems",
        explanationLanguage: settings.explanationLanguage,
        ...(targets.length ? { learningItemTargets: targets } : {})
      }
    );
  }

  function acceptLearningItemInvitation(
    targets: SendChatMessageInput["learningItemTargets"]
  ) {
    void createLearningItems(targets ?? []);
  }

  function handleLearningItemSnapshot(snapshot: ChatSnapshot) {
    setChatSnapshot(snapshot);
    setLearningLibraryRevision((revision) => revision + 1);
  }

  async function retryLearningItemPreparation(messageId: string) {
    const chat = desktopChat();
    if (!chat || chatSnapshot.activeTurnId || chatSnapshot.managementBusy) {
      return;
    }
    setChatError("");
    try {
      setChatSnapshot(await chat.retryLearningItemPreparation(messageId));
    } catch (error) {
      setChatError(error instanceof Error
        ? error.message
        : "Unable to retry card preparation.");
    }
  }

  async function startNewConversation() {
    const chat = desktopChat();
    if (!chat || chatSnapshot.activeTurnId || chatSnapshot.managementBusy ||
      isConversationActionPending) return;
    setIsConversationActionPending(true);
    setChatError("");
    try {
      setChatSnapshot(await chat.startNewConversation());
      setDraft("");
      setChatView("conversation");
      lastProvidedReadingSegmentRef.current = undefined;
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to create a new conversation.");
    } finally {
      setIsConversationActionPending(false);
    }
  }

  async function selectConversation(conversationId: string) {
    const chat = desktopChat();
    if (!chat || chatSnapshot.activeTurnId || chatSnapshot.managementBusy ||
      isConversationActionPending) return;
    setIsConversationActionPending(true);
    setChatError("");
    try {
      setChatSnapshot(await chat.selectConversation(conversationId));
      setDraft("");
      setChatView("conversation");
      lastProvidedReadingSegmentRef.current = undefined;
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to open the AI conversation.");
    } finally {
      setIsConversationActionPending(false);
    }
  }

  async function removeConversation(target: ChatConversationSummary) {
    const chat = desktopChat();
    if (!chat || chatSnapshot.activeTurnId ||
      chatSnapshot.managementBusy || isConversationActionPending) return;
    setIsConversationActionPending(true);
    setChatError("");
    try {
      setChatSnapshot(await chat.removeConversation(target.id));
      if (target.id === chatSnapshot.activeConversationId) {
        setChatView("conversation");
        setDraft("");
        lastProvidedReadingSegmentRef.current = undefined;
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to remove the AI conversation.");
    } finally {
      setIsConversationActionPending(false);
    }
  }

  async function selectModel(modelId: string) {
    const chat = desktopChat();
    if (!chat || chatSnapshot.activeTurnId || isModelActionPending) return;
    setIsModelActionPending(true);
    setChatError("");
    try {
      setChatSnapshot(await chat.selectModel(modelId));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to switch AI models.");
    } finally {
      setIsModelActionPending(false);
    }
  }

  async function stopResponse() {
    const chat = desktopChat();
    if (!chat || !chatSnapshot.activeTurnId || isStopPending) return;
    setIsStopPending(true);
    setChatError("");
    try {
      setChatSnapshot(await chat.stopResponse());
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to stop the AI response.");
    } finally {
      setIsStopPending(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">V</span>
          <div>
            <strong>VocabReader</strong>
            <span>Read first. Learn deeply.</span>
          </div>
        </div>

        <button
          aria-label="Import EPUB"
          className="import-button"
          type="button"
          onClick={() => void handleImport()}
          disabled={isImporting || isDeleting || !desktopLibrary()}
        >
          {isImporting ? "Importing…" : "＋ Import EPUB"}
        </button>
      </header>

      <div
        ref={workspaceRef}
        className={[
          "workspace",
          isLeftSidebarCollapsed ? "left-collapsed" : "",
          isRightSidebarCollapsed ? "right-collapsed" : "",
          isAssistantPanelResizing ? "resizing-right" : ""
        ].filter(Boolean).join(" ")}
        style={{
          "--right-sidebar-width": `${
            isRightSidebarCollapsed ? COLLAPSED_PANEL_WIDTH : assistantPanelWidth
          }px`,
          "--ai-conversation-font-size":
            `${settings.aiConversationFontSize}px`,
          "--ebook-content-font-size": `${settings.ebookContentFontSize}px`,
          "--reading-paper-width": `${settings.readingPaperWidth}px`,
          "--ebook-line-height": String(settings.ebookLineHeight)
        } as CSSProperties}
      >
        <aside
          className={isLeftSidebarCollapsed ? "sidebar collapsed" : "sidebar"}
          aria-label="Main navigation"
        >
          <div className="sidebar-heading">
            {!isLeftSidebarCollapsed ? (
              <div className="book-summary">
                <span className="eyebrow">My Library</span>
                <strong>{books.length ? `${books.length} books` : "No books imported"}</strong>
              </div>
            ) : null}
            <button
              className="panel-toggle left-toggle"
              type="button"
              aria-label={isLeftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
              aria-controls="left-sidebar-content"
              aria-expanded={!isLeftSidebarCollapsed}
              onClick={() => setIsLeftSidebarCollapsed((collapsed) => !collapsed)}
            >
              <svg aria-hidden="true" viewBox="0 0 18 18">
                <rect x="1.75" y="2.25" width="14.5" height="13.5" rx="3" />
                <path d="M6 2.75v12.5" />
              </svg>
            </button>
          </div>

          {!isLeftSidebarCollapsed ? (
            <div className="sidebar-content" id="left-sidebar-content">
              <div className="book-list" aria-label="Imported books">
                {books.map((book) => (
                  <button
                    className={book.id === selectedBook?.id ? "book-item active" : "book-item"}
                    key={book.id}
                    type="button"
                    onClick={() => selectBook(book.id)}
                  >
                    <span className="book-item-cover" aria-hidden="true">
                      {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : "Aa"}
                    </span>
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="sidebar-footer">
                <nav>
                  <button
                    className={mode === "spaced-review" ? "nav-item active" : "nav-item"}
                    aria-label={[
                      `Review ${reviewAvailableCount}`,
                      reviewWorkspaceStatus === "generating"
                        ? "Paper generating"
                        : reviewWorkspaceStatus === "resumable"
                          ? "Paper ready to continue"
                          : ""
                    ].filter(Boolean).join(", ")}
                    onClick={() => {
                      saveCurrentReaderPosition();
                      setMode("spaced-review");
                    }}
                  >
                    <Brain
                      className="sidebar-action-icon"
                      aria-hidden="true"
                      strokeWidth={1.8}
                    />
                    <span className="nav-item-label">
                      Review
                      {reviewWorkspaceStatus === "generating" ? (
                        <LoaderCircle
                          className="review-sidebar-status generating"
                          aria-hidden="true"
                        />
                      ) : reviewWorkspaceStatus === "resumable" ? (
                        <CircleCheck
                          className="review-sidebar-status resumable"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    <em>{reviewAvailableCount}</em>
                  </button>
                  <button
                    className={mode === "learning-library" ? "nav-item active" : "nav-item"}
                    aria-label={`Library ${learningCounts.active}`}
                    onClick={() => {
                      saveCurrentReaderPosition();
                      setMode("learning-library");
                    }}
                  >
                    <LibraryBig
                      className="sidebar-action-icon"
                      aria-hidden="true"
                      strokeWidth={1.8}
                    />
                    Library
                    <em>{learningCounts.active}</em>
                  </button>
                </nav>

                <button
                  className="settings-button"
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <SettingsIcon
                    className="sidebar-action-icon"
                    aria-hidden="true"
                    strokeWidth={1.8}
                  />
                  Settings
                </button>

                <section
                  className={`codex-account-card ${chatSnapshot.connection}`}
                  aria-label="Codex status"
                  title={chatSnapshot.connectionDetail}
                >
                  <div className="codex-account-heading">
                    <div className="codex-account-brand">
                      <span
                        className={`codex-status-dot ${chatSnapshot.connection}`}
                        aria-hidden="true"
                      />
                      <strong className="codex-account-name">Codex</strong>
                    </div>
                    <span className="codex-connection-label">
                      {connectionLabel(chatSnapshot.connection)}
                    </span>
                  </div>
                  <div className="allowance-summary">
                    {([
                      ["5 hours", chatSnapshot.allowance.fiveHour],
                      ["Weekly", chatSnapshot.allowance.weekly]
                    ] as const).map(([label, allowance]) => (
                      <div
                        className="allowance-summary-row"
                        key={label}
                        title={allowance
                          ? `${label}: ${allowance.remainingPercent}% remaining, resets ${resetLabel(allowance.resetsAt)}`
                          : `${label}: ${chatSnapshot.allowance.phase === "loading" ? "Loading" : "Unavailable"}`}
                        aria-label={allowance
                          ? `${label}: ${allowance.remainingPercent}% remaining, resets ${resetLabel(allowance.resetsAt)}`
                          : `${label}: ${chatSnapshot.allowance.phase === "loading" ? "Loading" : "Unavailable"}`}
                      >
                        <span>{label}</span>
                        <strong className={`allowance-value ${allowance ? "available" : chatSnapshot.allowance.phase}`}>
                          {allowance
                            ? `${allowance.remainingPercent}%`
                            : chatSnapshot.allowance.phase === "loading"
                              ? "Loading…"
                              : "Unavailable"}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </aside>

        <main
          className={
            mode === "reader"
              ? "content reader-content"
              : mode === "learning-library"
                ? "content learning-library-content"
                : mode === "spaced-review"
                  ? "content spaced-review-content"
                  : "content"
          }
          ref={contentRef}
          onScroll={handleContentScroll}
        >
          {mode === "reader" ? (
            <div className="reader-toolbar">
              <div className="reader-toolbar-inner">
                <button
                  className="reader-back-button"
                  type="button"
                  aria-label="Back to overview"
                  onClick={returnToOverview}
                >
                  <span aria-hidden="true">←</span>
                  Back to overview
                </button>

                <div className="reader-toolbar-context" aria-hidden="true">
                  <span>Reading</span>
                  <strong>{activeChapter?.title ?? selectedBook?.title}</strong>
                </div>

                <div className="reader-toolbar-actions">
                  <div className="reading-layout-anchor" ref={readingLayoutRef}>
                    <button
                      className="reading-layout-button"
                      type="button"
                      aria-label="Reading layout"
                      aria-controls="reading-layout-panel"
                      aria-expanded={isReadingLayoutOpen}
                      onClick={() => setIsReadingLayoutOpen((open) => !open)}
                    >
                      <span aria-hidden="true">Aa</span>
                    </button>
                    {isReadingLayoutOpen ? (
                      <section
                        id="reading-layout-panel"
                        className="reading-layout-panel"
                        role="dialog"
                        aria-label="Reading layout"
                      >
                        <div className="reading-layout-heading">
                          <div>
                            <span className="eyebrow">Reading layout</span>
                            <strong>Reading layout</strong>
                          </div>
                          <button
                            type="button"
                            aria-label="Close reading layout"
                            onClick={() => setIsReadingLayoutOpen(false)}
                          >
                            ×
                          </button>
                        </div>
                        <div className="reading-layout-control">
                          <div>
                            <label htmlFor="reading-font-size">Text size</label>
                            <output htmlFor="reading-font-size">
                              {settings.ebookContentFontSize}px
                            </output>
                          </div>
                          <input
                            id="reading-font-size"
                            type="range"
                            min={EBOOK_CONTENT_FONT_SIZE.min}
                            max={EBOOK_CONTENT_FONT_SIZE.max}
                            step="1"
                            value={settings.ebookContentFontSize}
                            aria-valuetext={`${settings.ebookContentFontSize}px`}
                            onChange={(event) => previewSetting(
                              "ebookContentFontSize",
                              Number(event.target.value)
                            )}
                          />
                        </div>
                        <div className="reading-layout-control">
                          <div>
                            <label htmlFor="reading-paper-width">Page width</label>
                            <output htmlFor="reading-paper-width">
                              {settings.readingPaperWidth}px
                            </output>
                          </div>
                          <input
                            id="reading-paper-width"
                            type="range"
                            min={READING_PAPER_WIDTH.min}
                            max={READING_PAPER_WIDTH.max}
                            step={READING_PAPER_WIDTH.step}
                            value={settings.readingPaperWidth}
                            aria-valuetext={`${settings.readingPaperWidth}px`}
                            onChange={(event) => previewSetting(
                              "readingPaperWidth",
                              Number(event.target.value)
                            )}
                          />
                        </div>
                        <div className="reading-layout-control">
                          <div>
                            <label htmlFor="reading-line-height">Line spacing</label>
                            <output htmlFor="reading-line-height">
                              {settings.ebookLineHeight.toFixed(1)}×
                            </output>
                          </div>
                          <input
                            id="reading-line-height"
                            type="range"
                            min={EBOOK_LINE_HEIGHT.min}
                            max={EBOOK_LINE_HEIGHT.max}
                            step={EBOOK_LINE_HEIGHT.step}
                            value={settings.ebookLineHeight}
                            aria-valuetext={`${settings.ebookLineHeight.toFixed(1)} times`}
                            onChange={(event) => previewSetting(
                              "ebookLineHeight",
                              Number(event.target.value)
                            )}
                          />
                        </div>
                        <button
                          className="reading-layout-reset"
                          type="button"
                          onClick={resetReadingLayout}
                        >
                          Restore defaults
                        </button>
                        {settingsError ? (
                          <small role="alert">{settingsError}</small>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                  <div className="chapter-navigation" role="group" aria-label="Chapter navigation">
                    <button
                      type="button"
                      onClick={openPreviousChapter}
                      disabled={!previousChapter}
                    >
                      <span aria-hidden="true">‹</span>
                      Previous chapter
                    </button>
                    <button
                      type="button"
                      onClick={openNextChapter}
                      disabled={!nextChapter}
                    >
                      Next chapter
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {libraryError ? <div className="library-error" role="alert">{libraryError}</div> : null}

          {desktopReview() ? (
            <SpacedReviewWorkspace
              api={desktopReview()!}
              learningApi={desktopLearning()}
              explanationLanguage={settings.explanationLanguage}
              settingsRevision={reviewSettingsRevision}
              active={mode === "spaced-review"}
              onAvailableCountChange={setReviewAvailableCount}
              onStatusChange={setReviewWorkspaceStatus}
            />
          ) : null}

          {mode === "overview" ? (
            selectedBook ? (
              <section className="book-overview" aria-labelledby="book-overview-title">
                <div className="overview-hero">
                  <div className="overview-cover">
                    {selectedBook.coverDataUrl ? (
                      <img src={selectedBook.coverDataUrl} alt={`${selectedBook.title} cover`} />
                    ) : (
                      <span>Aa</span>
                    )}
                  </div>
                  <div className="overview-details">
                    <span className="eyebrow">Book overview</span>
                    <h1 id="book-overview-title">{selectedBook.title}</h1>
                    <p className="book-author">{selectedBook.author}</p>
                    <div className="book-facts">
                      <span>{selectedBook.chapters.length} chapters</span>
                      <span>{selectedBook.progressPercent}% read</span>
                    </div>
                    <div className="progress-track" aria-label={`Reading progress ${selectedBook.progressPercent}%`}>
                      <span style={{ width: `${selectedBook.progressPercent}%` }} />
                    </div>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={startOrContinueReading}
                      disabled={!selectedBook.chapters.length}
                    >
                      {selectedBook.progressPercent > 0 ? "Continue reading" : "Start reading"}
                    </button>
                    <button
                      className="delete-book-button"
                      type="button"
                      onClick={() => setBookPendingDeletion(selectedBook)}
                      disabled={isImporting || isDeleting}
                    >
                      Delete book
                    </button>
                  </div>
                </div>

                <div className="chapter-list">
                  <div>
                    <span className="eyebrow">Contents</span>
                    <h2>Chapters</h2>
                  </div>
                  <ol>
                    {selectedBook.chapters.map((chapter) => {
                      const depth = Math.max(0, chapter.depth ?? 0);
                      return (
                      <li
                        className={depth > 0 ? "subchapter" : undefined}
                        data-depth={depth}
                        key={`${chapter.id}-${chapter.order}`}
                        style={{ "--chapter-depth": Math.min(depth, 4) } as CSSProperties}
                      >
                        <button type="button" onClick={() => openChapter(chapter.id)}>
                          <span>
                            {depth > 0
                              ? "↳ Subchapter"
                              : String(chapter.order + 1).padStart(2, "0")}
                          </span>
                          <strong>{chapter.title}</strong>
                          <em>{depth > 0 ? "Read this section →" : "Start reading →"}</em>
                        </button>
                      </li>
                      );
                    })}
                  </ol>
                </div>
              </section>
            ) : (
              <section className="reader-panel" aria-labelledby="reader-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Book library</span>
                    <h1 id="reader-title">Import an EPUB to start reading</h1>
                  </div>
                </div>
                <div className="empty-reader">
                  <span className="book-icon">Aa</span>
                  <h2>Your reading space is ready</h2>
                  <p>Import your first EPUB. It will be saved locally and shown on the left.</p>
                  <div className="flow-tags" aria-label="Chapter learning flow">
                    <span>Read and annotate</span>
                    <span>AI analysis</span>
                    <span>Learning Library</span>
                    <span>Reading quiz</span>
                  </div>
                </div>
              </section>
            )
          ) : mode === "reader" ? (
            <section className="reader-panel" aria-label="Chapter reader">
              {isLoadingChapter ? (
                <div className="chapter-status" role="status">Loading chapter…</div>
              ) : chapterError ? (
                <div className="chapter-status error" role="alert">
                  <p>{chapterError}</p>
                  <button type="button" onClick={returnToOverview}>Back to overview</button>
                </div>
              ) : chapterContent ? (
                <div className="reading-range-workspace">
                  <div className="annotation-tool-dock">
                    <div
                      className="range-jump-controls"
                      role="group"
                      aria-label="Reading segment quick navigation"
                    >
                      <button
                        className="start"
                        type="button"
                        aria-label="Go to START range marker"
                        onClick={() => scrollToReadingRangeMarker("start")}
                      >
                        START
                      </button>
                      <button
                        className="end"
                        type="button"
                        aria-label="Go to END range marker"
                        onClick={() => scrollToReadingRangeMarker("end")}
                      >
                        END
                      </button>
                    </div>
                    <button
                      className={`annotation-tool${isAnnotationMode ? " active" : ""}`}
                      type="button"
                      aria-label={`${isAnnotationMode
                        ? "Turn off annotation mode"
                        : "Turn on annotation mode"}; ${annotations.length} annotations in this chapter`}
                      aria-pressed={isAnnotationMode}
                      onClick={() => setIsAnnotationMode((active) => !active)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="m14.5 4.5 5 5-8.75 8.75-5.75.75.75-5.75L14.5 4.5Z" />
                        <path d="m12.75 6.25 5 5M5 19l-1.5 1.5H13" />
                      </svg>
                      <span className="annotation-tool-label" aria-hidden="true">
                        {isAnnotationMode ? "Annotating" : "Annotate"}
                      </span>
                      <span className="annotation-tool-count" aria-hidden="true">
                        {annotations.length}
                      </span>
                    </button>
                  </div>
                  <div className="reading-range-shell">
                    {readingRange ? (
                      <div className="reading-range-markers" aria-label="AI-readable range">
                        <div
                          className={`reading-range-boundary start${rangeBoundariesOverlap ? " is-overlapping" : ""}`}
                          data-range-boundary="start"
                          data-text-offset={readingRange.start}
                          style={{ top: markerTops.start }}
                        >
                          <button
                            aria-label="Reading segment start"
                            className="reading-range-marker start"
                            data-text-offset={readingRange.start}
                            onPointerDown={(event) => startDraggingRangeMarker("start", event)}
                            type="button"
                          >
                            <span aria-hidden="true" />
                          </button>
                          <span className="reading-range-divider start" aria-hidden="true">
                            <span className="reading-range-divider-label">START</span>
                          </span>
                        </div>
                        <div
                          className={`reading-range-boundary end${rangeBoundariesOverlap ? " is-overlapping" : ""}`}
                          data-range-boundary="end"
                          data-text-offset={readingRange.end}
                          style={{ top: markerTops.end }}
                        >
                          <button
                            aria-label="Reading segment end"
                            className="reading-range-marker end"
                            data-text-offset={readingRange.end}
                            onPointerDown={(event) => startDraggingRangeMarker("end", event)}
                            type="button"
                          >
                            <span aria-hidden="true" />
                          </button>
                          <span className="reading-range-divider end" aria-hidden="true">
                            <span className="reading-range-divider-label">END</span>
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <ChapterArticle ref={articleRef} content={chapterContent} />
                  </div>
                  <div className="reading-range-actions">
                    <span>AI only reads the content between the two markers</span>
                    <div>
                      <button
                        type="button"
                        onClick={advanceToNextReadingRange}
                        disabled={!readingRange || readingRange.end >= (articleRef.current?.textContent?.length ?? 0)}
                      >
                        Finish this segment and continue
                      </button>
                    </div>
                  </div>
                  {rangeMenu ? (
                    <div
                      ref={rangeMenuRef}
                      className="reading-range-menu"
                      role="menu"
                      style={{ left: rangeMenu.x, top: rangeMenu.y }}
                    >
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => moveRangeMarker("start", rangeMenu.offset)}
                      >
                        Move start here
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => moveRangeMarker("end", rangeMenu.offset)}
                      >
                        Move end here
                      </button>
                      {rangeMenu.selection ? (
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => createAnnotation(rangeMenu.selection!)}
                        >
                          Annotate selection
                        </button>
                      ) : null}
                      {rangeMenu.annotationId ? (
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => removeAnnotation(rangeMenu.annotationId!)}
                        >
                          Remove annotation
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : mode === "spaced-review" ? (
            desktopReview() ? null : (
              <section className="learning-library-panel" aria-labelledby="review-title">
                <span className="eyebrow">Spaced review</span>
                <h1 id="review-title">Spaced Review</h1>
                <p className="library-error" role="alert">
                  The local review schedule is currently unavailable.
                </p>
              </section>
            )
          ) : (
            desktopLearning() ? (
              <LearningLibraryWorkspace
                key={learningLibraryRevision}
                api={desktopLearning()!}
                reviewApi={desktopReview()}
                onCountsChange={(counts) => {
                  setLearningCounts(counts);
                  void desktopReview()?.getSummary()
                    .then((summary) =>
                      setReviewAvailableCount(summary.totalAvailable))
                    .catch(() => {
                      // The review workspace provides a retryable error.
                    });
                }}
              />
            ) : (
              <section className="learning-library-panel" aria-labelledby="learning-library-title">
                <span className="eyebrow">Learning library</span>
                <h1 id="learning-library-title">Learning Library</h1>
                <p className="library-error" role="alert">The local Learning Library is currently unavailable.</p>
              </section>
            )
          )}
        </main>

        <aside
          className={isRightSidebarCollapsed ? "assistant-panel collapsed" : "assistant-panel"}
          aria-label="AI Tutor"
        >
          {!isRightSidebarCollapsed ? (
            <div
              className="assistant-resize-handle"
              role="separator"
              aria-label="Resize AI conversation panel"
              aria-orientation="vertical"
              aria-valuemin={MIN_ASSISTANT_PANEL_WIDTH}
              aria-valuemax={Math.round(assistantPanelMaximumWidth())}
              aria-valuenow={assistantPanelWidth}
              tabIndex={0}
              onPointerDown={startAssistantPanelResize}
              onKeyDown={handleAssistantPanelResizeKeyDown}
            />
          ) : null}
          <div className="assistant-heading">
            {!isRightSidebarCollapsed ? (
              <>
                <div>
                  <span className={`status-dot ${chatSnapshot.connection}`} />
                  <strong>AI Tutor</strong>
                </div>
                <span>
                  {mode === "reader" && readingRange &&
                    extractReadingSegment(
                      articleRef.current?.textContent ?? "",
                      readingRange
                    )
                    ? "Reading segment context"
                    : "General conversation"}
                </span>
              </>
            ) : null}
            <button
              className="panel-toggle right-toggle"
              type="button"
              aria-label={isRightSidebarCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
              aria-controls="right-sidebar-content"
              aria-expanded={!isRightSidebarCollapsed}
              onClick={() => setIsRightSidebarCollapsed((collapsed) => !collapsed)}
            >
              <svg aria-hidden="true" viewBox="0 0 18 18">
                <rect x="1.75" y="2.25" width="14.5" height="13.5" rx="3" />
                <path d="M12 2.75v12.5" />
              </svg>
            </button>
          </div>

          {!isRightSidebarCollapsed ? (
            <div className="assistant-content" id="right-sidebar-content">
              <div className="chat-management-bar">
                <button
                  type="button"
                  aria-label="New conversation"
                  onClick={() => void startNewConversation()}
                  disabled={Boolean(chatSnapshot.activeTurnId) ||
                    chatSnapshot.managementBusy || isConversationActionPending}
                >
                  ＋ New conversation
                </button>
                <button
                  type="button"
                  aria-pressed={chatView === "history"}
                  onClick={() => setChatView((current) =>
                    current === "history" ? "conversation" : "history")}
                  disabled={Boolean(chatSnapshot.activeTurnId) ||
                    chatSnapshot.managementBusy || isConversationActionPending}
                >
                  Conversation history
                </button>
              </div>

              {chatView === "history" ? (
                <section className="conversation-history" aria-labelledby="conversation-history-title">
                  <div className="conversation-history-heading">
                    <div>
                      <span className="eyebrow">Conversation history</span>
                      <h2 id="conversation-history-title">All AI conversations</h2>
                    </div>
                    <span>{chatSnapshot.conversations.length}</span>
                  </div>
                  {chatSnapshot.conversations.length === 0 ? (
                    <div className="chat-empty-state">
                      <strong>No conversation history yet</strong>
                      <p>Your conversations will be saved here after you send your first question.</p>
                    </div>
                  ) : (
                    <div className="conversation-list">
                      {chatSnapshot.conversations.map((conversation) => {
                        const source = [
                          conversation.source?.bookTitle,
                          conversation.source?.chapterTitle
                        ].filter(Boolean).join(" • ");
                        return (
                          <article
                            className={conversation.id === chatSnapshot.activeConversationId
                              ? "conversation-list-item active"
                              : "conversation-list-item"}
                            key={conversation.id}
                          >
                            <button
                              className="conversation-open-button"
                              type="button"
                              aria-label={`Open ${conversation.title}`}
                              onClick={() => void selectConversation(conversation.id)}
                              disabled={isConversationActionPending}
                            >
                              <strong>{conversation.title}</strong>
                              <span>{source || "General conversation"}</span>
                              <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
                            </button>
                            <button
                              className="conversation-remove-button"
                              type="button"
                              aria-label={`Remove ${conversation.title}`}
                              title="Remove conversation"
                              onClick={() => void removeConversation(conversation)}
                              disabled={isConversationActionPending}
                            >
                              ×
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div
                    className="messages"
                    aria-live="polite"
                    ref={chatMessagesRef}
                  >
                    {chatSnapshot.messages.length === 0 ? (
                      <div className="chat-empty-state">
                        <strong>Ask about your current reading</strong>
                        <p>Codex only receives the reading segment you explicitly selected.</p>
                      </div>
                    ) : null}
                    {chatSnapshot.messages.map((message) => {
                      const messagePractice = readingPracticeArtifacts([message]);
                      const messageQuiz = messagePractice.quiz;
                      const isCurrentQuiz = Boolean(
                        messageQuiz &&
                        messageQuiz.quizId === readingPractice.quiz?.quizId
                      );
                      return (
                        <article
                          aria-label={message.role === "assistant" ? "AI response" : "User message"}
                          className={"message " + message.role}
                          key={message.id}
                        >
                          <ChatMessageContent text={message.text} />
                          {message.learningItemPreparation?.status ===
                            "failed" ? (
                              <div className="learning-item-preparation-error">
                                <p role="alert">
                                  {message.learningItemPreparation.error ??
                                    "Card preparation failed."}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void
                                    retryLearningItemPreparation(message.id)}
                                  disabled={chatSnapshot.connection !== "ready" ||
                                    Boolean(chatSnapshot.activeTurnId) ||
                                    chatSnapshot.managementBusy ||
                                    isConversationActionPending}
                                >
                                  Retry card preparation
                                </button>
                              </div>
                            ) : null}
                          {isCurrentQuiz && messageQuiz ? (
                            <ReadingPracticePaper
                              open={expandedReadingPracticeQuizId === messageQuiz.quizId}
                              messages={chatSnapshot.messages}
                              onOpen={() => setExpandedReadingPracticeQuizId(
                                messageQuiz.quizId
                              )}
                              onClose={() => setExpandedReadingPracticeQuizId(
                                undefined
                              )}
                              onSubmit={(text) => sendChatMessage(text)}
                            />
                          ) : null}
                          {message.learningItemInvitation ? (
                            <button
                              className="learning-library-invitation-action"
                              type="button"
                              onClick={() => acceptLearningItemInvitation(
                                message.learningItemInvitation!.targets
                              )}
                              disabled={chatSnapshot.connection !== "ready" ||
                                Boolean(chatSnapshot.activeTurnId) ||
                                chatSnapshot.managementBusy ||
                                isConversationActionPending}
                            >
                              Add to Learning Library
                            </button>
                          ) : null}
                          {message.learningItemBatch ? (
                            <LearningItemBatchAction
                              batch={message.learningItemBatch}
                              onOpen={setOpenLearningItemBatchId}
                            />
                          ) : null}
                          {message.artifactError ? (
                            <p className="learning-item-artifact-error" role="alert">
                              {message.artifactError}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                    {chatSnapshot.activeTurnId ? (
                      <div className="chat-reply-status" role="status">
                        <span aria-hidden="true" />
                        {chatSnapshot.messages.some((message) =>
                          message.learningItemPreparation?.status ===
                            "preparing")
                          ? "Preparing cards…"
                          : "Codex is responding…"}
                      </div>
                    ) : null}
                  </div>

                  {mode === "reader" || mode === "learning-library" ? (
                    <div className="chat-preset-bar" aria-label="Question shortcuts">
                      {mode === "reader" ? (
                        <button
                          className="annotation-analysis-preset"
                          type="button"
                          onClick={() => void explainAnnotations()}
                          disabled={chatSnapshot.connection !== "ready" ||
                            Boolean(chatSnapshot.activeTurnId) ||
                            chatSnapshot.managementBusy ||
                            isConversationActionPending}
                        >
                          <svg aria-hidden="true" viewBox="0 0 18 18">
                            <path d="M9 2.25l1.15 3.6L13.75 7l-3.6 1.15L9 11.75 7.85 8.15 4.25 7l3.6-1.15L9 2.25Z" />
                            <path d="M14.25 11.25l.55 1.7 1.7.55-1.7.55-.55 1.7-.55-1.7-1.7-.55 1.7-.55.55-1.7Z" />
                          </svg>
                          <span>Explain annotations</span>
                        </button>
                      ) : null}
                      <button
                        className="annotation-analysis-preset learning-item-create-preset"
                        type="button"
                        aria-label="Add cards"
                        onClick={() => void createLearningItems()}
                        disabled={chatSnapshot.connection !== "ready" ||
                          Boolean(chatSnapshot.activeTurnId) ||
                          chatSnapshot.managementBusy ||
                          isConversationActionPending}
                      >
                        <svg aria-hidden="true" viewBox="0 0 18 18">
                          <rect x="3" y="3.25" width="9.5" height="11.5" rx="1.5" />
                          <path d="M7.75 6.25v5M5.25 8.75h5M13.75 6.25h1.5v8.5H6.5" />
                        </svg>
                        <span>Add cards</span>
                      </button>
                      {mode === "reader" ? (
                        <button
                          className="annotation-analysis-preset reading-practice-preset"
                          type="button"
                          onClick={() => void practiceReading()}
                          disabled={chatSnapshot.connection !== "ready" ||
                            Boolean(chatSnapshot.activeTurnId) ||
                            chatSnapshot.managementBusy ||
                            isConversationActionPending}
                        >
                          <svg aria-hidden="true" viewBox="0 0 18 18">
                            <path d="M4 3.25h10v11.5H4z" />
                            <path d="M6.5 6.25h5M6.5 9h5M6.5 11.75h2.75" />
                          </svg>
                          <span>Reading quiz</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <form className="chat-form" onSubmit={sendMessage}>
                    <label className="visually-hidden" htmlFor="chat-input">
                      Ask about current content
                    </label>
                    <textarea
                      id="chat-input"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey &&
                          !event.nativeEvent.isComposing && event.keyCode !== 229) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Enter your question"
                      rows={3}
                      disabled={chatSnapshot.connection !== "ready" ||
                        Boolean(chatSnapshot.activeTurnId) ||
                        chatSnapshot.managementBusy || isConversationActionPending}
                    />
                    <div className="chat-form-actions">
                      <select
                        aria-label="AI model"
                        value={chatSnapshot.selectedModelId ?? ""}
                        title={chatSnapshot.modelCatalogDetail}
                        onChange={(event) => void selectModel(event.target.value)}
                        disabled={chatSnapshot.connection !== "ready" ||
                          Boolean(chatSnapshot.activeTurnId) ||
                          chatSnapshot.managementBusy ||
                          isConversationActionPending ||
                          isModelActionPending ||
                          (chatSnapshot.models?.length ?? 0) === 0}
                      >
                        {(chatSnapshot.models?.length ?? 0) === 0 ? (
                          <option value="">Default model</option>
                        ) : chatSnapshot.models?.map((model) => (
                          <option value={model.id} key={model.id}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>
                      {chatSnapshot.activeTurnId ? (
                        <button
                          className="stop-response-button"
                          type="button"
                          aria-label={isStopPending || chatSnapshot.stopRequested
                            ? "Stopping…"
                            : "Stop"}
                          title={isStopPending || chatSnapshot.stopRequested
                            ? "Stopping response"
                            : "Stop response"}
                          onClick={() => void stopResponse()}
                          disabled={isStopPending || chatSnapshot.stopRequested}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20">
                            <rect x="6" y="6" width="8" height="8" rx="1.5" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          className="send-message-button"
                          type="submit"
                          aria-label="Send"
                          title="Send"
                          disabled={chatSnapshot.connection !== "ready" ||
                            chatSnapshot.managementBusy ||
                            isConversationActionPending || !draft.trim()}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20">
                            <path d="M10 15V5m0 0L6.5 8.5M10 5l3.5 3.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </form>
                  <small className={chatError || chatSnapshot.conversationError
                    ? "chat-form-hint error"
                    : "chat-form-hint"}
                  >
                    {chatError || chatSnapshot.conversationError ||
                      (chatSnapshot.connection === "ready"
                        ? "Enter to send • Shift+Enter for a new line"
                        : chatSnapshot.connectionDetail)}
                  </small>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      {bookPendingDeletion ? (
        <div className="dialog-backdrop">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="delete-dialog-title">Delete book?</h2>
            <p>
              “{bookPendingDeletion.title}”, its local EPUB, and reading progress
              will be permanently deleted. This action cannot be undone.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setBookPendingDeletion(undefined)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="danger-action"
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          className="dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsSettingsOpen(false);
            }
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <div className="settings-dialog-heading">
              <div>
                <h2>Settings</h2>
                <p>Find preferences grouped by purpose.</p>
              </div>
              <button
                type="button"
                aria-label="Close Settings"
                onClick={() => setIsSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="settings-tabs" role="tablist" aria-label="Settings categories">
              <button
                type="button"
                role="tab"
                id="settings-tab-general"
                aria-selected={activeSettingsSection === "general"}
                aria-controls="settings-panel-general"
                onClick={() => setActiveSettingsSection("general")}
              >
                General
              </button>
              <button
                type="button"
                role="tab"
                id="settings-tab-review"
                aria-selected={activeSettingsSection === "review"}
                aria-controls="settings-panel-review"
                onClick={() => setActiveSettingsSection("review")}
              >
                Spaced Review
              </button>
              <button
                type="button"
                role="tab"
                id="settings-tab-account"
                aria-selected={activeSettingsSection === "account"}
                aria-controls="settings-panel-account"
                onClick={() => setActiveSettingsSection("account")}
              >
                Account
              </button>
            </div>
            {activeSettingsSection === "account" ? (
              <section
                className="settings-panel"
                role="tabpanel"
                id="settings-panel-account"
                aria-labelledby="settings-tab-account"
              >
                <div className="settings-section-intro">
                  <h3>Account</h3>
                  <p>Review the Codex account currently connected to VocabReader.</p>
                </div>
                <div className="settings-control codex-account-setting">
                  <div className="settings-control-heading">
                    <span className="settings-control-label">Codex account</span>
                    <span className="codex-connection-label">
                      {connectionLabel(chatSnapshot.connection)}
                    </span>
                  </div>
                  <div
                    className="settings-account-value"
                    aria-label="Codex account email"
                  >
                    <span
                      className={`codex-status-dot ${chatSnapshot.connection}`}
                      aria-hidden="true"
                    />
                    <strong>
                      {chatSnapshot.account?.email ?? "Email unavailable"}
                    </strong>
                  </div>
                  <p>Your account is managed by Codex and shown here for reference.</p>
                </div>
              </section>
            ) : null}
            {activeSettingsSection === "general" ? (
              <section
                className="settings-panel"
                role="tabpanel"
                id="settings-panel-general"
                aria-labelledby="settings-tab-general"
              >
                <div className="settings-section-intro">
                  <h3>General</h3>
                  <p>Adjust the language used by AI responses and your reading comfort.</p>
                </div>
                <div className="settings-control">
                  <label htmlFor="explanation-language">Explanation language</label>
                  <select
                    id="explanation-language"
                    aria-label="Explanation language"
                    value={settings.explanationLanguage}
                    disabled={isSettingsSaving}
                    onChange={(event) => saveExplanationLanguage(
                      event.target.value as ExplanationLanguage
                    )}
                  >
                    <option value="source">Source language (default)</option>
                    <option value="zh-TW">Traditional Chinese</option>
                    <option value="en">English</option>
                    <option value="ja">Japanese</option>
                  </select>
                  <p>
                    Applies to new AI conversations, annotation explanations, reading
                    quizzes, and learning items. Existing responses are unchanged.
                  </p>
                </div>
                <div className="settings-control font-size-setting">
                  <div className="settings-control-heading">
                    <label htmlFor="ai-conversation-font-size">
                      AI conversation text size
                    </label>
                    <output htmlFor="ai-conversation-font-size">
                      {settings.aiConversationFontSize}px
                    </output>
                  </div>
                  <input
                    id="ai-conversation-font-size"
                    type="range"
                    min={AI_CONVERSATION_FONT_SIZE.min}
                    max={AI_CONVERSATION_FONT_SIZE.max}
                    step="1"
                    value={settings.aiConversationFontSize}
                    aria-valuetext={`${settings.aiConversationFontSize}px`}
                    onChange={(event) => previewSetting(
                      "aiConversationFontSize",
                      Number(event.target.value)
                    )}
                  />
                  <p>Adjusts user messages and AI response content only.</p>
                </div>
                <section className="settings-control data-backup-setting">
                  <h3>Data backup</h3>
                  <p>
                    Export or fully restore books, reading progress, annotations,
                    learning items, and review history. AI conversations, settings,
                    and Codex sign-in are not included.
                  </p>
                  <div className="data-backup-actions">
                    <button
                      type="button"
                      onClick={() => void exportDataBackup()}
                      disabled={Boolean(dataBackupOperation) ||
                        !desktopDataBackup()}
                    >
                      {dataBackupOperation === "exporting"
                        ? "Exporting…"
                        : "Export backup"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void selectDataBackup()}
                      disabled={Boolean(dataBackupOperation) ||
                        !desktopDataBackup()}
                    >
                      {dataBackupOperation === "selecting"
                        ? "Validating…"
                        : "Import backup"}
                    </button>
                  </div>
                  {dataBackupMessage ? (
                    <output className="data-backup-message">
                      {dataBackupMessage}
                    </output>
                  ) : null}
                  {dataBackupError ? (
                    <small className="data-backup-error" role="alert">
                      {dataBackupError}
                    </small>
                  ) : null}
                </section>
              </section>
            ) : null}
            {activeSettingsSection === "review" ? (
              <section
                className="settings-panel"
                role="tabpanel"
                id="settings-panel-review"
                aria-labelledby="settings-tab-review"
              >
                <div className="settings-section-intro">
                  <h3>Spaced Review</h3>
                  <p>Set your daily study volume and questions per paper.</p>
                </div>
                <fieldset className="settings-number-list">
                  <legend className="visually-hidden">Spaced Review</legend>
                  <div className="settings-number-control">
                    <div>
                      <label htmlFor="daily-new-item-completion-limit">
                        Daily new-item completion limit
                      </label>
                      <p>Counts as complete when scheduled for tomorrow or later; 0 pauses new items.</p>
                    </div>
                    <input
                      id="daily-new-item-completion-limit"
                      type="number"
                      min={DAILY_NEW_ITEM_COMPLETION_LIMIT.min}
                      max={DAILY_NEW_ITEM_COMPLETION_LIMIT.max}
                      step="1"
                      value={settings.dailyNewItemCompletionLimit}
                      onChange={(event) => previewSetting(
                        "dailyNewItemCompletionLimit",
                        Number(event.target.value)
                      )}
                    />
                  </div>
                  <div className="settings-number-control">
                    <div>
                      <label htmlFor="daily-due-review-completion-limit">
                        Daily due-review completion limit
                      </label>
                      <p>Calculated separately from new items; 0 pauses due reviews.</p>
                    </div>
                    <input
                      id="daily-due-review-completion-limit"
                      type="number"
                      min={DAILY_DUE_REVIEW_COMPLETION_LIMIT.min}
                      max={DAILY_DUE_REVIEW_COMPLETION_LIMIT.max}
                      step="1"
                      value={settings.dailyDueReviewCompletionLimit}
                      onChange={(event) => previewSetting(
                        "dailyDueReviewCompletionLimit",
                        Number(event.target.value)
                      )}
                    />
                  </div>
                  <div className="settings-number-control">
                    <div>
                      <label htmlFor="review-paper-size">Questions per paper</label>
                      <p>Choose 1–20; the paper shrinks automatically when fewer items are available.</p>
                    </div>
                    <input
                      id="review-paper-size"
                      type="number"
                      min={REVIEW_PAPER_SIZE.min}
                      max={REVIEW_PAPER_SIZE.max}
                      step="1"
                      value={settings.reviewPaperSize}
                      onChange={(event) => previewSetting(
                        "reviewPaperSize",
                        Number(event.target.value)
                      )}
                    />
                  </div>
                </fieldset>
              </section>
            ) : null}
            {settingsError ? <small role="alert">{settingsError}</small> : null}
          </section>
        </div>
      ) : null}

      {dataRestorePreview ? (
        <div className="dialog-backdrop data-restore-backdrop">
          <section
            className="delete-dialog data-restore-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="data-restore-dialog-title"
            aria-describedby="data-restore-dialog-description"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="data-restore-dialog-title">
              Replace current reading and learning data?
            </h2>
            <p id="data-restore-dialog-description">
              This backup will completely replace this device&apos;s books, reading
              progress, annotations, learning items, Trash, and review history.
              The two datasets will not be merged.
            </p>
            <dl className="data-restore-summary">
              <div>
                <dt>Book Library</dt>
                <dd>{dataRestorePreview.books} books</dd>
              </div>
              <div>
                <dt>Learning Library</dt>
                <dd>
                  {dataRestorePreview.activeLearningItems} active learning items
                </dd>
              </div>
              <div>
                <dt>Trash</dt>
                <dd>{dataRestorePreview.trashedLearningItems} trashed items</dd>
              </div>
              <div>
                <dt>Backup time</dt>
                <dd>{new Date(dataRestorePreview.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
            <p>
              VocabReader will restart automatically after a successful restore.
              AI conversations, global settings, and Codex sign-in remain unchanged.
            </p>
            <div className="delete-dialog-actions">
              <button
                ref={dataRestoreCancelRef}
                type="button"
                onClick={() => void cancelDataRestore()}
                disabled={dataBackupOperation === "restoring" ||
                  dataBackupOperation === "cancelling"}
              >
                {dataBackupOperation === "cancelling"
                  ? "Canceling…"
                  : "Cancel import"}
              </button>
              <button
                className="danger-action"
                type="button"
                onClick={() => void confirmDataRestore()}
                disabled={Boolean(dataBackupOperation)}
              >
                {dataBackupOperation === "restoring"
                  ? "Restoring…"
                  : "Replace and restart"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {openLearningItemBatch && desktopChat() ? (
        <LearningItemDraftDialog
          batch={openLearningItemBatch}
          api={desktopChat()!}
          onClose={() => setOpenLearningItemBatchId(undefined)}
          onSnapshot={handleLearningItemSnapshot}
        />
      ) : null}

    </div>
  );
}
